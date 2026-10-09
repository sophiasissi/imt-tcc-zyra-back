import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * Unica resposta de tipo de daltonismo que nao revela nada sobre a saude da
 * pessoa. Qualquer outra (inclusive NAO_TENHO) e' dado de saude, dado pessoal
 * sensivel na LGPD (art. 5o, II), e so' pode ser guardada com consentimento
 * especifico e destacado (art. 11, I).
 */
const SEM_DADO_DE_SAUDE = 'PREFIRO_NAO_DIZER';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly s3: S3Service,
  ) {}

  async getMe(cognitoSub: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { cognitoSub },
    });

    if (!usuario) {
      throw new NotFoundException(
        'Não encontramos um cadastro no ZYRA para este usuário. Faça seu cadastro para continuar.',
      );
    }

    return usuario;
  }

  async updateMe(cognitoSub: string, body: UpdateProfileDto) {
    const consentimento = await this.consentimentoParaSalvar(cognitoSub, body);

    try {
      return await this.prisma.usuario.update({
        where: { cognitoSub },
        data: {
          dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : undefined,
          genero: body.genero,
          tipoDaltonismo: body.tipoDaltonismo,
          nivelDificuldadeLooks: body.nivelDificuldadeLooks,
          consentimentoSaudeEm: consentimento,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(
          'Não encontramos seu perfil para salvar essas informações. Faça login novamente e tente de novo.',
        );
      }

      throw error;
    }
  }

  /**
   * O que gravar em `consentimentoSaudeEm` (undefined = nao mexer):
   *  - tipo de daltonismo que e' dado de saude, sem consentimento ja' salvo:
   *    exige `consentimentoDadosSaude: true` e grava a data (a LGPD poe no
   *    controlador o onus de provar o consentimento, art. 8o, par. 2o);
   *  - PREFIRO_NAO_DIZER ou null: o dado de saude sai, e o consentimento
   *    tambem (revogacao, art. 8o, par. 5o).
   */
  private async consentimentoParaSalvar(
    cognitoSub: string,
    body: UpdateProfileDto,
  ): Promise<Date | null | undefined> {
    const tipo = body.tipoDaltonismo;

    if (tipo === undefined) {
      return undefined;
    }

    if (tipo === null || tipo === SEM_DADO_DE_SAUDE) {
      return null;
    }

    const atual = await this.prisma.usuario.findUnique({
      where: { cognitoSub },
      select: { consentimentoSaudeEm: true },
    });

    // Ja' autorizou antes: mantem a data original.
    if (atual?.consentimentoSaudeEm) {
      return undefined;
    }

    if (body.consentimentoDadosSaude === true) {
      return new Date();
    }

    throw new BadRequestException(
      'Para salvar o tipo de daltonismo, é preciso autorizar o uso desse dado.',
    );
  }

  /**
   * Exclui a conta: confere a senha, apaga o perfil (pecas e looks saem junto,
   * por cascata) e a conta no Cognito, e depois as fotos no S3.
   *
   * Banco e Cognito ficam na mesma transacao, com o Cognito por ultimo: se ele
   * falhar, o banco volta atras e nada se perde; a pessoa pode tentar de novo.
   * As fotos saem depois do commit, sem derrubar a exclusao: uma foto orfa no
   * bucket privado e' melhor que uma conta pela metade (fica no log).
   */
  async deleteMe(cognitoSub: string, accessToken: string, senha: string) {
    const usuario = await this.getMe(cognitoSub);

    if (!usuario.email) {
      throw new BadRequestException(
        'Não foi possível confirmar sua identidade. Entre novamente e tente de novo.',
      );
    }

    await this.authService.confirmarSenha(usuario.email, senha);

    const fotos = await this.prisma.$transaction(
      async (tx) => {
        const pecas = await tx.peca.findMany({
          where: { usuarioId: usuario.id },
          select: { imagemS3Key: true },
        });

        await tx.usuario.delete({ where: { id: usuario.id } });
        await this.authService.excluirContaNoCognito(accessToken);

        return pecas.map((peca) => peca.imagemS3Key);
      },
      // O Cognito responde em menos de um segundo; a folga e' para rede lenta.
      { timeout: 15_000 },
    );

    await Promise.all(fotos.map((key) => this.s3.deleteQuietly(key)));

    this.logger.log(`Conta ${usuario.id} excluída (${fotos.length} fotos removidas do S3).`);

    return { message: 'Sua conta foi excluída.' };
  }
}
