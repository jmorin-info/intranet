import { Module } from '@nestjs/common';
import { IsoControlsController } from './iso-controls.controller';
import { IsoControlsService } from './iso-controls.service';

@Module({
  controllers: [IsoControlsController],
  providers: [IsoControlsService],
  exports: [IsoControlsService],
})
export class IsoControlsModule {}
