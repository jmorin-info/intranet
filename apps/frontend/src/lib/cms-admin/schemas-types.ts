/**
 * Types partagés du registry de schémas form-driven CMS.
 *
 * Séparé de `schemas.ts` pour permettre à `nav-icons.ts` (qui contient
 * la whitelist d'icônes Lucide) d'exporter ses options sans dépendre du
 * gros module schemas.ts — évite un cycle d'import entre les 2.
 */

export interface EnumOption {
  value: string;
  label: string;
}
