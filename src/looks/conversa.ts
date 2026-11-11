import { MensagemHistorico, PecaDesejada } from './interpretar-pedido';
import { Categoria, Ocasiao } from './taxonomia';

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
export const RESPOSTA_JA_SALVO =
  'Esse look já estava salvo! Coloquei ele no topo dos seus looks salvos.';
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

// "Balada", "boate", "night", "rave", "sair pra dançar".
const BALADA = /\b(balada|baladinha|boate|night|rave|clube noturno|sair (pra|para) dan[cç]ar)\b/;

/**
 * Pedido de look para balada (pedido da Sophia, 05/11/2026): sem saia longa e
 * com tênis no lugar do salto, a não ser que a pessoa peça o salto. A IA marca
 * a balada como FESTA, junto com casamento e jantar; aqui o texto decide.
 */
export function falaDeBalada(mensagem: string) {
  return BALADA.test(normalizar(mensagem));
}

// "Troca por um salto", "quero de salto alto", "com scarpin".
const SALTO = /\b(salto|saltinho|saltos|scarpin|scarpins|meia pata)\b/;

/** Pediu salto: na balada, o salto volta a valer (a IA às vezes lê como bota). */
export function pedeSalto(mensagem: string) {
  return SALTO.test(normalizar(mensagem));
}

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

/** Sem acento, para as palavras com "ã" e "ç" ("manhã", "almoço"). */
function semAcento(texto: string) {
  return normalizar(texto).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Atividade em que a pessoa vai suar (pedido da Sophia, 10/11/2026): é o que
// libera a roupa de treino. Academia, corrida, trilha, bike, parque.
const ATIVIDADE_FISICA =
  /\b(academia|treino|treinar|malhar|correr|corrida|caminhada|caminhar|trilha|pedalar|pedal|bike|bicicleta|crossfit|pilates|yoga|ioga|funcional|musculacao|futebol|futsal|volei|basquete|beach tennis|natacao|nadar|patinar|skate|parque)\b/;

/**
 * Pedido de look para uma atividade física. Vale a ocasião ACADEMIA, que no
 * motor é a "atividade física": a IA às vezes marca "correr no parque" como
 * dia a dia.
 */
export function falaDeAtividadeFisica(mensagem: string) {
  return ATIVIDADE_FISICA.test(semAcento(mensagem));
}

// Palavras que já dizem a ocasião. Texto sem acento; a atividade física tem a
// regra dela (falaDeAtividadeFisica).
const PALAVRAS_DA_OCASIAO: [Ocasiao, RegExp][] = [
  ['TRABALHO', /\b(trabalho|trabalhar|trampo|escritorio|expediente|reuniao|entrevista)\b/],
  ['PRAIA', /\b(praia|piscina)\b/],
  ['FESTA', /\b(festa|aniversario|casamento|formatura|balada|boate|show)\b/],
  ['CASA', /\b(ficar em casa|em casa|descansar|descanso|dormir)\b/],
  [
    'DIA_A_DIA',
    /\b(passeio|passear|shopping|cinema|faculdade|aula|mercado|compras|viagem|viajar|estrada)\b/,
  ],
];

// Pedido de conforto (pedido da Sophia, 10/11/2026): "look confortável para
// uma viagem de carro longa" veio com cropped e calça de couro. Viagem e
// trajeto longo sentado também pedem conforto.
const CONFORTO =
  /\b(confortavel|confortaveis|conforto|confort|viagem|viajar|estrada|road trip|carro|onibus|aviao|voo|rodoviaria|largadinh[oa]|soltinh[oa]|relaxad[oa]|de boa)\b/;

/** O pedido (ou a conversa) pede um look confortável. */
export function pedeConforto(mensagem: string, historico: MensagemHistorico[] = []) {
  return [mensagem, ...historico.filter((m) => m.autor === 'usuario').map((m) => m.texto)].some(
    (texto) => CONFORTO.test(semAcento(texto)),
  );
}

/**
 * A ocasião que a mensagem diz com todas as letras, ou null. A IA lia
 * "trabalho amanhã" como um evento sem nome e perguntava "Qual o tipo de
 * trabalho?" (10/11/2026; a regra do prompt é para "tenho um evento
 * amanhã"). Com a ocasião clara, o chat não pergunta.
 */
export function ocasiaoDoTexto(mensagem: string): Ocasiao | null {
  const texto = semAcento(mensagem);
  return PALAVRAS_DA_OCASIAO.find(([, padrao]) => padrao.test(texto))?.[0] ?? null;
}

/**
 * Pergunta do horário (pedido da Sophia, 10/11/2026): o dia vai de um extremo
 * ao outro (manhã fria, tarde quente, noite fria), e a previsão do horário do
 * evento acerta mais o look. Também diz se a festa é de dia ou à noite.
 */
export const PERGUNTA_QUANDO =
  'Quando vai ser? Me conta o dia e se é de manhã, à tarde ou à noite, que eu confiro a previsão do tempo para esse horário.';
/**
 * Com o dia já dito ("look pra trabalhar amanhã"), só o período: perguntar o
 * dia de novo soa como se a Zyra não tivesse lido (pedido da Sophia).
 */
export const PERGUNTA_PERIODO_DO_DIA =
  'Vai ser de manhã, à tarde ou à noite? Assim eu confiro a previsão do tempo para esse horário.';
// A pergunta antiga, só da festa (10/11/2026, primeira versão): uma conversa
// aberta com ela continua valendo.
const PERGUNTA_PERIODO_ANTIGA =
  'A festa vai ser de dia ou à noite? Assim eu acerto o tecido e o brilho do look.';

export type ParteDoDia = 'MANHA' | 'TARDE' | 'NOITE';

/** O horário do evento: as horas (0 a 24) e como dizer na resposta. */
export type HorarioDoEvento = {
  partes: ParteDoDia[];
  /** Primeira hora (inclusive) e última (exclusive), no fuso do lugar. */
  inicio: number;
  fim: number;
  /** "De manhã", "À tarde", "À noite", "Durante o dia", "Da tarde à noite". */
  nome: string;
};

const HORAS: Record<ParteDoDia, [number, number]> = {
  MANHA: [6, 12],
  TARDE: [12, 18],
  NOITE: [18, 24],
};

const PALAVRAS_DA_PARTE: [ParteDoDia, RegExp][] = [
  [
    'NOITE',
    /\b(noite|noturn[oa]|jantar|janta|balada|boate|night|happy hour|madrugada|anoitecer)\b/,
  ],
  // "Tarde" sozinho também ("sábado tarde"), menos "mais tarde".
  ['TARDE', /\b((?<!mais )tarde|almoco|almocar|meio[- ]dia|entardecer)\b/],
  ['MANHA', /\b(manha|cedo|cafe da manha|brunch)\b/],
];
// "De dia", "durante o dia", "chá de bebê": a parte clara do dia, manhã e tarde.
const DE_DIA =
  /\b(de dia|durante o dia|diurn[oa]|cha (de|da|do)|piquenique|dia (todo|inteiro)|o dia todo)\b/;
// "Agora", "já já": a parte do dia em que a pessoa está.
const AGORA = /\b(agora|ja ja|daqui a pouco|neste momento|nesse momento)\b/;

function nomeDoHorario(partes: ParteDoDia[]) {
  const [primeira, ultima] = [partes[0], partes[partes.length - 1]];
  if (partes.length === 1) {
    return { MANHA: 'De manhã', TARDE: 'À tarde', NOITE: 'À noite' }[primeira];
  }
  if (primeira === 'MANHA' && ultima === 'TARDE') return 'Durante o dia';
  const de = { MANHA: 'De manhã', TARDE: 'Da tarde', NOITE: 'Da noite' }[primeira];
  const ate = { MANHA: 'à manhã', TARDE: 'à tarde', NOITE: 'à noite' }[ultima];
  return `${de} ${ate}`;
}

/** Hora cheia agora no Brasil (o servidor pode estar em UTC). */
function horaNoBrasil(agora: Date) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    }).format(agora),
  );
}

