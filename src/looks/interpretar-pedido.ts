import OpenAI from 'openai';

import {
  AQUECIMENTOS,
  Aquecimento,
  CATEGORIAS,
  Categoria,
  ESTILOS,
  Estilo,
  FAMILIAS_COR,
  FamiliaCor,
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
};

export type TipoIntencao = 'LOOK' | 'ESCLARECER' | 'FORA_DE_ESCOPO';

/**
 * O que o motor de looks precisa saber para buscar peças no closet.
 * A IA só interpreta o pedido; quem escolhe as peças são as regras do motor.
 */
export type Intencao = {
  tipo: TipoIntencao;
  ocasiao: Ocasiao | null;
  estilo: Estilo | null;
  aquecimento: Aquecimento | null;
  incluir: PecaDesejada[];
  evitarCategorias: Categoria[];
  evitarCores: Cor[];
  pergunta: string | null;
  naoMapeado: string[];
};

export type MensagemHistorico = {
  autor: 'usuario' | 'zyra';
  texto: string;
};

export const MODELO_INTERPRETACAO = 'gpt-4o-mini';

const DESCRICAO_OCASIOES: Record<Ocasiao, string> = {
  DIA_A_DIA: 'rotina, faculdade, passeio',
  TRABALHO: 'escritório, reunião, entrevista',
  FESTA: 'aniversário, balada, casamento, evento',
  ACADEMIA: 'treino, corrida',
  PRAIA: 'praia, piscina',
  CASA: 'ficar em casa, dormir',
};

function descrever(descricoes: Record<string, string>) {
  return Object.entries(descricoes)
    .map(([codigo, descricao]) => `  - ${codigo}: ${descricao}`)
    .join('\n');
}

const PROMPT_SISTEMA = `
Você interpreta pedidos de look no ZYRA, um app de vestuário para pessoas daltônicas.
Seu trabalho é só traduzir o pedido em filtros. Outro sistema escolhe as peças no
closet do usuário e completa o que não foi dito com valores padrão.

Campos:
- tipo:
  - LOOK (padrão): o usuário quer uma sugestão de roupa, mesmo que genérica
    ("monta um look", "sei lá", "tá frio"). Na dúvida entre LOOK e ESCLARECER,
    escolha LOOK.
  - ESCLARECER: só quando a mensagem não pede nada ("oi") ou cita um evento sem
    dizer qual é ("tenho um evento amanhã"). Preencha "pergunta" com uma pergunta
    curta e simpática.
  - FORA_DE_ESCOPO: qualquer coisa que não seja pedir um look com as roupas do
    usuário (previsão do tempo, preços, piadas, perguntas gerais).
- ocasiao:
${descrever(DESCRICAO_OCASIOES)}
- estilo: ${ESTILOS.join(', ')}. Só preencha se o usuário disser como quer se vestir
  ("arrumado", "básico", "esportivo"). Não deduza o estilo a partir da ocasião.
- aquecimento: só preencha se o usuário falar do clima ou da temperatura.
  LEVE para calor, MEDIO para frio leve ou clima ameno, QUENTE para frio.
- incluir: peças que o usuário quer usar, com categoria e/ou cor.
- evitarCategorias e evitarCores: só o que o usuário disse explicitamente que não quer.
- categorias: ${CATEGORIAS.join(', ')}.
- cores usam as famílias do ColorADD: ${FAMILIAS_COR.join(', ')}, com tom
  ${TONS.join(' ou ')} opcional. Rosa é VERMELHO CLARO e marrom é CASTANHO.
- naoMapeado: o que SOBRA do pedido depois de preencher os campos acima e que
  mudaria o look, com as palavras do usuário. Não repita o que já virou campo e
  não registre datas (hoje, amanhã, sábado). Na maioria dos pedidos a lista fica
  vazia. Nunca force um valor que não corresponde: deixe o campo nulo e registre
  o trecho aqui.
`.trim();

const COR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['familia', 'tom'],
  properties: {
    familia: { type: 'string', enum: [...FAMILIAS_COR] },
    tom: { type: ['string', 'null'], enum: [...TONS, null] },
  },
};

const INTENCAO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tipo',
    'ocasiao',
    'estilo',
    'aquecimento',
    'incluir',
    'evitarCategorias',
    'evitarCores',
    'pergunta',
    'naoMapeado',
  ],
  properties: {
    tipo: { type: 'string', enum: ['LOOK', 'ESCLARECER', 'FORA_DE_ESCOPO'] },
    ocasiao: { type: ['string', 'null'], enum: [...OCASIOES, null] },
    estilo: { type: ['string', 'null'], enum: [...ESTILOS, null] },
    aquecimento: { type: ['string', 'null'], enum: [...AQUECIMENTOS, null] },
    incluir: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['categoria', 'cor'],
        properties: {
          categoria: { type: ['string', 'null'], enum: [...CATEGORIAS, null] },
          cor: { anyOf: [COR_SCHEMA, { type: 'null' }] },
        },
      },
    },
    evitarCategorias: { type: 'array', items: { type: 'string', enum: [...CATEGORIAS] } },
    evitarCores: { type: 'array', items: COR_SCHEMA },
    pergunta: { type: ['string', 'null'] },
    naoMapeado: { type: 'array', items: { type: 'string' } },
  },
};

export async function interpretarPedido(
  client: OpenAI,
  mensagem: string,
  historico: MensagemHistorico[] = [],
): Promise<Intencao> {
  const response = await client.chat.completions.create({
    model: MODELO_INTERPRETACAO,
    temperature: 0,
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

  return JSON.parse(content) as Intencao;
}
