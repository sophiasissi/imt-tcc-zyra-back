import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

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
  tipoDaltonismo?: TipoDaltonismo;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  nivelDificuldadeLooks?: number;
}
