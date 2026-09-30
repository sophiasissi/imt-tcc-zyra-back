import { Aquecimento, Categoria, Estampa, Estilo, Material, Ocasiao } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Correcao manual depois do cadastro. A peca e salva direto com o que a
 * analise encontrou; aqui a pessoa ajusta o que tiver saido errado.
 */
export class UpdateRoupaDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nome?: string;

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

  @IsOptional()
  @IsEnum(Categoria)
  categoria?: Categoria;

  @IsOptional()
  @IsEnum(Estilo)
  estilo?: Estilo;

  @IsOptional()
  @IsEnum(Estampa)
  estampa?: Estampa;

  @IsOptional()
  @IsEnum(Aquecimento)
  aquecimento?: Aquecimento;

  @IsOptional()
  @IsEnum(Material)
  material?: Material;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Ocasiao, { each: true })
  ocasioes?: Ocasiao[];
}
