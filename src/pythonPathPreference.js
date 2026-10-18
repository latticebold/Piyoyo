'use strict';

const PYTHON_PATH_STATE_KEY = 'piyoyo.selectedPythonPath';
const LEGACY_PYTHON_PATH_STATE_KEYS = [
  'ioSprint.selectedPythonPath',
  'stdioRunner.selectedPythonPath'
];

function normalizePythonPathPreference(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function getSavedPythonPathPreference(globalState) {
  if (!globalState || typeof globalState.get !== 'function') {
    return '';
  }

  const currentValue = normalizePythonPathPreference(globalState.get(PYTHON_PATH_STATE_KEY));
  if (currentValue) {
    return currentValue;
  }

  for (const key of LEGACY_PYTHON_PATH_STATE_KEYS) {
    const legacyValue = normalizePythonPathPreference(globalState.get(key));
    if (legacyValue) {
      return legacyValue;
    }
  }

  return '';
}

function savePythonPathPreference(globalState, value) {
  if (!globalState || typeof globalState.update !== 'function') {
    return Promise.resolve();
  }

  return globalState.update(PYTHON_PATH_STATE_KEY, normalizePythonPathPreference(value));
}

module.exports = {
  PYTHON_PATH_STATE_KEY,
  LEGACY_PYTHON_PATH_STATE_KEYS,
  getSavedPythonPathPreference,
  normalizePythonPathPreference,
  savePythonPathPreference
};
