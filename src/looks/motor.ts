import { Categoria, Peca } from '@prisma/client';

import {
  CorPeca,
  corBateComPedido,
  corDaPeca,
  DISTANCIA_MAXIMA_PEDIDO,
  distanciaAoPedido,
  eNeutra,
} from './cor';
import { Intencao, ParteDoLook, PecaDesejada } from './interpretar-pedido';
import { compatibilidade, notaDeOcasiao, SUGESTAO_DE_CADASTRO } from './ocasioes';
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
  /**
   * Peças do último look mostrado. Em "quero outro", são penalizadas para vir
   * algo diferente; em "troca o tênis" (intencao.trocar), as das outras partes
   * ficam fixas e só a parte pedida muda.
   */
  pecasAnteriores?: string[];
  /** Peças dos últimos looks da conversa: levemente penalizadas, para variar. */
  pecasRecentes?: string[];
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

// Papéis do look anterior que cada parte de "trocar" substitui. Vestido conta
// como parte de cima e de baixo.
const PAPEIS_DA_PARTE: Record<ParteDoLook, Papel[]> = {
  CIMA: ['SUPERIOR', 'PECA_UNICA'],
  BAIXO: ['INFERIOR', 'PECA_UNICA'],
  CALCADO: ['CALCADO'],
  CAMADA: ['SOBREPOSICAO'],
};

// Quantas peças de cada papel entram na busca. Com um armário grande, testar
// todas as combinações ficaria lento; as melhores individualmente bastam.
const CANDIDATOS_POR_PAPEL = 12;

// Os looks com nota até essa distância da melhor entram no sorteio, até esse limite.
const MARGEM_SORTEIO = 2;
const MAXIMO_FINALISTAS = 8;

// Desempate aleatório entre peças de nota parecida. Muitas peças empatam (ex.:
// várias camisetas de dia a dia com logo) e, sem isso, o motor escolhia sempre
// as primeiras da lista.
const VARIACAO_ALEATORIA = 1;

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

const CATEGORIAS_FEMININAS: Categoria[] = ['CAMISETA', 'CAMISA', 'JAQUETA', 'CALCA', 'SAIA'];

const FEMININO: Record<string, string> = {
  Preto: 'Preta',
  Branco: 'Branca',
  Vermelho: 'Vermelha',
  Amarelo: 'Amarela',
  Roxo: 'Roxa',
  Castanho: 'Castanha',
  Claro: 'Clara',
  Escuro: 'Escura',
};

/** "Calça Preta", "Jaqueta Vermelha Clara"; verde, azul, laranja e cinza não mudam. */
function corConcordando(corNome: string, categoria: Categoria) {
  if (!CATEGORIAS_FEMININAS.includes(categoria)) return corNome;
  return corNome
    .split(' ')
    .map((palavra) => FEMININO[palavra] ?? palavra)
    .join(' ');
}

