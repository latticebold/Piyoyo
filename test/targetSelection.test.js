const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getRunnablePythonFileFromDocument,
  saveDocumentBeforeRun
} = require('../src/targetSelection');

function createDocument(overrides) {
  const document = {
    isUntitled: false,
    isDirty: true,
    languageId: 'python',
    fileName: 'C:\\work\\main.py',
    saveCount: 0,
    async save() {
      document.saveCount += 1;
      return true;
    },
    ...overrides
  };
  return document;
}

test('saveDocumentBeforeRun saves a dirty Python file', async () => {
  const document = createDocument();
  assert.equal(await saveDocumentBeforeRun(document), true);
  assert.equal(document.saveCount, 1);
});

test('saveDocumentBeforeRun skips clean, untitled, non-Python and missing documents', async () => {
  const clean = createDocument({ isDirty: false });
  const untitled = createDocument({ isUntitled: true, fileName: '' });
  const javascript = createDocument({ languageId: 'javascript', fileName: 'C:\\work\\main.js' });

  assert.equal(await saveDocumentBeforeRun(clean), false);
  assert.equal(await saveDocumentBeforeRun(untitled), false);
  assert.equal(await saveDocumentBeforeRun(javascript), false);
  assert.equal(await saveDocumentBeforeRun(undefined), false);
  assert.equal(clean.saveCount + untitled.saveCount + javascript.saveCount, 0);
});

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
