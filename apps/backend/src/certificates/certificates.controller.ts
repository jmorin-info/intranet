import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import * as fs from "fs";
import * as path from "path";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CertificatesService } from "./certificates.service";
import { CreateCertificateDto } from "./dto/create-certificate.dto";
import { UpdateCertificateDto } from "./dto/update-certificate.dto";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";

const UPLOAD_PATH = path.join(process.cwd(), "uploads", "certificates");

@Controller("certificates")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  private setUploadMetadata(dto: CreateCertificateDto | UpdateCertificateDto, file?: Express.Multer.File) {
    // Disk locations only come from Multer, never from caller-supplied JSON fields.
    delete dto.fileUrl;
    delete dto.fileName;
    delete dto.fileSizeBytes;
    if (file) {
      dto.fileUrl = `/uploads/certificates/${file.filename}`;
      dto.fileName = file.originalname;
      dto.fileSizeBytes = file.size;
    }
  }

  @Get("my")
  @Roles(UserRole.COLLABORATEUR)
  findMy(@CurrentUser() user: RequestUser) {
    return this.certificatesService.findMy(user.id);
  }

  @Post("my")
  @Roles(UserRole.COLLABORATEUR)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(UPLOAD_PATH)) {
            fs.mkdirSync(UPLOAD_PATH, { recursive: true });
          }
          cb(null, UPLOAD_PATH);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async createMy(
    @Body() dto: CreateCertificateDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    this.setUploadMetadata(dto, file);
    const cert = await this.certificatesService.createMy(dto, user);
    if (file) {
      await this.certificatesService.regenerateThumbnailForCert(
        cert.id,
        dto.fileUrl,
        file.mimetype,
      );
    }
    return cert;
  }

  @Patch("my/:id")
  @Roles(UserRole.COLLABORATEUR)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(UPLOAD_PATH)) {
            fs.mkdirSync(UPLOAD_PATH, { recursive: true });
          }
          cb(null, UPLOAD_PATH);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async updateMy(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificateDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    this.setUploadMetadata(dto, file);
    const cert = await this.certificatesService.updateMy(id, dto, user);
    if (file) {
      await this.certificatesService.regenerateThumbnailForCert(
        cert.id,
        dto.fileUrl,
        file.mimetype,
      );
    }
    return cert;
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll(
    @Query("userId") userId?: string,
    @Query("externalPersonId") externalPersonId?: string,
    @Query("certType") certType?: string,
    @Query("status") status?: "valid" | "expired" | "all",
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.certificatesService.findAll({
      userId,
      externalPersonId,
      certType,
      status,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get("stats")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getStats() {
    return this.certificatesService.getStats();
  }

  @Get("expiring")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findExpiring() {
    return this.certificatesService.findExpiring();
  }

  @Get(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.certificatesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(UPLOAD_PATH)) {
            fs.mkdirSync(UPLOAD_PATH, { recursive: true });
          }
          cb(null, UPLOAD_PATH);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async create(
    @Body() dto: CreateCertificateDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    this.setUploadMetadata(dto, file);
    const cert = await this.certificatesService.create(dto, user.id);
    if (file) {
      await this.certificatesService.regenerateThumbnailForCert(
        cert.id,
        dto.fileUrl,
        file.mimetype,
      );
    }
    return cert;
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(UPLOAD_PATH)) {
            fs.mkdirSync(UPLOAD_PATH, { recursive: true });
          }
          cb(null, UPLOAD_PATH);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificateDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    this.setUploadMetadata(dto, file);
    const cert = await this.certificatesService.update(id, dto, user.id);
    if (file) {
      await this.certificatesService.regenerateThumbnailForCert(
        cert.id,
        dto.fileUrl,
        file.mimetype,
      );
    }
    return cert;
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.remove(id, user.id);
  }

  @Post(":id/upload")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          if (!fs.existsSync(UPLOAD_PATH)) {
            fs.mkdirSync(UPLOAD_PATH, { recursive: true });
          }
          cb(null, UPLOAD_PATH);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    }),
  )
  async uploadFile(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException("No file provided");
    }

    const fileUrl = `/uploads/certificates/${file.filename}`;
    const cert = await this.certificatesService.updateFile(
      id,
      fileUrl,
      file.originalname,
      file.size,
      user.id,
    );
    await this.certificatesService.regenerateThumbnailForCert(
      cert.id,
      fileUrl,
      file.mimetype,
    );
    return cert;
  }

  @Get(":id/download")
  @Roles(UserRole.COLLABORATEUR)
  async downloadFile(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.certificatesService.getFileForUser(id, user);
    res.set({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    });
    res.download(file.path, file.name);
  }

  @Get(":id/thumbnail")
  @Roles(UserRole.COLLABORATEUR)
  async thumbnail(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.certificatesService.getFileForUser(id, user, true);
    res.set({
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    });
    res.sendFile(file.path);
  }
}
