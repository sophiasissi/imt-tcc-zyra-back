import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class SignUpDto {
  /**
   * O nome ja e' coletado na primeira tela do cadastro. Recebe-lo aqui
   * permite gravar o perfil junto com a criacao da conta, em vez de manter o
   * dado apenas nos parametros de navegacao -- que se perdem se o app for
   * fechado antes da confirmacao do codigo.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message:
      'A senha deve ter no mínimo 8 caracteres, incluindo letra maiúscula, minúscula, número e caractere especial.',
  })
  password!: string;
}
