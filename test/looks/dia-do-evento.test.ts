import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diaDaConversa, diasAte, extrairDia } from '../../src/looks/dia-do-evento';

// Terça-feira, 06/10/2026.
const TERCA = new Date(2026, 9, 6);

describe('extrairDia', () => {
  const casos: [string, string | null][] = [
    ['entrevista de emprego amanhã', 'AMANHA'],
    ['look p trampo amanha', 'AMANHA'],
    ['jantar com a família depois de amanhã', 'DEPOIS_DE_AMANHA'],
    ['tenho uma festa de aniversário hoje', 'HOJE'],
    ['vou num casamento sábado', 'SABADO'],
    ['missa de domingo', 'DOMINGO'],
    ['tenho um aniversário sexta-feira', 'SEXTA'],
    ['reunião na segunda', 'SEGUNDA'],
    ['vou pra praia no fim de semana', 'SABADO'],
    ['formatura dia 20', 'DATA 20'],
    ['vou num casamento em 14/11', 'DATA 14/11'],
    ['casamento dia 5/12', 'DATA 5/12'],
    ['monta um look', null],
    ['quero a segunda opção', null],
    ['look pro dia a dia', null],
  ];

  for (const [texto, esperado] of casos) {
    it(texto, () => {
      const dia = extrairDia(texto);
      const obtido = dia ? (dia.data ? `${dia.dia} ${dia.data}` : dia.dia) : null;
      assert.equal(obtido, esperado);
    });
  }
});

describe('diaDaConversa', () => {
  it('sem dia na mensagem, usa o da última mensagem do usuário que citou', () => {
    const historico = [
      { autor: 'usuario' as const, texto: 'monta um look pra amanhã' },
      { autor: 'zyra' as const, texto: 'É para alguma ocasião? Assim eu acerto melhor.' },
    ];
    assert.deepEqual(diaDaConversa('trabalho', historico), { dia: 'AMANHA', data: null });
    assert.deepEqual(diaDaConversa('é hoje, na verdade', historico), { dia: 'HOJE', data: null });
    assert.equal(diaDaConversa('trabalho', []), null);
  });
});

describe('diasAte', () => {
  const dia = (d: string, data: string | null = null) => ({ dia: d, data }) as never;

  it('sem dia, hoje e amanhã', () => {
    assert.equal(diasAte(null, TERCA), 0);
    assert.equal(diasAte(dia('HOJE'), TERCA), 0);
    assert.equal(diasAte(dia('AMANHA'), TERCA), 1);
    assert.equal(diasAte(dia('DEPOIS_DE_AMANHA'), TERCA), 2);
  });

  it('dia da semana: o próximo, e hoje se for o mesmo dia', () => {
    assert.equal(diasAte(dia('SABADO'), TERCA), 4);
    assert.equal(diasAte(dia('SEGUNDA'), TERCA), 6);
    assert.equal(diasAte(dia('TERCA'), TERCA), 0);
  });

  it('data: conta os dias, e data passada é do ano que vem', () => {
    assert.equal(diasAte(dia('DATA', '20/10'), TERCA), 14);
    assert.equal(diasAte(dia('DATA', '1/11'), TERCA), 26);
    assert.equal(diasAte(dia('DATA', '05/10'), TERCA), 364);
    assert.equal(diasAte(dia('DATA', '31/02'), TERCA), null);
  });

  it('só o dia: este mês, ou o próximo se já passou', () => {
    assert.equal(diasAte(dia('DATA', '20'), TERCA), 14);
    assert.equal(diasAte(dia('DATA', '6'), TERCA), 0);
    assert.equal(diasAte(dia('DATA', '3'), TERCA), 28);
  });
});
