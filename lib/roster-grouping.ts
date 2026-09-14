import type { RosterRow } from './mfl-roster.ts';

export const ROSTER_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PK', 'Def', 'Other'] as const;

export type RosterPosition = typeof ROSTER_POSITIONS[number];

export type RosterGroup = {
  position: RosterPosition;
  rows: RosterRow[];
};

function normalizePosition(position: string | null): RosterPosition {
  switch (position?.trim().toUpperCase()) {
    case 'QB': return 'QB';
    case 'RB': return 'RB';
    case 'WR': return 'WR';
    case 'TE': return 'TE';
    case 'PK': return 'PK';
    case 'DEF': return 'Def';
    default: return 'Other';
  }
}

export function groupRosterRows(rows: RosterRow[]): RosterGroup[] {
  const grouped = new Map<RosterPosition, { row: RosterRow; index: number }[]>();
  for (const [index, row] of rows.entries()) {
    const position = normalizePosition(row.position);
    const entries = grouped.get(position) ?? [];
    entries.push({ row, index });
    grouped.set(position, entries);
  }

  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  return ROSTER_POSITIONS
    .map((position) => {
      const entries = grouped.get(position) ?? [];
      entries.sort((left, right) => collator.compare(left.row.name, right.row.name) || left.index - right.index);
      return { position, rows: entries.map(({ row }) => row) };
    })
    .filter(({ rows: groupedRows }) => groupedRows.length > 0);
}
