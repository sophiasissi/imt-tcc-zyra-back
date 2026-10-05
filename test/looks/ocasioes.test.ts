import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';
import { compatibilidade } from '../../src/looks/ocasioes';

let proximoId = 0;

function peca(
  categoria: PecaMotor['categoria'],
  corNome: string,
  colorAddSymbol: string,
  hex: string,
  extras: Partial<PecaMotor> = {},
): PecaMotor {
  return {
    id: `o${++proximoId}`,
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

// Parecido com o armário real do Gustavo: nada marcado para festa, camisetas
// com logo, calças jeans de dia a dia e trabalho, chinelo de casa.
const camisaBranca = peca('CAMISA', 'Branco', 'COLORADD_BRANCO', '#F2F2F2', {
  estilo: 'SOCIAL',
  estampa: 'LISTRADO',
  ocasioes: ['TRABALHO', 'DIA_A_DIA'],
});
const camisetaPretaLisa = peca('CAMISETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
  estilo: 'BASICO',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
});
const camisetaLogo = peca('CAMISETA', 'Cinza Escuro', 'COLORADD_CINZA_ESCURO', '#444444', {
  estampa: 'LOGO',
  ocasioes: ['DIA_A_DIA', 'PRAIA'],
});
const camisetaTreino = peca('CAMISETA', 'Vermelho Claro', 'COLORADD_VERMELHO_CLARO', '#E08080', {
  estilo: 'ESPORTIVO',
  estampa: 'LOGO',
  aquecimento: 'LEVE',
  ocasioes: ['DIA_A_DIA', 'ACADEMIA'],
});
const moletom = peca('MOLETOM', 'Preto', 'COLORADD_PRETO', '#151515', {
  aquecimento: 'QUENTE',
  ocasioes: ['DIA_A_DIA', 'CASA'],
});
const camisetaExtra = peca('CAMISETA', 'Branco', 'COLORADD_BRANCO', '#F5F5F5', {
  ocasioes: ['DIA_A_DIA', 'CASA'],
});
const jeansPreta = peca('CALCA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
  material: 'JEANS',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
});
const calcaBranca = peca('CALCA', 'Branco', 'COLORADD_BRANCO', '#EEEEEE', {
  estilo: 'BASICO',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
});
const calcaCinza = peca('CALCA', 'Cinza Escuro', 'COLORADD_CINZA_ESCURO', '#3A3A3A', {
  ocasioes: ['DIA_A_DIA', 'CASA'],
});
const jeansAzul = peca('CALCA', 'Azul Escuro', 'COLORADD_AZUL_ESCURO', '#22304A', {
  material: 'JEANS',
});
const shortPraia = peca('SHORT', 'Preto', 'COLORADD_PRETO', '#121212', {
  aquecimento: 'LEVE',
  ocasioes: ['DIA_A_DIA', 'PRAIA'],
});
const tenisXadrez = peca('TENIS', 'Preto', 'COLORADD_PRETO', '#202020', {
  estampa: 'XADREZ',
});
const tenisBege = peca('TENIS', 'Castanho Claro', 'COLORADD_CASTANHO_CLARO', '#C8B08A', {
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
});
const chinelo = peca('SAPATO', 'Verde Escuro', 'COLORADD_VERDE_ESCURO', '#3A4A30', {
  aquecimento: 'LEVE',
  ocasioes: ['DIA_A_DIA', 'CASA'],
});
const jaquetaCouro = peca('JAQUETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', {
  material: 'COURO',
  aquecimento: 'QUENTE',
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
});

const armario = [
  camisaBranca,
  camisetaPretaLisa,
  camisetaLogo,
  camisetaTreino,
  moletom,
  camisetaExtra,
  jeansPreta,
  calcaBranca,
  calcaCinza,
  jeansAzul,
  shortPraia,
  tenisXadrez,
  tenisBege,
  chinelo,
  jaquetaCouro,
];

function look(resultado: ResultadoMotor) {
  assert.equal(resultado.status, 'LOOK', JSON.stringify(resultado));
  return resultado as Extract<ResultadoMotor, { status: 'LOOK' }>;
}

