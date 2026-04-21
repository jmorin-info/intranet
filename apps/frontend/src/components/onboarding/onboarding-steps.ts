/**
 * Données des étapes du tour d'onboarding OMNITECH.
 *
 * Architecture : chaque rôle voit un parcours = ÉTAPES COMMUNES (vues par tous)
 * + ÉTAPES SPÉCIFIQUES AU RÔLE. Cela évite de servir une présentation générique
 * "même pour tous" peu engageante, tout en gardant un socle commun (logique
 * navigation + chatbot + profil + MFA) que chaque utilisateur doit connaître.
 *
 * Les étapes référencent un `mockupKey` optionnel qui correspond à un mini-
 * mockup visuel en CSS/JSX rendu par `MiniMockup.tsx` — pas d'assets externes
 * à maintenir, pas de screenshots qui vieillissent.
 */

import type { ComponentType } from 'react';
import {
  Sparkles,
  Search,
  Command,
  MessageSquare,
  User,
  LayoutDashboard,
  FileCheck,
  Ticket,
  BookOpen,
  ClipboardList,
  Shield,
  Bell,
  StickyNote,
  Star,
  Lightbulb,
  Settings2,
  Users as UsersIcon,
  GitBranch,
  FileSearch,
  ShieldCheck,
  Briefcase,
  Scale,
  Eye,
  BarChart3,
  ScrollText,
  UserCog,
  Workflow,
  ExternalLink,
} from 'lucide-react';
import { UserRole } from '@omnitech/shared';

export type MockupKey =
  | 'sidebar-nav'
  | 'command-palette'
  | 'chatbot'
  | 'profile-mfa'
  | 'dashboard-widgets'
  | 'document-workflow'
  | 'ticket-hub'
  | 'ticket-space-config'
  | 'wiki-editor'
  | 'runbook-steps'
  | 'veille-feed'
  | 'satisfaction-survey'
  | 'audit-log'
  | 'access-review'
  | 'admin-hub';

export interface OnboardingStepData {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  bullets?: string[];
  mockupKey?: MockupKey;
  highlight?: string;
  cta?: { label: string; href: string };
}

// ============================================================================
// ÉTAPES COMMUNES (vues par tous les rôles)
// ============================================================================

export const COMMON_STEPS: OnboardingStepData[] = [
  {
    icon: Sparkles,
    title: 'Bienvenue sur l\'intranet OMNITECH',
    description:
      'Votre espace de travail centralisé. Le tour qui suit est adapté à votre rôle — il dure 2 minutes et vous pouvez le quitter à tout moment.',
    bullets: [
      'Documents, tickets, wiki, runbooks, veille cyber',
      'Chatbot IA connecté à toute la doc OMNITECH',
      'Conforme ISO 27001 + préparation NIS2',
    ],
  },
  {
    icon: Search,
    title: 'Barre latérale — votre navigation',
    description:
      'La sidebar regroupe tous les modules auxquels vous avez accès. Elle s\'adapte à votre rôle : vous ne voyez que ce qui vous concerne.',
    mockupKey: 'sidebar-nav',
    highlight: 'aside, nav[role="navigation"]',
    bullets: [
      'Cliquez sur un hub pour accéder au domaine',
      'Icônes colorées par univers (orange, bleu, vert…)',
      'Rétractable pour dégager l\'espace de travail',
    ],
  },
  {
    icon: Command,
    title: 'Palette de commandes (Ctrl+K)',
    description:
      'Le raccourci le plus utile de l\'intranet. Il vous évite de naviguer à la souris.',
    mockupKey: 'command-palette',
    highlight: 'header [aria-label*="recherche" i], header [data-quick-search]',
    bullets: [
      'Ctrl+K (⌘K sur Mac) — ouvre la palette',
      'Tapez un titre de page, nom de collègue, référence document',
      'Flèches pour naviguer, Entrée pour valider',
    ],
  },
  {
    icon: MessageSquare,
    title: 'Chatbot IA — votre assistant OMNITECH',
    description:
      'Un assistant conversationnel propulsé par un LLM local (Mistral 7B) qui répond à vos questions en s\'appuyant sur le wiki, les documents et les procédures OMNITECH.',
    mockupKey: 'chatbot',
    bullets: [
      'Ctrl+Shift+K pour ouvrir, ou pastille flottante en bas à droite',
      'Il cite ses sources — vérifiez toujours les liens',
      'Disponible 24/7, aucune donnée ne sort du réseau interne',
    ],
  },
  {
    icon: User,
    title: 'Votre profil et la MFA',
    description:
      'Complétez votre profil pour faciliter la collaboration. Activez l\'authentification à deux facteurs (MFA) pour sécuriser votre compte.',
    mockupKey: 'profile-mfa',
    highlight: 'header [data-user-menu], header [aria-label*="profil" i]',
    bullets: [
      'Photo, téléphone, compétences — visibles dans l\'annuaire',
      'MFA obligatoire pour ADMIN, DIRECTION, RSSI',
      'Chartes à signer : rapide, une seule fois',
    ],
    cta: { label: 'Compléter mon profil', href: '/profile' },
  },
];

