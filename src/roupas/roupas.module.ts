import { Module } from '@nestjs/common';
import { RoupasController } from './roupas.controller';
import { RoupasService } from './roupas.service';
import { VisionService } from './vision.service';

@Module({
  controllers: [RoupasController],
  providers: [RoupasService, VisionService],
})
export class RoupasModule {}
