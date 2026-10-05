import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CognitoIdentityProviderServiceException } from '@aws-sdk/client-cognito-identity-provider';

import { AuthService } from '../../src/auth/auth.service';

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
  const chamadas: string[] = [];

  (servico as unknown as { cognitoClient: { send: unknown } }).cognitoClient = {
    send: async (comando: Comando) => {
      const nome = comando.constructor.name;
      chamadas.push(nome);
      const resposta = roteiro[nome];
      if (!resposta) throw new Error(`comando inesperado: ${nome}`);
      return resposta(comando);
    },
  };

  return { servico, chamadas };
}

describe('AuthService.signUp', () => {
  it('email novo: cadastra normalmente', async () => {
    const { servico, chamadas } = criarServico({ SignUpCommand: () => ({ UserSub: 'novo' }) });
    const removidos: string[] = [];

    const r = await servico.signUp('Pessoa@Email.com', 'Senha123!', async (sub) =>
      removidos.push(sub),
    );

    assert.equal(r.userSub, 'novo');
    assert.deepEqual(chamadas, ['SignUpCommand']);
    assert.deepEqual(removidos, []);
  });

  it('conta nunca confirmada: apaga, remove o perfil antigo e cadastra de novo', async () => {
    let tentativas = 0;
    const { servico, chamadas } = criarServico({
      SignUpCommand: () => {
        if (tentativas++ === 0) throw erroCognito('UsernameExistsException');
        return { UserSub: 'novo' };
      },
      AdminGetUserCommand: () => ({
        UserStatus: 'UNCONFIRMED',
        UserAttributes: [{ Name: 'sub', Value: 'antigo' }],
      }),
      AdminDeleteUserCommand: () => ({}),
    });
    const removidos: string[] = [];

    const r = await servico.signUp('pessoa@email.com', 'Senha123!', async (sub) =>
      removidos.push(sub),
    );

    assert.equal(r.userSub, 'novo');
    assert.deepEqual(removidos, ['antigo']);
    assert.deepEqual(chamadas, [
      'SignUpCommand',
      'AdminGetUserCommand',
      'AdminDeleteUserCommand',
      'SignUpCommand',
    ]);
  });

  it('conta confirmada: não apaga nada e avisa que o email já tem conta', async () => {
    const { servico, chamadas } = criarServico({
      SignUpCommand: () => {
        throw erroCognito('UsernameExistsException');
      },
      AdminGetUserCommand: () => ({
        UserStatus: 'CONFIRMED',
        UserAttributes: [{ Name: 'sub', Value: 'dono' }],
      }),
    });
    const removidos: string[] = [];

    await assert.rejects(
      servico.signUp('pessoa@email.com', 'Senha123!', async (sub) => removidos.push(sub)),
      (erro: unknown) =>
        erro instanceof ConflictException && /já possui uma conta/.test(erro.message),
    );
    assert.ok(!chamadas.includes('AdminDeleteUserCommand'));
    assert.deepEqual(removidos, []);
  });

  it('sem permissão para consultar a conta: mantém o comportamento atual', async () => {
    const { servico, chamadas } = criarServico({
      SignUpCommand: () => {
        throw erroCognito('UsernameExistsException');
      },
      AdminGetUserCommand: () => {
        throw erroCognito('AccessDeniedException');
      },
    });

    await assert.rejects(
      servico.signUp('pessoa@email.com', 'Senha123!'),
      (erro: unknown) =>
        erro instanceof ConflictException && /já possui uma conta/.test(erro.message),
    );
    assert.ok(!chamadas.includes('AdminDeleteUserCommand'));
  });
});
