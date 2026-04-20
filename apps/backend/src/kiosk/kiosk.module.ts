import { Module } from '@nestjs/common';
import { KioskController } from './kiosk.controller';

@Module({
  controllers: [KioskController],
})
export class KioskModule {}
