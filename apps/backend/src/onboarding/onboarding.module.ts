import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnboardingController } from './onboarding.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [OnboardingController],
})
export class OnboardingModule {}
