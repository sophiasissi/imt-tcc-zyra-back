import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { falaDeBalada, pedeSalto } from '../../src/looks/conversa';
import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';

// Balada (pedido da Sophia, 05/11/2026): veio saia longa e salto. Na balada,
// sem saia longa, e tênis no lugar do salto, a não ser que a pessoa peça.

let proximoId = 0;

function peca(categoria: PecaMotor['categoria'], extras: Partial<PecaMotor> = {}): PecaMotor {
  return {
    id: `f${++proximoId}`,
    categoria,
    corNome: 'Preto',
    colorAddSymbol: 'COLORADD_PRETO',
    hex: '#151515',
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA', 'FESTA'],
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

const saiaLonga = peca('SAIA', {
  estilo: 'ELEGANTE',
  ocasioes: ['FESTA'],
  material: 'CETIM',
  manga: null,
  curta: false,
});
const minissaia = peca('SAIA', { material: 'JEANS', manga: null, curta: true });
const scarpin = peca('SAPATO', {
  estilo: 'ELEGANTE',
  ocasioes: ['FESTA', 'TRABALHO'],
  material: 'COURO',
  manga: null,
});
const sandaliaDeSalto = peca('SANDALIA', {
  estilo: 'ELEGANTE',
  ocasioes: ['FESTA'],
  manga: null,
});
const tenis = peca('TENIS', {
  corNome: 'Branco',
  colorAddSymbol: 'COLORADD_BRANCO',
  hex: '#F2F2F2',
  manga: null,
});

const armario = [
  ...Array.from({ length: 5 }, () => peca('BLUSA', { estilo: 'ELEGANTE', material: 'CETIM' })),
  saiaLonga,
  minissaia,
  ...Array.from({ length: 3 }, () => peca('CALCA', { material: 'COURO', manga: null })),
  scarpin,
  sandaliaDeSalto,
  tenis,
];

function intencao(extras: Partial<Intencao> = {}): Intencao {
  return {
    tipo: 'LOOK',
    ocasiao: 'FESTA',
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

const ids = (r: ResultadoMotor) => {
  assert.equal(r.status, 'LOOK', JSON.stringify(r));
  return r.status === 'LOOK' ? r.pecas.map((p) => p.id) : [];
};

describe('balada', () => {
  it('reconhece a balada e o pedido de salto pelo texto', () => {
    for (const texto of [
      'Quero um look pra balada',
      'vou numa boate hoje',
      'rave sábado',
      'vou sair pra dançar',
    ]) {
      assert.ok(falaDeBalada(texto), texto);
    }
    assert.ok(!falaDeBalada('look para um casamento à noite'));
    for (const texto of ['troca o tênis por um salto', 'quero de salto alto', 'com scarpin']) {
      assert.ok(pedeSalto(texto), texto);
    }
    assert.ok(!pedeSalto('troca o tênis'));
  });

  it('sem saia longa e com tênis no lugar do salto', () => {
    for (let i = 0; i < 10; i++) {
      const look = ids(montarLook(armario, intencao(), { balada: true, aleatorio: () => i / 10 }));
      assert.ok(!look.includes(saiaLonga.id), 'saia longa na balada');
      assert.ok(look.includes(tenis.id), 'sem tênis na balada');
    }
  });

  it('fora da balada, a festa continua aceitando salto e saia longa', () => {
    const usados = new Set<string>();
    for (let i = 0; i < 10; i++) {
      for (const id of ids(montarLook(armario, intencao(), { aleatorio: () => i / 10 })))
        usados.add(id);
    }
    assert.ok(usados.has(scarpin.id) || usados.has(sandaliaDeSalto.id));
  });

  it('pedindo o salto, ele entra', () => {
    const pedido = intencao({ incluir: [{ categoria: 'SAPATO', cor: null, material: null }] });
    const look = ids(montarLook(armario, pedido, { balada: true, pediuSalto: true }));
    assert.ok(look.includes(scarpin.id));
  });

  it('pedindo salto sem a IA dizer qual, sapato e sandália voltam ao sorteio', () => {
    const usados = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const r = montarLook(armario, intencao(), {
        balada: true,
        pediuSalto: true,
        aleatorio: () => i / 10,
      });
      for (const id of ids(r)) usados.add(id);
    }
    assert.ok(usados.has(scarpin.id) || usados.has(sandaliaDeSalto.id));
  });

  it('sem tênis no armário, o salto fica (melhor que sem calçado)', () => {
    const semTenis = armario.filter((p) => p !== tenis);
    const look = ids(montarLook(semTenis, intencao(), { balada: true }));
    assert.ok(look.includes(scarpin.id) || look.includes(sandaliaDeSalto.id));
  });
  it('a bota pode sair na balada (o salto que sai é o de sapato e sandália)', () => {
    // Pedido da Sophia (05/11/2026): "pode colocar a bota quando for balada".
    const bota = peca('BOTA', {
      estilo: 'ELEGANTE',
      material: 'COURO',
      manga: null,
      cano: 'LONGO',
    });
    const comBota = [...armario, bota];
    let comABota = 0;
    for (let i = 0; i < 10; i++) {
      const look = ids(montarLook(comBota, intencao(), { balada: true, aleatorio: () => i / 10 }));
      if (look.includes(bota.id)) comABota++;
      assert.ok(!look.includes(scarpin.id) && !look.includes(sandaliaDeSalto.id));
    }
    assert.ok(comABota > 0, 'a bota nunca saiu na balada');
    const pedida = intencao({ incluir: [{ categoria: 'BOTA', cor: null, material: null }] });
    assert.ok(ids(montarLook(comBota, pedida, { balada: true })).includes(bota.id));
  });
});
