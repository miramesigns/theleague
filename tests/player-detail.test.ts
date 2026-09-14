import assert from 'node:assert/strict';
import test from 'node:test';

import { describePlayerGameState, deriveRegulationQuarterClock, groupPlayersByPosition } from '../lib/player-detail.ts';

test('groupPlayersByPosition orders both starter and bench sections QB, RB, WR, TE, PK, Def, then unknowns', () => {
  const starters = groupPlayersByPosition([
    { id: 's3', position: 'WR' },
    { id: 's1', position: 'QB' },
    { id: 's2', position: 'QB' },
    { id: 's4', position: 'RB' },
    { id: 's5', position: 'TE' },
    { id: 's6', position: 'D/ST' },
    { id: 's7', position: 'K' },
    { id: 's8', position: 'FB' },
  ]);

  const bench = groupPlayersByPosition([
    { id: 'b1', position: 'TE' },
    { id: 'b2', position: 'RB' },
    { id: 'b3', position: 'QB' },
    { id: 'b4', position: 'PK' },
    { id: 'b5', position: 'DEF' },
    { id: 'b6', position: 'WR' },
    { id: 'b7', position: 'ST' },
  ]);

  assert.deepEqual(starters.map((group) => group.position), ['QB', 'RB', 'WR', 'TE', 'PK', 'Def', 'FB']);
  assert.deepEqual(starters[0].players.map((player) => player.id), ['s1', 's2']);
  assert.deepEqual(starters[1].players.map((player) => player.id), ['s4']);
  assert.deepEqual(starters[2].players.map((player) => player.id), ['s3']);

  assert.deepEqual(bench.map((group) => group.position), ['QB', 'RB', 'WR', 'TE', 'PK', 'Def', 'ST']);
  assert.deepEqual(bench[0].players.map((player) => player.id), ['b3']);
  assert.deepEqual(bench[5].players.map((player) => player.id), ['b5']);
});

test('deriveRegulationQuarterClock converts remaining seconds into regulation quarter clocks', () => {
  assert.equal(deriveRegulationQuarterClock(3582), 'Q1 14:42');
  assert.equal(deriveRegulationQuarterClock(2220), 'Q2 07:00');
  assert.equal(deriveRegulationQuarterClock(1422), 'Q3 08:42');
  assert.equal(deriveRegulationQuarterClock(75), 'Q4 01:15');
  assert.equal(deriveRegulationQuarterClock(3600), null);
  assert.equal(deriveRegulationQuarterClock(0), null);
});

test('describePlayerGameState uses Final, Yet to play, Playing, Live, and In progress without inventing a quarter', () => {
  const nowMs = 1_800_000_000_000;

  assert.equal(describePlayerGameState(null, nowMs), 'Yet to play');
  assert.equal(describePlayerGameState({ gameSecondsRemaining: 3600, kickoff: nowMs / 1000 + 3600 }, nowMs), 'Yet to play');
  assert.equal(describePlayerGameState({ gameSecondsRemaining: 0, kickoff: nowMs / 1000 - 3600 }, nowMs), 'Final');
  assert.equal(describePlayerGameState({ gameSecondsRemaining: 1422, kickoff: nowMs / 1000 - 600 }, nowMs), 'Playing · Q3 08:42 left');
  assert.equal(describePlayerGameState({ gameSecondsRemaining: 3900, kickoff: nowMs / 1000 - 600 }, nowMs), 'Live');
  assert.equal(describePlayerGameState({ gameSecondsRemaining: null, kickoff: nowMs / 1000 + 600 }, nowMs), 'In progress');
});
