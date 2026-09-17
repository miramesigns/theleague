import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addSubscription,
  clearSubscriptions,
  getAllSubscriptions,
  getSubscriptions,
  removeSubscription,
} from '../lib/push-subscription-store.ts';

function mockSub(endpoint: string, categories: string[]): Parameters<typeof addSubscription>[1] {
  return {
    endpoint,
    expirationTime: null,
    keys: { p256dh: 'abc', auth: 'def' },
    categories: categories as never,
    createdAt: new Date().toISOString(),
  };
}

test('subscription store adds, lists, and removes per franchise', () => {
  clearSubscriptions();
  addSubscription('0001', mockSub('https://push.test/1', ['scores']));
  addSubscription('0001', mockSub('https://push.test/2', ['lineup']));
  addSubscription('0002', mockSub('https://push.test/3', ['trade']));

  assert.equal(getSubscriptions('0001').length, 2);
  assert.equal(getSubscriptions('0002').length, 1);

  const all = getAllSubscriptions();
  assert.equal(all.length, 3);
  assert.ok(all.some((r) => r.franchiseId === '0001' && r.subscription.endpoint === 'https://push.test/1'));

  removeSubscription('0001', 'https://push.test/1');
  assert.equal(getSubscriptions('0001').length, 1);
  assert.equal(getSubscriptions('0002').length, 1);
});

test('duplicate endpoints on same franchise are replaced', () => {
  clearSubscriptions();
  addSubscription('0001', mockSub('https://push.test/1', ['scores']));
  addSubscription('0001', mockSub('https://push.test/1', ['lineup', 'trade']));

  const subs = getSubscriptions('0001');
  assert.equal(subs.length, 1);
  assert.deepEqual(subs[0].categories, ['lineup', 'trade']);
});
