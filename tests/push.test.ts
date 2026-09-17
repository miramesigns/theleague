import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addSubscription,
  clearSubscriptions,
  getAllSubscriptions,
  getSubscriptions,
  hasSentNotification,
  markSentNotification,
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

test('subscription store adds, lists, and removes per franchise', async () => {
  clearSubscriptions();
  await addSubscription('0001', mockSub('https://push.test/1', ['scores']));
  await addSubscription('0001', mockSub('https://push.test/2', ['lineup']));
  await addSubscription('0002', mockSub('https://push.test/3', ['trade']));

  assert.equal((await getSubscriptions('0001')).length, 2);
  assert.equal((await getSubscriptions('0002')).length, 1);

  const all = await getAllSubscriptions();
  assert.equal(all.length, 3);
  assert.ok(all.some((r) => r.franchiseId === '0001' && r.subscription.endpoint === 'https://push.test/1'));

  await removeSubscription('0001', 'https://push.test/1');
  assert.equal((await getSubscriptions('0001')).length, 1);
  assert.equal((await getSubscriptions('0002')).length, 1);
});

test('duplicate endpoints on same franchise are replaced', async () => {
  clearSubscriptions();
  await addSubscription('0001', mockSub('https://push.test/1', ['scores']));
  await addSubscription('0001', mockSub('https://push.test/1', ['lineup', 'trade']));

  const subs = await getSubscriptions('0001');
  assert.equal(subs.length, 1);
  assert.deepEqual(subs[0].categories, ['lineup', 'trade']);
});

test('sent notification ids dedupe across mark/has', async () => {
  clearSubscriptions();
  assert.equal(await hasSentNotification('trade-1'), false);
  await markSentNotification('trade-1');
  assert.equal(await hasSentNotification('trade-1'), true);
});
