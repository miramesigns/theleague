import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTradeProposalBody,
  buildTradeResponseBody,
  expiresUnixFromDays,
  importAmendedTradeProposal,
  importTradeProposal,
  importTradeResponse,
  normalizeAssetIds,
  normalizeFranchiseIdParam,
  normalizeMflTradeId,
  normalizeTradeResponseAction,
  toMflAssetCsv,
  validateTradeProposeInput,
} from '../lib/mfl-trade-writes.ts';

test('toMflAssetCsv joins ids with trailing comma like MFL export', () => {
  assert.equal(toMflAssetCsv([]), '');
  assert.equal(toMflAssetCsv(['16287']), '16287,');
  assert.equal(toMflAssetCsv(['16287', '16788', '']), '16287,16788,');
  assert.equal(toMflAssetCsv([' FP_0001_2027_3 ', '15751']), 'FP_0001_2027_3,15751,');
});

test('normalizeAssetIds drops blanks, duplicates, and unsafe tokens', () => {
  assert.deepEqual(normalizeAssetIds(['16287', '16287', ' 16788 ', '', 'bad id', 12]), ['16287', '16788']);
  assert.deepEqual(normalizeAssetIds(null), []);
});

test('normalizeFranchiseIdParam pads short numeric franchise ids', () => {
  assert.equal(normalizeFranchiseIdParam('4'), '0004');
  assert.equal(normalizeFranchiseIdParam('0005'), '0005');
  assert.equal(normalizeFranchiseIdParam(''), null);
  assert.equal(normalizeFranchiseIdParam('abc'), null);
});

test('normalizeMflTradeId accepts raw ids and pending- prefixed UI ids', () => {
  assert.equal(normalizeMflTradeId('1587'), '1587');
  assert.equal(normalizeMflTradeId('pending-1587'), '1587');
  assert.equal(normalizeMflTradeId('pending-abc'), null);
  assert.equal(normalizeMflTradeId(''), null);
});

test('normalizeTradeResponseAction maps decline to reject', () => {
  assert.equal(normalizeTradeResponseAction('accept'), 'accept');
  assert.equal(normalizeTradeResponseAction('reject'), 'reject');
  assert.equal(normalizeTradeResponseAction('revoke'), 'revoke');
  assert.equal(normalizeTradeResponseAction('decline'), 'reject');
  assert.equal(normalizeTradeResponseAction('nope'), null);
});

test('expiresUnixFromDays converts day count to unix expiry', () => {
  const now = 1_700_000_000;
  assert.equal(expiresUnixFromDays(7, now), now + 7 * 24 * 60 * 60);
  assert.equal(expiresUnixFromDays(0, now), now + 7 * 24 * 60 * 60);
  assert.equal(expiresUnixFromDays(40, now), now + 30 * 24 * 60 * 60);
});

test('validateTradeProposeInput requires partner and at least one side', () => {
  const badPartner = validateTradeProposeInput({ partnerFranchiseId: '', offeringPlayerIds: ['1'] });
  assert.equal(badPartner.ok, false);

  const emptySides = validateTradeProposeInput({ partnerFranchiseId: '0004', offeringPlayerIds: [], requestingPlayerIds: [] });
  assert.equal(emptySides.ok, false);

  const ok = validateTradeProposeInput({
    partnerFranchiseId: '5',
    offeringPlayerIds: ['16287'],
    requestingPlayerIds: ['15751'],
    expiresDays: 7,
    comments: 'hello',
    revokeTradeId: 'pending-1587',
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.partnerFranchiseId, '0005');
    assert.deepEqual(ok.value.willGiveUpIds, ['16287']);
    assert.deepEqual(ok.value.willReceiveIds, ['15751']);
    assert.equal(ok.value.revokeTradeId, '1587');
    assert.equal(ok.value.comments, 'hello');
  }
});