/** As partes do dia citadas num texto, na ordem do dia. */
function partesDoTexto(texto: string, agora: Date): ParteDoDia[] {
  const limpo = semAcento(texto)
    // "Dia a dia", "dia 15", "todo dia", "amanhã" e "bom dia" não dizem o horário.
    .replace(
      /\b(dia a dia|dia \d+|todo dia|outro dia|no dia|do dia|esse dia|este dia|bom dia|boa tarde|boa noite|que dia|qual dia)\b/g,
      ' ',
    );
  const partes = new Set<ParteDoDia>();
  for (const [parte, padrao] of PALAVRAS_DA_PARTE) if (padrao.test(limpo)) partes.add(parte);
  if (DE_DIA.test(limpo)) {
    partes.add('MANHA');
    partes.add('TARDE');
  }
  if (!partes.size && AGORA.test(limpo)) {
    const hora = horaNoBrasil(agora);
    partes.add(hora >= 18 || hora < 6 ? 'NOITE' : hora >= 12 ? 'TARDE' : 'MANHA');
  }
  return (['MANHA', 'TARDE', 'NOITE'] as ParteDoDia[]).filter((p) => partes.has(p));
}

/**
 * O horário do evento, pela mensagem ou, se ela não diz, pela última mensagem
 * do usuário que disse. null se ninguém falou.
 */
