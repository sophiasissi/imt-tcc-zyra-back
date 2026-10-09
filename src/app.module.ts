import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { PrismaModule } from './prisma/prisma.module';
import { LooksModule } from './looks/looks.module';
import { PecasModule } from './pecas/pecas.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // So' as rotas com ThrottlerGuard sao limitadas (hoje, /auth/verificar-email).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }],
      errorMessage: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
    }),
    PrismaModule,
    StorageModule,
    EmailModule,
    AuthModule,
    UsersModule,
    PecasModule,
    LooksModule,
  ],
})
export class AppModule {}
