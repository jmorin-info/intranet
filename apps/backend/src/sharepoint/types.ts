/**
 * Types Microsoft Graph utilises par le module SharePoint sync.
 *
 * On ne modelise QUE les champs utilises — Graph renvoie bien plus, mais
 * on garde le typage etroit pour eviter de propager des champs incertains.
 *
 * Reference : https://learn.microsoft.com/en-us/graph/api/resources/driveitem
 */

/** Reponse OAuth2 client_credentials sur /oauth2/v2.0/token. */
export interface MsAppTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number; // secondes
  ext_expires_in?: number;
  scope?: string;
}

/**
 * Identite Graph d'un utilisateur / groupe / application.
 * Utilise dans createdBy/lastModifiedBy.
 */
export interface MsIdentity {
  displayName?: string;
  email?: string;
  id?: string;
}

export interface MsIdentitySet {
  user?: MsIdentity;
  application?: MsIdentity;
  device?: MsIdentity;
}

/** Reference vers le drive parent d'un driveItem. */
export interface MsItemReference {
  driveId?: string;
  driveType?: string;
  id?: string;
  name?: string;
  path?: string;
  siteId?: string;
}

/** Facette indiquant que le driveItem est un fichier (avec hash + mimeType). */
export interface MsFileFacet {
  mimeType?: string;
  hashes?: {
    quickXorHash?: string;
    sha1Hash?: string;
    sha256Hash?: string;
  };
}

/** Facette indiquant que le driveItem est un dossier. */
export interface MsFolderFacet {
  childCount?: number;
}

/**
 * driveItem Microsoft Graph (fichier OU dossier dans une bibliotheque
 * SharePoint / un drive OneDrive). On itere dessus pour synchroniser.
 */
export interface MsDriveItem {
  id: string;
  name?: string;
  webUrl?: string;
  eTag?: string;
  cTag?: string;
  size?: number;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  createdBy?: MsIdentitySet;
  lastModifiedBy?: MsIdentitySet;
  parentReference?: MsItemReference;
  file?: MsFileFacet;
  folder?: MsFolderFacet;
  /** Si present, l'item a ete supprime cote SharePoint. */
  deleted?: { state?: string };
}

/** Drive (= bibliotheque documentaire SharePoint dans le contexte GED). */
export interface MsDrive {
  id: string;
  name?: string;
  description?: string;
  driveType?: string;
  webUrl?: string;
}

/** Site SharePoint. */
export interface MsSite {
  id: string;
  name?: string;
  displayName?: string;
  webUrl?: string;
}

/** Wrapper paginate Graph. */
export interface MsGraphList<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

/** Resultat d'un sync de bibliotheque. */
export interface SharePointSyncResult {
  siteId: string;
  libraryId: string;
  /** driveItems nouveaux dans SP — non crees automatiquement, juste comptes. */
  unmapped: number;
  /** Documents existants dont les metadonnees externes ont ete rafraichies. */
  updated: number;
  /** driveItems sans changement (etag identique). */
  skipped: number;
  /** Erreurs par item (id Graph + message). */
  errors: Array<{ itemId: string; message: string }>;
  /** Nombre total de driveItems traites. */
  total: number;
  startedAt: string;
  finishedAt: string;
}

/** Statut renvoye par GET /admin/sharepoint/status. */
export interface SharePointStatus {
  enabled: boolean;
  configured: boolean;
  /** Date de la derniere sync reussie (toutes bibliotheques confondues). */
  lastSyncAt: string | null;
}

/** Options d'execution d'un sync. */
export interface SyncLibraryOptions {
  /** Limite de driveItems traites — pour les premiers tests / smoke runs. */
  maxItems?: number;
  /** userId qui a declenche le sync (pour audit). */
  triggeredBy?: string;
}
