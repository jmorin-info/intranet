/**
 * OMNITECH SECURITY — Glossaire UX
 *
 * Ce fichier centralise les libellés, descriptions pédagogiques et références
 * normatives des classifications documentaires, priorités de tickets et
 * statuts de publication utilisés dans l'intranet.
 *
 * Il est importé par les composants qui affichent des tooltips, des popovers
 * d'aide ou des légendes (classification des documents, création de ticket,
 * workflow de publication, etc.).
 *
 * Références : ISO 27001:2022, NIS2, politique documentaire OMNITECH (PSSI).
 */

export interface ClassificationInfo {
  label: string;
  description: string;
  color: string;
  iso: string;
}

export const CLASSIFICATION_HELP: Record<string, ClassificationInfo> = {
  PUBLIC: {
    label: 'Public',
    description:
      "Information librement diffusable, y compris à l'extérieur d'OMNITECH SECURITY. Inclut les communiqués officiels, brochures commerciales et conditions générales.",
    color: '#006233',
    iso: 'ISO 27001 A.5.12',
  },
  INTERNE: {
    label: 'Interne',
    description:
      "Information réservée aux collaborateurs OMNITECH SECURITY. Diffusion externe interdite sans autorisation. Inclut procédures internes, organigrammes et notes de service.",
    color: '#296DC1',
    iso: 'ISO 27001 A.5.12',
  },
  CONFIDENTIEL: {
    label: 'Confidentiel',
    description:
      "Information sensible accessible aux personnes habilitées (principe du besoin d'en connaître). Inclut audits, contrats stratégiques, données techniques sensibles et rapports d'incidents.",
    color: '#F9964A',
    iso: 'ISO 27001 A.5.12',
  },
  SECRET: {
    label: 'Secret',
    description:
      "Information critique strictement limitée à un cercle restreint. Diffusion soumise à validation du RSSI. Inclut clés cryptographiques, mots de passe maîtres et plans de continuité d'activité.",
    color: '#892034',
    iso: 'ISO 27001 A.5.12',
  },
};

export interface TicketPriorityInfo {
  label: string;
  description: string;
  sla: string;
}

export const TICKET_PRIORITY_HELP: Record<string, TicketPriorityInfo> = {
  CRITICAL: {
    label: 'Critique',
    description:
      'Incident bloquant impactant un service de production ou la sécurité. Prise en charge immédiate par l\'équipe support.',
    sla: 'Résolution sous 4h ouvrées',
  },
  HIGH: {
    label: 'Haute',
    description:
      'Problème important affectant plusieurs utilisateurs ou un service métier.',
    sla: 'Résolution sous 8h ouvrées',
  },
  MEDIUM: {
    label: 'Moyenne',
    description:
      'Demande normale ou problème localisé sans urgence vitale.',
    sla: 'Résolution sous 2 jours ouvrés',
  },
  LOW: {
    label: 'Basse',
    description:
      'Amélioration, demande non-urgente ou simple question informative.',
    sla: 'Résolution sous 5 jours ouvrés',
  },
};

export interface DocumentStatusInfo {
  label: string;
  description: string;
}

export const DOCUMENT_STATUS_HELP: Record<string, DocumentStatusInfo> = {
  DRAFT: {
    label: 'Brouillon',
    description:
      "Document en cours de rédaction. Non visible des collaborateurs. Seul l'auteur et les administrateurs peuvent y accéder.",
  },
  IN_REVIEW: {
    label: 'En revue',
    description:
      'Soumis à un réviseur pour relecture. Modifications possibles avant approbation.',
  },
  REVIEW_APPROVED: {
    label: 'Revue validée',
    description:
      "Le réviseur a validé le document. Il passe automatiquement en attente d'approbation par un responsable habilité.",
  },
  PENDING_APPROVAL: {
    label: "En attente d'approbation",
    description:
      "Validé par le réviseur, attend la signature finale d'un approbateur habilité (ISO 27001 A.5.1).",
  },
  APPROVED: {
    label: 'Approuvé',
    description:
      'Document publié et applicable. Visible par les collaborateurs selon sa classification. Toute modification nécessite une nouvelle version.',
  },
  OBSOLETE: {
    label: 'Obsolète',
    description:
      "Document remplacé par une version plus récente. Conservé en lecture seule pour traçabilité. Une nouvelle version doit être rédigée si le sujet reste actif.",
  },
  ARCHIVED: {
    label: 'Archivé',
    description:
      "Document retiré de la circulation et conservé pour historique selon la politique de rétention (ISO 27001 A.5.33). Non modifiable.",
  },
};

export interface TicketStatusInfo {
  label: string;
  description: string;
}

export const TICKET_STATUS_HELP: Record<string, TicketStatusInfo> = {
  OPEN: {
    label: 'Ouvert',
    description:
      "Ticket créé en attente de prise en charge par un membre de l'équipe support.",
  },
  IN_PROGRESS: {
    label: 'En cours',
    description:
      "Un technicien support a pris en charge le ticket et travaille sur sa résolution.",
  },
  WAITING_USER: {
    label: "En attente utilisateur",
    description:
      "Le support attend une information ou une action de votre part pour poursuivre.",
  },
  RESOLVED: {
    label: 'Résolu',
    description:
      "Le problème a été résolu. Vous pouvez le rouvrir si le problème persiste dans les 48h.",
  },
  CLOSED: {
    label: 'Fermé',
    description:
      "Ticket clôturé définitivement. Pour un nouveau problème similaire, créez un nouveau ticket.",
  },
};

