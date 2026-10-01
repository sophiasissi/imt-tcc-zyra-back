import { Injectable, NotFoundException } from '@nestjs/common';
import { Peca } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { CreatePecaDto } from './dto/create-peca.dto';
import { UpdatePecaDto } from './dto/update-peca.dto';
import { CorDaPeca, VisionService } from './vision.service';

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class PecasService {
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
  async create(cognitoSub: string, foto: Express.Multer.File, dto: CreatePecaDto) {
    const usuario = await this.findUsuario(cognitoSub);

    // A cor e obrigatoria. Normalmente vem do app; se nao veio, a leitura e
    // gratuita e acontece antes do upload, entao uma falha aqui nao deixa nada
    // para limpar.
    const cor = await this.resolverCor(foto, dto);

    const extensao = EXTENSOES[foto.mimetype] ?? 'jpg';
    const imagemS3Key = `usuarios/${usuario.id}/roupas/${randomUUID()}.${extensao}`;

    await this.s3.upload(imagemS3Key, foto.buffer, foto.mimetype);

    let peca: Peca;

    try {
      const analise = await this.vision.analisarRoupa(foto.buffer, foto.mimetype);

      peca = await this.prisma.peca.create({
        data: {
          usuarioId: usuario.id,
          imagemS3Key,
          categoria: analise.category,
          estilo: analise.style,
          estampa: analise.pattern,
          ocasioes: analise.occasions,
          aquecimento: analise.warmth,
          material: analise.material,
          ...cor,
        },
      });
    } catch (error) {
      await this.s3.deleteQuietly(imagemS3Key);
      throw error;
    }

    return this.toResponse(peca);
  }

  async findAll(cognitoSub: string) {
    const usuario = await this.findUsuario(cognitoSub);

    const pecas = await this.prisma.peca.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { criadoEm: 'desc' },
    });

    return Promise.all(pecas.map((peca) => this.toResponse(peca)));
  }

  async findOne(cognitoSub: string, id: string) {
    return this.toResponse(await this.findPecaDoUsuario(cognitoSub, id));
  }

  async update(cognitoSub: string, id: string, dto: UpdatePecaDto) {
    const peca = await this.findPecaDoUsuario(cognitoSub, id);

    const atualizada = await this.prisma.peca.update({
      where: { id: peca.id },
      data: dto,
    });

    return this.toResponse(atualizada);
  }

  async remove(cognitoSub: string, id: string) {
    const peca = await this.findPecaDoUsuario(cognitoSub, id);

    await this.prisma.peca.delete({ where: { id: peca.id } });
    await this.s3.deleteQuietly(peca.imagemS3Key);

    return { message: 'Peça removida do seu closet.' };
  }

  private async resolverCor(foto: Express.Multer.File, dto: CreatePecaDto): Promise<CorDaPeca> {
    if (dto.corNome && dto.hex && dto.colorAddSymbol) {
      return { corNome: dto.corNome, hex: dto.hex, colorAddSymbol: dto.colorAddSymbol };
    }

    return this.vision.detectarCor(foto.buffer, foto.mimetype);
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
  private async findPecaDoUsuario(cognitoSub: string, id: string) {
    const usuario = await this.findUsuario(cognitoSub);

    const peca = await this.prisma.peca.findFirst({
      where: { id, usuarioId: usuario.id },
    });

    if (!peca) {
      throw new NotFoundException('Peça não encontrada no seu closet.');
    }

    return peca;
  }

  private async toResponse(peca: Peca) {
    const { imagemS3Key, ...dados } = peca;

    return {
      ...dados,
      imagemUrl: await this.s3.getReadUrl(imagemS3Key),
    };
  }
}
