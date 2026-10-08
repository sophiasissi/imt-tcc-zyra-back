import { IsEmail, IsNotEmpty } from 'class-validator';

export class VerificarEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
