import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { UsersService } from './users.service';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
  };
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
  updateMe(@Req() req: AuthenticatedRequest, @Body() body: UpdateProfileBody) {
    return this.usersService.updateMe(req.user.cognitoSub, body);
  }
}
