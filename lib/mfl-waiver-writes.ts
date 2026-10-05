import { fetchMflExport, getMflConfig } from './mfl.ts';
import { MFL_SESSION_COOKIE_NAME } from './mfl-session-constants.ts';

export type WaiverClaimInput = {
  playerId: string;
  bidAmount: number;
  dropPlayerIds: string[];
  comments?: string;
  /** Conditional BBID round; omit for non-conditional leagues. */
  round?: number | null;
  /** When true, replace existing picks for the round instead of appending. */
  replaceExisting?: boolean;
};

export type WaiverClaimWriteResult =
  | { ok: true; message: string; verifiedPending: boolean; draft: WaiverClaimInput }
  | { ok: false; status: number; message: string };

const PLAYER_ID_RE = /^\d+$/;

export function normalizePlayerId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value).trim();
  if (!id || !PLAYER_ID_RE.test(id)) return null;
  return id;
}

export function normalizeDropPlayerIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const id = normalizePlayerId(entry);
    if (!id || id === '0000' || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeBidAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatBidAmountForPicks(bidAmount: number): string {
  if (!Number.isFinite(bidAmount)) return '0';
  if (Number.isInteger(bidAmount)) return String(bidAmount);
  // Avoid scientific notation; trim trailing zeros from decimals.
  return bidAmount.toFixed(4).replace(/\.?0+$/, '') || '0';
}

/**
 * Build the PICKS value for one bid: `{addId}_{bid}_{dropId}`.
 * MFL requires `0000` when not dropping a player. Only one drop id is supported per bid.
 */
export function buildBlindBidPicks(args: {
  playerId: string;
  bidAmount: number;
  dropPlayerIds?: string[];
}): string {
  const drop =
    (args.dropPlayerIds ?? []).find((id) => id && id !== '0000') ?? '0000';
  return `${args.playerId}_${formatBidAmountForPicks(args.bidAmount)}_${drop}`;
}

export function validateWaiverClaimInput(input: {
  playerId?: unknown;
  bidAmount?: unknown;
  dropPlayerIds?: unknown;
  comments?: unknown;
  round?: unknown;
  replaceExisting?: unknown;
}): { ok: true; value: WaiverClaimInput } | { ok: false; message: string } {
  const playerId = normalizePlayerId(input.playerId);
  if (!playerId) {
    return { ok: false, message: 'A free-agent player is required.' };
  }

  const bidAmount = normalizeBidAmount(input.bidAmount);
  if (bidAmount === null || bidAmount < 0) {
    return { ok: false, message: 'A valid FAAB bid is required.' };
  }

  const dropPlayerIds = normalizeDropPlayerIds(input.dropPlayerIds);
  if (dropPlayerIds.length > 1) {
    return { ok: false, message: 'Only one drop player is supported per FAAB claim.' };
  }
  if (dropPlayerIds.includes(playerId)) {
    return { ok: false, message: 'Drop player cannot be the same as the claim player.' };
  }

  let round: number | null = null;
  if (input.round !== undefined && input.round !== null && input.round !== '') {
    const parsed =
      typeof input.round === 'number'
        ? input.round
        : typeof input.round === 'string' && /^\d+$/.test(input.round.trim())
          ? Number(input.round.trim())
          : NaN;
    if (!Number.isInteger(parsed) || parsed < 1) {
      return { ok: false, message: 'A valid waiver round is required when provided.' };
    }
    round = parsed;
  }

  return {
    ok: true,
    value: {
      playerId,
      bidAmount,
      dropPlayerIds,
      comments: typeof input.comments === 'string' ? input.comments.slice(0, 280) : '',
      round,
      replaceExisting: input.replaceExisting === true,
    },
  };
}

export function buildBlindBidWaiverRequestBody(args: {
  leagueId: string;
  playerId: string;
  bidAmount: number;
  dropPlayerIds?: string[];
  round?: number | null;
  replaceExisting?: boolean;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('TYPE', 'blindBidWaiverRequest');
  body.set('L', args.leagueId);
  body.set('PICKS', buildBlindBidPicks({
    playerId: args.playerId,
    bidAmount: args.bidAmount,
    dropPlayerIds: args.dropPlayerIds,
  }));
  if (typeof args.round === 'number' && Number.isInteger(args.round) && args.round >= 1) {
    body.set('ROUND', String(args.round));
  }
  if (args.replaceExisting) {
    body.set('REPLACE', '1');
  }
  // Do not set FRANCHISE_ID for normal owner claims (session cookie selects franchise).
  return body;
}

function mflRejected(responseText: string): boolean {
  const trimmed = responseText.trim();
  if (/^ok$/i.test(trimmed)) return false;
  return /\berror\b|<error[\s>]/i.test(responseText);
}

export function extractMflErrorMessage(responseText: string): string | null {
  const trimmed = responseText.trim();
  if (!trimmed || /^ok$/i.test(trimmed)) return null;

  const xml = trimmed.match(/<error[^>]*>([\s\S]*?)<\/error>/i);
  if (xml?.[1]?.trim()) return xml[1].replace(/\s+/g, ' ').trim().slice(0, 280);

  const attr = trimmed.match(/<error[^>]*message=["']([^"']+)["']/i);
  if (attr?.[1]?.trim()) return attr[1].replace(/\s+/g, ' ').trim().slice(0, 280);

  if (/\berror\b/i.test(trimmed)) return trimmed.replace(/\s+/g, ' ').trim().slice(0, 280);
  return null;
}

export function humanizeWaiverClaimError(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return 'MFL rejected the waiver claim.';

  const lower = text.toLowerCase();
  if (/session|login|auth|cookie|not logged|unauthorized|forbidden/.test(lower)) {
    return 'Your MFL session has expired. Sign in again.';
  }
  if (/budget|balance|insufficient|not enough|exceed|too (high|large)|maximum bid|bid.*(high|large|max)/.test(lower)) {
    return 'MFL rejected the bid — check your FAAB balance, minimum bid, and increment.';
  }
  if (/drop|roster.?full|roster limit|too many|cannot drop|invalid drop|not on roster/.test(lower)) {
    return 'MFL rejected the drop player — confirm the id is on your roster and the roster has room.';
  }
  if (/free.?agent|not available|already (owned|rostered)|locked|not a free agent/.test(lower)) {
    return 'MFL rejected the claim player — they may no longer be a free agent.';
  }
  if (/waiver|window|period|closed|not (open|allowed)|deadline/.test(lower)) {
    return 'MFL rejected the claim — the waiver window may be closed or claims are not allowed right now.';
  }

  return `MFL rejected the waiver claim: ${text}`;
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
    const text = await response.text().catch(() => '');
    return { ok: false, status: 400, message: humanizeWaiverClaimError(extractMflErrorMessage(text) || text) };
  }

  const text = await response.text();
  if (mflRejected(text)) {
    return { ok: false, status: 400, message: humanizeWaiverClaimError(extractMflErrorMessage(text)) };
  }

  return { ok: true, text };
}

function pendingPayloadMentionsPlayer(payload: unknown, playerId: string): boolean {
  const blob = JSON.stringify(payload ?? '');
  if (!blob) return false;
  // Match the player id as a standalone token in serialized pending waiver JSON.
  return new RegExp(`(^|[^0-9])${playerId}([^0-9]|$)`).test(blob);
}

async function verifyPendingWaiverClaim(args: {
  sessionCookieValue: string;
  playerId: string;
}): Promise<boolean> {
  try {
    const response = await fetchMflExport(
      'pendingWaivers',
      { JSON: '1' },
      { sessionCookieValue: args.sessionCookieValue, cache: 'no-store' },
    );
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return pendingPayloadMentionsPlayer(payload, args.playerId);
  } catch {
    return false;
  }
}

export async function importBlindBidWaiverClaim(args: {
  sessionCookieValue: string;
  playerId: string;
  bidAmount: number;
  dropPlayerIds?: string[];
  comments?: string;
  round?: number | null;
  replaceExisting?: boolean;
}): Promise<WaiverClaimWriteResult> {
  const validated = validateWaiverClaimInput({
    playerId: args.playerId,
    bidAmount: args.bidAmount,
    dropPlayerIds: args.dropPlayerIds,
    comments: args.comments,
    round: args.round,
    replaceExisting: args.replaceExisting,
  });
  if (!validated.ok) {
    return { ok: false, status: 400, message: validated.message };
  }

  const config = getMflConfig();
  const draft = validated.value;
  const result = await postMflImport({
    sessionCookieValue: args.sessionCookieValue,
    body: buildBlindBidWaiverRequestBody({
      leagueId: config.leagueId,
      playerId: draft.playerId,
      bidAmount: draft.bidAmount,
      dropPlayerIds: draft.dropPlayerIds,
      round: draft.round,
      replaceExisting: draft.replaceExisting,
    }),
  });

  if (!result.ok) return result;

  const verifiedPending = await verifyPendingWaiverClaim({
    sessionCookieValue: args.sessionCookieValue,
    playerId: draft.playerId,
  });

  return {
    ok: true,
    verifiedPending,
    draft,
    message: verifiedPending
      ? 'Waiver claim submitted to MFL and shown in pending claims.'
      : 'Waiver claim submitted to MFL. Refresh pending claims if it is not listed yet.',
  };
}
