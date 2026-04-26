import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { DocumentCategory } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { WorkflowsService } from "./workflows.service";
import { AddStepDto } from "./dto/add-step.dto";
import { DecideStepDto } from "./dto/decide-step.dto";

/**
 * Contrôleur REST pour les workflows d'approbation configurables.
 * Préfixe : /approval-workflows
 */
@Controller("approval-workflows")
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  @Get()
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll() {
    return this.service.findAll();
  }

  @Post("seed-presets")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  seedPresets(@CurrentUser() user: RequestUser) {
    return this.service.seedPresets(user.id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(
    @Body()
    dto: {
      name: string;
      description?: string;
      documentCategory?: DocumentCategory | null;
      isDefault?: boolean;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get(":id")
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    dto: {
      name?: string;
      description?: string | null;
      documentCategory?: DocumentCategory | null;
      isActive?: boolean;
      isDefault?: boolean;
    },
  ) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  deactivate(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.deactivate(id);
  }

  // ---------------------------------------------------------------------------
  // Steps
  // ---------------------------------------------------------------------------

  @Post(":id/steps")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  addStep(
    @Param("id", ParseUUIDPipe) workflowId: string,
    @Body() dto: AddStepDto,
  ) {
    return this.service.addStep(workflowId, dto);
  }

  @Delete("steps/:stepId")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  removeStep(@Param("stepId", ParseUUIDPipe) stepId: string) {
    return this.service.removeStep(stepId);
  }

  @Post(":id/steps/reorder")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reorderSteps(
    @Param("id", ParseUUIDPipe) workflowId: string,
    @Body() dto: { orderedStepIds: string[] },
  ) {
    return this.service.reorderSteps(workflowId, dto.orderedStepIds);
  }

  // ---------------------------------------------------------------------------
  // Instances (démarrage et décisions)
  // ---------------------------------------------------------------------------

  @Post(":id/documents/:docId/start")
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  startInstance(
    @Param("id", ParseUUIDPipe) workflowId: string,
    @Param("docId", ParseUUIDPipe) documentId: string,
    @Body()
    dto: {
      documentVersionId: string;
      stepOverrides?: Array<{ stepId: string; approverUserId: string }>;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createInstance(
      workflowId,
      documentId,
      dto.documentVersionId,
      user.id,
      dto.stepOverrides,
    );
  }

  /**
   * Variante "docId en URL, workflowId en body" — utilisée par la page détail
   * document du frontend (WorkflowPanel). Accepte aussi `stepOverrides`.
   */
  @Post("documents/:docId/start")
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  startInstanceForDocument(
    @Param("docId", ParseUUIDPipe) documentId: string,
    @Body()
    dto: {
      workflowId: string;
      documentVersionId: string;
      stepOverrides?: Array<{ stepId: string; approverUserId: string }>;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createInstance(
      dto.workflowId,
      documentId,
      dto.documentVersionId,
      user.id,
      dto.stepOverrides,
    );
  }

  /**
   * Retourne l'instance active (PENDING) pour un document, ou 404 si aucune.
   *
   * Sécurité : restreint aux acteurs de la chaîne d'approbation (REVIEWER+,
   * DIRECTION, ADMIN). Sans cette garde, n'importe quel utilisateur pouvait
   * énumérer les workflows en cours et fuiter l'identité (id, nom, email)
   * des approbateurs configurés sur n'importe quel document.
   */
  @Get("instance/for-document/:documentId")
  @Roles(
    UserRole.REVIEWER,
    UserRole.AUDITEUR,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  async getActiveInstanceForDocument(
    @Param("documentId", ParseUUIDPipe) documentId: string,
  ) {
    const instance =
      await this.service.getActiveInstanceForDocument(documentId);
    if (!instance) {
      // On renvoie null (200) plutôt qu'un 404 pour simplifier le front
      return null;
    }
    return instance;
  }

  @Post("steps/:stepInstanceId/decide")
  decide(
    @Param("stepInstanceId", ParseUUIDPipe) stepInstanceId: string,
    @Body() dto: DecideStepDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.decide(
      stepInstanceId,
      user.id,
      dto.decision,
      dto.comment,
    );
  }

  @Post("instances/:instanceId/cancel")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  cancelInstance(@Param("instanceId", ParseUUIDPipe) instanceId: string) {
    return this.service.cancelInstance(instanceId);
  }

  @Get("pending/me")
  pendingForMe(@CurrentUser() user: RequestUser) {
    return this.service.getPendingForUser(
      user.id,
      user.role,
      (user as any).departmentId ?? null,
    );
  }
}
