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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NewsService } from "./news.service";
import { CreateNewsDto } from "./dto/create-news.dto";
import { UpdateNewsDto } from "./dto/update-news.dto";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { safeParseInt } from "../common/validation-helpers";

@Controller("news")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @Roles(UserRole.COLLABORATEUR)
  findAll(
    @Query("page") page: string,
    @Query("limit") limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.newsService.findAll(
      { page: safeParseInt(page, 1), limit: safeParseInt(limit, 20) },
      user.role as UserRole,
    );
  }

  @Get("popular")
  @Roles(UserRole.COLLABORATEUR)
  getPopular(@Query("limit") limit: string) {
    return this.newsService.getPopularArticles(safeParseInt(limit, 5));
  }

  @Get("categories")
  @Roles(UserRole.COLLABORATEUR)
  getCategories() {
    return this.newsService.getCategoryStats();
  }

  @Get(":slug")
  @Roles(UserRole.COLLABORATEUR)
  findBySlug(@Param("slug") slug: string, @CurrentUser() user: RequestUser) {
    return this.newsService.findBySlug(slug, user.role as UserRole);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateNewsDto, @CurrentUser() user: RequestUser) {
    return this.newsService.create(dto, user.id);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.newsService.update(id, dto, user.id);
  }

  @Post("upload-cover")
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ALLOWED_IMAGE_MIMES = new Set([
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
        ]);
        if (!ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              "Format non supporté (JPG, PNG, WebP, GIF uniquement)",
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadCoverImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { url: "" };

    // Magic bytes verification to detect MIME spoofing
    const MAGIC_BYTES: Record<string, number[][]> = {
      "image/jpeg": [[0xff, 0xd8, 0xff]],
      "image/png": [[0x89, 0x50, 0x4e, 0x47]],
      "image/gif": [[0x47, 0x49, 0x46, 0x38]], // GIF87a or GIF89a
      "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF header
    };
    const signatures = MAGIC_BYTES[file.mimetype];
    if (signatures && file.buffer.length >= 4) {
      const matchesMagic = signatures.some((sig) =>
        sig.every((byte, i) => file.buffer[i] === byte),
      );
      if (!matchesMagic) {
        throw new BadRequestException(
          "Le contenu du fichier ne correspond pas au type déclaré",
        );
      }
    }

    const MIME_TO_EXT: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    const ext = MIME_TO_EXT[file.mimetype] || ".jpg";
    const storageDir = path.resolve(
      process.cwd(),
      "..",
      "..",
      "storage",
      "news",
    );
    if (!fs.existsSync(storageDir))
      fs.mkdirSync(storageDir, { recursive: true });
    const filename = `${crypto.randomUUID()}${ext}`;
    fs.writeFileSync(path.join(storageDir, filename), file.buffer);
    return { url: `/api/storage/news/${filename}` };
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  softDelete(@Param("id", ParseUUIDPipe) id: string) {
    return this.newsService.softDelete(id);
  }

  @Post(":id/publish")
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  publish(@Param("id", ParseUUIDPipe) id: string) {
    return this.newsService.publish(id);
  }

  @Post(":slug/view")
  @Roles(UserRole.COLLABORATEUR)
  recordView(@Param("slug") slug: string, @CurrentUser() user: RequestUser) {
    // We need to look up the post ID by slug first
    return this.newsService
      .findBySlug(slug, user.role as UserRole)
      .then((post) => this.newsService.recordView(post.id, user.id));
  }

  /**
   * Liste des utilisateurs ayant lu une actualité (admin uniquement).
   * Permet au RSSI/DIRECTION de vérifier la diffusion effective des communications.
   */
  @Get(":id/viewers")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  getViewers(@Param("id", ParseUUIDPipe) id: string) {
    return this.newsService.getViewers(id);
  }

  /**
   * Liste des utilisateurs actifs n'ayant PAS encore lu une actualité.
   * Utile pour les relances ciblées.
   */
  @Get(":id/non-viewers")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  getNonViewers(@Param("id", ParseUUIDPipe) id: string) {
    return this.newsService.getNonViewers(id);
  }
}
