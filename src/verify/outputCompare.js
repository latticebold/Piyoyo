'use strict';

const COMPARE_MODES = ['tokens', 'exact', 'float'];

const COMPARE_MODE_LABELS = {
  tokens: '空白区切り',
  exact: '完全一致',
  float: '小数の誤差を許す'
};

const DEFAULT_COMPARE_MODE = 'tokens';
const FLOAT_TOLERANCE = 1e-6;
// Absorbs rounding from parsing decimal text, so an error of exactly 1e-6 still passes.
const FLOAT_SLACK = 1 + 1e-9;
// ASCII whitespace only: a full-width space in the output would be wrong on the judge.
const WHITESPACE_PATTERN = /[ \t\n\v\f\r]+/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function normalizeText(value) {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (value !== null && value !== undefined) {
    text = String(value);
  }

  return text.replace(/\r\n?/g, '\n');
}

function splitTokens(text) {
  return text.split(WHITESPACE_PATTERN).filter(Boolean);
}

function stripTrailingNewlines(text) {
  return text.replace(/\n+$/, '');
}

function isFloatTokenEqual(expected, actual) {
  if (expected === actual) {
    return true;
  }

  if (INTEGER_PATTERN.test(expected) && INTEGER_PATTERN.test(actual)) {
    return BigInt(expected) === BigInt(actual);
  }

  if (!NUMBER_PATTERN.test(expected) || !NUMBER_PATTERN.test(actual)) {
    return false;
  }

  const expectedNumber = Number(expected);
  const actualNumber = Number(actual);
  if (!Number.isFinite(expectedNumber) || !Number.isFinite(actualNumber)) {
    return false;
  }

  // Absolute or relative error (relative to the expected value) within the tolerance.
  const limit = FLOAT_TOLERANCE * Math.max(1, Math.abs(expectedNumber)) * FLOAT_SLACK;
  return Math.abs(actualNumber - expectedNumber) <= limit;
}

function isStrictTokenEqual(expected, actual) {
  return expected === actual;
}

function tokenListsEqual(expectedTokens, actualTokens, tokenEqual) {
  if (expectedTokens.length !== actualTokens.length) {
    return false;
  }

  return expectedTokens.every((token, index) => tokenEqual(token, actualTokens[index]));
}

function splitLines(text, mode) {
  if (mode === 'exact') {
    const trimmed = stripTrailingNewlines(text);
    return trimmed === '' ? [] : trimmed.split('\n');
  }

  // Trailing blank lines do not affect the token verdict, so they are not reported.
  const lines = text.split('\n');
  while (lines.length > 0 && splitTokens(lines[lines.length - 1]).length === 0) {
    lines.pop();
  }
  return lines;
}

function createLineComparator(mode) {
  if (mode === 'exact') {
    return (expectedLine, actualLine) => expectedLine === actualLine;
  }

  const tokenEqual = mode === 'float' ? isFloatTokenEqual : isStrictTokenEqual;
  return (expectedLine, actualLine) => tokenListsEqual(
    splitTokens(expectedLine),
    splitTokens(actualLine),
    tokenEqual
  );
}

function isWholeOutputEqual(expectedText, actualText, mode) {
  if (mode === 'exact') {
    return stripTrailingNewlines(expectedText) === stripTrailingNewlines(actualText);
  }

  const tokenEqual = mode === 'float' ? isFloatTokenEqual : isStrictTokenEqual;
  return tokenListsEqual(splitTokens(expectedText), splitTokens(actualText), tokenEqual);
}

function compareOutputs(expected, actual, mode) {
  const safeMode = COMPARE_MODES.includes(mode) ? mode : DEFAULT_COMPARE_MODE;
  const expectedText = normalizeText(expected);
  const actualText = normalizeText(actual);

  if (isWholeOutputEqual(expectedText, actualText, safeMode)) {
    return { equal: true, expectedDiffLines: [], actualDiffLines: [] };
  }

  const expectedLines = splitLines(expectedText, safeMode);
  const actualLines = splitLines(actualText, safeMode);
  const lineEqual = createLineComparator(safeMode);
  const expectedDiffLines = [];
  const actualDiffLines = [];
  const lineCount = Math.max(expectedLines.length, actualLines.length);

  for (let index = 0; index < lineCount; index += 1) {
    const hasExpected = index < expectedLines.length;
    const hasActual = index < actualLines.length;
    if (hasExpected && hasActual && lineEqual(expectedLines[index], actualLines[index])) {
      continue;
    }
    if (hasExpected) {
      expectedDiffLines.push(index);
    }
    if (hasActual) {
      actualDiffLines.push(index);
    }
  }

  return { equal: false, expectedDiffLines, actualDiffLines };
}

module.exports = {
  COMPARE_MODES,
  COMPARE_MODE_LABELS,
  compareOutputs
};
