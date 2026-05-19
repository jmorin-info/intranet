import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as path from "path";
import * as fs from "fs";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { WikiService } from "./wiki.service";
import { WikiTagService } from "./wiki-tag.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import {
  CreateWikiPageDto,
  UpdateWikiPageDto,
} from "./dto/create-wiki-page.dto";
import { ShareWikiPageDto } from "./dto/share-wiki-page.dto";

const WIKI_UPLOAD_PATH = path.join(process.cwd(), "uploads", "wiki");
const WIKI_MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

@Controller("wiki")
@UseGuards(JwtAuthGuard, RolesGuard)
export class WikiController {
  constructor(
    private readonly wikiService: WikiService,
    private readonly tagService: WikiTagService,
  ) {}

  @Get()
  @Roles(UserRole.COLLABORATEUR)
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query("category") category?: string,
    @Query("search") search?: string,
    @Query("mine") mine?: string,
    @Query("tag") tag?: string,
  ) {
    return this.wikiService.findAll(user, {
      category,
      search,
      mine: mine === "true" || mine === "1",
      tag,
    });
  }

  @Get("autocomplete")
  @Roles(UserRole.COLLABORATEUR)
  async autocomplete(
    @CurrentUser() user: RequestUser,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    if (!q || q.trim().length === 0) return [];
    return this.wikiService.autocomplete(
      user,
      q.trim(),
      limit ? parseInt(limit, 10) : 5,
    );
  }

  @Get("categories")
  @Roles(UserRole.COLLABORATEUR)
  async categories(@CurrentUser() user: RequestUser) {
    return this.wikiService.getCategories(user);
  }

  // ---- Tags --------------------------------------------------------------

  /** Liste tous les tags wiki (toutes pages confondues). */
  @Get("tags")
  @Roles(UserRole.COLLABORATEUR)
  async listTags() {
    return this.tagService.listAll();
  }

  /** Crée un nouveau tag (admin only). */
  @Post("tags")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createTag(
    @Body() body: { name: string; slug?: string; colorHex?: string | null },
    @CurrentUser() user: RequestUser,
  ) {
    return this.tagService.create(body, user);
  }

  /** Supprime un tag (admin only). */
  @Delete("tags/:id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteTag(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tagService.remove(id, user);
  }

  /** Tags rattachés à une page. */
  @Get("pages/:id/tags")
  @Roles(UserRole.COLLABORATEUR)
  async getPageTags(@Param("id", ParseUUIDPipe) id: string) {
    return this.tagService.listForPage(id);
  }

  /** Remplace l'ensemble des tags d'une page. Auteur + admin uniquement (check service). */
  @Patch("pages/:id/tags")
  @Roles(UserRole.COLLABORATEUR)
  async setPageTags(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { tagIds: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.tagService.setPageTags(id, body.tagIds ?? [], user);
  }

  /** Backlinks pointant vers le slug donné (endpoint public à l'utilisateur).  */
  @Get("pages/:slug/backlinks")
  @Roles(UserRole.COLLABORATEUR)
  async getBacklinksBySlug(
    @Param("slug") slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.findBacklinksBySlug(slug, user);
  }

  @Get(":slug")
  @Roles(UserRole.COLLABORATEUR)
  async findBySlug(
    @Param("slug") slug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.findBySlug(slug, user);
  }

  /**
   * Create an "official" wiki page — reserved to admins (preserves existing
   * API contract for the public wiki).
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async create(
    @Body() body: CreateWikiPageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.create(body, user.id);
  }

  /**
   * Create a personal wiki page — COLLABORATEUR+ peuvent l'utiliser (PRESTATAIRE
   * et AUDITEUR sont exclus). La page démarre en visibilité PRIVATE avec
   * l'auteur comme propriétaire.
   */
  @Post("personal")
  @Roles(UserRole.COLLABORATEUR)
  async createPersonal(
    @Body() body: CreateWikiPageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.createPersonalPage(body, user);
  }

  @Patch(":id")
  @Roles(UserRole.COLLABORATEUR)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateWikiPageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.update(id, body, user);
  }

  @Patch(":id/share")
  @Roles(UserRole.COLLABORATEUR)
  async share(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ShareWikiPageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.shareWith(id, body, user);
  }

  @Post(":id/lock")
  @Roles(UserRole.COLLABORATEUR)
  async acquireLock(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.acquireEditLock(id, user);
  }

  @Delete(":id/lock")
  @Roles(UserRole.COLLABORATEUR)
  async releaseLock(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.releaseEditLock(id, user);
  }

  /**
   * List articles that link to the given page (backlinks / "cited in").
   * Response shape: `{ count, items: Array<{ id, title, slug, category, excerpt, updatedAt }> }`
   */
  @Get(":id/backlinks")
  @Roles(UserRole.COLLABORATEUR)
  async getBacklinks(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.findBacklinks(id, user);
  }

  @Get(":id/versions")
  @Roles(UserRole.COLLABORATEUR)
  async getVersions(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    return this.wikiService.getVersions(
      id,
      user,
      take ? parseInt(take, 10) : undefined,
      skip ? parseInt(skip, 10) : undefined,
    );
  }

  @Post(":id/versions/:versionId/restore")
  @Roles(UserRole.COLLABORATEUR)
  async restoreVersion(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.restoreVersion(id, versionId, user);
  }

  @Post(":id/feedback")
  @Roles(UserRole.COLLABORATEUR)
  async feedback(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { rating: "up" | "down"; comment?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.recordFeedback(id, user, body);
  }

  @Delete(":id")
  @Roles(UserRole.COLLABORATEUR)
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    // Le service vérifie ownership + droits avant suppression réelle.
    return this.wikiService.delete(id, user);
  }

  // ---- Attachments ----

  @Get(":id/attachments")
  @Roles(UserRole.COLLABORATEUR)
  async getAttachments(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.getAttachments(id, user);
  }

  @Post(":id/attachments")
  @Roles(UserRole.COLLABORATEUR)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(WIKI_UPLOAD_PATH)) {
            fs.mkdirSync(WIKI_UPLOAD_PATH, { recursive: true });
          }
          cb(null, WIKI_UPLOAD_PATH);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: WIKI_MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        // Allowlist: documents, images, archives — block executables and scripts
        const ALLOWED_MIMES = new Set([
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.oasis.opendocument.text",
          "application/vnd.oasis.opendocument.spreadsheet",
          "text/plain",
          "text/csv",
          "text/markdown",
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "application/zip",
          "application/x-7z-compressed",
          "application/gzip",
        ]);
        const BLOCKED_EXTENSIONS =
          /\.(exe|bat|cmd|ps1|sh|msi|dll|com|scr|vbs|js|php|py|rb|pl|cgi|htm|html|svg)$/i;
        if (BLOCKED_EXTENSIONS.test(file.originalname)) {
          return cb(new BadRequestException("Type de fichier interdit"), false);
        }
        if (!ALLOWED_MIMES.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              `Type MIME non autorisé : ${file.mimetype}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadAttachment(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException("No file provided");
    }
    return this.wikiService.addAttachment(id, user, file);
  }

  @Delete(":id/attachments/:filename")
  @Roles(UserRole.COLLABORATEUR)
  async removeAttachment(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("filename") filename: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.wikiService.removeAttachment(id, user, filename);
  }
}