// ============================================================================
// ÉTAPES PAR RÔLE
// ============================================================================

const DIRECTION_STEPS: OnboardingStepData[] = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard Direction — votre cockpit quotidien',
    description:
      'Une vue consolidée des indicateurs clés : conformité, documents en attente d\'approbation, alertes cyber à arbitrer, satisfaction collaborateurs.',
    mockupKey: 'dashboard-widgets',
    bullets: [
      'Indicateurs ISO 27001 temps réel',
      'KPI tickets, documents, formations',
      'Widgets personnalisables — masquez ce qui n\'est pas utile',
    ],
    cta: { label: 'Voir le dashboard', href: '/dashboard?view=rssi' },
  },
  {
    icon: FileCheck,
    title: 'Approuver un document',
    description:
      'Les documents suivent un workflow hiérarchique : Brouillon → Relecture → Validation Direction → Publication. Vous êtes l\'approbateur final pour les politiques stratégiques.',
    mockupKey: 'document-workflow',
    bullets: [
      'Notifications quand un document vous attend',
      'Commentaires + historique complet',
      'Un document permanent n\'a pas de date de revue',
    ],
  },
  {
    icon: Shield,
    title: 'Veille cyber & conformité réglementaire',
    description:
      'Flux consolidé : alertes CERT-FR, CISA, ANSSI + réglementation (NIS2, DORA, AI Act). Acquittez les alertes critiques, déléguez les autres.',
    mockupKey: 'veille-feed',
    bullets: [
      'Filtrage intelligent sur le parc OMNITECH',
      'Acquittement tracé (ISO 27001 A.5.7)',
      'Bulletin hebdomadaire le lundi matin',
    ],
  },
  {
    icon: BarChart3,
    title: 'Pilotage : satisfaction + métriques',
    description:
      'Enquêtes de satisfaction trimestrielles, taux de résolution tickets, qualité documentaire. Les données remontent automatiquement.',
    mockupKey: 'satisfaction-survey',
    bullets: [
      'Enquêtes programmées trimestriellement',
      'Export CSV pour Comité Direction',
      'Tendances sur 12 mois — glissement détecté',
    ],
  },
  {
    icon: Lightbulb,
    title: 'Bonne prise de décision',
    description:
      'Tout est tracé, auditable, partageable. Le chatbot IA peut vous préparer une synthèse avant un Comité Direction.',
    bullets: [
      'Astuce : "Prépare-moi un brief sur [sujet]"',
      'Bulletins RSSI archivés dans /veille',
      'Runbook "gestion-incident-securite" à jour',
    ],
  },
];

