import { WaiversBoard } from '@/components/waivers-board';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { loadWaiversPageState } from '@/lib/mfl-waivers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WaiversPage() {
  const state = await loadWaiversPageState(await getMflSessionCookieValue());

  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">Waivers</div>
          <div className="small muted">{state.message}</div>
        </div>
        <span className="pill">{state.rules?.waiverType || 'FA / FAAB'}</span>
      </div>

      {!state.ok ? (
        <section className="panel section">
          <p className="muted">{state.message}</p>
        </section>
      ) : (
        <WaiversBoard state={state} />
      )}
    </main>
  );
}
