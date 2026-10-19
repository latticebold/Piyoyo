const test = require('node:test');
const assert = require('node:assert/strict');

const { isPyPyFallback, resolvePythonPath } = require('../src/pythonPathSelection');

test('resolvePythonPath uses selected launcher before settings', () => {
  const result = resolvePythonPath({
    selectedPythonPath: 'pypy3',
    configPythonPath: 'python',
    legacyPythonPath: '',
    defaultInterpreterPath: '',
    platform: 'win32'
  });

  assert.equal(result, 'pypy3');
});

test('resolvePythonPath falls back through both legacy setting namespaces', () => {
  assert.equal(resolvePythonPath({
    configPythonPath: '',
    legacyPythonPath: '',
    olderLegacyPythonPath: 'py',
    defaultInterpreterPath: '',
    platform: 'win32'
  }), 'py');
});

test('resolvePythonPath trims selected custom launcher', () => {
  const result = resolvePythonPath({
    selectedPythonPath: '  C:\\Python\\python.exe  ',
    configPythonPath: '',
    legacyPythonPath: '',
    defaultInterpreterPath: '',
    platform: 'win32'
  });

  assert.equal(result, 'C:\\Python\\python.exe');
});

test('resolvePythonPath falls back to configured and default launchers', () => {
  assert.equal(resolvePythonPath({
    selectedPythonPath: '',
    configPythonPath: 'pypy',
    legacyPythonPath: 'python',
    defaultInterpreterPath: '',
    platform: 'win32'
  }), 'pypy');

  assert.equal(resolvePythonPath({
    selectedPythonPath: '',
    configPythonPath: '',
    legacyPythonPath: '',
    defaultInterpreterPath: '',
    platform: 'linux'
  }), 'python3');
});

test('resolvePythonPath prefers available PyPy over the default interpreter', () => {
  assert.equal(resolvePythonPath({
    availableLaunchers: ['python', 'pypy', 'pypy3'],
    defaultInterpreterPath: 'C:\\Python\\python.exe',
    platform: 'win32'
  }), 'pypy3');

  assert.equal(resolvePythonPath({
    availableLaunchers: ['python', 'pypy'],
    platform: 'linux'
  }), 'pypy');
});

test('resolvePythonPath keeps explicit choices ahead of PyPy', () => {
  assert.equal(resolvePythonPath({
    selectedPythonPath: 'python',
    availableLaunchers: ['pypy3'],
    platform: 'win32'
  }), 'python');

  assert.equal(resolvePythonPath({
    configPythonPath: 'py',
    availableLaunchers: ['pypy3'],
    platform: 'win32'
  }), 'py');
});

test('resolvePythonPath falls back to Python when PyPy is unavailable', () => {
  const options = { availableLaunchers: ['python'], platform: 'win32' };
  assert.equal(resolvePythonPath(options), 'python');
  assert.equal(isPyPyFallback(options), true);
});

test('isPyPyFallback is false when PyPy runs or a launcher is chosen', () => {
  assert.equal(isPyPyFallback({ availableLaunchers: ['pypy3'] }), false);
  assert.equal(isPyPyFallback({ selectedPythonPath: 'python', availableLaunchers: [] }), false);
  assert.equal(isPyPyFallback({ legacyPythonPath: 'python3', availableLaunchers: [] }), false);
});