const ADMIN_STEPS: OnboardingStepData[] = [
  {
    icon: Settings2,
    title: 'Hub Administration — pilotage global',
    description:
      'Configuration utilisateurs, départements, workflows, feature flags, intégrations externes (LDAP, KnowBe4, 360Learning). L\'endroit où tout converge.',
    mockupKey: 'admin-hub',
    bullets: [
      'Utilisateurs, rôles, départements',
      'Workflows documentaires configurables',
      'Feature flags pour tester avant déploiement',
    ],
    cta: { label: 'Ouvrir l\'administration', href: '/admin' },
  },
  {
    icon: Ticket,
    title: 'Gérer les espaces de ticketing',
    description:
      'Créez des espaces distincts (IT, RH, Sécurité, Services Généraux). Chaque espace a ses catégories, son SLA, ses managers.',
    mockupKey: 'ticket-hub',
    bullets: [
      'Catégories standards + personnalisées par espace',
      'SLA overridable par priorité (heures)',
      'Membres : par user, par rôle, par département',
    ],
    cta: { label: 'Configurer les espaces', href: '/admin/ticket-spaces' },
  },
  {
    icon: UserCog,
    title: 'Sync LDAP + revues d\'accès',
    description:
      'La synchronisation AD tourne toutes les 30 minutes. Les campagnes d\'access review trimestrielles sont orchestrées depuis ici.',
    mockupKey: 'access-review',
    bullets: [
      'Force-sync en cas d\'urgence',
      'Campagne access review planifiable',
      'Exports CSV pour auditeur externe',
    ],
  },
  {
    icon: ScrollText,
    title: 'Logs audit & sécurité',
    description:
      'Toutes les actions sensibles sont auditées (création compte, publication document, accès admin). Recherche full-text + filtres par utilisateur/période/action.',
    mockupKey: 'audit-log',
    bullets: [
      'Rétention 3 ans online + 5 ans archive',
      'Export CSV signé pour audit externe',
      'Alertes CRITICAL remontent à la DirCom',
    ],
    cta: { label: 'Voir les logs', href: '/admin/audit' },
  },
  {
    icon: ClipboardList,
    title: 'Runbooks & procédures IT',
    description:
      'Publiez les procédures opérationnelles (création compte AD, déploiement poste, gestion incident). Utilisateurs les exécutent pas-à-pas avec checkboxes.',
    mockupKey: 'runbook-steps',
    bullets: [
      '10 runbooks IT pré-fournis (enrichis avril 2026)',
      'Historique d\'exécution tracé pour audit',
      'Markdown + versionning',
    ],
    cta: { label: 'Voir les runbooks', href: '/runbooks' },
  },
  {
    icon: Workflow,
    title: 'Workflows documentaires',
    description:
      'Configurez les templates : par type de doc, définissez qui relit, qui approuve, qui est notifié. Les règles sont appliquées automatiquement à chaque nouveau document.',
    bullets: [
      'Templates : POLICY / PROCEDURE / PLAN / RECORD',
      'Approbateurs chainables (2 niveaux + direction)',
      'Règle par département configurable',
    ],
    cta: { label: 'Configurer les workflows', href: '/admin/workflows' },
  },
];

const MANAGER_STEPS: OnboardingStepData[] = [
  {
    icon: Briefcase,
    title: 'Votre espace de ticketing',
    description:
      'En tant que manager, vous pilotez un ou plusieurs espaces (IT, Sécurité, Services Généraux…). Vous pouvez configurer les catégories, définir les SLA, gérer les membres.',
    mockupKey: 'ticket-hub',
    bullets: [
      'Catégories personnalisées métier (RMA, Déploiement…)',
      'SLA ajustables par priorité',
      'Gestion membres : users, rôles, départements',
    ],
    cta: { label: 'Ouvrir le hub tickets', href: '/tickets' },
  },
  {
    icon: Settings2,
    title: 'Configurer les catégories de votre espace',
    description:
      'Créez des catégories adaptées à votre métier. L\'IT a "RMA", "Déploiement". Les RH ont "Congés", "Paie". Les catégories se cumulent aux génériques (Incident, Demande…).',
    mockupKey: 'ticket-space-config',
    bullets: [
      'Checkboxes pour activer les catégories génériques',
      'Bouton "+ Ajouter" pour vos catégories métier',
      'Sauvegarde instantanée',
    ],
  },
  {
    icon: UsersIcon,
    title: 'Gérer les membres de l\'espace',
    description:
      'Ajoutez des collaborateurs par individu, par rôle entier, ou par département. Définissez leur niveau de permission : VIEWER → CREATOR → AGENT → MANAGER.',
    bullets: [
      'Un rôle AGENT peut être assigné à un ticket',
      'Un MANAGER peut tout faire (config, clôture)',
      'Cohabitation de permissions : le plus haut gagne',
    ],
  },
  {
    icon: ClipboardList,
    title: 'Publier vos procédures',
    description:
      'Si vous gérez une équipe, publiez vos runbooks internes : accueil nouveau collaborateur, incident type, revue trimestrielle. Versionnés, auditables.',
    mockupKey: 'runbook-steps',
    bullets: [
      'Markdown — import/export facile',
      'Étapes cochables pour exécution',
      'Historique d\'exécution préservé',
    ],
    cta: { label: 'Accéder aux runbooks', href: '/runbooks' },
  },
  {
    icon: FileCheck,
    title: 'Validation documentaire de 1er niveau',
    description:
      'En tant que manager, vous pouvez être désigné relecteur d\'un document. Validez la forme et la substance avant envoi à l\'approbateur final.',
    bullets: [
      'Notifications quand un doc vous attend',
      'Commentaires inline sur le document',
      'Rejet possible avec motif',
    ],
  },
];

