import { RouteLoading } from '@/components/route-loading';

export default function Loading() {
  return <RouteLoading title="Standings" message="Loading current league standings…" rows={6} />;
}
