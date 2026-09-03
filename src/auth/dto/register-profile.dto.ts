import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterProfileDto {
  /**
   * O @Transform roda antes das validacoes e apara os espacos, para que
   * "   " seja rejeitado pelo @IsNotEmpty em vez de virar nome vazio no
   * banco: sozinho, o @IsNotEmpty so' recusa a string vazia.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
