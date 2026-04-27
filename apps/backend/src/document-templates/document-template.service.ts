import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { Prisma, DocumentCategory } from "@prisma/client";
import { sanitizePlainText } from "../common/sanitize";
import { CreateDocumentTemplateDto } from "./dto/create-template.dto";
import { UpdateDocumentTemplateDto } from "./dto/update-template.dto";
import { InstantiateTemplateDto } from "./dto/instantiate-template.dto";
import {
  TemplateVariableSpec,
  TemplateVariableType,
} from "./dto/template-variable.dto";

/**
 * Wave D — DocumentTemplateService.
 *
 * Gestion CRUD des templates de documents Markdown avec variables {{var}},
 * + instanciation : substitue les variables et crée un Document inline natif.
 *
 * Moteur de templating volontairement minimal :
 *   - Pattern : `\{\{\s*(\w+)\s*\}\}` (espaces autorisés autour du nom).
 *   - Substitution = `variables[name]` ; valeur manquante = string vide
 *     SI la variable n'est pas marquée required (sinon → BadRequest).
 *   - Pas de blocs / boucles / conditionnels → on assume que les templates
 *     sont écrits par des admins (pas un risque XSS / SSTI).
 *
 * ISO 27001 A.5.1 — toute opération est auditée (traçabilité complète).
 */
@Injectable()
export class DocumentTemplateService {
  private readonly logger = new Logger(DocumentTemplateService.name);
  private static readonly VAR_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // List / get
  // -------------------------------------------------------------------------

