/**
 * Avalia o interpretador de pedidos do chat contra test/intencoes/pedidos.json.
 *
 * Uso:
 *   npm run avaliar:intencoes
 *   npm run avaliar:intencoes -- --rodadas 3
 *   npm run avaliar:intencoes -- --filtro daltonismo
 *   npm run avaliar:intencoes -- --modelo gpt-4.1-mini
 *
 * Em cada caso, campo omitido em "esperado" vale null (ou lista vazia), para
 * pegar a IA inventando filtro que o usuário não pediu; "*" aceita qualquer
 * valor (casos ambíguos). Casos com "lacuna"
 * são pedidos que a taxonomia atual não cobre: o esperado é a IA registrar o
 * trecho em naoMapeado.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import OpenAI from 'openai';

import {
  Cor,
  Intencao,
  interpretarPedido,
  MensagemHistorico,
  MODELO_INTERPRETACAO,
  PecaDesejada,
} from '../src/looks/interpretar-pedido';

type Esperado = { [campo in keyof Intencao]?: Intencao[campo] | '*' };

type Caso = {
  id: string;
  mensagem: string;
  historico?: MensagemHistorico[];
  esperado: Esperado & Pick<Intencao, 'tipo'>;
  lacuna?: string;
};

type Resultado = {
  caso: Caso;
  obtido: Intencao | null;
  erro?: string;
  divergencias: string[];
  instavel: string[];
  tokens: { entrada: number; saida: number };
};

const CAMPOS = [
  'tipo',
  'ocasiao',
  'formalidade',
  'estilo',
  'aquecimento',
  'paletaNeutra',
  'incluir',
  'evitarCategorias',
  'evitarCores',
] as const;

type Campo = (typeof CAMPOS)[number];

const PASTA = join(__dirname, '..', 'test', 'intencoes');
const CONCORRENCIA = 8;

function chaveCor(cor: Cor | null) {
  if (!cor) return '-';
  return cor.tom ? `${cor.familia}_${cor.tom}` : cor.familia;
}

function chavePeca(peca: PecaDesejada) {
  const material = peca.material ? `/${peca.material}` : '';
  return `${peca.categoria ?? '*'}/${chaveCor(peca.cor)}${material}`;
}

/** Representação canônica do campo, para comparar sem depender da ordem. */
function normalizar(intencao: Partial<Intencao>, campo: Campo): string {
  switch (campo) {
    case 'paletaNeutra':
      return String(intencao.paletaNeutra ?? false);
    case 'incluir':
      return (intencao.incluir ?? []).map(chavePeca).sort().join(', ') || '[]';
    case 'evitarCores':
      return (intencao.evitarCores ?? []).map(chaveCor).sort().join(', ') || '[]';
    case 'evitarCategorias':
      return [...(intencao.evitarCategorias ?? [])].sort().join(', ') || '[]';
    default:
      return String(intencao[campo] ?? 'null');
  }
}

function maioria(valores: string[]) {
  const contagem = new Map<string, number>();
  for (const valor of valores) contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function avaliarCaso(
  client: OpenAI,
  caso: Caso,
  rodadas: number,
  modelo: string,
): Promise<Resultado> {
  const tentativas: Intencao[] = [];
  const tokens = { entrada: 0, saida: 0 };
  let erro: string | undefined;

  for (let i = 0; i < rodadas; i++) {
    try {
      const resultado = await interpretarPedido(client, caso.mensagem, caso.historico, modelo);
      tentativas.push(resultado.intencao);
      tokens.entrada += resultado.tokens.entrada;
      tokens.saida += resultado.tokens.saida;
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
  }

  if (tentativas.length === 0) {
    return { caso, obtido: null, erro, divergencias: ['erro'], instavel: [], tokens };
  }

  const divergencias: string[] = [];
  const instavel: string[] = [];

  for (const campo of CAMPOS) {
    const valores = tentativas.map((t) => normalizar(t, campo));
    if (new Set(valores).size > 1) instavel.push(campo);

    if (caso.esperado[campo] === '*') continue;

    const esperado = normalizar(caso.esperado as Partial<Intencao>, campo);
    const obtido = maioria(valores);
    if (esperado !== obtido) {
      divergencias.push(`${campo}: esperado ${esperado}, veio ${obtido}`);
    }
  }

  return { caso, obtido: tentativas[0], erro, divergencias, instavel, tokens };
}

async function emParalelo<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>) {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;

  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await fn(itens[indice]);
    }
  }

  await Promise.all(Array.from({ length: limite }, trabalhador));
  return resultados;
}

