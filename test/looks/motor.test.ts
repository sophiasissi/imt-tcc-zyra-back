import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';

let proximoId = 0;

function peca(
  categoria: PecaMotor['categoria'],
  corNome: string,
  colorAddSymbol: string,
  hex: string,
  extras: Partial<PecaMotor> = {},
): PecaMotor {
  return {
    id: `p${++proximoId}`,
    categoria,
    corNome,
    colorAddSymbol,
    hex,
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: null,
    manga: null,
    ...extras,
  };
}

function intencao(extras: Partial<Intencao> = {}): Intencao {
  return {
    tipo: 'LOOK',
    ocasiao: null,
    formalidade: null,
    estilo: null,
    aquecimento: null,
    paletaNeutra: false,
    incluir: [],
    evitarCategorias: [],
    evitarCores: [],
    pergunta: null,
    naoMapeado: [],
    trocar: [],
    ...extras,
  };
}

const sempreOPrimeiro = { aleatorio: () => 0 };

const camisetaBranca = peca('CAMISETA', 'Branco', 'COLORADD_BRANCO', '#F2F2F2');
const camisetaPreta = peca('CAMISETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A');
const camisaAzul = peca('CAMISA', 'Azul', 'COLORADD_AZUL', '#2F5DA8', {
  estilo: 'SOCIAL',
  ocasioes: ['TRABALHO'],
});
const camisetaVerdeEstampada = peca('CAMISETA', 'Verde', 'COLORADD_VERDE', '#3A7D44', {
  estampa: 'ESTAMPADO',
});
const moletomCinza = peca('MOLETOM', 'Cinza Claro', 'COLORADD_CINZA_CLARO', '#808080', {
  aquecimento: 'QUENTE',
});
const calcaJeans = peca('CALCA', 'Azul', 'COLORADD_AZUL', '#3B5B85', { material: 'JEANS' });
const calcaPreta = peca('CALCA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
  estilo: 'SOCIAL',
  ocasioes: ['TRABALHO', 'FESTA'],
});
const calcaBege = peca('CALCA', 'Amarelo Claro', 'COLORADD_AMARELO_CLARO', '#E8D9A8');
const shortVermelhoEstampado = peca('SHORT', 'Vermelho', 'COLORADD_VERMELHO', '#B22222', {
  estampa: 'ESTAMPADO',
  aquecimento: 'LEVE',
  ocasioes: ['PRAIA', 'DIA_A_DIA'],
});
const saiaRoxa = peca('SAIA', 'Roxo', 'COLORADD_ROXO', '#6A3D9A');
const tenisBranco = peca('TENIS', 'Branco', 'COLORADD_BRANCO', '#F5F5F5');
const sapatoPreto = peca('SAPATO', 'Preto', 'COLORADD_PRETO', '#111111', {
  estilo: 'SOCIAL',
  ocasioes: ['TRABALHO', 'FESTA'],
});
const jaquetaCouro = peca('JAQUETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
  material: 'COURO',
  aquecimento: 'QUENTE',
});

const armario: PecaMotor[] = [
  camisetaBranca,
  camisetaPreta,
  camisaAzul,
  camisetaVerdeEstampada,
  moletomCinza,
  calcaJeans,
  calcaPreta,
  calcaBege,
  shortVermelhoEstampado,
  saiaRoxa,
  tenisBranco,
  sapatoPreto,
  jaquetaCouro,
];

function look(resultado: ResultadoMotor) {
  assert.equal(resultado.status, 'LOOK', JSON.stringify(resultado));
  return resultado as Extract<ResultadoMotor, { status: 'LOOK' }>;
}

function pecasDe(resultado: ResultadoMotor, de: PecaMotor[] = armario) {
  return look(resultado).pecas.map((p) => de.find((a) => a.id === p.id)!);
}

describe('mínimo de peças', () => {
  it('pede mais peças quando faltam peças de cima ou de baixo', () => {
    const r = montarLook([camisetaBranca, calcaJeans, tenisBranco], intencao());
    assert.equal(r.status, 'POUCAS_PECAS');
    assert.equal(r.status === 'POUCAS_PECAS' && r.faltamSuperiores, 4);
    assert.equal(r.status === 'POUCAS_PECAS' && r.faltamInferiores, 4);
  });

  it('conta vestido como peça de cima e de baixo', () => {
    const vestidos = Array.from({ length: 5 }, () =>
      peca('VESTIDO', 'Verde', 'COLORADD_VERDE', '#3A7D44'),
    );
    assert.equal(montarLook(vestidos, intencao(), sempreOPrimeiro).status, 'LOOK');
  });
});

