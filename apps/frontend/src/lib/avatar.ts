/**
 * Build the absolute URL for an avatar image.
 * The DB stores relative paths like `/storage/avatars/xxx.png`.
 * The backend serves these at `/api/storage/avatars/xxx.png`.
 */
export function getAvatarUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;

  // Use the API URL from env (includes /api prefix)
  const apiBase = process.env.NEXT_PUBLIC_API_URL
    || (typeof window !== 'undefined'
      ? window.location.origin.replace(':3001', ':3000') + '/api'
      : 'http://localhost:3000/api');

  // url is like "/storage/avatars/xxx.png" → apiBase + url = "http://host:3000/api/storage/avatars/xxx.png"
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}
