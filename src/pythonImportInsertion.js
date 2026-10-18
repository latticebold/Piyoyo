'use strict';

const { scanPythonStatements } = require('./pythonStatements');

const FROM_IMPORT_PATTERN = /^from\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s+import\s+(.+)$/;
const MODULE_IMPORT_PATTERN = /^import\s+(.+)$/;

function getImportInsertion(source, requiredImports = []) {
  const sourceText = String(source || '');
  const missingImports = getMissingImports(sourceText, requiredImports);

  if (missingImports.length === 0) {
    return {
      imports: [],
      line: null,
      text: ''
    };
  }

  const newline = sourceText.includes('\r\n') ? '\r\n' : '\n';
  const lines = splitLines(sourceText);
  const headerLine = getPythonHeaderInsertionLine(sourceText);
  const lastLine = Math.max(0, lines.length - 1);
  // A complete header may occupy the final line without a trailing newline.
  // Append after that line instead of clamping the edit to its beginning.
  if (headerLine > lastLine && lines[lastLine].length > 0) {
    return {
      imports: missingImports,
      line: lastLine,
      character: lines[lastLine].length,
      text: `${newline}${missingImports.join(newline)}${newline}`
    };
  }
  const line = Math.min(headerLine, lastLine);
  const hasContentAtInsertionLine = lines[line].trim().length > 0;
  const separator = hasContentAtInsertionLine ? `${newline}${newline}` : newline;

  return {
    imports: missingImports,
    line,
    text: `${missingImports.join(newline)}${separator}`
  };
}

function getMissingImports(source, requiredImports = []) {
  const existingImports = parseTopLevelImports(source);
  const seenRequirements = new Set();
  const missingImports = [];

  for (const requiredImport of requiredImports) {
    if (typeof requiredImport !== 'string') {
      continue;
    }

    const statement = requiredImport.trim();
    if (!statement || seenRequirements.has(statement)) {
      continue;
    }
    seenRequirements.add(statement);

    const parsedRequirement = parseImportStatement(statement);
    if (!parsedRequirement || isImportSatisfied(parsedRequirement, existingImports)) {
      continue;
    }

    missingImports.push(statement);
  }

  return missingImports;
}

function getPythonHeaderInsertionLine(source) {
  const lines = splitLines(source);
  const scanned = scanPythonStatements(source);
  // An edit is inserted at a line boundary. Consume every statement sharing
  // a header line, including a future import after a semicolon.
  for (let cursor = scanned.length - 2; cursor >= 0; cursor -= 1) {
    if (scanned[cursor + 1].startLine <= scanned[cursor].endLine) {
      scanned[cursor].endLine = Math.max(scanned[cursor].endLine, scanned[cursor + 1].endLine);
    }
  }
  const statements = new Map();
  for (const statement of scanned) {
    if (!statements.has(statement.startLine)) statements.set(statement.startLine, statement);
  }
  let index = 0;

  if (lines[0] && /^#!/.test(lines[0])) {
    index = 1;
  }

  index = skipEncodingComment(lines, index);
  index = skipIgnorable(lines, index);

  const docstringEnd = getStringStatementEnd(statements.get(index));
  if (docstringEnd !== null) {
    index = docstringEnd + 1;
    index = skipIgnorable(lines, index);
  }

  while (isFutureImport(statements.get(index))) {
    index = statements.get(index).endLine + 1;
    index = skipIgnorable(lines, index);
  }

  return consumeTopLevelImportBlock(lines, index, statements);
}

function parseTopLevelImports(source) {
  return scanPythonStatements(source)
    .filter((statement) => statement.topLevel)
    .map((statement) => parseImportStatement(statement.text))
    .filter(Boolean);
}

function parseImportStatement(statement) {
  const normalized = statement.trim().replace(/\s+/g, ' ');
  const fromMatch = normalized.match(FROM_IMPORT_PATTERN);

  if (fromMatch) {
    return {
      kind: 'from',
      module: fromMatch[1],
      names: parseImportedNames(fromMatch[2])
    };
  }

  const moduleMatch = normalized.match(MODULE_IMPORT_PATTERN);
  if (moduleMatch) {
    return {
      kind: 'module',
      modules: parseImportedNames(moduleMatch[1])
    };
  }

  return null;
}

function parseImportedNames(value) {
  return value
    .replace(/[()]/g, '')
    .split(',')
    .map((part) => {
      const pieces = part.trim().split(/\s+as\s+/);
      return {
        name: pieces[0].trim(),
        alias: pieces.length > 1 ? pieces[1].trim() : ''
      };
    })
    .filter((item) => item.name);
}

