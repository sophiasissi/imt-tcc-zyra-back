import { IsNotEmpty, IsString } from 'class-validator';

export class ExcluirContaDto {
  /** A senha e' pedida de novo para confirmar que e' o dono da conta. */
  @IsString()
  @IsNotEmpty()
  senha!: string;
}
