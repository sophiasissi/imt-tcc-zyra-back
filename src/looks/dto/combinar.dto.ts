import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { TIPOS_DA_FOTO } from '../combinar';
import type { TipoDaFoto } from '../combinar';

/** A peça que acabou de ser fotografada (ainda não cadastrada). */
export class CombinarDto {
  /** Tipo da peça segundo a validação da foto (CLIP). */
  @IsIn(TIPOS_DA_FOTO)
  tipo!: TipoDaFoto;

  @IsString()
  @MaxLength(40)
  corNome!: string;

  @Matches(/^#[0-9A-Fa-f]{6}$/)
  hex!: string;

  @Matches(/^COLORADD_[A-Z_]+$/)
  colorAddSymbol!: string;

  /** Peças já mostradas para esta foto, para "Ver outras" trazer novas. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsUUID('4', { each: true })
  excluir?: string[];
}
