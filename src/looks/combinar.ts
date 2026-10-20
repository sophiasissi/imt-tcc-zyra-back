import { Peca } from '@prisma/client';

import { corDaPeca, CorPeca, eNeutra } from './cor';
import { contarParaMinimo, mensagemPoucasPecas } from './motor';
import { FamiliaCor, PAPEL_DA_CATEGORIA, Papel } from './taxonomia';

/**
 * "Peças do seu armário que combinam", na tela da peça que acabou de ser
 * fotografada (antes do cadastro). Sem IA: só regras de cor, como o motor.
 *
 * O tipo da peça fotografada vem do CLIP na validação da foto (gratuita); a
 * categoria exata só existe depois do cadastro, que é a etapa paga.
 */
export const TIPOS_DA_FOTO = ['CIMA', 'BAIXO', 'VESTIDO', 'CALCADO'] as const;
export type TipoDaFoto = (typeof TIPOS_DA_FOTO)[number];

export type PecaFotografada = {
  tipo: TipoDaFoto;
  corNome: string;
  hex: string;
  colorAddSymbol: string;
};

export type Sugestao = { pecaId: string; motivo: string };

export type ResultadoCombinacao =
  | { status: 'POUCAS_PECAS'; mensagem: string }
  | { status: 'SEM_COMBINACAO'; mensagem: string }
  | { status: 'OK'; sugestoes: Sugestao[] };

export const QUANTAS_SUGESTOES = 2;

// Sorteio entre as peças que combinam quase tão bem quanto a melhor, para a
// mesma foto não mostrar sempre a mesma dupla (como o MARGEM_SORTEIO do motor).
const MARGEM_DO_SORTEIO = 1;

export type OpcoesCombinacao = {
  /** Peças já mostradas para esta foto ("Ver outras"): ficam de fora. */
  excluir?: string[];
  /** Para os testes fixarem o sorteio. */
  aleatorio?: () => number;
};

export const SEM_COMBINACAO = 'Ainda não encontrei peças no seu armário que combinem com esta.';

type PecaCombinavel = Pick<
  Peca,
  'id' | 'categoria' | 'material' | 'estampa' | 'corNome' | 'hex' | 'colorAddSymbol'
>;

/** O que se veste junto com cada tipo. Nunca o mesmo tipo da foto. */
const PAPEIS_QUE_COMPLETAM: Record<TipoDaFoto, Papel[]> = {
  // Vestido não entra com peça de cima ou de baixo: seria sugerir outra
  // roupa inteira no lugar da que a pessoa fotografou.
  CIMA: ['INFERIOR', 'CALCADO'],
  BAIXO: ['SUPERIOR', 'CALCADO'],
  VESTIDO: ['CALCADO', 'SOBREPOSICAO'],
  CALCADO: ['SUPERIOR', 'SOBREPOSICAO', 'INFERIOR', 'PECA_UNICA'],
};

const NOME_DA_FAMILIA: Record<FamiliaCor, string> = {
  VERMELHO: 'vermelho',
  LARANJA: 'laranja',
  AMARELO: 'amarelo',
  VERDE: 'verde',
  AZUL: 'azul',
  ROXO: 'roxo',
  CASTANHO: 'marrom',
  PRETO: 'preto',
  CINZA: 'cinza',
  BRANCO: 'branco',
};

// Diferença de claridade (L*) que já dá contraste entre as duas peças.
const CONTRASTE_DE_CLARIDADE = 20;

type Avaliacao = { nota: number; motivo: string };

/**
 * Se as duas cores combinam, e por quê. Regra segura para quem é daltônico:
 * combina quando uma é neutra ou quando as duas são da mesma cor (tom sobre
 * tom). Duas cores fortes diferentes (ex.: vermelho com verde) nunca são
 * sugeridas.
 */
