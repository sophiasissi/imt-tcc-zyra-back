import { Injectable } from '@nestjs/common';
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
      return {
        message: 'Perfil não encontrado. Finalize o cadastro primeiro.',
      };
    }

    return usuario;
  }

  updateMe(cognitoSub: string, body: UpdateProfileDto) {
    return this.prisma.usuario.update({
      where: { cognitoSub },
      data: {
        dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : undefined,
        genero: body.genero,
        tipoDaltonismo: body.tipoDaltonismo,
        nivelDificuldadeLooks: body.nivelDificuldadeLooks,
      },
    });
  }
}
