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
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import {
  WorkflowRulesService,
  RuleEvaluationContext,
} from "./workflow-rules.service";
import { CreateWorkflowRuleDto } from "./dto/create-workflow-rule.dto";
import { UpdateWorkflowRuleDto } from "./dto/update-workflow-rule.dto";

/**
 * Contrôleur REST — règles d'approbation N+1 dynamique. Préfixe `/workflow-rules`.
 * Réservé aux ADMIN+ pour les mutations ; SUPER_ADMIN pour la suppression dure.
 */
@Controller("workflow-rules")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class WorkflowRulesController {
  constructor(private readonly service: WorkflowRulesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWorkflowRuleDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id);
  }

  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowRuleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.remove(id, user.id);
  }

  /**
   * Endpoint dry-run : prend un contexte (classification, category, dept,
   * amount) et renvoie la règle qui matcherait, sans rien instancier.
   */
  @Post("evaluate")
  evaluate(@Body() ctx: RuleEvaluationContext) {
    return this.service.evaluate(ctx ?? {});
  }
}
