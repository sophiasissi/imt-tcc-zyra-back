import { Categoria, Estilo, Ocasiao, Peca } from '@prisma/client';

import { PAPEL_DA_CATEGORIA } from './taxonomia';

/**
 * Se uma peça serve para a ocasião pedida.
 *
 * - ADEQUADA: a análise marcou a peça para essa ocasião.
 * - ACEITAVEL: não foi marcada, mas é uma escolha razoável (ex.: peça de dia a
 *   dia numa festa). Entra no look sem aviso.
 * - PROIBIDA: nunca entra (ex.: calça jeans na academia, chinelo na festa).
 *
 * A análise quase nunca marca FESTA, e às vezes não marca TRABALHO; por isso
 * as peças de dia a dia são aceitáveis nessas ocasiões.
 */
export type Compatibilidade = 'ADEQUADA' | 'ACEITAVEL' | 'PROIBIDA';

type PecaOcasiao = Pick<Peca, 'categoria' | 'estilo' | 'ocasioes' | 'aquecimento' | 'material'>;

const FORMAIS: Estilo[] = ['SOCIAL', 'ELEGANTE'];

/** Chinelo, babuche e afins: calçado marcado para casa ou praia, e não para trabalho ou festa. */
function eCalcadoDeCasaOuPraia(peca: PecaOcasiao) {
  return (
    PAPEL_DA_CATEGORIA[peca.categoria] === 'CALCADO' &&
    peca.ocasioes.some((o) => o === 'CASA' || o === 'PRAIA') &&
    !peca.ocasioes.some((o) => o === 'TRABALHO' || o === 'FESTA')
  );
}

const PROIBIDAS_NA_ACADEMIA: Categoria[] = ['CAMISA', 'BLAZER', 'SAIA', 'VESTIDO', 'SAPATO'];

export function compatibilidade(peca: PecaOcasiao, ocasiao: Ocasiao | null): Compatibilidade {
  if (!ocasiao) return 'ACEITAVEL';

  const marcada = peca.ocasioes.includes(ocasiao);
  const semOcasiao = peca.ocasioes.length === 0;
  const diaADia = peca.ocasioes.includes('DIA_A_DIA') || semOcasiao;

  switch (ocasiao) {
    case 'ACADEMIA':
      if (
        peca.material === 'JEANS' ||
        peca.material === 'COURO' ||
        PROIBIDAS_NA_ACADEMIA.includes(peca.categoria) ||
        (peca.estilo && FORMAIS.includes(peca.estilo))
      ) {
        return 'PROIBIDA';
      }
      if (marcada) return 'ADEQUADA';
      return peca.estilo === 'ESPORTIVO' ? 'ACEITAVEL' : 'PROIBIDA';

    case 'TRABALHO':
      if (
        peca.categoria === 'SHORT' ||
        peca.estilo === 'ESPORTIVO' ||
        eCalcadoDeCasaOuPraia(peca)
      ) {
        return 'PROIBIDA';
      }
      if (marcada) return 'ADEQUADA';
      return diaADia ? 'ACEITAVEL' : 'PROIBIDA';

    case 'FESTA':
      if (peca.estilo === 'ESPORTIVO' || eCalcadoDeCasaOuPraia(peca)) return 'PROIBIDA';
      if (marcada) return 'ADEQUADA';
      return diaADia || peca.ocasioes.includes('TRABALHO') ? 'ACEITAVEL' : 'PROIBIDA';

    case 'PRAIA':
      if (
        peca.material === 'COURO' ||
        peca.categoria === 'BLAZER' ||
        peca.estilo === 'SOCIAL' ||
        peca.aquecimento === 'QUENTE'
      ) {
        return 'PROIBIDA';
      }
      if (marcada) return 'ADEQUADA';
      return diaADia ? 'ACEITAVEL' : 'PROIBIDA';

    case 'CASA':
      // Em casa: confortável. Nada de camada por cima, jeans, couro ou peça social.
      if (
        PAPEL_DA_CATEGORIA[peca.categoria] === 'SOBREPOSICAO' ||
        peca.material === 'JEANS' ||
        peca.material === 'COURO' ||
        (peca.estilo && FORMAIS.includes(peca.estilo))
      ) {
        return 'PROIBIDA';
      }
      return marcada ? 'ADEQUADA' : 'ACEITAVEL';

    case 'DIA_A_DIA':
      return marcada ? 'ADEQUADA' : 'ACEITAVEL';
  }
}

/**
 * Nota da peça para a ocasião. Em trabalho e festa, entre as aceitáveis,
 * as mais arrumadas vêm primeiro (camisa > camiseta lisa > camiseta com logo).
 */
export function notaDeOcasiao(peca: PecaOcasiao & Pick<Peca, 'estampa'>, ocasiao: Ocasiao | null) {
  if (!ocasiao) return 0;

  const compat = compatibilidade(peca, ocasiao);
  let nota = compat === 'ADEQUADA' ? 2 : 0.5;

  if (ocasiao === 'TRABALHO' || ocasiao === 'FESTA') {
    if (peca.categoria === 'CAMISA' || peca.categoria === 'BLAZER') nota += 1;
    if (peca.estilo && FORMAIS.includes(peca.estilo)) nota += 1;
    if (peca.estampa === 'LOGO') nota -= 0.5;
  }

  // Peça social no dia a dia é permitida, mas não é a primeira escolha.
  if (ocasiao === 'DIA_A_DIA' && compat === 'ACEITAVEL') {
    if (peca.estilo && FORMAIS.includes(peca.estilo)) nota -= 1;
  }

  return nota;
}

/** O que cadastrar quando faltam peças para a ocasião. */
export const SUGESTAO_DE_CADASTRO: Record<Ocasiao, string> = {
  ACADEMIA: 'Cadastre roupas de treino, como camiseta esportiva, short ou legging.',
  TRABALHO: 'Cadastre peças como camisa, calça ou sapato fechado.',
  FESTA: 'Cadastre peças mais arrumadas, como camisa, calça ou vestido.',
  PRAIA: 'Cadastre peças leves, como short, camiseta ou vestido.',
  DIA_A_DIA: 'Cadastre mais peças do seu dia a dia.',
  CASA: 'Cadastre peças confortáveis para ficar em casa.',
};
