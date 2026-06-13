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
  formats: string[];
  externalStorageProvider: string | null;
  externalStoragePath: string | null;
}

/**
 * Filtres acceptes en query string sur `/admin/registre` et
 * `/admin/registre/export`.
 */
export interface RegistreFilter {
  level?: string;
  category?: string;
  priority?: string;
  blocking?: boolean;
  classification?: string;
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
}
