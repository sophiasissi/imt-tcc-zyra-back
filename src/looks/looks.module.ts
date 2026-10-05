import { Module } from '@nestjs/common';

import { LooksController } from './looks.controller';
import { LooksService } from './looks.service';

@Module({
  controllers: [LooksController],
  providers: [LooksService],
})
export class LooksModule {}
