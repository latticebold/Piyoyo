const test = require('node:test');
const assert = require('node:assert/strict');

const { createLauncherAvailabilityCache } = require('../src/pythonLauncherAvailabilityCache');

test('createLauncherAvailabilityCache starts inspection immediately and reuses the result', async () => {
  let calls = 0;
  const expected = [{ launcher: 'python', available: true, version: 'Python 3.12.0' }];

  const cache = createLauncherAvailabilityCache({
    inspectLaunchers: async () => {
      calls += 1;
      return expected;
    }
  });

  assert.equal(calls, 1);
  assert.strictEqual(await cache.get(), expected);
  assert.strictEqual(await cache.get(), expected);
  assert.equal(calls, 1);
});
