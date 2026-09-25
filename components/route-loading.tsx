import { Skeleton } from '@/components/ui/skeleton';

type RouteLoadingProps = {
  title: string;
  message: string;
  rows?: number;
};

export function RouteLoading({ title, message, rows = 5 }: RouteLoadingProps) {
  return (
    <main className="grid route-loading" aria-busy="true" aria-live="polite">
      <div className="banner">
        <div>
          <div className="eyebrow">{title}</div>
          <div className="small muted">{message}</div>
        </div>
        <span className="pill route-loading-pill">
          <span className="tab-spinner" aria-hidden="true" />
          Loading
        </span>
      </div>

      <section className="panel section stack" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="route-loading-row" key={index}>
            <Skeleton className="h-3.5 w-[min(280px,70vw)] rounded-full" />
            <Skeleton className="h-3.5 w-[68px] rounded-full" />
          </div>
        ))}
      </section>
    </main>
  );
}
