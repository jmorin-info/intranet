import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { FileserverService } from "./fileserver.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { AuthenticateFileserverDto, CreateFolderDto } from "./dto/authenticate-fileserver.dto";
import * as path from "path";

// Accès aux partages SMB internes (Samba/NAS). Sensible : un prestataire
// externe ne doit pas pouvoir parcourir ni uploader sur les partages
// internes OMNITECH. Réservé COLLABORATEUR+ ; les routes sensibles
// (download fichiers spécifiques) conservent leurs checks fonctionnels.
@Controller("fileserver")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COLLABORATEUR)
export class FileserverController {
  constructor(private readonly fileserverService: FileserverService) {}

  @Get("shares")
  getShares(@CurrentUser() user: RequestUser) {
    return {
      shares: this.fileserverService.getShares(user.role),
      authenticated: this.fileserverService.hasCredentials(user.id),
    };
  }

  @Get("auth-status")
  getAuthStatus(@CurrentUser() user: RequestUser) {
    return { authenticated: this.fileserverService.hasCredentials(user.id) };
  }

  @Post("authenticate")
  async authenticate(@Body() body: AuthenticateFileserverDto, @CurrentUser() user: RequestUser) {
    const smbUser = body.username.includes("@")
      ? body.username
      : `${body.username}@omnitech.security`;
    const valid = await this.fileserverService.verifyCredentials(smbUser, body.password);
    if (!valid) {
      return { success: false, message: "Identifiants invalides" };
    }
    this.fileserverService.storeCredentials(user.id, smbUser, body.password);
    return { success: true, message: "Authentification réussie" };
  }

  @Get("list/:share")
  listFiles(
    @Param("share") share: string,
    @Query("path") dirPath: string,
    @CurrentUser() user: RequestUser,
  ) {
    const safeShare = FileserverService.validateShareName(share);
    const safeDir = FileserverService.validateSafePath(dirPath || "");
    return this.fileserverService.listFiles(safeShare, safeDir, user.role, user.id);
  }

  @Get("download/:share")
  downloadFile(
    @Param("share") share: string,
    @Query("path") filePath: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const safeShare = FileserverService.validateShareName(share);
    const safeFilePath = FileserverService.validateSafePath(filePath);
    if (!safeFilePath) {
      // A download always needs a file path
      throw new BadRequestException("Invalid path");
    }
    const data = this.fileserverService.downloadFile(safeShare, safeFilePath, user.role, user.id);
    const fileName = path.basename(safeFilePath);
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Content-Length": data.length,
    });
    res.send(data);
  }

  @Post("upload/:share")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        // Block executable/script extensions regardless of MIME
        const BLOCKED_EXTENSIONS =
          /\.(exe|bat|cmd|ps1|sh|msi|dll|com|scr|vbs|vbe|wsf|wsh|cgi|php|py|rb|pl|jar|war|reg|inf|hta|pif|lnk)$/i;
        if (BLOCKED_EXTENSIONS.test(file.originalname)) {
          return cb(
            new BadRequestException(
              `Extension de fichier interdite : ${path.extname(file.originalname)}`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(
    @Param("share") share: string,
    @Query("path") dirPath: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    const safeShare = FileserverService.validateShareName(share);
    const safeDir = FileserverService.validateSafePath(dirPath || "");
    this.fileserverService.uploadFile(
      safeShare,
      safeDir,
      file.originalname,
      file.buffer,
      user.role,
      user.id,
    );
    return { message: "Fichier uploadé", filename: file.originalname };
  }

  @Delete("file/:share")
  deleteFile(
    @Param("share") share: string,
    @Query("path") filePath: string,
    @CurrentUser() user: RequestUser,
  ) {
    const safeShare = FileserverService.validateShareName(share);
    const safeFilePath = FileserverService.validateSafePath(filePath);
    if (!safeFilePath) {
      throw new BadRequestException("Invalid path");
    }
    return this.fileserverService.deleteFile(safeShare, safeFilePath, user.role, user.id);
  }

  @Post("mkdir/:share")
  createFolder(
    @Param("share") share: string,
    @Body() body: CreateFolderDto,
    @CurrentUser() user: RequestUser,
  ) {
    const safeShare = FileserverService.validateShareName(share);
    const safeDir = FileserverService.validateSafePath(body?.path || "");
    return this.fileserverService.createFolder(safeShare, safeDir, body.name, user.role, user.id);
  }
}
