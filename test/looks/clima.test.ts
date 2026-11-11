import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aquecimentoDaPrevisao,
  descreverPrevisao,
  hojeNoBrasil,
  pedeCamadaLeve,
  previsaoDoHorario,
} from '../../src/looks/clima';

// Terça-feira, 06/10/2026.
const TERCA = new Date(2026, 9, 6);

describe('aquecimentoDaPrevisao', () => {
  const previsao = (minima: number, maxima: number) => ({
    diasAPartirDeHoje: 0,
    minima,
    maxima,
    chanceDeChuva: null,
  });

  it('calor pela máxima (25 °C ou mais, sem manhã fria); frio pela média', () => {
    assert.equal(aquecimentoDaPrevisao(previsao(20, 30)), 'LEVE');
    // O dia de 05/11/2026: deu "ameno", e veio manga longa e jaqueta.
    assert.equal(aquecimentoDaPrevisao(previsao(21, 26)), 'LEVE');
    assert.equal(aquecimentoDaPrevisao(previsao(16, 26)), 'LEVE');
    // Manhã fria com tarde quente: ameno, com uma peça para tirar.
    assert.equal(aquecimentoDaPrevisao(previsao(12, 26)), 'MEDIO');
    assert.equal(aquecimentoDaPrevisao(previsao(18, 24)), 'MEDIO');
    assert.equal(aquecimentoDaPrevisao(previsao(10, 19)), 'QUENTE');
  });

  it('camada leve só no dia ameno de tarde fresca ou manhã fria', () => {
    assert.equal(pedeCamadaLeve(previsao(21, 26)), false);
    assert.equal(pedeCamadaLeve(previsao(18, 24)), false);
    assert.equal(pedeCamadaLeve(previsao(14, 22)), true);
    assert.equal(pedeCamadaLeve(previsao(17, 19)), true);
    assert.equal(pedeCamadaLeve(previsao(10, 19)), false, 'frio já tem a camada');
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

describe('previsão do horário do evento (10/11/2026)', () => {
  // Dois dias que vão de 12 °C de madrugada a 27 °C à tarde.
  const horas = Array.from({ length: 48 }, (_, h) => {
    const hora = h % 24;
    if (hora < 6) return 12;
    if (hora < 12) return 16 + hora / 2;
    if (hora < 18) return 27;
    return 20 - (hora - 18);
  });
  const resposta = {
    hourly: {
      temperature_2m: horas,
      precipitation_probability: horas.map((_, h) => (h % 24 >= 18 ? 70 : 0)),
    },
  };

  it('pega só as horas do evento, no dia certo', () => {
    const noite = previsaoDoHorario(resposta, 1, { inicio: 18, fim: 24, nome: 'À noite' });
    assert.deepEqual(noite, { nome: 'À noite', minima: 15, maxima: 20, chanceDeChuva: 70 });
    const tarde = previsaoDoHorario(resposta, 0, { inicio: 12, fim: 18, nome: 'À tarde' });
    assert.deepEqual(tarde, { nome: 'À tarde', minima: 27, maxima: 27, chanceDeChuva: 0 });
  });

  it('o look segue o horário; a frase do dia continua e ganha a do horário', () => {
    const dia = { diasAPartirDeHoje: 0, minima: 12, maxima: 27, chanceDeChuva: 70 };
    const tarde = {
      ...dia,
      horario: { nome: 'À tarde', minima: 26, maxima: 27, chanceDeChuva: 0 },
    };
    const noite = {
      ...dia,
      horario: { nome: 'À noite', minima: 15, maxima: 20, chanceDeChuva: 70 },
    };
    assert.equal(aquecimentoDaPrevisao(tarde), 'LEVE');
    assert.equal(aquecimentoDaPrevisao(noite), 'MEDIO');
    assert.ok(pedeCamadaLeve(noite));
    const hoje = new Date(2026, 10, 10);
    assert.equal(
      descreverPrevisao(noite, hoje),
      'Pela previsão, hoje vai ser um dia fresco (12 a 27 °C). À noite, deve fazer de 15 a 20 °C, e pode chover.',
    );
    assert.equal(
      descreverPrevisao(tarde, hoje),
      'Pela previsão, hoje vai ser um dia fresco (12 a 27 °C). À tarde, deve fazer de 26 a 27 °C.',
    );
  });
});
