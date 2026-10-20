import { AnaliseRoupa, CorDaPeca } from './vision.service';

export type CoresDaPeca = CorDaPeca & {
  corSecundariaNome: string | null;
  hexSecundario: string | null;
  colorAddSymbolSecundario: string | null;
};

/**
 * Cor que vai para o banco no cadastro.
 *
 * O nome e o simbolo vem da analise pela OpenAI, quando ela trouxe uma cor. A
 * leitura por pixels (/detect-color) erra com luz de lampada: nas 29 pecas
 * cadastradas em 19/10/2026, uma calca azul bebe tinha pixels (173, 177, 171)
 * e saia Branco ou Cinza Claro. A OpenAI acertou cerca de 27 das 29; a
 * leitura por pixels, cerca de 19.
 *
 * O hex continua o medido na foto, porque e uma medida de verdade: o motor usa
 * a claridade dele para o contraste entre as pecas. Sem cor na analise, fica a
 * leitura por pixels inteira.
 *
 * A cor secundaria so existe na analise. O hex dela e a cor de referencia do
 * simbolo.
 */
export function coresDaPeca(
  lida: CorDaPeca,
  analise: Pick<AnaliseRoupa, 'primaryColor' | 'secondaryColor'>,
): CoresDaPeca {
  const principal = analise.primaryColor;
  const secundaria = analise.secondaryColor;

  return {
    corNome: principal?.colorName ?? lida.corNome,
    colorAddSymbol: principal?.colorAddSymbol ?? lida.colorAddSymbol,
    hex: lida.hex,
    corSecundariaNome: secundaria?.colorName ?? null,
    hexSecundario: secundaria?.hex ?? null,
    colorAddSymbolSecundario: secundaria?.colorAddSymbol ?? null,
  };
}
