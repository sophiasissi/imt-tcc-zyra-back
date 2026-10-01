import { Module } from '@nestjs/common';
import { PecasController } from './pecas.controller';
import { PecasService } from './pecas.service';
import { VisionService } from './vision.service';

@Module({
  controllers: [PecasController],
  providers: [PecasService, VisionService],
})
export class PecasModule {}
