import { Aquecimento, Categoria, Estampa, Estilo, Material, Ocasiao } from '@prisma/client';

// Os valores de peça vêm dos enums do Prisma, que espelham
// src/clothing_analysis/taxonomy.py da visão.
export const CATEGORIAS = Object.values(Categoria);
export const ESTILOS = Object.values(Estilo);
export const ESTAMPAS = Object.values(Estampa);
export const OCASIOES = Object.values(Ocasiao);
export const AQUECIMENTOS = Object.values(Aquecimento);
export const MATERIAIS = Object.values(Material);

export { Aquecimento, Categoria, Estampa, Estilo, Material, Ocasiao };

// Não é guardado na peça: o motor deduz a formalidade pelo estilo.
export const FORMALIDADES = ['BAIXA', 'MEDIA', 'ALTA'] as const;

// Famílias do ColorADD, as mesmas que a visão devolve em colorAddSymbol.
export const FAMILIAS_COR = [
  'VERMELHO',
  'LARANJA',
  'AMARELO',
  'VERDE',
  'AZUL',
  'ROXO',
  'CASTANHO',
  'PRETO',
  'CINZA',
  'BRANCO',
] as const;

export const TONS = ['CLARO', 'ESCURO'] as const;

export type Formalidade = (typeof FORMALIDADES)[number];
export type FamiliaCor = (typeof FAMILIAS_COR)[number];
export type Tom = (typeof TONS)[number];

/**
 * Lugar de cada categoria no look:
 * superior + inferior + calçado, ou peça única (vestido) + calçado.
 * Sobreposição (jaqueta, blazer) é opcional e vai por cima do superior.
 */
export type Papel = 'SUPERIOR' | 'SOBREPOSICAO' | 'INFERIOR' | 'PECA_UNICA' | 'CALCADO';

export const PAPEL_DA_CATEGORIA: Record<Categoria, Papel> = {
  CAMISETA: 'SUPERIOR',
  CAMISA: 'SUPERIOR',
  MOLETOM: 'SUPERIOR',
  JAQUETA: 'SOBREPOSICAO',
  BLAZER: 'SOBREPOSICAO',
  CALCA: 'INFERIOR',
  SHORT: 'INFERIOR',
  SAIA: 'INFERIOR',
  VESTIDO: 'PECA_UNICA',
  TENIS: 'CALCADO',
  SAPATO: 'CALCADO',
};

export const FORMALIDADE_DO_ESTILO: Record<Estilo, Formalidade> = {
  ESPORTIVO: 'BAIXA',
  STREETWEAR: 'BAIXA',
  CASUAL: 'MEDIA',
  BASICO: 'MEDIA',
  SOCIAL: 'ALTA',
  ELEGANTE: 'ALTA',
};

export const NIVEL_FORMALIDADE: Record<Formalidade, number> = { BAIXA: 0, MEDIA: 1, ALTA: 2 };

/** Cores que combinam com qualquer outra (bege e marrom entram em castanho). */
export const FAMILIAS_NEUTRAS: readonly FamiliaCor[] = ['PRETO', 'BRANCO', 'CINZA', 'CASTANHO'];
