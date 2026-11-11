import OpenAI from 'openai';

import type { Periodo } from './ocasioes';

import {
  AQUECIMENTOS,
  Aquecimento,
  CATEGORIAS,
  Categoria,
  ESTILOS,
  Estilo,
  FAMILIAS_COR,
  FamiliaCor,
  FORMALIDADES,
  Formalidade,
  MATERIAIS,
  Material,
  OCASIOES,
  Ocasiao,
  TONS,
  Tom,
} from './taxonomia';

export type Cor = {
  familia: FamiliaCor;
  tom: Tom | null;
};

export type PecaDesejada = {
  categoria: Categoria | null;
  cor: Cor | null;
  material: Material | null;
};

export type TipoIntencao = 'LOOK' | 'ESCLARECER' | 'FORA_DE_ESCOPO';

/** Partes do look anterior que o usuário pediu para trocar ("troca o tênis"). */
export const PARTES_DO_LOOK = ['CIMA', 'BAIXO', 'CALCADO', 'CAMADA'] as const;
export type ParteDoLook = (typeof PARTES_DO_LOOK)[number];

/**
 * O que o motor de looks precisa saber para buscar peças no closet.
 * A IA só interpreta o pedido; quem escolhe as peças são as regras do motor.
 */
export type Intencao = {
  tipo: TipoIntencao;
  ocasiao: Ocasiao | null;
  formalidade: Formalidade | null;
  estilo: Estilo | null;
  aquecimento: Aquecimento | null;
  paletaNeutra: boolean;
  /**
   * Look de uma cor só ("look azul", "look todo preto", "meu conjunto"): duas
   * peças do mesmo tom e o resto neutro. Opcionais para os testes e para
   * intenções montadas no código; a IA sempre devolve os dois.
   */
  umaCor?: boolean;
  /** A cor desse look, se o usuário disse qual. */
  corDoLook?: Cor | null;
  /**
   * Festa de dia ou à noite. Não vem da IA: o código lê da conversa e, se
   * faltar numa festa, pergunta antes de montar o look.
   */
  periodo?: Periodo | null;
  incluir: PecaDesejada[];
  evitarCategorias: Categoria[];
  evitarCores: Cor[];
  pergunta: string | null;
  naoMapeado: string[];
  /** Vazio: look novo. Com partes: mantém o resto do look anterior e troca só elas. */
  trocar: ParteDoLook[];
};

export type ResultadoInterpretacao = {
  intencao: Intencao;
  tokens: { entrada: number; saida: number };
};

export type MensagemHistorico = {
  autor: 'usuario' | 'zyra';
  texto: string;
};

export const MODELO_INTERPRETACAO = process.env.OPENAI_MODELO_INTERPRETACAO ?? 'gpt-4.1-mini';

// Modelos com raciocínio (gpt-5+, o*) não aceitam temperature.
const aceitaTemperatura = (modelo: string) => !/^(gpt-[5-9]|o\d)/.test(modelo);

// A resposta é só o JSON da intenção; o limite corta qualquer texto a mais.
const MAX_TOKENS_RESPOSTA = 250;

