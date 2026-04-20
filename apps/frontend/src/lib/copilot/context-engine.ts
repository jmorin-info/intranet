/**
 * Context Engine — Declares page capabilities, actions, and workflows.
 *
 * Each page context includes:
 * - intent: what the page is for
 * - actions: what the user can do
 * - entities: what data is on the page
 * - workflows: suggested multi-step flows
 *
 * This is a static registry — no runtime overhead.
 */

export interface PageAction {
  id: string;
  label: string;
  icon: string;
  href?: string;
  routerAction?: 'push' | 'replace';
  queryParams?: Record<string, string>;
  description: string;
  roles?: string[]; // If set, only these roles see this action
}

export interface PageWorkflow {
  id: string;
  label: string;
  steps: string[];
  description: string;
}

export interface PageContext {
  module: string;
  intent: string;
  description: string;
  actions: PageAction[];
  workflows: PageWorkflow[];
  relatedPages: Array<{ label: string; href: string }>;
  helpText: string;
}

const PAGE_CONTEXTS: Record<string, PageContext> = {
  '/dashboard': {
    module: 'dashboard',
    intent: 'Vue d\'ensemble de votre activité et de vos tâches',
    description: 'Tableau de bord personnel avec statistiques, alertes et accès rapide aux actions prioritaires.',
    actions: [
      { id: 'create-doc', label: 'Créer un document', icon: 'FileText', href: '/documents/new', routerAction: 'push', description: 'Créer un nouveau document GED ISO 27001' },
      { id: 'create-ticket', label: 'Créer un ticket', icon: 'Ticket', href: '/tickets', queryParams: { create: 'true' }, routerAction: 'push', description: 'Ouvrir une demande de support IT' },
      { id: 'view-pending', label: 'File de validation', icon: 'FileCheck', href: '/documents/pending', routerAction: 'push', description: 'Voir les documents en attente de votre action', roles: ['REVIEWER', 'DIRECTION', 'ADMIN', 'SUPER_ADMIN'] },
      { id: 'view-alerts', label: 'Alertes sécurité', icon: 'AlertTriangle', href: '/alerts', routerAction: 'push', description: 'Consulter les alertes de sécurité actives' },
    ],
    workflows: [
      { id: 'daily-check', label: 'Revue quotidienne', steps: ['Vérifier les alertes P1', 'Traiter les documents en attente', 'Répondre aux tickets ouverts'], description: 'Routine de vérification quotidienne recommandée' },
    ],
    relatedPages: [
      { label: 'Documents', href: '/documents' },
      { label: 'Tickets', href: '/tickets' },
      { label: 'Incidents', href: '/incidents' },
    ],
    helpText: 'Votre tableau de bord s\'adapte à votre rôle. Personnalisez les widgets visibles via l\'icône d\'engrenage.',
  },
  '/documents': {
    module: 'documents',
    intent: 'Gestion documentaire ISO 27001',
    description: 'Créez, consultez et gérez les documents réglementaires. Chaque document suit un workflow de validation configurable.',
    actions: [
      { id: 'create-doc', label: 'Nouveau document', icon: 'Plus', href: '/documents/new', routerAction: 'push', description: 'Créer un document avec catégorie, classification et contrôles ISO' },
      { id: 'create-inline', label: 'Créer en ligne', icon: 'PenLine', href: '/documents/new-inline', routerAction: 'push', description: 'Créer un document avec l\'éditeur en ligne' },
      { id: 'view-pending', label: 'File de validation', icon: 'FileCheck', href: '/documents/pending', routerAction: 'push', description: 'Documents en attente de votre relecture ou approbation', roles: ['REVIEWER', 'DIRECTION', 'ADMIN', 'SUPER_ADMIN'] },
    ],
    workflows: [
      { id: 'doc-lifecycle', label: 'Cycle de vie documentaire', steps: ['Brouillon → Revue', 'Revue → Approbation', 'Approbation → Publication', 'Révision périodique'], description: 'Processus complet de gestion documentaire ISO 27001' },
    ],
    relatedPages: [
      { label: 'Procédures', href: '/procedures' },
      { label: 'Conformité', href: '/admin/compliance' },
      { label: 'Workflows', href: '/admin/workflows' },
    ],
    helpText: 'Filtrez par statut, catégorie ou classification. Le mode grille affiche les documents sous forme de cartes, le mode liste sous forme de tableau.',
  },
  '/tickets': {
    module: 'tickets',
    intent: 'Gestion des demandes et support IT',
    description: 'Créez et suivez vos demandes : support, déploiement, matériel, accès réseau.',
    actions: [
      { id: 'create-ticket', label: 'Nouveau ticket', icon: 'Plus', href: '/tickets', queryParams: { create: 'true' }, routerAction: 'push', description: 'Créer une demande de support avec catégorie et priorité' },
    ],
    workflows: [
      { id: 'ticket-flow', label: 'Cycle de vie d\'un ticket', steps: ['Ouvert → En cours', 'En cours → Résolu', 'Résolu → Fermé'], description: 'Processus standard de résolution' },
    ],
    relatedPages: [
      { label: 'Support IT', href: '/helpdesk' },
      { label: 'Self-service', href: '/helpdesk' },
    ],
    helpText: 'Les SLA sont calculés automatiquement selon la priorité. Les tickets critiques déclenchent une alerte immédiate.',
  },
  '/incidents': {
    module: 'incidents',
    intent: 'Déclaration et suivi des incidents de sécurité',
    description: 'Déclarez les incidents (intrusion, phishing, fuite, malware) et suivez l\'investigation conformément à l\'ISO 27001.',
    actions: [
      { id: 'declare-incident', label: 'Déclarer un incident', icon: 'AlertTriangle', href: '/incidents', routerAction: 'push', description: 'Signaler un événement de sécurité pour investigation' },
    ],
    workflows: [
      { id: 'incident-response', label: 'Réponse à incident', steps: ['Déclaration', 'Analyse d\'impact', 'Confinement', 'Éradication', 'Récupération', 'Leçons apprises'], description: 'ISO 27001 A.5.24 — Processus de gestion des incidents' },
    ],
    relatedPages: [
      { label: 'Veille cyber', href: '/veille' },
      { label: 'Alertes', href: '/alerts' },
    ],
    helpText: 'Chaque incident est tracé de la déclaration à la clôture. L\'historique complet est consultable dans le journal d\'audit.',
  },
  '/veille': {
    module: 'veille',
    intent: 'Veille cybersécurité et threat intelligence',
    description: 'Flux automatisés CERT-FR, ANSSI et NVD. Traitez les alertes et générez des bulletins hebdomadaires.',
    actions: [
      { id: 'refresh-feeds', label: 'Actualiser les flux', icon: 'RefreshCw', description: 'Collecter les dernières alertes depuis les sources RSS' },
      { id: 'generate-bulletin', label: 'Générer un bulletin', icon: 'FileText', description: 'Créer un résumé hebdomadaire des menaces', roles: ['ADMIN', 'SUPER_ADMIN', 'REVIEWER'] },
    ],
    workflows: [
      { id: 'veille-process', label: 'Processus de veille', steps: ['Collecte automatique', 'Tri par sévérité', 'Analyse d\'impact', 'Traitement (appliqué/N/A/risque accepté)', 'Bulletin hebdomadaire'], description: 'Cycle complet de veille cybersécurité' },
    ],
    relatedPages: [
      { label: 'Alertes actives', href: '/alerts' },
      { label: 'Incidents', href: '/incidents' },
    ],
    helpText: 'Les alertes sont automatiquement collectées toutes les heures. Filtrez par sévérité, produit ou période pour cibler votre analyse.',
  },
  '/admin': {
    module: 'admin',
    intent: 'Administration du système',
    description: 'Gestion des utilisateurs, départements, conformité, audit et configuration.',
    actions: [
      { id: 'manage-users', label: 'Gérer les utilisateurs', icon: 'Users', href: '/admin/users', routerAction: 'push', description: 'Comptes, rôles, départements et import CSV' },
      { id: 'view-compliance', label: 'Conformité ISO', icon: 'ShieldCheck', href: '/admin/compliance', routerAction: 'push', description: 'Couverture des 93 contrôles de l\'Annexe A' },
      { id: 'audit-log', label: 'Journal d\'audit', icon: 'ClipboardList', href: '/admin/audit', routerAction: 'push', description: 'Trace d\'audit ISO 27001 A.8.15' },
      { id: 'config', label: 'Configuration', icon: 'Settings', href: '/admin/config', routerAction: 'push', description: 'Paramètres système, LDAP, SMTP, intégrations' },
    ],
    workflows: [],
    relatedPages: [
      { label: 'Rapports', href: '/admin/reports' },
      { label: 'Dashboard RSSI', href: '/admin/rssi-dashboard' },
    ],
    helpText: 'L\'espace administration est réservé aux rôles ADMIN et SUPER_ADMIN. Chaque action est tracée dans le journal d\'audit.',
  },
  '/wiki': {
    module: 'wiki',
    intent: 'Base de connaissances collaborative',
    description: 'Créez et partagez des pages wiki : runbooks, FAQ, procédures, schémas d\'architecture.',
    actions: [
      { id: 'new-page', label: 'Nouvelle page', icon: 'Plus', href: '/wiki', routerAction: 'push', description: 'Créer une page avec éditeur riche (HTML, images, liens)' },
    ],
    workflows: [],
    relatedPages: [
      { label: 'Runbooks IT', href: '/runbooks' },
      { label: 'Procédures', href: '/procedures' },
    ],
    helpText: 'Le wiki est versionné — chaque modification est historisée. Vous pouvez restaurer une version antérieure à tout moment.',
  },
  '/news': {
    module: 'news',
    intent: 'Actualités et communications internes',
    description: 'Consultez les communications de l\'entreprise. Les administrateurs peuvent publier et cibler des audiences.',
    actions: [
      { id: 'compose', label: 'Rédiger un article', icon: 'PenLine', href: '/news/compose', routerAction: 'push', description: 'Créer et publier une actualité interne', roles: ['ADMIN', 'SUPER_ADMIN'] },
    ],
    workflows: [],
    relatedPages: [
      { label: 'Tableau de bord', href: '/dashboard' },
    ],
    helpText: 'Les articles épinglés restent en haut de la liste. Filtrez par catégorie pour cibler votre lecture.',
  },
  '/profile': {
    module: 'profile',
    intent: 'Gestion de votre profil et préférences',
    description: 'Mettez à jour vos informations personnelles, votre mot de passe et vos préférences d\'affichage.',
    actions: [
      { id: 'edit-profile', label: 'Modifier le profil', icon: 'User', description: 'Photo, coordonnées, compétences, langues' },
      { id: 'change-password', label: 'Changer le mot de passe', icon: 'Key', description: 'Minimum 12 caractères, majuscule, minuscule, chiffre, caractère spécial' },
      { id: 'setup-mfa', label: 'Configurer le MFA', icon: 'Shield', href: '/mfa', routerAction: 'push', description: 'Activer la double authentification' },
      { id: 'export-gdpr', label: 'Exporter mes données', icon: 'Download', description: 'Export RGPD de vos données personnelles' },
    ],
    workflows: [],
    relatedPages: [
      { label: 'MFA', href: '/mfa' },
      { label: 'Mes signatures', href: '/signatures' },
    ],
    helpText: 'Votre profil est visible dans l\'annuaire. Ajoutez votre photo pour faciliter la collaboration.',
  },
};

