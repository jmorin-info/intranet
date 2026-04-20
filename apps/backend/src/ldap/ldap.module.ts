import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LdapController } from './ldap.controller';
import { LdapService } from './ldap.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [LdapController],
  providers: [LdapService],
  exports: [LdapService],
})
export class LdapModule {}