export function horarioDoEvento(
  mensagem: string,
  historico: MensagemHistorico[],
  agora = new Date(),
): HorarioDoEvento | null {
  const textos = [
    mensagem,
    ...[...historico]
      .reverse()
      .filter((m) => m.autor === 'usuario')
      .map((m) => m.texto),
  ];
  for (const texto of textos) {
    const partes = partesDoTexto(texto, agora);
    if (partes.length) {
      return {
        partes,
        inicio: HORAS[partes[0]][0],
        fim: HORAS[partes[partes.length - 1]][1],
        nome: nomeDoHorario(partes),
      };
    }
  }
  return null;
}

/**
 * Horário que a ocasião já diz, sem perguntar (pedido da Sophia, 10/11/2026:
 * "trabalhar é o dia inteiro"):
 * - trabalho: o expediente, das 7h às 19h, com a ida e a volta (a manhã fria
 *   da ida entra na faixa e pede a camada);
 * - praia: durante o dia, das 9h às 17h.
 * As outras ocasiões variam (academia de manhã ou à noite, festa, faculdade
 * noturna, shopping): para elas, o chat pergunta. O horário dito pela pessoa
 * ("plantão à noite") vale mais que este.
 */
export function horarioDaOcasiao(ocasiao: Ocasiao | null): HorarioDoEvento | null {
  if (ocasiao === 'TRABALHO') {
    return { partes: ['MANHA', 'TARDE'], inicio: 7, fim: 19, nome: 'No horário de trabalho' };
  }
  if (ocasiao === 'PRAIA') {
    return { partes: ['MANHA', 'TARDE'], inicio: 9, fim: 17, nome: 'Durante o dia' };
  }
  return null;
}

/**
 * Se a festa é de dia ou à noite: com a noite no horário, é noite (o brilho
 * vale); de manhã ou à tarde, é dia.
 */
export function periodoDoEvento(
  mensagem: string,
  historico: MensagemHistorico[],
  agora = new Date(),
): 'DIA' | 'NOITE' | null {
  const horario = horarioDoEvento(mensagem, historico, agora);
  if (!horario) return null;
  return horario.partes.includes('NOITE') ? 'NOITE' : 'DIA';
}

const ePerguntaDoHorario = (m: MensagemHistorico) =>
  terminaCom(m, PERGUNTA_QUANDO) ||
  terminaCom(m, PERGUNTA_PERIODO_DO_DIA) ||
  terminaCom(m, PERGUNTA_PERIODO_ANTIGA);

/** A Zyra já perguntou quando é o evento nesta conversa? */
export function jaPerguntouQuando(historico: MensagemHistorico[]) {
  return historico.some(ePerguntaDoHorario);
}

/**
 * A mensagem responde à pergunta do horário. Devolve o pedido que veio antes
 * dela ("look pra festa sábado"), para juntar com a resposta ("à noite").
 */
export function pedidoAntesDaPergunta(historico: MensagemHistorico[]): string | null {
  const ultimaDaZyra = [...historico].reverse().findIndex((m) => m.autor === 'zyra');
  if (ultimaDaZyra < 0) return null;
  const indice = historico.length - 1 - ultimaDaZyra;
  if (!ePerguntaDoHorario(historico[indice])) return null;
  const anterior = historico
    .slice(0, indice)
    .reverse()
    .find((m) => m.autor === 'usuario');
  return anterior?.texto ?? null;
}

const CHUVA = /\b(chuva|chover|chovendo|chuvoso|chuvosa|garoa|garoando|temporal)\b/;

/** A pessoa disse que vai chover (vale como a previsão de chuva). */
export function falaDeChuva(mensagem: string) {
  return (
    CHUVA.test(semAcento(mensagem)) && !/\b(sem chuva|nao vai chover)\b/.test(semAcento(mensagem))
  );
}

const FRIO_FORTE =
  /\b(muito frio|frio forte|frio intenso|frio de rachar|congelando|gelado|gelada|frio absurdo)\b/;

/** A pessoa disse que vai fazer muito frio: vale o casaco pesado. */
export function falaDeFrioForte(mensagem: string) {
  return FRIO_FORTE.test(semAcento(mensagem));
}

const PEDE_CURTA = /\b(curt[ao]s?|mais curt[ao]|mini|minissaia|minivestido|micro)\b/;
const PEDE_LONGA =
  /\b(long[ao]s?|mais long[ao]|midi|comprid[ao]|ate o joelho|abaixo do joelho|ate o pe)\b/;

/**
 * Comprimento pedido para saia e vestido (10/11/2026: "troque a saia, quero
 * uma mais curta" trocou por outra saia longa; a IA não tem campo de
 * comprimento). Só a mensagem atual: "manga longa" e "cano curto" não contam.
 */
