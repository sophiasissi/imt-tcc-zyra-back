import { Injectable } from '@nestjs/common';

import { Aquecimento } from './taxonomia';

/**
 * Previsão do tempo para o chat não precisar perguntar se está frio ou calor.
 *
 * Fonte: Open-Meteo (https://open-meteo.com), gratuita e sem chave. A previsão
 * diária cobre 16 dias a partir de hoje, no fuso da própria localização.
 */

export type Localizacao = { latitude: number; longitude: number };

export type Previsao = {
  /** 0 = hoje, 1 = amanhã... */
  diasAPartirDeHoje: number;
  minima: number;
  maxima: number;
  chanceDeChuva: number | null;
};

export const DIAS_DE_PREVISAO = 16;

// Média do dia ((mínima + máxima) / 2) que separa calor, clima ameno e frio.
// Ex.: 30/20 °C (25) = calor; 26/16 °C (21) = ameno; 19/10 °C (14,5) = frio.
export const MEDIA_CALOR = 24;
export const MEDIA_FRIO = 16;
export const CHANCE_DE_CHUVA_AVISO = 60;

const TEMPO_LIMITE_MS = 3_000;
const VALIDADE_CACHE_MS = 30 * 60_000;

export function aquecimentoDaPrevisao(previsao: Previsao): Aquecimento {
  const media = (previsao.minima + previsao.maxima) / 2;
  if (media >= MEDIA_CALOR) return 'LEVE';
  if (media <= MEDIA_FRIO) return 'QUENTE';
  return 'MEDIO';
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
  if (media >= MEDIA_CALOR) return 'quente';
  if (media >= 20) return 'agradável';
  if (media > MEDIA_FRIO) return 'fresco';
  return 'frio';
}

/**
 * Frase curta que diz de onde veio o clima do look:
 * "Pela previsão, hoje vai ser um dia fresco (13 a 21 °C) e pode chover."
 */
export function descreverPrevisao(previsao: Previsao, hoje: Date) {
  const dia = nomeDoDia(previsao.diasAPartirDeHoje, hoje);
  const faixa = `${Math.round(previsao.minima)} a ${Math.round(previsao.maxima)} °C`;
  const chuva = (previsao.chanceDeChuva ?? 0) >= CHANCE_DE_CHUVA_AVISO ? ' e pode chover' : '';

  return `Pela previsão, ${dia} vai ser um dia ${sensacaoDoDia(previsao)} (${faixa})${chuva}.`;
}

type RespostaOpenMeteo = {
  daily?: {
    temperature_2m_min?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
  };
};

@Injectable()
export class ClimaService {
  private readonly cache = new Map<string, { expiraEm: number; resposta: RespostaOpenMeteo }>();

  /**
   * Previsão do dia pedido. null se o dia passa do alcance da previsão ou se a
   * consulta falhar: o chat segue sem clima, como antes.
   */
  async previsao(local: Localizacao, diasAPartirDeHoje: number): Promise<Previsao | null> {
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
