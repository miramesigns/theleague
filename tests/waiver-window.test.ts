import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWaiverWindowLabel,
  getWaiverWindow,
  isEarlyCloseWaiverWeek,
  WAIVER_WINDOW_EARLY_CLOSE_WEEKS_2026,
} from '../lib/waiver-window.ts';

test('2026 early-close weeks are week 1 and week 12', () => {
  assert.deepEqual([...WAIVER_WINDOW_EARLY_CLOSE_WEEKS_2026], [1, 12]);
  assert.equal(isEarlyCloseWaiverWeek(1), true);
  assert.equal(isEarlyCloseWaiverWeek(12), true);
  assert.equal(isEarlyCloseWaiverWeek(2), false);
  assert.equal(isEarlyCloseWaiverWeek(11), false);
  assert.equal(isEarlyCloseWaiverWeek(null), false);
});

test('formatWaiverWindowLabel uses Wed close by default and Tue when early', () => {
  assert.equal(formatWaiverWindowLabel(false), 'Mon 8am – Wed 10pm ET');
  assert.equal(formatWaiverWindowLabel(true), 'Mon 8am – Tue 10pm ET');
});

test('getWaiverWindow returns effective close for known week', () => {
  assert.deepEqual(getWaiverWindow(5), {
    label: 'Mon 8am – Wed 10pm ET',
    closesEarly: false,
    week: 5,
    note: '',
  });
  assert.deepEqual(getWaiverWindow(1), {
    label: 'Mon 8am – Tue 10pm ET',
    closesEarly: true,
    week: 1,
    note: '',
  });
  assert.deepEqual(getWaiverWindow(12), {
    label: 'Mon 8am – Tue 10pm ET',
    closesEarly: true,
    week: 12,
    note: '',
  });
});

test('getWaiverWindow falls back to default copy plus Wed-game note when week unknown', () => {
  assert.deepEqual(getWaiverWindow(null), {
    label: 'Mon 8am – Wed 10pm ET',
    closesEarly: false,
    week: null,
    note: 'Weeks with a Wed NFL game close Tue 10pm ET.',
  });
  assert.deepEqual(getWaiverWindow(undefined), {
    label: 'Mon 8am – Wed 10pm ET',
    closesEarly: false,
    week: null,
    note: 'Weeks with a Wed NFL game close Tue 10pm ET.',
  });
});
