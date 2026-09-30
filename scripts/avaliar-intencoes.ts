/**
 * Avalia o interpretador de pedidos do chat contra os casos de test/intencoes.
 *
 * Uso:
 *   npm run avaliar:intencoes                           # conjunto de desenvolvimento
 *   npm run avaliar:intencoes -- --conjunto validacao
 *   npm run avaliar:intencoes -- --rodadas 3
 *   npm run avaliar:intencoes -- --filtro daltonismo
 *   npm run avaliar:intencoes -- --modelo gpt-4.1-mini
 *
 * Conjuntos:
 * - desenvolvimento: usado para ajustar o prompt. O acerto aqui é otimista.
 * - validacao: NÃO olhe as falhas daqui para ajustar o prompt; é o número honesto.
 *
 * Em cada caso, campo omitido em "esperado" vale null (ou lista vazia), para
 * pegar a IA inventando filtro que o usuário não pediu. "*" aceita qualquer
 * valor, inclusive dentro de uma peça de "incluir" (categoria, cor, tom, material).
 * Casos com "lacuna" são pedidos que a taxonomia atual não cobre: o esperado é
 * a IA registrar o trecho em naoMapeado.
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

type Coringa<T> = T | '*';

type PecaEsperada = {
  categoria: Coringa<PecaDesejada['categoria']>;
  cor: Coringa<{ familia: Cor['familia']; tom: Coringa<Cor['tom']> } | null>;
  material?: Coringa<PecaDesejada['material']>;
};

type Esperado = {
  [campo in Exclude<keyof Intencao, 'incluir'>]?: Coringa<Intencao[campo]>;
} & {
  tipo: Intencao['tipo'];
  incluir?: Coringa<PecaEsperada[]>;
};

type Caso = {
  id: string;
  mensagem: string;
  historico?: MensagemHistorico[];
  esperado: Esperado;
  lacuna?: string;
};

type Resultado = {
  conjunto: string;
  caso: Caso;
  obtido: Intencao | null;
  erro?: string;
  divergencias: string[];
  inofensivas: string[];
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
const CONJUNTOS = ['desenvolvimento', 'validacao'];
const CONCORRENCIA = 4;

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

function descreverEsperado(pecas: PecaEsperada[]) {
  const texto = pecas.map((peca) => {
    const cor =
      peca.cor === '*' ? '*' : peca.cor ? `${peca.cor.familia}_${peca.cor.tom ?? ''}` : '-';
    const material = peca.material ? `/${peca.material}` : '';
    return `${peca.categoria ?? '*'}/${cor.replace(/_$/, '')}${material}`;
  });
  return texto.sort().join(', ') || '[]';
}

function pecaCombina(esperada: PecaEsperada, obtida: PecaDesejada) {
  if (esperada.categoria !== '*' && esperada.categoria !== obtida.categoria) return false;

  const material = esperada.material ?? null;
  if (material !== '*' && material !== obtida.material) return false;

  if (esperada.cor === '*') return true;
  if (esperada.cor === null || obtida.cor === null) return esperada.cor === obtida.cor;
  if (esperada.cor.familia !== obtida.cor.familia) return false;
  return esperada.cor.tom === '*' || esperada.cor.tom === obtida.cor.tom;
}

/** Cada peça esperada precisa casar com uma peça obtida diferente, e vice-versa. */
function incluirCombina(esperadas: PecaEsperada[], obtidas: PecaDesejada[]) {
  if (esperadas.length !== obtidas.length) return false;

  const livres = [...obtidas];
  for (const esperada of esperadas) {
    const indice = livres.findIndex((obtida) => pecaCombina(esperada, obtida));
    if (indice < 0) return false;
    livres.splice(indice, 1);
  }
  return true;
}

