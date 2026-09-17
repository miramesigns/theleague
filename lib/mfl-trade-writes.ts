import { getMflConfig } from './mfl.ts';
import { MFL_SESSION_COOKIE_NAME } from './mfl-session-constants.ts';

export type TradeResponseAction = 'accept' | 'reject' | 'revoke';

export type TradeProposeInput = {
  partnerFranchiseId: string;
  willGiveUpIds: string[];
  willReceiveIds: string[];
  comments?: string;
  expiresDays?: number;
  /** When set, revoke this pending trade_id before proposing the amended terms. */
  revokeTradeId?: string | null;
};

export type TradeWriteResult =
  | { ok: true; message: string; revokedTradeId?: string }
  | { ok: false; status: number; message: string; revokedTradeId?: string };

const FRANCHISE_ID_RE = /^\d{4}$/;
const TRADE_ID_RE = /^\d+$/;
const ASSET_ID_RE = /^[A-Za-z0-9_]+$/;

/** Normalize asset ids into the comma list MFL import expects (trailing comma OK). */
export function toMflAssetCsv(ids: string[]): string {
  const cleaned = ids
    .map((id) => id.trim())
    .filter(Boolean);
  if (cleaned.length === 0) return '';
  return `${cleaned.join(',')},`;
}

export function normalizeAssetIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (!id || !ASSET_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeFranchiseIdParam(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/\D/g, '');
  if (!digits) return null;
  const padded = digits.padStart(4, '0');
  return FRANCHISE_ID_RE.test(padded) ? padded : null;
}

/** Accept raw MFL trade_id or UI id like `pending-1587`. */
export function normalizeMflTradeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const stripped = raw.startsWith('pending-') ? raw.slice('pending-'.length) : raw;
  return TRADE_ID_RE.test(stripped) ? stripped : null;
}

export function normalizeTradeResponseAction(value: unknown): TradeResponseAction | null {
  if (value === 'accept' || value === 'reject' || value === 'revoke') return value;
  if (value === 'decline') return 'reject';
  return null;
}

export function expiresUnixFromDays(days: number, nowSeconds: number = Math.floor(Date.now() / 1000)): number {
  const safeDays = Number.isInteger(days) && days > 0 ? Math.min(days, 30) : 7;
  return nowSeconds + safeDays * 24 * 60 * 60;
}

export function validateTradeProposeInput(input: {
  partnerFranchiseId?: unknown;
  offeringPlayerIds?: unknown;
  requestingPlayerIds?: unknown;
  expiresDays?: unknown;
  comments?: unknown;
  revokeTradeId?: unknown;
}): { ok: true; value: TradeProposeInput } | { ok: false; message: string } {
  const partnerFranchiseId = normalizeFranchiseIdParam(input.partnerFranchiseId);
  if (!partnerFranchiseId) {
    return { ok: false, message: 'A partner franchise is required.' };
  }

  const willGiveUpIds = normalizeAssetIds(input.offeringPlayerIds);
  const willReceiveIds = normalizeAssetIds(input.requestingPlayerIds);
  if (willGiveUpIds.length === 0 && willReceiveIds.length === 0) {
    return { ok: false, message: 'Add at least one asset on either side of the trade.' };
  }

  const expiresDays =
    typeof input.expiresDays === 'number' && Number.isInteger(input.expiresDays) && input.expiresDays > 0
      ? Math.min(input.expiresDays, 30)
      : 7;

  const comments = typeof input.comments === 'string' ? input.comments.slice(0, 280) : '';

  let revokeTradeId: string | null = null;
  if (input.revokeTradeId !== undefined && input.revokeTradeId !== null && input.revokeTradeId !== '') {
    revokeTradeId = normalizeMflTradeId(input.revokeTradeId);
    if (!revokeTradeId) {
      return { ok: false, message: 'A valid pending trade id is required to amend and resend.' };
    }
  }

  return {
    ok: true,
    value: {
      partnerFranchiseId,
      willGiveUpIds,
      willReceiveIds,
      expiresDays,
      comments,
      revokeTradeId,
    },
  };
}

export function buildTradeProposalBody(args: {
  leagueId: string;
  partnerFranchiseId: string;
  willGiveUpIds: string[];
  willReceiveIds: string[];
  comments?: string;
  expiresUnix?: number;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('TYPE', 'tradeProposal');
  body.set('L', args.leagueId);
  body.set('OFFEREDTO', args.partnerFranchiseId);
  body.set('WILL_GIVE_UP', toMflAssetCsv(args.willGiveUpIds));
  body.set('WILL_RECEIVE', toMflAssetCsv(args.willReceiveIds));
  if (args.comments) body.set('COMMENTS', args.comments);
  if (typeof args.expiresUnix === 'number' && Number.isFinite(args.expiresUnix)) {
    body.set('EXPIRES', String(Math.floor(args.expiresUnix)));
  }
  // Do not set FRANCHISE_ID for normal owner proposals.
  return body;
}

export function buildTradeResponseBody(args: {
  leagueId: string;
  tradeId: string;
  response: TradeResponseAction;
  comments?: string;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('TYPE', 'tradeResponse');
  body.set('L', args.leagueId);
  body.set('TRADE_ID', args.tradeId);
  body.set('RESPONSE', args.response);
  if (args.comments) body.set('COMMENTS', args.comments);
  return body;
}

function mflRejected(responseText: string): boolean {
  const trimmed = responseText.trim();
  if (/^ok$/i.test(trimmed)) return false;
  return /\berror\b|<error[\s>]/i.test(responseText);
}

async function postMflImport(args: {
  sessionCookieValue: string;
  body: URLSearchParams;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; message: string }> {
  const config = getMflConfig();
  const url = new URL(`https://${config.host}/${config.year}/import`);

  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Cookie: `${MFL_SESSION_COOKIE_NAME}=${args.sessionCookieValue}`,
      'User-Agent': config.userAgent,
      Accept: 'application/xml, text/xml, text/plain, application/json;q=0.8, */*;q=0.2',
    },
    body: args.body.toString(),
  });

  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, message: 'Your MFL session has expired. Sign in again.' };
  }

  if (response.status === 429) {
    return { ok: false, status: 429, message: 'MFL is rate limiting requests. Please try again later.' };
  }

  if (!response.ok) {
    if (response.status >= 500) {
      return { ok: false, status: 503, message: 'MFL is temporarily unavailable.' };
    }
    return { ok: false, status: 400, message: 'MFL trade write failed.' };
  }

  const text = await response.text();
  if (mflRejected(text)) {
    return { ok: false, status: 400, message: 'MFL rejected the trade write.' };
  }

  return { ok: true, text };
}

