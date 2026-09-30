// Espelha src/clothing_analysis/taxonomy.py da visão. Quando o model Peca
// existir no Prisma, estes tipos passam a vir dos enums do @prisma/client.

export const CATEGORIAS = [
  'CAMISETA',
  'CAMISA',
  'MOLETOM',
  'JAQUETA',
  'BLAZER',
  'CALCA',
  'SHORT',
  'SAIA',
  'VESTIDO',
  'TENIS',
  'SAPATO',
  'BOLSA',
] as const;

export const ESTILOS = [
  'CASUAL',
  'SOCIAL',
  'ESPORTIVO',
  'STREETWEAR',
  'ELEGANTE',
  'BASICO',
] as const;

export const ESTAMPAS = ['LISO', 'ESTAMPADO', 'LISTRADO', 'XADREZ', 'LOGO'] as const;

export const OCASIOES = ['DIA_A_DIA', 'TRABALHO', 'FESTA', 'ACADEMIA', 'PRAIA', 'CASA'] as const;

export const AQUECIMENTOS = ['LEVE', 'MEDIO', 'QUENTE'] as const;

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

export type Categoria = (typeof CATEGORIAS)[number];
export type Estilo = (typeof ESTILOS)[number];
export type Estampa = (typeof ESTAMPAS)[number];
export type Ocasiao = (typeof OCASIOES)[number];
export type Aquecimento = (typeof AQUECIMENTOS)[number];
export type FamiliaCor = (typeof FAMILIAS_COR)[number];
export type Tom = (typeof TONS)[number];
