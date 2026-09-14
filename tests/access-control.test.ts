import assert from 'node:assert/strict';
import test from 'node:test';

import { isPublicCompanionPath, unauthenticatedDestination } from '../lib/access-control.ts';

test('access policy exposes only landing and authentication routes to visitors', () => {
  assert.equal(isPublicCompanionPath('/'), true);
  assert.equal(isPublicCompanionPath('/api/auth/login-form'), true);
  assert.equal(isPublicCompanionPath('/api/auth/logout'), true);

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
