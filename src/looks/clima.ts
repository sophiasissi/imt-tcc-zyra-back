import { Injectable } from '@nestjs/common';

import { Aquecimento } from './taxonomia';

/**
 * Previsão do tempo para o chat não precisar perguntar se está frio ou calor.
 *
 * Fonte: Open-Meteo (https://open-meteo.com), gratuita e sem chave. A previsão
 * diária cobre 16 dias a partir de hoje, no fuso da própria localização, e a
 * hora a hora (10/11/2026) dá a temperatura das horas do evento.
 */

export type Localizacao = { latitude: number; longitude: number };

/** Horas do evento, de 0 a 24, no fuso do lugar (fim exclusive). */
export type Horario = { inicio: number; fim: number; nome: string };

/** Previsão só nas horas do evento (temperatura hora a hora). */
export type PrevisaoDoHorario = {
  /** "De manhã", "À noite"... */
  nome: string;
  minima: number;
  maxima: number;
  chanceDeChuva: number | null;
};

export type Previsao = {
  /** 0 = hoje, 1 = amanhã... */
  diasAPartirDeHoje: number;
  minima: number;
  maxima: number;
  chanceDeChuva: number | null;
  /**
   * Com o horário do evento (10/11/2026): o look segue a temperatura dessas
   * horas, e não a do dia inteiro, que vai de um extremo ao outro.
   */
  horario?: PrevisaoDoHorario | null;
};

export const DIAS_DE_PREVISAO = 16;

// Faixas de temperatura (revistas em 05/11/2026). A tabela de roupa por
// temperatura da Weathernews (meteorologia do Japão) põe manga curta a partir
// de 25 °C, manga longa abaixo disso, cardigã abaixo de 20 °C e suéter abaixo
// de 16 °C, e avisa para não escolher a roupa pela temperatura da manhã.
// Antes o calor era pela média (>= 24 °C): 21 a 26 °C dava "ameno" e o look de
// trabalho saía com manga longa e jaqueta.
// - calor: máxima de 25 °C ou mais, com a mínima de 15 °C ou mais (com a
//   manhã bem fria, como 26/12 °C, o dia é ameno: pede uma peça para tirar);
// - frio: média de 16 °C ou menos (19/10 °C);
// - ameno: o resto. Com a máxima abaixo de 20 °C ou a mínima abaixo de 16 °C,
//   o look leva uma camada leve (cardigã, jaqueta), veja `pedeCamadaLeve`.
export const MAXIMA_CALOR = 25;
export const MINIMA_DO_CALOR = 15;
export const MEDIA_FRIO = 16;
export const MAXIMA_SEM_CAMADA = 20;
export const MINIMA_SEM_CAMADA = 16;
export const CHANCE_DE_CHUVA_AVISO = 60;

const TEMPO_LIMITE_MS = 3_000;
const VALIDADE_CACHE_MS = 30 * 60_000;

/**
 * A faixa de temperatura que o look precisa enfrentar: a das horas do evento,
 * se a pessoa disse quando é; senão, a do dia inteiro. As faixas abaixo valem
 * para as duas (a do horário só é mais estreita).
 */
function faixa(previsao: Previsao) {
  return previsao.horario ?? previsao;
}

export function aquecimentoDaPrevisao(previsao: Previsao): Aquecimento {
  const { minima, maxima } = faixa(previsao);
  const media = (minima + maxima) / 2;
  if (maxima >= MAXIMA_CALOR && minima >= MINIMA_DO_CALOR) return 'LEVE';
  if (media <= MEDIA_FRIO) return 'QUENTE';
  return 'MEDIO';
}

/** Dia (ou horário) ameno que ainda pede uma camada leve: tarde fresca ou manhã fria. */
export function pedeCamadaLeve(previsao: Previsao) {
  const { minima, maxima } = faixa(previsao);
  return (
    aquecimentoDaPrevisao(previsao) === 'MEDIO' &&
    (maxima < MAXIMA_SEM_CAMADA || minima < MINIMA_SEM_CAMADA)
  );
}

