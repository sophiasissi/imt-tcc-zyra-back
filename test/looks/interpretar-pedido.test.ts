import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ajustarIntencao, Intencao } from '../../src/looks/interpretar-pedido';

function intencao(extras: Partial<Intencao> = {}): Intencao {
  return {
    tipo: 'LOOK',
    ocasiao: null,
    formalidade: null,
    estilo: null,
    aquecimento: null,
    paletaNeutra: false,
    umaCor: false,
    corDoLook: null,
    incluir: [],
    evitarCategorias: [],
    evitarCores: [],
    pergunta: null,
    naoMapeado: [],
    trocar: [],
    ...extras,
  };
}

describe('ajustarIntencao: look de uma cor', () => {
  it('a cor do look liga o umaCor e não fica repetida em incluir', () => {
    const ajustada = ajustarIntencao(
      intencao({
        corDoLook: { familia: 'AZUL', tom: 'CLARO' },
        incluir: [{ categoria: null, cor: { familia: 'AZUL', tom: 'CLARO' }, material: null }],
      }),
    );
    assert.equal(ajustada.umaCor, true);
    assert.deepEqual(ajustada.incluir, []);
  });

  it('"conjunto de moletom": vale qualquer peça de moletom, não só a blusa', () => {
    const ajustada = ajustarIntencao(
      intencao({
        umaCor: true,
        incluir: [{ categoria: 'MOLETOM', cor: null, material: 'MOLETOM' }],
      }),
    );
    assert.deepEqual(ajustada.incluir, [{ categoria: null, cor: null, material: 'MOLETOM' }]);
  });

  it('fora do look de uma cor, "um moletom" continua sendo a blusa', () => {
    const ajustada = ajustarIntencao(
      intencao({ incluir: [{ categoria: 'MOLETOM', cor: null, material: 'MOLETOM' }] }),
    );
    assert.equal(ajustada.incluir[0].categoria, 'MOLETOM');
  });

  it('pedido de look de uma cor não vira pergunta', () => {
    const ajustada = ajustarIntencao(
      intencao({ tipo: 'ESCLARECER', umaCor: true, pergunta: 'Para onde você vai?' }),
    );
    assert.equal(ajustada.tipo, 'LOOK');
  });
});

describe('ajustarIntencao: usar uma peça de uma cor não é look de uma cor', () => {
  it('"quero usar meu moletom azul bebê" fica só no incluir', () => {
    const ajustada = ajustarIntencao(
      intencao({
        umaCor: true,
        corDoLook: { familia: 'AZUL', tom: 'CLARO' },
        incluir: [{ categoria: 'MOLETOM', cor: { familia: 'AZUL', tom: 'CLARO' }, material: null }],
      }),
    );
    assert.equal(ajustada.umaCor, false);
    assert.equal(ajustada.corDoLook, null);
    assert.equal(ajustada.incluir.length, 1);
  });
});
