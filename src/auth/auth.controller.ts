import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
  };
};

type RegisterProfileBody = {
  nome: string;
  email: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(CognitoAuthGuard)
  @Post('register-profile')
  async registerProfile(@Req() req: AuthenticatedRequest, @Body() body: RegisterProfileBody) {
    const cognitoSub = req.user.cognitoSub;

    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { cognitoSub },
    });

    if (usuarioExistente) {
      return usuarioExistente;
    }

    return this.prisma.usuario.create({
      data: {
        cognitoSub,
        nome: body.nome,
        email: body.email,
      },
    });
  }
}
