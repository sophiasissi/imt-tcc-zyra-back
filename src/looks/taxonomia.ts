import { Aquecimento, Categoria, Estampa, Estilo, Manga, Material, Ocasiao } from '@prisma/client';

// Os valores de peça vêm dos enums do Prisma, que espelham
// src/clothing_analysis/taxonomy.py da visão.
export const CATEGORIAS = Object.values(Categoria);
export const ESTILOS = Object.values(Estilo);
export const ESTAMPAS = Object.values(Estampa);
export const OCASIOES = Object.values(Ocasiao);
export const AQUECIMENTOS = Object.values(Aquecimento);
export const MATERIAIS = Object.values(Material);
export const MANGAS = Object.values(Manga);

export { Aquecimento, Categoria, Estampa, Estilo, Manga, Material, Ocasiao };

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
  BLUSA: 'SUPERIOR',
  CROPPED: 'SUPERIOR',
  TOP: 'SUPERIOR',
  // O body é fechado entre as pernas, mas se veste como blusa: vai com calça,
  // short ou saia.
  BODY: 'SUPERIOR',
  MOLETOM: 'SUPERIOR',
  JAQUETA: 'SOBREPOSICAO',
  BLAZER: 'SOBREPOSICAO',
  CALCA: 'INFERIOR',
  SHORT: 'INFERIOR',
  SAIA: 'INFERIOR',
  VESTIDO: 'PECA_UNICA',
  TENIS: 'CALCADO',
  SAPATO: 'CALCADO',
  SANDALIA: 'CALCADO',
  CHINELO: 'CALCADO',
};

/** Ordem em que as peças de um look aparecem: cima, camada, baixo, calçado. */
export const ORDEM_DOS_PAPEIS: Papel[] = [
  'SUPERIOR',
  'PECA_UNICA',
  'SOBREPOSICAO',
  'INFERIOR',
  'CALCADO',
];

export const FORMALIDADE_DO_ESTILO: Record<Estilo, Formalidade> = {
  ESPORTIVO: 'BAIXA',
  STREETWEAR: 'BAIXA',
  CASUAL: 'MEDIA',
  BASICO: 'MEDIA',
  SOCIAL: 'ALTA',
  ELEGANTE: 'ALTA',
};

export const NIVEL_FORMALIDADE: Record<Formalidade, number> = { BAIXA: 0, MEDIA: 1, ALTA: 2 };

/**
 * Peças de cima leves que as pessoas chamam por vários nomes: "minha blusa
 * preta" pode estar salva como camiseta, e vice-versa. Quando nenhuma peça da
 * categoria pedida bate, o motor procura nas outras do grupo.
 */
export const CATEGORIAS_PARECIDAS: readonly Categoria[] = [
  'CAMISETA',
  'BLUSA',
  'CROPPED',
  'TOP',
  'BODY',
];

/** Cores que combinam com qualquer outra (bege e marrom entram em castanho). */
export const FAMILIAS_NEUTRAS: readonly FamiliaCor[] = ['PRETO', 'BRANCO', 'CINZA', 'CASTANHO'];
