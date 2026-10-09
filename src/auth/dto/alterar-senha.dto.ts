import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AlterarSenhaDto {
  @IsString()
  @IsNotEmpty()
  senhaAtual!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message:
      'A senha deve ter no mínimo 8 caracteres, incluindo letra maiúscula, minúscula, número e caractere especial.',
  })
  novaSenha!: string;
}
