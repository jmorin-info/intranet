/**
 * Types specifiques au module Registre Documentaire (REG_016).
 *
 * Une `RegistreRow` correspond a une ligne consolidee de la vue admin
 * "Registre Documentaire SMSI" telle que decrite dans REG_016 :
 *
 *   A. Reference                          -> reference
 *   B. Reference parente                  -> parentReference
 *   C. Categorie                          -> category + categoryCode
 *   D. Niveau pyramide (PRO_040 §7.1)     -> documentLevel
 *   E. Titre                              -> title
 *   F. Statut                             -> status
 *   G. Classification (POL_015 §5)        -> classification {value,label}
 *   H. Priorite                           -> priority
 *   I. Bloquant                           -> blocking
 *   J. Proprietaire                       -> owner
 *   K. Approbateur attendu                -> expectedApprover
 *   L. Controles ISO 27001 lies           -> isoControls
 *   M. Version courante                   -> currentVersion
 *   N. Periodicite de revue               -> reviewPeriodicity
 *   O. Prochaine revue                    -> nextReviewDate
 *   P. Fichier disponible                 -> hasFile / formats
 *   Q. Stockage externe (SharePoint…)     -> externalStorageProvider / Path
 *
 * Cette interface est CONSOMMEE par le frontend admin/registre via l'API
 * REST. Toute evolution doit etre coordonnee avec apps/frontend/src/app/
 * admin/registre.
 */
export interface RegistreRow {
  id: string;
  reference: string;
  parentReference: string | null;
  category: string;
  categoryCode: string;
  documentLevel: string | null;
  title: string;
  status: string;
  classification: {
    value: string;
    label: string;
  };
  priority: string | null;
  blocking: boolean;
  owner: {
    id: string;
    name: string;
  } | null;
  expectedApprover: {
    id: string;
    name: string;
  } | null;
  isoControls: Array<{
    code: string;
    title: string;
  }>;
  currentVersion: {
    version: string;
  } | null;
  reviewPeriodicity: string | null;
  nextReviewDate: Date | null;
  hasFile: boolean;
  /** Contrôle de cohérence PGID §15.1 automatisé (« Conforme » ou anomalie). */
  coherence: string;
  formats: string[];
  externalStorageProvider: string | null;
  externalStoragePath: string | null;
}

/**
 * Champs autorises pour le tri serveur de `/admin/registre`.
 *
 * Whitelist STRICTE — toute valeur hors de cette liste doit etre traitee
 * comme invalide cote controller (fallback sur 'reference'). Empeche
 * l'injection d'orderBy arbitraire dans Prisma.
 *
 * NB: `name` est un alias logique pour la colonne `title` du modele Document
 * (cf. RegistreRow.title), exposee pour homogeneite avec l'UI.
 */
export type RegistreSortBy = "reference" | "name" | "priority" | "documentLevel" | "updatedAt";

export const REGISTRE_SORT_BY_VALUES: readonly RegistreSortBy[] = [
  "reference",
  "name",
  "priority",
  "documentLevel",
  "updatedAt",
] as const;

export type RegistreSortDir = "asc" | "desc";

/** Borne haute du pageSize accepte par le controller (defense en profondeur). */
export const REGISTRE_MAX_PAGE_SIZE = 200;
/** pageSize par defaut quand le client n'en fournit pas. */
export const REGISTRE_DEFAULT_PAGE_SIZE = 50;

/**
 * Filtres acceptes en query string sur `/admin/registre` et
 * `/admin/registre/export`.
 *
 * NB: les params de pagination/tri/recherche ne s'appliquent qu'a `/admin/registre`
 * (vue UI). L'export CSV ignore ces champs et exporte le perimetre filtre complet.
 */
export interface RegistreFilter {
  level?: string;
  category?: string;
  priority?: string;
  blocking?: boolean;
  classification?: string;

  /**
   * Recherche full-text case-insensitive — applique en OR sur les champs
   * `reference`, `parentReference` et `title` (alias "name" pour l'UI).
   * Espace de gauche/droite trim cote controller.
   */
  search?: string;

  /** Champ de tri (whitelist stricte, cf. RegistreSortBy). Defaut: 'reference'. */
  sortBy?: RegistreSortBy;
  /** Direction de tri. Defaut: 'asc'. */
  sortDir?: RegistreSortDir;
  /** Page 1-indexee. Defaut: 1. */
  page?: number;
  /** Taille de page (1..REGISTRE_MAX_PAGE_SIZE). Defaut: REGISTRE_DEFAULT_PAGE_SIZE. */
  pageSize?: number;
}

/**
 * Reponse paginee retournee par `GET /admin/registre`.
 *
 * BREAKING CHANGE (2026-06-13) : auparavant l'endpoint renvoyait
 * `{ items, total }` sans pagination. Le frontend admin doit maintenant
 * lire `data.items` au lieu de `data` directement, et peut s'appuyer sur
 * `page`/`pageSize` pour la navigation.
 */
export interface RegistrePage<TRow> {
  items: TRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Reponse renvoyee par `/admin/registre/stats` — counts par dimension pour
 * alimenter le tableau de bord admin.
 */
export interface RegistreStats {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byClassification: Record<string, number>;
  byStatus: Record<string, number>;
  blocking: number;
  /** Nombre de documents priorité CRITICAL (carte « Critiques » du registre). */
  critical: number;
}
