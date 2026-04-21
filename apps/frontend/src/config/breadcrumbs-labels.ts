/**
 * Mapping des slugs techniques d'URL vers des libellés FR lisibles
 * pour les Breadcrumbs globaux.
 *
 * Lecture :
 *   - Clé = segment brut de l'URL (ex: "tickets", "admin/feedback")
 *   - Valeur = libellé affiché + lookup optionnel
 *
 * Si un segment est absent du mapping, le label fallback = le segment avec
 * capitalisation naïve ("tickets" → "Tickets").
 *
 * Pour les URLs avec ID dynamique (ex: "/documents/[id]"), on peut définir
 * un lookup async qui résout le titre depuis l'API. Le Breadcrumb affiche
 * "Chargement…" pendant la résolution, puis le vrai titre.
 */

export interface BreadcrumbLabelConfig {
  /** Libellé FR affiché (pour segments statiques). */
  label?: string;
  /**
   * Pour les segments dynamiques (UUID ou slug d'entité) : retourne le
   * label à afficher en interrogeant l'API via l'id du segment précédent.
   * Le `prevSegment` est le segment juste avant (ex: "documents") qui
   * permet de savoir dans quelle entité chercher.
   */
  dynamicLookup?: (id: string, prevSegment: string) => Promise<string | null>;
}

/**
 * Fallback : capitalise la première lettre, remplace tirets par espaces.
 * "ticket-spaces" → "Ticket spaces"
 */
export function humanizeSegment(seg: string): string {
  const cleaned = seg.replace(/-/g, ' ').replace(/_/g, ' ');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Reconnaît si un segment est un identifiant dynamique (UUID ou slug long).
 */
export function isDynamicSegment(seg: string): boolean {
  // UUID v4
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  // Longue chaîne sans espaces qui ressemble à un slug (wiki, album)
  if (seg.length > 24 && /^[a-z0-9][a-z0-9-]+$/i.test(seg)) return true;
  return false;
}

/**
 * Mapping statique segment → label FR.
 */
export const BREADCRUMBS_LABELS: Record<string, BreadcrumbLabelConfig> = {
  // Mon espace
  dashboard: { label: 'Tableau de bord' },
  profile: { label: 'Mon profil' },
  notifications: { label: 'Notifications' },
  calendar: { label: 'Calendrier' },
  mfa: { label: 'Authentification (MFA)' },
  certificates: { label: 'Mes certifications' },
  signatures: { label: 'Mes signatures' },
  testimonials: { label: 'Mon avis' },

  // Travail / Collaboration
  documents: { label: 'Documents' },
  procedures: { label: 'Procédures' },
  tickets: { label: 'Tickets' },
  news: { label: 'Actualités' },
  wiki: { label: 'Wiki' },
  runbooks: { label: 'Runbooks' },
  directory: { label: 'Annuaire' },
  files: { label: 'Fichiers réseau' },
  search: { label: 'Recherche' },
  quiz: { label: 'Quiz sécurité' },
  satisfaction: { label: 'Satisfaction' },
  media: { label: 'Médiathèque' },
  albums: { label: 'Albums' },

  // Sécurité / Conformité
  incidents: { label: 'Incidents' },
  alerts: { label: 'Alertes' },
  veille: { label: 'Veille cyber' },
  chartes: { label: 'Chartes' },
  helpdesk: { label: 'Helpdesk' },
  tips: { label: 'Astuces' },

  // Admin
  admin: { label: 'Administration' },
  users: { label: 'Utilisateurs' },
  departments: { label: 'Départements' },
  'ldap-pending': { label: 'Validation LDAP' },
  'external-access': { label: 'Accès externes' },
  onboarding: { label: 'Onboarding' },
  compliance: { label: 'Conformité ISO' },
  workflows: { label: "Workflows d'approbation" },
  'access-reviews': { label: "Revue d'accès" },
  audit: { label: 'Audit' },
  'ad-audit': { label: 'Audit AD' },
  reports: { label: 'Rapports' },
  'it-exports': { label: 'Exports IT' },
  'system-health': { label: 'Santé système' },
  'system-monitoring': { label: 'Monitoring système' },
  config: { label: 'Configuration' },
  spaces: { label: 'Espaces & modules' },
  backups: { label: 'Sauvegardes' },
  'rssi-dashboard': { label: 'Dashboard RSSI' },
  feedback: { label: 'Avis & enquêtes' },
  'ticket-spaces': { label: 'Espaces de ticketing' },

  // Outils
  tools: { label: 'Outils' },
  pdf: { label: 'PDF' },

  // Sous-routes
  new: { label: 'Nouveau' },
  'new-inline': { label: 'Nouveau (inline)' },
  edit: { label: 'Éditer' },
  editor: { label: 'Éditeur' },
  compose: { label: 'Rédiger' },
  pending: { label: 'En attente' },
  import: { label: 'Importer' },
  versions: { label: 'Versions' },
  'smb-editor': { label: 'Éditeur SMB' },
  contacts: { label: 'Contacts' },
  organigramme: { label: 'Organigramme' },
  'getting-started': { label: 'Démarrage' },
  changelog: { label: 'Journal des modifications' },
  extranet: { label: 'Extranet' },
  hub: { label: 'Hub' },
  work: { label: 'Travail' },
  security: { label: 'Sécurité' },

  // Chat
  chat: { label: 'Chat IA' },

  // Timeline
  timeline: { label: 'Chronologie' },

  // v2
  v2: { label: 'v2' },
};

/**
 * Dynamic lookups pour les entités (activés après la mise en place).
 * On peut les enrichir progressivement au fur et à mesure.
 */
export const DYNAMIC_LABEL_LOOKUPS: Record<string, (id: string) => Promise<string | null>> = {
  // Exemples : à brancher au cas par cas quand nécessaire
  // documents: async (id) => { const { data } = await api.get(`/documents/${id}`); return data?.title ?? null; },
  // tickets: async (id) => { const { data } = await api.get(`/tickets/${id}`); return data?.title ?? null; },
};
