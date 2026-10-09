import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

/**
 * Avisos por e-mail, pelo Amazon SES.
 *
 * Nunca derruba quem chamou: o aviso e' um extra de seguranca, e a senha ja'
 * foi trocada quando ele sai. Sem SES_REMETENTE no .env, so' registra no log
 * (o resto do back funciona igual).
 *
 * Com o SES em modo sandbox (o padrao de conta nova), o e-mail so' chega a
 * enderecos verificados no SES. Para mandar a qualquer pessoa, e' preciso
 * pedir o acesso de producao no console da AWS.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: SESv2Client;
  private readonly remetente?: string;

  constructor(configService: ConfigService) {
    this.client = new SESv2Client({ region: configService.getOrThrow<string>('AWS_REGION') });
    this.remetente = configService.get<string>('SES_REMETENTE') || undefined;
  }

  /**
   * Avisa que a senha mudou (OWASP ASVS 2.2.3): se nao foi a pessoa, ela
   * descobre e recupera a conta pelo "Esqueci minha senha".
   */
  async avisarSenhaAlterada(destinatario: string, nome?: string | null) {
    const quando = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

    const saudacao = nome ? `Olá, ${nome.split(' ')[0]}!` : 'Olá!';

    const texto = [
      saudacao,
      '',
      `A senha da sua conta no ZYRA foi alterada em ${quando} (horário de Brasília).`,
      '',
      'Se foi você, não precisa fazer nada.',
      '',
      'Se não foi você, abra o ZYRA, toque em "Esqueci minha senha" na tela de entrada e crie uma nova senha.',
      '',
      'Equipe ZYRA',
    ].join('\n');

    const paragrafo = 'font-size:16px;margin:0 0 16px;';
    const html = [
      '<!doctype html>',
      '<html lang="pt-BR">',
      '<body style="margin:0;padding:24px;background:#FAF9F6;font-family:Arial,Helvetica,sans-serif;color:#2C2C2C;">',
      `<p style="${paragrafo}">${escapar(saudacao)}</p>`,
      `<p style="${paragrafo}">A senha da sua conta no <strong>ZYRA</strong> foi alterada em <strong>${escapar(quando)}</strong> (horário de Brasília).</p>`,
      `<p style="${paragrafo}">Se foi você, não precisa fazer nada.</p>`,
      `<p style="${paragrafo}"><strong>Se não foi você</strong>, abra o ZYRA, toque em <strong>Esqueci minha senha</strong> na tela de entrada e crie uma nova senha.</p>`,
      `<p style="${paragrafo}">Equipe ZYRA</p>`,
      '</body>',
      '</html>',
    ].join('\n');

    await this.enviar(destinatario, 'Sua senha do ZYRA foi alterada', texto, html);
  }

  private async enviar(destinatario: string, assunto: string, texto: string, html: string) {
    if (!this.remetente) {
      this.logger.warn(
        `SES_REMETENTE não configurado: aviso "${assunto}" não enviado para ${destinatario}.`,
      );
      return;
    }

    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.remetente,
          Destination: { ToAddresses: [destinatario] },
          Content: {
            Simple: {
              Subject: { Data: assunto, Charset: 'UTF-8' },
              Body: {
                Text: { Data: texto, Charset: 'UTF-8' },
                Html: { Data: html, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
    } catch (error) {
      this.logger.error(`Falha ao enviar "${assunto}" para ${destinatario}`, error);
    }
  }
}

function escapar(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
