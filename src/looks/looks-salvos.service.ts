import { Injectable, NotFoundException } from '@nestjs/common';
import { Peca } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { SalvarLookDto } from './dto/salvar-look.dto';
import { ORDEM_DOS_PAPEIS, PAPEL_DA_CATEGORIA, Papel } from './taxonomia';

export type PecaDoLookSalvo = Omit<Peca, 'imagemS3Key'> & { imagemUrl: string; papel: Papel };

export type LookSalvo = {
  id: string;
  nome: string | null;
  ocasiao: Peca['ocasioes'][number] | null;
  criadoEm: Date;
  pecas: PecaDoLookSalvo[];
};

type LookDoBanco = {
  id: string;
  nome: string | null;
  ocasiao: Peca['ocasioes'][number] | null;
  criadoEm: Date;
  pecas: { ordem: number; peca: Peca }[];
};

const INCLUIR_PECAS = { pecas: { include: { peca: true } } } as const;

@Injectable()
export class LooksSalvosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Salva um look do chat. Se o usuário já salvou exatamente as mesmas peças,
   * devolve o look existente: um toque duplo no botão não cria uma cópia.
   */
  async salvar(cognitoSub: string, dto: SalvarLookDto): Promise<LookSalvo> {
    const usuario = await this.buscarUsuario(cognitoSub);

    const pecas = await this.prisma.peca.findMany({
      where: { id: { in: dto.pecaIds }, usuarioId: usuario.id },
    });

    // O app só manda peças do armário; isto barra id de outra pessoa ou de
    // peça apagada enquanto o chat estava aberto.
    if (pecas.length !== dto.pecaIds.length) {
      throw new NotFoundException('Uma ou mais peças deste look não estão mais no seu armário.');
    }

    const mesmasPecas = (ids: string[]) =>
      ids.length === dto.pecaIds.length && ids.every((id) => dto.pecaIds.includes(id));

    const candidatos = await this.prisma.look.findMany({
      where: { usuarioId: usuario.id },
      include: INCLUIR_PECAS,
    });
    const existente = candidatos.find((look) => mesmasPecas(look.pecas.map((p) => p.pecaId)));

    if (existente) {
      return this.toResponse(existente);
    }

    const ordenadas = [...pecas].sort(
      (a, b) =>
        ORDEM_DOS_PAPEIS.indexOf(PAPEL_DA_CATEGORIA[a.categoria]) -
        ORDEM_DOS_PAPEIS.indexOf(PAPEL_DA_CATEGORIA[b.categoria]),
    );

    const look = await this.prisma.look.create({
      data: {
        usuarioId: usuario.id,
        nome: dto.nome || null,
        ocasiao: dto.ocasiao ?? null,
        pecas: { create: ordenadas.map((peca, ordem) => ({ pecaId: peca.id, ordem })) },
      },
      include: INCLUIR_PECAS,
    });

    return this.toResponse(look);
  }

  /** Looks do usuário, do mais recente para o mais antigo. */
  async listar(cognitoSub: string): Promise<LookSalvo[]> {
    const usuario = await this.buscarUsuario(cognitoSub);

    const looks = await this.prisma.look.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { criadoEm: 'desc' },
      include: INCLUIR_PECAS,
    });

    return Promise.all(looks.map((look) => this.toResponse(look)));
  }

  async remover(cognitoSub: string, id: string) {
    const usuario = await this.buscarUsuario(cognitoSub);

    // deleteMany com o usuário no filtro: o look de outra pessoa nunca é apagado
    // e responde igual a um look que não existe.
    const { count } = await this.prisma.look.deleteMany({ where: { id, usuarioId: usuario.id } });

    if (!count) {
      throw new NotFoundException('Não encontramos este look entre os seus looks salvos.');
    }

    return { message: 'Look removido.' };
  }

  private async buscarUsuario(cognitoSub: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { cognitoSub } });

    if (!usuario) {
      throw new NotFoundException(
        'Não encontramos um cadastro no ZYRA para este usuário. Faça seu cadastro para continuar.',
      );
    }

    return usuario;
  }

  private async toResponse(look: LookDoBanco): Promise<LookSalvo> {
    const pecas = await Promise.all(
      [...look.pecas]
        .sort((a, b) => a.ordem - b.ordem)
        .map(async ({ peca }) => {
          const { imagemS3Key, ...dados } = peca;
          return {
            ...dados,
            papel: PAPEL_DA_CATEGORIA[peca.categoria],
            imagemUrl: await this.s3.getReadUrl(imagemS3Key),
          };
        }),
    );

    return {
      id: look.id,
      nome: look.nome,
      ocasiao: look.ocasiao,
      criadoEm: look.criadoEm,
      pecas,
    };
  }
}
