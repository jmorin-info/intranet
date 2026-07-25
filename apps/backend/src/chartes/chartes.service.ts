import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { NotificationType, UserRole } from "@prisma/client";
import { slugify, generateUniqueSlug } from "../common/utils/slugify";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class ChartesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // List all chartes with their active version and signature count.
  // Si `userId` est fourni, on rajoute `signedAt` (date de signature par cet
  // utilisateur sur la version active) afin que le frontend (ex: page profil)
  // puisse afficher "Signée" vs "À signer" sans devoir croiser deux endpoints.
  async findAll(activeOnly = true, userId?: string) {
    const chartes = await this.prisma.charte.findMany({
      where: activeOnly ? { isActive: true } : {},
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        directionValidatedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { signatures: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!userId) return chartes;

    // Second query : pour chaque charte, récupère la signature éventuelle de
    // l'utilisateur courant sur la version active. On évite l'include
    // conditionnel (typing Prisma compliqué) par une requête dédiée.
    const activeVersionIds = chartes
      .map((c) => c.versions[0]?.id)
      .filter((id): id is string => typeof id === "string");

    const signatures = activeVersionIds.length
      ? await this.prisma.charteSignature.findMany({
          where: { userId, charteVersionId: { in: activeVersionIds } },
          select: { charteVersionId: true, signedAt: true },
        })
      : [];
    const signedByVersion = new Map(
      signatures.map((s) => [s.charteVersionId, s.signedAt]),
    );

    return chartes.map((c) => {
      const activeVersionId = c.versions[0]?.id;
      const signedAt = activeVersionId
        ? (signedByVersion.get(activeVersionId) ?? null)
        : null;
      return { ...c, signedAt };
    });
  }

  async getCharteById(id: string) {
    return this.prisma.charte.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { createdAt: "desc" } },
        directionValidatedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: { select: { signatures: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    const charte = await this.prisma.charte.findUnique({
      where: { slug },
      include: {
        versions: { orderBy: { createdAt: "desc" } },
        _count: { select: { signatures: true } },
      },
    });
    if (!charte) throw new NotFoundException("Charte not found");
    return charte;
  }

  // Create a new charte (admin only)
  // Si `slug` absent ou vide : auto-généré depuis le titre (normalisé + unique).
  async create(data: {
    title: string;
    slug?: string;
    isMandatory?: boolean;
    classification?: string;
  }) {
    const title = typeof data?.title === "string" ? data.title.trim() : "";
    if (!title) {
      throw new BadRequestException("Le titre de la charte est requis.");
    }

    const rawSlug = typeof data?.slug === "string" ? data.slug.trim() : "";
    let slug: string;
    if (!rawSlug) {
      // Auto-generate depuis le titre, unique en DB
      slug = await generateUniqueSlug(
        title,
        async (candidate) =>
          !!(await this.prisma.charte.findUnique({
            where: { slug: candidate },
          })),
        { maxLength: 80, fallback: "charte" },
      );
    } else {
      // User a fourni un slug : on le normalise et on valide
      slug = slugify(rawSlug, { maxLength: 80 });
      if (!slug) {
        throw new BadRequestException(
          "Le slug fourni est invalide (doit contenir au moins une lettre ou un chiffre).",
        );
      }
      if (slug !== rawSlug.toLowerCase()) {
        // Silent normalization: on accepte mais on indique ce qu'on a utilisé
        // (pas d'erreur — UX plus souple)
      }
      const existing = await this.prisma.charte.findUnique({ where: { slug } });
      if (existing) {
        throw new ConflictException(
          `Une charte avec le slug "${slug}" existe déjà.`,
        );
      }
    }

    return this.prisma.charte.create({
      data: {
        title,
        slug,
        isMandatory: data.isMandatory ?? true,
        classification: data.classification || "INTERNE",
      },
    });
  }

  // Upload a new PDF version for a charte
  async uploadVersion(
    charteId: string,
    file: Express.Multer.File,
    versionNumber: string,
    changeLog: string | undefined,
    userId: string,
  ) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
    });
    if (!charte) throw new NotFoundException("Charte not found");

    // Validate PDF
    if (file.mimetype !== "application/pdf") {
      throw new ForbiddenException("Seuls les fichiers PDF sont acceptés");
    }

    // Upload file
    const { fileUrl } = await this.storage.upload(file, `chartes/${charteId}`);
    const checksum = await this.storage.generateChecksum(file);

    // Deactivate previous versions
    await this.prisma.charteVersion.updateMany({
      where: { charteId, isActive: true },
      data: { isActive: false },
    });

    // Create new version
    const version = await this.prisma.charteVersion.create({
      data: {
        charteId,
        versionNumber,
        fileUrl,
        fileType: file.mimetype,
        fileSizeBytes: file.size,
        checksum,
        changeLog,
        publishedAt: new Date(),
        isActive: true,
      },
    });

    // NB : la péremption globale des attestations (chartesAcceptedAt → null
    // pour tous) N'EST PLUS déclenchée ici. Elle l'est désormais à la
    // VALIDATION DIRECTION (markSignedByDirection), une fois la nouvelle
    // version réellement opposable. Sinon on ouvrait une fenêtre où tout le
    // monde était déclaré non conforme (chartesAcceptedAt null) ALORS que le
    // mur des chartes était éteint (getUnsignedChartes filtre
    // signedByDirection:true) et que l'attestation était impossible (sign()
    // refuse tant que signedByDirection est false) — donc personne ne pouvait
    // régulariser jusqu'à la validation direction.

    // La validation de la direction porte sur UNE version : publier une
    // nouvelle version active la réinitialise (boolean legacy + champs
    // tracés). Les attestations restent bloquées tant que la direction n'a
    // pas re-validé — c'est le sens du workflow qualité.
    const wasValidated = charte.signedByDirection;
    await this.prisma.charte.update({
      where: { id: charteId },
      data: {
        signedByDirection: false,
        directionValidatedById: null,
        directionValidatedAt: null,
        directionValidatedVersionId: null,
      },
    });

    // Notifie la direction que la nouvelle version est à (re)valider.
    // Insertion directe dans Notification (pas via NotificationsService pour
    // éviter un import circulaire ChartesModule → NotificationsModule).
    const directionUsers = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.DIRECTION, UserRole.SUPER_ADMIN] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (directionUsers.length > 0) {
      await this.prisma.notification.createMany({
        data: directionUsers.map((u) => ({
          userId: u.id,
          type: NotificationType.DOC_APPROVAL_NEEDED,
          title: wasValidated
            ? `Charte à re-valider : ${charte.title}`
            : `Charte à valider : ${charte.title}`,
          body: `La version ${versionNumber} de la charte « ${charte.title} » vient d'être publiée. La validation de la direction est requise avant que les collaborateurs puissent attester leur lecture.`,
          resourceType: "Charte",
          resourceId: charteId,
        })),
        skipDuplicates: true,
      });
    }

    // Audit log
    await this.audit.log({
      userId,
      action: "CHARTE_VERSION_UPLOADED",
      resourceType: "Charte",
      resourceId: charteId,
      metadata: { versionNumber, changeLog, fileUrl },
      severity: "INFO",
    });

    return version;
  }

  // Validation de la direction — étape de workflow qualité tracée (qui,
  // quand, sur quelle version). Ce n'est PAS une signature : le boolean
  // legacy signedByDirection est maintenu en double-écriture pour compat.
  async markSignedByDirection(charteId: string, userId: string) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    if (!charte) throw new NotFoundException("Charte not found");

    const activeVersion = charte.versions[0];
    if (!activeVersion) {
      throw new BadRequestException(
        "Aucune version active : uploadez d'abord le PDF de la charte avant de la valider.",
      );
    }

    const updated = await this.prisma.charte.update({
      where: { id: charteId },
      data: {
        signedByDirection: true, // legacy — double écriture
        directionValidatedById: userId,
        directionValidatedAt: new Date(),
        directionValidatedVersionId: activeVersion.id,
      },
      include: {
        directionValidatedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Péremption des attestations : c'est MAINTENANT (et pas au moment de
    // l'upload) que la nouvelle version devient opposable. On remet
    // chartesAcceptedAt à null pour tous — le mur des chartes est de nouveau
    // armé (signedByDirection vient de repasser à true) et les collaborateurs
    // peuvent immédiatement ré-attester. Conditionné à isMandatory : une
    // charte facultative ne déclenche pas de péremption globale.
    if (charte.isMandatory) {
      await this.prisma.user.updateMany({
        where: { chartesAcceptedAt: { not: null } },
        data: { chartesAcceptedAt: null },
      });
    }

    await this.audit.log({
      userId,
      action: "CHARTE_VALIDATED_BY_DIRECTION",
      resourceType: "Charte",
      resourceId: charteId,
      metadata: {
        charteTitle: charte.title,
        versionId: activeVersion.id,
        versionNumber: activeVersion.versionNumber,
      },
      severity: "WARN",
    });

    return updated;
  }

  // Attestation de lecture d'une version de charte par un utilisateur.
  // Ce n'est PAS une signature engageante (DocuSeal) : c'est un accusé de
  // lecture horodaté avec IP/UA + snapshot identité (ISO 27001 A.5.28 —
  // la preuve doit survivre 3 ans à la suppression du compte).
  async sign(
    charteId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    if (!charte) throw new NotFoundException("Charte not found");
    // Blocage volontaire (workflow qualité) : tant que la direction n'a pas
    // validé la version courante, personne n'atteste sa lecture.
    if (!charte.signedByDirection)
      throw new ForbiddenException(
        "Cette charte n'a pas encore été validée par la Direction : l'attestation de lecture sera possible dès sa validation.",
      );

    const activeVersion = charte.versions[0];
    if (!activeVersion)
      throw new NotFoundException("Aucune version active pour cette charte");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, role: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const identitySnapshot = {
      userEmail: user.email,
      userFirstName: user.firstName,
      userLastName: user.lastName,
      userRole: String(user.role),
    };

    const sig = await this.prisma.charteSignature.upsert({
      where: {
        charteId_charteVersionId_userId: {
          charteId,
          charteVersionId: activeVersion.id,
          userId,
        },
      },
      create: {
        charteId,
        charteVersionId: activeVersion.id,
        userId,
        ipAddress,
        userAgent,
        ...identitySnapshot,
      },
      update: {
        signedAt: new Date(),
        ipAddress,
        userAgent,
        ...identitySnapshot,
      },
    });

    // Audit log for compliance tracking
    await this.audit.log({
      userId,
      action: "CHARTE_SIGNED",
      resourceType: "Charte",
      resourceId: charteId,
      metadata: {
        charteTitle: charte.title,
        versionNumber: activeVersion.versionNumber,
        charteVersionId: activeVersion.id,
        ipAddress,
      },
      severity: "INFO",
    });

    await this.updateUserChartesStatus(userId);
    return sig;
  }

  // Get chartes the user hasn't signed (for the current active version)
  async getUnsignedChartes(userId: string) {
    const mandatory = await this.prisma.charte.findMany({
      where: { isActive: true, isMandatory: true, signedByDirection: true },
      include: {
        versions: { where: { isActive: true }, take: 1 },
      },
    });

    if (mandatory.length === 0) return [];

    // Get all active version IDs
    const activeVersionIds = mandatory
      .map((c) => c.versions[0]?.id)
      .filter((id): id is string => !!id);

    // Single query: get all signatures for this user on these versions
    const existingSignatures = await this.prisma.charteSignature.findMany({
      where: {
        userId,
        charteVersionId: { in: activeVersionIds },
      },
      select: { charteId: true, charteVersionId: true },
    });

    const signedSet = new Set(
      existingSignatures.map((s) => `${s.charteId}:${s.charteVersionId}`),
    );

    // Récupère les exemptions actives pour ce user (revokedAt = NULL + non
    // expirées). Un user exempté d'une charte est considéré comme "compliant"
    // sans avoir à signer — l'obligation lui est retirée nominativement.
    const now = new Date();
    const activeExemptions = await this.prisma.charteExemption.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        charteId: { in: mandatory.map((c) => c.id) },
      },
      select: { charteId: true },
    });
    const exemptedSet = new Set(activeExemptions.map((e) => e.charteId));

    return mandatory
      .filter((charte) => {
        const activeVersion = charte.versions[0];
        if (!activeVersion) return false;
        if (exemptedSet.has(charte.id)) return false;
        return !signedSet.has(`${charte.id}:${activeVersion.id}`);
      })
      .map((charte) => ({ ...charte, activeVersion: charte.versions[0] }));
  }

  async hasSignedAllChartes(userId: string): Promise<boolean> {
    const unsigned = await this.getUnsignedChartes(userId);
    return unsigned.length === 0;
  }

  private async updateUserChartesStatus(userId: string) {
    const allSigned = await this.hasSignedAllChartes(userId);
    if (allSigned) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { chartesAcceptedAt: new Date() },
      });
    }
  }

  // Admin: get all signatures for a charte with version info
  async getSignatures(charteId: string, charteVersionId?: string) {
    const where: any = { charteId };
    if (charteVersionId) where.charteVersionId = charteVersionId;

    return this.prisma.charteSignature.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            departmentId: true,
          },
        },
        charteVersion: { select: { id: true, versionNumber: true } },
      },
      orderBy: { signedAt: "desc" },
    });
  }

  async remove(charteId: string, userId: string) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
    });
    if (!charte) throw new NotFoundException("Charte introuvable");

    // Delete all signatures, versions, then the charte
    await this.prisma.charteSignature.deleteMany({ where: { charteId } });
    await this.prisma.charteVersion.deleteMany({ where: { charteId } });
    await this.prisma.charte.delete({ where: { id: charteId } });

    // Désindexation : les chartes ne sont actuellement pas dans Meilisearch
    // ni dans le RAG (validé par l'enum RagSourceType), donc pas d'appel
    // explicite. Si une indexation future est ajoutée, desindexer ici.

    await this.audit.log({
      userId,
      action: "CHARTE_DELETED",
      resourceType: "Charte",
      resourceId: charteId,
      metadata: { title: charte.title, slug: charte.slug },
      severity: "WARN",
    });

    return { message: "Charte supprimée" };
  }

  async createFromDocument(
    documentId: string,
    slug: string,
    isMandatory: boolean,
    userId: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!doc) throw new NotFoundException("Document not found");

    const version = doc.versions[0];
    if (!version) throw new NotFoundException("Document has no version");

    // Create the charte
    const charte = await this.prisma.charte.create({
      data: {
        title: doc.title,
        slug,
        isMandatory,
        classification: doc.classification || "INTERNE",
        signedByDirection: false,
      },
    });

    // Create version from document version
    await this.prisma.charteVersion.create({
      data: {
        charteId: charte.id,
        versionNumber: version.versionNumber || "1.0",
        fileUrl: version.fileUrl,
        fileType: version.fileType,
        fileSizeBytes: version.fileSizeBytes,
        checksum: version.checksum,
        changeLog: `Importé depuis le document ${doc.reference}`,
        publishedAt: new Date(),
        isActive: true,
      },
    });

    await this.audit.log({
      userId,
      action: "CHARTE_CREATED_FROM_DOCUMENT",
      resourceType: "Charte",
      resourceId: charte.id,
      metadata: { documentId, documentRef: doc.reference, title: doc.title },
    });

    return charte;
  }

  // Admin: compliance report - who has NOT signed
  async getComplianceReport(charteId: string) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    if (!charte) throw new NotFoundException("Charte not found");
    const activeVersion = charte.versions[0];
    if (!activeVersion) return { signed: [], unsigned: [], charte };

    const allActiveUsers = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        departmentId: true,
      },
    });

    const signatures = await this.prisma.charteSignature.findMany({
      where: { charteId, charteVersionId: activeVersion.id },
      select: { userId: true, signedAt: true },
    });

    const signedUserIds = new Set(signatures.map((s) => s.userId));
    const signedMap = new Map(signatures.map((s) => [s.userId, s.signedAt]));

    const signed = allActiveUsers
      .filter((u) => signedUserIds.has(u.id))
      .map((u) => ({ ...u, signedAt: signedMap.get(u.id) }));

    // Exemptions actives (non révoquées, non expirées) — affichées séparément
    // dans le rapport pour ne pas être confondues avec les retardataires.
    const now = new Date();
    const exemptions = await this.prisma.charteExemption.findMany({
      where: {
        charteId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        exemptedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    const exemptedById = new Map(exemptions.map((e) => [e.userId, e]));

    const exempted = allActiveUsers
      .filter((u) => exemptedById.has(u.id))
      .map((u) => {
        const exemption = exemptedById.get(u.id)!;
        return {
          ...u,
          exemption: {
            id: exemption.id,
            reason: exemption.reason,
            exemptedAt: exemption.exemptedAt,
            expiresAt: exemption.expiresAt,
            exemptedBy: exemption.exemptedBy,
          },
        };
      });

    // Les unsigned "vrais" sont ceux qui n'ont ni signé ni exempté.
    const unsigned = allActiveUsers.filter(
      (u) => !signedUserIds.has(u.id) && !exemptedById.has(u.id),
    );

    return { signed, unsigned, exempted, charte, activeVersion };
  }

  /**
   * Envoie une notification SIGNATURE_REMINDER à tous les utilisateurs actifs
   * qui n'ont pas encore signé la version active d'une charte mandatory.
   *
   * Exclusions :
   *  - Les users avec exemption active (CharteExemption.revokedAt = NULL et
   *    expiresAt = NULL ou future) ne sont pas relancés — ils sont dispensés.
   *  - Le compte du déclencheur (admin) est notifié comme les autres uniquement
   *    s'il fait partie des unsigned, sinon non.
   *
   * Toute l'opération est tracée dans AuditLog pour ISO 27001 A.5.34.
   */
  async remindUnsigned(charteId: string, actorId: string) {
    const report = await this.getComplianceReport(charteId);
    if (!("activeVersion" in report) || !report.activeVersion) {
      throw new BadRequestException("Aucune version active pour cette charte.");
    }

    // Filtre exemptions actives
    const now = new Date();
    const exemptions = await this.prisma.charteExemption.findMany({
      where: {
        charteId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { userId: true },
    });
    const exemptedSet = new Set(exemptions.map((e) => e.userId));

    const toRemind = report.unsigned.filter((u: any) => !exemptedSet.has(u.id));

    if (toRemind.length === 0) {
      return {
        sent: 0,
        exempted: exemptedSet.size,
        total: report.unsigned.length,
      };
    }

    // Notifications batch — insertion directe dans Notification (pas via
    // NotificationsService pour éviter un import circulaire ChartesModule →
    // NotificationsModule). Le modèle Notification ne possède pas de champ
    // metadata : le slug de la charte est encodé via resourceType + resourceId
    // que le frontend traduit en lien (/chartes/<slug>).
    await this.prisma.notification.createMany({
      data: toRemind.map((u: any) => ({
        userId: u.id,
        type: NotificationType.SIGNATURE_REMINDER,
        title: `Attestation de lecture requise : ${report.charte.title}`,
        body: "Vous n'avez pas encore attesté avoir lu cette charte. Merci d'ouvrir le PDF puis de confirmer votre lecture.",
        resourceType: "Charte",
        resourceId: charteId,
      })),
      skipDuplicates: true,
    });

    await this.audit.log({
      userId: actorId,
      action: "CHARTE_REMIND_UNSIGNED",
      resourceType: "Charte",
      resourceId: charteId,
      severity: "INFO",
      metadata: {
        charteTitle: report.charte.title,
        remindedCount: toRemind.length,
        exemptedCount: exemptedSet.size,
        totalUnsigned: report.unsigned.length,
      },
    });

    return {
      sent: toRemind.length,
      exempted: exemptedSet.size,
      total: report.unsigned.length,
    };
  }
}
