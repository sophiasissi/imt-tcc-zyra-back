import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  InitiateAuthCommand,
  GlobalSignOutCommand,
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