function lerArgumento(nome: string) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function porcentagem(parte: number, total: number) {
  return total ? `${parte}/${total} (${Math.round((parte / total) * 100)}%)` : '-';
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Defina OPENAI_API_KEY no .env do back.');
  }

  const rodadas = Number(lerArgumento('rodadas') ?? 1);
  const filtro = lerArgumento('filtro');
  const modelo = lerArgumento('modelo') ?? MODELO_INTERPRETACAO;

  const casos: Caso[] = JSON.parse(readFileSync(join(PASTA, 'pedidos.json'), 'utf-8'));
  const selecionados = filtro ? casos.filter((caso) => caso.id.includes(filtro)) : casos;

  const client = new OpenAI();
  const resultados = await emParalelo(selecionados, CONCORRENCIA, (caso) =>
    avaliarCaso(client, caso, rodadas, modelo),
  );

  console.log(
    `\nInterpretação de pedidos (${modelo}): ${selecionados.length} casos, ${rodadas} rodada(s)\n`,
  );

  for (const campo of CAMPOS) {
    const acertos = resultados.filter(
      (r) => !r.divergencias.some((d) => d.startsWith(`${campo}:`) || d === 'erro'),
    ).length;
    const instaveis = resultados.filter((r) => r.instavel.includes(campo)).length;
    const sufixo = rodadas > 1 ? `  instável em ${instaveis}` : '';
    console.log(`${campo.padEnd(17)} ${porcentagem(acertos, resultados.length)}${sufixo}`);
  }

  const perfeitos = resultados.filter((r) => r.divergencias.length === 0).length;
  console.log(`${'caso inteiro'.padEnd(17)} ${porcentagem(perfeitos, resultados.length)}`);

  const chamadas = resultados.length * rodadas;
  const entrada = resultados.reduce((soma, r) => soma + r.tokens.entrada, 0);
  const saida = resultados.reduce((soma, r) => soma + r.tokens.saida, 0);
  console.log(
    `\nTokens por chamada (média): ${Math.round(entrada / chamadas)} de entrada, ${Math.round(saida / chamadas)} de saída`,
  );

  const comLacuna = resultados.filter((r) => r.caso.lacuna);
  const lacunasDetectadas = comLacuna.filter((r) => r.obtido?.naoMapeado.length);
  console.log(
    `\nLacunas previstas que a IA registrou em naoMapeado: ${porcentagem(lacunasDetectadas.length, comLacuna.length)}`,
  );

  const falhas = resultados.filter((r) => r.divergencias.length > 0);
  if (falhas.length) {
    console.log('\nDivergências:');
    for (const r of falhas) {
      console.log(`- ${r.caso.id} ("${r.caso.mensagem}")`);
      for (const d of r.divergencias) console.log(`    ${d}`);
      if (r.erro) console.log(`    erro: ${r.erro}`);
    }
  }

  const naoMapeados = resultados.filter((r) => r.obtido?.naoMapeado.length);
  if (naoMapeados.length) {
    console.log('\nTrechos em naoMapeado (candidatos a ajuste na taxonomia):');
    for (const r of naoMapeados) {
      const marca = r.caso.lacuna ? '' : '  [não previsto]';
      console.log(`- ${r.caso.id}: ${r.obtido!.naoMapeado.join(' | ')}${marca}`);
    }
  }

  const pastaResultados = join(PASTA, 'resultados');
  mkdirSync(pastaResultados, { recursive: true });
  const arquivo = join(
    pastaResultados,
    `avaliacao_${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(arquivo, JSON.stringify(resultados, null, 2));
  console.log(`\nDetalhes por caso: ${arquivo}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
