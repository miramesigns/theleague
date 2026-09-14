const AUTH_ROUTE_PREFIX = '/api/auth/';
const PUBLIC_ASSET_PATHS = new Set([
  '/app-icon-192.png',
  '/apple-icon.png',
  '/favicon.ico',
  '/icon.png',
  '/manifest.webmanifest',
  '/the-league-2026-championship-belt.png',
]);

export function isPublicCompanionPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith(AUTH_ROUTE_PREFIX) || PUBLIC_ASSET_PATHS.has(pathname);
}

export function unauthenticatedDestination(_pathname: string): string {
  return '/?auth=open';
}
