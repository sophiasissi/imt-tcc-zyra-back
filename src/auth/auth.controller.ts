import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CognitoAuthGuard } from './cognito-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterProfileDto } from './dto/register-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { AuthService } from './auth.service';
import { ConfirmForgotPasswordDto } from './dto/confirm-forgot-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { SignUpDto } from './dto/signup.dto';
import { ConfirmSignUpDto } from './dto/confirm-signup.dto';
import { LoginDto } from './dto/login.dto';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('confirm-forgot-password')
  async confirmForgotPassword(@Body() body: ConfirmForgotPasswordDto) {
    return this.authService.confirmForgotPassword(
      body.email,
      body.confirmationCode,
      body.newPassword,
    );
  }

  @UseGuards(CognitoAuthGuard)
  @Post('register-profile')
  async registerProfile(@Req() req: AuthenticatedRequest, @Body() body: RegisterProfileDto) {
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

  @Post('refresh-token')
  refreshToken(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  logout(@Body() body: LogoutDto) {
    return this.authService.logout(body.accessToken);
  }

  @Post('signup')
  signUp(@Body() body: SignUpDto) {
    return this.authService.signUp(body.email, body.password);
  }

  @Post('confirm-signup')
  confirmSignUp(@Body() body: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(body.email, body.confirmationCode);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }
}
