import { Ocasiao } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

class MensagemHistoricoDto {
  @IsIn(['usuario', 'zyra'])
  autor!: 'usuario' | 'zyra';

  @IsString()
  @MaxLength(500)
  texto!: string;
}

class LocalizacaoDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

/** Nome e ocasião do look na tela, para salvá-lo igual ao popup de saída do app. */
class LookMostradoDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(60)
  nome?: string;

  @IsOptional()
  @IsEnum(Ocasiao)
  ocasiao?: Ocasiao;

  /** O pedido que gerou o look: vira o título, se não vier nome. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pedido?: string;
}

export class SugerirLookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  mensagem!: string;

  /** Últimas mensagens da conversa, para entender respostas curtas ("trabalho"). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MensagemHistoricoDto)
  historico?: MensagemHistoricoDto[];

  /** Peças do último look mostrado, para "quero outro" trazer algo diferente. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  pecasAnteriores?: string[];

  /** Peças dos últimos looks da conversa, para o motor variar as sugestões. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsUUID('4', { each: true })
  pecasRecentes?: string[];

  /** Onde o usuário está, para a previsão do tempo. Só vai se ele permitir. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizacaoDto)
  localizacao?: LocalizacaoDto;

  /** Usado quando a mensagem pede para salvar o look ("sim", "salva esse"). */
  @IsOptional()
  @ValidateNested()
  @Type(() => LookMostradoDto)
  lookMostrado?: LookMostradoDto;
}
