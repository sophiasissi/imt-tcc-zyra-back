import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigService } from '@nestjs/config';
import { Peca } from '@prisma/client';

import { ClimaService } from '../../src/looks/clima';
import { pecasParaRemover } from '../../src/looks/conversa';
import { LooksSalvosService } from '../../src/looks/looks-salvos.service';
import { LooksService } from '../../src/looks/looks.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { S3Service } from '../../src/storage/s3.service';

// Teste da Sophia em 10/11/2026: "remove a jaqueta" trocou a jaqueta por
// outra camisa. Remover é tirar, sem nada no lugar.

let proximoId = 0;

function peca(categoria: Peca['categoria'], extras: Partial<Peca> = {}): Peca {
  return {
    id: `r${++proximoId}`,
    usuarioId: 'usuario-1',
    imagemS3Key: `pecas/r${proximoId}.jpg`,
    imagemMiniS3Key: null,
    categoria,
    manga: null,
    cano: null,
    sugeridaEm: null,
    salto: null,
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: null,
    decotada: null,
    curta: null,
    alfaiataria: null,
    colarinho: null,
    casacoPesado: null,
    corNome: 'Preto',
    hex: '#151515',
    colorAddSymbol: 'COLORADD_PRETO',
    corSecundariaNome: null,
    hexSecundario: null,
    colorAddSymbolSecundario: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...extras,
  };
}

const camisa = peca('CAMISA');
const jaqueta = peca('JAQUETA', { material: 'COURO' });
const calca = peca('CALCA', { material: 'JEANS' });
const tenis = peca('TENIS');
const armario = [
  camisa,
  jaqueta,
  calca,
  tenis,
  ...Array.from({ length: 5 }, () => peca('CAMISA')),
  ...Array.from({ length: 5 }, () => peca('CALCA')),
];
const naTela = [camisa.id, jaqueta.id, calca.id, tenis.id];

function servico() {
  const prisma = {
    usuario: { findUnique: async () => ({ id: 'usuario-1' }) },
    peca: { findMany: async () => armario },
    $executeRaw: async () => 1,
  } as unknown as PrismaService;
  const s3 = {
    getReadUrl: async (key: string) => `https://s3.exemplo/${key}`,
  } as unknown as S3Service;
  const config = { get: () => 'sk-teste' } as unknown as ConfigService;

  class SemIA extends LooksService {
    chamadasIA = 0;
    protected async interpretar(): Promise<never> {
      this.chamadasIA++;
      throw new Error('remover não pode chamar a IA');
    }
  }
  return new SemIA(prisma, s3, config, {} as ClimaService, {} as LooksSalvosService);
}

describe('pedido de remover uma peça', () => {
  it('reconhece "tira", "remove", "sem" e "não quero"', () => {
    assert.deepEqual(pecasParaRemover('remove a jaqueta'), ['JAQUETA']);
    assert.deepEqual(pecasParaRemover('tira o tênis'), ['TENIS']);
    assert.deepEqual(pecasParaRemover('não quero a jaqueta'), ['JAQUETA']);
    assert.deepEqual(pecasParaRemover('pode tirar o casaco?'), ['JAQUETA', 'MOLETOM']);
  });

  it('com troca ou acréscimo junto, não é só remover', () => {
    assert.equal(pecasParaRemover('tira a jaqueta e põe um blazer'), null);
    assert.equal(pecasParaRemover('troca a jaqueta'), null);
    assert.equal(pecasParaRemover('quero outra jaqueta'), null);
    assert.equal(pecasParaRemover('look pra trabalhar'), null);
  });

  it('tira a jaqueta do look da tela e não põe nada no lugar', async () => {
    const s = servico();
    const r = await s.sugerir('sub', { mensagem: 'remove a jaqueta', pecasAnteriores: naTela });
    assert.equal(r.tipo, 'LOOK');
    if (r.tipo !== 'LOOK') return;
    assert.deepEqual(
      r.pecas.map((p) => p.id),
      [camisa.id, calca.id, tenis.id],
    );
    assert.equal(r.mensagem, 'Pronto, tirei a jaqueta de couro do look.');
    assert.equal(s.chamadasIA, 0);
  });

  it('o calçado também pode sair', async () => {
    const r = await servico().sugerir('sub', { mensagem: 'tira o tênis', pecasAnteriores: naTela });
    assert.equal(r.tipo, 'LOOK');
    if (r.tipo === 'LOOK') assert.ok(!r.pecas.some((p) => p.id === tenis.id));
  });

  it('a única peça de baixo não sai sozinha: a Zyra explica e não troca', async () => {
    const r = await servico().sugerir('sub', { mensagem: 'tira a calça', pecasAnteriores: naTela });
    assert.equal(r.tipo, 'CONVERSA');
    assert.equal(
      r.mensagem,
      'Sem a calça jeans, o look fica incompleto. Se quiser, eu troco por outra peça: é só pedir "troca a calça jeans".',
    );
  });

  it('sem look na tela, "sem jaqueta" segue para a IA (vira restrição do look novo)', async () => {
    const s = servico();
    await assert.rejects(s.sugerir('sub', { mensagem: 'look sem a jaqueta' }));
    assert.equal(s.chamadasIA, 1);
  });
});
