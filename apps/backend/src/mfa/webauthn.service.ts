import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type GenerateRegistrationOptionsOpts,
  type VerifyRegistrationResponseOpts,
  type VerifyAuthenticationResponseOpts,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CacheService } from "../common/cache/cache.service";

/**
 * WebAuthn / FIDO2 service.
 *
 * Gère l'enrôlement et l'authentification de clés de sécurité matérielles
 * (YubiKey, NFC) ou biométriques (Touch ID, Windows Hello, passkeys
 * iCloud/Google).
 *
 * ISO 27001 A.8.5 — authentification phishing-resistant.
 *
 * Compat TOTP : OR — un compte peut avoir TOTP ET WebAuthn, l'un ou l'autre
 * valide la session (jamais AND, sauf politique admin explicite).
 *
 * Challenges (registration + authentication) sont stockés en Redis avec TTL
 * 5 min via CacheService — le challenge ne doit JAMAIS être stocké en DB
 * ni en JWT (ANSSI R28, replay-protection).
 */
@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);
  // TTL des challenges en Redis (5 min — RFC 8555 / ANSSI).
  private readonly CHALLENGE_TTL_SECONDS = 5 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cache: CacheService,
  ) {}

  /** Origin attendue (cookie SameSite). Lecture lazy pour pickup des env vars. */
  private get rpID(): string {
    // Le rpID DOIT être un domaine valide (pas d'URL complète, pas de port).
    // Fallback dev "localhost" pour les tests locaux.
    if (process.env.WEBAUTHN_RP_ID) return process.env.WEBAUTHN_RP_ID;
    const appUrl = process.env.APP_URL || "http://localhost:3001";
    try {
      return new URL(appUrl).hostname;
    } catch {
      return "localhost";
    }
  }

  private get rpName(): string {
    return (
      process.env.WEBAUTHN_RP_NAME ||
      process.env.APP_NAME ||
      "OMNITECH Intranet"
    );
  }

  private get expectedOrigin(): string | string[] {
    // Origins multiples possibles si WEBAUTHN_ORIGINS="https://a.fr,https://b.fr"
    const envOrigins = process.env.WEBAUTHN_ORIGINS;
    if (envOrigins) {
      return envOrigins.split(",").map((o) => o.trim()).filter(Boolean);
    }
    return process.env.APP_URL || "http://localhost:3001";
  }

  private regKey(userId: string): string {
    return `webauthn:reg:${userId}`;
  }

  private authKey(userId: string): string {
    return `webauthn:auth:${userId}`;
  }

  /**
   * Étape 1 inscription — génère les options à passer à
   * `navigator.credentials.create()` côté browser.
   */
  async generateRegistrationOptions(
    userId: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException("User not found");

    // Récupère les credentials existants pour les exclure (évite réenregistrer
    // la même clé).
    const existing = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    const opts: GenerateRegistrationOptionsOpts = {
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      // Algorithmes COSE recommandés : ES256 (-7), RS256 (-257).
      supportedAlgorithmIDs: [-7, -257],
      // Empêche d'enrôler 2 fois la même clé.
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: (c.transports as AuthenticatorTransportFuture[]) ?? [],
      })),
      authenticatorSelection: {
        // Accepte les deux : clés USB/NFC ET authentificateurs intégrés.
        residentKey: "preferred",
        userVerification: "preferred",
      },
      attestationType: "none",
    };

    const options = await generateRegistrationOptions(opts);

    await this.cache.set(this.regKey(userId), options.challenge, this.CHALLENGE_TTL_SECONDS);

    return options;
  }

  /**
   * Étape 2 inscription — vérifie la réponse `navigator.credentials.create()`
   * et persiste la clé publique. Le challenge Redis est consommé (one-time).
   */
  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    label?: string,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ id: string; label: string | null }> {
    const expectedChallenge = await this.cache.get<string>(this.regKey(userId));
    if (!expectedChallenge) {
      throw new BadRequestException(
        "Challenge expiré ou manquant — relancez l'enrôlement",
      );
    }

    const opts: VerifyRegistrationResponseOpts = {
      response,
      expectedChallenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.rpID,
      requireUserVerification: false,
    };

    let verification;
    try {
      verification = await verifyRegistrationResponse(opts);
    } catch (err) {
      this.logger.warn(
        `WebAuthn registration verification failed for user ${userId}: ${err instanceof Error ? err.message : err}`,
      );
      this.auditWarn(userId, "WEBAUTHN_REGISTER_FAILED", ctx, {
        reason: err instanceof Error ? err.message : "unknown",
      });
      throw new BadRequestException("Vérification WebAuthn échouée");
    }

    if (!verification.verified || !verification.registrationInfo) {
      this.auditWarn(userId, "WEBAUTHN_REGISTER_FAILED", ctx, {
        reason: "not_verified",
      });
      throw new BadRequestException("Enrôlement WebAuthn invalide");
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Consomme le challenge (one-time use).
    await this.cache.del(this.regKey(userId));

    // Persiste la clé. credentialID est en base64url côté simplewebauthn v13.
    const created = await this.prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: (credential.transports as string[]) ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        label: label?.trim() || null,
      },
      select: { id: true, label: true },
    });

    this.logger.log(
      `WebAuthn credential registered for user ${userId} (id=${created.id}, deviceType=${credentialDeviceType})`,
    );
    this.auditWarn(userId, "WEBAUTHN_REGISTERED", ctx, {
      credentialId: created.id,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });

    return created;
  }

  /**
   * Étape 1 authentification — génère les options à passer à
   * `navigator.credentials.get()`. Si `userId` connu, restreint aux
   * credentials de cet utilisateur (allowCredentials), sinon discoverable.
   */
  async generateAuthenticationOptions(
    userId: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });

    if (credentials.length === 0) {
      throw new NotFoundException("Aucune clé WebAuthn enregistrée");
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: "preferred",
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        transports: (c.transports as AuthenticatorTransportFuture[]) ?? [],
      })),
    });

    await this.cache.set(this.authKey(userId), options.challenge, this.CHALLENGE_TTL_SECONDS);

    return options;
  }

  /**
   * Étape 2 authentification — vérifie la signature, met à jour le compteur
   * anti-clonage, et retourne {verified:true} si OK. Le caller doit ensuite
   * propager la session (mfaValidatedAt comme pour TOTP).
   */
  async verifyAuthentication(
    userId: string,
    response: AuthenticationResponseJSON,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<{ verified: boolean; credentialId: string }> {
    const expectedChallenge = await this.cache.get<string>(this.authKey(userId));
    if (!expectedChallenge) {
      throw new BadRequestException(
        "Challenge expiré ou manquant — relancez l'authentification",
      );
    }

    const dbCredential = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!dbCredential || dbCredential.userId !== userId) {
      this.auditWarn(userId, "WEBAUTHN_AUTH_FAILED", ctx, {
        reason: "credential_not_found",
      });
      throw new UnauthorizedException("Clé WebAuthn inconnue");
    }

    const opts: VerifyAuthenticationResponseOpts = {
      response,
      expectedChallenge,
      expectedOrigin: this.expectedOrigin,
      expectedRPID: this.rpID,
      credential: {
        id: dbCredential.credentialId,
        publicKey: new Uint8Array(dbCredential.publicKey),
        counter: dbCredential.counter,
        transports:
          (dbCredential.transports as AuthenticatorTransportFuture[]) ?? [],
      },
      requireUserVerification: false,
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse(opts);
    } catch (err) {
      this.logger.warn(
        `WebAuthn auth verification failed for user ${userId}: ${err instanceof Error ? err.message : err}`,
      );
      this.auditWarn(userId, "WEBAUTHN_AUTH_FAILED", ctx, {
        reason: err instanceof Error ? err.message : "unknown",
      });
      throw new UnauthorizedException("Vérification WebAuthn échouée");
    }

    if (!verification.verified) {
      this.auditWarn(userId, "WEBAUTHN_AUTH_FAILED", ctx, {
        reason: "not_verified",
      });
      throw new UnauthorizedException("Signature WebAuthn invalide");
    }

    // Anti-clonage : si le compteur retourné est <= compteur stocké et != 0,
    // la clé a probablement été clonée. On loggue WARN mais on continue
    // (certains authentificateurs ne maintiennent pas de compteur — toujours 0).
    const newCounter = verification.authenticationInfo.newCounter;
    if (
      dbCredential.counter > 0 &&
      newCounter > 0 &&
      newCounter <= dbCredential.counter
    ) {
      this.logger.error(
        `WebAuthn counter regression for user ${userId} cred ${dbCredential.id} (old=${dbCredential.counter}, new=${newCounter}) — possible cloned key`,
      );
      this.auditWarn(userId, "WEBAUTHN_COUNTER_REGRESSION", ctx, {
        credentialId: dbCredential.id,
        oldCounter: dbCredential.counter,
        newCounter,
      });
    }

    await this.prisma.webAuthnCredential.update({
      where: { id: dbCredential.id },
      data: {
        counter: newCounter,
        lastUsedAt: new Date(),
      },
    });

    await this.cache.del(this.authKey(userId));

    this.auditService
      .log({
        userId,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
        action: "WEBAUTHN_AUTH_SUCCESS",
        resourceType: "User",
        resourceId: userId,
        metadata: { credentialId: dbCredential.id },
        severity: "INFO",
      })
      .catch((err) =>
        this.logger.error(`Audit log failed (WEBAUTHN_AUTH_SUCCESS): ${err.message}`),
      );

    return { verified: true, credentialId: dbCredential.id };
  }

  async listCredentials(userId: string) {
    return this.prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        deviceType: true,
        backedUp: true,
        transports: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async deleteCredential(
    userId: string,
    credentialDbId: string,
    ctx?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const cred = await this.prisma.webAuthnCredential.findUnique({
      where: { id: credentialDbId },
      select: { id: true, userId: true, label: true },
    });
    if (!cred || cred.userId !== userId) {
      throw new NotFoundException("Clé WebAuthn introuvable");
    }
    await this.prisma.webAuthnCredential.delete({ where: { id: cred.id } });
    this.logger.log(
      `WebAuthn credential ${cred.id} (label=${cred.label ?? "—"}) deleted for user ${userId}`,
    );
    this.auditWarn(userId, "WEBAUTHN_DELETED", ctx, {
      credentialId: cred.id,
      label: cred.label,
    });
  }

  /**
   * True si l'utilisateur a au moins une clé WebAuthn enregistrée.
   * Utilisé par l'auth flow pour proposer le bouton "Utiliser ma clé".
   */
  async hasCredentials(userId: string): Promise<boolean> {
    const count = await this.prisma.webAuthnCredential.count({
      where: { userId },
    });
    return count > 0;
  }

  private auditWarn(
    userId: string,
    action: string,
    ctx?: { ip?: string; userAgent?: string },
    metadata?: Record<string, unknown>,
  ) {
    this.auditService
      .log({
        userId,
        ipAddress: ctx?.ip,
        userAgent: ctx?.userAgent,
        action,
        resourceType: "User",
        resourceId: userId,
        metadata,
        severity: "WARN",
      })
      .catch((err) =>
        this.logger.error(`Audit log failed (${action}): ${err.message}`),
      );
  }
}