const REVIEWER_STEPS: OnboardingStepData[] = [
  {
    icon: FileSearch,
    title: 'Documents à relire',
    description:
      'Votre rôle : contrôler la forme et le fond des documents avant approbation. Les documents qui vous attendent s\'affichent dans votre dashboard.',
    mockupKey: 'document-workflow',
    bullets: [
      'Notifications par email + badge rouge en-tête',
      'Délai suggéré : 3 jours ouvrés',
      'Commentez ou validez',
    ],
    cta: { label: 'Voir mes documents à relire', href: '/documents?status=IN_REVIEW' },
  },
  {
    icon: Workflow,
    title: 'Workflow documentaire',
    description:
      'Brouillon → En revue (vous) → Revue validée → Approbation (DIRECTION) → Publié. Chaque transition est tracée, signée, versionnée.',
    mockupKey: 'document-workflow',
    bullets: [
      'Vous pouvez rejeter avec motif (retourne brouillon)',
      'Les commentaires restent visibles dans l\'historique',
      'Rollback possible via admin si erreur',
    ],
  },
  {
    icon: StickyNote,
    title: 'Commentaires et annotations',
    description:
      'Annotez le document, laissez des commentaires inline, mentionnez un collègue avec @prenom pour lui envoyer une notification directe.',
    bullets: [
      '@mentions → notification instantanée',
      'Annotations visibles par tout le monde avec accès',
      'Thread par commentaire (réponse/résolution)',
    ],
  },
  {
    icon: Eye,
    title: 'Historique des versions',
    description:
      'Chaque publication crée une version. Consultez les diffs entre versions (texte ajouté/supprimé), comparez les PDF, restaurez une version antérieure si besoin.',
    bullets: [
      'Diff visuel texte (vert/rouge)',
      'Archive PDF de chaque version',
      'Restauration réservée admin',
    ],
  },
];

const COLLABORATEUR_STEPS: OnboardingStepData[] = [
  {
    icon: Ticket,
    title: 'Créer un ticket IT / RH / Sécurité',
    description:
      'Un problème technique, une demande RH, une alerte sécurité ? Les tickets sont organisés par espace. Cliquez sur le hub Tickets, choisissez l\'espace, décrivez votre demande.',
    mockupKey: 'ticket-hub',
    bullets: [
      'Joindre capture, fichier (pièces jointes)',
      'Suivre l\'avancement en temps réel',
      'Commentaires avec l\'agent assigné',
    ],
    cta: { label: 'Créer un ticket', href: '/tickets' },
  },
  {
    icon: BookOpen,
    title: 'Wiki & recherche intelligente',
    description:
      'Le wiki est votre base de connaissances interne. Procédures, guides, FAQ, annuaire enrichi. Le chatbot IA l\'utilise pour répondre à vos questions.',
    mockupKey: 'wiki-editor',
    bullets: [
      'Recherche full-text + sémantique',
      'Articles catégorisés par domaine',
      'Créez vos propres articles — validation collective',
    ],
    cta: { label: 'Explorer le wiki', href: '/wiki' },
  },
  {
    icon: ClipboardList,
    title: 'Runbooks — procédures étape par étape',
    description:
      'Accueil d\'un nouveau collègue, réservation salle, renouvellement badge : les procédures pas-à-pas avec checkboxes pour s\'assurer de ne rien oublier.',
    mockupKey: 'runbook-steps',
    bullets: [
      'Cochez chaque étape pour suivre votre avancement',
      'Historique d\'exécution conservé',
      'Les runbooks sensibles sont réservés aux rôles habilités',
    ],
  },
  {
    icon: FileCheck,
    title: 'Documents de référence',
    description:
      'Politiques, règlements, chartes : tout est centralisé et versionné. Les documents approuvés sont téléchargeables en PDF.',
    bullets: [
      'Recherche par titre, catégorie, auteur',
      'Favoris pour un accès rapide',
      'Notifications quand un doc est mis à jour',
    ],
    cta: { label: 'Voir les documents', href: '/documents' },
  },
  {
    icon: ShieldCheck,
    title: 'Charte & formations sécurité',
    description:
      'Charte informatique à signer une fois par an, quiz sécurité pour vérifier vos connaissances, modules KnowBe4 pour les formations obligatoires.',
    bullets: [
      'Signature électronique de la charte (DocuSeal)',
      'Quiz sécurité — fréquence trimestrielle',
      'Certificats de formation archivés dans votre profil',
    ],
    cta: { label: 'Mes chartes', href: '/chartes' },
  },
];

