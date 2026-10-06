import { Module } from '@nestjs/common';

import { LooksController } from './looks.controller';
import { LooksSalvosService } from './looks-salvos.service';
import { LooksService } from './looks.service';

@Module({
  controllers: [LooksController],
  providers: [LooksService, LooksSalvosService],
})
export class LooksModule {}
