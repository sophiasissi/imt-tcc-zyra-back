import { Module } from '@nestjs/common';

import { ClimaService } from './clima';
import { LooksController } from './looks.controller';
import { LooksSalvosService } from './looks-salvos.service';
import { LooksService } from './looks.service';
import { TituloDoLookService } from './titulo-do-look';

@Module({
  controllers: [LooksController],
  providers: [LooksService, LooksSalvosService, ClimaService, TituloDoLookService],
})
export class LooksModule {}
