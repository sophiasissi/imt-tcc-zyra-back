import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';
import { nomeDaPeca } from '../../src/looks/nome-da-peca';
import { compatibilidade } from '../../src/looks/ocasioes';

// Bota separada do sapato, com o cano (lista da Sophia, 05/11/2026). A bota
// castanha de couro dela era salva como sapato.

let proximoId = 0;

function peca(
  categoria: PecaMotor['categoria'],
  corNome: string,
  colorAddSymbol: string,
  hex: string,
  extras: Partial<PecaMotor> = {},
): PecaMotor {
  return {
    id: `b${++proximoId}`,
    categoria,
    corNome,
    colorAddSymbol,
    hex,
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: null,
    manga: 'CURTA',
    decotada: null,
    cano: null,
    salto: null,
    curta: null,
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

const PRETO = ['Preto', 'COLORADD_PRETO', '#151515'] as const;
const BRANCO = ['Branco', 'COLORADD_BRANCO', '#F2F2F2'] as const;
const CASTANHO = ['Castanho', 'COLORADD_CASTANHO', '#6B4A2B'] as const;

const botaCurta = peca('BOTA', ...CASTANHO, {
  ocasioes: ['DIA_A_DIA', 'TRABALHO'],
  aquecimento: 'MEDIO',
  material: 'COURO',
  manga: null,
  cano: 'CURTO',
});
const botaWestern = peca('BOTA', ...CASTANHO, {
  ocasioes: ['DIA_A_DIA', 'FESTA'],
  aquecimento: 'MEDIO',
  material: 'COURO',
  manga: null,
  cano: 'MEDIO',
});
const botaLonga = peca('BOTA', ...PRETO, {
  estilo: 'ELEGANTE',
  ocasioes: ['TRABALHO', 'FESTA'],
  aquecimento: 'QUENTE',
  material: 'COURO',
  manga: null,
  cano: 'LONGO',
});
const botaOverTheKnee = peca('BOTA', ...PRETO, {
  estilo: 'ELEGANTE',
  ocasioes: ['FESTA'],
  aquecimento: 'QUENTE',
  material: 'COURO',
  manga: null,
  cano: 'ACIMA_DO_JOELHO',
});

const superiores = [
  peca('BLUSA', ...PRETO, {
    estilo: 'ELEGANTE',
    ocasioes: ['FESTA', 'TRABALHO'],
    manga: 'LONGA',
    material: 'VISCOSE',
  }),
  peca('BLUSA', ...BRANCO, {
    estilo: 'SOCIAL',
    ocasioes: ['TRABALHO'],
    manga: 'LONGA',
    material: 'CETIM',
  }),
  peca('CAMISA', ...BRANCO, {
    estilo: 'SOCIAL',
    ocasioes: ['TRABALHO'],
    manga: 'LONGA',
    material: 'ALFAIATARIA',
  }),
  peca('CAMISETA', ...PRETO, { material: 'MALHA' }),
  peca('CAMISETA', ...BRANCO, { material: 'MALHA' }),
];
const minissaia = peca('SAIA', ...PRETO, {
  ocasioes: ['FESTA', 'DIA_A_DIA'],
  material: 'COURO',
  manga: null,
  curta: true,
});
const saiaMidi = peca('SAIA', ...PRETO, {
  estilo: 'SOCIAL',
  ocasioes: ['TRABALHO', 'FESTA'],
  material: 'ALFAIATARIA',
  manga: null,
  curta: false,
});
const inferiores = [
  minissaia,
  saiaMidi,
  peca('CALCA', 'Azul', 'COLORADD_AZUL', '#3B5B8C', { material: 'JEANS', manga: null }),
  peca('CALCA', ...PRETO, {
    estilo: 'SOCIAL',
    ocasioes: ['TRABALHO'],
    material: 'ALFAIATARIA',
    manga: null,
  }),
  peca('SHORT', 'Azul', 'COLORADD_AZUL', '#3B5B8C', {
    aquecimento: 'LEVE',
    material: 'JEANS',
    manga: null,
  }),
];
const scarpin = peca('SAPATO', ...PRETO, {
  estilo: 'ELEGANTE',
  ocasioes: ['TRABALHO', 'FESTA'],
  material: 'COURO',
  manga: null,
});
const tenis = peca('TENIS', ...BRANCO, { manga: null });

const armario = [
  ...superiores,
  ...inferiores,
  botaCurta,
  botaWestern,
  botaLonga,
  botaOverTheKnee,
  scarpin,
  tenis,
];

function pecasDe(resultado: ResultadoMotor, base = armario) {
  assert.equal(resultado.status, 'LOOK', JSON.stringify(resultado));
  if (resultado.status !== 'LOOK') return [];
  return resultado.pecas.map((p) => base.find((a) => a.id === p.id)!);
}

function emTodosOsSorteios(pedido: Intencao, regra: (look: PecaMotor[]) => void, base = armario) {
  for (let i = 0; i < 10; i++)
    regra(pecasDe(montarLook(base, pedido, { aleatorio: () => i / 10 }), base));
}

describe('bota: ocasião', () => {
  it('nenhuma bota vai para academia, praia ou casa', () => {
    for (const bota of [botaCurta, botaWestern, botaLonga, botaOverTheKnee]) {
      for (const ocasiao of ['ACADEMIA', 'PRAIA', 'CASA'] as const) {
        assert.equal(compatibilidade(bota, ocasiao), 'PROIBIDA', `${bota.cano} em ${ocasiao}`);
      }
    }
  });

  it('nenhuma bota vai para o trabalho (pedido da Sophia, 05/11/2026)', () => {
    for (const bota of [botaCurta, botaWestern, botaLonga, botaOverTheKnee]) {
      assert.equal(compatibilidade(bota, 'TRABALHO'), 'PROIBIDA', String(bota.cano));
      assert.equal(compatibilidade(bota, 'TRABALHO', { formalidade: 'ALTA' }), 'PROIBIDA');
    }
  });

  it('no look de trabalho, a over the knee não sai', () => {
    emTodosOsSorteios(intencao({ ocasiao: 'TRABALHO' }), (look) => {
      assert.ok(!look.includes(botaOverTheKnee));
    });
  });
});

describe('bota: clima', () => {
  it('no calor, sem bota de cano longo ou over the knee', () => {
    emTodosOsSorteios(intencao({ aquecimento: 'LEVE' }), (look) => {
      assert.ok(!look.includes(botaLonga) && !look.includes(botaOverTheKnee));
    });
  });

  it('no frio, o calçado é bota', () => {
    emTodosOsSorteios(intencao({ aquecimento: 'QUENTE' }), (look) => {
      assert.ok(
        look.some((p) => p.categoria === 'BOTA'),
        JSON.stringify(look),
      );
    });
  });
});

describe('bota: combinação com a parte de baixo', () => {
  it('over the knee vai com minissaia, nunca com saia midi', () => {
    const pedido = intencao({
      ocasiao: 'FESTA',
      aquecimento: 'QUENTE',
      incluir: [{ categoria: 'BOTA', cor: null, material: null }],
    });
    const soOverTheKnee = armario.filter((p) => p.categoria !== 'BOTA' || p === botaOverTheKnee);
    emTodosOsSorteios(
      pedido,
      (look) => {
        assert.ok(look.includes(botaOverTheKnee));
        assert.ok(!look.includes(saiaMidi), 'saia midi esconde a over the knee');
      },
      soOverTheKnee,
    );
  });

  // Preferência, e não regra: bota longa com minissaia também é um look comum.
  // O bônus faz a saia midi entrar no sorteio, que antes a minissaia de couro
  // (tecido de festa) ganhava sempre.
  it('cano longo leva a saia midi para o sorteio', () => {
    const pedido = intencao({
      ocasiao: 'FESTA',
      aquecimento: 'QUENTE',
      incluir: [
        { categoria: 'BOTA', cor: null, material: null },
        { categoria: 'SAIA', cor: null, material: null },
      ],
    });
    const soLonga = armario.filter((p) => p.categoria !== 'BOTA' || p === botaLonga);
    let comMidi = 0;
    emTodosOsSorteios(pedido, (look) => (comMidi += look.includes(saiaMidi) ? 1 : 0), soLonga);
    assert.ok(comMidi >= 3, `saia midi em ${comMidi} de 10 looks`);
  });
});

describe('bota: nome', () => {
  it('diz o cano e o couro', () => {
    assert.equal(nomeDaPeca(botaCurta), 'Bota cano curto de couro');
    assert.equal(nomeDaPeca(botaOverTheKnee), 'Bota over the knee de couro');
    assert.equal(nomeDaPeca({ categoria: 'BOTA', material: null, cano: null }), 'Bota');
  });

  it('a cor concorda no feminino', () => {
    const resultado = montarLook(
      armario,
      intencao({ incluir: [{ categoria: 'BOTA', cor: null, material: null }] }),
      { aleatorio: () => 0 },
    );
    assert.equal(resultado.status, 'LOOK');
    if (resultado.status === 'LOOK')
      assert.match(resultado.descricao, /Bota [^,]*(Preta|Castanha)/);
  });
});