export async function importTradeResponse(args: {
  sessionCookieValue: string;
  tradeId: string;
  response: TradeResponseAction;
  comments?: string;
}): Promise<TradeWriteResult> {
  const config = getMflConfig();
  const tradeId = normalizeMflTradeId(args.tradeId);
  if (!tradeId) {
    return { ok: false, status: 400, message: 'A pending trade id is required.' };
  }

  const result = await postMflImport({
    sessionCookieValue: args.sessionCookieValue,
    body: buildTradeResponseBody({
      leagueId: config.leagueId,
      tradeId,
      response: args.response,
      comments: args.comments,
    }),
  });

  if (!result.ok) return result;

  const verb =
    args.response === 'accept' ? 'accepted' : args.response === 'reject' ? 'declined' : 'revoked';
  return { ok: true, message: `Trade ${verb} on MFL.` };
}

export async function importTradeProposal(args: {
  sessionCookieValue: string;
  partnerFranchiseId: string;
  willGiveUpIds: string[];
  willReceiveIds: string[];
  comments?: string;
  expiresDays?: number;
  nowSeconds?: number;
}): Promise<TradeWriteResult> {
  const config = getMflConfig();
  const partnerFranchiseId = normalizeFranchiseIdParam(args.partnerFranchiseId);
  if (!partnerFranchiseId) {
    return { ok: false, status: 400, message: 'A partner franchise is required.' };
  }

  const willGiveUpIds = normalizeAssetIds(args.willGiveUpIds);
  const willReceiveIds = normalizeAssetIds(args.willReceiveIds);
  if (willGiveUpIds.length === 0 && willReceiveIds.length === 0) {
    return { ok: false, status: 400, message: 'Add at least one asset on either side of the trade.' };
  }

  const expiresDays = args.expiresDays ?? 7;
  const expiresUnix = expiresUnixFromDays(expiresDays, args.nowSeconds);

  const result = await postMflImport({
    sessionCookieValue: args.sessionCookieValue,
    body: buildTradeProposalBody({
      leagueId: config.leagueId,
      partnerFranchiseId,
      willGiveUpIds,
      willReceiveIds,
      comments: args.comments,
      expiresUnix,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, message: 'Trade offer submitted to MFL.' };
}

/**
 * Amend + resend: revoke the old pending offer, then propose new terms.
 * If revoke succeeds and propose fails, surface that the old offer may already be gone.
 */
export async function importAmendedTradeProposal(args: {
  sessionCookieValue: string;
  revokeTradeId: string;
  partnerFranchiseId: string;
  willGiveUpIds: string[];
  willReceiveIds: string[];
  comments?: string;
  expiresDays?: number;
  nowSeconds?: number;
}): Promise<TradeWriteResult> {
  const revokeTradeId = normalizeMflTradeId(args.revokeTradeId);
  if (!revokeTradeId) {
    return { ok: false, status: 400, message: 'A valid pending trade id is required to amend and resend.' };
  }

  const revoke = await importTradeResponse({
    sessionCookieValue: args.sessionCookieValue,
    tradeId: revokeTradeId,
    response: 'revoke',
  });

  if (!revoke.ok) {
    return {
      ok: false,
      status: revoke.status,
      message: `Could not revoke the existing offer before resending. ${revoke.message}`,
    };
  }

  const propose = await importTradeProposal({
    sessionCookieValue: args.sessionCookieValue,
    partnerFranchiseId: args.partnerFranchiseId,
    willGiveUpIds: args.willGiveUpIds,
    willReceiveIds: args.willReceiveIds,
    comments: args.comments,
    expiresDays: args.expiresDays,
    nowSeconds: args.nowSeconds,
  });

  if (!propose.ok) {
    return {
      ok: false,
      status: propose.status,
      message:
        `The previous offer was revoked on MFL, but the new proposal failed. ` +
        `Your old offer may already be gone — check Pending offers and try again. ${propose.message}`,
      revokedTradeId: revokeTradeId,
    };
  }

  return {
    ok: true,
    message: 'Previous offer revoked and amended offer submitted to MFL.',
    revokedTradeId: revokeTradeId,
  };
}
