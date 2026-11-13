/** Les fichiers privés passent par une route qui contrôle la session et les ACL. */
export function wikiAttachmentUrl(url: string): string {
  return url.replace(/^\/uploads\/wiki\//, "/api/v1/wiki/attachments/");
}

export function certificateAssetUrl(id: string, kind: "download" | "thumbnail" = "download"): string {
  return `/api/v1/certificates/${encodeURIComponent(id)}/${kind}`;
}
