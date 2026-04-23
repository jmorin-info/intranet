import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LdapModule } from "../ldap/ldap.module";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";

@Module({
  imports: [PrismaModule, LdapModule],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
