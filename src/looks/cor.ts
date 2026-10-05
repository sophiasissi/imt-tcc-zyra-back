import { Material } from '@prisma/client';

import { FAMILIAS_COR, FAMILIAS_NEUTRAS, FamiliaCor, Tom } from './taxonomia';

export type CorPeca = {
  familia: FamiliaCor;
  tom: Tom | null;
  /** L* do CIELAB, de 0 (preto) a 100 (branco). */
  luminosidade: number;
  lab: [number, number, number];
};

/** "COLORADD_AZUL_CLARO" -> { familia: AZUL, tom: CLARO }. */
export function lerSimbolo(colorAddSymbol: string): { familia: FamiliaCor; tom: Tom | null } {
  const codigo = colorAddSymbol.replace(/^COLORADD_/, '');
  const tom = codigo.endsWith('_CLARO') ? 'CLARO' : codigo.endsWith('_ESCURO') ? 'ESCURO' : null;
  const familia = codigo.replace(/_(CLARO|ESCURO)$/, '');

  if (!(FAMILIAS_COR as readonly string[]).includes(familia)) {
    throw new Error(`colorAddSymbol desconhecido: ${colorAddSymbol}`);
  }

  return { familia: familia as FamiliaCor, tom };
}

function linear(canal: number) {
  const v = canal / 255;
  return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
}

function f(t: number) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** Mesma conversão sRGB -> CIELAB (D65) usada no color_mapper.py da visão. */
export function hexParaLab(hex: string): [number, number, number] {
  const valor = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => linear(parseInt(valor.slice(i, i + 2), 16)));

  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);

  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function corDaPeca(colorAddSymbol: string, hex: string): CorPeca {
  const lab = hexParaLab(hex);
  return { ...lerSimbolo(colorAddSymbol), luminosidade: lab[0], lab };
}

/** Distância perceptual entre duas cores (ΔE76). Abaixo de ~25, a maioria das pessoas chama pelo mesmo nome. */
export function distancia(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Neutro combina com qualquer cor. Jeans e azul-marinho funcionam como neutros
 * na moda, mesmo sendo azuis.
 */
export function eNeutra(cor: CorPeca, material: Material | null) {
  return (
    FAMILIAS_NEUTRAS.includes(cor.familia) ||
    material === 'JEANS' ||
    (cor.familia === 'AZUL' && cor.tom === 'ESCURO')
  );
}

/** Cor típica de roupa em cada família, para medir o quão perto uma peça está do pedido. */
const REFERENCIA: Record<FamiliaCor, string> = {
  VERMELHO: '#B22222',
  LARANJA: '#E07B39',
  AMARELO: '#E8C547',
  VERDE: '#3A7D44',
  AZUL: '#2F5DA8',
  ROXO: '#6A3D9A',
  CASTANHO: '#8B5A2B',
  PRETO: '#1A1A1A',
  CINZA: '#808080',
  BRANCO: '#F2F2F2',
};

/** O nome bate: mesma família e, se o usuário disse o tom, o mesmo tom. */
export function corBateComPedido(pedida: { familia: FamiliaCor; tom: Tom | null }, peca: CorPeca) {
  return pedida.familia === peca.familia && (pedida.tom === null || pedida.tom === peca.tom);
}

/**
 * Quão longe a peça está da cor pedida (ΔE76). Usado quando nenhuma peça bate
 * pelo nome: a mesma calça bege pode ter sido gravada como Castanho Claro ou
 * Amarelo Claro, e a mais próxima é uma boa aposta, com aviso.
 */
export function distanciaAoPedido(pedida: { familia: FamiliaCor; tom: Tom | null }, peca: CorPeca) {
  const [l, a, b] = hexParaLab(REFERENCIA[pedida.familia]);
  const referencia: [number, number, number] =
    pedida.tom === 'CLARO'
      ? [Math.min(l + 20, 100), a * 0.6, b * 0.6]
      : pedida.tom === 'ESCURO'
        ? [Math.max(l - 20, 0), a, b]
        : [l, a, b];

  return distancia(referencia, peca.lab);
}

/** Acima disso, a peça mais próxima já é outra cor: melhor avisar que não achou. */
export const DISTANCIA_MAXIMA_PEDIDO = 40;
