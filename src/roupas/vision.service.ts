import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Aquecimento, Categoria, Estampa, Estilo, Material, Ocasiao } from '@prisma/client';

/**
 * Resposta do /analyze-clothing. Os codigos vem de taxonomy.py e sao os mesmos
 * dos enums do Prisma, entao passam direto para o banco.
 */
export type AnaliseRoupa = {
  category: Categoria | null;
  style: Estilo | null;
  pattern: Estampa | null;
  warmth: Aquecimento | null;
  material: Material | null;
  occasions: Ocasiao[];
};

// A analise pela OpenAI leva de 5 a 16 segundos. 45s deixa folga sem prender
// a pessoa indefinidamente se o servico travar.
const TEMPO_LIMITE_MS = 45_000;

/**
 * Cliente do servico de visao para a analise paga da peca.
 *
 * Fica no back, e nao no app, para que a chamada a OpenAI so aconteca dentro
 * de um cadastro autenticado.
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.getOrThrow<string>('VISION_API_URL');
  }

  async analisarRoupa(imagem: Buffer, contentType: string): Promise<AnaliseRoupa> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(imagem)], { type: contentType }), 'roupa.jpg');

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/analyze-clothing`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (error) {
      this.logger.error('Servico de visao inalcancavel', error);
      throw this.indisponivel();
    }

    if (!response.ok) {
      this.logger.error(`Servico de visao respondeu ${response.status}`);
      throw this.indisponivel();
    }

    const analise = (await response.json()) as AnaliseRoupa;

    // Sem categoria nao ha como usar a peca em looks. Acontece quando a foto
    // escapou da validacao (um objeto parecido com roupa) ou e de algo fora da
    // taxonomia, como bone e chapeu.
    if (!analise.category) {
      throw new UnprocessableEntityException(
        'Não reconhecemos o tipo desta peça. Dá para cadastrar camisetas, camisas, moletons, jaquetas, blazers, calças, shorts, saias, vestidos, tênis, sapatos e bolsas.',
      );
    }

    return analise;
  }

  private indisponivel() {
    return new ServiceUnavailableException(
      'Não foi possível analisar a peça agora. Tente novamente em alguns instantes.',
    );
  }
}