function maioria(valores: string[]) {
  const contagem = new Map<string, number>();
  for (const valor of valores) contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Diferenças que não mudam o look: sem ocasião, o motor já usa DIA_A_DIA.
 */
function eInofensiva(campo: Campo, esperado: string, obtido: string) {
  return campo === 'ocasiao' && esperado === 'null' && obtido === 'DIA_A_DIA';
}

async function avaliarCaso(
  client: OpenAI,
  conjunto: string,
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

  const base = { conjunto, caso, erro, tokens };

  if (tentativas.length === 0) {
    return { ...base, obtido: null, divergencias: ['erro'], inofensivas: [], instavel: [] };
  }

  const divergencias: string[] = [];
  const inofensivas: string[] = [];
  const instavel: string[] = [];

  for (const campo of CAMPOS) {
    const valores = tentativas.map((t) => normalizar(t, campo));
    if (new Set(valores).size > 1) instavel.push(campo);

    const esperadoBruto = caso.esperado[campo];
    if (esperadoBruto === '*') continue;

    const obtido = maioria(valores);

    if (campo === 'incluir') {
      const esperadas = (esperadoBruto as PecaEsperada[] | undefined) ?? [];
      const representante = tentativas.find((t) => normalizar(t, campo) === obtido)!;
      if (!incluirCombina(esperadas, representante.incluir)) {
        divergencias.push(`incluir: esperado ${descreverEsperado(esperadas)}, veio ${obtido}`);
      }
      continue;
    }

    const esperado = normalizar(caso.esperado as Partial<Intencao>, campo);
    if (esperado === obtido) continue;

    const mensagem = `${campo}: esperado ${esperado}, veio ${obtido}`;
    if (eInofensiva(campo, esperado, obtido)) inofensivas.push(mensagem);
    else divergencias.push(mensagem);
  }

  return { ...base, obtido: tentativas[0], divergencias, inofensivas, instavel };
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

function imprimirResumo(titulo: string, resultados: Resultado[], rodadas: number) {
  console.log(`\n${titulo}: ${resultados.length} casos`);

  for (const campo of CAMPOS) {
    const acertos = resultados.filter(
      (r) => !r.divergencias.some((d) => d.startsWith(`${campo}:`) || d === 'erro'),
    ).length;
    const instaveis = resultados.filter((r) => r.instavel.includes(campo)).length;
    const sufixo = rodadas > 1 ? `  instável em ${instaveis}` : '';
    console.log(`  ${campo.padEnd(17)} ${porcentagem(acertos, resultados.length)}${sufixo}`);
  }

  const semErroGrave = resultados.filter((r) => r.divergencias.length === 0).length;
  const perfeitos = resultados.filter(
    (r) => r.divergencias.length === 0 && r.inofensivas.length === 0,
  ).length;
  console.log(`  ${'caso inteiro'.padEnd(17)} ${porcentagem(semErroGrave, resultados.length)}`);
  console.log(
    `  ${'(estrito)'.padEnd(17)} ${porcentagem(perfeitos, resultados.length)}  contando ocasião padrão como erro`,
  );
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Defina OPENAI_API_KEY no .env do back.');
  }

  const rodadas = Number(lerArgumento('rodadas') ?? 1);
  const filtro = lerArgumento('filtro');
  const modelo = lerArgumento('modelo') ?? MODELO_INTERPRETACAO;
  const conjuntoArg = lerArgumento('conjunto') ?? 'desenvolvimento';
  const conjuntos = conjuntoArg === 'todos' ? CONJUNTOS : [conjuntoArg];

  const selecionados = conjuntos.flatMap((conjunto) => {
    const casos: Caso[] = JSON.parse(readFileSync(join(PASTA, `${conjunto}.json`), 'utf-8'));
    return casos
      .filter((caso) => !filtro || caso.id.includes(filtro))
      .map((caso) => ({ conjunto, caso }));
  });

  // Rodar dezenas de casos estoura o limite de tokens por minuto: tenta de novo.
  const client = new OpenAI({ maxRetries: 6 });
  const resultados = await emParalelo(selecionados, CONCORRENCIA, ({ conjunto, caso }) =>
    avaliarCaso(client, conjunto, caso, rodadas, modelo),
  );

  console.log(`\nInterpretação de pedidos (${modelo}), ${rodadas} rodada(s)`);
  for (const conjunto of conjuntos) {
    imprimirResumo(
      conjunto,
      resultados.filter((r) => r.conjunto === conjunto),
      rodadas,
    );
  }

  const chamadas = resultados.length * rodadas;
  const entrada = resultados.reduce((soma, r) => soma + r.tokens.entrada, 0);
  const saida = resultados.reduce((soma, r) => soma + r.tokens.saida, 0);
  console.log(
    `\nTokens por chamada (média): ${Math.round(entrada / chamadas)} de entrada, ${Math.round(saida / chamadas)} de saída`,
  );

  const comLacuna = resultados.filter((r) => r.caso.lacuna);
  const lacunasDetectadas = comLacuna.filter((r) => r.obtido?.naoMapeado.length);
  console.log(
    `Lacunas previstas que a IA registrou em naoMapeado: ${porcentagem(lacunasDetectadas.length, comLacuna.length)}`,
  );

  const falhas = resultados.filter((r) => r.divergencias.length > 0);
  if (falhas.length) {
    console.log('\nErros que mudam o look:');
    for (const r of falhas) {
      console.log(`- [${r.conjunto}] ${r.caso.id} ("${r.caso.mensagem}")`);
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
