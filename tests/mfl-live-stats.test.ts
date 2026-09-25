import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coerceUpdatedStatsText,
  formatMflLiveStatsString,
  parseMflLiveStats,
  resolvePlayerLiveStatsText,
} from '../lib/mfl-live-stats.ts';

test('parseMflLiveStats indexes players and team defense rows', () => {
  const byId = parseMflLiveStats([
    '17075|#C 1|#TD 1|CC 5|CY 100|RC 15|TGT 12|Team GBP',
    'GBP|SK 2|IC 1|FC 1|TPA 17|Team GBP',
  ].join('\n'));

  assert.equal(byId.get('17075')?.CC, '5');
  assert.equal(byId.get('17075')?.CY, '100');
  assert.equal(byId.get('17075')?.['#C'], '1');
  assert.equal(byId.get('17075')?.RC, '15');
  assert.equal(byId.get('GBP')?.SK, '2');
});

test('formatMflLiveStatsString matches MFL Rec STATS column for Golden-style bag', () => {
  const text = formatMflLiveStatsString({
    '#C': '1',
    CC: '5',
    CY: '100',
    RC: '15',
    TGT: '12',
  });

  assert.equal(text, 'Rec: 5/100, 1 ReTD (15)');
});

test('formatMflLiveStatsString builds Pass / Rush / FG lines', () => {
  assert.equal(
    formatMflLiveStatsString({
      PC: '19',
      PA: '29',
      PY: '253',
      '#P': '3',
      PS: '40,13,11',
      IN: '1',
    }),
    'Pass: 19/29, 253 Yd, 3 PaTD (40,13,11), 1 Int',
  );

  assert.equal(
    formatMflLiveStatsString({
      RA: '16',
      RY: '76',
      '#R': '1',
      RS: '39',
    }),
    'Rush: 16/76, 1 RuTD (39)',
  );

  assert.equal(
    formatMflLiveStatsString({
      '#F': '2',
      '#A': '2',
      FG: '37,33',
      EP: '2',
      EA: '2',
    }),
    'FG: 2/2 (37,33), 2/2 XP',
  );
});

test('formatMflLiveStatsString returns null for empty or non-scoring bags', () => {
  assert.equal(formatMflLiveStatsString(null), null);
  assert.equal(formatMflLiveStatsString({}), null);
  assert.equal(formatMflLiveStatsString({ DIF: '-21', FL: '0' }), null);
});

test('resolvePlayerLiveStatsText uses NFL team key for defenses', () => {
  const byId = parseMflLiveStats('NEP|SK 3|IC 1|TPA 10\n');
  assert.equal(
    resolvePlayerLiveStatsText(byId, { id: '0520', position: 'Def', nflTeam: 'NEP' }),
    '3 Sk, 1 Int, 10 PA',
  );
});

test('coerceUpdatedStatsText accepts preformatted or raw liveScoring updatedStats', () => {
  assert.equal(coerceUpdatedStatsText(''), null);
  assert.equal(coerceUpdatedStatsText('Rec: 5/100, 1 ReTD (15)'), 'Rec: 5/100, 1 ReTD (15)');
  assert.equal(coerceUpdatedStatsText('CC=5|CY=100|#C=1|RC=15'), 'Rec: 5/100, 1 ReTD (15)');
});
