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
import { UserRole } from "../common/enums";
import { ComplianceTasksService } from "./compliance-tasks.service";
import { RequireFreshMfa } from "../mfa/decorators/require-fresh-mfa.decorator";

@Controller("compliance-tasks")
@UseGuards(JwtAuthGuard, RolesGuard)
// Tâches de conformité (ISO 27001) — re-validation MFA requise.
@RequireFreshMfa()
export class ComplianceTasksController {
  constructor(private readonly service: ComplianceTasksService) {}

  @Get()
  @Roles(UserRole.COLLABORATEUR)
  findAll(
    @Query("status") status?: string,
    @Query("overdue") overdue?: string,
  ) {
    return this.service.findAll(status, overdue === "true");
  }

  @Get("overdue")
  @Roles(UserRole.COLLABORATEUR)
  getOverdue() {
    return this.service.getOverdue();
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(
    @Body()
    body: {
      title: string;
      description?: string;
      frequency?: string;
      responsibleId?: string;
      status?: string;
      nextDueDate?: string;
      isoControl?: string;
    },
  ) {
    return this.service.create(body);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: Partial<{
      title: string;
      description: string;
      frequency: string;
      responsibleId: string;
      status: string;
      nextDueDate: string;
      isoControl: string;
    }>,
  ) {
    return this.service.update(id, body);
  }

  @Post(":id/complete")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  completeTask(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.completeTask(id);
  }

  @Post("seed")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  seed() {
    return this.service.seed();
  }
}
