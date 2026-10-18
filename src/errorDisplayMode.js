'use strict';

const ERROR_DISPLAY_MODES = Object.freeze(['friendly', 'both', 'original']);
const DEFAULT_ERROR_DISPLAY_MODE = 'friendly';

const EXPLICIT_VALUE_KEYS = Object.freeze([
  'globalValue',
  'workspaceValue',
  'workspaceFolderValue',
  'globalLanguageValue',
  'workspaceLanguageValue',
  'workspaceFolderLanguageValue'
]);

function normalizeErrorDisplayMode(value) {
  return ERROR_DISPLAY_MODES.includes(value) ? value : DEFAULT_ERROR_DISPLAY_MODE;
}

// `inspected` is the result of WorkspaceConfiguration.inspect('errorDisplayMode').
function resolveErrorDisplayMode({ inspected, configuredMode, legacyShowOriginalErrors } = {}) {
  const explicitlySet = Boolean(inspected) &&
    EXPLICIT_VALUE_KEYS.some((key) => inspected[key] !== undefined);
  if (explicitlySet) return normalizeErrorDisplayMode(configuredMode);
  return legacyShowOriginalErrors === true ? 'both' : DEFAULT_ERROR_DISPLAY_MODE;
}

// Injected into the webview script via toString(), so keep it self-contained.
function getErrorPresentation({ mode, explanation, originalText }) {
  const hasExplanation = Boolean(explanation);
  const hasOriginal = Boolean(originalText);
  return {
    showField: hasExplanation || hasOriginal,
    showExplanation: hasExplanation,
    showOriginal: hasOriginal,
    originalExpanded: mode !== 'friendly',
    explanationExpanded: mode !== 'original' || !hasOriginal
  };
}

module.exports = {
  DEFAULT_ERROR_DISPLAY_MODE,
  ERROR_DISPLAY_MODES,
  getErrorPresentation,
  normalizeErrorDisplayMode,
  resolveErrorDisplayMode
};
