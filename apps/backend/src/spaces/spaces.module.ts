import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

/**
 * SpacesModule — declarative module access configuration.
 *
 * Allows admins to enable/disable front-end modules for specific
 * departments or roles without a code change (sidebar filtering,
 * conditional features, etc.).
 */
@Module({
  imports: [PrismaModule],
  controllers: [SpacesController],
  providers: [SpacesService],
  exports: [SpacesService],
})
export class SpacesModule {}
