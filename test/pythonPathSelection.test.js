const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePythonPath } = require('../src/pythonPathSelection');

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
