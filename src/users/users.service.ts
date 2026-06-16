import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    try {
      return await this.prisma.usuario.update({
        where: { cognitoSub },
        data: {
          dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : undefined,
          genero: body.genero,
          tipoDaltonismo: body.tipoDaltonismo,
          nivelDificuldadeLooks: body.nivelDificuldadeLooks,
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
}
