import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { BadRequestException } from '@nestjs/common';

import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { S3Service } from '../../src/storage/s3.service';
import { UpdateProfileDto } from '../../src/users/dto/update-profile.dto';
import { UsersService } from '../../src/users/users.service';

type UsuarioFake = {
  id: string;
  cognitoSub: string;
  nome: string;
  email: string | null;
  tipoDaltonismo: string | null;
  consentimentoSaudeEm: Date | null;
};

/**
 * Banco falso com o que o UsersService usa. A transação desfaz as mudanças
 * se a função lançar erro, como o Postgres.
 */
function criarBanco(usuario: UsuarioFake | null, pecas: string[] = []) {
  const estado = { usuario, pecas: [...pecas], updates: [] as Record<string, unknown>[] };

  const tx = {
    usuario: {
      findUnique: async () => estado.usuario,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        estado.updates.push(data);
        return { ...estado.usuario, ...data };
      },
      delete: async () => {
        estado.usuario = null;
        estado.pecas = [];
      },
    },
    peca: {
      findMany: async () => estado.pecas.map((imagemS3Key) => ({ imagemS3Key })),
    },
  };

  const prisma = {
    ...tx,
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      const antes = { usuario: estado.usuario, pecas: [...estado.pecas] };
      try {
        return await fn(tx);
      } catch (erro) {
        estado.usuario = antes.usuario;
        estado.pecas = antes.pecas;
        throw erro;
      }
    },
  };

  return { prisma: prisma as unknown as PrismaService, estado };
}

function criarServico(
  banco: ReturnType<typeof criarBanco>,
  opcoes: { senhaCerta?: boolean; cognitoFalha?: boolean } = {},
) {
  const passos: string[] = [];
  const fotosApagadas: string[] = [];

  const auth = {
    confirmarSenha: async () => {
      passos.push('confirmarSenha');
      if (opcoes.senhaCerta === false) throw new BadRequestException('A senha está incorreta.');
    },
    excluirContaNoCognito: async () => {
      passos.push('cognito');
      if (opcoes.cognitoFalha) throw new BadRequestException('Cognito fora do ar');
    },
  };
  const s3 = {
    deleteQuietly: async (key: string) => {
      fotosApagadas.push(key);
    },
  };

  const servico = new UsersService(
    banco.prisma,
    auth as unknown as AuthService,
    s3 as unknown as S3Service,
  );

  return { servico, passos, fotosApagadas };
}

function usuario(extra: Partial<UsuarioFake> = {}): UsuarioFake {
  return {
    id: 'u1',
    cognitoSub: 'sub',
    nome: 'Sophia',
    email: 'sophia@email.com',
    tipoDaltonismo: null,
    consentimentoSaudeEm: null,
    ...extra,
  };
}

describe('UsersService.updateMe: consentimento do dado de saúde', () => {
  async function salvar(atual: UsuarioFake, body: UpdateProfileDto) {
    const banco = criarBanco(atual);
    await criarServico(banco).servico.updateMe('sub', body);
    return banco.estado.updates[0].consentimentoSaudeEm;
  }

  it('tipo de saúde sem consentimento salvo e sem autorização: recusa', async () => {
    const banco = criarBanco(usuario());

    await assert.rejects(
      criarServico(banco).servico.updateMe('sub', {
        tipoDaltonismo: 'DEUTERANOPIA',
      } as UpdateProfileDto),
      (erro) => {
        assert.ok(erro instanceof BadRequestException);
        assert.match(erro.message, /autorizar o uso desse dado/);
        return true;
      },
    );
    assert.equal(banco.estado.updates.length, 0);
  });

  it('"Não tenho" também é dado de saúde e pede autorização', async () => {
    const banco = criarBanco(usuario());

    await assert.rejects(
      criarServico(banco).servico.updateMe('sub', {
        tipoDaltonismo: 'NAO_TENHO',
      } as UpdateProfileDto),
      BadRequestException,
    );
  });

  it('com autorização: grava a data', async () => {
    const data = await salvar(usuario(), {
      tipoDaltonismo: 'PROTANOPIA',
      consentimentoDadosSaude: true,
    } as UpdateProfileDto);

    assert.ok(data instanceof Date);
  });

  it('já autorizado antes: mantém a data original', async () => {
    const data = await salvar(usuario({ consentimentoSaudeEm: new Date('2026-01-01') }), {
      tipoDaltonismo: 'NAO_SEI',
    } as UpdateProfileDto);

    assert.equal(data, undefined);
  });

  it('"Prefiro não dizer" e null revogam: apagam a autorização', async () => {
    const ja = usuario({ consentimentoSaudeEm: new Date('2026-01-01') });

    assert.equal(
      await salvar(ja, { tipoDaltonismo: 'PREFIRO_NAO_DIZER' } as UpdateProfileDto),
      null,
    );
    assert.equal(await salvar(ja, { tipoDaltonismo: null } as UpdateProfileDto), null);
  });

  it('sem tipo no corpo (ex.: só gênero): não mexe na autorização', async () => {
    const data = await salvar(usuario(), { genero: 'FEMININO' } as UpdateProfileDto);

    assert.equal(data, undefined);
  });
});

describe('UsersService.deleteMe', () => {
  let banco: ReturnType<typeof criarBanco>;

  beforeEach(() => {
    banco = criarBanco(usuario(), ['usuarios/u1/roupas/a.jpg', 'usuarios/u1/roupas/b.jpg']);
  });

  it('senha certa: apaga banco, conta no Cognito e as fotos, nessa ordem', async () => {
    const { servico, passos, fotosApagadas } = criarServico(banco);

    const r = await servico.deleteMe('sub', 'token', 'Senha123!');

    assert.equal(r.message, 'Sua conta foi excluída.');
    assert.equal(banco.estado.usuario, null);
    assert.deepEqual(passos, ['confirmarSenha', 'cognito']);
    assert.deepEqual(fotosApagadas, ['usuarios/u1/roupas/a.jpg', 'usuarios/u1/roupas/b.jpg']);
  });

  it('senha errada: nada é apagado', async () => {
    const { servico, passos, fotosApagadas } = criarServico(banco, { senhaCerta: false });

    await assert.rejects(servico.deleteMe('sub', 'token', 'errada'), BadRequestException);

    assert.ok(banco.estado.usuario);
    assert.deepEqual(passos, ['confirmarSenha']);
    assert.deepEqual(fotosApagadas, []);
  });

  it('Cognito falha: o banco volta atrás e as fotos ficam', async () => {
    const { servico, fotosApagadas } = criarServico(banco, { cognitoFalha: true });

    await assert.rejects(servico.deleteMe('sub', 'token', 'Senha123!'));

    assert.ok(banco.estado.usuario, 'o usuário deveria continuar no banco');
    assert.equal(banco.estado.pecas.length, 2);
    assert.deepEqual(fotosApagadas, []);
  });
});