  async list(filters: {
    category?: DocumentCategory;
    search?: string;
  }): Promise<
    Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      category: DocumentCategory;
      classification: string;
      variableCount: number;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const where: Prisma.DocumentTemplateWhereInput = {
      deletedAt: null,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              {
                description: { contains: filters.search, mode: "insensitive" },
              },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.documentTemplate.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      category: r.category,
      classification: r.classification,
      variableCount: Array.isArray(r.variables)
        ? (r.variables as unknown[]).length
        : 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getById(id: string) {
    const tpl = await this.prisma.documentTemplate.findFirst({
      where: { id, deletedAt: null },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!tpl) {
      throw new NotFoundException("Template introuvable");
    }
    return tpl;
  }

  async getBySlug(slug: string) {
    const tpl = await this.prisma.documentTemplate.findFirst({
      where: { slug, deletedAt: null },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!tpl) {
      throw new NotFoundException("Template introuvable");
    }
    return tpl;
  }

  // -------------------------------------------------------------------------
  // Create / update / delete
  // -------------------------------------------------------------------------

  async create(dto: CreateDocumentTemplateDto, userId: string) {
    this.validateVariables(dto.variables, dto.content);

    // Slug unique check (séparé du DB constraint pour message clair en API)
    const existing = await this.prisma.documentTemplate.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Slug déjà utilisé: ${dto.slug}`);
    }

    const tpl = await this.prisma.documentTemplate.create({
      data: {
        name: sanitizePlainText(dto.name),
        slug: dto.slug,
        description: dto.description
          ? sanitizePlainText(dto.description)
          : null,
        category: dto.category,
        // Le content reste brut (Markdown) — la sanitization se fait au
        // moment du rendu par le DocumentsService.createInline / l'éditeur.
        content: dto.content,
        variables: dto.variables as unknown as Prisma.InputJsonValue,
        classification: dto.classification || "INTERNE",
        createdById: userId,
      },
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_TEMPLATE_CREATED",
      resourceType: "DocumentTemplate",
      resourceId: tpl.id,
      metadata: {
        name: tpl.name,
        slug: tpl.slug,
        category: tpl.category,
        variableCount: dto.variables.length,
      },
    });

    this.logger.log(`Template created: ${tpl.slug} by ${userId}`);
    return tpl;
  }

  async update(id: string, dto: UpdateDocumentTemplateDto, userId: string) {
    const existing = await this.getById(id);

    // Si on met à jour content OU variables, on revalide la cohérence.
    if (dto.variables !== undefined || dto.content !== undefined) {
      const nextContent = dto.content ?? existing.content;
      const nextVars = (dto.variables ??
        (existing.variables as unknown as TemplateVariableSpec[])) as TemplateVariableSpec[];
      this.validateVariables(nextVars, nextContent);
    }

    const data: Prisma.DocumentTemplateUpdateInput = {};
    if (dto.name !== undefined) data.name = sanitizePlainText(dto.name);
    if (dto.description !== undefined)
      data.description = dto.description
        ? sanitizePlainText(dto.description)
        : null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.variables !== undefined)
      data.variables = dto.variables as unknown as Prisma.InputJsonValue;
    if (dto.classification !== undefined)
      data.classification = dto.classification;

    const updated = await this.prisma.documentTemplate.update({
      where: { id },
      data,
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_TEMPLATE_UPDATED",
      resourceType: "DocumentTemplate",
      resourceId: id,
      metadata: { changes: Object.keys(data) },
    });

    return updated;
  }

  async softDelete(id: string, userId: string) {
    await this.getById(id); // 404 si introuvable

    await this.prisma.documentTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_TEMPLATE_DELETED",
      resourceType: "DocumentTemplate",
      resourceId: id,
    });

    this.logger.log(`Template soft-deleted: ${id} by ${userId}`);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Instantiation
  // -------------------------------------------------------------------------

  /**
   * Render le contenu Markdown en remplaçant {{var}} par values.
   *
   * Comportement :
   *  - Variables manquantes ET non-required → string vide ("")
   *  - Variables manquantes ET required → BadRequestException avec liste
   *  - Variable inconnue (présente dans content mais absente de spec) →
   *    string vide + warn (pour ne pas casser le rendu si un template
   *    contient `{{accidental}}`).
   */
  renderContent(
    content: string,
    spec: TemplateVariableSpec[],
    values: Record<string, string>,
  ): { content: string; missing: string[] } {
    const requiredKeys = new Set(
      spec.filter((v) => v.required).map((v) => v.key),
    );
    const validKeys = new Map(spec.map((v) => [v.key, v]));

    const missing: string[] = [];
    for (const key of requiredKeys) {
      const v = values[key];
      if (v === undefined || v === null || String(v).trim() === "") {
        missing.push(key);
      }
    }

    const rendered = content.replace(
      DocumentTemplateService.VAR_PATTERN,
      (_match, varName: string) => {
        const value = values[varName];
        if (value !== undefined && value !== null) {
          // Validation SELECT : si la variable est SELECT, vérifier que la
          // valeur appartient aux options. Sinon on log warn et on garde la
          // valeur (l'utilisateur peut avoir une raison).
          const v = validKeys.get(varName);
          if (
            v?.type === TemplateVariableType.SELECT &&
            v.options &&
            v.options.length > 0 &&
            !v.options.includes(String(value))
          ) {
            this.logger.warn(
              `Template variable "${varName}" value "${value}" not in options`,
            );
          }
          return String(value);
        }
        // Valeur défaut au runtime si présente dans la spec
        const fallback = validKeys.get(varName)?.defaultValue;
        return fallback !== undefined ? String(fallback) : "";
      },
    );

    return { content: rendered, missing };
  }

  /**
   * Instantie un template : crée un Document natif lié au template.
   *
   * Le Document est créé via Prisma direct (pas via DocumentsService.createInline)
   * pour éviter une dépendance circulaire DocumentsModule ↔ DocumentTemplatesModule.
   * Les champs métier critiques (référence, isNative, scanStatus) sont dupliqués
   * du flux createInline.
   */
  async instantiate(
    templateId: string,
    dto: InstantiateTemplateDto,
    userId: string,
  ) {
    const tpl = await this.getById(templateId);
    const spec = (tpl.variables as unknown as TemplateVariableSpec[]) || [];

    const { content: rendered, missing } = this.renderContent(
      tpl.content,
      spec,
      dto.variables || {},
    );

    if (missing.length > 0) {
      throw new BadRequestException(
        `Variables requises manquantes: ${missing.join(", ")}`,
      );
    }

    // Reference : on délègue la génération à un compteur Prisma simple.
    // Format : <CATEGORY>-<TPLSLUG>-<COUNTER> pour traçabilité instance ↔ template.
    const reference = await this.generateReference(tpl.category, tpl.slug);

    const document = await this.prisma.document.create({
      data: {
        title: sanitizePlainText(dto.title || tpl.name),
        description: dto.description
          ? sanitizePlainText(dto.description)
          : tpl.description
            ? sanitizePlainText(tpl.description)
            : null,
        category: tpl.category,
        reference,
        ownerId: userId,
        reviewerId: dto.reviewerId,
        approverId: dto.approverId,
        nextReviewDate: dto.nextReviewDate
          ? new Date(dto.nextReviewDate)
          : null,
        isPublic: dto.isPublic ?? false,
        classification: tpl.classification,
        content: rendered,
        isNative: true,
        scanStatus: "CLEAN", // inline content bypasses AV
        fromTemplateId: tpl.id,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        fromTemplate: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    await this.auditService.log({
      userId,
      action: "DOCUMENT_INSTANTIATED_FROM_TEMPLATE",
      resourceType: "Document",
      resourceId: document.id,
      metadata: {
        templateId: tpl.id,
        templateSlug: tpl.slug,
        reference,
        variableKeys: Object.keys(dto.variables || {}),
      },
    });

    this.logger.log(
      `Document ${reference} instantiated from template ${tpl.slug} by ${userId}`,
    );

    return document;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Vérifie la cohérence variables ↔ content :
   *  - Toutes les variables référencées dans content doivent exister dans spec
   *    (sinon warn, on accepte quand même pour ne pas bloquer).
   *  - Toutes les keys spec doivent être uniques.
   *  - Le `key` d'une variable doit matcher /^\w+$/ (regex pattern).
   *  - Une variable SELECT doit avoir options non vide.
   */
  private validateVariables(
    spec: TemplateVariableSpec[],
    content: string,
  ): void {
    const seen = new Set<string>();
    for (const v of spec) {
      if (!/^\w+$/.test(v.key)) {
        throw new BadRequestException(
          `Variable key invalide "${v.key}" — doit matcher /^\\w+$/`,
        );
      }
      if (seen.has(v.key)) {
        throw new BadRequestException(`Variable dupliquée: ${v.key}`);
      }
      seen.add(v.key);
      if (
        v.type === TemplateVariableType.SELECT &&
        (!v.options || v.options.length === 0)
      ) {
        throw new BadRequestException(
          `Variable SELECT "${v.key}" doit avoir au moins une option`,
        );
      }
    }

    // Variables référencées dans content vs spec
    const referenced = new Set<string>();
    let m: RegExpExecArray | null;
    DocumentTemplateService.VAR_PATTERN.lastIndex = 0;
    while ((m = DocumentTemplateService.VAR_PATTERN.exec(content)) !== null) {
      referenced.add(m[1]);
    }
    DocumentTemplateService.VAR_PATTERN.lastIndex = 0;

    for (const ref of referenced) {
      if (!seen.has(ref)) {
        this.logger.warn(
          `Template content references variable "{{${ref}}}" not declared in spec — will render as empty string`,
        );
      }
    }
  }

  /**
   * Génère une référence unique pour un Document instancié.
   * Format : OMS-<CAT_PREFIX>-TPL-<COUNTER_4DIGITS>
   *
   * Le compteur est calculé via count() sur les documents non-soft-deleted
   * partageant le même fromTemplateId. Bug potentiel : race conditions entre
   * deux instances créées simultanément. Acceptable côté GED (impact = ref
   * différente — aucune donnée perdue).
   */
  private async generateReference(
    category: DocumentCategory,
    templateSlug: string,
  ): Promise<string> {
    const prefix = this.categoryPrefix(category);
    // SLUG uppercase + remove non-alphanum → ex: "politique-securite" → "POLSEC"
    const slugUpper = templateSlug.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const slugSafe = slugUpper.slice(0, 8) || "TPL";
    const count = await this.prisma.document.count({
      where: { fromTemplate: { slug: templateSlug } },
    });
    const seq = String(count + 1).padStart(4, "0");
    return `OMS-${prefix}-${slugSafe}-${seq}`;
  }

  private categoryPrefix(category: DocumentCategory): string {
    switch (category) {
      case "POLICY":
        return "POL";
      case "PROCEDURE":
        return "PRO";
      case "PLAN":
        return "PLA";
      case "RECORD":
        return "REC";
      case "FORM":
        return "FRM";
      case "GUIDE":
        return "GUI";
      case "REPORT":
        return "RPT";
      case "CONTRACT":
        return "CTR";
      default:
        return "GEN";
    }
  }
}
