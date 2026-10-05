import { Categoria, Ocasiao, Peca } from '@prisma/client';

import {
  CorPeca,
  corBateComPedido,
  corDaPeca,
  DISTANCIA_MAXIMA_PEDIDO,
  distanciaAoPedido,
  eNeutra,
} from './cor';
import { Intencao, PecaDesejada } from './interpretar-pedido';
import {
  Formalidade,
  FORMALIDADE_DO_ESTILO,
  NIVEL_FORMALIDADE,
  PAPEL_DA_CATEGORIA,
  Papel,
} from './taxonomia';

/**
 * Motor de looks: escolhe as peças do armário a partir da intenção que a IA
 * extraiu do pedido. É determinístico (fora o sorteio entre os melhores looks)
 * e não chama a OpenAI.
 */

export type PecaMotor = Pick<
  Peca,
  | 'id'
  | 'categoria'
  | 'estilo'
  | 'estampa'
  | 'ocasioes'
  | 'aquecimento'
  | 'material'
  | 'corNome'
  | 'hex'
  | 'colorAddSymbol'
>;

// Mínimo para o chat funcionar. Vestido conta como peça de cima e de baixo,
// porque já é um look sozinho. Calçado não é exigido: sem ele, o look sai
// incompleto e com aviso.
export const MINIMO_SUPERIORES = 5;
export const MINIMO_INFERIORES = 5;

export type PecaNoLook = { id: string; papel: Papel };

export type ResultadoMotor =
  | { status: 'POUCAS_PECAS'; mensagem: string; faltamSuperiores: number; faltamInferiores: number }
  | { status: 'SEM_LOOK'; mensagem: string; avisos: string[] }
  | { status: 'LOOK'; pecas: PecaNoLook[]; descricao: string; avisos: string[] };

export type OpcoesMotor = {
  /** Peças do último look mostrado: penalizadas para "quero outro" trazer algo diferente. */
  pecasAnteriores?: string[];
  /** Fonte de aleatoriedade, injetável nos testes. */
  aleatorio?: () => number;
};

const NOME_CATEGORIA: Record<Categoria, string> = {
  CAMISETA: 'Camiseta',
  CAMISA: 'Camisa',
  MOLETOM: 'Moletom',
  JAQUETA: 'Jaqueta',
  BLAZER: 'Blazer',
  CALCA: 'Calça',
  SHORT: 'Short',
  SAIA: 'Saia',
  VESTIDO: 'Vestido',
  TENIS: 'Tênis',
  SAPATO: 'Sapato',
};

const NOME_OCASIAO: Record<string, string> = {
  DIA_A_DIA: 'o dia a dia',
  TRABALHO: 'trabalho',
  FESTA: 'festa',
  ACADEMIA: 'academia',
  PRAIA: 'praia',
  CASA: 'ficar em casa',
};

const NOME_PAPEL: Record<Papel, string> = {
  SUPERIOR: 'peça de cima',
  SOBREPOSICAO: 'jaqueta ou blazer',
  INFERIOR: 'peça de baixo',
  PECA_UNICA: 'vestido',
  CALCADO: 'calçado',
};

// Quantas peças de cada papel entram na busca. Com um armário grande, testar
// todas as combinações ficaria lento; as melhores individualmente bastam.
const CANDIDATOS_POR_PAPEL = 12;

// Os looks com nota até essa distância da melhor entram no sorteio.
const MARGEM_SORTEIO = 1.5;

type PecaRica = PecaMotor & {
  papel: Papel;
  cor: CorPeca;
  formalidade: Formalidade;
  neutra: boolean;
};

function enriquecer(peca: PecaMotor): PecaRica {
  const cor = corDaPeca(peca.colorAddSymbol, peca.hex);

  return {
    ...peca,
    papel: PAPEL_DA_CATEGORIA[peca.categoria],
    cor,
    formalidade: peca.estilo ? FORMALIDADE_DO_ESTILO[peca.estilo] : 'MEDIA',
    neutra: eNeutra(cor, peca.material),
  };
}

export function contarParaMinimo(pecas: Pick<PecaMotor, 'categoria'>[]) {
  let superiores = 0;
  let inferiores = 0;

  for (const { categoria } of pecas) {
    const papel = PAPEL_DA_CATEGORIA[categoria];
    if (papel === 'SUPERIOR' || papel === 'SOBREPOSICAO' || papel === 'PECA_UNICA') superiores++;
    if (papel === 'INFERIOR' || papel === 'PECA_UNICA') inferiores++;
  }

  return {
    faltamSuperiores: Math.max(MINIMO_SUPERIORES - superiores, 0),
    faltamInferiores: Math.max(MINIMO_INFERIORES - inferiores, 0),
  };
}

