import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterProfileDto {
  /**
   * Opcional de proposito: o modelo Usuario aceita nome nulo, e o app precisa
   * conseguir criar o perfil que faltou quando o cadastro foi interrompido
   * antes desta chamada. Nesse momento de recuperacao so temos o email, e
   * exigir o nome deixaria a conta travada para sempre.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
