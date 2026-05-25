import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ConfirmSignUpDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  confirmationCode!: string;
}
