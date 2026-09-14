export type MflConfig = {
  leagueId: string;
  year: string;
  host: string;
  userAgent: string;
};

export type ScoreEntry = {
  teamId: string;
  teamName: string;
  record: string;
  opponent: string;
  pointsFor: number;
  pointsAgainst: number;
  status: 'Live' | 'Final' | 'Projected';
  isUserTeam?: boolean;
};

export type RosterPlayer = {
  id: string;
  name: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'PK' | 'Def';
  team: string;
  projection: number;
};

export type LineupSlot = {
  id: string;
  label: string;
  allowed: RosterPlayer['pos'][];
  required?: boolean;
};
