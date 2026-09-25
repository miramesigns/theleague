import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasValidCronAuthorization,
  isCronPushPath,
  isPublicCompanionPath,
  unauthenticatedDestination,
} from '../lib/access-control.ts';

test('access policy exposes only landing and authentication routes to visitors', () => {
  assert.equal(isPublicCompanionPath('/'), true);
  assert.equal(isPublicCompanionPath('/api/auth/login-form'), true);
  assert.equal(isPublicCompanionPath('/api/auth/logout'), true);
  assert.equal(isPublicCompanionPath('/manifest.webmanifest'), true);
  assert.equal(isPublicCompanionPath('/app-icon-192.png'), true);
  assert.equal(isPublicCompanionPath('/icon.png'), true);
  assert.equal(isPublicCompanionPath('/apple-icon.png'), true);
  assert.equal(isPublicCompanionPath('/sw.js'), true);
  assert.equal(isPublicCompanionPath('/mfl-banner-1200x450.jpg'), true);
  assert.equal(isPublicCompanionPath('/the-league-2026-banner.jpg'), true);
  assert.equal(isPublicCompanionPath('/the-league-2026-championship-belt.png'), true);
  assert.equal(isPublicCompanionPath('/the-league-2026-hero.png'), true);
  assert.equal(isPublicCompanionPath('/the-league-2026-hero-clean.png'), true);
  assert.equal(isPublicCompanionPath('/the-league-2026-hero-new.png'), true);

  assert.equal(isPublicCompanionPath('/scores'), false);
  assert.equal(isPublicCompanionPath('/lineup'), false);
  assert.equal(isPublicCompanionPath('/scores/week/1/matchup/0004'), false);
  assert.equal(isPublicCompanionPath('/api/mfl/export'), false);
  assert.equal(isPublicCompanionPath('/api/mfl/lineup'), false);
  assert.equal(isPublicCompanionPath('/api/push/poll'), false);
  assert.equal(isPublicCompanionPath('/api/push/send'), false);
});

test('cron push paths accept Bearer CRON_SECRET without session', () => {
  assert.equal(isCronPushPath('/api/push/poll'), true);
  assert.equal(isCronPushPath('/api/push/send'), true);
  assert.equal(isCronPushPath('/api/push/subscribe'), false);

  assert.equal(hasValidCronAuthorization('Bearer secret-value', 'secret-value'), true);
  assert.equal(hasValidCronAuthorization('Bearer wrong', 'secret-value'), false);
  assert.equal(hasValidCronAuthorization(null, 'secret-value'), false);
  assert.equal(hasValidCronAuthorization('Bearer secret-value', ''), false);
  assert.equal(hasValidCronAuthorization('Bearer secret-value', null), false);
});

test('access policy sends unauthenticated page visits to the sign-in landing', () => {
  assert.equal(unauthenticatedDestination('/scores'), '/?auth=open');
  assert.equal(unauthenticatedDestination('/scores/week/1/matchup/0004'), '/?auth=open');
});