export function mensagemPoucasPecas(faltamSuperiores: number, faltamInferiores: number) {
  const faltas = [
    faltamSuperiores && `${faltamSuperiores} de cima`,
    faltamInferiores && `${faltamInferiores} de baixo`,
  ].filter(Boolean);

  return (
    `Para eu montar looks, cadastre pelo menos ${MINIMO_SUPERIORES} peças de cima e ` +
    `${MINIMO_INFERIORES} de baixo (vestido conta para as duas). Faltam ${faltas.join(' e ')}.`
  );
}

function descreverPedido(pedido: PecaDesejada) {
  const partes = [pedido.categoria ? NOME_CATEGORIA[pedido.categoria].toLowerCase() : 'peça'];
  if (pedido.material) partes.push(pedido.material === 'JEANS' ? 'jeans' : 'de couro');
  if (pedido.cor) {
    partes.push(
      `${pedido.cor.familia.toLowerCase()}${pedido.cor.tom ? ` ${pedido.cor.tom.toLowerCase()}` : ''}`,
    );
  }
  return partes.join(' ');
}

function juntar(itens: string[]) {
  return itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0];
}

function descreverPeca(peca: PecaMotor) {
  return `${NOME_CATEGORIA[peca.categoria]} ${peca.corNome}`;
}

/**
 * Peças que atendem a um "quero usar X". Primeiro pelo nome da cor; se nenhuma
 * bater, a mais próxima pelo hex, com aviso.
 */
function resolverPedido(pedido: PecaDesejada, pecas: PecaRica[], avisos: string[]): PecaRica[] {
  const compativeis = pecas.filter(
    (p) =>
      (!pedido.categoria || p.categoria === pedido.categoria) &&
      (!pedido.material || p.material === pedido.material),
  );

  if (!pedido.cor) {
    if (!compativeis.length) avisos.push(`Não achei ${descreverPedido(pedido)} no seu armário.`);
    return compativeis;
  }

  const cor = pedido.cor;
  const exatas = compativeis.filter((p) => corBateComPedido(cor, p.cor));
  if (exatas.length) return exatas;

  const proxima = compativeis
    .map((p) => ({ p, d: distanciaAoPedido(cor, p.cor) }))
    .sort((a, b) => a.d - b.d)[0];

  if (proxima && proxima.d <= DISTANCIA_MAXIMA_PEDIDO) {
    avisos.push(
      `Não achei ${descreverPedido(pedido)}; usei ${descreverPeca(proxima.p).toLowerCase()}, a mais parecida.`,
    );
    return [proxima.p];
  }

  avisos.push(`Não achei ${descreverPedido(pedido)} no seu armário.`);
  return [];
}

// Ocasiões informais (dia a dia, praia, casa, academia) e formais (trabalho,
// festa). Peça marcada para outra ocasião do mesmo grupo é uma boa aposta;
// do grupo oposto, é uma escolha ruim (sapato social na praia, moletom na festa).
const INFORMAIS: Ocasiao[] = ['DIA_A_DIA', 'PRAIA', 'CASA', 'ACADEMIA'];

function afinidade(pedida: Ocasiao, daPeca: Ocasiao) {
  if (pedida === daPeca) return 2;
  if (daPeca === 'DIA_A_DIA' && pedida !== 'ACADEMIA') return pedida === 'FESTA' ? 0 : 0.5;
  if (INFORMAIS.includes(pedida) === INFORMAIS.includes(daPeca)) return 0.5;
  return -2;
}

/** Quão bem a peça serve para a ocasião pedida (peça sem ocasião: neutra). */
function notaDeOcasiao(peca: PecaRica, ocasiao: Ocasiao) {
  if (!peca.ocasioes.length) return 0;
  return Math.max(...peca.ocasioes.map((daPeca) => afinidade(ocasiao, daPeca)));
}

