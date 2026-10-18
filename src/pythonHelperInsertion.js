'use strict';

const { getPythonHeaderInsertionLine } = require('./pythonImportInsertion');
const { scanPythonStatements } = require('./pythonStatements');

const BLANK_LINES_AROUND_DEF = 2;

function getHelperInsertion(source, requiredHelpers = []) {
  const sourceText = String(source || '');
  const missingHelpers = getMissingHelpers(sourceText, requiredHelpers);

  if (missingHelpers.length === 0) {
    return {
      helpers: [],
      line: null,
      text: ''
    };
  }

  const newline = sourceText.includes('\r\n') ? '\r\n' : '\n';
  const lines = sourceText.split(/\r?\n/);
  const lastLine = lines.length - 1;
  const headerLine = getPythonHeaderInsertionLine(sourceText);
  const code = missingHelpers
    .map((helper) => helper.code.replace(/\r?\n/g, newline).replace(/\s+$/, ''))
    .join(newline.repeat(BLANK_LINES_AROUND_DEF + 1));

  // Leave room for the call when the cursor sits right after the helper.
  const trailingRoom = newline.repeat(BLANK_LINES_AROUND_DEF);

  // A header on the final line without a trailing newline: append after it.
  if (headerLine > lastLine && lines[lastLine].length > 0) {
    return {
      helpers: missingHelpers.map((helper) => helper.name),
      line: lastLine,
      character: lines[lastLine].length,
      text: `${newline.repeat(BLANK_LINES_AROUND_DEF + 1)}${code}${newline}${trailingRoom}`
    };
  }

  const line = Math.min(headerLine, lastLine);
  const hasContentBefore = lines.slice(0, line).some((value) => value.trim());
  const blankBefore = countBlankLinesBackward(lines, line - 1);
  const hasContentAfter = lines.slice(line).some((value) => value.trim());
  const blankAfter = countBlankLinesForward(lines, line);
  const before = hasContentBefore
    ? newline.repeat(Math.max(0, BLANK_LINES_AROUND_DEF - blankBefore))
    : '';
  const after = hasContentAfter
    ? newline.repeat(Math.max(0, BLANK_LINES_AROUND_DEF - blankAfter))
    : trailingRoom;

  return {
    helpers: missingHelpers.map((helper) => helper.name),
    line,
    text: `${before}${code}${newline}${after}`
  };
}

function getMissingHelpers(source, requiredHelpers = []) {
  const definedNames = getTopLevelFunctionNames(source);
  const missing = [];

  for (const helper of requiredHelpers) {
    if (!helper || typeof helper.name !== 'string' || typeof helper.code !== 'string') {
      continue;
    }
    if (definedNames.has(helper.name)) {
      continue;
    }
    definedNames.add(helper.name);
    missing.push(helper);
  }

  return missing;
}

function getTopLevelFunctionNames(source) {
  const names = new Set();
  for (const statement of scanPythonStatements(source)) {
    if (!statement.topLevel) {
      continue;
    }
    const match = statement.text.trim().match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (match) {
      names.add(match[1]);
    }
  }
  return names;
}

function countBlankLinesBackward(lines, start) {
  let count = 0;
  for (let index = start; index >= 0 && !lines[index].trim(); index -= 1) {
    count += 1;
  }
  return count;
}

function countBlankLinesForward(lines, start) {
  let count = 0;
  for (let index = start; index < lines.length && !lines[index].trim(); index += 1) {
    count += 1;
  }
  return count;
}

module.exports = {
  getHelperInsertion,
  getMissingHelpers
};
