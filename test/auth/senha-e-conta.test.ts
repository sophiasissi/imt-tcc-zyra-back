import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoIdentityProviderServiceException } from '@aws-sdk/client-cognito-identity-provider';

import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { EmailService } from '../../src/email/email.service';
import { PrismaService } from '../../src/prisma/prisma.service';

function erroCognito(name: string) {
  return new CognitoIdentityProviderServiceException({
    name,
    $fault: 'client',
    $metadata: {},
    message: name,
  });
}

type Comando = { constructor: { name: string }; input: Record<string, unknown> };

/** AuthService com um Cognito falso que responde conforme o roteiro. */
function criarServico(roteiro: Record<string, (comando: Comando) => unknown>) {
  const config = { getOrThrow: (chave: string) => `valor-de-${chave}` } as unknown as ConfigService;
  const servico = new AuthService(config);
  const chamadas: Comando[] = [];

  (servico as unknown as { cognitoClient: { send: unknown } }).cognitoClient = {
    send: async (comando: Comando) => {
      chamadas.push(comando);
      const resposta = roteiro[comando.constructor.name];
      if (!resposta) throw new Error(`comando inesperado: ${comando.constructor.name}`);
      return resposta(comando);
    },
  };

  return { servico, chamadas };
}

describe('AuthService.alterarSenha', () => {
  it('envia o token, a senha atual e a nova ao Cognito', async () => {
    const { servico, chamadas } = criarServico({ ChangePasswordCommand: () => ({}) });

    const r = await servico.alterarSenha('token', 'Atual123!', 'Nova123!');

    assert.equal(r.message, 'Senha alterada com sucesso.');
    assert.equal(chamadas[0].constructor.name, 'ChangePasswordCommand');
    assert.deepEqual(chamadas[0].input, {
      AccessToken: 'token',
      PreviousPassword: 'Atual123!',
      ProposedPassword: 'Nova123!',
    });
  });

  it('senha atual errada vira 400 (e não 401, que o app trataria como sessão vencida)', async () => {
    const { servico } = criarServico({
      ChangePasswordCommand: () => {
        throw erroCognito('NotAuthorizedException');
      },
    });

    await assert.rejects(servico.alterarSenha('token', 'Errada1!', 'Nova123!'), (erro) => {
      assert.ok(erro instanceof BadRequestException);
      assert.equal(erro.message, 'A senha atual está incorreta.');
      return true;
    });
  });

  it('senha nova fraca e excesso de tentativas usam as mensagens do app', async () => {
    const fraca = criarServico({
      ChangePasswordCommand: () => {
        throw erroCognito('InvalidPasswordException');
      },
    });
    await assert.rejects(fraca.servico.alterarSenha('t', 'A', 'B'), BadRequestException);

    const limite = criarServico({
      ChangePasswordCommand: () => {
        throw erroCognito('LimitExceededException');
      },
    });
    await assert.rejects(limite.servico.alterarSenha('t', 'A', 'B'), (erro) => {
      assert.ok(erro instanceof HttpException);
      assert.equal(erro.getStatus(), 429);
      return true;
    });
  });
});

describe('AuthService.confirmarSenha e excluirContaNoCognito', () => {
  it('senha certa: autentica com o e-mail normalizado', async () => {
    const { servico, chamadas } = criarServico({ InitiateAuthCommand: () => ({}) });

    await servico.confirmarSenha(' Pessoa@Email.com ', 'Senha123!');

    assert.deepEqual((chamadas[0].input as { AuthParameters: unknown }).AuthParameters, {
      USERNAME: 'pessoa@email.com',
      PASSWORD: 'Senha123!',
    });
  });

  it('senha errada vira 400 com mensagem em português', async () => {
    const { servico } = criarServico({
      InitiateAuthCommand: () => {
        throw erroCognito('NotAuthorizedException');
      },
    });

    await assert.rejects(servico.confirmarSenha('p@e.com', 'x'), (erro) => {
      assert.ok(erro instanceof BadRequestException);
      assert.equal(erro.message, 'A senha está incorreta.');
      return true;
    });
  });

  it('apaga a conta com o próprio token (DeleteUser)', async () => {
    const { servico, chamadas } = criarServico({ DeleteUserCommand: () => ({}) });

    await servico.excluirContaNoCognito('token');

    assert.equal(chamadas[0].constructor.name, 'DeleteUserCommand');
    assert.deepEqual(chamadas[0].input, { AccessToken: 'token' });
  });
});

describe('AuthController: aviso por e-mail da troca de senha', () => {
  function criarController(alterarSenha: () => Promise<unknown>) {
    const avisos: { email: string; nome?: string | null }[] = [];
    const auth = { alterarSenha, confirmForgotPassword: async () => ({ message: 'ok' }) };
    const email = {
      avisarSenhaAlterada: async (destino: string, nome?: string | null) => {
        avisos.push({ email: destino, nome });
      },
    };
    const prisma = {
      usuario: {
        findUnique: async () => ({ nome: 'Sophia Guedes', email: 'sophia@email.com' }),
      },
    };

    const controller = new AuthController(
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
      email as unknown as EmailService,
    );

    return { controller, avisos };
  }

  const req = { user: { cognitoSub: 'sub', accessToken: 'token' } };

  it('troca bem-sucedida: avisa o e-mail da conta', async () => {
    const { controller, avisos } = criarController(async () => ({ message: 'ok' }));

    await controller.alterarSenha(req, { senhaAtual: 'A', novaSenha: 'B' });

    assert.deepEqual(avisos, [{ email: 'sophia@email.com', nome: 'Sophia Guedes' }]);
  });

  it('troca recusada: não avisa ninguém', async () => {
    const { controller, avisos } = criarController(async () => {
      throw new BadRequestException('A senha atual está incorreta.');
    });

    await assert.rejects(controller.alterarSenha(req, { senhaAtual: 'A', novaSenha: 'B' }));
    assert.deepEqual(avisos, []);
  });

  it('esqueci minha senha: avisa o e-mail normalizado', async () => {
    const { controller, avisos } = criarController(async () => ({}));

    await controller.confirmForgotPassword({
      email: ' Sophia@Email.com ',
      confirmationCode: '123456',
      newPassword: 'Nova123!',
    });

    assert.equal(avisos[0].email, 'sophia@email.com');
  });
});
