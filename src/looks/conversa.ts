import { MensagemHistorico } from './interpretar-pedido';

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
