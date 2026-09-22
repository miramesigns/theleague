# MFL League Companion

A phone-first Next.js App Router companion for a MyFantasyLeague league.

## What is included

- Dark, clean, score-first UI with bottom tabs.
- `Scores` with live-board-style layout and a promoted "My matchup" card.
- Server-only MFL export proxy for `www42.myfantasyleague.com`, league `35743`, season `2026`.
- `Lineup` editor with the 10-starter rules and a confirmation modal.
- Server-side lineup import route with roster validation and post-submit MFL verification.
- Server-side login route architecture that keeps only an `MFL_USER_ID` httpOnly session cookie.
- Real `Waivers` board (free agents + FAAB rules + recent claims) and `Trades` board (history/pending/bait + draft offer UI).
- Pending trades show a compact FantasyCalc dynasty value read (cached ≤1h) plus outbound KeepTradeCut / FantasyCalc calculator links. Owners can accept / decline incoming offers, cancel or amend+resend outgoing offers, and propose new trades after confirm (live MFL `tradeProposal` / `tradeResponse`).
- Draft offers use asset search/select (your rostered players + owned draft picks / partner rostered players + owned picks). Draft picks are grouped above players. Free agents are not tradeable here (use FA/waivers). Counter prefills the draft from a pending offer; Amend & resend prefills an outgoing offer then revokes+reproposes.
- In-app `Notifications` center derived from MFL transactions / live scores / pending trades, with optional Web Push that mirrors MFL email-style alerts (trades, waivers, IR/taxi, lineup locks, scores).
- `More`, `Roster`, `Standings`, and `All Rosters` pages.
- Manifest and SVG icons for PWA plumbing.

## Live vs confirmation-gated

| Flow | Read from MFL | Draft in UI | Live write to MFL |
| --- | --- | --- | --- |
| Scores / Rosters / Standings / Lineup editor | Yes | Lineup yes | Lineup submit via `/api/mfl/lineup` after confirm dialog |
| Free agents / FAAB rules / recent waivers | Yes (`freeAgents`, `league`, `transactions`) | Claim draft yes | `/api/waivers/claim` requires `confirmed: true` and currently returns **501 stub** |
| Pending waivers | Yes when session cookie present (`pendingWaivers`) | — | Same claim stub |
| Trades history / trade bait | Yes (`transactions` TRADE, `tradeBait`, `futureDraftPicks`; `assets` when signed in) | Propose draft yes (players + picks) | `/api/trades/propose` requires `confirmed: true` then live MFL `tradeProposal` (optional amend: revoke then propose) |
| Pending trades | Yes when session cookie present (`pendingTrades`) | Accept / Decline / Cancel / Amend | `/api/trades/respond` requires `confirmed: true` then live MFL `tradeResponse` (`accept` / `reject` / `revoke`) |
| Notifications | Yes (transactions + pending trades + live scoring) | Category prefs + Web Push subscribe | Background poll (`/api/push/poll`) discovers new events and sends Web Push with durable dedupe |
| Legacy `/api/lineup/import` | — | — | Still a **501** ask-before-send stub |

No silent MFL mutations: every write path requires an explicit confirmation step in the UI and a `confirmed` (or equivalent confirm dialog) gate on the server.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` if you want to override defaults.
3. For Web Push in production, set VAPID keys, `CRON_SECRET`, `MFL_USERNAME` / `MFL_PASSWORD`, and a durable store (Upstash Redis preferred, or Supabase).
4. Run the app: `npm run dev`

## Web Push

Push approximates MFL owner email categories by polling exports (no hook into MFL’s mailer):

- Pending trade proposals (`pendingTrades`) and completed `TRADE` transactions
- Waiver / free-agent moves, IR / taxi, lineup `LOCK_ALL_PLAYERS`
- Score alerts from live scoring when the scores category is enabled

### Auth for background poll

Cron and GitHub Actions have no browser cookie. Configure:

- `MFL_USERNAME` / `MFL_PASSWORD` — server login (same helpers as interactive login; password is never logged)
- `MFL_PRIMARY_FRANCHISE_ID` / league env as usual
- `CRON_SECRET` — `Authorization: Bearer …` required on `/api/push/poll` (and allowed through the edge proxy without a session)

### Durable subscription store

Subscriptions and sent-notification ids must survive cold starts. Preferred order:

1. **Upstash Redis REST** — `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
2. **Supabase** — `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY`

