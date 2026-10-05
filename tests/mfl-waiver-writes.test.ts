import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBlindBidPicks,
  buildBlindBidWaiverRequestBody,
  extractMflErrorMessage,
  formatBidAmountForPicks,
  humanizeWaiverClaimError,
  importBlindBidWaiverClaim,
  normalizeBidAmount,
  normalizeDropPlayerIds,
  normalizePlayerId,
  validateWaiverClaimInput,
} from '../lib/mfl-waiver-writes.ts';

test('normalizePlayerId accepts numeric MFL player ids only', () => {
  assert.equal(normalizePlayerId('16168'), '16168');
  assert.equal(normalizePlayerId(' 16168 '), '16168');
  assert.equal(normalizePlayerId(''), null);
  assert.equal(normalizePlayerId('FP_0001_2027_3'), null);
  assert.equal(normalizePlayerId('bad id'), null);
});

test('normalizeDropPlayerIds drops blanks, duplicates, and 0000', () => {
  assert.deepEqual(normalizeDropPlayerIds(['15222', '15222', '0000', '', 'nope']), ['15222']);
  assert.deepEqual(normalizeDropPlayerIds(null), []);
});

test('normalizeBidAmount and formatBidAmountForPicks keep FAAB values stable', () => {
  assert.equal(normalizeBidAmount(1_500_000), 1_500_000);
  assert.equal(normalizeBidAmount('1500000'), 1_500_000);
  assert.equal(normalizeBidAmount(-1), -1);
  assert.equal(normalizeBidAmount('nope'), null);
  assert.equal(formatBidAmountForPicks(1_500_000), '1500000');
  assert.equal(formatBidAmountForPicks(1.5), '1.5');
  assert.equal(formatBidAmountForPicks(1), '1');
});

test('buildBlindBidPicks uses 0000 when no drop and one drop id otherwise', () => {
  assert.equal(buildBlindBidPicks({ playerId: '16168', bidAmount: 1_500_000 }), '16168_1500000_0000');
  assert.equal(
    buildBlindBidPicks({ playerId: '16168', bidAmount: 1_500_000, dropPlayerIds: ['15222'] }),
    '16168_1500000_15222',
  );
});

test('validateWaiverClaimInput requires player, non-negative bid, and at most one drop', () => {
  const missingPlayer = validateWaiverClaimInput({ bidAmount: 1 });
  assert.equal(missingPlayer.ok, false);

  const badBid = validateWaiverClaimInput({ playerId: '16168', bidAmount: -5 });
  assert.equal(badBid.ok, false);

  const tooManyDrops = validateWaiverClaimInput({
    playerId: '16168',
    bidAmount: 100,
    dropPlayerIds: ['1', '2'],
  });
  assert.equal(tooManyDrops.ok, false);

  const sameDrop = validateWaiverClaimInput({
    playerId: '16168',
    bidAmount: 100,
    dropPlayerIds: ['16168'],
  });
  assert.equal(sameDrop.ok, false);

  const ok = validateWaiverClaimInput({
    playerId: '16168',
    bidAmount: 1_500_000,
    dropPlayerIds: ['15222'],
    comments: '2 yr, 1.5m each',
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.playerId, '16168');
    assert.equal(ok.value.bidAmount, 1_500_000);
    assert.deepEqual(ok.value.dropPlayerIds, ['15222']);
    assert.equal(ok.value.comments, '2 yr, 1.5m each');
  }
});

test('buildBlindBidWaiverRequestBody sets MFL import fields without FRANCHISE_ID', () => {
  const body = buildBlindBidWaiverRequestBody({
    leagueId: '35743',
    playerId: '16168',
    bidAmount: 1_500_000,
    dropPlayerIds: [],
  });

  assert.equal(body.get('TYPE'), 'blindBidWaiverRequest');
  assert.equal(body.get('L'), '35743');
  assert.equal(body.get('PICKS'), '16168_1500000_0000');
  assert.equal(body.has('FRANCHISE_ID'), false);
  assert.equal(body.has('ROUND'), false);
  assert.equal(body.has('REPLACE'), false);

  const withOptions = buildBlindBidWaiverRequestBody({
    leagueId: '35743',
    playerId: '16168',
    bidAmount: 300_000,
    dropPlayerIds: ['15222'],
    round: 1,
    replaceExisting: true,
  });
  assert.equal(withOptions.get('PICKS'), '16168_300000_15222');
  assert.equal(withOptions.get('ROUND'), '1');
  assert.equal(withOptions.get('REPLACE'), '1');
});

test('extractMflErrorMessage and humanizeWaiverClaimError map common failures', () => {
  assert.equal(extractMflErrorMessage('OK'), null);
  assert.equal(extractMflErrorMessage('<error>Insufficient FAAB balance</error>'), 'Insufficient FAAB balance');
  assert.match(humanizeWaiverClaimError('Insufficient FAAB balance'), /FAAB balance/i);
  assert.match(humanizeWaiverClaimError('invalid drop player'), /drop player/i);
  assert.match(humanizeWaiverClaimError('player is not a free agent'), /free agent/i);
  assert.match(humanizeWaiverClaimError('session expired'), /sign in again/i);
});

test('importBlindBidWaiverClaim posts blindBidWaiverRequest and never mutates without mocked fetch', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string; cookie: string | null }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: typeof init?.body === 'string' ? init.body : '',
      cookie: new Headers(init?.headers).get('Cookie'),
    });

    if (url.includes('/import')) {
      return new Response('OK', { status: 200 });
    }
    if (url.includes('TYPE=pendingWaivers')) {
      return Response.json({ pendingWaivers: { franchise: [{ id: '0004', waiver: [{ id: '16168', bid: '1500000' }] }] } });
    }
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  try {
    const result = await importBlindBidWaiverClaim({
      sessionCookieValue: 'session-abc',
      playerId: '16168',
      bidAmount: 1_500_000,
      dropPlayerIds: [],
      comments: 'local note only',
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.verifiedPending, true);
      assert.match(result.message, /submitted to MFL/i);
    }

    assert.match(calls[0].url, /\/2026\/import$/);
    assert.match(calls[0].body, /TYPE=blindBidWaiverRequest/);
    assert.match(calls[0].body, /L=35743/);
    assert.match(calls[0].body, /PICKS=16168_1500000_0000/);
    assert.doesNotMatch(calls[0].body, /FRANCHISE_ID=/);
    assert.doesNotMatch(calls[0].body, /COMMENTS=/);
    assert.equal(calls[0].cookie, 'MFL_USER_ID=session-abc');
    assert.match(calls[1].url, /TYPE=pendingWaivers/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('importBlindBidWaiverClaim maps upstream 401 without leaking session cookie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('denied', { status: 401 })) as typeof fetch;

  try {
    const result = await importBlindBidWaiverClaim({
      sessionCookieValue: 'secret-session',
      playerId: '16168',
      bidAmount: 100,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.match(result.message, /session has expired/i);
      assert.doesNotMatch(result.message, /secret-session/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('importBlindBidWaiverClaim surfaces MFL rejection body as a clear error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('<error>Insufficient FAAB balance</error>', { status: 200 })) as typeof fetch;

  try {
    const result = await importBlindBidWaiverClaim({
      sessionCookieValue: 'session-abc',
      playerId: '16168',
      bidAmount: 99_000_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.match(result.message, /FAAB balance/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