function pecasDe(resultado: ResultadoMotor, base = armario) {
  return look(resultado).pecas.map((p) => base.find((a) => a.id === p.id)!);
}

/** Roda o motor com várias sementes do sorteio, para a regra valer em todos os looks possíveis. */
function emTodosOsSorteios(fn: (aleatorio: () => number) => void) {
  for (let i = 0; i < 5; i++) fn(() => i / 5);
}

describe('academia', () => {
  it('nunca usa calça jeans nem peça que não é de treino', () => {
    // 5 peças de baixo (o mínimo), nenhuma de treino: jeans, sociais e de casa.
    const calcaSocial = peca('CALCA', 'Preto', 'COLORADD_PRETO', '#101010', {
      estilo: 'SOCIAL',
      ocasioes: ['TRABALHO'],
    });
    const semShortDeTreino = [...armario.filter((p) => p !== shortPraia), calcaSocial];
    const r = montarLook(semShortDeTreino, intencao({ ocasiao: 'ACADEMIA' }));
    assert.equal(r.status, 'SEM_LOOK');
    assert.match(
      r.status === 'SEM_LOOK' ? r.mensagem : '',
      /Não encontrei peças de baixo para academia no seu armário\. Cadastre roupas de treino/,
    );
  });

  it('com peça de treino, monta o look só com ela', () => {
    const shortTreino = peca('SHORT', 'Preto', 'COLORADD_PRETO', '#111111', {
      estilo: 'ESPORTIVO',
      aquecimento: 'LEVE',
      ocasioes: ['ACADEMIA'],
    });
    const base = [...armario, shortTreino];
    emTodosOsSorteios((aleatorio) => {
      const pecas = pecasDe(
        montarLook(base, intencao({ ocasiao: 'ACADEMIA' }), { aleatorio }),
        base,
      );
      assert.ok(pecas.every((p) => p.material !== 'JEANS' && p.material !== 'COURO'));
      assert.ok(pecas.some((p) => p.id === shortTreino.id));
      assert.ok(pecas.some((p) => p.id === camisetaTreino.id));
    });
  });
});

describe('festa', () => {
  it('nunca usa chinelo e não avisa "peças mais próximas"', () => {
    emTodosOsSorteios((aleatorio) => {
      const r = look(montarLook(armario, intencao({ ocasiao: 'FESTA' }), { aleatorio }));
      assert.ok(!r.pecas.some((p) => p.id === chinelo.id));
      assert.ok(!r.avisos.some((a) => a.includes('mais próximas')), r.avisos.join(' | '));
    });
  });

  it('se o único calçado é chinelo, o look sai sem calçado e avisa', () => {
    const soChinelo = armario.filter((p) => p.categoria !== 'TENIS');
    const r = look(montarLook(soChinelo, intencao({ ocasiao: 'FESTA' })));
    assert.ok(!r.pecas.some((p) => p.papel === 'CALCADO'));
    assert.ok(r.avisos.some((a) => a.startsWith('Não encontrei calçado para festa')));
  });

  it('prefere a camisa à camiseta com logo', () => {
    const pecas = pecasDe(
      montarLook(armario, intencao({ ocasiao: 'FESTA' }), { aleatorio: () => 0 }),
    );
    assert.ok(pecas.some((p) => p.id === camisaBranca.id));
  });
});

describe('trabalho', () => {
  it('nunca usa short, chinelo ou peça esportiva', () => {
    emTodosOsSorteios((aleatorio) => {
      const pecas = pecasDe(montarLook(armario, intencao({ ocasiao: 'TRABALHO' }), { aleatorio }));
      assert.ok(!pecas.some((p) => p.categoria === 'SHORT'));
      assert.ok(!pecas.some((p) => p.id === chinelo.id));
      assert.ok(!pecas.some((p) => p.estilo === 'ESPORTIVO'));
    });
  });
});

