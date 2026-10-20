import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { entenderRespostaCurta, PERGUNTA_OCASIAO, PERGUNTA_SALVAR } from '../../src/looks/conversa';

const depoisDe = (pergunta: string) => [{ autor: 'zyra' as const, texto: `look\n\n${pergunta}` }];

describe('entenderRespostaCurta', () => {
  it('sim e não depois de "Quer salvar esse look?"', () => {
    for (const sim of ['sim', 'Sim!', 'pode', 'quero', 'tá bom', 'claro.']) {
      assert.equal(entenderRespostaCurta(sim, depoisDe(PERGUNTA_SALVAR)), 'SALVAR', sim);
    }
    for (const nao of ['não', 'Nao.', 'agora não', 'não precisa', 'não quero salvar']) {
      assert.equal(entenderRespostaCurta(nao, depoisDe(PERGUNTA_SALVAR)), 'NAO_SALVAR', nao);
    }
  });

  it('pedido de salvar com as próprias palavras, em qualquer momento', () => {
    for (const pedido of ['salva esse look', 'gostei, guarda pra mim', 'pode salvar']) {
      assert.equal(entenderRespostaCurta(pedido, []), 'SALVAR', pedido);
    }
  });

  it('o resto vai para a IA', () => {
    assert.equal(entenderRespostaCurta('sim', depoisDe(PERGUNTA_OCASIAO)), null);
    assert.equal(entenderRespostaCurta('sim', []), null);
    assert.equal(entenderRespostaCurta('não quero salvar, quero outro', []), null);
    assert.equal(
      entenderRespostaCurta('quero outro, salvo depois', depoisDe(PERGUNTA_SALVAR)),
      null,
    );
    assert.equal(entenderRespostaCurta('troca o tênis', depoisDe(PERGUNTA_SALVAR)), null);
  });
});
