import { api } from './api';

/**
 * Generic blob downloader for API endpoints that return binary data (CSV, Excel, PDF...).
 * Uses the authenticated axios client so the JWT is sent via header, not in the URL.
 */
export async function downloadFromApi(
  url: string,
  filename: string,
  params?: Record<string, unknown>,
): Promise<void> {
  const response = await api.get(url, { params, responseType: 'blob' });
  const blob =
    response.data instanceof Blob ? response.data : new Blob([response.data]);
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
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
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '/api/v1');
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
  const url = `${apiUrl}/documents/${documentId}/versions/${versionId}/download`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Download failed');

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  if (options?.inline) {
    window.open(blobUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  } else {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = options?.filename || 'document';
    a.click();
    URL.revokeObjectURL(blobUrl);
  }
}
