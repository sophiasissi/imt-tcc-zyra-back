import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Peca } from '@prisma/client';

import { FotosDaPeca, fotosDaPeca } from '../pecas/fotos-da-peca';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { SalvarLookDto } from './dto/salvar-look.dto';
import { TituloDoLookService } from './titulo-do-look';
import { ORDEM_DOS_PAPEIS, Papel, papeisNoLook } from './taxonomia';

export type PecaDoLookSalvo = Omit<Peca, 'imagemS3Key' | 'imagemMiniS3Key'> &
  FotosDaPeca & { papel: Papel };

export type LookSalvo = {
  id: string;
  nome: string | null;
  ocasiao: Peca['ocasioes'][number] | null;
  criadoEm: Date;
  salvoEm: Date;
  pecas: PecaDoLookSalvo[];
};

/** Resposta do POST /looks: diz se as mesmas peças já estavam salvas. */
export type LookSalvoAgora = LookSalvo & { jaEstavaSalvo: boolean };

type LookDoBanco = {
  id: string;
  nome: string | null;
  ocasiao: Peca['ocasioes'][number] | null;
  criadoEm: Date;
  salvoEm: Date;
  pecas: { ordem: number; peca: Peca }[];
};

const INCLUIR_PECAS = { pecas: { include: { peca: true } } } as const;

@Injectable()
export class LooksSalvosService {
  private readonly logger = new Logger(LooksSalvosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly titulos: TituloDoLookService,
  ) {}

  /**
   * Salva um look do chat. Se o usuário já salvou exatamente as mesmas peças,
   * não cria cópia (um toque duplo no botão daria duas): o look existente
   * volta para o topo da galeria, e a resposta diz que ele já estava salvo.
   */
  async salvar(cognitoSub: string, dto: SalvarLookDto): Promise<LookSalvoAgora> {
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
      // Sem isto, o look ficava na posição antiga: no evento de 24/10/2026,
      // com vários "Dia de trabalho" parecidos, parecia que não tinha salvo.
      const atualizado = await this.prisma.look.update({
        where: { id: existente.id },
        data: { salvoEm: new Date() },
        include: INCLUIR_PECAS,
      });
      this.logger.log(`Look ${existente.id} salvo de novo: as mesmas peças já estavam salvas.`);
      return { ...(await this.toResponse(atualizado)), jaEstavaSalvo: true };
    }

    const papeis = papeisNoLook(pecas);
    const ordenadas = [...pecas].sort(
      (a, b) =>
        ORDEM_DOS_PAPEIS.indexOf(papeis.get(a.id)!) - ORDEM_DOS_PAPEIS.indexOf(papeis.get(b.id)!),
    );

    // O título só é gerado aqui, para um look novo: salvar de novo não gasta.
    const pedido = dto.pedido?.trim();
    const nome = dto.nome || (pedido ? await this.titulos.gerar(pedido) : null);

    const look = await this.prisma.look.create({
      data: {
        usuarioId: usuario.id,
        nome,
        ocasiao: dto.ocasiao ?? null,
        pecas: { create: ordenadas.map((peca, ordem) => ({ pecaId: peca.id, ordem })) },
      },
      include: INCLUIR_PECAS,
    });

    this.logger.log(`Look ${look.id} salvo (${ordenadas.length} peças).`);
    return { ...(await this.toResponse(look)), jaEstavaSalvo: false };
  }

  /** Looks do usuário, do mais recente para o mais antigo. */
  async listar(cognitoSub: string): Promise<LookSalvo[]> {
    const usuario = await this.buscarUsuario(cognitoSub);

    const looks = await this.prisma.look.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { salvoEm: 'desc' },
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
    // Moletom por cima da camiseta volta como camada, e não como segunda peça
    // de cima: sem isso, o app não montava a colagem do look salvo.
    const papeis = papeisNoLook(look.pecas.map(({ peca }) => peca));
    const pecas = await Promise.all(
      [...look.pecas]
        .sort((a, b) => a.ordem - b.ordem)
        .map(async ({ peca }) => {
          const { imagemS3Key, imagemMiniS3Key, ...dados } = peca;
          return {
            ...dados,
            papel: papeis.get(peca.id)!,
            ...(await fotosDaPeca(this.s3, { imagemS3Key, imagemMiniS3Key })),
          };
        }),
    );

    return {
      id: look.id,
      nome: look.nome,
      ocasiao: look.ocasiao,
      criadoEm: look.criadoEm,
      salvoEm: look.salvoEm,
      pecas,
    };
  }
}