export interface AlertSeverityInfo {
  label: string;
  description: string;
  color: string;
}

export const ALERT_SEVERITY_HELP: Record<string, AlertSeverityInfo> = {
  P1: {
    label: 'Critique (P1)',
    description:
      "Incident majeur impactant la continuité d'activité ou la sécurité. Action immédiate requise. Notification du RSSI et du comité de crise.",
    color: '#892034',
  },
  P2: {
    label: 'Majeure (P2)',
    description:
      "Incident important affectant un service critique. Traitement prioritaire par les équipes IT et sécurité.",
    color: '#F9964A',
  },
  P3: {
    label: 'Modérée (P3)',
    description:
      "Anomalie limitée avec contournement possible. Traitement sous 24h ouvrées.",
    color: '#296DC1',
  },
  P4: {
    label: 'Informative (P4)',
    description:
      "Information de sécurité sans impact opérationnel immédiat. À consulter pour information.",
    color: '#837274',
  },
};

// ── Rôles utilisateurs ──────────────────────────────────────────────────

export interface UserRoleInfo {
  label: string;
  description: string;
  iso: string;
}

export const USER_ROLE_HELP: Record<string, UserRoleInfo> = {
  SUPER_ADMIN: {
    label: 'Super administrateur',
    description:
      "Accès complet à l'ensemble du système, y compris la configuration technique, la gestion des rôles et l'audit. Réservé au responsable IT ou au RSSI.",
    iso: 'ISO 27001 A.5.15',
  },
  ADMIN: {
    label: 'Administrateur',
    description:
      "Gère les utilisateurs, les documents et les tickets. Peut approuver des documents et administrer les modules métier sans accès à la configuration technique.",
    iso: 'ISO 27001 A.5.15',
  },
  DIRECTION: {
    label: 'Direction',
    description:
      "Membre de la direction générale. Dispose d'une vue synthétique sur les indicateurs de conformité et peut approuver les documents stratégiques (PSSI, PCA/PRA).",
    iso: 'ISO 27001 A.5.1',
  },
  REVIEWER: {
    label: 'Réviseur',
    description:
      "Responsable de la relecture technique ou normative des documents avant soumission à l'approbateur. Vérifie la cohérence, l'exactitude et la conformité ISO.",
    iso: 'ISO 27001 A.5.12',
  },
  AUDITEUR: {
    label: 'Auditeur',
    description:
      "Accès en lecture seule à l'ensemble des documents, journaux d'audit et indicateurs de conformité. Utilisé lors des audits internes ou externes.",
    iso: 'ISO 27001 A.5.35',
  },
  COLLABORATEUR: {
    label: 'Collaborateur',
    description:
      "Rôle par défaut pour les salariés OMNITECH. Accès aux documents selon leur classification, création de tickets et consultation de l'intranet.",
    iso: 'ISO 27001 A.5.15',
  },
  PRESTATAIRE: {
    label: 'Prestataire',
    description:
      "Compte externe à durée limitée avec MFA obligatoire. Accès restreint aux documents contractuels et tickets liés à sa mission. Révision mensuelle par le RSSI.",
    iso: 'ISO 27001 A.5.19',
  },
};

// ── Sévérités incidents ─────────────────────────────────────────────────

export interface IncidentSeverityInfo {
  label: string;
  description: string;
  color: string;
  iso: string;
}

export const INCIDENT_SEVERITY_HELP: Record<string, IncidentSeverityInfo> = {
  CRITICAL: {
    label: 'Critique',
    description:
      "Incident majeur mettant en péril la continuité d'activité ou la confidentialité des données. Déclenchement immédiat du comité de crise et notification au RSSI.",
    color: '#892034',
    iso: 'ISO 27001 A.5.24',
  },
  HIGH: {
    label: 'Haute',
    description:
      "Incident important affectant un service critique ou un périmètre sensible. Traitement prioritaire avec escalade vers le responsable concerné sous 2 heures.",
    color: '#F9964A',
    iso: 'ISO 27001 A.5.24',
  },
  MEDIUM: {
    label: 'Moyenne',
    description:
      "Incident localisé avec impact limité et contournement possible. Analyse et résolution sous 24 heures ouvrées.",
    color: '#296DC1',
    iso: 'ISO 27001 A.5.25',
  },
  LOW: {
    label: 'Basse',
    description:
      "Anomalie mineure sans impact opérationnel immédiat. Documentée pour amélioration continue et revue lors du comité sécurité mensuel.",
    color: '#837274',
    iso: 'ISO 27001 A.5.25',
  },
};

/**
 * Récupère les informations d'une classification par sa clé.
 * Retourne null si la clé est inconnue (gestion défensive pour données legacy).
 */
export function getClassificationInfo(key: string | null | undefined): ClassificationInfo | null {
  if (!key) return null;
  return CLASSIFICATION_HELP[key.toUpperCase()] ?? null;
}

/**
 * Récupère les informations d'une priorité de ticket par sa clé.
 */
export function getTicketPriorityInfo(key: string | null | undefined): TicketPriorityInfo | null {
  if (!key) return null;
  return TICKET_PRIORITY_HELP[key.toUpperCase()] ?? null;
}

/**
 * Récupère les informations d'un statut de document par sa clé.
 */
export function getDocumentStatusInfo(key: string | null | undefined): DocumentStatusInfo | null {
  if (!key) return null;
  return DOCUMENT_STATUS_HELP[key.toUpperCase()] ?? null;
}
