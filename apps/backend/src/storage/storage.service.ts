import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly basePath: string;

  constructor() {
    this.basePath = process.env.STORAGE_PATH || path.join(process.cwd(), "storage");
    this.ensureDirectory(this.basePath);
    if (!process.env.STORAGE_SECRET) {
      this.logger.warn("STORAGE_SECRET not set — using insecure default. Set this in production!");
    }
  }

  private ensureDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async upload(
    file: Express.Multer.File,
    directory: string,
  ): Promise<{ filePath: string; fileUrl: string }> {
    const targetDir = path.join(this.basePath, directory);
    this.ensureDirectory(targetDir);

    const ext = path.extname(file.originalname);
    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(targetDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    const fileUrl = `/storage/${directory}/${filename}`;
    this.logger.log(`File uploaded: ${fileUrl}`);

    return { filePath, fileUrl };
  }

  async generateChecksum(file: Express.Multer.File): Promise<string> {
    const hash = crypto.createHash("sha256");
    hash.update(file.buffer);
    return hash.digest("hex");
  }

  async generateSignedUrl(fileUrl: string, expiresInSeconds: number = 3600): Promise<string> {
    const expires = Date.now() + expiresInSeconds * 1000;
    const signature = crypto
      .createHmac("sha256", process.env.STORAGE_SECRET || "storage-secret-change-me")
      .update(`${fileUrl}:${expires}`)
      .digest("hex");

    return `${fileUrl}?expires=${expires}&signature=${signature}`;
  }

  getFilePath(fileUrl: string): string {
    const relativePath = fileUrl.replace(/^\/storage\//, "");
    // Confinement défensif : le chemin résolu doit rester sous basePath.
    // Empêche tout futur appelant de sortir du dossier de stockage via un
    // fileUrl contrôlé (path traversal `../`), même si aucun appelant actuel
    // ne passe de fileUrl issu d'une requête HTTP.
    const resolved = path.resolve(this.basePath, relativePath);
    const baseResolved = path.resolve(this.basePath);
    if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
      throw new NotFoundException("Invalid file path");
    }
    return resolved;
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const filePath = this.getFilePath(fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`File deleted: ${fileUrl}`);
    }
  }

  validateSignedUrl(signedUrl: string): { valid: boolean; fileUrl: string } {
    const url = new URL(signedUrl, "http://localhost");
    const expires = url.searchParams.get("expires");
    const signature = url.searchParams.get("signature");
    const fileUrl = url.pathname;

    if (!expires || !signature) {
      return { valid: false, fileUrl: "" };
    }

    const expiresNum = parseInt(expires, 10);
    if (Date.now() > expiresNum) {
      return { valid: false, fileUrl: "" };
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.STORAGE_SECRET || "storage-secret-change-me")
      .update(`${fileUrl}:${expires}`)
      .digest("hex");

    // Comparaison en temps constant (évite une timing attack sur la signature HMAC).
    const signatureBuf = Buffer.from(signature);
    const expectedSigBuf = Buffer.from(expectedSig);
    if (
      signatureBuf.length !== expectedSigBuf.length ||
      !crypto.timingSafeEqual(signatureBuf, expectedSigBuf)
    ) {
      return { valid: false, fileUrl: "" };
    }

    return { valid: true, fileUrl };
  }

  getFileStream(fileUrl: string): fs.ReadStream {
    const filePath = this.getFilePath(fileUrl);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File not found: ${filePath}`);
    }
    return fs.createReadStream(filePath);
  }
}
