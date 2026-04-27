import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { DocumentTemplateService } from "./document-template.service";
import { CreateDocumentTemplateDto } from "./dto/create-template.dto";
import { UpdateDocumentTemplateDto } from "./dto/update-template.dto";
import { InstantiateTemplateDto } from "./dto/instantiate-template.dto";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { DocumentCategory } from "@prisma/client";

/**
 * Wave D — DocumentTemplate REST API.
 *
 * - Liste (GET /document-templates) : tous authentifiés (REVIEWER+ peut
 *   instancier ; les autres rôles consultent uniquement).
 * - CRUD : ADMIN+ (création/édition/suppression de templates partagés).
 * - Instantiate (POST /:id/instantiate) : REVIEWER+ peut créer un Document
 *   à partir d'un template.
 *
 * NOTE — pas de @RequireFreshMfa (différent de signatures) : la création de
 * documents est une opération courante. La suppression est protégée par
 * audit log + permissions ADMIN+.
 */
@Controller("document-templates")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentTemplateController {
  constructor(
    private readonly templatesService: DocumentTemplateService,
  ) {}

  @Get()
  list(
    @Query("category") category?: DocumentCategory,
    @Query("search") search?: string,
  ) {
    return this.templatesService.list({ category, search });
  }

  @Get(":idOrSlug")
  async get(@Param("idOrSlug") idOrSlug: string) {
    // UUID v4 : 8-4-4-4-12 hex
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );
    return isUuid
      ? this.templatesService.getById(idOrSlug)
      : this.templatesService.getBySlug(idOrSlug);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(
    @Body() dto: CreateDocumentTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.templatesService.create(dto, user.id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.templatesService.update(id, dto, user.id);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.templatesService.softDelete(id, user.id);
  }

  /**
   * Instantie un template : crée un Document Markdown (inline) à partir des
   * variables fournies. REVIEWER+ peut le faire.
   */
  @Post(":id/instantiate")
  @Roles(
    UserRole.REVIEWER,
    UserRole.MANAGER,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  instantiate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: InstantiateTemplateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.templatesService.instantiate(id, dto, user.id);
  }
}