function avaliar(
  fotografada: { cor: CorPeca; corNome: string },
  peca: { cor: CorPeca; corNome: string; neutra: boolean },
): Avaliacao | null {
  const fotoNeutra = eNeutra(fotografada.cor, null);
  const contraste =
    Math.abs(fotografada.cor.luminosidade - peca.cor.luminosidade) >= CONTRASTE_DE_CLARIDADE;
  const bonusContraste = contraste ? 1 : 0;

  if (fotografada.cor.familia === peca.cor.familia) {
    const familia = NOME_DA_FAMILIA[peca.cor.familia];
    return fotoNeutra
      ? { nota: 1 + bonusContraste, motivo: `Tons de ${familia} combinam entre si.` }
      : {
          nota: 3 + bonusContraste,
          motivo: `Tom sobre tom: tons de ${familia} combinam entre si.`,
        };
  }

  if (peca.neutra && fotoNeutra) {
    return { nota: 2 + bonusContraste, motivo: 'Cores neutras combinam entre si.' };
  }

  if (peca.neutra) {
    return { nota: 2 + bonusContraste, motivo: `${peca.corNome} combina com qualquer cor.` };
  }

  if (fotoNeutra) {
    return { nota: 2 + bonusContraste, motivo: `${fotografada.corNome} combina com qualquer cor.` };
  }

  return null;
}

/**
 * Até duas peças do armário que combinam com a fotografada, de tipos
 * diferentes dela. Quando dá, as duas são de tipos diferentes entre si (ex.:
 * uma calça e um tênis), para a pessoa ver mais de uma forma de usar a peça.
 */
export function sugerirCombinacoes(
  armario: PecaCombinavel[],
  fotografada: PecaFotografada,
  opcoes: OpcoesCombinacao = {},
): ResultadoCombinacao {
  const aleatorio = opcoes.aleatorio ?? Math.random;
  const { faltamSuperiores, faltamInferiores } = contarParaMinimo(armario);
  if (faltamSuperiores || faltamInferiores) {
    return {
      status: 'POUCAS_PECAS',
      mensagem: mensagemPoucasPecas(faltamSuperiores, faltamInferiores),
    };
  }

  const corFoto = {
    cor: corDaPeca(fotografada.colorAddSymbol, fotografada.hex),
    corNome: fotografada.corNome,
  };
  const papeis = PAPEIS_QUE_COMPLETAM[fotografada.tipo];

  const todas = armario
    .filter((p) => papeis.includes(PAPEL_DA_CATEGORIA[p.categoria]))
    .flatMap((p) => {
      const cor = corDaPeca(p.colorAddSymbol, p.hex);
      const avaliacao = avaliar(corFoto, {
        cor,
        corNome: p.corNome,
        neutra: eNeutra(cor, p.material),
      });
      if (!avaliacao) return [];
      const papel = PAPEL_DA_CATEGORIA[p.categoria];
      // As apostas mais seguras ao lado de uma peça nova: lisa e neutra.
      const lisa = !p.estampa || p.estampa === 'LISO' ? 0.5 : 0;
      const neutra = eNeutra(cor, p.material) ? 0.5 : 0;
      // Jaqueta e blazer completam, mas não são a primeira ideia (exceto com
      // vestido, que só ganha calçado ou camada).
      const camada = papel === 'SOBREPOSICAO' && fotografada.tipo !== 'VESTIDO' ? -1 : 0;
      return [
        {
          peca: p,
          papel,
          nota: avaliacao.nota + lisa + neutra + camada,
          motivo: avaliacao.motivo,
        },
      ];
    })
    .sort((a, b) => b.nota - a.nota);

  if (!todas.length) {
    return { status: 'SEM_COMBINACAO', mensagem: SEM_COMBINACAO };
  }

  // "Ver outras": tira as já mostradas. Se não sobrar o bastante, recomeça
  // com todas, em vez de mostrar uma tela vazia.
  const excluir = new Set(opcoes.excluir ?? []);
  const naoVistas = todas.filter((c) => !excluir.has(c.peca.id));
  const candidatas = naoVistas.length >= QUANTAS_SUGESTOES ? naoVistas : todas;

  /** Sorteia entre as que ficam a até MARGEM_DO_SORTEIO da melhor da lista. */
  const sortear = (lista: typeof candidatas) => {
    if (!lista.length) return undefined;
    const finalistas = lista.filter((c) => c.nota >= lista[0].nota - MARGEM_DO_SORTEIO);
    return finalistas[Math.floor(aleatorio() * finalistas.length)];
  };

  const primeira = sortear(candidatas)!;
  const resto = candidatas.filter((c) => c !== primeira);
  const segunda = sortear(resto.filter((c) => c.papel !== primeira.papel)) ?? sortear(resto);

  return {
    status: 'OK',
    sugestoes: [primeira, segunda]
      .filter((c): c is (typeof candidatas)[number] => Boolean(c))
      .slice(0, QUANTAS_SUGESTOES)
      .map((c) => ({ pecaId: c.peca.id, motivo: c.motivo })),
  };
}
