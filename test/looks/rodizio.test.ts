import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { montarLook, PecaMotor, penalidadeDeUso } from '../../src/looks/motor';

// Rodízio entre conversas (pedido da Sophia, 05/11/2026): "quando eu peço um
// look para tal evento ele sempre me mostra as mesmas roupas".

let proximoId = 0;

function peca(categoria: PecaMotor['categoria'], extras: Partial<PecaMotor> = {}): PecaMotor {
  return {
    id: `u${++proximoId}`,
    categoria,
    corNome: 'Preto',
    colorAddSymbol: 'COLORADD_PRETO',
    hex: '#151515',
    estilo: 'SOCIAL',
    estampa: 'LISO',
    ocasioes: ['TRABALHO'],
    aquecimento: 'MEDIO',
    material: 'ALFAIATARIA',
    manga: null,
    decotada: null,
    cano: null,
    salto: null,
    curta: null,
    ...extras,
  };
}

const intencao: Intencao = {
  tipo: 'LOOK',
  ocasiao: 'TRABALHO',
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
};

// Cinco camisas iguais para o motor, e o resto do armário fixo.
const camisas = Array.from({ length: 5 }, () => peca('CAMISA', { manga: 'LONGA' }));
const armario = [
  ...camisas,
  ...Array.from({ length: 5 }, () => peca('CALCA')),
  peca('SAPATO', { material: 'COURO' }),
];

const AGORA = new Date('2026-11-05T12:00:00Z');
const horasAntes = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000);

describe('rodízio de peças entre conversas', () => {
  it('a penalidade é maior para a peça usada há pouco e cai pela metade a cada 3 dias', () => {
    assert.equal(penalidadeDeUso(undefined, AGORA), 0);
    assert.equal(penalidadeDeUso(AGORA, AGORA), 3.5);
    assert.equal(penalidadeDeUso(horasAntes(72), AGORA), 1.75);
    assert.ok(penalidadeDeUso(horasAntes(24 * 14), AGORA) < 0.2);
  });

  it('entre peças equivalentes, a usada há pouco não volta', () => {
    // Quatro camisas usadas hoje; só uma está livre há uma semana.
    const ultimoUso = new Map(camisas.slice(0, 4).map((c) => [c.id, horasAntes(1)] as const));
    const livre = camisas[4];
    for (let i = 0; i < 10; i++) {
      const r = montarLook(armario, intencao, { ultimoUso, agora: AGORA, aleatorio: () => i / 10 });
      assert.equal(r.status, 'LOOK');
      if (r.status === 'LOOK') assert.ok(r.pecas.some((p) => p.id === livre.id));
    }
  });

  it('pedidos seguidos passam por todas as camisas antes de repetir', () => {
    const ultimoUso = new Map<string, Date>();
    const usadas: string[] = [];
    for (let pedido = 0; pedido < camisas.length; pedido++) {
      const agora = new Date(AGORA.getTime() + pedido * 60_000);
      const r = montarLook(armario, intencao, { ultimoUso, agora });
      assert.equal(r.status, 'LOOK');
      if (r.status !== 'LOOK') return;
      for (const { id } of r.pecas) ultimoUso.set(id, agora);
      usadas.push(r.pecas.find((p) => p.papel === 'SUPERIOR')!.id);
    }
    assert.equal(new Set(usadas).size, camisas.length, JSON.stringify(usadas));
  });
});
