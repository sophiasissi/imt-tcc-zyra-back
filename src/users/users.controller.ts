import { Body, Controller, Delete, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ExcluirContaDto } from './dto/excluir-conta.dto';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
    accessToken: string;
  };
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(CognitoAuthGuard)
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.usersService.getMe(req.user.cognitoSub);
  }

  @UseGuards(CognitoAuthGuard)
  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() body: UpdateProfileDto) {
    return this.usersService.updateMe(req.user.cognitoSub, body);
  }

  /**
   * Exclui a conta e todos os dados dela (Configuracoes > Excluir conta),
   * exigencia da App Store (5.1.1(v)), do Google Play e direito do titular na
   * LGPD (art. 18, VI). Pede a senha de novo; o limite por IP freia tentativas.
   */
  @UseGuards(CognitoAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('me')
  deleteMe(@Req() req: AuthenticatedRequest, @Body() body: ExcluirContaDto) {
    return this.usersService.deleteMe(req.user.cognitoSub, req.user.accessToken, body.senha);
  }
}
