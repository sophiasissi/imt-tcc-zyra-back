import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

enum Genero {
  MASCULINO = 'MASCULINO',
  FEMININO = 'FEMININO',
  NAO_BINARIO = 'NAO_BINARIO',
  PREFIRO_NAO_DIZER = 'PREFIRO_NAO_DIZER',
  OUTRO = 'OUTRO',
}

enum TipoDaltonismo {
  PROTANOMALIA = 'PROTANOMALIA',
  PROTANOPIA = 'PROTANOPIA',
  DEUTERANOMALIA = 'DEUTERANOMALIA',
  DEUTERANOPIA = 'DEUTERANOPIA',
  TRITANOMALIA = 'TRITANOMALIA',
  TRITANOPIA = 'TRITANOPIA',
  ACROMATOPSIA = 'ACROMATOPSIA',
  NAO_SEI = 'NAO_SEI',
  NAO_TENHO = 'NAO_TENHO',
  PREFIRO_NAO_DIZER = 'PREFIRO_NAO_DIZER',
}

export class UpdateProfileDto {
  @IsOptional()
  @IsDateString()
  dataNascimento?: string;

  @IsOptional()
  @IsEnum(Genero)
  genero?: Genero;

  @IsOptional()
  @IsEnum(TipoDaltonismo)
  tipoDaltonismo?: TipoDaltonismo | null;

  /**
   * Autorizacao especifica para guardar o tipo de daltonismo (dado de saude).
   * Obrigatoria na primeira vez que um tipo diferente de PREFIRO_NAO_DIZER e'
   * salvo; ver UsersService.consentimentoParaSalvar.
   */
  @IsOptional()
  @IsBoolean()
  consentimentoDadosSaude?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  nivelDificuldadeLooks?: number;
}
