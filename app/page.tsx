import { redirect } from 'next/navigation';

import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (await getMflSessionCookieValue()) {
    redirect('/scores');
  }

  return (
    <main className="grid landing-page">
      <section className="panel section stack landing-card">
        <div className="eyebrow">Private league companion</div>
        <h2>Sign in to continue</h2>
        <p className="muted">
          Scores, rosters, lineups, and league details are available only after you sign in to MFL.
        </p>
        <p className="small muted">The sign-in window opens automatically.</p>
      </section>
    </main>
  );
}
