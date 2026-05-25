import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
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

  async signUp(email: string, password: string) {
    try {
      await this.cognitoClient.send(
        new SignUpCommand({
          ClientId: this.clientId,
          Username: email,
          Password: password,
          UserAttributes: [
            {
              Name: 'email',
              Value: email,
            },
          ],
        }),
      );

      return {
        message: 'Código de confirmação enviado para o email informado.',
      };
    } catch (error) {
      if (error instanceof CognitoIdentityProviderServiceException) {
        if (error.name === 'UsernameExistsException') {
          throw new ConflictException('Este email já está cadastrado.');
        }

        if (error.name === 'InvalidPasswordException') {
          throw new BadRequestException('Senha inválida.');
        }
      }

      throw error;
    }
  }

  async confirmSignUp(email: string, confirmationCode: string) {
    await this.cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
      }),
    );

    return {
      message: 'Cadastro confirmado com sucesso.',
    };
  }

  async login(email: string, password: string) {
    const response = await this.cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: email,
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
  }

  async forgotPassword(email: string) {
    await this.cognitoClient.send(
      new ForgotPasswordCommand({
        ClientId: this.clientId,
        Username: email,
      }),
    );

    return {
      message: 'Código de recuperação enviado para o email informado.',
    };
  }
  async confirmForgotPassword(email: string, confirmationCode: string, newPassword: string) {
    await this.cognitoClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      }),
    );

    return {
      message: 'Senha redefinida com sucesso.',
    };
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
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
  }
  async logout(accessToken: string) {
    await this.cognitoClient.send(
      new GlobalSignOutCommand({
        AccessToken: accessToken,
      }),
    );

    return {
      message: 'Logout realizado com sucesso.',
    };
  }
}
