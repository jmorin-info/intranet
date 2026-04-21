/**
 * Build the absolute URL for an avatar image.
 * The DB stores relative paths like `/storage/avatars/xxx.png`.
 * The backend serves these at `/api/v1/storage/avatars/xxx.png`.
 */
export function getAvatarUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;

  // NEXT_PUBLIC_API_URL usually ends in /api — backend mounts routes under /api/v1.
  const raw = process.env.NEXT_PUBLIC_API_URL
    || (typeof window !== 'undefined'
      ? window.location.origin.replace(':3001', ':3000') + '/api'
      : 'http://localhost:3000/api');
  const apiBase = raw.replace(/\/api\/?$/, '/api/v1');

  // url is like "/storage/avatars/xxx.png" → apiBase + url = "http://host:3000/api/v1/storage/avatars/xxx.png"
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}
