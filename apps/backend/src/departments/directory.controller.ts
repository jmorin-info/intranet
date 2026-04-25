import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DepartmentsService } from './departments.service';

/**
 * Routes "directory" greffées sur DepartmentsModule pour éviter la création
 * d'un module dédié. Sert l'organigramme (hiérarchie flat) consommé par
 * `/directory/organigramme` côté frontend.
 *
 * Tous rôles authentifiés y ont accès (vue publique de l'organisation,
 * non-sensible — équivalent au /users/directory existant).
 */
@Controller('directory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DirectoryController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get('org-chart')
  async getOrgChart() {
    return this.departmentsService.getOrgChart();
  }
}
