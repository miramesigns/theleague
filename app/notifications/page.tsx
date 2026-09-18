import { NotificationsCenter } from '@/components/notifications-center';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { loadNotificationsPageState } from '@/lib/mfl-notifications';
import { PushSubscribe } from '@/components/push-subscribe';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NotificationsPage() {
  const state = await loadNotificationsPageState(await getMflSessionCookieValue());

  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">Notifications</div>
          <div className="small muted">{state.message}</div>
        </div>
        <span className="pill">{state.notifications.length} alerts</span>
      </div>

      <section className="panel section stack">
        <PushSubscribe />
      </section>

      <NotificationsCenter state={state} />
    </main>
  );
}
