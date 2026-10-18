const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = require('../package.json');
const {
  DEFAULT_EXTENSION_ID,
  getSettingsQuery,
  openPiyoyoSettings
} = require('../src/piyoyoSettings');

test('default extension id matches the manifest publisher and name', () => {
  assert.equal(DEFAULT_EXTENSION_ID, `${manifest.publisher}.${manifest.name}`);
});

test('settings query filters the Settings UI to the extension', () => {
  assert.equal(getSettingsQuery('local.piyoyo'), '@ext:local.piyoyo');
  assert.equal(getSettingsQuery('other.ext'), '@ext:other.ext');
  assert.equal(getSettingsQuery(undefined), '@ext:local.piyoyo');
});

test('openPiyoyoSettings opens the Settings UI with the extension filter', async () => {
  const calls = [];
  const commands = {
    executeCommand: async (...args) => {
      calls.push(args);
    }
  };

  await openPiyoyoSettings(commands, 'local.piyoyo');

  assert.deepEqual(calls, [['workbench.action.openSettings', '@ext:local.piyoyo']]);
});
