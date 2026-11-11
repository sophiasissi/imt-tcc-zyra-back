import { Categoria, Material, Peca } from '@prisma/client';

import {
  CorPeca,
  corBateComPedido,
  corDaPeca,
  DISTANCIA_MAXIMA_PEDIDO,
  distanciaAoPedido,
  eNeutra,
} from './cor';
import { temConjunto } from './conjunto';
import { Intencao, ParteDoLook, PecaDesejada } from './interpretar-pedido';
import { NOME_CATEGORIA, NOME_MATERIAL, nomeDaPeca } from './nome-da-peca';
import {
  compatibilidade,
  ContextoOcasiao,
  eAlfaiataria,
  notaDeOcasiao,
  SUGESTAO_DE_CADASTRO,
  temSalto,
} from './ocasioes';
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
  | 'decotada'
  | 'curta'
  | 'cano'
  | 'salto'
  | 'corNome'
  | 'hex'
  | 'colorAddSymbol'
> &
  // Opcionais: as peças analisadas antes de 10/11/2026 (e os testes antigos) não têm.
  Partial<Pick<Peca, 'alfaiataria' | 'colarinho' | 'colorAddSymbolSecundario' | 'casacoPesado'>>;

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
   * Quando cada peça apareceu pela última vez num look sugerido, em qualquer
   * conversa (`Peca.sugeridaEm`). A usada há pouco perde pontos.
   */
  ultimoUso?: Map<string, Date>;
  /** Relógio, injetável nos testes. */
  agora?: Date;
  /**
   * Pedidos com "ou" ("moletom ou jaqueta"), como grupos de índices de
   * intencao.incluir: basta uma peça de cada grupo estar no look.
   */
  alternativas?: number[][];
  /** Look para um encontro: peça com gola (camisa) fica formal demais. */
  encontro?: boolean;
  /** Look para balada: sem saia longa, e tênis no lugar do salto. */
  balada?: boolean;
  /** A mensagem pede salto ("troca por um salto"): na balada, ele volta a valer. */
  pediuSalto?: boolean;
  /**
   * Dia ameno que pede uma camada leve (tarde abaixo de 20 °C ou manhã abaixo
   * de 16 °C, pela previsão). Sem isso, jaqueta e casaco só entram no frio.
   */
  camadaLeve?: boolean;
  /**
   * Previsão de chuva no dia (60% ou mais): sandália e chinelo pesam contra,
   * e o linho também (amassa e mancha molhado).
   */
  chuva?: boolean;
  /**
   * Pedido de conforto ("look confortável", viagem, estrada): tecido macio e
   * peça solta na frente; couro, alfaiataria e peça curta ou estruturada atrás.
   */
  conforto?: boolean;
  /**
   * Frio forte: 13 °C ou menos no horário do evento (ou "muito frio" dito pela
   * pessoa). Só aí entra o casaco pesado (puffer, parka, sobretudo).
   */
  frioForte?: boolean;
  /**
   * Comprimento pedido para saia e vestido ("quero uma saia mais curta",
   * "vestido longo"): só entram os desse comprimento.
   */
  comprimento?: 'CURTA' | 'LONGA' | null;
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
 * Jantar romântico e date (pedido da Sophia, 10/11/2026: "Jantar romântico
 * hoje à noite" veio com camiseta básica com logo, jaqueta grossa, jeans
 * estampado e tênis). Pelos guias de date: peças lisas e arrumadas, vestido
 * ou saia midi, blusa elegante, tecido com caimento (cetim, seda, viscose),
 * alfaiataria ou jeans liso, e sapato, sandália ou bota no lugar do tênis.
 * Camiseta básica, logo, moletom e streetwear ficam para o dia a dia.
 */
function notaDoEncontro(peca: PecaRica) {
  let nota = 0;
  if (peca.estilo === 'ELEGANTE') nota += 2;
  if (peca.estilo === 'BASICO' || peca.estilo === 'STREETWEAR') nota -= 2;
  if (peca.estampa === 'LOGO') nota -= 3;
  if (peca.categoria === 'CAMISETA') nota -= 1.5;
  if (peca.categoria === 'BLUSA' || peca.categoria === 'BODY') nota += 1;
  if (peca.categoria === 'VESTIDO' && peca.curta !== true) nota += 1.5;
  if (peca.categoria === 'SAIA' && peca.curta === false) nota += 1;
  if (peca.material === 'CETIM' || peca.material === 'VELUDO' || peca.material === 'VISCOSE') {
    nota += 1;
  }
  if (eAlfaiataria(peca) && peca.papel !== 'SUPERIOR') nota += 1;
  if (peca.material === 'MOLETOM' || peca.material === 'SOFT') nota -= 4;
  // Nos pés: sapato, sandália ou bota; o tênis ainda serve, mas não é o primeiro.
  if (peca.categoria === 'TENIS') nota -= 2;
  if (temSalto(peca) || peca.categoria === 'BOTA') nota += 1.5;
  return nota;
}

// Balada (pedido da Sophia, 05/11/2026): o vestido longo pesa contra; a saia
// longa sai, e o tênis vem no lugar do sapato e da sandália de salto. A bota
// fica (over the knee e western são de balada, pela lista dela).
const PENALIDADE_VESTIDO_LONGO_NA_BALADA = 2;
const SALTOS_SEM_BOTA: Categoria[] = ['SAPATO', 'SANDALIA'];

/**
 * Peça fora da balada: saia que não é curta e, quando há um tênis que serve,
 * o sapato e a sandália de salto. A pedida pelo nome entra ("troca por um
 * salto"). A saia sem comprimento gravado (peça antiga) fica.
 */
function foraDaBalada(peca: PecaRica, temTenis: boolean) {
  if (peca.categoria === 'SAIA' && peca.curta === false) return true;
  return temTenis && SALTOS_SEM_BOTA.includes(peca.categoria) && temSalto(peca);
}

