import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aquecimentoDaPrevisao, descreverPrevisao, hojeNoBrasil } from '../../src/looks/clima';

// Terça-feira, 06/10/2026.
const TERCA = new Date(2026, 9, 6);

describe('aquecimentoDaPrevisao', () => {
  const previsao = (minima: number, maxima: number) => ({
    diasAPartirDeHoje: 0,
    minima,
    maxima,
    chanceDeChuva: null,
  });

  it('calor, ameno e frio pela média do dia', () => {
    assert.equal(aquecimentoDaPrevisao(previsao(20, 30)), 'LEVE');
    assert.equal(aquecimentoDaPrevisao(previsao(16, 26)), 'MEDIO');
    assert.equal(aquecimentoDaPrevisao(previsao(10, 19)), 'QUENTE');
  });
});

describe('descreverPrevisao', () => {
  it('diz o dia e a temperatura, e a chuva só quando é provável', () => {
    assert.equal(
      descreverPrevisao(
        { diasAPartirDeHoje: 4, minima: 14.6, maxima: 22.2, chanceDeChuva: 20 },
        TERCA,
      ),
      'Pela previsão, sábado (10/10) vai ser um dia fresco (15 a 22 °C).',
    );
    assert.equal(
      descreverPrevisao({ diasAPartirDeHoje: 0, minima: 13, maxima: 21, chanceDeChuva: 98 }, TERCA),
      'Pela previsão, hoje vai ser um dia fresco (13 a 21 °C) e pode chover.',
    );
    assert.match(
      descreverPrevisao({ diasAPartirDeHoje: 1, minima: 22, maxima: 32, chanceDeChuva: 0 }, TERCA),
      /amanhã vai ser um dia quente/,
    );
    assert.match(
      descreverPrevisao({ diasAPartirDeHoje: 1, minima: 8, maxima: 16, chanceDeChuva: 0 }, TERCA),
      /um dia frio/,
    );
  });
});

describe('hojeNoBrasil', () => {
  it('às 22h de Brasília ainda é o mesmo dia, mesmo com o servidor em UTC', () => {
    const hoje = hojeNoBrasil(new Date('2026-10-07T01:00:00Z')); // 06/10, 22h em Brasília
    assert.equal(hoje.getDate(), 6);
    assert.equal(hoje.getMonth(), 9);
  });
});
