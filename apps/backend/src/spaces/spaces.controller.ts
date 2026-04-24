import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { SpacesService } from './spaces.service';
import { UpsertSpaceConfigDto } from './dto/upsert-space-config.dto';

@Controller('spaces')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpacesController {
  constructor(private readonly spacesService: SpacesService) {}

  /** Returns the flat list of modules accessible to the current user. */
  @Get('my-modules')
  async getMyModules(@CurrentUser() user: RequestUser) {
    const modules = await this.spacesService.getModulesForUser(user);
    return { modules };
  }

  /** Full catalogue of modules (for the admin UI). */
  @Get('modules')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listModules() {
    return { modules: this.spacesService.getDefaultModules() };
  }

  /** All stored configuration rows (for the admin UI). */
  @Get('configs')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listConfigs() {
    const data = await this.spacesService.getAllConfigs();
    return { data };
  }

  /** Upserts a single rule (enable/disable a module for a scope). */
  @Post('configs')
  @Roles(UserRole.SUPER_ADMIN)
  upsertConfig(@Body() body: UpsertSpaceConfigDto) {
    return this.spacesService.setConfig(body);
  }

  @Delete('configs/:id')
  @Roles(UserRole.SUPER_ADMIN)
  deleteConfig(@Param('id') id: string) {
    return this.spacesService.deleteConfig(id);
  }

  // ── Department-level access configuration ────────────────────────

  /**
   * Retourne la config modules (explicite + fusion canonique) d'un
   * département. Consommée par `/admin/access` (onglet Départements).
   */
  @Get('departments/:id/access-config')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getDepartmentAccessConfig(@Param('id') id: string) {
    return this.spacesService.getDepartmentAccessConfig(id);
  }

  /**
   * Met à jour l'ensemble des modules actifs pour un département
   * (remplace le set complet). SUPER_ADMIN uniquement car impact
   * potentiellement large sur la navigation des collaborateurs.
   */
  @Post('departments/:id/access-config')
  @Roles(UserRole.SUPER_ADMIN)
  setDepartmentAccessConfig(
    @Param('id') id: string,
    @Body() body: { modules: string[] },
  ) {
    const modules = Array.isArray(body?.modules) ? body.modules : [];
    return this.spacesService.setDepartmentAccessConfig(id, modules);
  }

  // ── User-level access configuration ──────────────────────────────

  /**
   * Retourne les règles USER-level pour un user donné (pour admin UI).
   */
  @Get('users/:id/access-config')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getUserAccessConfig(@Param('id') id: string) {
    const configs = await this.spacesService.getConfigsForUser(id);
    return { userId: id, configs };
  }

  /**
   * Remplace la liste des modules activés au niveau USER (override).
   */
  @Post('users/:id/access-config')
  @Roles(UserRole.SUPER_ADMIN)
  setUserAccessConfig(
    @Param('id') id: string,
    @Body() body: { modules: string[] },
  ) {
    const modules = Array.isArray(body?.modules) ? body.modules : [];
    return this.spacesService.setUserModuleOverrides(id, modules);
  }
}
