import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/logout', '/chartes', '/forgot-password', '/reset-password', '/welcome'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    // Prevent redirect loops: authenticated users hitting /login are sent to /dashboard.
    // We detect the session via the refreshToken httpOnly cookie (set by the backend).
    if (pathname.startsWith('/login')) {
      const hasSession = request.cookies.has('refreshToken');
      if (hasSession) {
        const dashboardUrl = new URL('/dashboard', request.url);
        return NextResponse.redirect(dashboardUrl);
      }
    }
    return NextResponse.next();
  }

  // Allow Next.js internals, static files, PWA files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next();
  }

  // Server-side auth gate removed: the refreshToken cookie has path=/api/auth/refresh
  // so it is NOT sent on navigation requests to /dashboard etc. The client-side
  // AuthProvider (fetchMe + JWT validation) is the authoritative auth gate.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|pdf\\.worker|manifest\\.json|sw\\.js).*)'],
};
