import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterProfileDto {
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