describe('estrutura do look', () => {
  it('monta superior + inferior + calçado', () => {
    const papeis = look(montarLook(armario, intencao(), sempreOPrimeiro)).pecas.map((p) => p.papel);
    assert.ok(papeis.includes('SUPERIOR'));
    assert.ok(papeis.includes('INFERIOR'));
    assert.ok(papeis.includes('CALCADO'));
  });

  it('monta vestido + calçado, sem peça de cima ou de baixo junto', () => {
    const vestido = peca('VESTIDO', 'Verde Claro', 'COLORADD_VERDE_CLARO', '#9BD39B');
    const r = montarLook(
      [...armario, vestido],
      intencao({ incluir: [{ categoria: 'VESTIDO', cor: null, material: null }] }),
      sempreOPrimeiro,
    );
    const papeis = look(r).pecas.map((p) => p.papel);
    assert.deepEqual(papeis.sort(), ['CALCADO', 'PECA_UNICA']);
  });

  it('nunca usa jaqueta no lugar da peça de cima', () => {
    for (let i = 0; i < 5; i++) {
      const papeis = look(
        montarLook(armario, intencao({ aquecimento: 'QUENTE' }), { aleatorio: () => i / 5 }),
      ).pecas.map((p) => p.papel);
      if (papeis.includes('SOBREPOSICAO')) assert.ok(papeis.includes('SUPERIOR'));
    }
  });

  it('sem calçado cadastrado, entrega o look e avisa', () => {
    const semCalcado = armario.filter((p) => p.categoria !== 'TENIS' && p.categoria !== 'SAPATO');
    const r = look(montarLook(semCalcado, intencao(), sempreOPrimeiro));
    assert.ok(!r.pecas.some((p) => p.papel === 'CALCADO'));
    assert.ok(r.avisos.some((a) => a.includes('ainda não cadastrou calçados')));
  });
});

describe('pedido do usuário', () => {
  it('no frio, inclui uma camada que aquece', () => {
    const pecas = pecasDe(
      montarLook(armario, intencao({ aquecimento: 'QUENTE' }), sempreOPrimeiro),
    );
    assert.ok(pecas.some((p) => p.categoria === 'MOLETOM' || p.categoria === 'JAQUETA'));
  });

  it('no calor, não usa peça quente', () => {
    const pecas = pecasDe(montarLook(armario, intencao({ aquecimento: 'LEVE' }), sempreOPrimeiro));
    assert.ok(pecas.every((p) => p.aquecimento !== 'QUENTE'));
  });

  it('respeita a cor que o usuário não quer', () => {
    const pecas = pecasDe(
      montarLook(
        armario,
        intencao({ evitarCores: [{ familia: 'PRETO', tom: null }] }),
        sempreOPrimeiro,
      ),
    );
    assert.ok(pecas.every((p) => !p.colorAddSymbol.startsWith('COLORADD_PRETO')));
  });

  it('respeita a categoria que o usuário não quer', () => {
    const pecas = pecasDe(
      montarLook(armario, intencao({ evitarCategorias: ['CALCA'] }), sempreOPrimeiro),
    );
    assert.ok(pecas.every((p) => p.categoria !== 'CALCA'));
  });

  it('inclui a peça que o usuário quer usar', () => {
    const r = montarLook(
      armario,
      intencao({
        incluir: [{ categoria: 'CAMISA', cor: { familia: 'AZUL', tom: null }, material: null }],
      }),
      sempreOPrimeiro,
    );
    assert.ok(look(r).pecas.some((p) => p.id === camisaAzul.id));
  });

  it('acha a calça bege pela cor mais próxima e avisa', () => {
    const r = look(
      montarLook(
        armario,
        intencao({
          incluir: [
            { categoria: 'CALCA', cor: { familia: 'CASTANHO', tom: 'CLARO' }, material: null },
          ],
        }),
        sempreOPrimeiro,
      ),
    );
    assert.ok(r.pecas.some((p) => p.id === calcaBege.id));
    assert.ok(r.avisos.some((a) => a.includes('a mais parecida')));
  });

  it('avisa quando não tem a peça pedida', () => {
    const r = look(
      montarLook(
        armario,
        intencao({
          incluir: [{ categoria: 'SAIA', cor: { familia: 'AMARELO', tom: null }, material: null }],
        }),
        sempreOPrimeiro,
      ),
    );
    assert.ok(r.avisos.some((a) => a.startsWith('Não achei saia amarelo')));
  });

  it('para o trabalho, prefere as peças de trabalho', () => {
    const pecas = pecasDe(
      montarLook(armario, intencao({ ocasiao: 'TRABALHO', formalidade: 'ALTA' }), sempreOPrimeiro),
    );
    assert.ok(pecas.some((p) => p.id === camisaAzul.id));
    assert.ok(pecas.some((p) => p.id === calcaPreta.id));
  });

  it('com paleta neutra, só usa neutros', () => {
    const pecas = pecasDe(montarLook(armario, intencao({ paletaNeutra: true }), sempreOPrimeiro));
    const cromaticas = ['VERDE', 'VERMELHO', 'ROXO', 'AMARELO'];
    assert.ok(pecas.every((p) => !cromaticas.some((c) => p.colorAddSymbol.includes(c))));
  });

  it('"quero outro" evita repetir as peças do último look', () => {
    const primeiro = look(montarLook(armario, intencao(), sempreOPrimeiro));
    const segundo = look(
      montarLook(armario, intencao(), {
        ...sempreOPrimeiro,
        pecasAnteriores: primeiro.pecas.map((p) => p.id),
      }),
    );
    assert.notDeepEqual(
      segundo.pecas.map((p) => p.id),
      primeiro.pecas.map((p) => p.id),
    );
  });
});

