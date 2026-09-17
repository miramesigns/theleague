import assert from 'node:assert/strict';
import test from 'node:test';

import { moreLinks, primaryTabs } from '../lib/navigation.ts';

test('primary navigation keeps roster and standings visible while waivers and trades live under More', () => {
  assert.deepEqual(primaryTabs, [
    { href: '/scores', label: 'Scores' },
    { href: '/lineup', label: 'Lineup' },
    { href: '/roster', label: 'Roster' },
    { href: '/standings', label: 'Standings' },
    { href: '/more', label: 'More' },
  ]);
});

test('More exposes All Rosters without changing the five primary tabs', () => {
  assert.deepEqual(moreLinks[0], { href: '/all-rosters', label: 'All Rosters' });
  assert.equal(primaryTabs.length, 5);
});

test('More includes notifications alongside waivers and trades', () => {
  assert.deepEqual(moreLinks.map((link) => link.href), [
    '/all-rosters',
    '/notifications',
    '/waivers',
    '/trades',
  ]);
});