const AUDITEUR_STEPS: OnboardingStepData[] = [
  {
    icon: Shield,
    title: 'Veille cyber (lecture)',
    description:
      'Vous avez un accès en lecture à la veille cyber et aux acquittements. Utile pour un audit ponctuel (ISO 27001 A.5.7) ou une revue de conformité.',
    mockupKey: 'veille-feed',
    bullets: [
      'Alertes + acquittements horodatés',
      'Export CSV pour rapport d\'audit',
      'Bulletins hebdomadaires archivés',
    ],
  },
  {
    icon: ScrollText,
    title: 'Logs audit (lecture seule)',
    description:
      'Consultation des journaux d\'audit de l\'intranet : créations, modifications, suppressions, accès admin. Essentiel pour les contrôles de conformité.',
    mockupKey: 'audit-log',
    bullets: [
      'Filtres par utilisateur, action, période',
      'Export CSV signé (hash SHA-256)',
      'Rétention 3 ans + archive 5 ans',
    ],
  },
  {
    icon: Scale,
    title: 'Rapports de conformité',
    description:
      'Les rapports trimestriels ISO 27001 sont auto-générés et archivés. Accès en lecture aux politiques, procédures, enregistrements.',
    bullets: [
      'Mapping ISO 27001 ↔ documents internes',
      'KPI sécurité consolidés',
      'Preuves contrôles A.5 à A.18',
    ],
  },
];

const PRESTATAIRE_STEPS: OnboardingStepData[] = [
  {
    icon: ExternalLink,
    title: 'Portail externe — accès restreint',
    description:
      'Votre accès est volontairement limité aux documents nécessaires à votre prestation. NDA signé, durée d\'accès définie, activités tracées.',
    bullets: [
      'Uniquement les documents de votre périmètre contractuel',
      'Session courte (30 min inactivité = déconnexion)',
      'Toute action est loguée',
    ],
  },
  {
    icon: Ticket,
    title: 'Tickets que vous pouvez créer',
    description:
      'Vous pouvez créer des tickets dans un espace dédié "Prestataires". Les managers OMNITECH les traiteront en priorité selon votre SLA contractuel.',
    bullets: [
      'Espace prestataires — pas d\'accès aux autres',
      'Attachement contrats, PV, livrables',
      'Contact : votre référent OMNITECH',
    ],
  },
];

// ============================================================================
// Étape finale commune
// ============================================================================

const OUTRO_STEP: OnboardingStepData = {
  icon: Star,
  title: 'Vous êtes prêt à démarrer',
  description:
    'Vous avez parcouru l\'essentiel de l\'intranet OMNITECH — navigation, chatbot IA, documents, tickets, wiki, runbooks, veille cyber. Les ressources ci-dessous vous accompagnent au quotidien.',
  bullets: [
    '🧭 Relancer ce tour : menu utilisateur → « Relancer la visite guidée »',
    '💡 Astuces quotidiennes : widget sur votre dashboard (Précédente / Suivante)',
    '🤖 Chatbot IA : Ctrl+Shift+K — il connaît toute la doc OMNITECH',
    '⌨️ Palette de commandes : Ctrl+K pour tout trouver en 2 secondes',
    '❓ Aide détaillée : `/getting-started` — guide écrit du démarrage',
    '💬 Partager votre avis : menu utilisateur → « Partager mon avis »',
  ],
  cta: { label: 'Accéder au guide complet', href: '/getting-started' },
};

// ============================================================================
// Mapping rôle → étapes
// ============================================================================

const STEPS_BY_ROLE: Record<UserRole, OnboardingStepData[]> = {
  [UserRole.SUPER_ADMIN]: ADMIN_STEPS,
  [UserRole.ADMIN]: ADMIN_STEPS,
  [UserRole.DIRECTION]: DIRECTION_STEPS,
  [UserRole.MANAGER]: MANAGER_STEPS,
  [UserRole.REVIEWER]: REVIEWER_STEPS,
  [UserRole.COLLABORATEUR]: COLLABORATEUR_STEPS,
  [UserRole.AUDITEUR]: AUDITEUR_STEPS,
  [UserRole.PRESTATAIRE]: PRESTATAIRE_STEPS,
};

/**
 * Retourne le parcours d'onboarding personnalisé selon le rôle utilisateur.
 * Structure : [...COMMUN, ...SPÉCIFIQUE_RÔLE, OUTRO].
 *
 * Si le rôle est inconnu, fallback sur COLLABORATEUR (le moins privilégié des
 * rôles actifs — jamais d'étape sensible exposée par erreur).
 */
export function getOnboardingSteps(role: UserRole | string | undefined): OnboardingStepData[] {
  const roleSteps = role && STEPS_BY_ROLE[role as UserRole]
    ? STEPS_BY_ROLE[role as UserRole]
    : COLLABORATEUR_STEPS;
  return [...COMMON_STEPS, ...roleSteps, OUTRO_STEP];
}
