const AUTH_ROUTE_PREFIX = '/api/auth/';

export function isPublicCompanionPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith(AUTH_ROUTE_PREFIX);
}

export function unauthenticatedDestination(_pathname: string): string {
  return '/?auth=open';
}
