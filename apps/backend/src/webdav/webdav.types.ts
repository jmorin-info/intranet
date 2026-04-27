/**
 * Types partagés par le module WebDAV (Obsidian sync — Wave B item 16).
 */

/**
 * Représentation virtuelle d'un nœud du vault Obsidian.
 *  - "directory" : pseudo-dossier (catégorie wiki, ou racine)
 *  - "file"      : page wiki (.md) avec son contenu Markdown + frontmatter
 */
export interface VaultNode {
  type: "file" | "directory";
  /** Chemin POSIX relatif au vault (ex: "runbooks/onboarding.md"). */
  path: string;
  /** Nom de fichier ou dossier (segment terminal). */
  name: string;
  /** Taille (octets) — nulle pour les dossiers. */
  size?: number;
  /** Last-modified ISO. */
  modified?: string;
  /** Created ISO. */
  created?: string;
  /** ETag faible (suffit pour Obsidian Remotely Save). */
  etag?: string;
  /** Contenu pour les fichiers (uniquement quand explicit). */
  content?: string;
}

/** Frontmatter YAML léger pour la sync : metadata ↔ champs WikiPage. */
export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}
