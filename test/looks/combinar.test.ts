import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Peca } from '@prisma/client';

import { PecaFotografada, sugerirCombinacoes } from '../../src/looks/combinar';
import { PAPEL_DA_CATEGORIA } from '../../src/looks/taxonomia';

let n = 0;
const peca = (
  categoria: Peca['categoria'],
  corNome: string,
  colorAddSymbol: string,
  hex: string,
  extra: Partial<Peca> = {},
) => ({
  id: `p${++n}-${categoria}-${corNome}`,
  categoria,
  material: null,
  estampa: 'LISO' as Peca['estampa'],
  corNome,
  hex,
  colorAddSymbol,
  ...extra,
});

const PRETO = ['Preto', 'COLORADD_PRETO', '#1A1A1A'] as const;
const BRANCO = ['Branco', 'COLORADD_BRANCO', '#F2F2F2'] as const;
const VERDE = ['Verde', 'COLORADD_VERDE', '#3A7D44'] as const;
const AZUL_ESCURO = ['Azul Escuro', 'COLORADD_AZUL_ESCURO', '#1F3B6E'] as const;
const AZUL_CLARO = ['Azul Claro', 'COLORADD_AZUL_CLARO', '#8FB3E0'] as const;

/** 5 de cima e 5 de baixo (o mínimo do chat), mais calçados. */
function armario() {
  return [
    peca('CAMISETA', ...PRETO),
    peca('CAMISETA', ...VERDE),
    peca('CAMISA', ...AZUL_CLARO),
    peca('MOLETOM', ...BRANCO),
    peca('CAMISETA', ...VERDE),
    peca('CALCA', ...PRETO),
    peca('CALCA', ...VERDE),
    peca('SHORT', ...VERDE),
    peca('SAIA', ...VERDE),
    peca('CALCA', ...AZUL_ESCURO, { material: 'JEANS' }),
    peca('TENIS', ...BRANCO),
    peca('JAQUETA', ...PRETO),
  ];
}

const foto = (tipo: PecaFotografada['tipo'], cor: readonly [string, string, string]) => ({
  tipo,
  corNome: cor[0],
  colorAddSymbol: cor[1],
  hex: cor[2],
});

const papelDe = (id: string, pecas: ReturnType<typeof armario>) =>
  PAPEL_DA_CATEGORIA[pecas.find((p) => p.id === id)!.categoria];

describe('sugerirCombinacoes', () => {
  it('com poucas peças, pede para cadastrar mais', () => {
    const r = sugerirCombinacoes(armario().slice(0, 3), foto('CIMA', VERDE));
    assert.equal(r.status, 'POUCAS_PECAS');
  });

  it('nunca sugere o mesmo tipo da foto, e as duas são de tipos diferentes entre si', () => {
    const pecas = armario();
    const r = sugerirCombinacoes(pecas, foto('BAIXO', AZUL_CLARO));
    assert.equal(r.status, 'OK');
    if (r.status !== 'OK') return;
    assert.equal(r.sugestoes.length, 2);
    const papeis = r.sugestoes.map((s) => papelDe(s.pecaId, pecas));
    assert.ok(!papeis.includes('INFERIOR'), 'calça fotografada não ganha calça');
    assert.notEqual(papeis[0], papeis[1]);
  });

  it('duas cores fortes diferentes não aparecem (vermelho com verde)', () => {
    const pecas = armario();
    const vermelho = ['Vermelho', 'COLORADD_VERMELHO', '#B22222'] as const;
    const r = sugerirCombinacoes(pecas, foto('CIMA', vermelho));
    assert.equal(r.status, 'OK');
    if (r.status !== 'OK') return;
    for (const s of r.sugestoes) {
      assert.ok(!s.pecaId.includes('Verde'), `não deveria sugerir ${s.pecaId}`);
    }
  });

  it('tom sobre tom vem primeiro', () => {
    const r = sugerirCombinacoes(armario(), foto('CIMA', AZUL_CLARO), { aleatorio: () => 0 });
    assert.equal(r.status, 'OK');
    if (r.status !== 'OK') return;
    assert.match(r.sugestoes[0].pecaId, /CALCA-Azul Escuro/);
    assert.match(r.sugestoes[0].motivo, /tons de azul/);
  });

  it('o motivo cita a cor neutra', () => {
    const r = sugerirCombinacoes(armario(), foto('CIMA', VERDE));
    assert.equal(r.status, 'OK');
    if (r.status !== 'OK') return;
    assert.ok(r.sugestoes.some((s) => /combina com qualquer cor/.test(s.motivo)));
  });

  it('vestido só ganha calçado ou jaqueta', () => {
    const pecas = armario();
    const r = sugerirCombinacoes(pecas, foto('VESTIDO', VERDE));
    assert.equal(r.status, 'OK');
    if (r.status !== 'OK') return;
    for (const s of r.sugestoes) {
      assert.ok(['CALCADO', 'SOBREPOSICAO'].includes(papelDe(s.pecaId, pecas)));
    }
  });

  it('sem nada que combine, não mostra peças só por mostrar', () => {
    const coloridas = armario().filter((p) => p.corNome === 'Verde');
    const pecas = [
      ...coloridas,
      ...Array.from({ length: 5 }, () => peca('CAMISETA', ...VERDE)),
      ...Array.from({ length: 5 }, () => peca('CALCA', ...VERDE)),
    ];
    const vermelho = ['Vermelho', 'COLORADD_VERMELHO', '#B22222'] as const;
    assert.equal(sugerirCombinacoes(pecas, foto('CALCADO', vermelho)).status, 'SEM_COMBINACAO');
  });

  it('sorteia entre as que combinam bem: a mesma foto não mostra sempre a mesma dupla', () => {
    const pecas = [
      ...armario(),
      peca('CALCA', ...PRETO),
      peca('CALCA', ...PRETO),
      peca('TENIS', ...PRETO),
    ];
    const duplas = new Set<string>();
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const resultado = sugerirCombinacoes(pecas, foto('CIMA', VERDE), { aleatorio: () => r });
      if (resultado.status === 'OK') duplas.add(resultado.sugestoes.map((s) => s.pecaId).join('+'));
    }
    assert.ok(duplas.size > 1, `sempre a mesma dupla: ${[...duplas].join(', ')}`);
  });

  it('"Ver outras" não repete as peças já mostradas, e recomeça quando acabam', () => {
    const pecas = armario();
    const primeira = sugerirCombinacoes(pecas, foto('CIMA', VERDE), { aleatorio: () => 0 });
    assert.equal(primeira.status, 'OK');
    if (primeira.status !== 'OK') return;
    const vistas = primeira.sugestoes.map((s) => s.pecaId);

    const outras = sugerirCombinacoes(pecas, foto('CIMA', VERDE), { excluir: vistas });
    assert.equal(outras.status, 'OK');
    if (outras.status !== 'OK') return;
    for (const s of outras.sugestoes) assert.ok(!vistas.includes(s.pecaId), `repetiu ${s.pecaId}`);

    const todas = pecas.map((p) => p.id);
    const deNovo = sugerirCombinacoes(pecas, foto('CIMA', VERDE), { excluir: todas });
    assert.equal(deNovo.status, 'OK', 'sem peças novas, volta a sortear entre todas');
  });
});