function descreverPeca(peca: PecaMotor) {
  return `${NOME_CATEGORIA[peca.categoria]} ${corConcordando(peca.corNome, peca.categoria)}`;
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

/**
 * Mensagem quando não dá para montar a base do look. Se a ocasião é que
 * barrou as peças, diz o que falta e o que cadastrar; senão, foram as
 * restrições do próprio pedido.
 */
function mensagemSemBase(intencao: Intencao, pecas: PecaRica[]) {
  const ocasiao = intencao.ocasiao;
  const permitida = (p: PecaRica) => compatibilidade(p, ocasiao) !== 'PROIBIDA';
  const temVestido = pecas.some((p) => p.papel === 'PECA_UNICA' && permitida(p));
  const faltam = [
    !temVestido && !pecas.some((p) => p.papel === 'SUPERIOR' && permitida(p)) && 'peças de cima',
    !temVestido && !pecas.some((p) => p.papel === 'INFERIOR' && permitida(p)) && 'peças de baixo',
  ].filter((falta): falta is string => Boolean(falta));

  const faltamPelaOcasiao =
    ocasiao &&
    faltam.length &&
    faltam.some((falta) =>
      pecas.some((p) =>
        falta === 'peças de cima' ? p.papel === 'SUPERIOR' : p.papel === 'INFERIOR',
      ),
    );

  if (ocasiao && faltamPelaOcasiao) {
    return `Não encontrei ${juntar(faltam)} para ${NOME_OCASIAO[ocasiao]} no seu armário. ${SUGESTAO_DE_CADASTRO[ocasiao]}`;
  }

  return 'Com essas restrições não sobrou peça de cima e de baixo no seu armário. Tente pedir de outro jeito.';
}

/** Nota de uma peça sozinha, para escolher os candidatos de cada papel. */
function notaDaPeca(
  peca: PecaRica,
  intencao: Intencao,
  anteriores: Set<string>,
  recentes: Set<string> = new Set(),
) {
  let nota = 0;

  nota += notaDeOcasiao(peca, intencao.ocasiao);
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
  else if (recentes.has(peca.id)) nota -= 1;

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
  const recentes = new Set(opcoes.pecasRecentes ?? []);
  const avisos: string[] = [];

  // Nota de cada peça com um pequeno desempate aleatório, sorteado uma vez por pedido.
  const notas = new Map<string, number>();
  const nota = (p: PecaRica) => {
    if (!notas.has(p.id)) {
      notas.set(
        p.id,
        notaDaPeca(p, intencao, anteriores, recentes) + aleatorio() * VARIACAO_ALEATORIA,
      );
    }
    return notas.get(p.id)!;
  };
  const todasAsPecas = pecasDoArmario.map(enriquecer);

  // "Troca o tênis": o resto do look anterior fica fixo e a peça trocada sai.
  const trocados = new Set(intencao.trocar.flatMap((parte) => PAPEIS_DA_PARTE[parte]));
  const doLookAnterior = todasAsPecas.filter((p) => anteriores.has(p.id));
  const fixas = trocados.size ? doLookAnterior.filter((p) => !trocados.has(p.papel)) : [];
  const trocadas = new Set(
    trocados.size ? doLookAnterior.filter((p) => trocados.has(p.papel)).map((p) => p.id) : [],
  );

  // Restrições que o usuário pediu explicitamente: removem a peça.
  let pecas = todasAsPecas.filter(
    (p) =>
      !trocadas.has(p.id) &&
      !intencao.evitarCategorias.includes(p.categoria) &&
      !intencao.evitarCores.some((cor) => corBateComPedido(cor, p.cor)),
  );

  // Calor: nada de peça quente. Sem isso, o motor poderia sugerir moletom a 32 graus.
  if (intencao.aquecimento === 'LEVE') {
    pecas = pecas.filter((p) => p.aquecimento !== 'QUENTE');
  }

  // "Quero usar X" e as peças mantidas do look anterior entram mesmo fora da
  // ocasião: foi o usuário quem escolheu.
  const obrigatorias = [
    ...intencao.incluir.map((pedido) => resolverPedido(pedido, pecas, avisos)),
    ...fixas.map((p) => [p]),
  ].filter((lista) => lista.length > 0);
  const pedidas = new Set(obrigatorias.flat());

  // Peça proibida para a ocasião nunca entra (calça jeans na academia, chinelo na festa).
  const permitidas = pecas.filter(
    (p) => pedidas.has(p) || compatibilidade(p, intencao.ocasiao) !== 'PROIBIDA',
  );

  const porPapel = (papel: Papel) => {
    const daPapel = permitidas.filter((p) => p.papel === papel);
    const melhores = [...daPapel].sort((a, b) => nota(b) - nota(a)).slice(0, CANDIDATOS_POR_PAPEL);

    // As peças pedidas sempre entram na busca, mesmo fora do corte por nota.
    return [...new Set([...daPapel.filter((p) => pedidas.has(p)), ...melhores])];
  };

  const superiores = porPapel('SUPERIOR');
  const inferiores = porPapel('INFERIOR');
  const vestidos = porPapel('PECA_UNICA');
  const calcados = porPapel('CALCADO');
  const sobreposicoes = porPapel('SOBREPOSICAO');

  const bases: PecaRica[][] = [
    ...superiores.flatMap((s) => inferiores.map((i) => [s, i])),
    ...vestidos.map((v) => [v]),
  ];

  if (!bases.length) {
    return { status: 'SEM_LOOK', mensagem: mensagemSemBase(intencao, pecas), avisos };
  }

  if (!calcados.length) {
    const temCalcado = todasAsPecas.some((p) => p.papel === 'CALCADO');
    avisos.push(
      !temCalcado
        ? 'Você ainda não cadastrou calçados; cadastre para completar seus looks.'
        : intencao.ocasiao && pecas.some((p) => p.papel === 'CALCADO')
          ? `Não encontrei calçado para ${NOME_OCASIAO[intencao.ocasiao]} no seu armário; o look saiu sem calçado.`
          : 'Nenhum calçado seu combina com esse pedido; o look saiu sem calçado.',
    );
  }

  // Frio pede uma camada a mais; no calor ela já foi filtrada.
  const pedeSobreposicao = intencao.aquecimento === 'QUENTE';
  const opcoesDeCalcado: (PecaRica | null)[] = calcados.length ? calcados : [null];
  // Jaqueta ou blazer só entram quando fazem sentido: frio, trabalho ou pedido
  // formal (ou quando o usuário pediu a peça). Fora disso, um casaco sem motivo
  // só deixa o look estranho.
  const camadaFazSentido =
    pedeSobreposicao || intencao.formalidade === 'ALTA' || intencao.ocasiao === 'TRABALHO';
  const opcoesDeSobreposicao: (PecaRica | null)[] = camadaFazSentido
    ? [null, ...sobreposicoes]
    : [null, ...sobreposicoes.filter((p) => pedidas.has(p))];

  const looks: { pecas: PecaRica[]; nota: number }[] = [];

  for (const base of bases) {
    for (const calcado of opcoesDeCalcado) {
      for (const sobreposicao of opcoesDeSobreposicao) {
        const look = [...base, sobreposicao, calcado].filter((p): p is PecaRica => p !== null);

        // Cada "quero usar X" precisa estar no look.
        if (!obrigatorias.every((lista) => lista.some((p) => look.includes(p)))) continue;

        // A camada não soma a própria nota: se somasse, o look com jaqueta
        // sempre ganharia. Ela só ganha pontos quando aquece um look sem moletom.
        const comMoletom = base.some((p) => p.categoria === 'MOLETOM');
        let notaDoLook =
          [...base, calcado].reduce((soma, p) => soma + (p ? nota(p) : 0), 0) +
          notaDeHarmonia(look);

        if (pedeSobreposicao && !sobreposicao && !comMoletom) notaDoLook -= 3;
        if (pedeSobreposicao && sobreposicao && !comMoletom) notaDoLook += 1;

        looks.push({ pecas: look, nota: notaDoLook });
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
  const finalistas = looks
    .filter((l) => l.nota >= looks[0].nota - MARGEM_SORTEIO)
    .slice(0, MAXIMO_FINALISTAS);
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
