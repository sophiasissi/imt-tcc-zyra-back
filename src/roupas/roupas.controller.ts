import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { CognitoAuthGuard } from '../auth/cognito-auth.guard';
import { CreateRoupaDto } from './dto/create-roupa.dto';
import { UpdateRoupaDto } from './dto/update-roupa.dto';
import { RoupasService } from './roupas.service';

type AuthenticatedRequest = {
  user: {
    cognitoSub: string;
  };
};

// Foto de celular em resolucao cheia fica entre 2 e 6 MB.
const TAMANHO_MAXIMO_FOTO = 10 * 1024 * 1024;
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

@UseGuards(CognitoAuthGuard)
@Controller('roupas')
export class RoupasController {
  constructor(private readonly roupasService: RoupasService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('foto', {
      limits: { fileSize: TAMANHO_MAXIMO_FOTO },
      fileFilter: (_req, file, callback) => {
        if (TIPOS_ACEITOS.includes(file.mimetype)) {
          callback(null, true);
          return;
        }

        callback(new BadRequestException('Envie a foto em JPG, PNG ou WEBP.'), false);
      },
    }),
  )
  create(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() foto: Express.Multer.File | undefined,
    @Body() body: CreateRoupaDto,
  ) {
    if (!foto) {
      throw new BadRequestException('Envie a foto da peça.');
    }

    return this.roupasService.create(req.user.cognitoSub, foto, body);
  }

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.roupasService.findAll(req.user.cognitoSub);
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.roupasService.findOne(req.user.cognitoSub, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoupaDto,
  ) {
    return this.roupasService.update(req.user.cognitoSub, id, body);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.roupasService.remove(req.user.cognitoSub, id);
  }
}
