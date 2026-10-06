import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { NotFoundException } from '@nestjs/common';
import { Peca } from '@prisma/client';

import { LooksSalvosService } from '../../src/looks/looks-salvos.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { S3Service } from '../../src/storage/s3.service';

type LookFake = {
  id: string;
  usuarioId: string;
  nome: string | null;
  ocasiao: string | null;
  criadoEm: Date;
  pecas: { pecaId: string; ordem: number }[];
};

function peca(id: string, usuarioId: string, categoria: Peca['categoria']): Peca {
  return {
    id,
    usuarioId,
    imagemS3Key: `usuarios/${usuarioId}/roupas/${id}.jpg`,
    categoria,
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: null,
    corNome: 'Preto',
    hex: '#1A1A1A',
    colorAddSymbol: 'COLORADD_PRETO',
    corSecundariaNome: null,
    hexSecundario: null,
    colorAddSymbolSecundario: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };
}

/** Banco em memória com só o que o serviço usa. */
function criarBanco() {
  const usuarios = [
    { id: 'u1', cognitoSub: 'sub-1' },
    { id: 'u2', cognitoSub: 'sub-2' },
  ];
  const pecas: Peca[] = [
    peca('11111111-1111-4111-8111-000000000001', 'u1', 'TENIS'),
    peca('11111111-1111-4111-8111-000000000002', 'u1', 'CALCA'),
    peca('11111111-1111-4111-8111-000000000003', 'u1', 'CAMISA'),
    peca('22222222-2222-4222-8222-000000000001', 'u2', 'CAMISETA'),
  ];
  const looks: LookFake[] = [];
  let proximo = 0;

  const comPecas = (look: LookFake) => ({
    ...look,
    pecas: look.pecas
      .map((lp) => ({ ...lp, peca: pecas.find((p) => p.id === lp.pecaId) }))
      .filter((lp) => lp.peca),
  });

  const prisma = {
    usuario: {
      findUnique: async ({ where }: { where: { cognitoSub: string } }) =>
        usuarios.find((u) => u.cognitoSub === where.cognitoSub) ?? null,
    },
    peca: {
      findMany: async ({ where }: { where: { id: { in: string[] }; usuarioId: string } }) =>
        pecas.filter((p) => where.id.in.includes(p.id) && p.usuarioId === where.usuarioId),
    },
    look: {
      findMany: async ({ where }: { where: { usuarioId: string } }) =>
        looks
          .filter((l) => l.usuarioId === where.usuarioId)
          .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
          .map(comPecas),
      create: async ({
        data,
      }: {
        data: Omit<LookFake, 'id' | 'criadoEm' | 'pecas'> & {
          pecas: { create: LookFake['pecas'] };
        };
      }) => {
        const look: LookFake = {
          id: `look-${++proximo}`,
          usuarioId: data.usuarioId,
          nome: data.nome,
          ocasiao: data.ocasiao,
          criadoEm: new Date(Date.now() + proximo),
          pecas: data.pecas.create,
        };
        looks.push(look);
        return comPecas(look);
      },
      deleteMany: async ({ where }: { where: { id: string; usuarioId: string } }) => {
        const antes = looks.length;
        const restantes = looks.filter(
          (l) => !(l.id === where.id && l.usuarioId === where.usuarioId),
        );
        looks.splice(0, looks.length, ...restantes);
        return { count: antes - restantes.length };
      },
    },
  };

  const s3 = { getReadUrl: async (key: string) => `https://s3.exemplo/${key}` };
  const servico = new LooksSalvosService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Service,
  );

  return { servico, pecas, looks };
}

const [TENIS, CALCA, CAMISA] = [
  '11111111-1111-4111-8111-000000000001',
  '11111111-1111-4111-8111-000000000002',
  '11111111-1111-4111-8111-000000000003',
];
const PECA_DE_OUTRA_PESSOA = '22222222-2222-4222-8222-000000000001';

describe('LooksSalvosService', () => {
  let banco: ReturnType<typeof criarBanco>;
  beforeEach(() => {
    banco = criarBanco();
  });

  it('salva o look com as peças na ordem cima, baixo, calçado', async () => {
    const look = await banco.servico.salvar('sub-1', {
      pecaIds: [TENIS, CALCA, CAMISA],
      nome: 'Jantar',
      ocasiao: 'FESTA',
    });
    assert.deepEqual(
      look.pecas.map((p) => p.papel),
      ['SUPERIOR', 'INFERIOR', 'CALCADO'],
    );
    assert.equal(look.nome, 'Jantar');
    assert.ok(look.pecas.every((p) => p.imagemUrl.startsWith('https://s3.exemplo/')));
    assert.ok(
      look.pecas.every((p) => !('imagemS3Key' in p)),
      'a chave do S3 não vai para o app',
    );
  });

  it('salvar as mesmas peças de novo devolve o mesmo look', async () => {
    const primeiro = await banco.servico.salvar('sub-1', { pecaIds: [TENIS, CALCA, CAMISA] });
    const segundo = await banco.servico.salvar('sub-1', { pecaIds: [CAMISA, TENIS, CALCA] });
    assert.equal(segundo.id, primeiro.id);
    assert.equal(banco.looks.length, 1);
  });

  it('recusa peça de outra pessoa', async () => {
    await assert.rejects(
      banco.servico.salvar('sub-1', { pecaIds: [CAMISA, PECA_DE_OUTRA_PESSOA] }),
      NotFoundException,
    );
  });

  it('lista só os looks do usuário, do mais recente para o mais antigo', async () => {
    await banco.servico.salvar('sub-1', { pecaIds: [CAMISA, CALCA], nome: 'primeiro' });
    await banco.servico.salvar('sub-1', { pecaIds: [CAMISA, CALCA, TENIS], nome: 'segundo' });
    await banco.servico.salvar('sub-2', { pecaIds: [PECA_DE_OUTRA_PESSOA] });
    const looks = await banco.servico.listar('sub-1');
    assert.deepEqual(
      looks.map((l) => l.nome),
      ['segundo', 'primeiro'],
    );
  });

  it('não apaga o look de outra pessoa', async () => {
    const look = await banco.servico.salvar('sub-1', { pecaIds: [CAMISA, CALCA] });
    await assert.rejects(banco.servico.remover('sub-2', look.id), NotFoundException);
    assert.equal(banco.looks.length, 1);
    assert.equal((await banco.servico.remover('sub-1', look.id)).message, 'Look removido.');
    assert.equal(banco.looks.length, 0);
    assert.equal(banco.pecas.length, 4, 'apagar o look não apaga nenhuma peça');
  });
});
