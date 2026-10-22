import { MensagemHistorico, PecaDesejada } from './interpretar-pedido';
import { Categoria } from './taxonomia';

/**
 * Perguntas que a Zyra faz no fim de cada look e respostas curtas que o back
 * entende sem chamar a IA. Os textos são fixos: a IA do chat não escreve texto.
 */

export const PERGUNTA_OCASIAO = 'É para alguma ocasião? Assim eu acerto melhor.';
export const PERGUNTA_CLIMA = 'Vai estar frio ou calor? Assim eu acerto melhor.';
export const PERGUNTA_SALVAR = 'Quer que eu salve esse look?';

// Antes da pergunta de salvar, um convite para ajustar o look. Varia para a
// conversa não soar repetida; a pergunta do fim é sempre a mesma, porque é por
// ela que o "sim" seguinte é reconhecido.
const CONVITES_PARA_AJUSTAR = [
  'O que achou? Se quiser trocar alguma peça, é só falar.',
  'Gostou? Posso trocar qualquer peça, é só me dizer qual.',
  'Ficou bom? Se quiser mudar algo, me fala.',
];

export const RESPOSTA_NAO_SALVAR = 'Tudo bem! Se quiser outro look, é só pedir.';
export const RESPOSTA_SALVO = 'Pronto, salvei esse look! Ele fica nos seus looks salvos.';
export const RESPOSTA_SEM_LOOK_PARA_SALVAR =
  'Ainda não montei um look para salvar. Me conta para onde você vai.';

const SIM =
  /^(sim|s|isso|claro|pode|pode sim|quero|ok|okay|bora|beleza|ta bom|tá bom|por favor|salva|salvar|pode salvar|quero salvar|salva sim|sim,? salva|sim,? por favor)$/;
const NAO =
  /^(n|nao|não|nao quero|não quero|agora nao|agora não|nao precisa|não precisa|(nao|não) (quero )?salva(r)?)$/;

// Pedido de salvar com as próprias palavras, em qualquer ponto da conversa:
// "salva esse look", "pode guardar", "gostei, guarda pra mim".
const PEDIDO_DE_SALVAR =
  /\b(salva|salvar|salve|guarda|guardar|guarde)\b(?!.*\b(outro|outra|depois)\b)/;

function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .trim()
    .replace(/[!.?…]+$/u, '')
    .replace(/\s+/g, ' ');
}

function terminaCom(mensagem: MensagemHistorico, pergunta: string) {
  return mensagem.autor === 'zyra' && mensagem.texto.trim().endsWith(pergunta);
}

export type RespostaCurta = 'SALVAR' | 'NAO_SALVAR';

/**
 * Pedido de salvar o look da tela: "sim" ou "não" logo depois de "Quer salvar
 * esse look?", ou "salva/guarda" em qualquer momento. Fica em código, e não na
 * IA: as frases são poucas, não gasta tokens, e um tipo novo no prompt piorou
 * o acerto dos outros campos. Qualquer outra coisa vai para o interpretador.
 */
export function entenderRespostaCurta(
  mensagem: string,
  historico: MensagemHistorico[],
): RespostaCurta | null {
  const texto = normalizar(mensagem);
  if (PEDIDO_DE_SALVAR.test(texto) && !/\b(nao|não|nem)\b/.test(texto)) return 'SALVAR';

  const ultimaDaZyra = [...historico].reverse().find((m) => m.autor === 'zyra');
  if (!ultimaDaZyra || !terminaCom(ultimaDaZyra, PERGUNTA_SALVAR)) return null;

  if (SIM.test(texto)) return 'SALVAR';
  if (NAO.test(texto)) return 'NAO_SALVAR';
  return null;
}

/**
 * Uma pergunta só por look, na ordem de quanto ela melhora a sugestão. As de
 * ocasião e de clima aparecem no máximo uma vez por conversa; depois disso, e
 * quando nada falta, a Zyra oferece salvar.
 */
export function perguntaDoLook(opcoes: {
  temOcasiao: boolean;
  temClima: boolean;
  historico: MensagemHistorico[];
  aleatorio?: () => number;
}) {
  const jaPerguntou = (pergunta: string) => opcoes.historico.some((m) => terminaCom(m, pergunta));

  if (!opcoes.temOcasiao && !jaPerguntou(PERGUNTA_OCASIAO)) return PERGUNTA_OCASIAO;
  if (!opcoes.temClima && !jaPerguntou(PERGUNTA_CLIMA)) return PERGUNTA_CLIMA;
  const sorteio = (opcoes.aleatorio ?? Math.random)();
  const convite = CONVITES_PARA_AJUSTAR[Math.floor(sorteio * CONVITES_PARA_AJUSTAR.length)];
  return `${convite} ${PERGUNTA_SALVAR}`;
}

// "Põe uma blusa também", "adiciona uma jaqueta", "coloca um moletom por cima".
const ACRESCENTAR =
  /\b(tamb[eé]m|adiciona|adicionar|acrescenta|acrescentar|coloca|colocar|bota|botar|p[oõ]e|inclui|incluir)\b/;
const POR_CIMA = /\bpor cima\b/;

/**
 * Pedido para acrescentar uma peça ao look da tela, sem tirar nenhuma. A IA às
 * vezes marca isso como troca da camada (certo) e às vezes como look novo
 * ("quero uma blusa também"); aqui o texto decide.
 */
export function pedeParaAcrescentar(mensagem: string) {
  const texto = normalizar(mensagem);
  return POR_CIMA.test(texto) || (ACRESCENTAR.test(texto) && !/\btroca/.test(texto));
}

