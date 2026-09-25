'use client';

import { useRouter } from 'next/navigation';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function FranchisePicker({
  franchises,
  selectedFranchiseId,
}: {
  franchises: Array<{ id: string; name: string }>;
  selectedFranchiseId: string | null;
}) {
  const router = useRouter();

  return (
    <div className="team-picker">
      <Label htmlFor="franchise-picker">Franchise</Label>
      <Select
        value={selectedFranchiseId ?? undefined}
        onValueChange={(value) => {
          const params = new URLSearchParams();
          params.set('franchise', value);
          router.push(`/all-rosters?${params.toString()}`);
        }}
      >
        <SelectTrigger id="franchise-picker" className="field w-full min-w-0">
          <SelectValue placeholder="Select franchise" />
        </SelectTrigger>
        <SelectContent>
          {franchises.map((franchise) => (
            <SelectItem key={franchise.id} value={franchise.id}>
              {franchise.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
