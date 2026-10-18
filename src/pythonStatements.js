'use strict';

// Track logical statements, so callers never mistake continuation lines or
// string contents for a new Python statement. This is not a full Python parser.
function scanPythonStatements(source) {
  const lines = String(source || '').split(/\r?\n/);
  const statements = [];
  let startLine = null;
  let topLevel = false;
  let text = '';
  let quote = null;
  let triple = false;
  let depth = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (startLine === null && (!line.trim() || /^\s*#/.test(line))) {
      continue;
    }
    if (startLine === null) {
      startLine = lineIndex;
      topLevel = !/^\s/.test(line);
    }

    let code = '';
    let inlineSuite = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (startLine === null) {
        if (/\s/.test(char) || char === ';') continue;
        if (char === '#') break;
        startLine = lineIndex;
        topLevel = !/^\s/.test(line) && !inlineSuite;
      }
      if (quote !== null) {
        if (char === '\\') {
          code += char;
          if (index + 1 < line.length) {
            code += line[++index];
          }
          continue;
        }
        const delimiter = triple ? quote.repeat(3) : quote;
        if (line.startsWith(delimiter, index)) {
          code += delimiter;
          index += delimiter.length - 1;
          quote = null;
        } else {
          code += char;
        }
        continue;
      }
      if (char === '#') {
        break;
      }
      if (char === ';' && depth === 0) {
        text += (text ? '\n' : '') + code;
        statements.push({ startLine, endLine: lineIndex, text, topLevel });
        startLine = null;
        text = '';
        code = '';
        continue;
      }
      if (char === ':' && depth === 0
        && /^(?:async\s+)?(?:if|elif|else|for|while|try|except|finally|with|def|class|match|case)\b/.test((text + code).trim())) {
        inlineSuite = true;
      }
      if (char === "'" || char === '"') {
        quote = char;
        triple = line.startsWith(char.repeat(3), index);
        const delimiter = triple ? char.repeat(3) : char;
        code += delimiter;
        index += delimiter.length - 1;
        continue;
      }
      if ('([{'.includes(char)) {
        depth += 1;
      } else if (')]}'.includes(char)) {
        depth = Math.max(0, depth - 1);
      }
      code += char;
    }

    const continuation = quote === null && /\\\s*$/.test(code);
    text += (text ? '\n' : '') + (continuation ? code.replace(/\\\s*$/, '') : code);
    if (startLine !== null && quote === null && depth === 0 && !continuation) {
      statements.push({ startLine, endLine: lineIndex, text, topLevel });
      startLine = null;
      text = '';
    }
  }
  if (startLine !== null) {
    statements.push({ startLine, endLine: lines.length - 1, text, topLevel });
  }
  return statements;
}

module.exports = { scanPythonStatements };
