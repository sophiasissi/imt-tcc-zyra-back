import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Campos de texto que acompanham a foto no multipart.
 *
 * A cor vem da tela de captura (/detect-color, gratuito). Se o app nao mandar
 * a cor completa, o back le a cor da foto sozinho. O resto das
 * caracteristicas vem da analise da peca.
 */
export class CreatePecaDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  corNome?: string;

  @IsOptional()
  @IsHexColor()
  hex?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  colorAddSymbol?: string;
}
