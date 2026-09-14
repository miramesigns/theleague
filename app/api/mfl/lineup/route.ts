import { importLineupSubmission, LineupLoadError, loadLineupSubmissionContext } from '../../../../lib/mfl-lineup.ts';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function deriveExpectedOrigin(request: Request): string | null {
  const headers = request.headers;
  const requestUrl = new URL(request.url);
  const host = headers.get('x-forwarded-host') || headers.get('host') || requestUrl.host;
  if (!host) return null;

  const proto = headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '') || 'https';
  return `${proto}://${host}`;
}

function readWeek(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function readStarters(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return null;
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function readSessionCookieValue(request: Request): string | null {
  const header = request.headers.get('cookie') || '';
  const match = header.match(/(?:^|;\s*)MFL_USER_ID=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function jsonError(message: string, status: number) {
  return Response.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const expectedOrigin = deriveExpectedOrigin(request);
  const origin = request.headers.get('origin');
  if (!expectedOrigin || !origin || origin !== expectedOrigin) {
    return jsonError('Request origin is not allowed.', 403);
  }

  const sessionCookieValue = readSessionCookieValue(request);
  if (!sessionCookieValue) {
    return jsonError('Sign in to MFL before submitting a lineup.', 401);
  }

  const payload = await request.json().catch(() => null);
  if (!isPlainRecord(payload)) {
    return jsonError('Invalid request body.', 400);
  }

  const allowedKeys = new Set(['week', 'starters', 'comments', 'clear']);
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return jsonError('Invalid request body.', 400);
    }
  }

  const week = readWeek(payload.week);
  const starters = payload.clear === true ? readStarters(payload.starters) ?? [] : readStarters(payload.starters);
  const comments = typeof payload.comments === 'string' ? payload.comments : '';
  const clear = payload.clear === true;

  if (week === null || starters === null) {
    return jsonError('Invalid request body.', 400);
  }

  if (!clear && starters.length === 0) {
    return jsonError('Empty starters are only allowed in the explicit clear flow.', 400);
  }

  if (clear && starters.length > 0) {
    return jsonError('Clear submissions must not include starters.', 400);
  }

  if (comments.length > 280) {
    return jsonError('Comments must be 280 characters or fewer.', 400);
  }

  try {
    const context = await loadLineupSubmissionContext(sessionCookieValue, String(week));
    const result = await importLineupSubmission({
      sessionCookieValue,
      franchiseId: context.franchiseId ?? '',
      week,
      starters,
      comments,
      clear,
      playersById: context.playersById,
      rosterPlayerIds: context.rosterPlayerIds,
      rules: context.rules!,
    });

    if (!result.ok) {
      return jsonError(result.message, result.status);
    }

    return Response.json(
      {
        ok: true,
        verified: result.confirmed === true,
        week,
        submittedAt: result.submittedAt ?? null,
        starters: result.actualStarters ?? result.normalizedStarters,
        franchiseId: context.franchiseId,
        franchiseName: context.franchiseName,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof LineupLoadError) {
      return jsonError(error.message, error.status);
    }

    return jsonError('Lineup data could not be loaded.', 503);
  }
}
