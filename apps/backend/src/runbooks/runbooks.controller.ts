import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RunbooksService } from "./runbooks.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";

@Controller("runbooks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RunbooksController {
  constructor(private readonly runbooksService: RunbooksService) {}

  @Get()
  @Roles(UserRole.COLLABORATEUR)
  async findAll(
    @Query("category") category: string,
    @Query("search") search: string,
  ) {
    return this.runbooksService.findAll({ category, search });
  }

  @Get(":slug")
  @Roles(UserRole.COLLABORATEUR)
  async findBySlug(@Param("slug") slug: string) {
    return this.runbooksService.findBySlug(slug);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async create(
    @Body()
    body: {
      title: string;
      slug: string;
      description?: string;
      category?: string;
      content: string;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return this.runbooksService.create({ ...body, authorId: user.id });
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      category?: string;
      content?: string;
      version?: string;
    },
  ) {
    return this.runbooksService.update(id, body);
  }

  @Post(":id/execute")
  @Roles(UserRole.COLLABORATEUR)
  async startExecution(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.runbooksService.startExecution(id, user.id);
  }

  @Patch("executions/:execId")
  @Roles(UserRole.COLLABORATEUR)
  async updateExecution(
    @Param("execId", ParseUUIDPipe) execId: string,
    @Body() body: { stepsData: string; isComplete?: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    // IDOR fix : seul l'exécutant (ou un ADMIN+) peut modifier une exécution
    // de runbook. Sans ce check, n'importe quel user authentifié pouvait
    // PATCH les exécutions des autres (état des étapes, marquer terminé).
    return this.runbooksService.updateExecution(
      execId,
      body.stepsData,
      body.isComplete || false,
      user,
    );
  }

  @Get(":id/executions")
  @Roles(UserRole.COLLABORATEUR)
  async getExecutions(@Param("id", ParseUUIDPipe) id: string) {
    return this.runbooksService.getExecutions(id);
  }
}
