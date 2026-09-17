import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Mirrors the notifications store snapshot caching contract:
 * useSyncExternalStore must see the same object reference when data is unchanged.
 */
function createCachedSnapshotReader() {
  let cachedSnapshot: { readIds: string[]; signature: string } = { readIds: [], signature: '' };

  return function getSnapshot(rawReads: unknown) {
    const readIds = Array.isArray(rawReads)
      ? rawReads.filter((id): id is string => typeof id === 'string').slice(-200)
      : [];
    const signature = readIds.join('\0');
    if (signature === cachedSnapshot.signature) {
      return cachedSnapshot;
    }
    cachedSnapshot = { readIds, signature };
    return cachedSnapshot;
  };
}

test('notification store snapshot stays referentially stable when reads are unchanged', () => {
  const getSnapshot = createCachedSnapshotReader();
  const first = getSnapshot(['a', 'b']);
  const second = getSnapshot(['a', 'b']);
  assert.equal(first, second);
});

test('notification store snapshot updates when reads change', () => {
  const getSnapshot = createCachedSnapshotReader();
  const first = getSnapshot(['a']);
  const second = getSnapshot(['a', 'b']);
  assert.notEqual(first, second);
  assert.deepEqual(second.readIds, ['a', 'b']);
});
