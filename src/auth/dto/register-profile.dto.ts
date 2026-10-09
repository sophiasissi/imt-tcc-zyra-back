import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /** Versao dos Termos aceita no cadastro, se o perfil nao saiu no signup. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  versaoTermosAceita?: string;
}
