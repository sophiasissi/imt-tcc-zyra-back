import { MensagemHistorico } from './interpretar-pedido';

/**
 * O dia do evento ("amanhã", "sábado", "dia 20"), para buscar a previsão do
 * tempo daquele dia. Fica em código, e não na IA: as expressões são regulares,
 * e acrescentar o campo ao prompt piorou o acerto dos outros campos (de 88% para
 * 84% na validação, em 06/10/2026).
 */

export type Dia =
  | 'HOJE'
  | 'AMANHA'
  | 'DEPOIS_DE_AMANHA'
  | 'SEGUNDA'
  | 'TERCA'
  | 'QUARTA'
  | 'QUINTA'
  | 'SEXTA'
  | 'SABADO'
  | 'DOMINGO'
  | 'DATA';

/** data: só com dia DATA, "DD/MM" ou "DD" (sem o mês). */
export type DiaDoEvento = { dia: Dia; data: string | null };

const DIA_DA_SEMANA: Partial<Record<Dia, number>> = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
};

// Na ordem: "depois de amanhã" antes de "amanhã". Texto já sem acento.
const PADROES: [RegExp, Dia][] = [
  [/\bdepois de amanha\b/, 'DEPOIS_DE_AMANHA'],
  [/\bamanha\b/, 'AMANHA'],
  [/\b(hoje|hj)\b/, 'HOJE'],
  // "segunda" e "quarta" também são ordinais ("segunda opção"): só valem como dia
  // sem um substantivo depois, ou com "-feira".
  [/\bsegunda(-feira| feira)?\b(?! (vez|opcao|peca|camisa|calca|cor|sugestao))/, 'SEGUNDA'],
  [/\bterca(-feira| feira)?\b/, 'TERCA'],
  [/\bquarta(-feira| feira)?\b(?! (vez|opcao|peca|sugestao))/, 'QUARTA'],
  [/\bquinta(-feira| feira)?\b(?! (vez|opcao|peca|sugestao))/, 'QUINTA'],
  [/\bsexta(-feira| feira)?\b/, 'SEXTA'],
  [/\b(sabado|fim de semana|final de semana|fds)\b/, 'SABADO'],
  [/\bdomingo\b/, 'DOMINGO'],
];

function semAcento(texto: string) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** O dia citado no texto, ou null se ele não cita nenhum. */
export function extrairDia(texto: string): DiaDoEvento | null {
  const limpo = semAcento(texto);

  // "dia 20", "dia 20/10", "em 14/11".
  const data =
    /\bdia (\d{1,2}(?:\/\d{1,2})?)\b/.exec(limpo) ?? /\b(\d{1,2}\/\d{1,2})\b/.exec(limpo);
  if (data) return { dia: 'DATA', data: data[1] };

  const encontrado = PADROES.find(([padrao]) => padrao.test(limpo));
  return encontrado ? { dia: encontrado[1], data: null } : null;
}

/**
 * O dia do evento na conversa: o da mensagem atual ou, se ela não cita dia
 * ("trabalho", "troca o tênis"), o da última mensagem do usuário que citou.
 */
export function diaDaConversa(
  mensagem: string,
  historico: MensagemHistorico[],
): DiaDoEvento | null {
  const doUsuario = historico.filter((m) => m.autor === 'usuario').map((m) => m.texto);
  for (const texto of [mensagem, ...doUsuario.reverse()]) {
    const dia = extrairDia(texto);
    if (dia) return dia;
  }
  return null;
}

/**
 * Quantos dias faltam até o dia citado. null quando não dá para saber (data que
 * não existe). "Sábado" num sábado é hoje; "dia 3" já passado este mês é o dia
 * 3 do mês que vem; "05/10" já passado é do ano que vem.
 */
export function diasAte(evento: DiaDoEvento | null, hoje: Date): number | null {
  if (!evento || evento.dia === 'HOJE') return 0;
  if (evento.dia === 'AMANHA') return 1;
  if (evento.dia === 'DEPOIS_DE_AMANHA') return 2;

  const semana = DIA_DA_SEMANA[evento.dia];
  if (semana !== undefined) return (semana - hoje.getDay() + 7) % 7;

  const partes = /^(\d{1,2})(?:\/(\d{1,2}))?$/.exec(evento.data ?? '');
  if (!partes) return null;

  const diaDoMes = Number(partes[1]);
  const inicioDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  // Só o dia ("dia 20"): este mês, ou o próximo se o dia já passou.
  const mesDito = partes[2] ? Number(partes[2]) - 1 : null;
  const candidatos =
    mesDito !== null
      ? [
          { ano: hoje.getFullYear(), mes: mesDito },
          { ano: hoje.getFullYear() + 1, mes: mesDito },
        ]
      : [
          { ano: hoje.getFullYear(), mes: hoje.getMonth() },
          { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 },
        ];

  const alvo = candidatos
    .map(({ ano, mes }) => ({ data: new Date(ano, mes, diaDoMes), mes: ((mes % 12) + 12) % 12 }))
    .find(({ data, mes }) => data.getMonth() === mes && data >= inicioDeHoje)?.data;
  if (!alvo) return null; // 31/02, ou dia que não existe

  return Math.round((alvo.getTime() - inicioDeHoje.getTime()) / 86_400_000);
}
