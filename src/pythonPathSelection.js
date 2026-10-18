'use strict';

function nonEmptyTrimmed(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function resolvePythonPath({
  selectedPythonPath = '',
  configPythonPath = '',
  legacyPythonPath = '',
  olderLegacyPythonPath = '',
  defaultInterpreterPath = '',
  platform = process.platform
} = {}) {
  return nonEmptyTrimmed(selectedPythonPath)
    || nonEmptyTrimmed(configPythonPath)
    || nonEmptyTrimmed(legacyPythonPath)
    || nonEmptyTrimmed(olderLegacyPythonPath)
    || nonEmptyTrimmed(defaultInterpreterPath)
    || (platform === 'win32' ? 'python' : 'python3');
}

module.exports = {
  resolvePythonPath
};
