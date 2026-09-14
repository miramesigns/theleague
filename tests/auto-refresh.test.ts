import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutoRefreshController } from '../lib/auto-refresh.ts';

function harness() {
  let now = 0;
  let visible = true;
  let intervalCallback: (() => void) | null = null;
  let visibilityCallback: (() => void) | null = null;
  let focusCallback: (() => void) | null = null;
  let refreshes = 0;

  const controller = createAutoRefreshController({
    refresh: () => { refreshes += 1; },
    now: () => now,
    isVisible: () => visible,
    setInterval: (callback) => { intervalCallback = callback; return 1; },
    clearInterval: () => { intervalCallback = null; },
    subscribeVisibility: (callback) => { visibilityCallback = callback; return () => { visibilityCallback = null; }; },
    subscribeFocus: (callback) => { focusCallback = callback; return () => { focusCallback = null; }; },
  });

  return {
    controller,
    advance: (milliseconds: number) => { now += milliseconds; },
    setVisible: (next: boolean) => { visible = next; },
    tick: () => intervalCallback?.(),
    visibility: () => visibilityCallback?.(),
    focus: () => focusCallback?.(),
    refreshCount: () => refreshes,
  };
}

test('auto-refreshes at most once per 60 seconds while visible', () => {
  const testHarness = harness();
  testHarness.controller.start();

  testHarness.advance(59_999);
  testHarness.tick();
  assert.equal(testHarness.refreshCount(), 0);

  testHarness.advance(1);
  testHarness.tick();
  assert.equal(testHarness.refreshCount(), 1);

  testHarness.advance(60_000);
  testHarness.tick();
  assert.equal(testHarness.refreshCount(), 2);
});

test('interval refreshes are skipped while the document is hidden', () => {
  const testHarness = harness();
  testHarness.controller.start();
  testHarness.setVisible(false);
  testHarness.advance(60_000);
  testHarness.tick();

  assert.equal(testHarness.refreshCount(), 0);
});

test('visibility return and focus refresh only after the 15-second minimum', () => {
  const testHarness = harness();
  testHarness.controller.start();

  testHarness.advance(14_999);
  testHarness.visibility();
  testHarness.focus();
  assert.equal(testHarness.refreshCount(), 0);

  testHarness.advance(1);
  testHarness.visibility();
  assert.equal(testHarness.refreshCount(), 1);

  testHarness.advance(15_000);
  testHarness.focus();
  assert.equal(testHarness.refreshCount(), 2);
});

test('manual refresh is immediate and resets the timing window', () => {
  const testHarness = harness();
  testHarness.controller.start();
  testHarness.advance(1_000);
  testHarness.controller.refreshNow();
  testHarness.advance(59_999);
  testHarness.tick();

  assert.equal(testHarness.refreshCount(), 1);
});
