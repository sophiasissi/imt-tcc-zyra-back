import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CombinarService } from './combinar.service';
import { CombinarDto } from './dto/combinar.dto';
import { SalvarLookDto } from './dto/salvar-look.dto';
import { SugerirLookDto } from './dto/sugerir-look.dto';
import { LooksSalvosService } from './looks-salvos.service';
import { LooksService } from './looks.service';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
  };
};

@UseGuards(CognitoAuthGuard)
@Controller('looks')
export class LooksController {
  constructor(
    private readonly looksService: LooksService,
    private readonly looksSalvosService: LooksSalvosService,
    private readonly combinarService: CombinarService,
  ) {}

  @Post('sugerir')
  @HttpCode(200)
  sugerir(@Req() req: AuthenticatedRequest, @Body() body: SugerirLookDto) {
    return this.looksService.sugerir(req.user.cognitoSub, body);
  }

  /** Peças do armário que combinam com a que acabou de ser fotografada. */
  @Post('combinar')
  @HttpCode(200)
  combinar(@Req() req: AuthenticatedRequest, @Body() body: CombinarDto) {
    return this.combinarService.combinar(req.user.cognitoSub, body);
  }

  @Post()
  salvar(@Req() req: AuthenticatedRequest, @Body() body: SalvarLookDto) {
    return this.looksSalvosService.salvar(req.user.cognitoSub, body);
  }

  @Get()
  listar(@Req() req: AuthenticatedRequest) {
    return this.looksSalvosService.listar(req.user.cognitoSub);
  }

  @Delete(':id')
  remover(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.looksSalvosService.remover(req.user.cognitoSub, id);
  }
}