/** Nota de uma peça sozinha, para escolher os candidatos de cada papel. */
function notaDaPeca(peca: PecaRica, intencao: Intencao, anteriores: Set<string>) {
  let nota = 0;

  if (intencao.ocasiao) nota += notaDeOcasiao(peca, intencao.ocasiao);
  if (intencao.estilo && peca.estilo === intencao.estilo) nota += 1.5;
  if (intencao.formalidade) {
    nota -=
      2 * Math.abs(NIVEL_FORMALIDADE[peca.formalidade] - NIVEL_FORMALIDADE[intencao.formalidade]);
  }
  if (intencao.aquecimento && peca.aquecimento) {
    const nivel = { LEVE: 0, MEDIO: 1, QUENTE: 2 };
    nota -= 1.5 * Math.abs(nivel[peca.aquecimento] - nivel[intencao.aquecimento]);
  }
  if (intencao.paletaNeutra && !peca.neutra) nota -= 10;
  if (anteriores.has(peca.id)) nota -= 2;

  return nota;
}

/** Regras gerais de harmonia, valem para qualquer pessoa. */
function notaDeHarmonia(look: PecaRica[]) {
  let nota = 0;

  // No máximo duas cores fortes; neutros combinam com tudo.
  const cromaticas = new Set(look.filter((p) => !p.neutra).map((p) => p.cor.familia));
  if (cromaticas.size > 2) nota -= 6 * (cromaticas.size - 2);

  // No máximo uma peça estampada (logo pesa metade).
  const estampa = look.reduce(
    (soma, p) => soma + (!p.estampa || p.estampa === 'LISO' ? 0 : p.estampa === 'LOGO' ? 0.5 : 1),
    0,
  );
  if (estampa > 1) nota -= 5 * (estampa - 1);

  // Peças de formalidades muito diferentes não combinam (ex.: blazer com tênis esportivo).
  const niveis = look.map((p) => NIVEL_FORMALIDADE[p.formalidade]);
  if (Math.max(...niveis) - Math.min(...niveis) > 1) nota -= 3;

  // Contraste de claridade entre a parte de cima e a de baixo ajuda o look a "ler" bem.
  const cima = look.find((p) => p.papel === 'SUPERIOR');
  const baixo = look.find((p) => p.papel === 'INFERIOR');
  if (cima && baixo && Math.abs(cima.cor.luminosidade - baixo.cor.luminosidade) >= 20) nota += 1;

  return nota;
}