describe('trocar parte do look', () => {
  it('"troca o tênis" mantém a parte de cima e a de baixo e muda só o calçado', () => {
    const primeiro = look(
      montarLook(armario, intencao({ ocasiao: 'FESTA' }), { aleatorio: () => 0 }),
    );
    const calcadoAntes = primeiro.pecas.find((p) => p.papel === 'CALCADO')!;

    const segundo = look(
      montarLook(armario, intencao({ ocasiao: 'FESTA', trocar: ['CALCADO'] }), {
        aleatorio: () => 0,
        pecasAnteriores: primeiro.pecas.map((p) => p.id),
      }),
    );

    const semCalcado = (l: typeof primeiro) =>
      l.pecas.filter((p) => p.papel !== 'CALCADO').map((p) => p.id);
    assert.deepEqual(semCalcado(segundo), semCalcado(primeiro));

    const calcadoDepois = segundo.pecas.find((p) => p.papel === 'CALCADO');
    assert.ok(calcadoDepois, 'o look novo tem calçado');
    assert.notEqual(calcadoDepois!.id, calcadoAntes.id);
    assert.notEqual(calcadoDepois!.id, chinelo.id, 'continua respeitando a festa');
  });
});

describe('descrição', () => {
  it('concorda a cor com o gênero da peça', () => {
    const r = look(
      montarLook(
        armario,
        intencao({
          incluir: [
            { categoria: 'CALCA', cor: { familia: 'PRETO', tom: null }, material: 'JEANS' },
            { categoria: 'CAMISETA', cor: { familia: 'VERMELHO', tom: 'CLARO' }, material: null },
          ],
        }),
        { aleatorio: () => 0 },
      ),
    );
    assert.match(r.descricao, /Camiseta Vermelha Clara/);
    assert.match(r.descricao, /Calça Preta/);
  });
});

describe('compatibilidade', () => {
  it('classifica peças do armário real', () => {
    assert.equal(compatibilidade(jeansPreta, 'ACADEMIA'), 'PROIBIDA');
    assert.equal(compatibilidade(camisetaTreino, 'ACADEMIA'), 'ADEQUADA');
    assert.equal(compatibilidade(chinelo, 'FESTA'), 'PROIBIDA');
    assert.equal(compatibilidade(chinelo, 'CASA'), 'ADEQUADA');
    assert.equal(compatibilidade(camisetaLogo, 'FESTA'), 'ACEITAVEL');
    assert.equal(compatibilidade(shortPraia, 'TRABALHO'), 'PROIBIDA');
    assert.equal(compatibilidade(jaquetaCouro, 'PRAIA'), 'PROIBIDA');
    assert.equal(compatibilidade(camisaBranca, 'DIA_A_DIA'), 'ADEQUADA');
  });
});

describe('casa', () => {
  it('nunca usa jaqueta, jeans ou couro', () => {
    emTodosOsSorteios((aleatorio) => {
      const pecas = pecasDe(montarLook(armario, intencao({ ocasiao: 'CASA' }), { aleatorio }));
      assert.ok(!pecas.some((p) => p.categoria === 'JAQUETA' || p.categoria === 'BLAZER'));
      assert.ok(!pecas.some((p) => p.material === 'JEANS' || p.material === 'COURO'));
    });
  });
});

describe('variedade', () => {
  it('peças empatadas se revezam entre os pedidos', () => {
    const camisetas = Array.from({ length: 8 }, (_, i) =>
      peca('CAMISETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A', { estampa: 'LOGO', id: `empate${i}` }),
    );
    const base = [
      ...camisetas,
      jeansPreta,
      calcaBranca,
      calcaCinza,
      jeansAzul,
      shortPraia,
      tenisBege,
    ];
    const usadas = new Set<string>();
    let semente = 0.123;
    for (let i = 0; i < 20; i++) {
      const aleatorio = () => (semente = (semente * 9301 + 0.49297) % 1);
      const r = look(montarLook(base, intencao(), { aleatorio }));
      usadas.add(r.pecas.find((p) => p.papel === 'SUPERIOR')!.id);
    }
    assert.ok(usadas.size >= 4, `só ${usadas.size} camisetas diferentes em 20 pedidos`);
  });
});
