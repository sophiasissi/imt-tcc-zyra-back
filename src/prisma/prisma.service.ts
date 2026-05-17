import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>('DATABASE_URL');

    super({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