/**
 * Frio forte: média de 13 °C ou menos no horário do evento (ou no dia). É o
 * frio do casaco pesado (puffer, parka, sobretudo), pedido da Sophia
 * (10/11/2026). Pelos guias de camadas, entre 15 e 8 °C já vai casaco; o
 * puffer leve sozinho aguenta até uns 10 °C.
 */
export const MEDIA_FRIO_FORTE = 13;

export function fazFrioForte(previsao: Previsao) {
  const { minima, maxima } = faixa(previsao);
  return (minima + maxima) / 2 <= MEDIA_FRIO_FORTE;
}

/** Chance de chuva que vale para o look: a do horário, se houver. */
export function chanceDeChuvaDoLook(previsao: Previsao) {
  return faixa(previsao).chanceDeChuva ?? 0;
}

const NOME_DO_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "hoje", "amanhã" ou "sábado (10/10)". */
export function nomeDoDia(diasAPartirDeHoje: number, hoje: Date) {
  if (diasAPartirDeHoje === 0) return 'hoje';
  if (diasAPartirDeHoje === 1) return 'amanhã';

  const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + diasAPartirDeHoje);
  const dataCurta = `${String(alvo.getDate()).padStart(2, '0')}/${String(alvo.getMonth() + 1).padStart(2, '0')}`;
  return `${NOME_DO_DIA[alvo.getDay()]} (${dataCurta})`;
}

/** Como o dia vai parecer, pela média: "quente", "agradável", "fresco" ou "frio". */
export function sensacaoDoDia(previsao: Previsao) {
  const media = (previsao.minima + previsao.maxima) / 2;
  // O dia inteiro, mesmo quando há horário: a frase fala do dia.
  if (aquecimentoDaPrevisao({ ...previsao, horario: null }) === 'LEVE') return 'quente';
  if (media >= 20) return 'agradável';
  if (media > MEDIA_FRIO) return 'fresco';
  return 'frio';
}

const faixaEmGraus = (minima: number, maxima: number) =>
  Math.round(minima) === Math.round(maxima)
    ? `cerca de ${Math.round(minima)} °C`
    : `de ${Math.round(minima)} a ${Math.round(maxima)} °C`;

/**
 * Frase curta que diz de onde veio o clima do look:
 * "Pela previsão, hoje vai ser um dia fresco (13 a 21 °C) e pode chover."
 * Com o horário do evento, mais uma frase (10/11/2026):
 * "Pela previsão, sábado (15/11) vai ser um dia fresco (13 a 24 °C). À noite,
 * deve fazer de 15 a 18 °C."
 */
export function descreverPrevisao(previsao: Previsao, hoje: Date) {
  const dia = nomeDoDia(previsao.diasAPartirDeHoje, hoje);
  const faixaDoDia = `${Math.round(previsao.minima)} a ${Math.round(previsao.maxima)} °C`;
  const pode = (chance: number | null) => (chance ?? 0) >= CHANCE_DE_CHUVA_AVISO;
  const { horario } = previsao;

  if (!horario) {
    const chuva = pode(previsao.chanceDeChuva) ? ' e pode chover' : '';
    return `Pela previsão, ${dia} vai ser um dia ${sensacaoDoDia(previsao)} (${faixaDoDia})${chuva}.`;
  }

  const chuva = pode(horario.chanceDeChuva) ? ', e pode chover' : '';
  return (
    `Pela previsão, ${dia} vai ser um dia ${sensacaoDoDia(previsao)} (${faixaDoDia}). ` +
    `${horario.nome}, deve fazer ${faixaEmGraus(horario.minima, horario.maxima)}${chuva}.`
  );
}

