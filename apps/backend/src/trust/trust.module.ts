import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrustController } from './trust.controller';

/**
 * Trust Center — endpoints publics alimentant la page /trust.
 *
 * Aucune dépendance métier : on ne fait que lire des compteurs
 * (users actifs, chartes, audit logs) depuis Prisma pour dériver des
 * badges qualitatifs sans exposer de signaux exploitables.
 */
@Module({
  imports: [PrismaModule],
  controllers: [TrustController],
})
export class TrustModule {}
