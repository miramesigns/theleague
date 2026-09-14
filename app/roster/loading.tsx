import { RouteLoading } from '@/components/route-loading';

export default function Loading() {
  return <RouteLoading title="Roster" message="Loading the latest MFL roster…" rows={6} />;
}
