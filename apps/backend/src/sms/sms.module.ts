import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';

/**
 * Module SMS (fallback alertes critiques via OVH SMS API).
 * À importer dans `app.module.ts` pour activer l'endpoint /sms/*.
 */
@Module({
  imports: [
    PrismaModule,
    // JwtModule nécessaire pour JwtAuthGuard (même pattern que NotificationsModule)
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:
          process.env.JWT_ACCESS_SECRET || 'omnitech-access-secret-change-me',
      }),
    }),
  ],
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
