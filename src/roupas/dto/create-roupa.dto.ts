import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Campos de texto que acompanham a foto no multipart.
 *
 * A cor vem da tela de captura (/detect-color, gratuito). O resto das
 * caracteristicas o back obtem sozinho pela analise da peca.
 */
export class CreateRoupaDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  corNome?: string;

  @IsOptional()
  @IsHexColor()
  corHex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  corColorAdd?: string;
}
