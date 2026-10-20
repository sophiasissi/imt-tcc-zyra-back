import { Injectable, NotFoundException } from '@nestjs/common';
import { Peca } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { coresDaPeca } from './cor-da-peca';
import { chaveDaMiniatura, fotosDaPeca, gerarMiniatura } from './fotos-da-peca';
import { CreatePecaDto } from './dto/create-peca.dto';
import { UpdatePecaDto } from './dto/update-peca.dto';
import { CorDaPeca, VisionService } from './vision.service';

// Quantos looks salvos usam a peca: o app avisa antes de apagar.
const CONTAR_LOOKS = { _count: { select: { looks: true } } } as const;

type PecaComLooks = Peca & { _count?: { looks: number } };

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

    // A cor e obrigatoria. A leitura por pixels normalmente vem do app; se nao
    // veio, e gratuita e acontece antes do upload, entao uma falha aqui nao
    // deixa nada para limpar. A analise abaixo corrige o nome e o simbolo.
    const corLida = await this.resolverCor(foto, dto);

    const extensao = EXTENSOES[foto.mimetype] ?? 'jpg';
    const imagemS3Key = `usuarios/${usuario.id}/roupas/${randomUUID()}.${extensao}`;

    await this.s3.upload(imagemS3Key, foto.buffer, foto.mimetype);

    // A miniatura não pode impedir o cadastro: se falhar, o app mostra a foto
    // inteira no card.
    const imagemMiniS3Key = await this.enviarMiniatura(imagemS3Key, foto.buffer);

    let peca: Peca;

    try {
      const analise = await this.vision.analisarRoupa(foto.buffer, foto.mimetype);

      peca = await this.prisma.peca.create({
        data: {
          usuarioId: usuario.id,
          imagemS3Key,
          imagemMiniS3Key,
          categoria: analise.category,
          manga: analise.sleeve,
          estilo: analise.style,
          estampa: analise.pattern,
          ocasioes: analise.occasions,
          aquecimento: analise.warmth,
          material: analise.material,
          ...coresDaPeca(corLida, analise),
        },
      });
    } catch (error) {
      await this.s3.deleteQuietly(imagemS3Key);
      if (imagemMiniS3Key) await this.s3.deleteQuietly(imagemMiniS3Key);
      throw error;
    }

    return this.toResponse(peca);
  }

  private async enviarMiniatura(imagemS3Key: string, foto: Buffer) {
    const chave = chaveDaMiniatura(imagemS3Key);

    try {
      await this.s3.upload(chave, await gerarMiniatura(foto), 'image/webp');
      return chave;
    } catch (error) {
      console.error('[Peças] Não foi possível gerar a miniatura:', error);
      return null;
    }
  }

  async findAll(cognitoSub: string) {
    const usuario = await this.findUsuario(cognitoSub);

    const pecas = await this.prisma.peca.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { criadoEm: 'desc' },
      include: CONTAR_LOOKS,
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
      include: CONTAR_LOOKS,
    });

    return this.toResponse(atualizada);
  }

  /**
   * Apaga a peca e os looks salvos que a usam (o app avisa antes). Um look sem
   * uma das pecas nao faz mais sentido, entao ele sai junto, na mesma transacao.
   */
  async remove(cognitoSub: string, id: string) {
    const peca = await this.findPecaDoUsuario(cognitoSub, id);

    const [looks] = await this.prisma.$transaction([
      this.prisma.look.deleteMany({
        where: { usuarioId: peca.usuarioId, pecas: { some: { pecaId: peca.id } } },
      }),
      this.prisma.peca.delete({ where: { id: peca.id } }),
    ]);
    await this.s3.deleteQuietly(peca.imagemS3Key);
    if (peca.imagemMiniS3Key) await this.s3.deleteQuietly(peca.imagemMiniS3Key);

    return { message: 'Peça removida do seu closet.', looksRemovidos: looks.count };
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
      include: CONTAR_LOOKS,
    });

    if (!peca) {
      throw new NotFoundException('Peça não encontrada no seu closet.');
    }

    return peca;
  }

  private async toResponse(peca: PecaComLooks) {
    const { imagemS3Key, imagemMiniS3Key, _count, ...dados } = peca;

    return {
      ...dados,
      ...(await fotosDaPeca(this.s3, { imagemS3Key, imagemMiniS3Key })),
      // Peca recem-cadastrada ainda nao esta em nenhum look.
      totalLooks: _count?.looks ?? 0,
    };
  }
}