Supabase tables:

```sql
create table if not exists push_subscriptions (
  franchise_id text not null,
  endpoint text not null,
  expiration_time bigint,
  p256dh text not null,
  auth text not null,
  categories text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (franchise_id, endpoint)
);

create table if not exists push_sent_notifications (
  id text primary key,
  sent_at timestamptz not null default now()
);
```

In production, missing both backends returns a clear configuration error.

### Scheduling (Vercel Pro primary)

- **Primary:** `vercel.json` registers a Pro cron every **5 minutes** on `/api/push/poll` (`*/5 * * * *`). Vercel invokes it with `Authorization: Bearer $CRON_SECRET` (GET). Pro allows ≥1/min; 5 min balances latency vs invocation cost.
- **Optional backup:** `.github/workflows/push-poll.yml` keeps `workflow_dispatch` only (schedule commented out) so it does not double-fire with Vercel. Re-enable the workflow `schedule` only if Vercel cron is unavailable. Repo secrets: `APP_URL`, `CRON_SECRET`.
- Poll **dedupes** by durable sent-notification ids, so overlapping runners would not re-push the same event — but keep one primary scheduler to avoid wasted MFL polls.

The first successful poll **bootstraps** dedupe (marks current events sent without delivering) so deploy does not flood devices with history.

### Service worker

`/sw.js` is a public path so registration still works when session cookies are awkward (e.g. iOS Home Screen).

## Scripts

- `npm run dev`
- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## MFL wiring

The MFL export proxy reads these environment variables:

- `MFL_LEAGUE_ID`
- `MFL_YEAR`
- `MFL_HOST`
- `MFL_USER_AGENT`
- `MFL_PRIMARY_FRANCHISE_ID`

Defaults are already wired for the requested league settings, so the app works without secrets.

The proxy always sends `User-Agent: PlugGrokBot` and caches shared live scoring responses for about 75 seconds.
`MFL_PRIMARY_FRANCHISE_ID` is the documented temporary fallback for local smoke testing only.

Verified live export types used in this slice:

- `freeAgents`, `league`, `players`, `transactions`, `tradeBait`
- Auth-gated: `pendingWaivers`, `pendingTrades`
- Background push poll also uses `MFL_USERNAME` / `MFL_PASSWORD` (see Web Push above)

## Security notes

- No browser password storage is used.
- Login credentials are posted only to the server route.
- The login route performs the upstream MFL credential exchange server-side and stores only the returned `MFL_USER_ID` session cookie.
- Server-side API routes can read that cookie through `cookies()` without exposing credentials to the browser.
- The lineup import route validates the authenticated franchise and verifies the saved MFL starters before reporting success.
- Waiver submit routes refuse unconfirmed requests and do not write to MFL yet. Trade propose/respond routes refuse unconfirmed requests, check request origin, and write via MFL import (`tradeProposal` / `tradeResponse`).
- Do not add real secrets to the repo.

## Phone smoke checklist

1. Sign in from the header / landing auth control.
2. Bottom tabs: Scores → Lineup → Roster → Standings still load.
3. More → Notifications: alerts appear; mark read; Enable push for email-style Web Push (trades, waivers, etc.). iPhone: Add to Home Screen.
4. More → Waivers: FAAB rules + balances, searchable free agents, draft claim → confirm → expect 501 gated message.
5. More → Trades: pending offers show FantasyCalc side totals + KTC/FC calculator links; Accept/Decline for offers to you; Cancel / Amend & resend for offers you sent; draft offer → confirm → live MFL submit.
   - Smoke example: London (15751) vs Tucker Kraft (16222) + Vele (16788) should read roughly “favors them” on FantasyCalc 1QB dynasty values.

## Validation

Run:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
