import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Categoria, Ocasiao, Peca } from '@prisma/client';
import OpenAI from 'openai';

import { FotosDaPeca, fotosDaPeca } from '../pecas/fotos-da-peca';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import {
  aquecimentoDaPrevisao,
  ClimaService,
  descreverPrevisao,
  DIAS_DE_PREVISAO,
  hojeNoBrasil,
  Localizacao,
} from './clima';
import {
  alternativasDoPedido,
  entenderRespostaCurta,
  falaDeCor,
  falaDeEncontro,
  pedeParaAcrescentar,
  perguntaDoLook,
  RESPOSTA_NAO_SALVAR,
  RESPOSTA_SALVO,
  RESPOSTA_SEM_LOOK_PARA_SALVAR,
} from './conversa';
import { lerSimbolo } from './cor';
import { diaDaConversa, diasAte } from './dia-do-evento';
import { SugerirLookDto } from './dto/sugerir-look.dto';
import { Intencao, interpretarPedido, MensagemHistorico } from './interpretar-pedido';
import { LooksSalvosService } from './looks-salvos.service';
import { contarParaMinimo, mensagemPoucasPecas, montarLook } from './motor';
import { Papel } from './taxonomia';

/** Peças que, pedidas com um look na tela, vão por cima dele. */
const CATEGORIAS_DE_AGASALHO: Categoria[] = ['BLUSA', 'MOLETOM', 'JAQUETA', 'BLAZER'];

export type RespostaLook =
  | { tipo: 'POUCAS_PECAS'; mensagem: string; faltamSuperiores: number; faltamInferiores: number }
  | { tipo: 'PERGUNTA' | 'FORA_DE_ESCOPO' | 'CONVERSA'; mensagem: string }
  | { tipo: 'SALVO'; mensagem: string; lookId: string }
  | { tipo: 'SEM_LOOK'; mensagem: string; avisos: string[] }
  | {
      tipo: 'LOOK';
      mensagem: string;
      /** De onde veio o clima do look ("Considerei a previsão para amanhã..."). */
      clima: string | null;
      avisos: string[];
      /** Pergunta curta para o fim da resposta: ocasião, clima ou salvar. */
      pergunta: string;
      /** Ocasião entendida no pedido; o app guarda para quando o look for salvo. */
      ocasiao: Ocasiao | null;
      pecas: (Omit<Peca, 'imagemS3Key' | 'imagemMiniS3Key'> & FotosDaPeca & { papel: Papel })[];
    };

const FORA_DE_ESCOPO =
  'Eu só consigo montar looks com as peças do seu armário. Me conta para onde você vai ou como quer se vestir.';

const PERGUNTA_PADRAO = 'Para onde você vai? Assim eu monto o look certo.';

