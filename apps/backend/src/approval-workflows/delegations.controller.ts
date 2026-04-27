import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { DelegationService } from "./delegation.service";
import { CreateDelegationDto } from "./dto/create-delegation.dto";

/**
 * DelegationsController — Endpoints REST personnels pour gérer ses délégations
 * d'approbation (item #27).
 *
 * Préfixé sous `/users/me/delegations` pour rester cohérent avec le pattern
 * "ressources de l'utilisateur courant" déjà utilisé par UsersController
 * (preferences, onboarding, avatar…).
 *
 * Toutes les routes requièrent JWT — pas de @Roles : tout user authentifié
 * peut gérer SES propres délégations.
 */
@Controller("users/me/delegations")
@UseGuards(JwtAuthGuard)
export class DelegationsController {
  constructor(private readonly service: DelegationService) {}

  /**
   * Liste les délégations émises par l'utilisateur courant (actives + historique).
   */
  @Get()
  listGiven(@CurrentUser() user: RequestUser) {
    return this.service.listGiven(user.id);
  }

  /**
   * Liste les délégations REÇUES par l'utilisateur courant.
   * Utile pour afficher un badge "Vous représentez X collègue(s) absent(s)".
   *
   * `?includeInactive=true` pour voir l'historique.
   */
  @Get("received")
  listReceived(
    @CurrentUser() user: RequestUser,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.service.listReceived(user.id, includeInactive === "true");
  }

  @Post()
  create(
    @Body() dto: CreateDelegationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(user.id, dto);
  }

  @Delete(":id")
  revoke(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const isPrivileged =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    return this.service.revoke(id, user.id, isPrivileged);
  }
}
