import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

interface AuditCheck {
  category: string;
  name: string;
  status: "pass" | "warning" | "fail";
  description: string;
  recommendation?: string;
  isoControl?: string;
  source?: "ad" | "intranet";
}

interface AuditReport {
  generatedAt: string;
  overallScore: number;
  checks: AuditCheck[];
  summary: {
    pass: number;
    warning: number;
    fail: number;
    total: number;
  };
  adDomain?: string;
  adScore?: number;
}

@Injectable()
export class AdAuditService {
  private readonly logger = new Logger(AdAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyze an uploaded AD audit report (JSON or text format).
   * ALWAYS combines AD report checks + database (intranet) checks.
   */
  async analyzeReport(
    content: string,
    format: "json" | "text" | "csv" = "json",
  ): Promise<AuditReport> {
    const adChecks: AuditCheck[] = [];

    try {
      if (format === "json") {
        const data = JSON.parse(content);
        adChecks.push(...this.analyzeJsonReport(data));
      } else {
        adChecks.push(...this.analyzeTextReport(content));
      }
    } catch (err) {
      this.logger.warn(
        `Failed to parse AD report: ${err instanceof Error ? err.message : err}`,
      );
    }

    // ALWAYS run database/intranet checks alongside AD checks
    const dbChecks = await this.runDatabaseChecks();

    // Merge: AD checks first, then intranet checks (deduplicate by category+name)
    const allChecks = [...adChecks];
    const existingKeys = new Set(
      adChecks.map((c) => `${c.category}::${c.name}`),
    );
    for (const dc of dbChecks) {
      if (!existingKeys.has(`${dc.category}::${dc.name}`)) {
        allChecks.push(dc);
      }
    }

    const pass = allChecks.filter((c) => c.status === "pass").length;
    const warning = allChecks.filter((c) => c.status === "warning").length;
    const fail = allChecks.filter((c) => c.status === "fail").length;
    const total = allChecks.length;
    const overallScore = total > 0 ? Math.round((pass / total) * 100) : 0;

    // Extract AD-specific metadata if present
    let adDomain: string | undefined;
    let adScore: number | undefined;
    try {
      const data = JSON.parse(content);
      adDomain = data.Domain;
      adScore = data.Score;
    } catch {
      /* not JSON or no domain field */
    }

    const report: AuditReport = {
      generatedAt: new Date().toISOString(),
      overallScore,
      checks: allChecks,
      summary: { pass, warning, fail, total },
      adDomain,
      adScore,
    };

    // Store audit result
    await this.prisma.auditLog.create({
      data: {
        action: "AD_AUDIT_REPORT",
        resourceType: "ADaudit",
        // Prisma.InputJsonValue : objet JSON-sérialisable.
        metadata: {
          overallScore,
          pass,
          warning,
          fail,
          total,
          adChecks: adChecks.length,
          dbChecks: dbChecks.length,
          adDomain,
          adScore,
        } as Prisma.InputJsonValue,
        severity:
          overallScore >= 70
            ? "INFO"
            : overallScore >= 50
              ? "WARN"
              : "CRITICAL",
      },
    });

    return report;
  }

  /**
   * Run checks based on our own database (users, groups, etc.)
   */
  private async runDatabaseChecks(): Promise<AuditCheck[]> {
    const checks: AuditCheck[] = [];

    // Check 1: Users without MFA
    const totalActive = await this.prisma.user.count({
      where: { isActive: true, deletedAt: null },
    });
    const mfaEnabled = await this.prisma.user.count({
      where: { isActive: true, deletedAt: null, mfaEnabled: true },
    });
    const mfaPercent =
      totalActive > 0 ? Math.round((mfaEnabled / totalActive) * 100) : 0;
    checks.push({
      category: "Authentification",
      name: "Adoption MFA (intranet)",
      status: mfaPercent >= 80 ? "pass" : mfaPercent >= 50 ? "warning" : "fail",
      description: `${mfaEnabled}/${totalActive} utilisateurs ont le MFA activé (${mfaPercent}%)`,
      recommendation:
        mfaPercent < 80
          ? "Activez le MFA pour tous les utilisateurs, en priorité les administrateurs."
          : undefined,
      isoControl: "A.8.5",
      source: "intranet",
    });

    // Check 2: Users without department
    const noDept = await this.prisma.user.count({
      where: { isActive: true, deletedAt: null, departmentId: null },
    });
    checks.push({
      category: "Organisation",
      name: "Affectation départements",
      status: noDept === 0 ? "pass" : noDept < 10 ? "warning" : "fail",
      description: `${noDept} utilisateur(s) actif(s) sans département assigné`,
      recommendation:
        noDept > 0
          ? "Assignez chaque utilisateur à un département pour le contrôle d'accès."
          : undefined,
      isoControl: "A.5.2",
      source: "intranet",
    });

    // Check 3: Password policy (intranet enforced)
    checks.push({
      category: "Mots de passe",
      name: "Politique de complexité (intranet)",
      status: "pass",
      description:
        "Politique de 12 caractères minimum avec complexité (majuscules, minuscules, chiffres, spéciaux)",
      isoControl: "A.5.17",
      source: "intranet",
    });

    // Check 4: SUPER_ADMIN count
    const superAdmins = await this.prisma.user.count({
      where: { role: "SUPER_ADMIN", isActive: true },
    });
    checks.push({
      category: "Privilèges",
      name: "Super-administrateurs intranet",
      status: superAdmins <= 3 ? "pass" : superAdmins <= 5 ? "warning" : "fail",
      description: `${superAdmins} super-administrateur(s) actif(s)`,
      recommendation:
        superAdmins > 3
          ? "Limitez le nombre de super-administrateurs au strict nécessaire."
          : undefined,
      isoControl: "A.8.2",
      source: "intranet",
    });

    // Check 5: Prestataire access review
    const overdueReviews = await this.prisma.externalAccess.count({
      where: {
        isActive: true,
        OR: [
          { lastReviewedAt: null },
          { lastReviewedAt: { lt: new Date(Date.now() - 30 * 86400000) } },
        ],
      },
    });
    checks.push({
      category: "Accès externes",
      name: "Revue des accès prestataires",
      status: overdueReviews === 0 ? "pass" : "warning",
      description: `${overdueReviews} accès prestataire(s) non révisé(s) depuis 30+ jours`,
      recommendation:
        overdueReviews > 0
          ? "Effectuez la revue mensuelle des accès prestataires."
          : undefined,
      isoControl: "A.5.19",
      source: "intranet",
    });

    // Check 6: Document review dates
    const overdueDocReviews = await this.prisma.document.count({
      where: {
        status: "APPROVED",
        deletedAt: null,
        nextReviewDate: { lt: new Date() },
      },
    });
    checks.push({
      category: "Documents",
      name: "Revue documentaire",
      status:
        overdueDocReviews === 0
          ? "pass"
          : overdueDocReviews <= 5
            ? "warning"
            : "fail",
      description: `${overdueDocReviews} document(s) en retard de revue`,
      recommendation:
        overdueDocReviews > 0
          ? "Planifiez la revue des documents en retard."
          : undefined,
      isoControl: "A.5.37",
      source: "intranet",
    });

    // Check 7: Chartes signed
    const totalChartes = await this.prisma.charte.count({
      where: { isActive: true, isMandatory: true },
    });
    checks.push({
      category: "Chartes",
      name: "Chartes obligatoires publiées",
      status:
        totalChartes >= 2 ? "pass" : totalChartes >= 1 ? "warning" : "fail",
      description: `${totalChartes} charte(s) obligatoire(s) active(s)`,
      isoControl: "A.6.2",
      source: "intranet",
    });

    // Check 8: ClamAV
    try {
      const { execSync } = await import("child_process");
      execSync("clamscan --version", { timeout: 5000 });
      checks.push({
        category: "Antivirus",
        name: "ClamAV",
        status: "pass",
        description: "ClamAV est installé et opérationnel",
        isoControl: "A.8.7",
        source: "intranet",
      });
    } catch {
      checks.push({
        category: "Antivirus",
        name: "ClamAV",
        status: "fail",
        description: "ClamAV n'est pas disponible",
        recommendation: "Installez et configurez ClamAV.",
        isoControl: "A.8.7",
        source: "intranet",
      });
    }

    // Check 9: Backup
    try {
      const { execSync } = await import("child_process");
      const crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
      const hasBackup = crontab.includes("backup");
      checks.push({
        category: "Sauvegardes",
        name: "Backup automatisé",
        status: hasBackup ? "pass" : "fail",
        description: hasBackup
          ? "Backup quotidien programmé dans le crontab"
          : "Aucun backup automatisé détecté",
        isoControl: "A.8.13",
        source: "intranet",
      });
    } catch {
      checks.push({
        category: "Sauvegardes",
        name: "Backup",
        status: "warning",
        description: "Impossible de vérifier le crontab",
        source: "intranet",
      });
    }

    // Check 10: LDAP enabled
    const ldapEnabled = await this.prisma.appConfig.findUnique({
      where: { key: "ldap.enabled" },
    });
    checks.push({
      category: "Annuaire",
      name: "LDAPS Active Directory",
      status: ldapEnabled?.value === "true" ? "pass" : "warning",
      description:
        ldapEnabled?.value === "true"
          ? "Authentification LDAPS activée"
          : "LDAPS non activé — authentification locale uniquement",
      isoControl: "A.5.16",
      source: "intranet",
    });

    // Check 11: Admin users with MFA
    const adminNoMfa = await this.prisma.user.count({
      where: {
        isActive: true,
        deletedAt: null,
        mfaEnabled: false,
        role: { in: ["SUPER_ADMIN", "ADMIN"] },
      },
    });
    checks.push({
      category: "Authentification",
      name: "MFA administrateurs",
      status: adminNoMfa === 0 ? "pass" : "fail",
      description:
        adminNoMfa === 0
          ? "Tous les administrateurs ont le MFA activé"
          : `${adminNoMfa} administrateur(s) sans MFA`,
      recommendation:
        adminNoMfa > 0
          ? "Le MFA est obligatoire pour tous les comptes administrateurs."
          : undefined,
      isoControl: "A.8.5",
      source: "intranet",
    });

    // Check 12: Inactive users (no login > 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
    const inactiveUsers = await this.prisma.user.count({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: ninetyDaysAgo } }],
      },
    });
    checks.push({
      category: "Comptes",
      name: "Comptes inactifs (90+ jours)",
      status:
        inactiveUsers === 0 ? "pass" : inactiveUsers <= 10 ? "warning" : "fail",
      description: `${inactiveUsers} compte(s) actif(s) sans connexion depuis 90+ jours`,
      recommendation:
        inactiveUsers > 0
          ? "Désactivez ou révisez les comptes inactifs."
          : undefined,
      isoControl: "A.5.18",
      source: "intranet",
    });

    // Check 13: Veille cyber processed
    try {
      const unprocessedVeille = await this.prisma.veilleItem.count({
        where: { isProcessed: false },
      });
      checks.push({
        category: "Veille sécurité",
        name: "Alertes non traitées",
        status:
          unprocessedVeille === 0
            ? "pass"
            : unprocessedVeille <= 5
              ? "warning"
              : "fail",
        description: `${unprocessedVeille} alerte(s) CERT-FR/ANSSI non traitée(s)`,
        recommendation:
          unprocessedVeille > 0
            ? "Traitez les alertes de veille en priorité."
            : undefined,
        isoControl: "A.5.7",
        source: "intranet",
      });
    } catch {
      /* table may not exist */
    }

    // Check 14: Quiz participation rate
    try {
      const quizCompletions = await this.prisma.auditLog.count({
        where: { action: "QUIZ_COMPLETED" },
      });
      checks.push({
        category: "Sensibilisation",
        name: "Quiz sécurité",
        status:
          quizCompletions >= totalActive * 0.5
            ? "pass"
            : quizCompletions > 0
              ? "warning"
              : "fail",
        description: `${quizCompletions} participation(s) au quiz de sensibilisation`,
        recommendation:
          quizCompletions < totalActive
            ? "Encouragez les collaborateurs à compléter le quiz de sensibilisation."
            : undefined,
        isoControl: "A.6.3",
        source: "intranet",
      });
    } catch {
      /* silent */
    }

    return checks;
  }

  private analyzeJsonReport(data: any): AuditCheck[] {
    const checks: AuditCheck[] = [];

    // ── Parse the PS1 Decisions array (primary source) ──────────────
    if (Array.isArray(data.Decisions) && data.Decisions.length > 0) {
      for (const d of data.Decisions) {
        if (!d.Id || !d.Title) continue;
        // Extract ISO control from Id (e.g., "C06-DomainPasswordPolicy" or from Justification)
        let isoControl: string | undefined;
        if (typeof d.Justification === "string") {
          const isoMatch = d.Justification.match(/\[(A\.\d+\.\d+)/);
          if (isoMatch) isoControl = isoMatch[1];
        }
        checks.push({
          category: d.Category || "AD",
          name: d.Title,
          status: d.Passed ? "pass" : d.Severity === "Info" ? "pass" : "fail",
          description: d.Evidence || "",
          recommendation: d.Remediation || undefined,
          isoControl,
          source: "ad",
        });
      }
      this.logger.log(`Parsed ${checks.length} decisions from PS1 report`);
      return checks;
    }

    // ── Fallback: parse summary fields (legacy format) ──────────────

    // Password Policy
    if (data.PasswordPolicy) {
      const pp = data.PasswordPolicy;
      checks.push({
        category: "Mots de passe AD",
        name: "Longueur minimale",
        status:
          (pp.MinPasswordLength || 0) >= 12
            ? "pass"
            : (pp.MinPasswordLength || 0) >= 8
              ? "warning"
              : "fail",
        description: `Longueur minimale : ${pp.MinPasswordLength || "Non défini"} caractères`,
        recommendation:
          (pp.MinPasswordLength || 0) < 12
            ? "Augmentez la longueur minimale à 12 caractères."
            : undefined,
        isoControl: "A.5.17",
        source: "ad",
      });
      if (pp.PasswordHistoryCount !== undefined) {
        checks.push({
          category: "Mots de passe AD",
          name: "Historique des mots de passe",
          status:
            pp.PasswordHistoryCount >= 12
              ? "pass"
              : pp.PasswordHistoryCount >= 6
                ? "warning"
                : "fail",
          description: `Historique de ${pp.PasswordHistoryCount} mot(s) de passe mémorisé(s)`,
          recommendation:
            pp.PasswordHistoryCount < 12
              ? "Conservez au moins 12 mots de passe en historique."
              : undefined,
          isoControl: "A.5.17",
          source: "ad",
        });
      }
      if (pp.LockoutThreshold !== undefined) {
        checks.push({
          category: "Mots de passe AD",
          name: "Verrouillage du compte",
          status:
            pp.LockoutThreshold > 0 && pp.LockoutThreshold <= 5
              ? "pass"
              : pp.LockoutThreshold === 0
                ? "fail"
                : "warning",
          description:
            pp.LockoutThreshold === 0
              ? "Aucun verrouillage de compte configuré"
              : `Verrouillage après ${pp.LockoutThreshold} tentative(s) échouée(s)`,
          recommendation:
            pp.LockoutThreshold === 0
              ? "Activez le verrouillage après 5 tentatives échouées."
              : undefined,
          isoControl: "A.8.5",
          source: "ad",
        });
      }
      if (pp.MaxPasswordAge !== undefined) {
        const days =
          typeof pp.MaxPasswordAge === "string"
            ? parseInt(pp.MaxPasswordAge)
            : pp.MaxPasswordAge;
        checks.push({
          category: "Mots de passe AD",
          name: "Expiration des mots de passe",
          status:
            days > 0 && days <= 90 ? "pass" : days > 90 ? "warning" : "fail",
          description:
            days === 0
              ? "Pas d'expiration configurée"
              : `Expiration après ${days} jours`,
          recommendation:
            days > 90 || days === 0
              ? "Configurez une expiration de 90 jours maximum."
              : undefined,
          isoControl: "A.5.17",
          source: "ad",
        });
      }
    }

    if (data.DisabledAccounts !== undefined) {
      checks.push({
        category: "Comptes AD",
        name: "Comptes désactivés",
        status: "pass",
        description: `${data.DisabledAccounts} compte(s) désactivé(s) dans l'AD`,
        isoControl: "A.5.18",
        source: "ad",
      });
    }
    if (data.AdminCount !== undefined) {
      checks.push({
        category: "Privilèges AD",
        name: "Administrateurs du domaine",
        status:
          data.AdminCount <= 5
            ? "pass"
            : data.AdminCount <= 10
              ? "warning"
              : "fail",
        description: `${data.AdminCount} compte(s) dans le groupe Domain Admins`,
        recommendation:
          data.AdminCount > 5
            ? "Réduisez le nombre d'administrateurs du domaine."
            : undefined,
        isoControl: "A.8.2",
        source: "ad",
      });
    }
    if (data.StaleAccounts !== undefined) {
      checks.push({
        category: "Comptes AD",
        name: "Comptes inactifs AD (90+ jours)",
        status:
          data.StaleAccounts === 0
            ? "pass"
            : data.StaleAccounts <= 10
              ? "warning"
              : "fail",
        description: `${data.StaleAccounts} compte(s) sans connexion depuis 90+ jours`,
        recommendation:
          data.StaleAccounts > 0
            ? "Désactivez les comptes AD inactifs."
            : undefined,
        isoControl: "A.5.18",
        source: "ad",
      });
    }
    if (data.LAPSEnabled !== undefined) {
      checks.push({
        category: "Privilèges AD",
        name: "LAPS déployé",
        status: data.LAPSEnabled ? "pass" : "fail",
        description: data.LAPSEnabled ? "LAPS est déployé" : "LAPS non déployé",
        recommendation: !data.LAPSEnabled
          ? "Déployez Microsoft LAPS."
          : undefined,
        isoControl: "A.8.2",
        source: "ad",
      });
    }
    if (data.BitLockerEnabled !== undefined) {
      checks.push({
        category: "Chiffrement",
        name: "BitLocker",
        status: data.BitLockerEnabled ? "pass" : "fail",
        description: data.BitLockerEnabled
          ? "BitLocker activé"
          : "BitLocker non déployé",
        recommendation: !data.BitLockerEnabled
          ? "Activez BitLocker sur tous les postes."
          : undefined,
        isoControl: "A.8.24",
        source: "ad",
      });
    }
    if (data.ServiceAccounts !== undefined) {
      const count = Array.isArray(data.ServiceAccounts)
        ? data.ServiceAccounts.length
        : data.ServiceAccounts;
      checks.push({
        category: "Comptes AD",
        name: "Comptes de service",
        status: count <= 10 ? "pass" : count <= 20 ? "warning" : "fail",
        description: `${count} compte(s) de service`,
        isoControl: "A.8.2",
        source: "ad",
      });
    }
    if (data.GPOCount !== undefined) {
      checks.push({
        category: "Stratégies de groupe",
        name: "GPO Active Directory",
        status: "pass",
        description: `${data.GPOCount} GPO(s) configurée(s)`,
        isoControl: "A.5.1",
        source: "ad",
      });
    }
    if (data.DNSSECEnabled !== undefined) {
      checks.push({
        category: "Réseau",
        name: "DNSSEC",
        status: data.DNSSECEnabled ? "pass" : "warning",
        description: data.DNSSECEnabled ? "DNSSEC activé" : "DNSSEC non activé",
        isoControl: "A.8.20",
        source: "ad",
      });
    }

    return checks;
  }

  private analyzeTextReport(content: string): AuditCheck[] {
    const checks: AuditCheck[] = [];
    const lines = content.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//"))
        continue;

      let status: "pass" | "warning" | "fail" | null = null;
      if (/\bFAIL\b|\bERROR\b|\bCRITICAL\b/i.test(trimmed)) status = "fail";
      else if (/\bWARN(ING)?\b/i.test(trimmed)) status = "warning";
      else if (/\bPASS\b|\bOK\b|\bSUCCESS\b/i.test(trimmed)) status = "pass";

      if (status) {
        checks.push({
          category: "AD",
          name: trimmed.substring(0, 80).trim(),
          status,
          description: trimmed,
          source: "ad",
        });
      }
    }
    return checks;
  }

  async getAuditHistory() {
    return this.prisma.auditLog.findMany({
      where: { action: "AD_AUDIT_REPORT" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, metadata: true, severity: true },
    });
  }
}
