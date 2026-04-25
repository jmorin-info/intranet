import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  HttpCode,
} from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as path from "path";
import * as fs from "fs";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UserRole } from "../common/enums";
import { RequestUser } from "../common/interfaces";
import { rowsToCsv, csvFilename, CsvColumn } from "../common/utils/csv-export";

const AVATAR_STORAGE_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "storage",
  "avatars",
);
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Annuaire public (tous rôles authentifiés) — expose uniquement les champs
   * sûrs : id, nom, prénom, email, département, rôle, jobTitle, avatar.
   * Remplace les usages `GET /users` dans les pages collaborateur (ticket
   * assignment, document owner, mention, etc.) qui était protégé ADMIN et
   * silencieusement 403.
   */
  @Get("directory")
  async directory(
    @Query("search") search?: string,
    @Query("departmentId") departmentId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.usersService.getDirectory({
      search,
      departmentId,
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
    });
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: "asc" | "desc",
    @Query("role") role?: string,
    @Query("departmentId") departmentId?: string,
    @Query("search") search?: string,
  ) {
    return this.usersService.findAll(
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        sortBy,
        sortOrder,
      },
      { role, departmentId, search },
    );
  }

  /**
   * CSV export of filtered users list (max 10 000 rows). Admin only.
   * ISO 27001 A.5.10 — export controlé (traçabilité + anti-injection).
   */
  @Get("export/csv")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async exportCsv(
    @Query("role") role: string,
    @Query("departmentId") departmentId: string,
    @Query("search") search: string,
    @Res() res: Response,
  ) {
    const result = await this.usersService.findAll(
      { page: 1, limit: 10000 },
      { role, departmentId, search },
    );
    const rows = (result as any)?.data ?? [];

    type UserRow = {
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      jobTitle?: string | null;
      phone?: string | null;
      isActive: boolean;
      department?: { name: string } | null;
      createdAt: Date | string;
      lastLoginAt?: Date | string | null;
    };

    const columns: CsvColumn<UserRow>[] = [
      { header: "Prénom", accessor: (u) => u.firstName },
      { header: "Nom", accessor: (u) => u.lastName },
      { header: "Email", accessor: (u) => u.email },
      { header: "Rôle", accessor: (u) => u.role },
      { header: "Département", accessor: (u) => u.department?.name ?? "" },
      { header: "Fonction", accessor: (u) => u.jobTitle ?? "" },
      { header: "Téléphone", accessor: (u) => u.phone ?? "" },
      { header: "Actif", accessor: (u) => u.isActive },
      { header: "Créé le", accessor: (u) => u.createdAt },
      { header: "Dernière connexion", accessor: (u) => u.lastLoginAt ?? "" },
    ];

    const csv = rowsToCsv<UserRow>(rows as UserRow[], columns, "Utilisateurs");

    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("utilisateurs")}"`,
      "Cache-Control": "private, no-store",
    });
    res.send(csv);
  }

  @Get("me/activity-summary")
  async getActivitySummary(@CurrentUser() user: RequestUser) {
    return this.usersService.getActivitySummary(user.id);
  }

  /**
   * Marque le tour guidé de première connexion comme terminé pour l'utilisateur
   * courant. Idempotent : rejouer ne remet pas le timestamp en cause.
   */
  @Post("me/onboarding-complete")
  async completeOnboarding(@CurrentUser() user: RequestUser) {
    return this.usersService.markOnboardingCompleted(user.id);
  }

  /**
   * Réinitialise le tour de bienvenue : `onboardingCompletedAt = null`.
   * Utilisé par le bouton "Revoir le tour" dans les préférences.
   */
  @Post("me/onboarding-reset")
  async resetOnboarding(@CurrentUser() user: RequestUser) {
    return this.usersService.resetOnboarding(user.id);
  }

  /**
   * État de la checklist "Démarrage rapide" affichée sur le dashboard pendant
   * les premiers jours du compte. Retourne 5 items + leur statut `done`.
   */
  @Get("me/onboarding-checklist")
  async getOnboardingChecklist(@CurrentUser() user: RequestUser) {
    return this.usersService.getOnboardingChecklist(user.id);
  }

  /**
   * Masque la checklist "Démarrage rapide" pour cet utilisateur
   * (`welcomeChecklistDismissedAt = now()`).
   */
  @Post("me/welcome-checklist/dismiss")
  async dismissWelcomeChecklist(@CurrentUser() user: RequestUser) {
    return this.usersService.dismissWelcomeChecklist(user.id);
  }

  @Get("me/preferences")
  async getPreferences(@CurrentUser() user: RequestUser) {
    return this.usersService.getPreferences(user.id);
  }

  @Patch("me/preferences")
  async updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body()
    dto: {
      darkMode?: boolean;
      language?: string;
      dashboardWidgets?: string[];
      notificationPrefs?: {
        email?: boolean;
        inApp?: boolean;
        documentUpdates?: boolean;
        ticketUpdates?: boolean;
        securityAlerts?: boolean;
      };
    },
  ) {
    return this.usersService.updatePreferences(user.id, dto);
  }

  @Get("me/notification-preferences")
  async getNotificationPreferences(@CurrentUser() user: RequestUser) {
    return this.usersService.getNotificationPreferences(user.id);
  }

  @Patch("me/notification-preferences")
  async updateNotificationPreferences(
    @CurrentUser() user: RequestUser,
    @Body()
    dto: {
      emailDocuments?: boolean;
      emailTickets?: boolean;
      emailNews?: boolean;
      dailySummary?: boolean;
      pushBrowser?: boolean;
    },
  ) {
    return this.usersService.updateNotificationPreferences(user.id, dto);
  }

  @Patch("me")
  async updateMyProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get(":id")
  async findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(":id")
  @Roles(UserRole.SUPER_ADMIN)
  async delete(@Param("id", ParseUUIDPipe) id: string) {
    return this.usersService.softDelete(id);
  }

  @Post("me/change-password")
  // Per-user rate limit (en plus du per-IP global) — empêche un attaquant
  // qui possède une session valide de bruteforcer l'ancien mot de passe.
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      user.id,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("avatar", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(AVATAR_STORAGE_PATH)) {
            fs.mkdirSync(AVATAR_STORAGE_PATH, { recursive: true });
          }
          cb(null, AVATAR_STORAGE_PATH);
        },
        filename: (req: any, file, cb) => {
          const userId = req.user?.id || "unknown";
          const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
          cb(null, `${userId}${ext}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              "Seuls les fichiers JPG, PNG et WebP sont acceptés (max 2 Mo)",
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException("Aucun fichier fourni");
    }

    // Vérification des magic bytes (le fichier a déjà été écrit à ce stade
    // par diskStorage, on le supprime immédiatement si l'entête ne matche pas
    // une vraie image — cela bloque le spoofing de mimetype type `malware.exe`
    // renommé en `.jpg`). On ne lit que les 12 premiers octets.
    try {
      const fd = fs.openSync(file.path, "r");
      const head = Buffer.alloc(12);
      fs.readSync(fd, head, 0, 12, 0);
      fs.closeSync(fd);

      const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      const isPng =
        head[0] === 0x89 &&
        head[1] === 0x50 &&
        head[2] === 0x4e &&
        head[3] === 0x47 &&
        head[4] === 0x0d &&
        head[5] === 0x0a &&
        head[6] === 0x1a &&
        head[7] === 0x0a;
      const isWebp =
        head[0] === 0x52 &&
        head[1] === 0x49 &&
        head[2] === 0x46 &&
        head[3] === 0x46 &&
        head[8] === 0x57 &&
        head[9] === 0x45 &&
        head[10] === 0x42 &&
        head[11] === 0x50;

      if (!isJpeg && !isPng && !isWebp) {
        fs.unlinkSync(file.path);
        throw new BadRequestException(
          "Le fichier n'est pas une image valide (signature binaire non reconnue)",
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // Si la vérification elle-même échoue, on refuse par sécurité
      try {
        fs.unlinkSync(file.path);
      } catch {}
      throw new BadRequestException("Échec de la validation de l'image");
    }

    // Remove old avatars with different extensions
    const extensions = [".jpg", ".jpeg", ".png", ".webp"];
    for (const ext of extensions) {
      const oldFile = path.join(AVATAR_STORAGE_PATH, `${user.id}${ext}`);
      if (oldFile !== file.path && fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile);
      }
    }

    const avatarUrl = `/storage/avatars/${file.filename}`;
    await this.usersService.updateAvatarUrl(user.id, avatarUrl);
    return { avatarUrl };
  }

  @Post("me/gdpr-export")
  @HttpCode(200)
  // RGPD : 1 export par utilisateur par heure max — protège contre l'abus
  // (génère un dump complet des données perso, coûteux côté DB).
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 1, ttl: 3600000 } })
  async requestGdprExport(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    if (!user?.id) {
      throw new BadRequestException("User context missing");
    }
    const data = await this.usersService.requestGdprExport(user.id);
    const json = JSON.stringify(data, null, 2);
    const buf = Buffer.from(json, "utf-8");
    const date = new Date().toISOString().split("T")[0];

    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-rgpd-${date}.json"`,
      "Content-Length": buf.length.toString(),
    });
    res.end(buf);
  }

  @Post(":id/reset-password")
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(id, dto.newPassword);
  }

  // ── Multi-departments ──────────────────────────────────────────────

  @Get(":id/departments")
  @Roles(UserRole.ADMIN)
  async getUserDepartments(@Param("id", ParseUUIDPipe) id: string) {
    const data = await this.usersService.getUserDepartments(id);
    return { data };
  }

  @Post(":id/departments")
  @Roles(UserRole.ADMIN)
  async addUserDepartment(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { departmentId: string },
  ) {
    if (!body.departmentId)
      throw new BadRequestException("departmentId is required");
    return this.usersService.addUserDepartment(id, body.departmentId);
  }

  @Delete(":id/departments/:departmentId")
  @Roles(UserRole.ADMIN)
  async removeUserDepartment(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("departmentId", ParseUUIDPipe) departmentId: string,
  ) {
    return this.usersService.removeUserDepartment(id, departmentId);
  }

  @Put(":id/departments")
  @Roles(UserRole.ADMIN)
  async updateUserDepartments(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { departmentIds: string[] },
  ) {
    if (!Array.isArray(body.departmentIds)) {
      throw new BadRequestException("departmentIds must be an array");
    }
    return this.usersService.updateUserDepartments(id, body.departmentIds);
  }

  // ── SpaceAccessConfig (USER scope) ──────────────────────────────────

  @Get(":id/space-access")
  @Roles(UserRole.ADMIN)
  async getUserSpaceAccess(@Param("id", ParseUUIDPipe) id: string) {
    const [configs, modules] = await Promise.all([
      this.usersService.getUserSpaceAccessConfigs(id),
      this.usersService.getAllModules(),
    ]);
    return { data: configs, modules };
  }

  @Post(":id/space-access")
  @Roles(UserRole.ADMIN)
  async setUserSpaceAccess(
    @Param("id", ParseUUIDPipe) id: string,
    @Body()
    body: {
      module: string;
      enabled: boolean;
      config?: Record<string, unknown>;
    },
  ) {
    if (!body.module) throw new BadRequestException("module is required");
    if (typeof body.enabled !== "boolean")
      throw new BadRequestException("enabled must be a boolean");
    return this.usersService.setUserSpaceAccess(
      id,
      body.module,
      body.enabled,
      body.config,
    );
  }

  @Delete(":id/space-access/:module")
  @Roles(UserRole.ADMIN)
  async deleteUserSpaceAccess(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("module") module: string,
  ) {
    return this.usersService.deleteUserSpaceAccess(id, module);
  }
}
