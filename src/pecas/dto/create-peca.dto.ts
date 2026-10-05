import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Campos de texto que acompanham a foto no multipart.
 *
 * A cor vem da tela de captura (/detect-color, gratuito). Se o app nao mandar
 * a cor principal completa, o back le as cores da foto sozinho. A secundaria
 * so vem em peca de duas cores. O resto das caracteristicas vem da analise.
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

  @IsOptional()
  @IsString()
  @MaxLength(60)
  corSecundariaNome?: string;

  @IsOptional()
  @IsHexColor()
  hexSecundario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  colorAddSymbolSecundario?: string;
}
