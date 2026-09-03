import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  CognitoIdentityProviderServiceException,
} from '@aws-sdk/client-cognito-identity-provider';

@Injectable()
export class AuthService {
  private readonly cognitoClient: CognitoIdentityProviderClient;
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
    });

    this.clientId = this.configService.getOrThrow<string>('COGNITO_CLIENT_ID');
  }

  private handleCognitoError(error: unknown): never {
    if (error instanceof CognitoIdentityProviderServiceException) {
      switch (error.name) {
        case 'UsernameExistsException':
          throw new ConflictException(
            'Este email já possui uma conta no ZYRA. Entre com sua senha ou recupere o acesso caso tenha esquecido.',
          );

        case 'InvalidPasswordException':
          throw new BadRequestException(
            'A senha não atende aos requisitos de segurança. Use pelo menos 8 caracteres, com letra maiúscula, minúscula, número e símbolo.',
          );

        case 'CodeMismatchException':
          throw new BadRequestException(
            'Código inválido. Confira o código enviado para seu email e tente novamente.',
          );

        case 'ExpiredCodeException':
          throw new BadRequestException(
            'Este código expirou. Solicite um novo código e tente novamente.',
          );

        case 'NotAuthorizedException':
          throw new UnauthorizedException(
            'Email ou senha inválidos. Confira seus dados e tente novamente.',
          );

        case 'UserNotFoundException':
          throw new UnauthorizedException('Não encontramos uma conta com este email.');

        case 'UserNotConfirmedException':
          throw new BadRequestException(
            'Sua conta ainda não foi confirmada. Confira seu email e informe o código recebido.',
          );

        case 'LimitExceededException':
        case 'TooManyRequestsException':
          throw new HttpException(
            'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
            HttpStatus.TOO_MANY_REQUESTS,
          );

        case 'InvalidParameterException':
          throw new BadRequestException(
            'Alguma informação enviada está inválida. Confira os dados e tente novamente.',
          );

        default:
          throw new BadRequestException(
            'Não foi possível concluir a operação. Tente novamente em alguns instantes.',
          );
      }
    }

    throw new BadRequestException(
      'Não foi possível concluir a operação. Tente novamente em alguns instantes.',
    );
  }

  async signUp(email: string, password: string) {
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const response = await this.cognitoClient.send(
        new SignUpCommand({
          ClientId: this.clientId,
          Username: normalizedEmail,
          Password: password,
          UserAttributes: [
            {
              Name: 'email',
              Value: normalizedEmail,
            },
          ],
        }),
      );

      return {
        message: 'Código de confirmação enviado para o email informado.',
        // O sub definitivo do usuario ja' existe aqui, antes da confirmacao.
        // E' com ele que o perfil e' gravado no mesmo momento do cadastro.
        userSub: response.UserSub,
      };
    } catch (error) {
      this.handleCognitoError(error);
    }
  }

  async confirmSignUp(email: string, confirmationCode: string) {
    try {
      await this.cognitoClient.send(
        new ConfirmSignUpCommand({
          ClientId: this.clientId,
          Username: email.trim().toLowerCase(),
          ConfirmationCode: confirmationCode,
        }),
      );

      return {
        message: 'Cadastro confirmado com sucesso.',
      };
    } catch (error) {
      this.handleCognitoError(error);
    }
  }

  /**
   * Reenvia o codigo de confirmacao para quem criou a conta mas nao chegou a
   * confirmar. Sem isso o cadastro interrompido deixava o email travado: o
   * signup passava a acusar "email ja existe", o login acusava "conta nao
   * confirmada" e nao havia nenhum jeito de obter um codigo novo.
   */
  async resendConfirmationCode(email: string) {
    try {
      await this.cognitoClient.send(
        new ResendConfirmationCodeCommand({
          ClientId: this.clientId,
          Username: email.trim().toLowerCase(),
        }),
      );

      return {
        message: 'Enviamos um novo código de confirmação para seu email.',
      };
    } catch (error) {
      // Conta ja confirmada: o Cognito recusa o reenvio. Nao e' erro do
      // usuario, entao a mensagem precisa apontar para o login.
      if (
        error instanceof CognitoIdentityProviderServiceException &&
        error.name === 'InvalidParameterException'
      ) {
        throw new BadRequestException(
          'Esta conta já está confirmada. Entre com seu email e senha.',
        );
      }

      this.handleCognitoError(error);
    }
  }

  async login(email: string, password: string) {
    try {
      const response = await this.cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: this.clientId,
          AuthParameters: {
            USERNAME: email.trim().toLowerCase(),
            PASSWORD: password,
          },
        }),
      );

      return {
        accessToken: response.AuthenticationResult?.AccessToken,
        idToken: response.AuthenticationResult?.IdToken,
        refreshToken: response.AuthenticationResult?.RefreshToken,
        expiresIn: response.AuthenticationResult?.ExpiresIn,
        tokenType: response.AuthenticationResult?.TokenType,
      };
    } catch (error) {
      this.handleCognitoError(error);
    }
  }

  async forgotPassword(email: string) {
    try {
      await this.cognitoClient.send(
        new ForgotPasswordCommand({
          ClientId: this.clientId,
          Username: email.trim().toLowerCase(),
        }),
      );

      return {
        message: 'Código de recuperação enviado para o email informado.',
      };
    } catch (error) {
      this.handleCognitoError(error);
    }
  }

  async confirmForgotPassword(email: string, confirmationCode: string, newPassword: string) {
    try {
      await this.cognitoClient.send(
        new ConfirmForgotPasswordCommand({
          ClientId: this.clientId,
          Username: email.trim().toLowerCase(),
          ConfirmationCode: confirmationCode,
          Password: newPassword,
        }),
      );

      return {
        message: 'Senha redefinida com sucesso.',
      };
    } catch (error) {
      this.handleCognitoError(error);
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const response = await this.cognitoClient.send(
        new InitiateAuthCommand({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: this.clientId,
          AuthParameters: {
            REFRESH_TOKEN: refreshToken,
          },
        }),
      );

      return {
        accessToken: response.AuthenticationResult?.AccessToken,
        idToken: response.AuthenticationResult?.IdToken,
        expiresIn: response.AuthenticationResult?.ExpiresIn,
        tokenType: response.AuthenticationResult?.TokenType,
      };
    } catch {
      throw new UnauthorizedException('Sua sessão expirou. Entre novamente para continuar.');
    }
  }

  async logout(accessToken: string) {
    try {
      await this.cognitoClient.send(
        new GlobalSignOutCommand({
          AccessToken: accessToken,
        }),
      );

      return {
        message: 'Logout realizado com sucesso.',
      };
    } catch {
      throw new BadRequestException('Não foi possível sair da conta. Tente novamente.');
    }
  }
}
