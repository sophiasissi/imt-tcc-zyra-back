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
  // Segunda cor que a IA ve na peca (listras, xadrez, estampa), com o hex lido
  // da propria foto. Null em peca de uma cor so.
  secondaryColor?: { colorName: string; hex: string; colorAddSymbol: string } | null;
};

/** Resposta do /detect-color, ja com os nomes dos campos da Peca. */
export type CorDaPeca = {
  corNome: string;
  hex: string;
  colorAddSymbol: string;
  // Segunda cor de pecas listradas ou estampadas; null em peca de uma cor so.
  corSecundariaNome: string | null;
  hexSecundario: string | null;
  colorAddSymbolSecundario: string | null;
};

type CorLida = { colorName?: string; hex?: string; colorAddSymbol?: string };

// A analise pela OpenAI leva de 5 a 16 segundos. 45s deixa folga sem prender
// a pessoa indefinidamente se o servico travar.
const TEMPO_LIMITE_ANALISE_MS = 45_000;

// A leitura de cor e local (OpenCV) e responde em menos de um segundo.
const TEMPO_LIMITE_COR_MS = 10_000;

/**
 * Cliente do servico de visao.
 *
 * A analise paga fica no back, e nao no app, para que a chamada a OpenAI so
 * aconteca dentro de um cadastro autenticado.
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.getOrThrow<string>('VISION_API_URL');
  }

  async analisarRoupa(
    imagem: Buffer,
    contentType: string,
  ): Promise<AnaliseRoupa & { category: Categoria }> {
    const response = await this.enviarImagem(
      '/analyze-clothing',
      imagem,
      contentType,
      TEMPO_LIMITE_ANALISE_MS,
    );

    const analise = (await response.json()) as AnaliseRoupa;

    // Sem categoria nao ha como usar a peca em looks. Acontece quando a foto
    // escapou da validacao (um objeto parecido com roupa) ou e de algo fora da
    // taxonomia, como bone e chapeu.
    if (!analise.category) {
      throw new UnprocessableEntityException(
        'Não reconhecemos o tipo desta peça. Dá para cadastrar roupas de cima e de baixo, vestidos, macacões e calçados; bolsas, mochilas, bonés e chapéus não entram no armário.',
      );
    }

    return { ...analise, category: analise.category };
  }

  /**
   * Le a cor da foto. So e usada quando o app nao mandou a cor — por exemplo,
   * se o /detect-color falhou na tela da camera — porque a cor e obrigatoria.
   */
  async detectarCor(imagem: Buffer, contentType: string): Promise<CorDaPeca> {
    // area=peca: cor que mais ocupa a peca, e nao so o ponto da mira, mais a
    // cor secundaria.
    const response = await this.enviarImagem(
      '/detect-color?area=peca',
      imagem,
      contentType,
      TEMPO_LIMITE_COR_MS,
    );

    const cor = (await response.json()) as CorLida & { secondary?: CorLida | null };

    if (!cor.colorName || !cor.hex || !cor.colorAddSymbol) {
      this.logger.error('Servico de visao devolveu uma cor incompleta');
      throw this.indisponivel();
    }

    const secundaria = cor.secondary;
    const temSecundaria = Boolean(
      secundaria?.colorName && secundaria.hex && secundaria.colorAddSymbol,
    );

    return {
      corNome: cor.colorName,
      hex: cor.hex,
      colorAddSymbol: cor.colorAddSymbol,
      corSecundariaNome: temSecundaria ? secundaria!.colorName! : null,
      hexSecundario: temSecundaria ? secundaria!.hex! : null,
      colorAddSymbolSecundario: temSecundaria ? secundaria!.colorAddSymbol! : null,
    };
  }

  private async enviarImagem(
    endpoint: string,
    imagem: Buffer,
    contentType: string,
    tempoLimiteMs: number,
  ): Promise<Response> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(imagem)], { type: contentType }), 'peca.jpg');

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(tempoLimiteMs),
      });
    } catch (error) {
      this.logger.error(`Servico de visao inalcancavel (${endpoint})`, error);
      throw this.indisponivel();
    }

    if (!response.ok) {
      this.logger.error(`Servico de visao respondeu ${response.status} (${endpoint})`);
      throw this.indisponivel();
    }

    return response;
  }

  private indisponivel() {
    return new ServiceUnavailableException(
      'Não foi possível analisar a peça agora. Tente novamente em alguns instantes.',
    );
  }
}
