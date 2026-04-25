import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LdapModule } from "../ldap/ldap.module";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";
import { MfaRequiredGuard } from "./mfa-required.guard";
import { FreshMfaGuard } from "./fresh-mfa.guard";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    PrismaModule,
    LdapModule,
    // forwardRef évite le cycle MfaModule ↔ AuthModule : AuthModule importe
    // déjà MfaModule pour le challenge inline au login, et MfaController a
    // besoin d'AuthService pour signer un nouveau JWT après /mfa/revalidate.
    forwardRef(() => AuthModule),
  ],
  controllers: [MfaController],
  // MfaRequiredGuard et FreshMfaGuard sont enregistrés en APP_GUARD côté
  // app.module.ts mais doivent être déclarés ici pour être instanciables.
  providers: [MfaService, MfaRequiredGuard, FreshMfaGuard],
  exports: [MfaService, MfaRequiredGuard, FreshMfaGuard],
})
export class MfaModule {}
