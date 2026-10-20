import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Peca } from '@prisma/client';

import { ClimaService, Previsao } from '../../src/looks/clima';
import {
  PERGUNTA_CLIMA,
  PERGUNTA_OCASIAO,
  PERGUNTA_SALVAR,
  RESPOSTA_SALVO,
} from '../../src/looks/conversa';
import { Intencao } from '../../src/looks/interpretar-pedido';
import { LooksSalvosService } from '../../src/looks/looks-salvos.service';
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
    imagemMiniS3Key: null,
    categoria,
    estilo: 'CASUAL',
    estampa: 'LISO',
    ocasioes: ['DIA_A_DIA'],
    aquecimento: 'MEDIO',
    material: null,
    manga: null,
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
    trocar: [],
    ...extras,
  };
}

/** Serviço com banco, S3 e OpenAI falsos. */
function criarServico(
  pecas: Peca[],
  resposta: Intencao | null,
  opcoes: { semUsuario?: boolean; semChave?: boolean; previsao?: Previsao | null } = {},
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

  const consultasClima: number[] = [];
  const clima = {
    previsao: async (_local: unknown, dias: number) => {
      consultasClima.push(dias);
      return opcoes.previsao ?? null;
    },
  } as unknown as ClimaService;
  const salvos: string[][] = [];
  const dadosSalvos: { nome?: string; ocasiao?: string }[] = [];
  const looksSalvos = {
    salvar: async (_sub: string, dto: { pecaIds: string[]; nome?: string; ocasiao?: string }) => {
      salvos.push(dto.pecaIds);
      dadosSalvos.push({ nome: dto.nome, ocasiao: dto.ocasiao });
      return { id: 'look-salvo-1' };
    },
  } as unknown as LooksSalvosService;

  class LooksServiceDeTeste extends LooksService {
    chamadasIA = 0;
    consultasClima = consultasClima;
    salvos = salvos;
    dadosSalvos = dadosSalvos;
    protected async interpretar(mensagem: string, historico: never[]) {
      if (!resposta) return super.interpretar(mensagem, historico);
      this.chamadasIA++;
      return resposta;
    }
  }

  return new LooksServiceDeTeste(prisma, s3, config, clima, looksSalvos);
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

  const LOCAL = { latitude: -23.55, longitude: -46.63 };
  const zyra = (texto: string) => ({ autor: 'zyra' as const, texto });
  const lookNaTela = armarioCompleto.slice(0, 2).map((p) => p.id);

  it('"sim" depois de "Quer salvar esse look?" salva o look da tela sem chamar a IA', async () => {
    const servico = criarServico(armarioCompleto, intencao());
    const r = await servico.sugerir('sub', {
      mensagem: 'Sim!',
      historico: [zyra(`Camiseta Branca + Calça Azul\n\n${PERGUNTA_SALVAR}`)],
      pecasAnteriores: lookNaTela,
    });
    assert.deepEqual(r, { tipo: 'SALVO', mensagem: RESPOSTA_SALVO, lookId: 'look-salvo-1' });
    assert.deepEqual(servico.salvos, [lookNaTela]);
    assert.equal(servico.chamadasIA, 0);
  });

  it('salva pelo chat com o mesmo nome e ocasião do popup de saída', async () => {
    const servico = criarServico(armarioCompleto, intencao());
    await servico.sugerir('sub', {
      mensagem: 'sim',
      historico: [zyra(PERGUNTA_SALVAR)],
      pecasAnteriores: lookNaTela,
      lookMostrado: { nome: 'Casamento à noite', ocasiao: 'FESTA' },
    });
    assert.deepEqual(servico.dadosSalvos, [{ nome: 'Casamento à noite', ocasiao: 'FESTA' }]);
  });

  it('o look volta com a ocasião entendida, para o app salvar depois', async () => {
    const servico = criarServico(armarioCompleto, intencao({ ocasiao: 'TRABALHO' }));
    const r = await servico.sugerir('sub', { mensagem: 'look pro trabalho' });
    assert.equal(r.tipo === 'LOOK' && r.ocasiao, 'TRABALHO');
  });

  it('"não" depois de "Quer salvar esse look?" não salva nem chama a IA', async () => {
    const servico = criarServico(armarioCompleto, intencao());
    const r = await servico.sugerir('sub', {
      mensagem: 'não',
      historico: [zyra(PERGUNTA_SALVAR)],
      pecasAnteriores: lookNaTela,
    });
    assert.equal(r.tipo, 'CONVERSA');
    assert.equal(servico.salvos.length, 0);
    assert.equal(servico.chamadasIA, 0);
  });

  it('"sim" fora da pergunta de salvar vai para a IA', async () => {
    const servico = criarServico(armarioCompleto, intencao({ ocasiao: 'TRABALHO' }));
    await servico.sugerir('sub', { mensagem: 'sim', historico: [zyra(PERGUNTA_OCASIAO)] });
    assert.equal(servico.chamadasIA, 1);
    assert.equal(servico.salvos.length, 0);
  });

  it('pedido de salvar com as próprias palavras também salva, sem a IA', async () => {
    const servico = criarServico(armarioCompleto, intencao());
    const r = await servico.sugerir('sub', {
      mensagem: 'gostei, guarda esse pra mim',
      pecasAnteriores: lookNaTela,
    });
    assert.equal(r.tipo, 'SALVO');
    assert.equal(servico.chamadasIA, 0);
  });

  it('sem look na tela, não tem o que salvar', async () => {
    const servico = criarServico(armarioCompleto, intencao());
    const r = await servico.sugerir('sub', { mensagem: 'salva o look' });
    assert.equal(r.tipo, 'CONVERSA');
    assert.equal(servico.salvos.length, 0);
  });

  it('pergunta a ocasião, depois o clima, depois oferece salvar', async () => {
    const semNada = criarServico(armarioCompleto, intencao());
    const r1 = await semNada.sugerir('sub', { mensagem: 'monta um look' });
    assert.equal(r1.tipo === 'LOOK' && r1.pergunta, PERGUNTA_OCASIAO);

    const r2 = await semNada.sugerir('sub', {
      mensagem: 'outro',
      historico: [zyra(`look\n\n${PERGUNTA_OCASIAO}`)],
    });
    assert.equal(r2.tipo === 'LOOK' && r2.pergunta, PERGUNTA_CLIMA);

    const completo = criarServico(
      armarioCompleto,
      intencao({ ocasiao: 'DIA_A_DIA', aquecimento: 'MEDIO' }),
    );
    const r3 = await completo.sugerir('sub', { mensagem: 'faculdade, clima ameno' });
    assert.ok(r3.tipo === 'LOOK' && r3.pergunta.endsWith(PERGUNTA_SALVAR));
    assert.match(r3.tipo === 'LOOK' ? r3.pergunta : '', /^(O que achou|Gostou|Ficou bom)\?/);
  });

  it('usa a previsão do dia do evento quando o usuário não fala do clima', async () => {
    const servico = criarServico(armarioCompleto, intencao({ ocasiao: 'TRABALHO' }), {
      previsao: { diasAPartirDeHoje: 1, minima: 10, maxima: 18, chanceDeChuva: 80 },
    });
    const r = await servico.sugerir('sub', { mensagem: 'trabalho amanhã', localizacao: LOCAL });
    assert.deepEqual(servico.consultasClima, [1]);
    assert.equal(r.tipo, 'LOOK');
    if (r.tipo !== 'LOOK') return;
    assert.equal(r.clima, 'Pela previsão, amanhã vai ser um dia frio (10 a 18 °C) e pode chover.');
    assert.ok(r.pergunta.endsWith(PERGUNTA_SALVAR), 'com a previsão, não pergunta do clima');
  });

  it('na troca de peça, diz só o que mudou', async () => {
    const [camiseta, , , , , calca] = armarioCompleto;
    const tenis = armarioCompleto.at(-1)!;
    const servico = criarServico(armarioCompleto, intencao({ trocar: ['CIMA'] }));
    const r = await servico.sugerir('sub', {
      mensagem: 'troca a camiseta',
      pecasAnteriores: [camiseta.id, calca.id, tenis.id],
    });
    assert.equal(r.tipo, 'LOOK');
    assert.match(r.mensagem, /^Troquei por Camiseta \S+\.$/);
    assert.doesNotMatch(r.mensagem, /Calça|Tênis/);
  });

  it('não repete a previsão que já apareceu na conversa', async () => {
    const servico = criarServico(armarioCompleto, intencao({ ocasiao: 'TRABALHO' }), {
      previsao: { diasAPartirDeHoje: 0, minima: 16, maxima: 23, chanceDeChuva: 0 },
    });
    const r1 = await servico.sugerir('sub', { mensagem: 'trabalho', localizacao: LOCAL });
    const anterior = r1.tipo === 'LOOK' ? `${r1.mensagem}\n\n${r1.clima}` : '';
    const r2 = await servico.sugerir('sub', {
      mensagem: 'outro',
      historico: [zyra(anterior)],
      localizacao: LOCAL,
    });
    assert.ok(r1.tipo === 'LOOK' && r1.clima);
    assert.equal(r2.tipo === 'LOOK' && r2.clima, null);
  });

  it('o clima que o usuário disse vale mais que a previsão', async () => {
    const servico = criarServico(armarioCompleto, intencao({ aquecimento: 'LEVE' }), {
      previsao: { diasAPartirDeHoje: 0, minima: 5, maxima: 10, chanceDeChuva: 0 },
    });
    const r = await servico.sugerir('sub', { mensagem: 'tá calor', localizacao: LOCAL });
    assert.deepEqual(servico.consultasClima, []);
    assert.equal(r.tipo === 'LOOK' && r.clima, null);
  });

  it('sem localização, não consulta a previsão', async () => {
    const servico = criarServico(armarioCompleto, intencao(), {
      previsao: { diasAPartirDeHoje: 0, minima: 5, maxima: 10, chanceDeChuva: 0 },
    });
    await servico.sugerir('sub', { mensagem: 'monta um look' });
    assert.deepEqual(servico.consultasClima, []);
  });

  it('acrescentar uma jaqueta mantém o look e diz "Acrescentei"; a cor copiada da tela sai', async () => {
    const jaqueta = peca('JAQUETA', 'Vermelho', 'COLORADD_VERMELHO', '#B22222');
    const pecas = [...armarioCompleto, jaqueta];
    const naTela = [armarioCompleto[0].id, armarioCompleto[5].id, armarioCompleto[10].id];
    // A IA copiou o branco da camiseta da tela para a jaqueta pedida.
    const servico = criarServico(
      pecas,
      intencao({
        trocar: ['CAMADA'],
        incluir: [{ categoria: 'JAQUETA', cor: { familia: 'BRANCO', tom: null }, material: null }],
      }),
    );
    const r = await servico.sugerir('sub', {
      mensagem: 'coloca uma jaqueta por cima',
      pecasAnteriores: naTela,
    });
    assert.equal(r.tipo, 'LOOK');
    if (r.tipo !== 'LOOK') return;
    for (const id of naTela)
      assert.ok(
        r.pecas.some((p) => p.id === id),
        'nenhuma peça sai',
      );
    assert.ok(r.pecas.some((p) => p.id === jaqueta.id));
    assert.match(r.mensagem, /^Acrescentei Jaqueta Vermelha\./);
  });

  it('"quero uma blusa também" com look na tela vira acréscimo de camada', async () => {
    const jaqueta = peca('JAQUETA', 'Preto', 'COLORADD_PRETO', '#1A1A1A');
    const naTela = [armarioCompleto[0].id, armarioCompleto[5].id, armarioCompleto[10].id];
    const servico = criarServico(
      [...armarioCompleto, jaqueta],
      intencao({ incluir: [{ categoria: 'BLUSA', cor: null, material: null }] }),
    );
    const r = await servico.sugerir('sub', {
      mensagem: 'quero uma blusa também',
      pecasAnteriores: naTela,
    });
    assert.equal(r.tipo === 'LOOK' && r.pecas.length, 4);
  });
});
