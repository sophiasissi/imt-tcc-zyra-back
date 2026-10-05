import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Peca } from '@prisma/client';

import { Intencao } from '../../src/looks/interpretar-pedido';
import { LooksService } from '../../src/looks/looks.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { S3Service } from '../../src/storage/s3.service';

let proximoId = 0;

function peca(
  categoria: Peca['categoria'],
  corNome: string,
  colorAddSymbol: string,
  hex: string,
): Peca {
  return {
    id: `00000000-0000-4000-8000-${String(++proximoId).padStart(12, '0')}`,
    usuarioId: 'usuario-1',
    imagemS3Key: `usuarios/usuario-1/roupas/${proximoId}.jpg`,
    categoria,
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: null,
    corNome,
    hex,
    colorAddSymbol,
    corSecundariaNome: null,
    hexSecundario: null,
    colorAddSymbolSecundario: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };
}

const armarioCompleto: Peca[] = [
  ...['Branco', 'Preto', 'Cinza', 'Branco', 'Preto'].map((nome) =>
    peca(
      'CAMISETA',
      nome,
      `COLORADD_${nome.toUpperCase()}`,
      nome === 'Branco' ? '#F2F2F2' : nome === 'Preto' ? '#1A1A1A' : '#808080',
    ),
  ),
  ...Array.from({ length: 5 }, () => peca('CALCA', 'Azul', 'COLORADD_AZUL', '#3B5B85')),
  peca('TENIS', 'Branco', 'COLORADD_BRANCO', '#F5F5F5'),
];

function intencao(extras: Partial<Intencao> = {}): Intencao {
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
    ...extras,
  };
}

/** Serviço com banco, S3 e OpenAI falsos. */
function criarServico(
  pecas: Peca[],
  resposta: Intencao | null,
  opcoes: { semUsuario?: boolean; semChave?: boolean } = {},
) {
  const prisma = {
    usuario: { findUnique: async () => (opcoes.semUsuario ? null : { id: 'usuario-1' }) },
    peca: { findMany: async () => pecas },
  } as unknown as PrismaService;
  const s3 = {
    getReadUrl: async (key: string) => `https://s3.exemplo/${key}`,
  } as unknown as S3Service;
  const config = {
    get: () => (opcoes.semChave ? undefined : 'sk-teste'),
  } as unknown as ConfigService;

  class LooksServiceDeTeste extends LooksService {
    chamadasIA = 0;
    protected async interpretar(mensagem: string, historico: never[]) {
      if (!resposta) return super.interpretar(mensagem, historico);
      this.chamadasIA++;
      return resposta;
    }
  }

  return new LooksServiceDeTeste(prisma, s3, config);
}

describe('LooksService.sugerir', () => {
  it('com poucas peças, responde sem chamar a IA', async () => {
    const servico = criarServico(armarioCompleto.slice(0, 3), intencao());
    const r = await servico.sugerir('sub', { mensagem: 'look pra trabalhar' });
    assert.equal(r.tipo, 'POUCAS_PECAS');
    assert.match(r.mensagem, /Faltam 2 de cima e 5 de baixo/);
    assert.equal(servico.chamadasIA, 0);
  });

  it('devolve a pergunta quando a IA pede esclarecimento', async () => {
    const servico = criarServico(
      armarioCompleto,
      intencao({ tipo: 'ESCLARECER', pergunta: 'Que evento?' }),
    );
    const r = await servico.sugerir('sub', { mensagem: 'tenho um evento' });
    assert.deepEqual(r, { tipo: 'PERGUNTA', mensagem: 'Que evento?' });
  });

  it('responde com texto fixo quando o pedido está fora de escopo', async () => {
    const servico = criarServico(armarioCompleto, intencao({ tipo: 'FORA_DE_ESCOPO' }));
    const r = await servico.sugerir('sub', { mensagem: 'me conta uma piada' });
    assert.equal(r.tipo, 'FORA_DE_ESCOPO');
    assert.match(r.mensagem, /só consigo montar looks/);
  });

  it('devolve o look com as peças, a foto e o papel de cada uma', async () => {
    const servico = criarServico(armarioCompleto, intencao());
    const r = await servico.sugerir('sub', { mensagem: 'monta um look' });
    assert.equal(r.tipo, 'LOOK');
    if (r.tipo !== 'LOOK') return;
    assert.equal(r.pecas.length, 3);
    for (const p of r.pecas) {
      assert.ok(p.imagemUrl.startsWith('https://s3.exemplo/'));
      assert.ok(p.papel);
      assert.ok(!('imagemS3Key' in p), 'a chave do S3 não pode vazar para o app');
    }
    assert.match(r.mensagem, /Camiseta .* \+ Calça Azul \+ Tênis Branco/);
  });

  it('recusa usuário sem cadastro', async () => {
    const servico = criarServico(armarioCompleto, intencao(), { semUsuario: true });
    await assert.rejects(servico.sugerir('sub', { mensagem: 'oi' }), NotFoundException);
  });

  it('sem chave da OpenAI, só o chat fica indisponível', async () => {
    const servico = criarServico(armarioCompleto, null, { semChave: true });
    await assert.rejects(
      servico.sugerir('sub', { mensagem: 'monta um look' }),
      ServiceUnavailableException,
    );
  });
});