describe('harmonia', () => {
  it('não junta duas peças estampadas quando dá para evitar', () => {
    for (let i = 0; i < 5; i++) {
      const pecas = pecasDe(montarLook(armario, intencao(), { aleatorio: () => i / 5 }));
      assert.ok(pecas.filter((p) => p.estampa === 'ESTAMPADO').length <= 1);
    }
  });

  it('não junta três cores fortes', () => {
    const r = montarLook(
      armario,
      intencao({
        incluir: [{ categoria: 'SAIA', cor: { familia: 'ROXO', tom: null }, material: null }],
      }),
      sempreOPrimeiro,
    );
    const fortes = pecasDe(r).filter((p) =>
      ['VERDE', 'VERMELHO', 'ROXO', 'AMARELO'].some((c) => p.colorAddSymbol.includes(c)),
    );
    assert.ok(new Set(fortes.map((p) => p.colorAddSymbol)).size <= 2);
  });
});

describe('trocar a camada do look da tela', () => {
  // Moletom por cima da camiseta: na tela ele é a camada, mas o app manda só
  // os ids, e pela categoria o moletom seria parte de cima.
  const moletomPreto = peca('MOLETOM', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
    aquecimento: 'QUENTE',
  });
  const comDoisMoletons = [...armario, moletomPreto];
  const lookNaTela = [camisetaBranca.id, calcaJeans.id, tenisBranco.id, moletomCinza.id];
  const base = [camisetaBranca.id, calcaJeans.id, tenisBranco.id];

  it('"quero outro moletom" troca o moletom e mantém o resto', () => {
    const r = montarLook(
      comDoisMoletons,
      intencao({
        trocar: ['CAMADA'],
        incluir: [{ categoria: 'MOLETOM', cor: null, material: null }],
      }),
      { ...sempreOPrimeiro, pecasAnteriores: lookNaTela },
    );
    assert.equal(r.status, 'LOOK', r.status === 'SEM_LOOK' ? r.mensagem : '');
    if (r.status !== 'LOOK') return;
    const ids = r.pecas.map((p) => p.id);
    for (const id of base) assert.ok(ids.includes(id), 'o resto do look fica');
    assert.ok(!ids.includes(moletomCinza.id), 'o moletom antigo sai');
    assert.deepEqual(
      r.pecas.find((p) => p.id === moletomPreto.id),
      { id: moletomPreto.id, papel: 'SOBREPOSICAO' },
    );
    assert.equal(r.pecas.length, 4);
  });

  it('"troca o moletom" sem dizer por qual põe outra camada no lugar', () => {
    const r = montarLook(comDoisMoletons, intencao({ trocar: ['CAMADA'] }), {
      ...sempreOPrimeiro,
      pecasAnteriores: lookNaTela,
    });
    assert.equal(r.status, 'LOOK', r.status === 'SEM_LOOK' ? r.mensagem : '');
    if (r.status !== 'LOOK') return;
    const ids = r.pecas.map((p) => p.id);
    for (const id of base) assert.ok(ids.includes(id), 'o resto do look fica');
    assert.ok(!ids.includes(moletomCinza.id), 'o moletom antigo sai');
    assert.ok(ids.includes(moletomPreto.id), 'entra o outro moletom');
    assert.equal(r.pecas.length, 4);
  });

  it('"troca a camiseta" com moletom por cima mantém o moletom', () => {
    const r = montarLook(comDoisMoletons, intencao({ trocar: ['CIMA'] }), {
      ...sempreOPrimeiro,
      pecasAnteriores: lookNaTela,
    });
    assert.equal(r.status, 'LOOK', r.status === 'SEM_LOOK' ? r.mensagem : '');
    if (r.status !== 'LOOK') return;
    const ids = r.pecas.map((p) => p.id);
    assert.ok(!ids.includes(camisetaBranca.id), 'a camiseta sai');
    assert.ok(ids.includes(moletomCinza.id), 'o moletom continua');
    assert.ok(ids.includes(calcaJeans.id) && ids.includes(tenisBranco.id));
  });
});

