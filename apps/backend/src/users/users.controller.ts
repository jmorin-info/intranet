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
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  ForbiddenException,
  HttpCode,
} from "@nestjs/common";
import { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import * as path from "path";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { UserThrottlerGuard } from "../auth/guards/user-throttler.guard";
import { UserThrottle } from "../auth/decorators/user-throttle.decorator";
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
import { packageGdprExport } from "./gdpr-export-packager";
import type { GdprPdfPayload } from "./gdpr-export-pdf";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, publishAvatar } from "./avatar-upload";
import { AvatarUploadGuard, type AvatarRequest } from "./avatar-upload.guard";
import { AVATAR_ABORT_SIGNAL } from "./avatar-budget";

const AVATAR_STORAGE_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "storage",
  "avatars",
);

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
    const rows = result.data;

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
  async findById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    // ANSSI A.5.15 — un utilisateur authentifié ne peut consulter le profil
    // complet (manager, subordinates, departmentMemberships) que de lui-même.
    // Pour les autres profils, l'annuaire `GET /users/directory` expose les
    // champs sûrs (id, nom, email, département, jobTitle, avatar). Sans cette
    // garde, n'importe quel user authentifié pouvait énumérer l'organigramme
    // complet via cet endpoint (IDOR).
    const isSelf = user.id === id;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException(
        "Profil détaillé réservé au propriétaire ou à un administrateur — utilisez /users/directory",
      );
    }
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
  @UseGuards(UserThrottlerGuard, AvatarUploadGuard)
  @UserThrottle({ limit: 5, ttl: 60_000 })
  @UseInterceptors(
    FileInterceptor("avatar", {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 },
      fileFilter: (_req, file, cb) => {
        if (!AVATAR_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException("Seuls les fichiers JPG, PNG et WebP sont acceptés (max 2 Mo)"),
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
    @Req() request?: AvatarRequest,
  ) {
    return publishAvatar(
      user.id,
      file,
      {
        readCurrentAvatar: async () => {
          const current = await this.usersService.findById(user.id);
          return current.avatarUrl ?? null;
        },
        saveAvatar: (avatarUrl) => this.usersService.updateAvatarUrl(user.id, avatarUrl),
      },
      { storagePath: AVATAR_STORAGE_PATH, signal: request?.[AVATAR_ABORT_SIGNAL] },
    );
  }

  @Post("me/gdpr-export")
  @HttpCode(200)
  // RGPD : 1 export par utilisateur par heure max — protège contre l'abus
  // (génère un dump complet des données perso, coûteux côté DB).
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 1, ttl: 60 * 60_000 })
  async requestGdprExport(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    if (!user?.id) {
      throw new BadRequestException("User context missing");
    }
    const data = await this.usersService.requestGdprExport(user.id);

    // Package the payload as a ZIP archive containing:
    //  - data.json     (machine-readable, legal source of truth, unchanged)
    //  - rapport.pdf   (human-readable summary, SEAL charter)
    //  - audit-logs.csv (full audit logs for spreadsheet apps)
    //  - README.txt    (explanations + integrity verification instructions)
    const zip = await packageGdprExport(data as unknown as GdprPdfPayload);

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zip.fileName}"`,
      "Content-Length": zip.byteLength.toString(),
      // Expose the data.json hash for clients that want to verify integrity
      // without opening the PDF/README.
      "X-Gdpr-Data-Sha256": zip.dataJsonHash,
    });
    res.end(zip.buffer);
  }

  @Post(":id/reset-password")
  @Roles(UserRole.ADMIN)
  // Anti-abus admin : 3 resets/h par admin authentifié — un admin légitime
  // ne reset jamais 3 mots de passe par heure ; au-delà c'est probablement
  // un compte compromis. Tracker = req.user.id (admin), pas la cible.
  @UseGuards(UserThrottlerGuard)
  @UserThrottle({ limit: 3, ttl: 60 * 60_000 })
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
