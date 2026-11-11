import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, ResultadoMotor } from '../../src/looks/motor';

// Testes da Sophia em 05/11/2026, num dia de 21 a 26 °C: o look de trabalho
// veio com camisa de manga longa e jaqueta, e o de passear no shopping, com
// salto.

let proximoId = 0;

function peca(categoria: PecaMotor['categoria'], extras: Partial<PecaMotor> = {}): PecaMotor {
  return {
    id: `c${++proximoId}`,
    categoria,
    corNome: 'Preto',
    colorAddSymbol: 'COLORADD_PRETO',
    hex: '#151515',
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA', 'TRABALHO'],
    aquecimento: 'MEDIO',
    material: null,
    manga: null,
    decotada: null,
    cano: null,
    salto: null,
    curta: null,
    ...extras,
  };
}

const camisaMangaLonga = peca('CAMISA', {
  estilo: 'SOCIAL',
  material: 'ALFAIATARIA',
  manga: 'LONGA',
});
const camisaMangaCurta = peca('CAMISA', { estilo: 'SOCIAL', material: 'LINHO', manga: 'CURTA' });
const blusaMangaCurta = peca('BLUSA', { estilo: 'ELEGANTE', material: 'VISCOSE', manga: 'CURTA' });
const jaqueta = peca('JAQUETA', { material: 'COURO', manga: 'LONGA' });
const blazer = peca('BLAZER', { estilo: 'SOCIAL', material: 'ALFAIATARIA', manga: 'LONGA' });
const scarpin = peca('SAPATO', {
  estilo: 'ELEGANTE',
  material: 'COURO',
  ocasioes: ['TRABALHO', 'FESTA', 'DIA_A_DIA'],
});
const sandaliaDeSalto = peca('SANDALIA', {
  estilo: 'ELEGANTE',
  salto: true,
  ocasioes: ['DIA_A_DIA', 'FESTA'],
});
const tenis = peca('TENIS', {
  corNome: 'Branco',
  colorAddSymbol: 'COLORADD_BRANCO',
  hex: '#F2F2F2',
});
const rasteira = peca('SANDALIA', { salto: false, ocasioes: ['DIA_A_DIA', 'PRAIA'] });

const armario = [
  camisaMangaLonga,
  camisaMangaCurta,
  blusaMangaCurta,
  peca('CAMISETA', { material: 'MALHA', manga: 'CURTA' }),
  peca('CAMISETA', { material: 'MALHA', manga: 'LONGA' }),
  ...Array.from({ length: 5 }, () => peca('CALCA', { estilo: 'SOCIAL', material: 'ALFAIATARIA' })),
  jaqueta,
  blazer,
  scarpin,
  sandaliaDeSalto,
  tenis,
  rasteira,
];

function intencao(extras: Partial<Intencao>): Intencao {
  return {
    tipo: 'LOOK',
    ocasiao: null,
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

function looks(pedido: Intencao, opcoes = {}) {
  return Array.from({ length: 10 }, (_, i) => {
    const r: ResultadoMotor = montarLook(armario, pedido, { ...opcoes, aleatorio: () => i / 10 });
    assert.equal(r.status, 'LOOK', JSON.stringify(r));
    return r.status === 'LOOK' ? r.pecas.map((p) => p.id) : [];
  });
}

describe('calor (21 a 26 °C): trabalho', () => {
  const noCalor = intencao({ ocasiao: 'TRABALHO', aquecimento: 'LEVE' });

  it('sem jaqueta nem blazer, e sem manga longa se houver manga curta', () => {
    for (const look of looks(noCalor)) {
      assert.ok(!look.includes(jaqueta.id) && !look.includes(blazer.id), 'camada no calor');
      assert.ok(!look.includes(camisaMangaLonga.id), 'manga longa no calor');
    }
  });

  it('pedida pelo nome, a jaqueta entra', () => {
    const pedido = {
      ...noCalor,
      incluir: [{ categoria: 'JAQUETA' as const, cor: null, material: null }],
    };
    for (const look of looks(pedido)) assert.ok(look.includes(jaqueta.id));
  });

  it('dia ameno de manhã fria: a camada leve pode entrar', () => {
    const ameno = intencao({ ocasiao: 'TRABALHO', aquecimento: 'MEDIO' });
    const comCamada = looks(ameno, { camadaLeve: true }).filter(
      (look) => look.includes(jaqueta.id) || look.includes(blazer.id),
    );
    assert.ok(comCamada.length > 0);
    const semCamada = looks(ameno).filter(
      (look) => look.includes(jaqueta.id) || look.includes(blazer.id),
    );
    assert.equal(semCamada.length, 0, 'ameno sem manhã fria não pede camada');
  });
});

describe('passeio no shopping (dia a dia)', () => {
  const passeio = intencao({ ocasiao: 'DIA_A_DIA' });

  it('sem salto: tênis ou rasteira', () => {
    for (const look of looks(passeio)) {
      assert.ok(
        !look.includes(scarpin.id) && !look.includes(sandaliaDeSalto.id),
        'salto no passeio',
      );
      assert.ok(look.includes(tenis.id) || look.includes(rasteira.id));
    }
  });

  it('no encontro (date) e pedindo salto, o salto volta a valer', () => {
    const usados = new Set(looks(passeio, { encontro: true }).flat());
    const pedindo = new Set(looks(passeio, { pediuSalto: true }).flat());
    assert.ok(usados.has(scarpin.id) || usados.has(sandaliaDeSalto.id));
    assert.ok(pedindo.has(scarpin.id) || pedindo.has(sandaliaDeSalto.id));
  });
});
