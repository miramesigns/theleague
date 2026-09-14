import assert from 'node:assert/strict';
import test from 'node:test';

import { primaryTabs } from '../lib/navigation.ts';

test('primary navigation keeps roster and standings visible while waivers and trades live under More', () => {
  assert.deepEqual(primaryTabs, [
    { href: '/scores', label: 'Scores' },
    { href: '/lineup', label: 'Lineup' },
    { href: '/roster', label: 'Roster' },
    { href: '/standings', label: 'Standings' },
    { href: '/more', label: 'More' },
  ]);
});
