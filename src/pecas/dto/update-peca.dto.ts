import { Aquecimento, Categoria, Estampa, Estilo, Material, Ocasiao } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// O @IsOptional deixa passar null, e null num campo obrigatorio do banco vira
// erro 500 no Prisma. Nos campos obrigatorios so a ausencia e aceita.
const SeEnviado = ValidateIf((_objeto, valor) => valor !== undefined);

/**
 * Correcao manual depois do cadastro. A peca e salva direto com o que a
 * analise encontrou; aqui a pessoa ajusta o que tiver saido errado.
 */
export class UpdatePecaDto {
  @SeEnviado
  @IsEnum(Categoria)
  categoria?: Categoria;

  @IsOptional()
  @IsEnum(Estilo)
  estilo?: Estilo | null;

  @IsOptional()
  @IsEnum(Estampa)
  estampa?: Estampa | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Ocasiao, { each: true })
  ocasioes?: Ocasiao[];

  @IsOptional()
  @IsEnum(Aquecimento)
  aquecimento?: Aquecimento | null;

  @IsOptional()
  @IsEnum(Material)
  material?: Material | null;

  @SeEnviado
  @IsString()
  @MaxLength(60)
  corNome?: string;

  @SeEnviado
  @IsHexColor()
  hex?: string;

  @SeEnviado
  @IsString()
  @MaxLength(60)
  colorAddSymbol?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  corSecundariaNome?: string | null;

  @IsOptional()
  @IsHexColor()
  hexSecundario?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  colorAddSymbolSecundario?: string | null;
}
