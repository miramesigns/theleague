import { RouteLoading } from '@/components/route-loading';

export default function Loading() {
  return <RouteLoading title="Lineup" message="Loading your roster and current MFL status…" rows={7} />;
}
