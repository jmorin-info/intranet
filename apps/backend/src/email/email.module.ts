import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { EmailRenderService } from "./email-render.service";
import { EmailService } from "./email.service";
import { EmailTemplatesController } from "./email-templates.controller";

/**
 * Wave G — Email Module.
 *
 * Service unifi&eacute; d'envoi de notifications par mail bas&eacute; sur des templates
 * MJML. Utilise nodemailer pour le transport SMTP. Si une queue BullMQ
 * "email" est ajout&eacute;e ult&eacute;rieurement, l'EmailService la d&eacute;tectera
 * automatiquement via injection optionnelle.
 *
 * Voir docs/architecture/EMAIL_TEMPLATES.md pour le guide d'ajout de
 * nouveaux templates.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:
          process.env.JWT_ACCESS_SECRET || "omnitech-access-secret-change-me",
      }),
    }),
  ],
  controllers: [EmailTemplatesController],
  providers: [EmailRenderService, EmailService],
  exports: [EmailRenderService, EmailService],
})
export class EmailModule {}
