import { TradesBoard } from '@/components/trades-board';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { loadTradesPageState } from '@/lib/mfl-trades';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TradesPage() {
  const state = await loadTradesPageState(await getMflSessionCookieValue());

  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">Trades</div>
          <div className="small muted">{state.message}</div>
        </div>
        <span className="pill">{state.pending.length} pending</span>
      </div>

      {!state.ok ? (
        <section className="panel section">
          <p className="muted">{state.message}</p>
        </section>
      ) : (
        <TradesBoard state={state} />
      )}
    </main>
  );
}
