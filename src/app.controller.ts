import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CognitoAuthGuard } from './auth/cognito-auth.guard';
import { PrismaService } from './prisma/prisma.service';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
    email?: string;
  };
};

type RegisterProfileBody = {
  nome: string;
  email: string;
};

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

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getPublic() {
    return {
      message: 'rota pública funcionando',
    };
  }

  @UseGuards(CognitoAuthGuard)
  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    const cognitoSub = req.user.cognitoSub;

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

  @UseGuards(CognitoAuthGuard)
  @Patch('me')
  async updateMe(@Req() req: AuthenticatedRequest, @Body() body: UpdateProfileBody) {
    const cognitoSub = req.user.cognitoSub;

    const usuario = await this.prisma.usuario.update({
      where: { cognitoSub },
      data: {
        dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : undefined,
        genero: body.genero,
        tipoDaltonismo: body.tipoDaltonismo,
        nivelDificuldadeLooks: body.nivelDificuldadeLooks,
      },
    });

    return usuario;
  }
  @UseGuards(CognitoAuthGuard)
  @Post('auth/register-profile')
  async registerProfile(@Req() req: AuthenticatedRequest, @Body() body: RegisterProfileBody) {
    const cognitoSub = req.user.cognitoSub;

    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { cognitoSub },
    });

    if (usuarioExistente) {
      return usuarioExistente;
    }

    const usuario = await this.prisma.usuario.create({
      data: {
        cognitoSub,
        nome: body.nome,
        email: body.email,
      },
    });

    return usuario;
  }
}