/**
 * Get the context for the current page path.
 * Falls back to a generic context if no specific one exists.
 */
export function getPageContext(path: string): PageContext {
  // Exact match first
  if (PAGE_CONTEXTS[path]) return PAGE_CONTEXTS[path];

  // Try base path (e.g., /documents/123 → /documents)
  const basePath = '/' + path.split('/').filter(Boolean).slice(0, 1).join('/');
  if (PAGE_CONTEXTS[basePath]) return PAGE_CONTEXTS[basePath];

  // Admin sub-pages → admin context
  if (path.startsWith('/admin')) return PAGE_CONTEXTS['/admin']!;

  // Generic fallback
  return {
    module: 'general',
    intent: 'Page de l\'intranet OMNITECH Security',
    description: 'Naviguez dans l\'intranet pour accéder à vos outils de travail.',
    actions: [
      { id: 'go-dashboard', label: 'Tableau de bord', icon: 'LayoutDashboard', href: '/dashboard', routerAction: 'push', description: 'Retourner au tableau de bord' },
      { id: 'search', label: 'Rechercher', icon: 'Search', href: '/search', routerAction: 'push', description: 'Rechercher dans tout l\'intranet' },
    ],
    workflows: [],
    relatedPages: [],
    helpText: 'Utilisez la palette de commandes (⌘K) pour naviguer rapidement.',
  };
}

/**
 * Get actions filtered by user role.
 */
export function getActionsForRole(context: PageContext, userRole: string): PageAction[] {
  return context.actions.filter(a => !a.roles || a.roles.includes(userRole));
}
