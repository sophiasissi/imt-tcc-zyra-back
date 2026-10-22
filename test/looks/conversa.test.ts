import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  alternativasDoPedido,
  entenderRespostaCurta,
  falaDeEncontro,
  pedeParaAcrescentar,
  PERGUNTA_OCASIAO,
  PERGUNTA_SALVAR,
} from '../../src/looks/conversa';
import { PecaDesejada } from '../../src/looks/interpretar-pedido';

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

describe('pedeParaAcrescentar', () => {
  it('acréscimo ao look da tela', () => {
    for (const m of [
      'adiciona uma blusa ou jaqueta',
      'quero uma blusa também',
      'coloca um moletom por cima',
      'põe uma jaqueta',
      'bota um casaco',
    ]) {
      assert.equal(pedeParaAcrescentar(m), true, m);
    }
  });

  it('troca ou look novo não é acréscimo', () => {
    for (const m of ['troca a camiseta por uma blusa', 'quero uma blusa', 'um look por favor']) {
      assert.equal(pedeParaAcrescentar(m), false, m);
    }
  });
});

describe('alternativasDoPedido', () => {
  const pedido = (...categorias: NonNullable<PecaDesejada['categoria']>[]) =>
    categorias.map((categoria) => ({ categoria, cor: null, material: null }));

  it('"X ou Y" vira um grupo só', () => {
    assert.deepEqual(
      alternativasDoPedido('quero um moletom ou jaqueta', pedido('MOLETOM', 'JAQUETA')),
      [[0, 1]],
    );
    assert.deepEqual(
      alternativasDoPedido('Quero um moletom cinza ou uma jaqueta!', pedido('MOLETOM', 'JAQUETA')),
      [[0, 1]],
    );
    assert.deepEqual(
      alternativasDoPedido('vou de tênis ou sandália', pedido('TENIS', 'SANDALIA')),
      [[0, 1]],
    );
  });

  it('só as peças em volta do "ou": o resto continua obrigatório', () => {
    assert.deepEqual(
      alternativasDoPedido(
        'camiseta ou camisa com calça jeans',
        pedido('CAMISETA', 'CAMISA', 'CALCA'),
      ),
      [[0, 1]],
    );
  });

  it('mesma peça em duas cores ("camiseta preta ou branca")', () => {
    assert.deepEqual(
      alternativasDoPedido(
        'camiseta preta ou branca com calça jeans',
        pedido('CAMISETA', 'CAMISETA', 'CALCA'),
      ),
      [[0, 1]],
    );
  });

  it('"X ou Y ou Z" junta as três', () => {
    assert.deepEqual(
      alternativasDoPedido('camiseta ou camisa ou blusa', pedido('CAMISETA', 'CAMISA', 'BLUSA')),
      [[0, 1, 2]],
    );
  });

  it('sem "ou" entre peças, nada muda', () => {
    for (const m of [
      'quero um moletom e uma jaqueta',
      'calça de moletom ou jeans',
      'pra trabalho ou faculdade, com camisa e calça',
    ]) {
      assert.deepEqual(
        alternativasDoPedido(m, pedido('MOLETOM', 'JAQUETA', 'CALCA', 'CAMISA')),
        [],
        m,
      );
    }
  });
});

describe('falaDeEncontro', () => {
  it('reconhece date e encontro', () => {
    for (const m of [
      'monta um look para um date',
      'Encontro hoje à noite',
      'vou sair com o crush',
      'jantar romântico com minha namorada',
    ]) {
      assert.equal(falaDeEncontro(m), true, m);
    }
  });

  it('não confunde com outros pedidos', () => {
    for (const m of ['look pra trabalho', 'quero atualizar meu look', 'festa de aniversário']) {
      assert.equal(falaDeEncontro(m), false, m);
    }
  });
});
