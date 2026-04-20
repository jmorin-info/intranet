import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { OfficeService } from './office.service';
import { OfficeController } from './office.controller';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    JwtModule.register({}),
  ],
  controllers: [OfficeController],
  providers: [OfficeService],
  exports: [OfficeService],
})
export class OfficeModule {}
