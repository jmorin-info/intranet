import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AppConfigModule } from '../config/config.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { KnowBe4Controller } from './knowbe4.controller';
import { KnowBe4Service } from './knowbe4.service';

@Module({
  imports: [PrismaModule, AuditModule, AppConfigModule, CertificatesModule],
  controllers: [KnowBe4Controller],
  providers: [KnowBe4Service],
  exports: [KnowBe4Service],
})
export class KnowBe4Module {}
