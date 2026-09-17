import { moreLinks } from '@/lib/navigation';

export default function MorePage() {
  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">More</div>
          <div className="small muted">Notifications, waivers, and trades.</div>
        </div>
        <span className="pill">Sign in from the header</span>
      </div>

      <section className="panel section">
        <div className="stack">
          {moreLinks.map((link) => (
            <a key={link.href} className="button" href={link.href}>{link.label}</a>
          ))}
        </div>
      </section>
    </main>
  );
}