/**
 * Passeio do dia a dia (shopping, parque, faculdade): sem salto. Pelas
 * matérias de estilo, o salto é de evento, reunião e ocasião formal; para
 * andar e ficar em pé, tênis, rasteira, sapatilha ou bota baixa. O encontro
 * (date), que também usa DIA_A_DIA, pode ter salto.
 */
function foraDoPasseio(peca: PecaRica) {
  return temSalto(peca);
}

/**
 * Look com conjunto inteiro (pedido da Sophia, 10/11/2026: "tenho vários
 * conjuntos de trabalho e de festa"). Fica dentro da margem do sorteio: o
 * conjunto aparece mais, mas não toda vez.
 */
const BONUS_DO_CONJUNTO = 1.5;
// Casaco grosso fora do frio: maior que a margem do sorteio, para o leve ganhar.
const PENALIDADE_CASACO_GROSSO = 4;
// A mais, no pedido de conforto, para o conjunto de moletom.
const BONUS_DO_CONJUNTO_DE_MOLETOM = 3;

// No calor (máxima de 25 °C ou mais), manga curta: a longa só se não houver outra.
const PENALIDADE_MANGA_LONGA_NO_CALOR = 4;

/**
 * No look da tela, a peça de cima vestida por cima de outra (moletom sobre a
 * camiseta) é a camada. Sem isso, "troca o moletom" não achava camada para
 * trocar, e "outro moletom" somava uma terceira peça de cima ao look.
 */
function marcarCamadaDoLookAnterior(pecas: PecaRica[], anteriores: Set<string>): PecaRica[] {
  const papeis = papeisNoLook(pecas.filter((p) => anteriores.has(p.id)));
  return pecas.map((p) => {
    if (papeis.get(p.id) === 'SOBREPOSICAO' && p.papel === 'SUPERIOR') {
      return { ...p, papel: 'SOBREPOSICAO' };
    }
    // O colete que estava sozinho, como blusa, continua sendo a parte de cima.
    if (papeis.get(p.id) === 'SUPERIOR' && p.papel === 'SOBREPOSICAO') {
      return { ...p, papel: 'SUPERIOR' };
    }
    return p;
  });
}

/**
 * Rodízio entre conversas (pedido da Sophia, 05/11/2026: "sempre me mostra as
 * mesmas roupas"). A peça que saiu num look sugerido perde pontos, e a perda
 * cai pela metade a cada 3 dias. Ela só perde para uma peça tão boa quanto
 * ela para o pedido: a de alfaiataria usada ontem ainda ganha do jeans no
 * trabalho, mas reveza com outra de alfaiataria. Precisa passar de
 * MARGEM_SORTEIO + VARIACAO_ALEATORIA (3): com 2,5, a peça usada há minutos
 * ainda caía no sorteio de vez em quando.
 */
const PENALIDADE_USO_RECENTE = 3.5;
const MEIA_VIDA_DO_USO_HORAS = 72;

