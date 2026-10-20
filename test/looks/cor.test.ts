import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { corBateComPedido, corDaPeca } from '../../src/looks/cor';

describe('corBateComPedido', () => {
  const rosaBebe = corDaPeca('COLORADD_VERMELHO_CLARO', '#F4C2C2');
  const pink = corDaPeca('COLORADD_ROXO_CLARO', '#FF69B4');
  const vermelho = corDaPeca('COLORADD_VERMELHO', '#B22222');
  const roxo = corDaPeca('COLORADD_ROXO', '#6A3D9A');

  it('rosa (VERMELHO CLARO) aceita rosa bebê e pink, que o ColorADD grava como Roxo Claro', () => {
    const rosa = { familia: 'VERMELHO' as const, tom: 'CLARO' as const };

    assert.equal(corBateComPedido(rosa, rosaBebe), true);
    assert.equal(corBateComPedido(rosa, pink), true);
    assert.equal(corBateComPedido(rosa, vermelho), false);
    assert.equal(corBateComPedido(rosa, roxo), false);
  });

  it('roxo claro continua só roxo claro', () => {
    assert.equal(corBateComPedido({ familia: 'ROXO', tom: 'CLARO' }, rosaBebe), false);
    assert.equal(corBateComPedido({ familia: 'ROXO', tom: 'CLARO' }, pink), true);
  });

  it('vermelho sem tom não pega o pink', () => {
    assert.equal(corBateComPedido({ familia: 'VERMELHO', tom: null }, pink), false);
    assert.equal(corBateComPedido({ familia: 'VERMELHO', tom: null }, rosaBebe), true);
  });
});