@Injectable()
export class LooksService {
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
    private readonly clima: ClimaService,
    private readonly looksSalvos: LooksSalvosService,
  ) {}

  /**
   * Fluxo do chat:
   *   1. confere se o armário tem o mínimo de peças (sem gastar tokens);
   *   2. a IA transforma a mensagem em filtros (única chamada paga);
   *   3. o motor escolhe as peças e monta o texto, sem IA.
   *
   * "Sim" depois de "Quer salvar esse look?" é resolvido sem a IA.
   */
  async sugerir(cognitoSub: string, dto: SugerirLookDto): Promise<RespostaLook> {
    const usuario = await this.prisma.usuario.findUnique({ where: { cognitoSub } });

    if (!usuario) {
      throw new NotFoundException(
        'Não encontramos um cadastro no ZYRA para este usuário. Faça seu cadastro para continuar.',
      );
    }

    const pecas = await this.prisma.peca.findMany({ where: { usuarioId: usuario.id } });

    const { faltamSuperiores, faltamInferiores } = contarParaMinimo(pecas);
    if (faltamSuperiores || faltamInferiores) {
      return {
        tipo: 'POUCAS_PECAS',
        mensagem: mensagemPoucasPecas(faltamSuperiores, faltamInferiores),
        faltamSuperiores,
        faltamInferiores,
      };
    }

    const historico = dto.historico ?? [];
    const respostaCurta = entenderRespostaCurta(dto.mensagem, historico);

    if (respostaCurta === 'SALVAR') {
      return this.salvarLookMostrado(cognitoSub, dto);
    }

    if (respostaCurta === 'NAO_SALVAR') {
      return { tipo: 'CONVERSA', mensagem: RESPOSTA_NAO_SALVAR };
    }

    let intencao = await this.interpretar(dto.mensagem, historico);

    // "Quero uma blusa também" com um look na tela: acrescenta a camada e
    // mantém o resto, em vez de montar outro look com a blusa no lugar.
    const agasalhoPedido = intencao.incluir.some(
      (p) => p.categoria && CATEGORIAS_DE_AGASALHO.includes(p.categoria),
    );
    if (
      dto.pecasAnteriores?.length &&
      !intencao.trocar.length &&
      agasalhoPedido &&
      pedeParaAcrescentar(dto.mensagem)
    ) {
      intencao = { ...intencao, trocar: ['CAMADA'] };
    }

    // A IA às vezes copia a cor do look da tela para a peça pedida ("quero um
    // moletom também", depois de uma camiseta cinza, virava "moletom cinza").
    // Cor que a mensagem não cita e que é de uma peça da tela sai do pedido.
    if (dto.pecasAnteriores?.length && !falaDeCor(dto.mensagem)) {
      const anteriores = new Set(dto.pecasAnteriores);
      const coresDaTela = new Set(
        pecas.filter((p) => anteriores.has(p.id)).map((p) => lerSimbolo(p.colorAddSymbol).familia),
      );
      intencao = {
        ...intencao,
        incluir: intencao.incluir.map((pedido) =>
          pedido.cor && coresDaTela.has(pedido.cor.familia) ? { ...pedido, cor: null } : pedido,
        ),
      };
    }

    // Date: casual arrumado. A IA às vezes marca como festa ("encontro à
    // noite") e quase nunca dá formalidade, e aí a camisa social entrava.
    const encontro =
      falaDeEncontro(dto.mensagem) ||
      (historico.some((m) => m.autor === 'usuario' && falaDeEncontro(m.texto)) &&
        (!intencao.ocasiao || intencao.ocasiao === 'DIA_A_DIA' || intencao.ocasiao === 'FESTA'));
    if (encontro) {
      intencao = {
        ...intencao,
        ocasiao: !intencao.ocasiao || intencao.ocasiao === 'FESTA' ? 'DIA_A_DIA' : intencao.ocasiao,
        formalidade: intencao.formalidade ?? 'MEDIA',
      };
    }

    if (intencao.tipo === 'ESCLARECER') {
      return { tipo: 'PERGUNTA', mensagem: intencao.pergunta ?? PERGUNTA_PADRAO };
    }

    if (intencao.tipo === 'FORA_DE_ESCOPO') {
      return { tipo: 'FORA_DE_ESCOPO', mensagem: FORA_DE_ESCOPO };
    }

    // Clima: o que o usuário disse vale mais que a previsão.
    const {
      intencao: comClima,
      clima,
      avisoClima,
    } = await this.aplicarPrevisao(
      intencao,
      diasAte(diaDaConversa(dto.mensagem, historico), hojeNoBrasil()),
      dto.localizacao,
    );
    intencao = comClima;

    const resultado = montarLook(pecas, intencao, {
      pecasAnteriores: dto.pecasAnteriores,
      pecasRecentes: dto.pecasRecentes,
      // A IA lê "moletom ou jaqueta" como as duas peças; o texto diz que é uma.
      alternativas: alternativasDoPedido(dto.mensagem, intencao.incluir),
      encontro,
    });

    if (resultado.status !== 'LOOK') {
      return resultado.status === 'SEM_LOOK'
        ? {
            tipo: 'SEM_LOOK',
            mensagem: resultado.mensagem,
            avisos: [...(avisoClima ? [avisoClima] : []), ...resultado.avisos],
          }
        : {
            tipo: 'POUCAS_PECAS',
            mensagem: resultado.mensagem,
            faltamSuperiores: resultado.faltamSuperiores,
            faltamInferiores: resultado.faltamInferiores,
          };
    }

    const porId = new Map(pecas.map((p) => [p.id, p]));
    const pecasDoLook = await Promise.all(
      resultado.pecas.map(async ({ id, papel }) => {
        const { imagemS3Key, imagemMiniS3Key, ...dados } = porId.get(id)!;
        return {
          ...dados,
          papel,
          ...(await fotosDaPeca(this.s3, { imagemS3Key, imagemMiniS3Key })),
        };
      }),
    );

    // Acréscimo ("põe uma jaqueta"): todas as peças da tela continuam no look.
    const manteveOLook =
      Boolean(dto.pecasAnteriores?.length) &&
      dto.pecasAnteriores!.every((id) => resultado.pecas.some((p) => p.id === id));

    return {
      tipo: 'LOOK',
      // Numa troca, só o que mudou: repetir o look inteiro deixava a conversa
      // pesada.
      mensagem: resultado.descricaoDaTroca
        ? `${manteveOLook ? 'Acrescentei' : 'Troquei por'} ${resultado.descricaoDaTroca}.`
        : resultado.descricao,
      ocasiao: intencao.ocasiao,
      // A previsão só aparece quando muda (de hoje para sábado, por exemplo):
      // repetida em toda mensagem, ela só ocupa espaço.
      clima: clima && !historico.some((m) => m.texto.includes(clima)) ? clima : null,
      avisos: [...(avisoClima ? [avisoClima] : []), ...resultado.avisos],
      pergunta: perguntaDoLook({
        temOcasiao: intencao.ocasiao !== null,
        temClima: intencao.aquecimento !== null,
        historico,
      }),
      pecas: pecasDoLook,
    };
  }

  /**
   * Se o usuário não falou do clima e mandou a localização, usa a previsão do
   * dia do evento (hoje, se ele não disse). Sem localização ou se a previsão
   * falhar, o look sai sem clima, como antes.
   */
  private async aplicarPrevisao(
    intencao: Intencao,
    dias: number | null,
    localizacao?: Localizacao,
  ) {
    const semClima = { intencao, clima: null, avisoClima: null };
    if (intencao.aquecimento || !localizacao || dias === null) return semClima;

    const hoje = hojeNoBrasil();

    const previsao = await this.clima.previsao(localizacao, dias);

    if (!previsao) {
      // Só avisa quando o dia está fora do alcance; falha da consulta passa em silêncio.
      return dias >= DIAS_DE_PREVISAO
        ? { ...semClima, avisoClima: 'Ainda não tem previsão do tempo para esse dia.' }
        : semClima;
    }

    return {
      intencao: { ...intencao, aquecimento: aquecimentoDaPrevisao(previsao) },
      clima: descreverPrevisao(previsao, hoje),
      avisoClima: null,
    };
  }

  /** "Sim" para "Quer salvar esse look?": salva as peças do look que está na tela. */
  private async salvarLookMostrado(cognitoSub: string, dto: SugerirLookDto): Promise<RespostaLook> {
    const pecaIds = dto.pecasAnteriores ?? [];

    if (!pecaIds.length) {
      return { tipo: 'CONVERSA', mensagem: RESPOSTA_SEM_LOOK_PARA_SALVAR };
    }

    try {
      // Mesmo nome e ocasião que o popup de saída do app usaria.
      const look = await this.looksSalvos.salvar(cognitoSub, {
        pecaIds,
        nome: dto.lookMostrado?.nome || undefined,
        ocasiao: dto.lookMostrado?.ocasiao,
        pedido: dto.lookMostrado?.pedido,
      });
      return { tipo: 'SALVO', mensagem: RESPOSTA_SALVO, lookId: look.id };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { tipo: 'CONVERSA', mensagem: error.message };
      }
      throw error;
    }
  }

  /** Separado para os testes trocarem a chamada à OpenAI por uma resposta fixa. */
  protected async interpretar(mensagem: string, historico: MensagemHistorico[]) {
    try {
      const { intencao } = await interpretarPedido(this.cliente(), mensagem, historico);
      return intencao;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Não consegui entender o pedido agora. Tente de novo em instantes.',
      );
    }
  }

  /**
   * Criado na primeira mensagem, não na subida do servidor: sem a chave,
   * só o chat fica indisponível, e o resto da API continua no ar.
   */
  private cliente() {
    if (!this.openai) {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');

      if (!apiKey) {
        throw new ServiceUnavailableException('O chat de looks está indisponível no momento.');
      }

      this.openai = new OpenAI({ apiKey });
    }

    return this.openai;
  }
}
