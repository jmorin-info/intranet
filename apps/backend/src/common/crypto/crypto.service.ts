import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";

/**
 * Chiffrement symétrique (AES-256-GCM) pour les secrets persistés en base
 * (tokens OAuth Google/Outlook, ...). Utilisé par les modules calendar /
 * WebDAV pour ne JAMAIS stocker de credentials en clair.
 *
 * Format du chiffré (string base64) :
 *   v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 *
 * La clé maître provient de la variable d'env `CRYPTO_SECRET` (32 bytes
 * minimum, 64 chars hex recommandé). Si absente, on dérive un fallback
 * déterministe depuis `JWT_ACCESS_SECRET` pour ne pas casser le bootstrap
 * en dev — un warn est loggé. En prod, `CRYPTO_SECRET` est obligatoire :
 * voir docs/integrations/CALENDAR_SYNC.md.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const raw =
      process.env.CRYPTO_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      "fallback-development-only-do-not-use-in-prod";

    if (!process.env.CRYPTO_SECRET) {
      this.logger.warn(
        "CRYPTO_SECRET not set — derived from JWT_ACCESS_SECRET as fallback. Set CRYPTO_SECRET in prod (32+ bytes).",
      );
    }

    // SHA-256 sur la valeur fournie pour obtenir une clé de 32 bytes
    // exactement (requis par AES-256-GCM). Idempotent — si l'admin fournit
    // déjà 32 bytes, le hash en redonne 32 bytes uniformes.
    this.key = crypto.createHash("sha256").update(raw, "utf8").digest();
  }

  /**
   * Chiffre une chaîne UTF-8 et retourne `v1:<iv>:<tag>:<ciphertext>` en base64.
   * Lève une erreur si l'entrée est null/undefined (utiliser encryptOptional sinon).
   */
  encrypt(plaintext: string): string {
    if (typeof plaintext !== "string") {
      throw new TypeError("encrypt(): expected string input");
    }
    const iv = crypto.randomBytes(12); // GCM standard nonce length
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      "v1",
      iv.toString("base64"),
      tag.toString("base64"),
      enc.toString("base64"),
    ].join(":");
  }

  encryptOptional(plaintext: string | null | undefined): string | null {
    if (plaintext == null || plaintext === "") return null;
    return this.encrypt(plaintext);
  }

  /**
   * Déchiffre une valeur produite par {@link encrypt}. Retourne le clair UTF-8.
   * Lève si la valeur est altérée (tag GCM invalide) ou de format inconnu.
   */
  decrypt(payload: string): string {
    if (typeof payload !== "string" || !payload.startsWith("v1:")) {
      throw new Error("Invalid ciphertext format (missing v1: prefix)");
    }
    const parts = payload.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid ciphertext format (expected v1:iv:tag:ct)");
    }
    const [, ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64!, "base64");
    const tag = Buffer.from(tagB64!, "base64");
    const ct = Buffer.from(ctB64!, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    return dec.toString("utf8");
  }

  decryptOptional(payload: string | null | undefined): string | null {
    if (payload == null || payload === "") return null;
    return this.decrypt(payload);
  }

  /**
   * Génère un token aléatoire de 32 bytes (256 bits), encodé base64url.
   * Utilisé pour les tokens d'API longue durée (WebDAV, abonnements iCal).
   */
  generateRandomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString("base64url");
  }

  /**
   * Hache un secret pour stockage (sha256 hex). Comparaison à temps constant
   * via {@link verifyHash}.
   */
  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
  }

  /**
   * Compare un token clair contre un hash sha256, à temps constant.
   */
  verifyHash(token: string, hash: string): boolean {
    if (
      typeof token !== "string" ||
      typeof hash !== "string" ||
      hash.length !== 64
    ) {
      return false;
    }
    const computed = this.hashToken(token);
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
