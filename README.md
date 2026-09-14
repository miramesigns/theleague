# MFL League Companion

A phone-first Next.js App Router companion for a MyFantasyLeague league.

## What is included

- Dark, clean, score-first UI with bottom tabs.
- `Scores` with live-board-style layout and a promoted "My matchup" card.
- Server-only MFL export proxy for `www42.myfantasyleague.com`, league `35743`, season `2026`.
- `Lineup` editor with the 10-starter rules and a confirmation modal.
- Safe stubbed lineup import route that requires login and explicit confirmation.
- Server-side login route architecture that keeps only an `MFL_USER_ID` httpOnly session cookie.
- Basic `Waivers`, `Trades`, `More`, plus `Roster` and `Standings` pages.
- Manifest and SVG icons for PWA plumbing.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` if you want to override defaults.
3. Run the app: `npm run dev`

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

## Security notes

- No browser password storage is used.
- Login credentials are posted only to the server route.
- The login route performs the upstream MFL credential exchange server-side and stores only the returned `MFL_USER_ID` session cookie.
- Server-side API routes can read that cookie through `cookies()` without exposing credentials to the browser.
- The lineup import route is intentionally non-destructive and returns a `501` stub until explicit write logic is added.
- Do not add real secrets to the repo.

## Validation

Run:

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
