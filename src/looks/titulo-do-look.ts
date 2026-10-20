import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Título curto do look salvo ("Casamento à noite"), a partir do pedido da
 * pessoa no chat.
 *
 * É uma chamada à parte, só na hora de salvar: não passa pelo interpretador
 * do chat (mexer no prompt dele já derrubou o acerto dos outros campos) e não
 * gasta nada nas mensagens em que ninguém salva.
 */

export const TITULO_MAX = 60;
const MAX_TOKENS_RESPOSTA = 20;
const MODELO_TITULO = process.env.OPENAI_MODELO_TITULO ?? 'gpt-4.1-mini';

const PROMPT_TITULO = `
Você dá nome a looks salvos num app de roupas. Recebe as últimas mensagens que
a pessoa escreveu no chat, uma por linha, da mais antiga para a mais recente, e
responde só um título curto em português: de 2 a 4 palavras, com a primeira
letra maiúscula, sem aspas e sem ponto final. Diga o evento ou a situação, não
as roupas. Se a última mensagem só ajusta o look ("troca a calça", "sim"),
use o evento de uma mensagem anterior. Exemplos:
- "look pro casamento da minha prima, vai ser à noite" -> Casamento à noite
- "reunião importante amanhã no trabalho" -> Reunião de trabalho
- "monta um look qualquer" -> Look do dia a dia
- "festa de aniversário hoje" / "troca o tênis" -> Festa de aniversário
`.trim();

/** O pedido do jeito que veio, cortado no limite: o título quando a IA não responde. */
export function tituloDoPedido(pedido: string) {
  const limpo = pedido.replace(/\s+/g, ' ').trim();
  const cortado =
    limpo.length > TITULO_MAX ? `${limpo.slice(0, TITULO_MAX - 1).trimEnd()}…` : limpo;
  return cortado.charAt(0).toUpperCase() + cortado.slice(1);
}

/** Tira aspas e ponto final que a IA às vezes devolve. null se não sobrar um título. */
export function limparTitulo(resposta: string | null | undefined) {
  // Aspas, pontos e espaços nas pontas, em qualquer ordem ("Casamento".).
  const titulo = (resposta ?? '').replace(/^["'“”«»\s]+|["'“”«».\s]+$/g, '');
  if (!titulo || titulo.length > TITULO_MAX) return null;

  // Português usa maiúscula só no começo: "Casamento à Noite" vira
  // "Casamento à noite". Siglas ("TCC") ficam como estão.
  const palavras = titulo.split(' ').map((palavra, i) => {
    if (i === 0) return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    const sigla = palavra.length > 1 && palavra === palavra.toUpperCase();
    return sigla ? palavra : palavra.toLowerCase();
  });
  return palavras.join(' ');
}

@Injectable()
export class TituloDoLookService {
  private openai: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Nunca falha: sem chave ou com erro da OpenAI, o título é o próprio pedido. */
  async gerar(pedido: string): Promise<string> {
    try {
      const resposta = await this.cliente()?.chat.completions.create({
        model: MODELO_TITULO,
        temperature: 0,
        max_completion_tokens: MAX_TOKENS_RESPOSTA,
        messages: [
          { role: 'system', content: PROMPT_TITULO },
          { role: 'user', content: pedido.slice(0, 500) },
        ],
      });
      return limparTitulo(resposta?.choices[0]?.message.content) ?? tituloDoPedido(pedido);
    } catch (error) {
      console.error('[Looks] Não foi possível gerar o título do look:', error);
      return tituloDoPedido(pedido);
    }
  }

  private cliente() {
    if (!this.openai) {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) return null;
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }
}
