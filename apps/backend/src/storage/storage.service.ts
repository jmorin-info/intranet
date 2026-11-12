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
    return this.storeBuffer(file.buffer, file.originalname, directory);
  }

  async storeBuffer(buffer: Buffer, originalName: string, directory: string): Promise<{ filePath: string; fileUrl: string }> {
    const targetDir = this.getFilePath(`/storage/${directory}`);
    await fs.promises.mkdir(targetDir, { recursive: true });
    const [realBase, realTarget] = await Promise.all([
      fs.promises.realpath(this.basePath), fs.promises.realpath(targetDir),
    ]);
    if (realTarget !== realBase && !realTarget.startsWith(realBase + path.sep)) {
      throw new NotFoundException("Invalid storage directory");
    }
    const candidate = path.extname(originalName).toLowerCase();
    const ext = /^\.[a-z0-9]{1,10}$/.test(candidate) ? candidate : ".bin";
    const filename = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(realTarget, filename);
    await fs.promises.writeFile(filePath, buffer, { flag: "wx", mode: 0o600 });
    return { filePath, fileUrl: `/storage/${directory}/${filename}` };
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

    const token = Buffer.from(fileUrl, "utf8").toString("base64url");
    return `/storage/download/${token}?expires=${expires}&signature=${signature}`;
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
    // Existing parents may be symlinks, including before the final file exists.
    let ancestor = resolved;
    while (!fs.existsSync(ancestor) && ancestor !== baseResolved) ancestor = path.dirname(ancestor);
    const realBase = fs.realpathSync(baseResolved);
    const realAncestor = fs.realpathSync(ancestor);
    if (realAncestor !== realBase && !realAncestor.startsWith(realBase + path.sep)) {
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
    let fileUrl = url.pathname;
    if (fileUrl.startsWith("/storage/download/")) {
      const token = fileUrl.slice("/storage/download/".length);
      if (!/^[A-Za-z0-9_-]{1,2048}$/.test(token)) return { valid: false, fileUrl: "" };
      fileUrl = Buffer.from(token, "base64url").toString("utf8");
      if (Buffer.from(fileUrl, "utf8").toString("base64url") !== token) return { valid: false, fileUrl: "" };
    }
    if (!fileUrl.startsWith("/storage/") || /[\\\0?#]/.test(fileUrl)) return { valid: false, fileUrl: "" };
    try { this.getFilePath(fileUrl); } catch { return { valid: false, fileUrl: "" }; }

    if (!expires || !signature) {
      return { valid: false, fileUrl: "" };
    }

    const expiresNum = Number(expires);
    if (!/^\d+$/.test(expires) || !Number.isSafeInteger(expiresNum) || Date.now() >= expiresNum) {
      return { valid: false, fileUrl: "" };
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.STORAGE_SECRET || "storage-secret-change-me")
      .update(`${fileUrl}:${expires}`)
      .digest("hex");

    // Comparaison en temps constant (évite une timing attack sur la signature HMAC).
    if (!/^[a-f0-9]{64}$/i.test(signature)) return { valid: false, fileUrl: "" };
    const signatureBuf = Buffer.from(signature, "hex");
    const expectedSigBuf = Buffer.from(expectedSig, "hex");
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
