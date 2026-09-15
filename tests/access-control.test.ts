import assert from 'node:assert/strict';
import test from 'node:test';

import { isPublicCompanionPath, unauthenticatedDestination } from '../lib/access-control.ts';

test('access policy exposes only landing and authentication routes to visitors', () => {
  assert.equal(isPublicCompanionPath('/'), true);
  assert.equal(isPublicCompanionPath('/api/auth/login-form'), true);
  assert.equal(isPublicCompanionPath('/api/auth/logout'), true);
  assert.equal(isPublicCompanionPath('/manifest.webmanifest'), true);
  assert.equal(isPublicCompanionPath('/app-icon-192.png'), true);
  assert.equal(isPublicCompanionPath('/icon.png'), true);
  assert.equal(isPublicCompanionPath('/apple-icon.png'), true);
  assert.equal(isPublicCompanionPath('/the-league-2026-banner.jpg'), true);
  assert.equal(isPublicCompanionPath('/the-league-2026-championship-belt.png'), true);

  assert.equal(isPublicCompanionPath('/scores'), false);
  assert.equal(isPublicCompanionPath('/lineup'), false);
  assert.equal(isPublicCompanionPath('/scores/week/1/matchup/0004'), false);
  assert.equal(isPublicCompanionPath('/api/mfl/export'), false);
  assert.equal(isPublicCompanionPath('/api/mfl/lineup'), false);
});

test('access policy sends unauthenticated page visits to the automatic sign-in landing', () => {
  assert.equal(unauthenticatedDestination('/scores'), '/?auth=open');
  assert.equal(unauthenticatedDestination('/scores/week/1/matchup/0004'), '/?auth=open');
});
