'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid matchup-detail-view">
      <div className="banner login-state error" role="alert">
        <div>
          <div className="small" style={{ fontWeight: 700 }}>Matchup details failed to load.</div>
          <div className="small muted">Try again after refreshing the page.</div>
        </div>
        <button className="button primary" type="button" onClick={reset}>Retry</button>
      </div>
    </main>
  );
}
