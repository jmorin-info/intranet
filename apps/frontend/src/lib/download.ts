import { api } from "./api";

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/zip": "zip",
  "application/x-7z-compressed": "7z",
  "application/x-rar-compressed": "rar",
  "application/gzip": "gz",
  "application/json": "json",
  "application/xml": "xml",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/html": "html",
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/**
 * Derive a safe file extension from a MIME type or a source URL.
 * Fallback order: MIME lookup → extension from URL → 'bin'.
 */
export function extensionForMime(
  mime?: string | null,
  fallbackUrl?: string | null,
): string {
  if (mime) {
    const normalized = (mime.toLowerCase().split(";")[0] ?? "").trim();
    if (normalized && MIME_EXTENSIONS[normalized])
      return MIME_EXTENSIONS[normalized]!;
  }
  if (fallbackUrl) {
    const clean = (fallbackUrl.split("?")[0] ?? "").split("#")[0] ?? "";
    const lastSegment = clean.split("/").pop() || "";
    const lastDot = lastSegment.lastIndexOf(".");
    if (lastDot > 0 && lastDot < lastSegment.length - 1) {
      const ext = lastSegment.slice(lastDot + 1);
      if (/^[a-z0-9]{1,8}$/i.test(ext)) return ext.toLowerCase();
    }
  }
  return "bin";
}

/**
 * Build a safe filename for a document version download, preserving its real
 * extension even when the reference already contains dots (e.g. "v1.0").
 */
export function buildDocumentFilename(
  reference: string,
  versionNumber: string | number | undefined,
  mime?: string | null,
  fileUrl?: string | null,
): string {
  const ext = extensionForMime(mime, fileUrl);
  const version = versionNumber != null ? String(versionNumber) : "1";
  return `${reference}-v${version}.${ext}`;
}

/**
 * Generic blob downloader for API endpoints that return binary data (CSV, Excel, PDF...).
 * Uses the authenticated axios client so the JWT is sent via header, not in the URL.
 */
export async function downloadFromApi(
  url: string,
  filename: string,
  params?: Record<string, unknown>,
): Promise<void> {
  const response = await api.get(url, { params, responseType: "blob" });
  const blob =
    response.data instanceof Blob ? response.data : new Blob([response.data]);
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(objectUrl), 100);
}

/**
 * Securely download or preview a document version using Authorization header.
 * Does NOT leak the JWT token in query parameters.
 */
export async function downloadDocument(
  documentId: string,
  versionId: string,
  options?: { inline?: boolean; filename?: string },
): Promise<void> {
  const apiUrl = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api"
  ).replace(/\/api\/?$/, "/api/v1");
  const token =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : "";
  const url = `${apiUrl}/documents/${documentId}/versions/${versionId}/download`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error("Download failed");

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  if (options?.inline) {
    window.open(blobUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } else {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = options?.filename || "document";
    a.click();
    URL.revokeObjectURL(blobUrl);
  }
}