describe('uma peça chamativa por look', () => {
  const tenisVermelho = peca('TENIS', 'Vermelho', 'COLORADD_VERMELHO', '#C0262D');
  const moletomVermelho = peca('MOLETOM', 'Vermelho', 'COLORADD_VERMELHO', '#B22222', {
    aquecimento: 'QUENTE',
  });
  const comTenisVermelho = [...armario, tenisVermelho];

  it('tênis colorido pede o resto do look neutro', () => {
    for (let i = 0; i < 5; i++) {
      const r = montarLook(
        comTenisVermelho,
        intencao({
          incluir: [
            { categoria: 'TENIS', cor: { familia: 'VERMELHO', tom: null }, material: null },
          ],
        }),
        { aleatorio: () => i / 5 },
      );
      const pecas = pecasDe(r, comTenisVermelho);
      const outras = pecas.filter((p) => p.id !== tenisVermelho.id);
      assert.equal(outras.length, pecas.length - 1, 'o tênis pedido está no look');
      for (const p of outras) {
        assert.ok(
          !['VERDE', 'VERMELHO', 'ROXO', 'AMARELO'].some((c) => p.colorAddSymbol.includes(c)) &&
            p.estampa === 'LISO',
          `${p.categoria} ${p.corNome} chama atenção junto com o tênis`,
        );
      }
    }
  });

  it('moletom fechado combina com a calça e o tênis, não com a camiseta de baixo', () => {
    // Camiseta estampada e tênis vermelho na tela: o moletom cinza deixa uma
    // peça chamativa à mostra; o vermelho, duas.
    const lookNaTela = [camisetaVerdeEstampada.id, calcaJeans.id, tenisVermelho.id];
    for (let i = 0; i < 5; i++) {
      const r = montarLook(
        [...comTenisVermelho, moletomVermelho],
        intencao({
          trocar: ['CAMADA'],
          incluir: [{ categoria: 'MOLETOM', cor: null, material: null }],
        }),
        { aleatorio: () => i / 5, pecasAnteriores: lookNaTela },
      );
      const ids = look(r).pecas.map((p) => p.id);
      assert.ok(ids.includes(moletomCinza.id), 'escolhe o moletom neutro');
      assert.ok(!ids.includes(moletomVermelho.id));
    }
  });
});

describe('peça de frio com short', () => {
  it('não junta manga longa com short quando dá para evitar', () => {
    const camisetaMangaLonga = peca('CAMISETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
      manga: 'LONGA',
    });
    const shortPreto = peca('SHORT', 'Preto', 'COLORADD_PRETO', '#151515');
    const pecas = [...armario, camisetaMangaLonga, shortPreto];
    for (let i = 0; i < 5; i++) {
      const r = montarLook(
        pecas,
        intencao({
          incluir: [{ categoria: 'SHORT', cor: { familia: 'PRETO', tom: null }, material: null }],
        }),
        { aleatorio: () => i / 5 },
      );
      const ids = look(r).pecas.map((p) => p.id);
      assert.ok(ids.includes(shortPreto.id));
      assert.ok(!ids.includes(camisetaMangaLonga.id), 'manga longa com short');
      assert.ok(!ids.includes(moletomCinza.id), 'moletom com short');
    }
  });
});