export function comprimentoPedido(mensagem: string): 'CURTA' | 'LONGA' | null {
  const texto = semAcento(mensagem).replace(/\b(manga|cano) (curt[ao]|long[ao])\b/g, ' ');
  const curta = PEDE_CURTA.test(texto);
  const longa = PEDE_LONGA.test(texto);
  if (curta === longa) return null;
  return curta ? 'CURTA' : 'LONGA';
}

// Lugares fechados que costumam ter ar-condicionado forte.
const LUGAR_FECHADO =
  /\b(shopping|cinema|teatro|museu|escritorio|aeroporto|aviao|voo|biblioteca|exposicao)\b/;

const NOME_DO_LUGAR: Record<string, string> = {
  shopping: 'No shopping',
  cinema: 'No cinema',
  teatro: 'No teatro',
  museu: 'No museu',
  escritorio: 'No escritório',
  aeroporto: 'No aeroporto',
  aviao: 'No avião',
  voo: 'No avião',
  biblioteca: 'Na biblioteca',
  exposicao: 'Na exposição',
};

/** O lugar fechado citado no pedido ou na conversa ("shopping", "cinema"), ou null. */
export function lugarFechado(mensagem: string, historico: MensagemHistorico[] = []) {
  const textos = [mensagem, ...historico.filter((m) => m.autor === 'usuario').map((m) => m.texto)];
  for (const texto of textos) {
    const achado = LUGAR_FECHADO.exec(semAcento(texto));
    if (achado) return achado[1];
  }
  return null;
}

/**
 * Aviso do ar-condicionado num dia quente. O look segue a previsão (sem
 * casaco no calor, decisão da Sophia de 06/11/2026); o aviso só lembra de
 * levar uma peça leve.
 */
export function avisoDeArCondicionado(lugar: string) {
  return (
    `${NOME_DO_LUGAR[lugar] ?? 'Em lugar fechado'}, o ar-condicionado costuma ser forte: ` +
    'se você sente frio fácil, leve uma peça leve para pôr por cima.'
  );
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
  corset: ['CORSET'],
  corpete: ['CORSET'],
  corselet: ['CORSET'],
  bustie: ['CORSET'],
  moletom: ['MOLETOM'],
  moletons: ['MOLETOM'],
  sueter: ['SUETER'],
  sueteres: ['SUETER'],
  pulover: ['SUETER'],
  pullover: ['SUETER'],
  jaqueta: ['JAQUETA'],
  casaco: ['JAQUETA', 'MOLETOM'],
  blazer: ['BLAZER'],
  colete: ['COLETE'],
  calca: ['CALCA'],
  short: ['SHORT'],
  bermuda: ['SHORT'],
  saia: ['SAIA'],
  vestido: ['VESTIDO'],
  tenis: ['TENIS'],
  sapato: ['SAPATO'],
  bota: ['BOTA'],
  botas: ['BOTA'],
  coturno: ['BOTA'],
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

// "Tira a jaqueta", "remove o casaco", "sem a jaqueta", "não quero a jaqueta".
const REMOVER =
  /\b(remove|remover|remova|removo|tira|tirar|tire|tiro|retira|retirar|retire|exclui|excluir|dispensa|sem (o|a|os|as)|nao quero (o|a|os|as)|nao precisa (do|da|de))\b/;
// Com troca ou acréscimo junto ("tira a jaqueta e põe um blazer"), não é só
// remover: a IA cuida.
const TROCAR_OU_POR =
  /\b(troca|trocar|troque|substitui|substituir|muda|mudar|outr[oa]s?|p[oõ]e|por um|por uma|coloca|colocar|bota|botar|no lugar)\b/;
// Palavras genéricas para a peça de cima por cima.
const PALAVRAS_DA_CAMADA: Record<string, Categoria[]> = {
  agasalho: ['JAQUETA', 'MOLETOM', 'SUETER', 'BLAZER'],
  casaquinho: ['JAQUETA', 'MOLETOM'],
  cardiga: ['JAQUETA'],
  sapatos: ['SAPATO'],
};

/**
 * Pedido para tirar uma peça do look da tela ("tira a jaqueta"), sem trocar
 * por outra (pedido da Sophia, 10/11/2026: "remove a jaqueta" virou outra
 * camisa no lugar). Devolve as categorias citadas, ou null se a mensagem não
 * é um pedido de remover.
 */
export function pecasParaRemover(mensagem: string): Categoria[] | null {
  const texto = semAcento(mensagem);
  if (!REMOVER.test(texto) || TROCAR_OU_POR.test(texto)) return null;
  const categorias = texto
    .replace(/[,;.!?]/g, ' ')
    .split(/\s+/)
    .flatMap((palavra) => categoriasDe(palavra) ?? PALAVRAS_DA_CAMADA[palavra] ?? []);
  return categorias.length ? [...new Set(categorias)] : null;
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
