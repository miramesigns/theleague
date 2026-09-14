import type { LineupSlot, RosterPlayer, ScoreEntry } from './types.ts';

export const mockScores: ScoreEntry[] = [
  { teamId: '12', teamName: 'Gridiron Ghosts', record: '7-2', opponent: 'Turbo Tundra', pointsFor: 142.4, pointsAgainst: 118.8, status: 'Live', isUserTeam: true },
  { teamId: '07', teamName: 'Turbo Tundra', record: '6-3', opponent: 'Gridiron Ghosts', pointsFor: 118.8, pointsAgainst: 142.4, status: 'Live' },
  { teamId: '04', teamName: 'Sunday Sermons', record: '5-4', opponent: 'North End Zone', pointsFor: 131.2, pointsAgainst: 130.1, status: 'Projected' },
  { teamId: '09', teamName: 'North End Zone', record: '4-5', opponent: 'Sunday Sermons', pointsFor: 130.1, pointsAgainst: 131.2, status: 'Projected' },
  { teamId: '01', teamName: 'Red Zone Riot', record: '8-1', opponent: 'Bye Week Blazers', pointsFor: 156.0, pointsAgainst: 97.6, status: 'Final' },
  { teamId: '15', teamName: 'Bye Week Blazers', record: '2-7', opponent: 'Red Zone Riot', pointsFor: 97.6, pointsAgainst: 156.0, status: 'Final' },
];

export const mockRoster: RosterPlayer[] = [
  { id: 'p1', name: 'J. Daniels', pos: 'QB', team: 'WAS', projection: 24.6 },
  { id: 'p2', name: 'A. Gibbs', pos: 'RB', team: 'DET', projection: 19.1 },
  { id: 'p3', name: 'J. Taylor', pos: 'RB', team: 'IND', projection: 17.8 },
  { id: 'p4', name: 'C. Lamb', pos: 'WR', team: 'DAL', projection: 20.7 },
  { id: 'p5', name: 'A. St. Brown', pos: 'WR', team: 'DET', projection: 18.9 },
  { id: 'p6', name: 'T. McBride', pos: 'TE', team: 'ARI', projection: 13.2 },
  { id: 'p7', name: 'K. Fairbairn', pos: 'PK', team: 'HOU', projection: 9.4 },
  { id: 'p8', name: 'Jets Def', pos: 'Def', team: 'NYJ', projection: 8.7 },
  { id: 'p9', name: 'J. Chase', pos: 'WR', team: 'CIN', projection: 19.9 },
  { id: 'p10', name: 'B. Hall', pos: 'RB', team: 'NYJ', projection: 16.8 },
];

export const lineupSlots: LineupSlot[] = [
  { id: 'qb', label: 'QB', allowed: ['QB'], required: true },
  { id: 'rb1', label: 'RB 1', allowed: ['RB'], required: true },
  { id: 'rb2', label: 'RB 2', allowed: ['RB'], required: true },
  { id: 'wr1', label: 'WR 1', allowed: ['WR'], required: true },
  { id: 'wr2', label: 'WR 2', allowed: ['WR'], required: true },
  { id: 'wr3', label: 'WR 3', allowed: ['WR'], required: true },
  { id: 'te', label: 'TE', allowed: ['TE'], required: true },
  { id: 'flex', label: 'FLEX', allowed: ['RB', 'WR', 'TE'], required: true },
  { id: 'pk', label: 'PK', allowed: ['PK'], required: true },
  { id: 'def', label: 'Def', allowed: ['Def'], required: true },
];