describe('acrescentar camada ao look da tela', () => {
  const lookNaTela = [camisetaBranca.id, calcaJeans.id, tenisBranco.id];
  const pedido = (categoria: PecaMotor['categoria']) =>
    intencao({ trocar: ['CAMADA'], incluir: [{ categoria, cor: null, material: null }] });

  it('"põe um moletom por cima" mantém a camiseta e põe o moletom como camada', () => {
    const r = montarLook(armario, pedido('MOLETOM'), { pecasAnteriores: lookNaTela });
    assert.equal(r.status, 'LOOK');
    if (r.status !== 'LOOK') return;
    const ids = r.pecas.map((p) => p.id);
    for (const id of lookNaTela) assert.ok(ids.includes(id), 'nenhuma peça da tela sai');
    assert.deepEqual(
      r.pecas.find((p) => p.id === moletomCinza.id),
      { id: moletomCinza.id, papel: 'SOBREPOSICAO' },
    );
    assert.equal(r.pecas.length, 4);
  });

  it('"blusa" sem blusa no armário vira moletom ou jaqueta, sem trocar a camiseta', () => {
    const r = montarLook(armario, pedido('BLUSA'), { pecasAnteriores: lookNaTela });
    assert.equal(r.status, 'LOOK');
    if (r.status !== 'LOOK') return;
    assert.ok(r.pecas.some((p) => p.id === camisetaBranca.id));
    assert.ok(r.pecas.some((p) => p.papel === 'SOBREPOSICAO'));
    // Blusa e moletom são sinônimos: usar o moletom não gera aviso.
    assert.ok(r.pecas.some((p) => p.id === moletomCinza.id));
    assert.ok(!r.avisos.some((a) => /Não achei/.test(a)), r.avisos.join(' | '));
  });

  it('"quero um moletom ou jaqueta" põe só uma das duas como camada', () => {
    const r = montarLook(
      armario,
      intencao({
        trocar: ['CAMADA'],
        incluir: [
          { categoria: 'MOLETOM', cor: null, material: null },
          { categoria: 'JAQUETA', cor: null, material: null },
        ],
      }),
      { pecasAnteriores: lookNaTela, alternativas: [[0, 1]] },
    );
    assert.equal(r.status, 'LOOK');
    if (r.status !== 'LOOK') return;
    const ids = r.pecas.map((p) => p.id);
    for (const id of lookNaTela) assert.ok(ids.includes(id), 'nenhuma peça da tela sai');
    assert.equal(r.pecas.filter((p) => p.papel === 'SOBREPOSICAO').length, 1);
    assert.ok(ids.includes(moletomCinza.id) || ids.includes(jaquetaCouro.id));
    assert.ok(!r.avisos.some((a) => /Não achei/.test(a)), r.avisos.join(' | '));
  });

  it('"moletom ou jaqueta" sem moletom no armário usa a jaqueta sem avisar', () => {
    const semMoletom = armario.filter((p) => p.id !== moletomCinza.id);
    const r = montarLook(
      semMoletom,
      intencao({
        incluir: [
          { categoria: 'MOLETOM', cor: null, material: null },
          { categoria: 'JAQUETA', cor: null, material: null },
        ],
      }),
      { ...sempreOPrimeiro, alternativas: [[0, 1]] },
    );
    assert.equal(r.status, 'LOOK');
    if (r.status !== 'LOOK') return;
    assert.ok(r.pecas.some((p) => p.id === jaquetaCouro.id));
    assert.ok(!r.avisos.some((a) => /Não achei/.test(a)), r.avisos.join(' | '));
  });

  it('sem blusa nem moletom, usa a jaqueta e avisa', () => {
    const semMoletom = armario.filter((p) => p.id !== moletomCinza.id);
    const r = montarLook(semMoletom, pedido('BLUSA'), { pecasAnteriores: lookNaTela });
    assert.equal(r.status, 'LOOK');
    if (r.status !== 'LOOK') return;
    assert.ok(r.pecas.some((p) => p.id === jaquetaCouro.id));
    assert.ok(
      r.avisos.some((a) => /coloquei jaqueta/.test(a)),
      r.avisos.join(' | '),
    );
  });
});