export function penalidadeDeUso(sugeridaEm: Date | undefined, agora: Date) {
  if (!sugeridaEm) return 0;
  const horas = Math.max(0, (agora.getTime() - sugeridaEm.getTime()) / 3_600_000);
  return PENALIDADE_USO_RECENTE * 0.5 ** (horas / MEIA_VIDA_DO_USO_HORAS);
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
export const NOMES_FEMININOS = [
  'Camiseta',
  'Camisa',
  'Blusa',
  'Regata',
  'Jaqueta',
  'Calça',
  'Saia',
  'Sandália',
  'Bota',
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
  Dourado: 'Dourada',
  Prateado: 'Prateada',
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
  BLUSA: ['BLUSA', 'MOLETOM', 'SUETER', 'JAQUETA'],
  MOLETOM: ['MOLETOM', 'BLUSA', 'SUETER', 'JAQUETA'],
  SUETER: ['SUETER', 'MOLETOM', 'BLUSA', 'JAQUETA'],
  CAMISA: ['CAMISA'],
};

// Blusa, moletom e suéter são sinônimos para quem pede um agasalho: trocar um
// pelo outro não precisa de aviso. Ir para a jaqueta precisa.
const SINONIMOS_DE_AGASALHO: Categoria[] = ['BLUSA', 'MOLETOM', 'SUETER'];

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
  const permitida = (p: PecaRica) =>
    compatibilidade(p, ocasiao, contextoDaIntencao(intencao)) !== 'PROIBIDA' &&
    !proibidaPeloClima(p, intencao.aquecimento);
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

const contextoDaIntencao = (intencao: Intencao): ContextoOcasiao => ({
  formalidade: intencao.formalidade,
  aquecimento: intencao.aquecimento,
  periodo: intencao.periodo ?? null,
});

const botaDeCanoAlto = (peca: PecaMotor) =>
  peca.categoria === 'BOTA' && (peca.cano === 'LONGO' || peca.cano === 'ACIMA_DO_JOELHO');

/**
 * Peças que o clima tira do look. "Frio" é o aquecimento QUENTE (o look
 * precisa esquentar): short e chinelo saem. No calor, sai a bota de cano
 * longo ou over the knee (as outras peças quentes saem em montarLook).
 */
function proibidaPeloClima(peca: PecaRica, aquecimento: Intencao['aquecimento']) {
  if (aquecimento === 'LEVE') return botaDeCanoAlto(peca);
  return aquecimento === 'QUENTE' && (peca.categoria === 'SHORT' || peca.categoria === 'CHINELO');
}

/** Peças de pouco tecido que pesam contra no frio e no clima ameno, sem proibir. */
function notaDoClima(peca: PecaRica, aquecimento: Intencao['aquecimento']) {
  let nota = 0;
  if (aquecimento === 'QUENTE') {
    if (peca.categoria === 'SANDALIA') nota -= 3;
    // A bota protege do frio; a de cano longo cobre a perna.
    if (peca.categoria === 'BOTA') nota += botaDeCanoAlto(peca) ? 2 : 1;
    // Saia e vestido leves deixam a perna de fora.
    if ((peca.categoria === 'SAIA' || peca.papel === 'PECA_UNICA') && peca.aquecimento === 'LEVE') {
      nota -= 2;
    }
  }
  if (aquecimento === 'MEDIO') {
    // Clima ameno costuma ter manhã e noite frias (ex.: 13 a 25 °C).
    if (peca.categoria === 'SHORT') nota -= 2;
    if (peca.categoria === 'CHINELO') nota -= 1;
    // A bota de cano curto é de meia-estação.
    if (peca.categoria === 'BOTA' && peca.cano === 'CURTO') nota += 0.5;
  }
  if (aquecimento === 'LEVE' && peca.categoria === 'BOTA') {
    // A de cano curto ainda vai numa noite fresca de verão.
    nota -= peca.cano === 'CURTO' ? 1 : 2;
  }
  return nota;
}

/**
 * Chuva (60% ou mais na previsão): pé molhado na sandália e no chinelo, e o
 * linho amassa e mancha. Na praia e em casa, o chinelo continua.
 */
function notaDaChuva(peca: PecaRica, ocasiao: Intencao['ocasiao']) {
  if (peca.categoria === 'SANDALIA') return -3;
  if (peca.categoria === 'CHINELO') return ocasiao === 'PRAIA' || ocasiao === 'CASA' ? 0 : -3;
  if (peca.material === 'LINHO') return -1;
  return 0;
}

/**
 * Conforto (pedido da Sophia, 10/11/2026: "look confortável para uma viagem
 * de carro longa" veio com cropped de couro e calça de couro de alfaiataria, e
 * o conjunto de moletom ficou de fora). Pelos guias de viagem: horas sentado
 * pedem tecido macio e com elasticidade (moletom, malha, algodão, linho),
 * camadas para o ar-condicionado e tênis; couro, jeans duro e alfaiataria
 * incomodam. As notas passam a margem do sorteio: o moletom vem na frente.
 */
const CONFORTO_DO_MATERIAL: Partial<Record<Material, number>> = {
  MOLETOM: 4,
  MALHA: 2,
  TRICO: 1,
  VISCOSE: 1,
  POLIAMIDA: 1,
  LINHO: 0.5,
  JEANS: -1.5,
  VELUDO: -1,
  CETIM: -3,
  COURO: -5,
};
const CONFORTO_DA_CATEGORIA: Partial<Record<Categoria, number>> = {
  TENIS: 2,
  CROPPED: -2,
  TOP: -2,
  CAMISA: -1,
  BOTA: -2,
  BLAZER: -3,
  COLETE: -3,
  CORSET: -5,
};

function notaDeConforto(peca: PecaRica) {
  let nota = (peca.material ? CONFORTO_DO_MATERIAL[peca.material] : 0) ?? 0;
  nota += CONFORTO_DA_CATEGORIA[peca.categoria] ?? 0;
  if (eAlfaiataria(peca)) nota -= 4;
  if (peca.decotada) nota -= 2;
  // Gola de camisa (polo) é peça de trabalho, estruturada.
  if (peca.colarinho) nota -= 1.5;
  // O moletom é a peça mais quente: no conforto, não perde por isso.
  if (peca.material === 'MOLETOM' && peca.aquecimento === 'QUENTE') nota += 1.5;
  return nota;
}

// Por nível de aquecimento entre a peça e o clima (LEVE, MEDIO, QUENTE).
const PENALIDADE_DE_AQUECIMENTO = 1.5;

/** Nota de uma peça sozinha, para escolher os candidatos de cada papel. */
function notaDaPeca(
  peca: PecaRica,
  intencao: Intencao,
  anteriores: Set<string>,
  recentes: Set<string> = new Set(),
) {
  let nota = 0;

  nota += notaDeOcasiao(peca, intencao.ocasiao, contextoDaIntencao(intencao));
  nota += notaDoClima(peca, intencao.aquecimento);
  if (intencao.estilo && peca.estilo === intencao.estilo) nota += 1.5;
  if (intencao.formalidade) {
    nota -=
      2 * Math.abs(NIVEL_FORMALIDADE[peca.formalidade] - NIVEL_FORMALIDADE[intencao.formalidade]);
  }
  if (intencao.aquecimento && peca.aquecimento) {
    nota -=
      PENALIDADE_DE_AQUECIMENTO *
      Math.abs(NIVEL_DE_AQUECIMENTO[peca.aquecimento] - NIVEL_DE_AQUECIMENTO[intencao.aquecimento]);
  }
  // Manga longa no calor e sem manga no frio pesam contra, sem proibir.
  if (intencao.aquecimento === 'LEVE' && peca.manga === 'LONGA') {
    nota -= PENALIDADE_MANGA_LONGA_NO_CALOR;
  }
  if (intencao.aquecimento === 'QUENTE' && peca.manga === 'SEM_MANGA') nota -= 1.5;
  if (intencao.paletaNeutra && !peca.neutra) nota -= 10;
  // Look de uma cor: as peças da cor pedida sobem na fila de candidatas.
  const corDoLook = intencao.corDoLook;
  if (
    corDoLook &&
    peca.cor.familia === corDoLook.familia &&
    (!corDoLook.tom || peca.cor.tom === corDoLook.tom)
  ) {
    nota += 3;
  }
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
  // O corte de alfaiataria conta como o tecido de alfaiataria, e o tecido
  // ALFAIATARIA antigo só vale com o corte.
  const materiais = new Set(
    look.map((p) => p.material).filter((m): m is Material => !!m && m !== 'ALFAIATARIA'),
  );
  if (look.some(eAlfaiataria)) materiais.add('ALFAIATARIA');
  return MATERIAIS_QUE_NAO_COMBINAM.some(
    ([material, outros]) => materiais.has(material) && outros.some((m) => materiais.has(m)),
  );
}

// Camadas fechadas: vestidas, cobrem a peça de cima. Jaqueta e blazer
// costumam ficar abertos e deixam a peça de baixo à mostra.
const CAMADAS_FECHADAS: Categoria[] = ['MOLETOM', 'SUETER', 'BLUSA'];
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

// Tecidos de casaco que já são agasalho: moletom por baixo deles é demais.
const AGASALHOS_GROSSOS: Material[] = ['MOLETOM', 'TRICO', 'SOFT'];

// Regra das 3 cores (pedido da Sophia, 23/10/2026).
const MAXIMO_DE_CORES = 3;

/** "AZUL_CLARO", "PRETO_": a cor exata da peça, família e tom. */
const chaveDaCor = (peca: PecaRica) => `${peca.cor.familia}_${peca.cor.tom ?? ''}`;

/**
 * Regras gerais de harmonia, valem para qualquer pessoa. No look de uma cor,
 * as duas peças do mesmo tom contam como um destaque só.
 */
function harmoniaDaVista(look: PecaRica[], agruparMesmaCor: boolean) {
  let nota = 0;

  if (materiaisNaoCombinam(look)) nota -= 10;

  // Regra das 3 cores: no máximo três cores distintas à vista, contando as
  // neutras (preto, branco, cinza, bege...). Tons da mesma cor contam como
  // uma: azul claro com azul escuro é tom sobre tom.
  if (new Set(look.map((p) => p.cor.familia)).size > MAXIMO_DE_CORES) nota -= PENALIDADE_FORTE;

  // Uma peça só chama a atenção (cor forte ou estampa marcante); o resto
  // fica neutro. Tênis colorido pede camiseta e calça neutras.
  const destaques = look.filter(chamaAtencao);
  const chamativas = agruparMesmaCor ? new Set(destaques.map(chaveDaCor)).size : destaques.length;
  if (chamativas > 1) nota -= 6 * (chamativas - 1);

  // Peças de formalidades muito diferentes não combinam (ex.: blazer com tênis esportivo).
  const niveis = look.map((p) => NIVEL_FORMALIDADE[p.formalidade]);
  if (Math.max(...niveis) - Math.min(...niveis) > 1) nota -= 3;
  // Roupa de treino com peça social ou de alfaiataria é quase proibido
  // (10/11/2026): a camiseta dry-fit saiu com a calça de alfaiataria. Só
  // acontece com peça pedida pelo nome, porque o treino só entra na atividade
  // física, onde a peça social já é proibida.
  if (
    look.some((p) => p.estilo === 'ESPORTIVO') &&
    look.some((p) => p.formalidade === 'ALTA' || eAlfaiataria(p))
  ) {
    nota -= PENALIDADE_FORTE;
  }

  // Contraste de claridade entre a parte de cima e a de baixo ajuda o look a
  // "ler" bem. Com o moletom fechado, a parte de cima que aparece é ele.
  const cima =
    look.find((p) => p.papel === 'SUPERIOR') ?? look.find((p) => p.papel === 'SOBREPOSICAO');
  const baixo = look.find((p) => p.papel === 'INFERIOR');
  if (cima && baixo && Math.abs(cima.cor.luminosidade - baixo.cor.luminosidade) >= 20) nota += 1;

  // Moletom por baixo de casaco de moletom, tricô ou soft: dois agasalhos
  // grossos, um sobre o outro.
  const camada = look.find((p) => p.papel === 'SOBREPOSICAO');
  if (
    camada?.material &&
    AGASALHOS_GROSSOS.includes(camada.material) &&
    look.some(
      (p) => p.papel === 'SUPERIOR' && (p.categoria === 'MOLETOM' || p.categoria === 'SUETER'),
    )
  ) {
    nota -= 6;
  }

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

/** Peça de cima (ou vestido) que deixa o braço ou o ombro de fora. */
function deixaOBracoDeFora(peca: PecaRica, mangas: PecaRica['manga'][]) {
  if (peca.papel !== 'SUPERIOR' && peca.papel !== 'PECA_UNICA') return false;
  if (peca.manga) return mangas.includes(peca.manga);
  // Sem manga gravada (peças antigas): a peça leve conta como de verão.
  return peca.aquecimento === 'LEVE';
}

// Quase uma proibição: a regra só perde para um pedido do usuário que não
// tenha outra saída (ex.: "quero o top", sem nenhuma camada no armário).
const PENALIDADE_FORTE = 20;

/**
 * Bota com a parte de baixo (lista da Sophia, 05/11/2026):
 * - over the knee: com minissaia, vestido curto ou short; com saia ou
 *   vestido abaixo do joelho, o cano some e a perna fica escondida;
 * - cano longo: com saia lápis ou midi e vestido abaixo do joelho (a bota
 *   continua a linha da perna) e com legging por dentro do cano;
 * - cano médio: com saia jeans, short e vestido midi;
 * - cano curto: vai com tudo; com perna de fora, alonga a perna.
 */
function notaDaBota(look: PecaRica[]) {
  const bota = look.find((p) => p.categoria === 'BOTA');
  if (!bota?.cano) return 0;

  const baixo = look.find((p) => p.papel === 'INFERIOR' || p.papel === 'PECA_UNICA');
  if (!baixo) return 0;

  const saiaOuVestido = baixo.categoria === 'SAIA' || baixo.categoria === 'VESTIDO';
  const pernaDeFora = baixo.categoria === 'SHORT' || (saiaOuVestido && baixo.curta === true);
  const abaixoDoJoelho = saiaOuVestido && baixo.curta === false;
  const legging = baixo.categoria === 'CALCA' && baixo.material === 'POLIAMIDA';

  switch (bota.cano) {
    case 'ACIMA_DO_JOELHO':
      if (pernaDeFora) return 2;
      return abaixoDoJoelho ? -2 : 0;
    case 'LONGO':
      if (abaixoDoJoelho) return 1.5;
      return legging ? 1 : 0;
    case 'MEDIO':
      if (baixo.categoria === 'SHORT') return 1;
      if (baixo.categoria === 'SAIA' && baixo.material === 'JEANS') return 1;
      return baixo.categoria === 'VESTIDO' && baixo.curta === false ? 1 : 0;
    case 'CURTO':
      return pernaDeFora ? 0.5 : 0;
  }
}

const temCamadaComManga = (look: PecaRica[]) =>
  look.some((p) => p.papel === 'SOBREPOSICAO' && p.manga !== 'SEM_MANGA');

/**
 * No trabalho, peça sem manga (alça, ombro de fora) só entra com uma camada
 * de manga por cima, como o blazer; o colete não cobre. É proibição, e não
 * nota: com nota, o look sem manga saía quando o armário não tinha outro.
 * Só vale para peças que o motor escolheu: se a pessoa pediu a peça, ela entra.
 * O colete sozinho, como blusa, fica de fora da regra: colete e calça é um
 * look de trabalho (pedido da Sophia, 05/11/2026).
 */
function bracoDeForaNoTrabalho(look: PecaRica[], intencao: Intencao, pedidas: Set<PecaRica>) {
  return (
    intencao.ocasiao === 'TRABALHO' &&
    !temCamadaComManga(look) &&
    look.some(
      (p) =>
        p.papel !== 'SOBREPOSICAO' &&
        p.categoria !== 'COLETE' &&
        p.manga === 'SEM_MANGA' &&
        !pedidas.has(p),
    )
  );
}

/**
 * No frio, peça de manga curta ou sem manga só com uma camada de manga; no
 * clima ameno, a sem manga sem camada pesa um pouco.
 */
function notaDeCobertura(look: PecaRica[], intencao: Intencao) {
  if (temCamadaComManga(look)) return 0;

  let nota = 0;
  if (
    intencao.aquecimento === 'QUENTE' &&
    look.some((p) => deixaOBracoDeFora(p, ['SEM_MANGA', 'CURTA']))
  ) {
    nota -= PENALIDADE_FORTE;
  }
  if (intencao.aquecimento === 'MEDIO' && look.some((p) => deixaOBracoDeFora(p, ['SEM_MANGA']))) {
    nota -= 1.5;
  }
  return nota;
}

/** Short, minissaia ou vestido curto: a perna fica de fora. */
const mostraAsPernas = (p: PecaRica) =>
  p.categoria === 'SHORT' ||
  ((p.categoria === 'SAIA' || p.categoria === 'VESTIDO') && p.curta === true);

// Perna de fora no tempo fresco (pedido da Sophia, 10/11/2026: cinema à noite
// com 16 a 18 °C veio de saia). Pela tabela de roupa por temperatura, abaixo
// de 20 °C já pede casaco, e à noite esfria mais; a saia midi ou longa cobre.
const PENALIDADE_PERNA_NO_FRESCO = 4;
const PENALIDADE_PERNA_NO_FRIO = 8;

/**
 * Perna de fora no fresco e no frio. A bota de cano longo ou over the knee
 * cobre a perna: minissaia com over the knee é look de inverno.
 */
function notaDasPernas(look: PecaRica[], intencao: Intencao, fresco: boolean) {
  if (!look.some(mostraAsPernas) || look.some(botaDeCanoAlto)) return 0;
  if (intencao.aquecimento === 'QUENTE') return -PENALIDADE_PERNA_NO_FRIO;
  if (intencao.aquecimento === 'MEDIO' && fresco) return -PENALIDADE_PERNA_NO_FRESCO;
  return 0;
}

/**
 * Peça de cima que mostra o corpo: top e cropped (barriga), decote, e sem
 * manga quando não há casaco de manga por cima. Moletom ou blusa fechada por
 * cima cobre tudo; jaqueta e blazer abertos ainda deixam a barriga e o decote.
 */
function cimaAMostra(look: PecaRica[]) {
  const camada = look.find((p) => p.papel === 'SOBREPOSICAO');
  if (camada && CAMADAS_FECHADAS.includes(camada.categoria)) return false;
  return look.some(
    (p) =>
      (p.papel === 'SUPERIOR' || p.papel === 'PECA_UNICA') &&
      (p.categoria === 'TOP' ||
        p.categoria === 'CROPPED' ||
        p.decotada === true ||
        (p.manga === 'SEM_MANGA' && p.categoria !== 'COLETE' && !temCamadaComManga(look))),
  );
}

// Onde mostrar mais pele não é problema: praia, festa e balada, academia, e
// qualquer lugar no calor.
const OCASIOES_SEM_EQUILIBRIO: Intencao['ocasiao'][] = ['PRAIA', 'FESTA', 'ACADEMIA'];

/**
 * Equilíbrio do look (pedido da Sophia, 10/11/2026; a "regra da compensação"
 * das consultoras de estilo): mostra a parte de cima ou a de baixo, não as
 * duas. Top com minissaia é quase proibido no passeio, no trabalho e em casa;
 * na praia, na festa, na academia e no calor, vale.
 */
function notaDoEquilibrio(look: PecaRica[], intencao: Intencao) {
  if (OCASIOES_SEM_EQUILIBRIO.includes(intencao.ocasiao) || intencao.aquecimento === 'LEVE') {
    return 0;
  }
  return look.some(mostraAsPernas) && cimaAMostra(look) ? -PENALIDADE_FORTE : 0;
}

/**
 * Look de uma cor (pedido da Sophia, 23/10/2026): exatamente duas peças da
 * mesma cor e do mesmo tom (azul claro com azul claro), nenhuma outra peça
 * daquela cor e o resto neutro. Três peças da mesma cor pesam demais.
 * Devolve a cor do par ou null se o look não serve.
 */
function parDoLookDeUmaCor(look: PecaRica[], corPedida: Intencao['corDoLook']) {
  const porCor = new Map<string, PecaRica[]>();
  for (const peca of look)
    porCor.set(chaveDaCor(peca), [...(porCor.get(chaveDaCor(peca)) ?? []), peca]);

  for (const par of porCor.values()) {
    // O par é de roupas: o calçado completa o look, e um sapato da mesma cor
    // seria a terceira peça daquela cor.
    if (par.length !== 2 || par.some((p) => p.papel === 'CALCADO')) continue;
    const { familia, tom } = par[0].cor;
    if (corPedida && (corPedida.familia !== familia || (corPedida.tom && corPedida.tom !== tom))) {
      continue;
    }
    const resto = look.filter((p) => !par.includes(p));
    if (resto.every((p) => p.cor.familia !== familia && p.neutra)) return par;
  }
  return null;
}

function nomeDaCor(cor: NonNullable<Intencao['corDoLook']>) {
  const familia = cor.familia === 'CASTANHO' ? 'marrom' : cor.familia.toLowerCase();
  return cor.tom ? `${familia} ${cor.tom.toLowerCase()}` : familia;
}

/** Média das vistas: com camada fechada, as duas pesam igual. */
function notaDeHarmonia(look: PecaRica[], agruparMesmaCor = false) {
  const vistas = vistasDoLook(look);
  return (
    vistas.reduce((soma, vista) => soma + harmoniaDaVista(vista, agruparMesmaCor), 0) /
    vistas.length
  );
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
  // Moletom de 14 a 20 °C (pedido da Sophia, 10/11/2026): no ameno que pede
  // camada leve (tarde abaixo de 20 °C ou manhã/noite abaixo de 16 °C), o
  // moletom não perde por esquentar muito. No frio, ele já vale.
  const moletomNoFresco = (p: PecaRica | null) =>
    p !== null &&
    p.material === 'MOLETOM' &&
    intencao.aquecimento === 'MEDIO' &&
    Boolean(opcoes.camadaLeve);
  const anteriores = new Set(opcoes.pecasAnteriores ?? []);
  const recentes = new Set(opcoes.pecasRecentes ?? []);
  const ultimoUso = opcoes.ultimoUso ?? new Map<string, Date>();
  const agora = opcoes.agora ?? new Date();
  const avisos: string[] = [];

  // Nota de cada peça com um pequeno desempate aleatório, sorteado uma vez por pedido.
  const notas = new Map<string, number>();
  const nota = (p: PecaRica) => {
    if (!notas.has(p.id)) {
      notas.set(
        p.id,
        notaDaPeca(p, intencao, anteriores, recentes) -
          penalidadeDeUso(ultimoUso.get(p.id), agora) -
          (opcoes.encontro && FORA_DO_TOM_NO_ENCONTRO.includes(p.categoria)
            ? PENALIDADE_NO_ENCONTRO
            : 0) +
          (opcoes.encontro ? notaDoEncontro(p) : 0) -
          (opcoes.balada && p.categoria === 'VESTIDO' && p.curta === false
            ? PENALIDADE_VESTIDO_LONGO_NA_BALADA
            : 0) +
          (opcoes.chuva ? notaDaChuva(p, intencao.ocasiao) : 0) +
          (opcoes.conforto ? notaDeConforto(p) : 0) +
          (moletomNoFresco(p) ? PENALIDADE_DE_AQUECIMENTO : 0) +
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

  // Comprimento pedido ("troque a saia, quero uma mais curta"): a saia e o
  // vestido de outro comprimento saem. Sem a informação (`curta` nulo), a peça
  // também sai: não dá para garantir o que a pessoa pediu.
  const comprimentoCerto = (p: PecaRica) =>
    !opcoes.comprimento ||
    (p.categoria !== 'SAIA' && p.categoria !== 'VESTIDO') ||
    p.curta === (opcoes.comprimento === 'CURTA');

  // Restrições que o usuário pediu explicitamente: removem a peça.
  let pecas = todasAsPecas.filter(
    (p) =>
      !trocadas.has(p.id) &&
      comprimentoCerto(p) &&
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
    // "Não achei saia" com comprimento pedido: diz qual faltou.
    const novos = avisos.splice(antes);
    const comprimento = opcoes.comprimento === 'CURTA' ? 'curta' : 'longa';
    return {
      achadas,
      avisos: opcoes.comprimento
        ? novos.map((a) => a.replace(/^Não achei (saia|vestido)\b/, `Não achei $1 ${comprimento}`))
        : novos,
    };
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

  // Peça proibida para a ocasião ou para o clima nunca entra (calça jeans na
  // academia, chinelo na festa, short no frio).
  const contexto = contextoDaIntencao(intencao);
  const permitidasPelaOcasiao = pecas.filter(
    (p) =>
      pedidas.has(p) ||
      (compatibilidade(p, intencao.ocasiao, contexto) !== 'PROIBIDA' &&
        !proibidaPeloClima(p, intencao.aquecimento)),
  );
  const temTenis = !opcoes.pediuSalto && permitidasPelaOcasiao.some((p) => p.categoria === 'TENIS');
  const passeio = intencao.ocasiao === 'DIA_A_DIA' && !opcoes.encontro && !opcoes.pediuSalto;
  const permitidas = permitidasPelaOcasiao.filter(
    (p) =>
      pedidas.has(p) ||
      !((opcoes.balada && foraDaBalada(p, temTenis)) || (passeio && foraDoPasseio(p))),
  );

  // Look de uma cor: o par do mesmo tom pode estar em qualquer lugar da lista,
  // então todas as peças que podem fazer parte dele entram na busca: as
  // neutras e as da cor pedida (ou, sem cor pedida, as de uma cor que tenha
  // pelo menos duas peças do mesmo tom).
  const umaCor = Boolean(intencao.umaCor || intencao.corDoLook);
  const corPedida = intencao.corDoLook ?? null;
  const pecasPorCor = new Map<string, number>();
  for (const p of permitidas)
    pecasPorCor.set(chaveDaCor(p), (pecasPorCor.get(chaveDaCor(p)) ?? 0) + 1);
  const servePara1Cor = (p: PecaRica) =>
    corPedida
      ? (p.neutra && p.cor.familia !== corPedida.familia) ||
        (p.cor.familia === corPedida.familia && (!corPedida.tom || p.cor.tom === corPedida.tom))
      : p.neutra || (pecasPorCor.get(chaveDaCor(p)) ?? 0) >= 2;
  const podeSerDoPar = (p: PecaRica) =>
    corPedida
      ? p.cor.familia === corPedida.familia && (!corPedida.tom || p.cor.tom === corPedida.tom)
      : !p.neutra && (pecasPorCor.get(chaveDaCor(p)) ?? 0) >= 2;
  const porPapel = (papel: Papel) => {
    const daPapel = permitidas.filter(
      (p) => p.papel === papel && (!umaCor || pedidas.has(p) || servePara1Cor(p)),
    );
    const melhores = [...daPapel].sort((a, b) => nota(b) - nota(a)).slice(0, CANDIDATOS_POR_PAPEL);

    // As peças pedidas sempre entram na busca, mesmo fora do corte por nota.
    // No look de uma cor, as que podem formar o par também: o corte por nota
    // só vale para as neutras, que completam o look.
    return [
      ...new Set([
        ...daPapel.filter((p) => pedidas.has(p) || (umaCor && podeSerDoPar(p))),
        ...melhores,
      ]),
    ];
  };

  const superiores = porPapel('SUPERIOR');
  const inferiores = porPapel('INFERIOR');
  const vestidos = porPapel('PECA_UNICA');
  const calcados = porPapel('CALCADO');
  const sobreposicoes = porPapel('SOBREPOSICAO');

  // Colete sozinho, como blusa: "colete e calça" no trabalho (pedido da
  // Sophia, 05/11/2026). Ele continua podendo ir por cima de um body.
  superiores.push(
    ...sobreposicoes
      .filter((p) => p.categoria === 'COLETE' && !superiores.some((s) => s.id === p.id))
      .map((p) => ({ ...p, papel: 'SUPERIOR' as const })),
  );

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
        : intencao.ocasiao === 'CASA'
          ? 'Em casa, o look fica sem calçado: vale chinelo, pantufa ou pé descalço.'
          : intencao.ocasiao && pecas.some((p) => p.papel === 'CALCADO')
            ? `Não encontrei calçado para ${NOME_OCASIAO[intencao.ocasiao]} no seu armário; o look saiu sem calçado.`
            : 'Nenhum calçado seu combina com esse pedido; o look saiu sem calçado.',
    );
  }

  // Frio pede uma camada a mais; no calor ela já foi filtrada.
  const pedeSobreposicao = intencao.aquecimento === 'QUENTE';
  const opcoesDeCalcado: (PecaRica | null)[] = calcados.length ? calcados : [null];
  // Jaqueta ou blazer só entram quando fazem sentido (ou quando o usuário pediu
  // a peça): frio, dia ameno que pede camada leve, pedido formal (menos no
  // calor) ou trabalho sem informação de clima. Antes o trabalho sempre podia
  // ter camada, e a 21-26 °C saía com jaqueta (05/11/2026).
  // Numa troca que não mexe na camada ("não quero salto"), ela fica como
  // estava: a do look anterior (que está entre as fixas) ou nenhuma. Sem isso,
  // trocar o calçado num dia frio acrescentava uma jaqueta que ninguém pediu.
  const camadaFixa = trocados.size > 0 && !trocados.has('SOBREPOSICAO');
  const camadaFazSentido =
    !camadaFixa &&
    (pedeSobreposicao ||
      Boolean(opcoes.camadaLeve) ||
      (intencao.formalidade === 'ALTA' && intencao.aquecimento !== 'LEVE') ||
      (intencao.ocasiao === 'TRABALHO' && intencao.aquecimento === null));
  // No look de uma cor, a camada pode ser metade do par (o casaco do
  // conjunto de moletom).
  // O colete não é agasalho (não tem manga): no trabalho ele compõe o look,
  // por cima do body, em qualquer clima. Fora do trabalho, só se pedido
  // (10/11/2026: no cinema, o colete azul de alfaiataria entrou por cima de um
  // body cinza como "camada leve").
  const coleteNoTrabalho = (p: PecaRica) =>
    p.categoria === 'COLETE' && intencao.ocasiao === 'TRABALHO' && !camadaFixa;
  const opcoesDeSobreposicao: (PecaRica | null)[] =
    camadaFazSentido || (umaCor && !camadaFixa)
      ? [null, ...sobreposicoes]
      : [null, ...sobreposicoes.filter((p) => pedidas.has(p) || coleteNoTrabalho(p))];

  const looks: { pecas: PecaRica[]; nota: number }[] = [];
  let barradosPelaManga = 0;

  for (const base of bases) {
    for (const calcado of opcoesDeCalcado) {
      for (const sobreposicao of opcoesDeSobreposicao) {
        const look = [...base, sobreposicao, calcado].filter((p): p is PecaRica => p !== null);

        // O mesmo colete não é a blusa e a camada do mesmo look, e dois coletes
        // nunca vão juntos (10/11/2026: "quero usar meu colete" veio com um
        // colete como blusa e outro por cima).
        if (sobreposicao && base.some((p) => p.id === sobreposicao.id)) continue;
        if (sobreposicao?.categoria === 'COLETE' && base.some((p) => p.categoria === 'COLETE')) {
          continue;
        }
        // Um pedido de uma categoria ("meu colete", "uma camiseta preta") é uma
        // peça só: as outras que também serviam para ele não entram junto. O
        // pedido por tecido ("meu conjunto de moletom") pode trazer várias.
        if (
          obrigatorias.some(
            (lista) =>
              new Set(lista.map((p) => p.categoria)).size === 1 &&
              look.filter((l) => lista.some((p) => p.id === l.id)).length > 1,
          )
        ) {
          continue;
        }
        // Colete por cima, só de body e só no trabalho: sobre camisa ou blusa
        // a Sophia não usa (05/11/2026), e fora do trabalho ele não é
        // agasalho (10/11/2026). "Meu colete" sozinho não basta para ir por
        // cima da camisa: só quando a peça de baixo também foi pedida ("colete
        // por cima da camisa branca").
        const coletePorCimaPedido =
          sobreposicao !== null &&
          pedidas.has(sobreposicao) &&
          base.some((p) => p.papel === 'SUPERIOR' && pedidas.has(p));
        if (
          sobreposicao?.categoria === 'COLETE' &&
          !coletePorCimaPedido &&
          (intencao.ocasiao !== 'TRABALHO' || !base.some((p) => p.categoria === 'BODY'))
        ) {
          continue;
        }
        // Casaco pesado só com frio forte (13 °C ou menos), a não ser que pedido.
        if (sobreposicao?.casacoPesado && !opcoes.frioForte && !pedidas.has(sobreposicao)) {
          continue;
        }
        // Colete sozinho já é o look: casaco por cima só no frio ou se pedido.
        const coleteSozinho = base.some((p) => p.papel === 'SUPERIOR' && p.categoria === 'COLETE');
        if (coleteSozinho && sobreposicao && !pedeSobreposicao && !pedidas.has(sobreposicao)) {
          continue;
        }

        // Cada "quero usar X" precisa estar no look. Pelo id: o colete usado
        // sozinho é uma cópia da peça, com o papel de parte de cima.
        if (!obrigatorias.every((lista) => lista.some((p) => look.some((l) => l.id === p.id)))) {
          continue;
        }
        if (bracoDeForaNoTrabalho(look, intencao, pedidas)) {
          barradosPelaManga++;
          continue;
        }
        const par = umaCor ? parDoLookDeUmaCor(look, corPedida) : null;
        if (umaCor && !par) continue;
        // Fora do frio e do trabalho, a camada do look de uma cor só entra se
        // for metade do par (o casaco do conjunto) ou se a pessoa pediu.
        if (
          sobreposicao &&
          !camadaFazSentido &&
          !pedidas.has(sobreposicao) &&
          !par?.includes(sobreposicao) &&
          !coleteNoTrabalho(sobreposicao)
        ) {
          continue;
        }

        // A camada não soma a própria nota: se somasse, o look com jaqueta
        // sempre ganharia. Ela só ganha pontos quando aquece um look sem moletom.
        // Moletom ou suéter já aquece: no frio, dispensam o casaco.
        const comMoletom = base.some((p) => p.categoria === 'MOLETOM' || p.categoria === 'SUETER');
        // No conjunto, as duas peças da mesma cor contam como um destaque só,
        // como no look de uma cor (sem isso, o colete e a calça azul claro
        // perdiam 6 pontos por "duas peças coloridas" e nunca saíam juntos).
        const conjunto = !umaCor && temConjunto(look);
        let notaDoLook =
          [...base, calcado].reduce((soma, p) => soma + (p ? nota(p) : 0), 0) +
          notaDeHarmonia(look, umaCor || conjunto) +
          notaDeCobertura(look, intencao) +
          notaDoEquilibrio(look, intencao) +
          // A saia curta pedida não perde pelo frio: foi a pessoa quem escolheu.
          (opcoes.comprimento === 'CURTA'
            ? 0
            : notaDasPernas(look, intencao, Boolean(opcoes.camadaLeve))) +
          notaDaBota(look);

        // "Look de uma cor só" sem dizer qual: um par colorido diz mais que
        // duas peças pretas.
        if (par && !intencao.corDoLook && !par[0].neutra) notaDoLook += 2;
        // Par do mesmo tecido é conjunto (casaco e calça de moletom).
        if (par && par[0].material && par[0].material === par[1].material) notaDoLook += 2;

        // Conjunto (cima e baixo da mesma cor e tecido): preferência, sem
        // garantir, para não sair sempre o mesmo (10/11/2026).
        if (conjunto) notaDoLook += BONUS_DO_CONJUNTO;

        // No conforto, a camada também precisa ser confortável: a jaqueta de
        // couro entrava por cima do moletom, porque a camada não soma nota.
        if (opcoes.conforto && sobreposicao) notaDoLook += notaDeConforto(sobreposicao);
        // A camada não soma a própria nota, mas a grossura dela conta. Num
        // jantar com 16 a 19 °C entrou uma jaqueta grossa (10/11/2026).
        // Com a informação da análise, o casaco pesado (puffer, parka,
        // sobretudo) só vai com frio forte, e ganha nele; sem ela (peça antiga),
        // o casaco que esquenta muito (QUENTE) perde fora do frio.
        const pesoConhecido = typeof sobreposicao?.casacoPesado === 'boolean';
        if (sobreposicao?.casacoPesado && opcoes.frioForte) notaDoLook += 2;
        if (
          !pesoConhecido &&
          !moletomNoFresco(sobreposicao) &&
          sobreposicao?.aquecimento === 'QUENTE' &&
          intencao.aquecimento !== 'QUENTE' &&
          // Pedido pelo nome ou metade do conjunto pedido ("meu conjunto de
          // moletom"): foi a pessoa quem escolheu.
          !pedidas.has(sobreposicao) &&
          !par?.includes(sobreposicao)
        ) {
          notaDoLook -= intencao.aquecimento === 'MEDIO' ? PENALIDADE_CASACO_GROSSO : 2;
        }
        // No date, a camada também precisa combinar com o tom do encontro.
        if (opcoes.encontro && sobreposicao) notaDoLook += notaDoEncontro(sobreposicao);
        // O conjunto de moletom é o look confortável por excelência (pedido da
        // Sophia: "tenho uma calça e um casaco de moletom azul claro").
        if (
          opcoes.conforto &&
          conjunto &&
          look.filter((p) => p.material === 'MOLETOM').length >= 2
        ) {
          notaDoLook += BONUS_DO_CONJUNTO_DE_MOLETOM;
        }

        // O colete não esquenta: no frio, ele não conta como camada.
        const aquece = sobreposicao !== null && sobreposicao.categoria !== 'COLETE';
        if (pedeSobreposicao && !aquece && !comMoletom) notaDoLook -= 3;
        if (pedeSobreposicao && aquece && !comMoletom) notaDoLook += 1;

        looks.push({ pecas: look, nota: notaDoLook });
      }
    }
  }

  if (!looks.length) {
    return {
      status: 'SEM_LOOK',
      mensagem: umaCor
        ? `Não encontrei duas peças do mesmo tom${intencao.corDoLook ? ` de ${nomeDaCor(intencao.corDoLook)}` : ''} que formem um look de uma cor no seu armário.`
        : barradosPelaManga
          ? 'Para o trabalho, suas peças de cima sem manga precisam de um blazer ou casaco por cima, e não encontrei um que combinasse. Cadastre uma blusa com manga ou um blazer.'
          : 'Não consegui montar um look com todas as peças que você pediu juntas.',
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
