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
const moletomCinza = peca('MOLETOM', 'Cinza', 'COLORADD_CINZA', '#808080', {
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

function pecasDe(resultado: ResultadoMotor) {
  return look(resultado).pecas.map((p) => armario.find((a) => a.id === p.id)!);
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