// O prompt vai a cada mensagem do chat. A maior parte dos tokens de entrada é o
// schema; encurtar as regras abaixo economiza pouco e derruba a qualidade.
const PROMPT_SISTEMA = `
Você converte pedidos de look do ZYRA, um app de vestuário para pessoas daltônicas,
em filtros. Outro sistema escolhe as peças no closet do usuário e completa o que não
foi dito. Não escreva explicações: só preencha os campos.

Campos:
- tipo:
  - LOOK (padrão): o usuário quer uma sugestão de roupa, mesmo que genérica ("monta
    um look", "sei lá", "tá frio") ou que seja só a resposta a uma pergunta sua
    ("trabalho"). Na dúvida entre LOOK e ESCLARECER, escolha LOOK.
  - ESCLARECER: só quando a mensagem não pede nada ("oi") ou cita um evento sem
    dizer qual é ("tenho um evento amanhã"). Preencha "pergunta" com uma frase curta.
  - FORA_DE_ESCOPO: qualquer coisa que não seja pedir um look (previsão do tempo,
    preços, piadas, perguntas gerais).
- ocasiao:
  - DIA_A_DIA: rotina, faculdade, passeio, churrasco
  - TRABALHO: escritório, reunião, entrevista
  - FESTA: aniversário, balada, casamento
  - ACADEMIA: treino, corrida, caminhada, trilha, bike: atividade física em que se sua
  - PRAIA: praia, piscina
  - CASA: ficar na própria casa, dormir
- formalidade: ${FORMALIDADES.join(', ')}. Só preencha se o pedido indicar o nível
  (casamento, entrevista ou "arrumado" = ALTA; "bem à vontade" = BAIXA).
- estilo: ${ESTILOS.join(', ')}. Só preencha se o usuário nomear o estilo. Não deduza
  o estilo nem a formalidade a partir da ocasião.
- aquecimento: só se o usuário falar do clima. LEVE para calor, MEDIO para frio leve
  ou clima ameno, QUENTE para frio.
- paletaNeutra: true se o usuário pedir só neutros, pouca cor ou cores "seguras".
- umaCor: true se o usuário pedir o look inteiro numa cor ou tom sobre tom ("look
  azul", "look todo preto", "look de uma cor só", "usar meu conjunto").
  corDoLook: a cor desse look, se ele disser qual ("look azul" = AZUL); senão null.
  A cor do look não entra em incluir. Querer usar uma peça de uma cor ("meu
  moletom azul", "o vestido lilás") NÃO é umaCor: vai em incluir.
- incluir: peças que o usuário quer usar. Preencha só a categoria, a cor e o material
  que ele disse. Bolsa, mochila, boné e outros acessórios não fazem parte do closet:
  não entram em incluir, vão para naoMapeado.
- evitarCategorias e evitarCores: só o que o usuário disse que não quer.
- categorias: ${CATEGORIAS.join(', ')}. materiais: ${MATERIAIS.join(', ')}.
  Blusa ou blusinha = BLUSA; regata = CAMISETA; "calça de moletom" = CALCA com
  material MOLETOM, e "um moletom" = categoria MOLETOM; suéter ou pulôver = SUETER;
  pijama de pelinho = SOFT.
- cores: famílias do ColorADD (${FAMILIAS_COR.join(', ')}), com tom ${TONS.join(' ou ')}
  opcional. Rosa = VERMELHO CLARO, marrom = CASTANHO, marinho = AZUL ESCURO,
  vinho = VERMELHO ESCURO.
- trocar: quando o usuário pede para mudar só parte do look anterior ("troca o
  tênis", "outra calça", "muda a parte de cima"), as partes a trocar: CIMA, BAIXO,
  CALCADO ou CAMADA (jaqueta, blazer). Nesse caso, repita a ocasião, o estilo e o
  clima que já estavam na conversa. Para um look novo ou "quero outro", deixe vazio.
- naoMapeado: termos curtos (até 3 palavras) que mudariam o look e não couberam em
  nenhum campo. Não repita o que já virou campo nem registre datas. Normalmente vazio.
`.trim();

const nulo = <T extends readonly string[]>(valores: T) => ({
  type: ['string', 'null'],
  enum: [...valores, null],
});

const COR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['familia', 'tom'],
  properties: {
    familia: { type: 'string', enum: [...FAMILIAS_COR] },
    tom: nulo(TONS),
  },
};

const INTENCAO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tipo',
    'ocasiao',
    'formalidade',
    'estilo',
    'aquecimento',
    'paletaNeutra',
    'umaCor',
    'corDoLook',
    'incluir',
    'evitarCategorias',
    'evitarCores',
    'pergunta',
    'naoMapeado',
    'trocar',
  ],
  properties: {
    tipo: { type: 'string', enum: ['LOOK', 'ESCLARECER', 'FORA_DE_ESCOPO'] },
    ocasiao: nulo(OCASIOES),
    formalidade: nulo(FORMALIDADES),
    estilo: nulo(ESTILOS),
    aquecimento: nulo(AQUECIMENTOS),
    paletaNeutra: { type: 'boolean' },
    umaCor: { type: 'boolean' },
    corDoLook: { anyOf: [COR_SCHEMA, { type: 'null' }] },
    incluir: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['categoria', 'cor', 'material'],
        properties: {
          categoria: nulo(CATEGORIAS),
          cor: { anyOf: [COR_SCHEMA, { type: 'null' }] },
          material: nulo(MATERIAIS),
        },
      },
    },
    evitarCategorias: { type: 'array', items: { type: 'string', enum: [...CATEGORIAS] } },
    evitarCores: { type: 'array', items: COR_SCHEMA },
    pergunta: { type: ['string', 'null'] },
    naoMapeado: { type: 'array', items: { type: 'string' } },
    trocar: { type: 'array', items: { type: 'string', enum: [...PARTES_DO_LOOK] } },
  },
};

