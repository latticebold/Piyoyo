const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PYTHON_PATH_STATE_KEY,
  getSavedPythonPathPreference,
  savePythonPathPreference
} = require('../src/pythonPathPreference');

test('getSavedPythonPathPreference reads and trims global state value', () => {
  const globalState = {
    get(key) {
      assert.equal(key, PYTHON_PATH_STATE_KEY);
      return '  pypy3  ';
    }
  };

  assert.equal(getSavedPythonPathPreference(globalState), 'pypy3');
});

test('getSavedPythonPathPreference migrates a legacy global state value', () => {
  const reads = [];
  const globalState = {
    get(key) {
      reads.push(key);
      return key === 'ioSprint.selectedPythonPath' ? '  python3  ' : '';
    }
  };

  assert.equal(getSavedPythonPathPreference(globalState), 'python3');
  assert.deepEqual(reads, [PYTHON_PATH_STATE_KEY, 'ioSprint.selectedPythonPath']);
});

test('savePythonPathPreference stores normalized launcher value', async () => {
  const writes = [];
  const globalState = {
    update(key, value) {
      writes.push({ key, value });
      return Promise.resolve();
    }
  };

  await savePythonPathPreference(globalState, '  C:\\Python\\python.exe  ');

  assert.deepEqual(writes, [{
    key: PYTHON_PATH_STATE_KEY,
    value: 'C:\\Python\\python.exe'
  }]);
});
