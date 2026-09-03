import { IsEmail, IsNotEmpty } from 'class-validator';

export class ResendCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
