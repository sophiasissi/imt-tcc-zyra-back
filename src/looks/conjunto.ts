import { Material, Peca } from '@prisma/client';

import { eAlfaiataria } from './ocasioes';
import { FORMALIDADE_DO_ESTILO, NIVEL_FORMALIDADE, PAPEL_DA_CATEGORIA } from './taxonomia';

/**
 * Conjunto (pedido da Sophia, 10/11/2026): peça de cima e de baixo feitas para
 * irem juntas, como o colete e a calça de alfaiataria azul claro, o corset e a
 * saia de couro preta, o cropped e a saia de cetim branca, o casaco e a calça
 * de moletom. O motor dá preferência ao look com o conjunto inteiro.
 *
 * As duas peças precisam ter:
 * - a mesma cor exata (o mesmo símbolo ColorADD, com o tom) e a mesma
 *   estampa; estampada, também a mesma cor secundária;
 * - o mesmo tecido, ou as duas com corte de alfaiataria (o colete de linho e a
 *   calça de viscose da Sophia são o mesmo tecido, lido diferente pela IA);
 * - formalidade parecida (o estilo varia na análise: o colete saiu SOCIAL e a
 *   calça, CASUAL).
 * Peça BASICO não forma conjunto: camiseta básica preta com saia de malha
 * preta é só tom sobre tom.
 */
export type PecaConjunto = Pick<
  Peca,
  'id' | 'categoria' | 'estilo' | 'estampa' | 'material' | 'colorAddSymbol'
> &
  Partial<Pick<Peca, 'alfaiataria' | 'colorAddSymbolSecundario'>>;

const DE_CIMA = new Set(['SUPERIOR', 'SOBREPOSICAO']);
const NEUTRAS = /_(PRETO|BRANCO|CINZA_CLARO|CINZA_ESCURO)$/;
const TECIDOS_COMUNS: Material[] = ['MALHA', 'VISCOSE', 'POLIAMIDA'];

export function formamConjunto(a: PecaConjunto, b: PecaConjunto) {
  const [cima, baixo] = PAPEL_DA_CATEGORIA[a.categoria] === 'INFERIOR' ? [b, a] : [a, b];
  if (!DE_CIMA.has(PAPEL_DA_CATEGORIA[cima.categoria])) return false;
  if (PAPEL_DA_CATEGORIA[baixo.categoria] !== 'INFERIOR') return false;

  if (cima.estilo === 'BASICO' || baixo.estilo === 'BASICO') return false;
  if (cima.colorAddSymbol !== baixo.colorAddSymbol) return false;
  // Logo é detalhe: o casaco de moletom com logo e a calça lisa da mesma cor
  // são o conjunto da Sophia (10/11/2026).
  const estampa = (p: PecaConjunto) => (p.estampa === 'LOGO' ? 'LISO' : p.estampa);
  if (estampa(cima) !== estampa(baixo)) return false;
  if (
    estampa(cima) !== 'LISO' &&
    (cima.colorAddSymbolSecundario ?? null) !== (baixo.colorAddSymbolSecundario ?? null)
  ) {
    return false;
  }

  const alfaiataria = eAlfaiataria(cima) && eAlfaiataria(baixo);
  const mesmoTecido = cima.material !== null && cima.material === baixo.material;
  if (!mesmoTecido && !alfaiataria) return false;
  // Preto, branco e cinza em tecido comum (malha, viscose, poliamida) é
  // coincidência, não conjunto: quase todo armário tem camiseta e saia pretas
  // de malha. Nos neutros, só com alfaiataria ou tecido marcante (couro,
  // cetim, linho, moletom...).
  if (
    NEUTRAS.test(cima.colorAddSymbol) &&
    !alfaiataria &&
    TECIDOS_COMUNS.includes(cima.material!)
  ) {
    return false;
  }

  const nivel = (p: PecaConjunto) =>
    NIVEL_FORMALIDADE[p.estilo ? FORMALIDADE_DO_ESTILO[p.estilo] : 'MEDIA'];
  return Math.abs(nivel(cima) - nivel(baixo)) <= 1;
}

/** O look tem um conjunto inteiro (as duas peças)? */
export function temConjunto(look: PecaConjunto[]) {
  return look.some((a, i) => look.slice(i + 1).some((b) => formamConjunto(a, b)));
}
