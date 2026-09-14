import assert from 'node:assert/strict';
import test from 'node:test';

import { groupStandingsByDivision, parseStandings } from '../lib/mfl-standings.ts';

test('parseStandings maps the complete MFL standings columns without dropping zeroes', () => {
  const rows = parseStandings({
    leagueStandings: {
      franchise: [
        {
          id: '0004', h2hw: '1', h2hl: '0', h2ht: '0', h2hpct: '1.000', h2hgb: '0', h2hstreak: 'W1',
          pf: '57.4', avgpf: '57.4', pa: '40.1', avgpa: '40.1', divw: '1', divl: '0', divt: '0',
          nondivw: '0', nondivl: '0', nondivt: '0', pwr: '2',
        },
        {
          id: '0005', h2hw: '0', h2hl: '1', h2ht: '0', pf: '40.1', pa: '57.4',
          divw: '0', divl: '1', divt: '0', nondivw: '0', nondivl: '0', nondivt: '0', power_rank: '8',
        },
      ],
    },
  }, new Map([['0004', 'The Ashy Elbows'], ['0005', 'Outlaw Joker']]), '0004', new Map([
    ['0004', '01'], ['0005', '01'],
  ]), new Map([['01', 'Money']]));

  assert.deepEqual(rows[0], {
    rank: 1,
    franchiseId: '0004',
    teamName: 'The Ashy Elbows',
    divisionId: '01',
    divisionName: 'Money',
    record: '1-0-0',
    winPct: 1,
    gamesBack: 0,
    streak: 'W1',
    pointsFor: 57.4,
    averagePointsFor: 57.4,
    pointsAgainst: 40.1,
    averagePointsAgainst: 40.1,
    divisionRecord: '1-0-0',
    nonDivisionRecord: '0-0-0',
    powerRank: 2,
    isPrimary: true,
  });
  assert.equal(rows[1].gamesBack, 1);
  assert.equal(rows[1].averagePointsFor, 40.1);
  assert.equal(rows[1].powerRank, 8);
  assert.deepEqual(groupStandingsByDivision(rows).map((division) => division.name), ['Money']);
});
