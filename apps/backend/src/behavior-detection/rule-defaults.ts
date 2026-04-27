/**
 * Wave D — Item 28 — UEBA Rule defaults
 * ==========================================================================
 * Catalogue des règles R001..R008 avec leurs seuils par défaut.
 *
 * Ces valeurs sont injectées en base au premier démarrage par
 * `BehaviorDetectionService.bootstrapRules()`. Le RSSI peut ensuite ajuster
 * `threshold` ou désactiver une règle via PATCH /admin/behavior-rules/:code
 * sans redéployer.
 *
 * Calibration : valeurs initiales calibrées sur un intranet ~100 users — un
 * humain normal n'atteint jamais ces seuils. Une règle qui produit > 1
 * alerte/jour en moyenne sur > 1 mois est considérée bruyante et doit être
 * recalibrée (cf. docs/security/UEBA_BEHAVIOR_DETECTION.md § "Calibration").
 *
 * Les codes R001..R008 sont volontairement opaques — la sémantique est
 * dans `name` + `description` + le code de la règle dans le service.
 */
import type { BehaviorAlertSeverity } from "@prisma/client";

export interface RuleDefault {
  code: string;
  name: string;
  description: string;
  severity: BehaviorAlertSeverity;
  threshold: Record<string, unknown>;
}

export const BEHAVIOR_RULES: RuleDefault[] = [
  {
    code: "R001",
    name: "Login bursty multi-IP",
    description:
      "Plus de N connexions réussies en T minutes depuis K IPs distinctes — incompatible avec un usage humain normal (rotation rapide de proxies / VPNs).",
    severity: "HIGH",
    threshold: {
      windowSeconds: 600, // 10 min
      minLogins: 10,
      minDistinctIps: 3,
    },
  },
  {
    code: "R002",
    name: "Off-hours access",
    description:
      "Connexion réussie hors plage 06h-22h (heure Europe/Paris) pour un utilisateur dont les 30 derniers logins ont tous été pendant les heures de bureau (09h-19h).",
    severity: "MEDIUM",
    threshold: {
      // Plage de l'alerte : on alerte si connexion en dehors de [start;end[
      offHoursStart: 22, // hour 0-23
      offHoursEnd: 6, // hour 0-23 (exclus)
      // Confiance : on n'alerte que si les `minHistoricalLogins` derniers
      // logins du user étaient TOUS dans [historicalStart;historicalEnd[
      historicalStart: 9,
      historicalEnd: 19,
      historicalDays: 30,
      minHistoricalLogins: 10,
    },
  },
  {
    code: "R003",
    name: "Document access burst",
    description:
      "Plus de N téléchargements de documents en T minutes par un même utilisateur — soupçon d'exfiltration en masse.",
    severity: "HIGH",
    threshold: {
      windowSeconds: 300, // 5 min
      minDownloads: 50,
      // Action loggée par le backend (cf. documents.service.ts).
      auditAction: "DOCUMENT_DOWNLOADED",
    },
  },
  {
    code: "R004",
    name: "Geographic anomaly (impossible travel)",
    description:
      "Deux connexions réussies depuis des IPs géolocalisées à plus de 1000 km en moins d'une heure — vol physique impossible. Nécessite la lib geolite2-redist installée pour résoudre l'IP en pays/coordonnées.",
    severity: "CRITICAL",
    threshold: {
      windowSeconds: 3600,
      // Distance minimale (km) entre deux logins pour déclencher l'alerte.
      // À 1000 km Paris-Marseille, mais 2 logins légitimes via VPN peuvent
      // produire ce delta — on regarde aussi le pays différent ci-dessous.
      minDistanceKm: 1000,
      // Si aucune lib geo n'est installée, on retombe sur un check IPs en
      // /16 différents (heuristique faible mais non bloquante).
      requireDistinctCountries: true,
    },
  },
  {
    code: "R005",
    name: "Failed login spike",
    description:
      "Plus de N échecs de login sur le même utilisateur en T minutes — soupçon de bruteforce ciblé. Distinguer R005 (par compte) de R001 (par succès multi-IP).",
    severity: "HIGH",
    threshold: {
      windowSeconds: 900, // 15 min
      minFailures: 20,
    },
  },
  {
    code: "R006",
    name: "Privilege escalation suspicion",
    description:
      "Un utilisateur dont le rôle vient d'être modifié (USER_ROLE_CHANGED) accède à un endpoint admin dans la minute qui suit — pattern classique de compromission post-élévation.",
    severity: "CRITICAL",
    threshold: {
      windowSeconds: 60,
      // Endpoints considérés admin : /admin/* /audit/* /users/role* …
      adminPathPatterns: ["/admin", "/audit", "/users/role", "/config"],
    },
  },
  {
    code: "R007",
    name: "Sensitive document bulk download",
    description:
      "Plus de N téléchargements de documents classés CONFIDENTIEL ou SECRET en T minutes — exfiltration de données sensibles.",
    severity: "CRITICAL",
    threshold: {
      windowSeconds: 600,
      minDownloads: 5,
      classifications: ["CONFIDENTIEL", "SECRET"],
      auditAction: "DOCUMENT_DOWNLOADED",
    },
  },
  {
    code: "R008",
    name: "MFA brute force",
    description:
      "Plus de N échecs de revalidation MFA sur le même utilisateur en T minutes — attaquant qui devine le code TOTP.",
    severity: "HIGH",
    threshold: {
      windowSeconds: 300,
      minFailures: 10,
      // Audit actions considérées comme MFA failure (cf. mfa.service.ts).
      auditActions: [
        "MFA_REVALIDATE_FAILED",
        "MFA_ACTIVATE_FAILED",
        "MFA_DISABLE_FAILED",
      ],
    },
  },
];