export function montarLook(
  pecasDoArmario: PecaMotor[],
  intencao: Intencao,
  opcoes: OpcoesMotor = {},
): ResultadoMotor {
  const { faltamSuperiores, faltamInferiores } = contarParaMinimo(pecasDoArmario);
  if (faltamSuperiores || faltamInferiores) {
    return {
      status: 'POUCAS_PECAS',
      mensagem: mensagemPoucasPecas(faltamSuperiores, faltamInferiores),
      faltamSuperiores,
      faltamInferiores,
    };
  }

  const aleatorio = opcoes.aleatorio ?? Math.random;
  const anteriores = new Set(opcoes.pecasAnteriores ?? []);
  const avisos: string[] = [];

  // Restrições que o usuário pediu explicitamente: removem a peça.
  let pecas = pecasDoArmario
    .map(enriquecer)
    .filter(
      (p) =>
        !intencao.evitarCategorias.includes(p.categoria) &&
        !intencao.evitarCores.some((cor) => corBateComPedido(cor, p.cor)),
    );

  // Calor: nada de peça quente. Sem isso, o motor poderia sugerir moletom a 32 graus.
  if (intencao.aquecimento === 'LEVE') {
    pecas = pecas.filter((p) => p.aquecimento !== 'QUENTE');
  }

  // "Quero usar X": cada pedido vira uma lista de peças aceitas.
  const obrigatorias = intencao.incluir
    .map((pedido) => resolverPedido(pedido, pecas, avisos))
    .filter((lista) => lista.length > 0);

  const semPecaDaOcasiao: string[] = [];

  const porPapel = (papel: Papel) => {
    const todas = pecas.filter((p) => p.papel === papel);
    const naOcasiao = intencao.ocasiao
      ? todas.filter((p) => !p.ocasioes.length || p.ocasioes.includes(intencao.ocasiao!))
      : todas;
    const escolhidas = naOcasiao.length ? naOcasiao : todas;

    if (intencao.ocasiao && todas.length && !naOcasiao.length && papel !== 'SOBREPOSICAO') {
      semPecaDaOcasiao.push(NOME_PAPEL[papel]);
    }

    // As peças pedidas sempre entram na busca, mesmo fora do corte por nota.
    const pedidas = obrigatorias.flat().filter((p) => p.papel === papel);
    const melhores = [...escolhidas]
      .sort((a, b) => notaDaPeca(b, intencao, anteriores) - notaDaPeca(a, intencao, anteriores))
      .slice(0, CANDIDATOS_POR_PAPEL);

    return [...new Set([...pedidas, ...melhores])];
  };

  const superiores = porPapel('SUPERIOR');
  const inferiores = porPapel('INFERIOR');
  const vestidos = porPapel('PECA_UNICA');
  const calcados = porPapel('CALCADO');
  const sobreposicoes = porPapel('SOBREPOSICAO');

  if (intencao.ocasiao && semPecaDaOcasiao.length) {
    avisos.push(
      `Não achei ${juntar(semPecaDaOcasiao)} para ${NOME_OCASIAO[intencao.ocasiao]}; usei as peças mais próximas.`,
    );
  }

  const bases: PecaRica[][] = [
    ...superiores.flatMap((s) => inferiores.map((i) => [s, i])),
    ...vestidos.map((v) => [v]),
  ];

  if (!bases.length) {
    return {
      status: 'SEM_LOOK',
      mensagem:
        'Com essas restrições não sobrou peça de cima e de baixo no seu armário. Tente pedir de outro jeito.',
      avisos,
    };
  }

  if (!calcados.length) {
    avisos.push(
      pecasDoArmario.some((p) => PAPEL_DA_CATEGORIA[p.categoria] === 'CALCADO')
        ? 'Nenhum calçado seu combina com esse pedido; o look saiu sem calçado.'
        : 'Você ainda não cadastrou calçados; cadastre para completar seus looks.',
    );
  }

  // Frio pede uma camada a mais; no calor ela já foi filtrada.
  const pedeSobreposicao = intencao.aquecimento === 'QUENTE';
  const opcoesDeCalcado: (PecaRica | null)[] = calcados.length ? calcados : [null];
  const opcoesDeSobreposicao: (PecaRica | null)[] = [null, ...sobreposicoes];

  const looks: { pecas: PecaRica[]; nota: number }[] = [];

  for (const base of bases) {
    for (const calcado of opcoesDeCalcado) {
      for (const sobreposicao of opcoesDeSobreposicao) {
        const look = [...base, sobreposicao, calcado].filter((p): p is PecaRica => p !== null);

        // Cada "quero usar X" precisa estar no look.
        if (!obrigatorias.every((lista) => lista.some((p) => look.includes(p)))) continue;

        let nota =
          look.reduce((soma, p) => soma + notaDaPeca(p, intencao, anteriores), 0) +
          notaDeHarmonia(look);

        const aquece = sobreposicao || base.some((p) => p.categoria === 'MOLETOM');
        if (pedeSobreposicao && !aquece) nota -= 3;

        // Jaqueta ou blazer só quando faz sentido: frio, trabalho ou pedido formal.
        const camadaFazSentido =
          pedeSobreposicao || intencao.formalidade === 'ALTA' || intencao.ocasiao === 'TRABALHO';
        if (sobreposicao && !camadaFazSentido) nota -= 2.5;

        looks.push({ pecas: look, nota });
      }
    }
  }

  if (!looks.length) {
    return {
      status: 'SEM_LOOK',
      mensagem: 'Não consegui montar um look com todas as peças que você pediu juntas.',
      avisos,
    };
  }

  // Sorteia entre os melhores, para "quero outro" não repetir sempre o mesmo.
  looks.sort((a, b) => b.nota - a.nota);
  const finalistas = looks.filter((l) => l.nota >= looks[0].nota - MARGEM_SORTEIO).slice(0, 5);
  const escolhido = finalistas[Math.floor(aleatorio() * finalistas.length)];

  const ordem: Papel[] = ['SUPERIOR', 'PECA_UNICA', 'SOBREPOSICAO', 'INFERIOR', 'CALCADO'];
  const pecasDoLook = [...escolhido.pecas].sort(
    (a, b) => ordem.indexOf(a.papel) - ordem.indexOf(b.papel),
  );

  return {
    status: 'LOOK',
    pecas: pecasDoLook.map((p) => ({ id: p.id, papel: p.papel })),
    descricao: pecasDoLook.map(descreverPeca).join(' + '),
    avisos,
  };
}
