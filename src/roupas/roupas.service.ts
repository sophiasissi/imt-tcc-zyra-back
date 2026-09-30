import { Injectable, NotFoundException } from '@nestjs/common';
import { Roupa } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreateRoupaDto } from './dto/create-roupa.dto';
import { UpdateRoupaDto } from './dto/update-roupa.dto';
import { VisionService } from './vision.service';

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class RoupasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly vision: VisionService,
  ) {}

  /**
   * Cadastro da peca, na ordem combinada:
   *   1. upload da foto para o S3;
   *   2. analise pela OpenAI (a unica etapa paga);
   *   3. gravacao no banco.
   *
   * O upload vem antes da analise para que uma falha de infraestrutura (S3
   * fora do ar, permissao faltando) nao desperdice uma chamada paga. Cada
   * etapa so roda se a anterior deu certo; se a 2 ou a 3 falhar, a foto ja
   * enviada e apagada para nao sobrar arquivo orfao no bucket.
   */
  async create(cognitoSub: string, foto: Express.Multer.File, dto: CreateRoupaDto) {
    const usuario = await this.findUsuario(cognitoSub);

    const extensao = EXTENSOES[foto.mimetype] ?? 'jpg';
    const imagemS3Key = `usuarios/${usuario.id}/roupas/${randomUUID()}.${extensao}`;

    await this.s3.upload(imagemS3Key, foto.buffer, foto.mimetype);

    let roupa: Roupa;

    try {
      const analise = await this.vision.analisarRoupa(foto.buffer, foto.mimetype);

      roupa = await this.prisma.roupa.create({
        data: {
          usuarioId: usuario.id,
          imagemS3Key,
          corNome: dto.corNome,
          corHex: dto.corHex,
          corColorAdd: dto.corColorAdd,
          categoria: analise.category,
          estilo: analise.style,
          estampa: analise.pattern,
          aquecimento: analise.warmth,
          material: analise.material,
          ocasioes: analise.occasions,
        },
      });
    } catch (error) {
      await this.s3.deleteQuietly(imagemS3Key);
      throw error;
    }

    return this.toResponse(roupa);
  }

  async findAll(cognitoSub: string) {
    const usuario = await this.findUsuario(cognitoSub);

    const roupas = await this.prisma.roupa.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { criadoEm: 'desc' },
    });

    return Promise.all(roupas.map((roupa) => this.toResponse(roupa)));
  }

  async findOne(cognitoSub: string, id: string) {
    return this.toResponse(await this.findRoupaDoUsuario(cognitoSub, id));
  }

  async update(cognitoSub: string, id: string, dto: UpdateRoupaDto) {
    const roupa = await this.findRoupaDoUsuario(cognitoSub, id);

    const atualizada = await this.prisma.roupa.update({
      where: { id: roupa.id },
      data: dto,
    });

    return this.toResponse(atualizada);
  }

  async remove(cognitoSub: string, id: string) {
    const roupa = await this.findRoupaDoUsuario(cognitoSub, id);

    await this.prisma.roupa.delete({ where: { id: roupa.id } });
    await this.s3.deleteQuietly(roupa.imagemS3Key);

    return { message: 'Peça removida do seu closet.' };
  }

  private async findUsuario(cognitoSub: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { cognitoSub } });

    if (!usuario) {
      throw new NotFoundException(
        'Não encontramos um cadastro no ZYRA para este usuário. Faça seu cadastro para continuar.',
      );
    }

    return usuario;
  }

  /**
   * Busca a peca garantindo que ela pertence a quem pediu. Peca de outro
   * usuario responde 404, igual a inexistente, para nao revelar que o id existe.
   */
  private async findRoupaDoUsuario(cognitoSub: string, id: string) {
    const usuario = await this.findUsuario(cognitoSub);

    const roupa = await this.prisma.roupa.findFirst({
      where: { id, usuarioId: usuario.id },
    });

    if (!roupa) {
      throw new NotFoundException('Peça não encontrada no seu closet.');
    }

    return roupa;
  }

  private async toResponse(roupa: Roupa) {
    const { imagemS3Key, ...dados } = roupa;

    return {
      ...dados,
      imagemUrl: await this.s3.getReadUrl(imagemS3Key),
    };
  }
}
