'use strict';

const path = require('node:path');

const GENERAL_EXPLANATIONS = Object.freeze({
  SyntaxError: '文法に関するエラーが発生しました。括弧、コロン、引用符などを確認してください。',
  IndentationError: '行頭の空白を確認してください。',
  TabError: 'インデントに使ったタブと空白を確認してください。',
  NameError: '使った名前を確認してください。',
  UnboundLocalError: '関数内で使った名前を確認してください。',
  AttributeError: '属性やメソッドの名前を確認してください。',
  TypeError: '型や引数に関するエラーが発生しました。',
  ValueError: '値に関するエラーが発生しました。',
  IndexError: '位置に関するエラーが発生しました。',
  KeyError: 'キーに関するエラーが発生しました。',
  ZeroDivisionError: '0で割る処理を確認してください。',
  ImportError: '読み込む名前と実行環境を確認してください。',
  ModuleNotFoundError: 'モジュール名と実行環境を確認してください。',
  FileNotFoundError: 'ファイル名と保存先を確認してください。',
  RecursionError: '再帰の終了条件を確認してください。',
  EOFError: '入力の行数を確認してください。'
});

const TYPE_LABELS = Object.freeze({
  str: '文字列',
  list: 'リスト',
  int: '数値',
  float: '数値',
  complex: '数値',
  bool: '真偽値',
  tuple: 'タプル',
  dict: '辞書',
  set: '集合',
  bytes: 'バイト列',
  NoneType: 'None'
});

function isValidIdentifier(value, maxLength = 64) {
  if (typeof value !== 'string') return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= maxLength && /^[_\p{ID_Start}][\p{ID_Continue}]*$/u.test(value);
}

function isValidModuleName(value) {
  if (typeof value !== 'string' || Array.from(value).length > 128) return false;
  const parts = value.split('.');
  return parts.length > 0 && parts.every((part) => isValidIdentifier(part, 128));
}

function labelForType(typeName) {
  return Object.hasOwn(TYPE_LABELS, typeName) ? TYPE_LABELS[typeName] : null;
}

