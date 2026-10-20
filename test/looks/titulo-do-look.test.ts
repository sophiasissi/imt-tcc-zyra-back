import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { limparTitulo, tituloDoPedido } from '../../src/looks/titulo-do-look';

describe('título do look', () => {
  it('limpa aspas e ponto final da resposta da IA', () => {
    assert.equal(limparTitulo('"Casamento à noite".'), 'Casamento à noite');
    assert.equal(limparTitulo('reunião de trabalho'), 'Reunião de trabalho');
    assert.equal(limparTitulo('Casamento à Noite'), 'Casamento à noite');
    assert.equal(limparTitulo('Apresentação do TCC'), 'Apresentação do TCC');
    assert.equal(limparTitulo('   '), null);
    assert.equal(limparTitulo('x'.repeat(61)), null);
  });

  it('sem IA, o título é o pedido cortado em 60 caracteres', () => {
    assert.equal(tituloDoPedido('festa  hoje'), 'Festa hoje');
    const longo = tituloDoPedido('a'.repeat(80));
    assert.equal(longo.length, 60);
    assert.ok(longo.endsWith('…'));
  });
});
