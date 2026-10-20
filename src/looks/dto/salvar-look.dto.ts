import { Ocasiao } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SalvarLookDto {
  /** Peças do look, como vieram do /looks/sugerir. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  pecaIds!: string[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(60)
  nome?: string;

  /**
   * O pedido que gerou o look no chat. Sem nome, o back cria um título curto
   * a partir dele ("Casamento à noite").
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pedido?: string;

  @IsOptional()
  @IsEnum(Ocasiao)
  ocasiao?: Ocasiao;
}
