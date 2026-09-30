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
  incluir: PecaDesejada[];
  evitarCategorias: Categoria[];
  evitarCores: Cor[];
  pergunta: string | null;
  naoMapeado: string[];
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
  - ACADEMIA: treino, corrida
  - PRAIA: praia, piscina
  - CASA: ficar na própria casa, dormir
- formalidade: ${FORMALIDADES.join(', ')}. Só preencha se o pedido indicar o nível
  (casamento, entrevista ou "arrumado" = ALTA; "bem à vontade" = BAIXA).
- estilo: ${ESTILOS.join(', ')}. Só preencha se o usuário nomear o estilo. Não deduza
  o estilo nem a formalidade a partir da ocasião.
- aquecimento: só se o usuário falar do clima. LEVE para calor, MEDIO para frio leve
  ou clima ameno, QUENTE para frio.
- paletaNeutra: true se o usuário pedir só neutros, pouca cor ou cores "seguras".
- incluir: peças que o usuário quer usar. Preencha só a categoria, a cor e o material
  que ele disse.
- evitarCategorias e evitarCores: só o que o usuário disse que não quer.
- categorias: ${CATEGORIAS.join(', ')}. materiais: ${MATERIAIS.join(', ')}.
- cores: famílias do ColorADD (${FAMILIAS_COR.join(', ')}), com tom ${TONS.join(' ou ')}
  opcional. Rosa = VERMELHO CLARO, marrom = CASTANHO, marinho = AZUL ESCURO,
  vinho = VERMELHO ESCURO.
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
    'incluir',
    'evitarCategorias',
    'evitarCores',
    'pergunta',
    'naoMapeado',
  ],
  properties: {
    tipo: { type: 'string', enum: ['LOOK', 'ESCLARECER', 'FORA_DE_ESCOPO'] },
    ocasiao: nulo(OCASIOES),
    formalidade: nulo(FORMALIDADES),
    estilo: nulo(ESTILOS),
    aquecimento: nulo(AQUECIMENTOS),
    paletaNeutra: { type: 'boolean' },
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
  },
};

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
    intencao: JSON.parse(content) as Intencao,
    tokens: {
      entrada: response.usage?.prompt_tokens ?? 0,
      saida: response.usage?.completion_tokens ?? 0,
    },
  };
}