function isImportSatisfied(requiredImport, existingImports) {
  if (requiredImport.kind === 'from') {
    const existingFromImports = existingImports.filter(
      (item) => item.kind === 'from' && item.module === requiredImport.module
    );

    return requiredImport.names.every((requiredName) => existingFromImports.some(
      (existingImport) => existingImport.names.some(
        (existingName) => existingName.name === requiredName.name && !existingName.alias
      )
    ));
  }

  return requiredImport.modules.every((requiredModule) => existingImports.some(
    (existingImport) => existingImport.kind === 'module'
      && existingImport.modules.some(
        (existingModule) => existingModule.name === requiredModule.name && !existingModule.alias
      )
  ));
}

function consumeTopLevelImportBlock(lines, start, statements) {
  let index = start;
  let foundImport = false;

  while (index < lines.length) {
    if (isTopLevelImport(statements.get(index))) {
      foundImport = true;
      index = statements.get(index).endLine + 1;
      continue;
    }

    if ((isBlank(lines[index]) || isComment(lines[index])) && foundImport) {
      const nextCodeLine = findNextNonIgnorableLine(lines, index + 1);
      if (nextCodeLine < lines.length && isTopLevelImport(statements.get(nextCodeLine))) {
        index = nextCodeLine;
        continue;
      }
    }

    break;
  }

  return index;
}

function skipEncodingComment(lines, start) {
  let index = start;
  const limit = Math.min(lines.length, 2);

  for (let lineIndex = start; lineIndex < limit; lineIndex += 1) {
    if (isEncodingComment(lines[lineIndex])) {
      index = Math.max(index, lineIndex + 1);
    }
  }

  return index;
}

function skipIgnorable(lines, start) {
  let index = start;
  while (index < lines.length && (isBlank(lines[index]) || isComment(lines[index]))) {
    index += 1;
  }
  return index;
}

function findNextNonIgnorableLine(lines, start) {
  return skipIgnorable(lines, start);
}

function getStringStatementEnd(statement) {
  if (!statement || !statement.topLevel) {
    return null;
  }

  const value = statement.text;
  let cursor = 0;
  let end = value.length;
  const skipWhitespace = () => {
    while (cursor < end && /\s/.test(value[cursor])) cursor += 1;
    while (end > cursor && /\s/.test(value[end - 1])) end -= 1;
  };
  skipWhitespace();
  while (value[cursor] === '(' && value[end - 1] === ')') {
    cursor += 1;
    end -= 1;
    skipWhitespace();
  }

  // Read each character once: backslashes always consume the following
  // character, so quote runs cannot trigger ambiguous regex backtracking.
  let foundLiteral = false;
  while (cursor < end) {
    if (/[rRuU]/.test(value[cursor])) cursor += 1;
    const quote = value[cursor];
    if (quote !== "'" && quote !== '"') return null;
    const delimiter = value.startsWith(quote.repeat(3), cursor) ? quote.repeat(3) : quote;
    cursor += delimiter.length;
    let closed = false;
    while (cursor < end) {
      if (value[cursor] === '\\') {
        cursor += 2;
      } else if (value.startsWith(delimiter, cursor)) {
        cursor += delimiter.length;
        closed = true;
        break;
      } else {
        if (delimiter.length === 1 && /[\r\n]/.test(value[cursor])) return null;
        cursor += 1;
      }
    }
    if (!closed || cursor > end) return null;
    foundLiteral = true;
    while (cursor < end && /\s/.test(value[cursor])) cursor += 1;
  }
  return foundLiteral ? statement.endLine : null;
}

function isTopLevelImport(statement) {
  return Boolean(statement)
    && statement.topLevel
    && Boolean(parseImportStatement(statement.text));
}

function isFutureImport(statement) {
  return isTopLevelImport(statement)
    && /^from\s+__future__\s+import\s+/.test(statement.text.trim());
}

function isEncodingComment(line) {
  return /^\s*#.*coding[:=]\s*[-\w.]+/.test(line || '');
}

function isBlank(line) {
  return !line || !line.trim();
}

function isComment(line) {
  return /^\s*#/.test(line || '');
}

function splitLines(source) {
  return String(source || '').split(/\r?\n/);
}

module.exports = {
  getImportInsertion,
  getMissingImports,
  getPythonHeaderInsertionLine
};