// Palavras de cor que a pessoa pode usar no pedido (com variações de gênero e
// plural pelo começo da palavra).
const PALAVRA_DE_COR =
  /\b(pret|branc|cinz|vermelh|ros[ae]|vinho|bord[oô]|azul|azuis|marinho|verde|amarel|laranja|rox[ao]|lil[aá]s|marrom|marrons|bege|caramelo|creme|nude|mostarda|dourad|prat|colorid|neutr|clar[ao]|escur[ao])/;

// "Date", "encontro", "sair com o crush", "jantar romântico".
const ENCONTRO =
  /\b(date|encontro|crush|ficante|paquera|namorad[oa]|jantar rom[aâ]ntico|sair com (ela|ele|algu[eé]m|uma (garota|menina|mina)|um (garoto|menino|cara)))\b/;

/**
 * Pedido de look para um encontro. Date não é festa (decisão de 20/10/2026):
 * é um look casual arrumado, sem peça social.
 */
export function falaDeEncontro(mensagem: string) {
  return ENCONTRO.test(normalizar(mensagem));
}

/** A mensagem fala de alguma cor? */
export function falaDeCor(mensagem: string) {
  return PALAVRA_DE_COR.test(normalizar(mensagem));
}

// Palavras que a pessoa usa para cada categoria, sem acento. "Casaco" pode ter
// virado moletom ou jaqueta na IA, então vale pelas duas.
const CATEGORIAS_DA_PALAVRA: Record<string, Categoria[]> = {
  camiseta: ['CAMISETA'],
  regata: ['CAMISETA'],
  camisa: ['CAMISA'],
  blusa: ['BLUSA'],
  blusinha: ['BLUSA'],
  cropped: ['CROPPED'],
  top: ['TOP'],
  body: ['BODY'],
  moletom: ['MOLETOM'],
  moletons: ['MOLETOM'],
  jaqueta: ['JAQUETA'],
  casaco: ['JAQUETA', 'MOLETOM'],
  blazer: ['BLAZER'],
  calca: ['CALCA'],
  short: ['SHORT'],
  bermuda: ['SHORT'],
  saia: ['SAIA'],
  vestido: ['VESTIDO'],
  tenis: ['TENIS'],
  sapato: ['SAPATO'],
  sandalia: ['SANDALIA'],
  chinelo: ['CHINELO'],
};

// Palavras que encerram o trecho de uma alternativa: em "camiseta preta ou
// branca com calça", a calça não faz parte do "ou".
const FIM_DA_ALTERNATIVA = new Set([',', 'e', 'com', 'mas', 'ou', 'sem', 'para', 'pra', 'nem']);
// Palavras entre a peça e o "ou" ("um moletom cinza ou uma jaqueta").
const MAXIMO_DE_PALAVRAS_ATE_A_PECA = 3;

function categoriasDe(palavra: string | undefined): Categoria[] | null {
  if (!palavra) return null;
  return CATEGORIAS_DA_PALAVRA[palavra] ?? CATEGORIAS_DA_PALAVRA[palavra.replace(/s$/, '')] ?? null;
}

function categoriasDaPalavra(palavras: string[], i: number): Categoria[] | null {
  // "Calça de moletom": peça + "de" + palavra é material. Já em "vou de tênis",
  // o tênis é a peça.
  if (palavras[i - 1] === 'de' && categoriasDe(palavras[i - 2])) return null;
  return categoriasDe(palavras[i]);
}

/** Primeira peça citada a partir do "ou", andando para um lado (passo -1 ou 1). */
function pecaPerto(palavras: string[], ou: number, passo: 1 | -1): Categoria[] | null {
  let outras = 0;
  for (let i = ou + passo; i >= 0 && i < palavras.length; i += passo) {
    if (FIM_DA_ALTERNATIVA.has(palavras[i])) return null;
    const categorias = categoriasDaPalavra(palavras, i);
    if (categorias) return categorias;
    if (++outras > MAXIMO_DE_PALAVRAS_ATE_A_PECA) return null;
  }
  return null;
}

/**
 * Peças pedidas com "ou", como grupos de índices de `incluir`: basta uma do
 * grupo estar no look. A IA devolve "quero um moletom ou jaqueta" como as duas
 * peças, e o motor exigia as duas juntas.
 *
 * Só entram no grupo as peças citadas em volta do "ou": em "camiseta preta ou
 * branca com calça jeans", a calça continua obrigatória. Sem peça depois do
 * "ou" ("camiseta preta ou branca"), a alternativa é a mesma peça em outra cor.
 */
export function alternativasDoPedido(mensagem: string, incluir: PecaDesejada[]): number[][] {
  const palavras = mensagem
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,;.!?]/g, ' , ')
    .split(/\s+/)
    .filter(Boolean);

  const grupos: Set<number>[] = [];
  palavras.forEach((palavra, ou) => {
    if (palavra !== 'ou') return;
    const antes = pecaPerto(palavras, ou, -1);
    if (!antes) return;
    const categorias = [...antes, ...(pecaPerto(palavras, ou, 1) ?? antes)];
    const indices = incluir.flatMap((peca, i) =>
      peca.categoria && categorias.includes(peca.categoria) ? [i] : [],
    );
    if (indices.length < 2) return;

    // "Camiseta ou camisa ou blusa": grupos que se tocam viram um só.
    const juntos = grupos.filter((grupo) => indices.some((i) => grupo.has(i)));
    const novo = new Set([...indices, ...juntos.flatMap((grupo) => [...grupo])]);
    grupos.splice(0, grupos.length, ...grupos.filter((g) => !juntos.includes(g)), novo);
  });

  return grupos.map((grupo) => [...grupo].sort((a, b) => a - b));
}
