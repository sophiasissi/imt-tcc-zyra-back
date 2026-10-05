import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
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
}
