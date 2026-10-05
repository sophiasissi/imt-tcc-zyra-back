import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Peca } from '@prisma/client';
import OpenAI from 'openai';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { SugerirLookDto } from './dto/sugerir-look.dto';
import { interpretarPedido, MensagemHistorico } from './interpretar-pedido';
import { contarParaMinimo, mensagemPoucasPecas, montarLook } from './motor';
import { Papel } from './taxonomia';

export type RespostaLook =
  | { tipo: 'POUCAS_PECAS'; mensagem: string; faltamSuperiores: number; faltamInferiores: number }
  | { tipo: 'PERGUNTA' | 'FORA_DE_ESCOPO'; mensagem: string }
  | { tipo: 'SEM_LOOK'; mensagem: string; avisos: string[] }
  | {
      tipo: 'LOOK';
      mensagem: string;
      avisos: string[];
      pecas: (Omit<Peca, 'imagemS3Key'> & { imagemUrl: string; papel: Papel })[];
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
  ) {}

  /**
   * Fluxo do chat:
   *   1. confere se o armário tem o mínimo de peças (sem gastar tokens);
   *   2. a IA transforma a mensagem em filtros (única chamada paga);
   *   3. o motor escolhe as peças e monta o texto, sem IA.
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

    const intencao = await this.interpretar(dto.mensagem, dto.historico ?? []);

    if (intencao.tipo === 'ESCLARECER') {
      return { tipo: 'PERGUNTA', mensagem: intencao.pergunta ?? PERGUNTA_PADRAO };
    }

    if (intencao.tipo === 'FORA_DE_ESCOPO') {
      return { tipo: 'FORA_DE_ESCOPO', mensagem: FORA_DE_ESCOPO };
    }

    const resultado = montarLook(pecas, intencao, {
      pecasAnteriores: dto.pecasAnteriores,
      pecasRecentes: dto.pecasRecentes,
    });

    if (resultado.status !== 'LOOK') {
      return resultado.status === 'SEM_LOOK'
        ? { tipo: 'SEM_LOOK', mensagem: resultado.mensagem, avisos: resultado.avisos }
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
        const { imagemS3Key, ...dados } = porId.get(id)!;
        return { ...dados, papel, imagemUrl: await this.s3.getReadUrl(imagemS3Key) };
      }),
    );

    return {
      tipo: 'LOOK',
      mensagem: resultado.descricao,
      avisos: resultado.avisos,
      pecas: pecasDoLook,
    };
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
