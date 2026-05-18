import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type UpdateProfileBody = {
  dataNascimento?: string;
  genero?: 'MASCULINO' | 'FEMININO' | 'NAO_BINARIO' | 'PREFIRO_NAO_DIZER' | 'OUTRO';
  tipoDaltonismo?:
    | 'PROTANOMALIA'
    | 'PROTANOPIA'
    | 'DEUTERANOMALIA'
    | 'DEUTERANOPIA'
    | 'TRITANOMALIA'
    | 'TRITANOPIA'
    | 'ACROMATOPSIA'
    | 'NAO_SEI'
    | 'PREFIRO_NAO_DIZER';
  nivelDificuldadeLooks?: number;
};

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

  updateMe(cognitoSub: string, body: UpdateProfileBody) {
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