const FAMILIAS_SEM_TOM: FamiliaCor[] = ['PRETO', 'BRANCO', 'DOURADO', 'PRATEADO'];

function semTomSeNaoTem(cor: Cor | null): Cor | null {
  if (!cor || !FAMILIAS_SEM_TOM.includes(cor.familia)) return cor;
  return { ...cor, tom: null };
}

/**
 * Correções determinísticas sobre a resposta da IA, para erros que um prompt
 * não elimina por completo.
 */
export function ajustarIntencao(intencao: Intencao): Intencao {
  const temFiltro =
    intencao.ocasiao !== null ||
    intencao.aquecimento !== null ||
    intencao.estilo !== null ||
    intencao.formalidade !== null ||
    intencao.paletaNeutra ||
    Boolean(intencao.umaCor) ||
    intencao.incluir.length > 0 ||
    intencao.evitarCategorias.length > 0 ||
    intencao.evitarCores.length > 0;

  // Se a IA extraiu algum filtro, já dá para montar o look: perguntar só
  // atrasaria o usuário. FORA_DE_ESCOPO fica como está ("quanto custa uma
  // camisa social?" também tem filtro).
  const tipo = intencao.tipo === 'ESCLARECER' && temFiltro ? 'LOOK' : intencao.tipo;

  // "Look todo azul claro": a IA às vezes põe a cor também em incluir, como
  // "uma peça azul claro qualquer". A cor do look já diz isso.
  const corDoLook = semTomSeNaoTem(intencao.corDoLook ?? null);
  const repeteACorDoLook = (peca: PecaDesejada) =>
    corDoLook !== null &&
    peca.categoria === null &&
    peca.material === null &&
    peca.cor?.familia === corDoLook.familia;

  // "Quero usar meu moletom azul": a IA às vezes lê como look azul. Se a cor
  // do look é a de uma peça pedida pelo nome, o pedido é usar a peça.
  const ehCorDeUmaPeca =
    corDoLook !== null &&
    intencao.incluir.some(
      (peca) => peca.categoria !== null && peca.cor?.familia === corDoLook.familia,
    );
  const umaCor = !ehCorDeUmaPeca && (Boolean(intencao.umaCor) || corDoLook !== null);

  return {
    ...intencao,
    tipo,
    pergunta: tipo === 'ESCLARECER' ? intencao.pergunta : null,
    trocar: intencao.trocar ?? [],
    umaCor,
    corDoLook: ehCorDeUmaPeca ? null : corDoLook,
    // "Preto claro" e "branco escuro" não existem no ColorADD.
    incluir: intencao.incluir
      .filter((peca) => !repeteACorDoLook(peca))
      .map((peca) => ({
        ...peca,
        // "Meu conjunto de moletom": a IA lê "um moletom" (a blusa), mas o
        // conjunto é o tecido. Qualquer peça de moletom serve.
        categoria:
          umaCor && peca.categoria === 'MOLETOM' && peca.material === 'MOLETOM'
            ? null
            : peca.categoria,
        cor: semTomSeNaoTem(peca.cor),
      })),
    evitarCores: intencao.evitarCores.map((cor) => semTomSeNaoTem(cor)!),
  };
}

export async function interpretarPedido(
  client: OpenAI,
  mensagem: string,
  historico: MensagemHistorico[] = [],
  modelo: string = MODELO_INTERPRETACAO,
): Promise<ResultadoInterpretacao> {
  const response = await client.chat.completions.create({
    model: modelo,
    ...(aceitaTemperatura(modelo) ? { temperature: 0 } : {}),
    max_completion_tokens: MAX_TOKENS_RESPOSTA,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'intencao', strict: true, schema: INTENCAO_SCHEMA },
    },
    messages: [
      { role: 'system', content: PROMPT_SISTEMA },
      ...historico.map((item) => ({
        role: item.autor === 'usuario' ? ('user' as const) : ('assistant' as const),
        content: item.texto,
      })),
      { role: 'user', content: mensagem },
    ],
  });

  const content = response.choices[0].message.content;

  if (!content) {
    throw new Error('A IA não devolveu uma interpretação para o pedido.');
  }

  return {
    intencao: ajustarIntencao(JSON.parse(content) as Intencao),
    tokens: {
      entrada: response.usage?.prompt_tokens ?? 0,
      saida: response.usage?.completion_tokens ?? 0,
    },
  };
}
