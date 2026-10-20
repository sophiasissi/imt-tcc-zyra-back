import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

// O app reduz a foto antes de enviar (por volta de 100 KB); o limite só barra
// envio errado.
const TAMANHO_MAXIMO_FOTO = 5 * 1024 * 1024;
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

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

  /** Troca a foto de perfil (multipart, campo "foto"). */
  @UseGuards(CognitoAuthGuard)
  @Put('me/foto')
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
  atualizarFoto(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() foto: Express.Multer.File | undefined,
  ) {
    if (!foto) {
      throw new BadRequestException('Envie a foto de perfil.');
    }

    return this.usersService.atualizarFoto(req.user.cognitoSub, foto);
  }

  @UseGuards(CognitoAuthGuard)
  @Delete('me/foto')
  removerFoto(@Req() req: AuthenticatedRequest) {
    return this.usersService.removerFoto(req.user.cognitoSub);
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
