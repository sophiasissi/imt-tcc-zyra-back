import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigService } from '@nestjs/config';
import { SendEmailCommandInput } from '@aws-sdk/client-sesv2';

import { EmailService } from '../../src/email/email.service';

type Comando = { constructor: { name: string }; input: SendEmailCommandInput };

function criarServico(remetente: string | undefined, send: (c: Comando) => unknown) {
  const config = {
    getOrThrow: () => 'us-east-2',
    get: () => remetente,
  } as unknown as ConfigService;

  const servico = new EmailService(config);
  const enviados: Comando[] = [];

  (servico as unknown as { client: { send: unknown } }).client = {
    send: async (comando: Comando) => {
      enviados.push(comando);
      return send(comando);
    },
  };

  return { servico, enviados };
}

describe('EmailService.avisarSenhaAlterada', () => {
  it('sem SES_REMETENTE: não chama o SES', async () => {
    const { servico, enviados } = criarServico(undefined, () => ({}));

    await servico.avisarSenhaAlterada('sophia@email.com', 'Sophia Guedes');

    assert.equal(enviados.length, 0);
  });

  it('com remetente: manda para o e-mail certo, com o primeiro nome e o horário', async () => {
    const { servico, enviados } = criarServico('ZYRA <zyra@email.com>', () => ({}));

    await servico.avisarSenhaAlterada('sophia@email.com', 'Sophia Guedes');

    const { input } = enviados[0];
    assert.equal(enviados[0].constructor.name, 'SendEmailCommand');
    assert.equal(input.FromEmailAddress, 'ZYRA <zyra@email.com>');
    assert.deepEqual(input.Destination?.ToAddresses, ['sophia@email.com']);
    assert.equal(input.Content?.Simple?.Subject?.Data, 'Sua senha do ZYRA foi alterada');

    const texto = input.Content?.Simple?.Body?.Text?.Data ?? '';
    assert.match(texto, /^Olá, Sophia!/);
    assert.match(texto, /horário de Brasília/);
    assert.match(texto, /Esqueci minha senha/);
  });

  it('nome com HTML não vira código no e-mail', async () => {
    const { servico, enviados } = criarServico('ZYRA <zyra@email.com>', () => ({}));

    await servico.avisarSenhaAlterada('x@email.com', '<b>Hacker</b>');

    const html = enviados[0].input.Content?.Simple?.Body?.Html?.Data ?? '';
    assert.ok(!html.includes('<b>Hacker'));
    assert.ok(html.includes('&lt;b&gt;Hacker'));
  });

  it('SES falha: não lança erro (a senha já foi trocada)', async () => {
    const { servico } = criarServico('ZYRA <zyra@email.com>', () => {
      throw new Error('MessageRejected');
    });

    await assert.doesNotReject(servico.avisarSenhaAlterada('x@email.com', null));
  });
});
