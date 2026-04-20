import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { SignedPdfService } from './signed-pdf.service';

@Module({
  controllers: [ExportsController],
  providers: [SignedPdfService],
  exports: [SignedPdfService],
})
export class ExportsModule {}
