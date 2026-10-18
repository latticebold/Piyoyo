const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getRunnablePythonFileFromDocument
} = require('../src/targetSelection');

test('getRunnablePythonFileFromDocument accepts saved Python documents', () => {
  const result = getRunnablePythonFileFromDocument({
    isUntitled: false,
    languageId: 'python',
    fileName: 'C:\\work\\main.py'
  });

  assert.equal(result.filePath, 'C:\\work\\main.py');
  assert.equal(result.errorMessage, '');
});

test('getRunnablePythonFileFromDocument rejects untitled documents', () => {
  const result = getRunnablePythonFileFromDocument({
    isUntitled: true,
    languageId: 'python',
    fileName: ''
  });

  assert.equal(result.filePath, null);
  assert.match(result.errorMessage, /保存/);
});

test('getRunnablePythonFileFromDocument rejects non-Python documents', () => {
  const result = getRunnablePythonFileFromDocument({
    isUntitled: false,
    languageId: 'javascript',
    fileName: 'C:\\work\\main.js'
  });

  assert.equal(result.filePath, null);
  assert.match(result.errorMessage, /Python ファイル/);
});
