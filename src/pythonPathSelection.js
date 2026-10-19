'use strict';

const PYPY_LAUNCHERS = ['pypy3', 'pypy'];

function nonEmptyTrimmed(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function findAvailablePyPy(availableLaunchers) {
  const available = new Set(Array.isArray(availableLaunchers) ? availableLaunchers : []);
  return PYPY_LAUNCHERS.find((launcher) => available.has(launcher)) || '';
}

function hasExplicitPythonPath({
  selectedPythonPath = '',
  configPythonPath = '',
  legacyPythonPath = '',
  olderLegacyPythonPath = ''
} = {}) {
  return Boolean(nonEmptyTrimmed(selectedPythonPath)
    || nonEmptyTrimmed(configPythonPath)
    || nonEmptyTrimmed(legacyPythonPath)
    || nonEmptyTrimmed(olderLegacyPythonPath));
}

function resolvePythonPath({
  selectedPythonPath = '',
  configPythonPath = '',
  legacyPythonPath = '',
  olderLegacyPythonPath = '',
  availableLaunchers = [],
  defaultInterpreterPath = '',
  platform = process.platform
} = {}) {
  return nonEmptyTrimmed(selectedPythonPath)
    || nonEmptyTrimmed(configPythonPath)
    || nonEmptyTrimmed(legacyPythonPath)
    || nonEmptyTrimmed(olderLegacyPythonPath)
    || findAvailablePyPy(availableLaunchers)
    || nonEmptyTrimmed(defaultInterpreterPath)
    || (platform === 'win32' ? 'python' : 'python3');
}

// True when PyPy would have been the default but none of its launchers could start.
function isPyPyFallback(options = {}) {
  return !hasExplicitPythonPath(options) && !findAvailablePyPy(options.availableLaunchers);
}

module.exports = {
  isPyPyFallback,
  resolvePythonPath
};
