import { Module } from '@nestjs/common';
import { StirlingController } from './stirling.controller';
import { StirlingService } from './stirling.service';

/**
 * Integration with the self-hosted Stirling PDF service.
 *
 * The service is not bundled: an admin must start the Stirling container
 * manually (see STIRLING_SETUP.md) and enable the integration via the
 * `STIRLING_PDF_ENABLED=true` / `STIRLING_PDF_URL` env vars.
 */
@Module({
  controllers: [StirlingController],
  providers: [StirlingService],
  exports: [StirlingService],
})
export class StirlingModule {}
