import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  // O UsersService usa para confirmar a senha e apagar a conta no Cognito.
  exports: [AuthService],
})
export class AuthModule {}
