'use strict';

const path = require('node:path');

function getRunnablePythonFileFromDocument(document) {
  if (!document) {
    return {
      filePath: null,
      errorMessage: '現在のエディタがありません。'
    };
  }

  if (document.isUntitled) {
    return {
      filePath: null,
      errorMessage: '実行する前に Python ファイルを保存してください。'
    };
  }

  const fileName = document.fileName || '';
  const isPython = document.languageId === 'python' || path.extname(fileName).toLowerCase() === '.py';
  if (!isPython) {
    return {
      filePath: null,
      errorMessage: '現在のファイルは Python ファイルではありません。'
    };
  }

  return {
    filePath: fileName,
    errorMessage: ''
  };
}

// Untitled documents are never saved here: save() would open a dialog, and the
// runner already reports that the file must be saved first.
async function saveDocumentBeforeRun(document) {
  if (!document || !getRunnablePythonFileFromDocument(document).filePath || !document.isDirty) {
    return false;
  }
  return Boolean(await document.save());
}

module.exports = {
  getRunnablePythonFileFromDocument,
  saveDocumentBeforeRun
};
