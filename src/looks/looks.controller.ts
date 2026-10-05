import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';

import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { SugerirLookDto } from './dto/sugerir-look.dto';
import { LooksService } from './looks.service';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
  };
};

@UseGuards(CognitoAuthGuard)
@Controller('looks')
export class LooksController {
  constructor(private readonly looksService: LooksService) {}

  @Post('sugerir')
  @HttpCode(200)
  sugerir(@Req() req: AuthenticatedRequest, @Body() body: SugerirLookDto) {
    return this.looksService.sugerir(req.user.cognitoSub, body);
  }
}