// Accept only simple repr strings and integers. Never evaluate traceback text.
function safeReprValue(repr) {
  const integer = /^-?(?:0|[1-9]\d{0,11})$/.exec(repr);
  if (integer) return repr;

  const string = /^(['"])([^'"\\\r\n\u0000-\u001f\u007f-\u009f]*)\1$/.exec(repr);
  if (!string || Array.from(string[2]).length > 40 || /[\p{Cc}\p{Cf}]/u.test(string[2])) {
    return null;
  }
  return `「${string[2]}」`;
}

function explainPlusTypeError(message) {
  let match = /^can only concatenate (\w+) \(not ["'](\w+)["']\) to (\w+)$/.exec(message);
  let leftType;
  let rightType;

  if (match && match[1] === match[3]) {
    leftType = match[1];
    rightType = match[2];
  } else {
    match = /^unsupported operand type(?:\(s\))? for \+: ['"](\w+)['"] and ['"](\w+)['"]$/.exec(message);
    if (match) {
      [, leftType, rightType] = match;
    }
  }

  const leftLabel = leftType && labelForType(leftType);
  const rightLabel = rightType && labelForType(rightType);
  if (!leftLabel || !rightLabel) return null;
  return `${leftLabel}と${rightLabel}を足そうとしています。`;
}

function explainDetailedError(errorType, message) {
  let match;

  if (errorType === 'TypeError') {
    const plusExplanation = explainPlusTypeError(message);
    if (plusExplanation) return plusExplanation;

    match = /^['"](\w+)['"] object is not subscriptable$/.exec(message);
    if (match) {
      const label = labelForType(match[1]);
      if (label) return `${label}の値に添字を指定しようとしています。`;
    }

    match = /^['"](\w+)['"] object is not callable$/.exec(message);
    if (match) {
      const label = labelForType(match[1]);
      if (label) return `${label}の値を関数のように呼び出そうとしています。`;
    }

    match = /^len\(\) takes exactly one argument \((\d{1,9}) given\)$/.exec(message);
    if (match) return `len()には引数が1個必要ですが、${match[1]}個渡されています。`;

    match = /^can't multiply sequence by non-int of type ['"](\w+)['"]$/.exec(message);
    if (match) {
      const label = labelForType(match[1]);
      if (label) return `繰り返す回数には整数が必要ですが、${label}を指定しています。`;
    }
  }

  if (errorType === 'NameError') {
    match = /^name ['"]([^'"]+)['"] is not defined$/.exec(message);
    if (match && isValidIdentifier(match[1])) return `名前「${match[1]}」が定義されていません。`;
  }

  if (errorType === 'UnboundLocalError') {
    match = /^cannot access local variable ['"]([^'"]+)['"] where it is not associated with a value$/.exec(message);
    if (match && isValidIdentifier(match[1])) {
      return `関数内の名前「${match[1]}」を、値が入る前に使おうとしています。`;
    }
  }

  if (errorType === 'AttributeError') {
    match = /^['"](\w+)['"] object has no attribute ['"]([^'"]+)['"]$/.exec(message);
    if (match && isValidIdentifier(match[2])) {
      const label = labelForType(match[1]);
      if (label) return `${label}に「${match[2]}」という属性はありません。`;
    }
  }

  if (errorType === 'ModuleNotFoundError') {
    match = /^No module named ['"]([^'"]+)['"]$/.exec(message);
    if (match && isValidModuleName(match[1])) return `モジュール「${match[1]}」が見つかりません。`;
  }

  if (errorType === 'ImportError') {
    match = /^cannot import name (['"])([^'"]+)\1 from (['"])([^'"]+)\3(?: \(unknown location\)| \(([^()\r\n]{1,260})\))?$/.exec(message);
    if (match && isValidIdentifier(match[2]) && isValidModuleName(match[4])) {
      return `モジュール「${match[4]}」から「${match[2]}」を読み込めません。`;
    }
  }

  if (errorType === 'IndexError') {
    if (message === 'list index out of range') return 'リストの添字が範囲外です。';
    if (message === 'string index out of range') return '文字列の添字が範囲外です。';
    if (message === 'tuple index out of range') return 'タプルの添字が範囲外です。';
  }

  if (errorType === 'KeyError') {
    const safeValue = safeReprValue(message);
    return safeValue === null
      ? 'キーが見つかりません。'
      : `${safeValue}というキーが見つかりません。`;
  }

  if (errorType === 'ZeroDivisionError' && message === 'division by zero') {
    return '0で割ろうとしています。';
  }

  if (errorType === 'ValueError') {
    match = /^invalid literal for int\(\) with base 10: (.*)$/.exec(message);
    if (match) {
      const safeValue = safeReprValue(match[1]);
      return safeValue === null
        ? '整数に変換できません。'
        : `${safeValue}は10進整数に変換できません。`;
    }

    match = /^could not convert string to float: (.*)$/.exec(message);
    if (match) {
      const safeValue = safeReprValue(match[1]);
      return safeValue === null
        ? '浮動小数点数に変換できません。'
        : `${safeValue}は浮動小数点数に変換できません。`;
    }
  }

  if (errorType === 'SyntaxError') {
    if (message === "expected ':'") return 'コロン「:」が必要です。';
    if (/^unterminated string literal \(detected at line \d{1,9}\)$/.test(message)) {
      return '文字列を囲む引用符が閉じられていません。';
    }
  }

  if (errorType === 'EOFError' && message === 'EOF when reading a line') {
    return 'input()が読み込む前に入力が終わりました。';
  }

  return null;
}

function parseExceptionLine(line) {
  // CPython writes the terminal exception at column zero. Requiring that
  // keeps indented source excerpts and traceback context from looking like an
  // exception line.
  const match = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(?::(?: (.*)|$))?$/.exec(line.trimEnd());
  if (!match) return null;
  return {
    errorType: match[1],
    message: match[2] || ''
  };
}

function parseTracebackFrame(line) {
  const match = /^\s*File "(.+)", line (\d+)(?:, in .*)?$/.exec(line);
  if (!match) return null;
  return { filePath: match[1], lineNumber: match[2] };
}

function parsePythonFailure(stderr) {
  if (typeof stderr !== 'string' || !stderr) return null;
  const lines = stderr.split(/\r?\n/);
  const lastNonEmptyIndex = lines.findLastIndex((line) => line.trim() !== '');
  if (lastNonEmptyIndex < 0) return null;

  // Exception groups have nested traceback structure and cannot be reduced to
  // one final exception line without losing which exception caused the stop.
  if (lines.some((line) => /(?:Exception Group Traceback|ExceptionGroup:)/.test(line))) {
    return { unsupportedTraceback: true };
  }

  const tracebackHeader = 'Traceback (most recent call last):';
  const tracebackStart = lines.findLastIndex((line) => line.trim() === tracebackHeader);

  if (tracebackStart >= 0) {
    const frames = [];
    for (const line of lines.slice(tracebackStart + 1)) {
      const frame = parseTracebackFrame(line);
      if (frame) {
        frames.push(frame);
        continue;
      }
      const exception = frames.length > 0 && parseExceptionLine(line);
      if (exception) return { ...exception, frames };
    }
    return null;
  }

  // Syntax errors are displayed without a normal Traceback header.
  const syntaxLocations = [];
  for (const line of lines) {
    const frame = parseTracebackFrame(line);
    if (frame) {
      syntaxLocations.push(frame);
      continue;
    }
    const exception = syntaxLocations.length > 0 && parseExceptionLine(line);
    if (exception) {
      return ['SyntaxError', 'IndentationError', 'TabError'].includes(exception.errorType)
        ? { ...exception, frames: syntaxLocations }
        : null;
    }
  }
  return null;
}

function isWindowsPath(value) {
  return typeof value === 'string' && (
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/.test(value)
  );
}

function normalizedAbsolutePath(value, windows) {
  if (typeof value !== 'string' || !value) return null;
  const pathApi = windows ? path.win32 : path.posix;
  if (!pathApi.isAbsolute(value)) return null;
  let normalized = pathApi.normalize(value);
  const root = pathApi.parse(normalized).root;
  if (normalized.length > root.length) normalized = normalized.replace(/[\\/]$/, '');
  return windows ? normalized.toLowerCase() : normalized;
}

function pathIsWithin(candidate, root, windows) {
  const pathApi = windows ? path.win32 : path.posix;
  const relative = pathApi.relative(root, candidate);
  return relative === '' || (!pathApi.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${pathApi.sep}`));
}

function workspaceMatch(filePath, workspaceFolders) {
  const windows = isWindowsPath(filePath);
  const candidate = normalizedAbsolutePath(filePath, windows);
  if (!candidate) return null;

  let best = null;
  for (const folder of workspaceFolders) {
    if (typeof folder !== 'string') continue;
    const folderIsWindows = isWindowsPath(folder);
    if (folderIsWindows !== windows) continue;
    const root = normalizedAbsolutePath(folder, windows);
    if (!root || !pathIsWithin(candidate, root, windows)) continue;

    const pathApi = windows ? path.win32 : path.posix;
    const relative = pathApi.relative(root, candidate);
    if (!best || root.length > best.root.length) best = { root, relative };
  }
  return best;
}

function sameAbsolutePath(left, right) {
  const windows = isWindowsPath(left) || isWindowsPath(right);
  const normalizedLeft = normalizedAbsolutePath(left, windows);
  const normalizedRight = normalizedAbsolutePath(right, windows);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function displayRelativePath(relative, windows) {
  const pathApi = windows ? path.win32 : path.posix;
  return relative.split(pathApi.sep).join('/');
}

function isExternalLibraryPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const segments = filePath.replace(/\\/g, '/').toLowerCase().split('/');
  return segments.includes('site-packages') || segments.includes('dist-packages') ||
    segments.some((segment, index) => segment === '.venv' && ['lib', 'lib64', 'libs'].includes(segments[index + 1]));
}

function getLocationPrefix(frames, filePath, workspaceFolders) {
  if (!Array.isArray(frames) || frames.length === 0) return '';
  const executionFrame = frames[frames.length - 1];
  const executionIsTarget = typeof filePath === 'string' && sameAbsolutePath(executionFrame.filePath, filePath);
  const executionWorkspace = !isExternalLibraryPath(executionFrame.filePath) &&
    workspaceMatch(executionFrame.filePath, workspaceFolders);

  if (executionIsTarget) return `${executionFrame.lineNumber} 行目: `;
  if (executionWorkspace) {
    const relative = displayRelativePath(executionWorkspace.relative, isWindowsPath(executionFrame.filePath));
    return `${relative} の ${executionFrame.lineNumber} 行目: `;
  }

  const callerFrame = [...frames].reverse().find((frame) => {
    return (typeof filePath === 'string' && sameAbsolutePath(frame.filePath, filePath)) ||
      (!isExternalLibraryPath(frame.filePath) && workspaceMatch(frame.filePath, workspaceFolders));
  });
  if (!callerFrame) return '';
  if (typeof filePath === 'string' && sameAbsolutePath(callerFrame.filePath, filePath)) {
    return `${callerFrame.lineNumber} 行目から呼び出した処理で: `;
  }

  const callerWorkspace = workspaceMatch(callerFrame.filePath, workspaceFolders);
  if (!callerWorkspace) return '';
  const relative = displayRelativePath(callerWorkspace.relative, isWindowsPath(callerFrame.filePath));
  return `${relative} の ${callerFrame.lineNumber} 行目から呼び出した処理で: `;
}

function explainStartupError(errorMessage) {
  if (errorMessage === 'Python ファイルが選択されていません。') {
    return '実行する Python ファイルを選択してください。';
  }
  if (errorMessage === 'Python 実行ファイルが設定されていません。') {
    return 'Python の実行ファイルを設定してください。';
  }
  if (/\bENOENT\b/.test(errorMessage)) {
    return 'Python の実行ファイルが見つかりません。Python の起動設定を確認してください。';
  }
  return '実行を開始できませんでした。Python の起動設定とファイルを確認してください。';
}

function explainPythonError({
  stderr = '',
  exitCode = null,
  errorMessage = '',
  timedOut = false,
  timeoutMs,
  filePath,
  workspaceFolders = []
} = {}) {
  if (timedOut) {
    const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? `${timeoutMs} ms` : '制限時間';
    return `実行が ${duration} を超えたため停止しました。処理の回数や無限ループを確認してください。`;
  }

  if (errorMessage) return explainStartupError(errorMessage);

  if (exitCode === 0) {
    return typeof stderr === 'string' && stderr.trim()
      ? 'Pythonから注意事項が出力されました。必要に応じて内容を確認してください。'
      : '';
  }

  if (/^(?:.*[\\/])?python(?:\d+(?:\.\d+)*)?(?:\.exe)?: can't open file\b/im.test(stderr)) {
    return '実行する Python ファイルが見つかりません。ファイルの保存先を確認してください。';
  }

  const failure = parsePythonFailure(stderr);
  if (!failure || failure.unsupportedTraceback) {
    return exitCode === null
      ? 'Pythonの実行が途中で停止しました。入力と実行環境を確認してください。'
      : `プログラムが終了コード ${exitCode} で終了しました。入力と実行環境を確認してください。`;
  }

  const explanation = explainDetailedError(failure.errorType, failure.message) ||
    (Object.hasOwn(GENERAL_EXPLANATIONS, failure.errorType) ? GENERAL_EXPLANATIONS[failure.errorType] : null) ||
    'プログラムの実行中にエラーが発生しました。';
  const locationPrefix = getLocationPrefix(
    failure.frames,
    filePath,
    Array.isArray(workspaceFolders) ? workspaceFolders : []
  );
  return `${locationPrefix}${explanation}`;
}

module.exports = { explainPythonError };
