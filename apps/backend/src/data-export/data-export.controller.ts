import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  ParseUUIDPipe,
  NotFoundException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { UserThrottle } from "../auth/decorators/user-throttle.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { DataExportService } from "./data-export.service";

/**
 * Endpoint asynchrone d'export RGPD (droit a la portabilite — Art. 20).
 *
 * Contrairement a `POST /users/me/gdpr-export` qui genere immediatement
 * un ZIP synchrone (utile pour un volume reduit), cet endpoint :
 *  1. Cree un `DataExportRequest` en base (status PENDING).
 *  2. Pousse un job sur la queue BullMQ `data-export`.
 *  3. Retourne 202 Accepted + l'ID de la demande.
 *
 * Le client poll ensuite `GET /users/me/data-export/:id` pour recuperer
 * le statut et, une fois COMPLETED, l'URL signee de telechargement.
 *
 * Tracker throttle = utilisateur (pas IP) — un user legitime ne demande
 * pas plus de 3 exports par heure.
 */
@Controller("users/me/data-export")
@UseGuards(JwtAuthGuard)
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 3, ttl: 60 * 60_000 })
  async requestExport(@CurrentUser() user: RequestUser) {
    const request = await this.dataExportService.requestExport(user.id);
    return {
      id: request.id,
      status: request.status,
      requestedAt: request.requestedAt,
      message:
        "Export en cours. Vous serez notifie une fois le fichier disponible.",
    };
  }

  @Get()
  async listMyExports(@CurrentUser() user: RequestUser) {
    return this.dataExportService.listForUser(user.id);
  }

  @Get(":id")
  async getStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const req = await this.dataExportService.findById(id);
    if (!req) {
      throw new NotFoundException("Demande d'export introuvable");
    }
    // RGPD : un utilisateur ne peut consulter QUE ses propres demandes.
    if (req.userId !== user.id) {
      throw new ForbiddenException(
        "Vous ne pouvez consulter que vos propres demandes",
      );
    }
    return this.dataExportService.getStatusPayload(req);
  }
}
