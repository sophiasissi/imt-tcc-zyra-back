import { Body, ConflictException, Controller, Post, Req, UseGuards } from '@nestjs/common';
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
import { ResendCodeDto } from './dto/resend-code.dto';
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
    const normalizedEmail = body.email.trim().toLowerCase();

    const usuarioExistentePorCognito = await this.prisma.usuario.findUnique({
      where: { cognitoSub },
    });

    if (usuarioExistentePorCognito) {
      return usuarioExistentePorCognito;
    }

    const usuarioExistentePorEmail = await this.prisma.usuario.findUnique({
      where: { email: normalizedEmail },
    });

    if (usuarioExistentePorEmail) {
      throw new ConflictException(
        'Este email já possui uma conta no ZYRA. Entre com sua senha ou recupere o acesso caso tenha esquecido.',
      );
    }

    return this.prisma.usuario.create({
      data: {
        cognitoSub,
        nome: body.nome.trim(),
        email: normalizedEmail,
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

  /**
   * Cria a conta no Cognito e ja' grava o perfil no banco.
   *
   * O nome e' coletado na primeira tela do cadastro, mas antes so' vivia nos
   * parametros de navegacao do app ate' a confirmacao do codigo. Se a pessoa
   * fechasse o app nesse meio, o dado se perdia e o cadastro ficava sem saida.
   * Gravando aqui, o perfil existe desde o instante em que a conta existe.
   *
   * As duas falhas possiveis na gravacao recebem tratamentos diferentes,
   * porque so' uma delas se conserta sozinha depois:
   *
   *  - banco indisponivel: seguimos. O register-profile, chamado logo apos a
   *    confirmacao do codigo, ainda tem o nome em maos e cria o perfil.
   *
   *  - email ja' usado por outro cognitoSub: falhamos. O register-profile
   *    esbarraria na mesma restricao, entao seguir aqui so' adiaria o erro
   *    para um ponto em que ele fica incompreensivel.
   */
  @Post('signup')
  async signUp(@Body() body: SignUpDto) {
    const resultado = await this.authService.signUp(body.email, body.password);

    if (resultado.userSub) {
      const emailNormalizado = body.email.toLowerCase();

      try {
        // Checagem explicita em vez de interpretar o erro de constraint: com
        // o adapter pg o Prisma nao preenche meta.target, e a mensagem do
        // Postgres vem traduzida pelo locale do servidor. Nao ha corrida aqui
        // porque o Cognito ja' garantiu que so' um signup com este email passa.
        const existente = await this.prisma.usuario.findUnique({
          where: { email: emailNormalizado },
        });

        if (existente && existente.cognitoSub !== resultado.userSub) {
          // O Cognito acabou de aceitar este email, ou seja, nenhuma conta
          // ativa o usa. A linha que esta' bloqueando pertence a um usuario
          // que nao existe mais -- tipicamente sobra de um pool recriado em
          // desenvolvimento. Nao religamos a linha antiga ao novo cognitoSub:
          // sub novo e' pessoa nova para o Cognito, e herdar o perfil
          // entregaria os dados do usuario anterior a quem pegasse o email.
          console.error(
            `[Cadastro] Existe um registro antigo com o email ${emailNormalizado} ` +
              `vinculado a outro cognitoSub. Remova esse registro do banco: ` +
              `o usuario dele nao existe mais no Cognito.`,
          );

          throw new ConflictException(
            'Existe um cadastro antigo com este email que precisa ser removido antes de criar a conta.',
          );
        }

        await this.prisma.usuario.upsert({
          where: { cognitoSub: resultado.userSub },
          update: {},
          create: {
            cognitoSub: resultado.userSub,
            nome: body.nome,
            email: emailNormalizado,
          },
        });
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }

        // Falha transitoria de banco: seguimos. O register-profile, chamado
        // logo apos a confirmacao do codigo, ainda tem o nome e cria o perfil.
        console.error(
          '[Cadastro] Conta criada no Cognito, mas o perfil não foi gravado agora. ' +
            'Será criado na confirmação do código:',
          error,
        );
      }
    }

    return { message: resultado.message };
  }

  @Post('confirm-signup')
  confirmSignUp(@Body() body: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(body.email, body.confirmationCode);
  }

  @Post('resend-code')
  resendCode(@Body() body: ResendCodeDto) {
    return this.authService.resendConfirmationCode(body.email);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }
}
