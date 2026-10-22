import { Categoria, Material, Peca } from '@prisma/client';

import {
  CorPeca,
  corBateComPedido,
  corDaPeca,
  DISTANCIA_MAXIMA_PEDIDO,
  distanciaAoPedido,
  eNeutra,
} from './cor';
import { Intencao, ParteDoLook, PecaDesejada } from './interpretar-pedido';
import { NOME_CATEGORIA, NOME_MATERIAL, nomeDaPeca } from './nome-da-peca';
import { compatibilidade, notaDeOcasiao, SUGESTAO_DE_CADASTRO } from './ocasioes';
import {
  CATEGORIAS_PARECIDAS,
  Formalidade,
  FORMALIDADE_DO_ESTILO,
  NIVEL_DE_AQUECIMENTO,
  NIVEL_FORMALIDADE,
  ORDEM_DOS_PAPEIS,
  PAPEL_DA_CATEGORIA,
  Papel,
  papeisNoLook,
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
  | 'manga'
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
  | {
      status: 'LOOK';
      pecas: PecaNoLook[];
      descricao: string;
      /**
       * Numa troca ("troca o tênis"), só as peças que entraram agora. null num
       * look novo: aí a resposta descreve o look inteiro.
       */
      descricaoDaTroca: string | null;
      avisos: string[];
    };

export type OpcoesMotor = {
  /**
   * Peças do último look mostrado. Em "quero outro", são penalizadas para vir
   * algo diferente; em "troca o tênis" (intencao.trocar), as das outras partes
   * ficam fixas e só a parte pedida muda.
   */
  pecasAnteriores?: string[];
  /** Peças dos últimos looks da conversa: levemente penalizadas, para variar. */
  pecasRecentes?: string[];
  /**
   * Pedidos com "ou" ("moletom ou jaqueta"), como grupos de índices de
   * intencao.incluir: basta uma peça de cada grupo estar no look.
   */
  alternativas?: number[][];
  /** Look para um encontro: peça com gola (camisa) fica formal demais. */
  encontro?: boolean;
  /** Fonte de aleatoriedade, injetável nos testes. */
  aleatorio?: () => number;
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

// No date: camisa (gola) é peça de trabalho ou de evento sério, formal
// demais; short é casual demais para sair à noite. Só pesam contra: se a
// pessoa pedir a peça, ela entra.
const FORA_DO_TOM_NO_ENCONTRO: Categoria[] = ['CAMISA', 'SHORT'];
const PENALIDADE_NO_ENCONTRO = 4;

/**
 * No look da tela, a peça de cima vestida por cima de outra (moletom sobre a
 * camiseta) é a camada. Sem isso, "troca o moletom" não achava camada para
 * trocar, e "outro moletom" somava uma terceira peça de cima ao look.
 */
function marcarCamadaDoLookAnterior(pecas: PecaRica[], anteriores: Set<string>): PecaRica[] {
  const papeis = papeisNoLook(pecas.filter((p) => anteriores.has(p.id)));
  return pecas.map((p) =>
    papeis.get(p.id) === 'SOBREPOSICAO' && p.papel === 'SUPERIOR'
      ? { ...p, papel: 'SOBREPOSICAO' }
      : p,
  );
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
  if (pedido.material) {
    partes.push(pedido.material === 'JEANS' ? 'jeans' : `de ${NOME_MATERIAL[pedido.material]}`);
  }
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

// O gênero vem da primeira palavra do nome, e não da categoria: a jaqueta de
// moletom se chama "Casaco", e a camiseta sem manga, "Regata".
const NOMES_FEMININOS = [
  'Camiseta',
  'Camisa',
  'Blusa',
  'Regata',
  'Jaqueta',
  'Calça',
  'Saia',
  'Sandália',
];

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
function corConcordando(corNome: string, nomeDaPecaNoLook: string) {
  if (!NOMES_FEMININOS.includes(nomeDaPecaNoLook.split(' ')[0])) return corNome;
  return corNome
    .split(' ')
    .map((palavra) => FEMININO[palavra] ?? palavra)
    .join(' ');
}

function descreverPeca(peca: PecaMotor) {
  const nome = nomeDaPeca(peca);
  return `${nome} ${corConcordando(peca.corNome, nome)}`;
}

/**
 * Peças que atendem a um "quero usar X". Primeiro pelo nome da cor; se nenhuma
 * bater, a mais próxima pelo hex, com aviso.
 */
/**
 * Peças de cima que, pedidas como camada ("põe uma blusa por cima"), vão por cima
 * da que já está no look, e o que tentar se a pessoa não tiver a pedida.
 */
const AGASALHOS_POR_PEDIDO: Partial<Record<string, Categoria[]>> = {
  BLUSA: ['BLUSA', 'MOLETOM', 'JAQUETA'],
  MOLETOM: ['MOLETOM', 'BLUSA', 'JAQUETA'],
  CAMISA: ['CAMISA'],
};

// Blusa e moletom são sinônimos para quem pede um agasalho: trocar um pelo
// outro não precisa de aviso. Ir para a jaqueta precisa.
const SINONIMOS_DE_AGASALHO: Categoria[] = ['BLUSA', 'MOLETOM'];

function resolverPedido(pedido: PecaDesejada, pecas: PecaRica[], avisos: string[]): PecaRica[] {
  const doMaterial = pecas.filter((p) => !pedido.material || p.material === pedido.material);
  let compativeis = doMaterial.filter((p) => !pedido.categoria || p.categoria === pedido.categoria);

  // "Minha blusa preta" pode estar salva como camiseta: sem nenhuma peça da
  // categoria pedida que sirva, procura nas parecidas.
  const pedidaEhParecida = pedido.categoria && CATEGORIAS_PARECIDAS.includes(pedido.categoria);
  const serve = (p: PecaRica) => !pedido.cor || corBateComPedido(pedido.cor, p.cor);
  if (pedidaEhParecida && !compativeis.some(serve)) {
    const parecidas = doMaterial.filter((p) => CATEGORIAS_PARECIDAS.includes(p.categoria));
    if (parecidas.some(serve)) compativeis = parecidas;
  }

  // "Meu moletom" pode ser o casaco de moletom com zíper, salvo como jaqueta.
  if (pedido.categoria === 'MOLETOM' && !compativeis.some(serve)) {
    const casacos = doMaterial.filter((p) => p.categoria === 'JAQUETA' && p.material === 'MOLETOM');
    if (casacos.some(serve)) compativeis = casacos;
  }

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
    nota -=
      1.5 *
      Math.abs(NIVEL_DE_AQUECIMENTO[peca.aquecimento] - NIVEL_DE_AQUECIMENTO[intencao.aquecimento]);
  }
  // Manga longa no calor e sem manga no frio pesam contra, sem proibir.
  if (intencao.aquecimento === 'LEVE' && peca.manga === 'LONGA') nota -= 1;
  if (intencao.aquecimento === 'QUENTE' && peca.manga === 'SEM_MANGA') nota -= 1.5;
  if (intencao.paletaNeutra && !peca.neutra) nota -= 10;
  if (anteriores.has(peca.id)) nota -= 2;
  else if (recentes.has(peca.id)) nota -= 1;

  return nota;
}

/**
 * Tecidos que não vão juntos no mesmo look. Por enquanto só o soft (pijama,
 * pelúcia), que não combina com peça de sair. As próximas regras de material
 * entram aqui, ou no arquivo de regras por cenário do Gustavo.
 */
const MATERIAIS_QUE_NAO_COMBINAM: [Material, Material[]][] = [
  ['SOFT', ['JEANS', 'COURO', 'ALFAIATARIA', 'CETIM', 'LINHO']],
];

function materiaisNaoCombinam(look: PecaRica[]) {
  const materiais = new Set(look.map((p) => p.material).filter((m): m is Material => !!m));
  return MATERIAIS_QUE_NAO_COMBINAM.some(
    ([material, outros]) => materiais.has(material) && outros.some((m) => materiais.has(m)),
  );
}

// Camadas fechadas: vestidas, cobrem a peça de cima. Jaqueta e blazer
// costumam ficar abertos e deixam a peça de baixo à mostra.
const CAMADAS_FECHADAS: Categoria[] = ['MOLETOM', 'BLUSA'];
const ESTAMPAS_QUE_CHAMAM_ATENCAO: PecaRica['estampa'][] = ['ESTAMPADO', 'LISTRADO', 'XADREZ'];

/** Cor forte ou estampa marcante: a peça que chama a atenção do look. */
function chamaAtencao(peca: PecaRica) {
  return !peca.neutra || ESTAMPAS_QUE_CHAMAM_ATENCAO.includes(peca.estampa);
}

/**
 * O que aparece do look. Com moletom fechado por cima, a camiseta some: o
 * look é visto de dois jeitos, sem o moletom (camiseta + calça + tênis) e com
 * ele (moletom + calça + tênis). Cada um precisa combinar com a calça e o
 * tênis; a camiseta e o moletom não precisam combinar entre si.
 */
function vistasDoLook(look: PecaRica[]): PecaRica[][] {
  const camada = look.find((p) => p.papel === 'SOBREPOSICAO');
  const cima = look.find((p) => p.papel === 'SUPERIOR');
  if (!camada || !cima || !CAMADAS_FECHADAS.includes(camada.categoria)) return [look];
  return [look.filter((p) => p !== camada), look.filter((p) => p !== cima)];
}

/** Regras gerais de harmonia, valem para qualquer pessoa. */
function harmoniaDaVista(look: PecaRica[]) {
  let nota = 0;

  if (materiaisNaoCombinam(look)) nota -= 10;

  // Uma peça só chama a atenção (cor forte ou estampa marcante); o resto
  // fica neutro. Tênis colorido pede camiseta e calça neutras.
  const chamativas = look.filter(chamaAtencao).length;
  if (chamativas > 1) nota -= 6 * (chamativas - 1);

  // Peças de formalidades muito diferentes não combinam (ex.: blazer com tênis esportivo).
  const niveis = look.map((p) => NIVEL_FORMALIDADE[p.formalidade]);
  if (Math.max(...niveis) - Math.min(...niveis) > 1) nota -= 3;

  // Contraste de claridade entre a parte de cima e a de baixo ajuda o look a
  // "ler" bem. Com o moletom fechado, a parte de cima que aparece é ele.
  const cima =
    look.find((p) => p.papel === 'SUPERIOR') ?? look.find((p) => p.papel === 'SOBREPOSICAO');
  const baixo = look.find((p) => p.papel === 'INFERIOR');
  if (cima && baixo && Math.abs(cima.cor.luminosidade - baixo.cor.luminosidade) >= 20) nota += 1;

  // Peça de frio em cima e short embaixo não conversam (manga longa ou
  // moletom com short).
  if (
    baixo?.categoria === 'SHORT' &&
    cima &&
    (cima.manga === 'LONGA' || cima.aquecimento === 'QUENTE')
  ) {
    nota -= 3;
  }

  return nota;
}

/** Média das vistas: com camada fechada, as duas pesam igual. */
function notaDeHarmonia(look: PecaRica[]) {
  const vistas = vistasDoLook(look);
  return vistas.reduce((soma, vista) => soma + harmoniaDaVista(vista), 0) / vistas.length;
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
        notaDaPeca(p, intencao, anteriores, recentes) -
          (opcoes.encontro && FORA_DO_TOM_NO_ENCONTRO.includes(p.categoria)
            ? PENALIDADE_NO_ENCONTRO
            : 0) +
          aleatorio() * VARIACAO_ALEATORIA,
      );
    }
    return notas.get(p.id)!;
  };
  const todasAsPecas = marcarCamadaDoLookAnterior(pecasDoArmario.map(enriquecer), anteriores);

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

  // "Põe uma blusa / um moletom por cima": com um look na tela, a peça de cima
  // pedida como camada vai por cima da que já está, e não no lugar dela. No
  // Brasil, "blusa" nesse sentido é agasalho; sem blusa, vale moletom ou jaqueta.
  const pedeCamada = intencao.trocar.includes('CAMADA') && doLookAnterior.length > 0;
  const resolverComoCamada = (pedido: PecaDesejada) => {
    const tentativas = AGASALHOS_POR_PEDIDO[pedido.categoria ?? ''] ?? [pedido.categoria];
    for (const [i, categoria] of tentativas.entries()) {
      const semAviso: string[] = [];
      // Só a categoria tentada e fora do look da tela: sem isso, "blusa" caía
      // nas parecidas e achava a própria camiseta do look.
      const daCategoria = pecas.filter((p) => p.categoria === categoria && !anteriores.has(p.id));
      const achadas = resolverPedido({ ...pedido, categoria }, daCategoria, semAviso);
      if (achadas.length) {
        avisos.push(...semAviso);
        // Pediu moletom e só tem jaqueta: a resposta diz, para não parecer engano.
        const sinonimo =
          pedido.categoria &&
          SINONIMOS_DE_AGASALHO.includes(pedido.categoria) &&
          categoria &&
          SINONIMOS_DE_AGASALHO.includes(categoria);
        if (i > 0 && categoria && !sinonimo) {
          avisos.push(
            `Não achei ${descreverPedido(pedido)} no seu armário; coloquei ${NOME_CATEGORIA[categoria].toLowerCase()}.`,
          );
        }
        // Peça de cima vestida por cima de outra: no look, ela é a camada.
        const camadas = achadas.map((p) =>
          p.papel === 'SUPERIOR' ? { ...p, papel: 'SOBREPOSICAO' as const } : p,
        );
        pecas = pecas.map((p) => camadas.find((c) => c.id === p.id) ?? p);
        return camadas;
      }
    }
    avisos.push(`Não achei ${descreverPedido(pedido)} no seu armário.`);
    return [];
  };

  // Cada pedido com os avisos dele à parte, para decidir abaixo quais valem.
  const resolvidos = intencao.incluir.map((pedido) => {
    const antes = avisos.length;
    const achadas =
      pedeCamada && pedido.categoria && AGASALHOS_POR_PEDIDO[pedido.categoria]
        ? resolverComoCamada(pedido)
        : resolverPedido(pedido, pecas, avisos);
    return { achadas, avisos: avisos.splice(antes) };
  });

  // "Troca o moletom" sem dizer por qual: entra outra peça do mesmo tipo como
  // camada (ou, sem nenhuma, um agasalho parecido). Sem isso, a camada só saía.
  const camadaTrocada = doLookAnterior.find(
    (p) => trocadas.has(p.id) && p.papel === 'SOBREPOSICAO',
  );
  let novaCamada: PecaRica[] = [];
  if (camadaTrocada && !intencao.incluir.length) {
    const antes = avisos.length;
    novaCamada = resolverComoCamada({
      categoria: camadaTrocada.categoria,
      cor: null,
      material: null,
    });
    if (!novaCamada.length) {
      avisos.splice(antes);
      avisos.push('Não encontrei outra peça para usar por cima no seu armário.');
    }
  }

  // "Moletom ou jaqueta": o grupo vira uma obrigatória só, cumprida por
  // qualquer uma. Se alguma opção foi achada, o "não achei" das outras sai.
  const grupos = opcoes.alternativas ?? [];
  const deAlgumGrupo = new Set(grupos.flat());
  const deAlternativas = grupos.map((grupo) => {
    const membros = grupo.map((i) => resolvidos[i]).filter(Boolean);
    const achadas = membros.flatMap((m) => m.achadas);
    if (!achadas.length) avisos.push(...membros.flatMap((m) => m.avisos));
    return achadas;
  });
  const avulsas = resolvidos
    .filter((_, i) => !deAlgumGrupo.has(i))
    .map((r) => {
      avisos.push(...r.avisos);
      return r.achadas;
    });

  // "Quero usar X" e as peças mantidas do look anterior entram mesmo fora da
  // ocasião: foi o usuário quem escolheu.
  const obrigatorias = [...avulsas, ...deAlternativas, novaCamada, ...fixas.map((p) => [p])].filter(
    (lista) => lista.length > 0,
  );
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

  const pecasDoLook = [...escolhido.pecas].sort(
    (a, b) => ORDEM_DOS_PAPEIS.indexOf(a.papel) - ORDEM_DOS_PAPEIS.indexOf(b.papel),
  );

  return {
    status: 'LOOK',
    pecas: pecasDoLook.map((p) => ({ id: p.id, papel: p.papel })),
    descricao: pecasDoLook.map(descreverPeca).join(' + '),
    descricaoDaTroca: trocados.size
      ? pecasDoLook
          .filter((p) => !anteriores.has(p.id))
          .map(descreverPeca)
          .join(' e ') || null
      : null,
    avisos,
  };
}
