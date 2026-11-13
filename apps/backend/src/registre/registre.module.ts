import { Module } from "@nestjs/common";
import { RegistreController } from "./registre.controller";
import { RegistreService } from "./registre.service";

/**
 * Module Registre Documentaire (REG_016 SMSI).
 *
 * Expose la vue admin consolidee (lecture + export) du registre des
 * documents normalises ISO 27001 / SMSI OMNITECH. Toutes les mutations
 * sur les Documents passent par DocumentsModule (/documents/*).
 *
 * PrismaModule est global (cf. prisma.module.ts) — pas besoin d'import.
 */
@Module({
  controllers: [RegistreController],
  providers: [RegistreService],
  exports: [RegistreService],
})
export class RegistreModule {}