/**
 * A previsão das horas do evento, a partir da resposta hora a hora. A lista
 * começa na meia-noite de hoje, no fuso do lugar (timezone=auto).
 */
export function previsaoDoHorario(
  resposta: RespostaOpenMeteo | null,
  diasAPartirDeHoje: number,
  horario: Horario,
): PrevisaoDoHorario | null {
  const temperaturas = resposta?.hourly?.temperature_2m;
  if (!temperaturas) return null;
  const inicio = diasAPartirDeHoje * 24 + horario.inicio;
  const fim = diasAPartirDeHoje * 24 + horario.fim;
  const graus = temperaturas.slice(inicio, fim).filter((t): t is number => typeof t === 'number');
  if (!graus.length) return null;
  const chances = (resposta?.hourly?.precipitation_probability ?? [])
    .slice(inicio, fim)
    .filter((c): c is number => typeof c === 'number');
  return {
    nome: horario.nome,
    minima: Math.min(...graus),
    maxima: Math.max(...graus),
    chanceDeChuva: chances.length ? Math.max(...chances) : null,
  };
}

export type RespostaOpenMeteo = {
  daily?: {
    temperature_2m_min?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
  hourly?: {
    temperature_2m?: (number | null)[];
    precipitation_probability?: (number | null)[];
  };
};

@Injectable()
export class ClimaService {
  private readonly cache = new Map<string, { expiraEm: number; resposta: RespostaOpenMeteo }>();

  /**
   * Previsão do dia pedido. null se o dia passa do alcance da previsão ou se a
   * consulta falhar: o chat segue sem clima, como antes.
   */
  async previsao(
    local: Localizacao,
    diasAPartirDeHoje: number,
    horario?: Horario | null,
  ): Promise<Previsao | null> {
    if (diasAPartirDeHoje < 0 || diasAPartirDeHoje >= DIAS_DE_PREVISAO) return null;

    const resposta = await this.buscar(local);
    const diario = resposta?.daily;
    const minima = diario?.temperature_2m_min?.[diasAPartirDeHoje];
    const maxima = diario?.temperature_2m_max?.[diasAPartirDeHoje];

    if (typeof minima !== 'number' || typeof maxima !== 'number') return null;

    return {
      diasAPartirDeHoje,
      minima,
      maxima,
      chanceDeChuva: diario?.precipitation_probability_max?.[diasAPartirDeHoje] ?? null,
      horario: horario ? previsaoDoHorario(resposta, diasAPartirDeHoje, horario) : null,
    };
  }

  private async buscar(local: Localizacao): Promise<RespostaOpenMeteo | null> {
    // ~1 km de precisão: basta para o clima e não guarda o endereço exato.
    const latitude = local.latitude.toFixed(2);
    const longitude = local.longitude.toFixed(2);
    const chave = `${latitude},${longitude}`;

    const emCache = this.cache.get(chave);
    if (emCache && emCache.expiraEm > Date.now()) return emCache.resposta;

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      '&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max' +
      '&hourly=temperature_2m,precipitation_probability' +
      `&timezone=auto&forecast_days=${DIAS_DE_PREVISAO}`;

    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
      if (!resposta.ok) throw new Error(`Open-Meteo respondeu ${resposta.status}`);

      const corpo = (await resposta.json()) as RespostaOpenMeteo;
      this.cache.set(chave, { expiraEm: Date.now() + VALIDADE_CACHE_MS, resposta: corpo });
      return corpo;
    } catch (error) {
      console.error('[Clima] Não foi possível consultar a previsão do tempo:', error);
      return null;
    }
  }
}

/**
 * A data de hoje no Brasil. O servidor pode estar em UTC: às 22h de Brasília
 * já seria amanhã, e "sábado" cairia no dia errado.
 */
export function hojeNoBrasil(agora = new Date()) {
  const [ano, mes, dia] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(agora)
    .split('-')
    .map(Number);
  return new Date(ano, mes - 1, dia);
}