test('buildTradeProposalBody sets required MFL import fields without FRANCHISE_ID', () => {
  const body = buildTradeProposalBody({
    leagueId: '35743',
    partnerFranchiseId: '0004',
    willGiveUpIds: ['16287', '16788'],
    willReceiveIds: ['15751'],
    comments: 'amend',
    expiresUnix: 1790218800,
  });

  assert.equal(body.get('TYPE'), 'tradeProposal');
  assert.equal(body.get('L'), '35743');
  assert.equal(body.get('OFFEREDTO'), '0004');
  assert.equal(body.get('WILL_GIVE_UP'), '16287,16788,');
  assert.equal(body.get('WILL_RECEIVE'), '15751,');
  assert.equal(body.get('COMMENTS'), 'amend');
  assert.equal(body.get('EXPIRES'), '1790218800');
  assert.equal(body.has('FRANCHISE_ID'), false);
});

test('buildTradeResponseBody sets RESPONSE accept|reject|revoke', () => {
  const accept = buildTradeResponseBody({ leagueId: '35743', tradeId: '1587', response: 'accept' });
  assert.equal(accept.get('TYPE'), 'tradeResponse');
  assert.equal(accept.get('TRADE_ID'), '1587');
  assert.equal(accept.get('RESPONSE'), 'accept');

  const reject = buildTradeResponseBody({
    leagueId: '35743',
    tradeId: '1587',
    response: 'reject',
    comments: 'no thanks',
  });
  assert.equal(reject.get('RESPONSE'), 'reject');
  assert.equal(reject.get('COMMENTS'), 'no thanks');

  const revoke = buildTradeResponseBody({ leagueId: '35743', tradeId: '99', response: 'revoke' });
  assert.equal(revoke.get('RESPONSE'), 'revoke');
});

test('import helpers post to MFL import and never mutate without mocked fetch', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string; cookie: string | null }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      body: typeof init?.body === 'string' ? init.body : '',
      cookie: new Headers(init?.headers).get('Cookie'),
    });
    return new Response('OK', { status: 200 });
  }) as typeof fetch;

  try {
    const propose = await importTradeProposal({
      sessionCookieValue: 'session-abc',
      partnerFranchiseId: '0004',
      willGiveUpIds: ['16287'],
      willReceiveIds: ['15751'],
      expiresDays: 7,
      nowSeconds: 1_700_000_000,
      comments: 'test',
    });
    assert.equal(propose.ok, true);
    assert.match(calls[0].url, /\/2026\/import$/);
    assert.match(calls[0].body, /TYPE=tradeProposal/);
    assert.match(calls[0].body, /OFFEREDTO=0004/);
    assert.match(calls[0].body, /WILL_GIVE_UP=16287%2C/);
    assert.equal(calls[0].cookie, 'MFL_USER_ID=session-abc');
    assert.doesNotMatch(calls[0].body, /FRANCHISE_ID=/);

    const respond = await importTradeResponse({
      sessionCookieValue: 'session-abc',
      tradeId: 'pending-1587',
      response: 'revoke',
    });
    assert.equal(respond.ok, true);
    assert.match(calls[1].body, /TYPE=tradeResponse/);
    assert.match(calls[1].body, /TRADE_ID=1587/);
    assert.match(calls[1].body, /RESPONSE=revoke/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('importAmendedTradeProposal revokes then proposes; surfaces revoke-ok/propose-fail clearly', async () => {
  const originalFetch = globalThis.fetch;
  let importCount = 0;

  globalThis.fetch = (async () => {
    importCount += 1;
    if (importCount === 1) return new Response('OK', { status: 200 });
    return new Response('<error>denied</error>', { status: 200 });
  }) as typeof fetch;

  try {
    const result = await importAmendedTradeProposal({
      sessionCookieValue: 'session-abc',
      revokeTradeId: '1587',
      partnerFranchiseId: '0004',
      willGiveUpIds: ['16287'],
      willReceiveIds: ['15751'],
      expiresDays: 7,
      nowSeconds: 1_700_000_000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.revokedTradeId, '1587');
      assert.match(result.message, /old offer may already be gone/i);
      assert.match(result.message, /previous offer was revoked/i);
    }
    assert.equal(importCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('importTradeResponse maps upstream 401 without leaking session cookie in message', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('denied', { status: 401 })) as typeof fetch;

  try {
    const result = await importTradeResponse({
      sessionCookieValue: 'secret-session',
      tradeId: '1587',
      response: 'accept',
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
