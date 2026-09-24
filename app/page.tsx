import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { LandingSignIn } from '@/components/landing-sign-in';
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
        <Suspense fallback={<div className="stack auth-form" aria-hidden="true" />}>
          <LandingSignIn />
        </Suspense>
      </section>
    </main>
  );
}
