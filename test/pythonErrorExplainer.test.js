const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { explainPythonError } = require('../src/runners/pythonErrorExplainer');

const WORKSPACE = path.resolve('test-fixtures', 'python-error-workspace');
const MAIN_FILE = path.join(WORKSPACE, 'main.py');

function traceback({
  type = 'TypeError',
  detail = 'example',
  frames = [{ file: MAIN_FILE, line: 7, functionName: '<module>' }],
  includeSource = true,
  chainedPrefix = ''
} = {}) {
  const lines = [...(chainedPrefix ? [chainedPrefix] : []), 'Traceback (most recent call last):'];
  for (const frame of frames) {
    lines.push(`  File "${frame.file}", line ${frame.line}, in ${frame.functionName || '<module>'}`);
    if (includeSource) {
      lines.push(`    ${frame.source || 'trigger_error()'}`);
    }
  }
  lines.push(detail === '' ? type : `${type}: ${detail}`);
  return lines.join('\n');
}

function explain(type, detail, overrides = {}) {
  return explainPythonError({
    stderr: traceback({ type, detail, ...overrides.traceback }),
    exitCode: 1,
    filePath: MAIN_FILE,
    workspaceFolders: [WORKSPACE],
    ...overrides.input
  });
}

function atMainLine(message, line = 7) {
  return `${line} 行目: ${message}`;
}

test('explains all documented TypeError plus operand orders and preserves each side', () => {
  const examples = [
    ['can only concatenate list (not "str") to list', 'リストと文字列を足そうとしています。'],
    ["unsupported operand type(s) for +: 'list' and 'str'", 'リストと文字列を足そうとしています。'],
    ["unsupported operand type for +: 'str' and 'list'", '文字列とリストを足そうとしています。'],
    ['can only concatenate str (not "int") to str', '文字列と数値を足そうとしています。'],
    ["unsupported operand type(s) for +: 'str' and 'float'", '文字列と数値を足そうとしています。'],
    ["unsupported operand type(s) for +: 'int' and 'str'", '数値と文字列を足そうとしています。'],
    ["unsupported operand type(s) for +: 'list' and 'int'", 'リストと数値を足そうとしています。'],
    ["unsupported operand type(s) for +: 'complex' and 'tuple'", '数値とタプルを足そうとしています。'],
    ["unsupported operand type(s) for +: 'bool' and 'NoneType'", '真偽値とNoneを足そうとしています。']
  ];

  for (const [detail, expected] of examples) {
    assert.equal(explain('TypeError', detail), atMainLine(expected), detail);
  }
});

test('does not infer a plus explanation from similar, malformed, unknown, or unrelated TypeErrors', () => {
  const examples = [
    "unsupported operand type(s) for -: 'str' and 'int'",
    "unsupported operand type(s) for **: 'str' and 'int'",
    "unsupported operand type(s) for +: 'list' and 'Widget'",
    'can only concatenate str (not "int") to bytes',
    'can only concatenate list (not "str") to tuple',
    "unsupported operand type(s) for +: 'list' and 'str' trailing text",
    'print() takes 1 positional argument but 2 were given'
  ];

  for (const detail of examples) {
    assert.equal(
      explain('TypeError', detail),
      atMainLine('型や引数に関するエラーが発生しました。'),
      detail
    );
  }
});

test('does not use the traceback source line to infer a TypeError cause', () => {
  const stderr = traceback({
    type: 'TypeError',
    detail: "unsupported operand type(s) for *: 'list' and 'str'",
    frames: [{ file: MAIN_FILE, line: 7, source: 'print([0] + "str")' }]
  });
  assert.equal(
    explainPythonError({ stderr, exitCode: 1, filePath: MAIN_FILE, workspaceFolders: [WORKSPACE] }),
    atMainLine('型や引数に関するエラーが発生しました。')
  );
});

test('maps every documented built-in type name to the fixed Japanese type label', () => {
  const types = [
    ['str', '文字列'], ['list', 'リスト'], ['int', '数値'], ['float', '数値'],
    ['complex', '数値'], ['bool', '真偽値'], ['tuple', 'タプル'], ['dict', '辞書'],
    ['set', '集合'], ['bytes', 'バイト列'], ['NoneType', 'None']
  ];

  for (const [type, label] of types) {
    assert.equal(
      explain('AttributeError', `'${type}' object has no attribute 'find'`),
      atMainLine(`${label}に「find」という属性はありません。`),
      type
    );
  }

  assert.equal(
    explain('AttributeError', "'Widget' object has no attribute 'find'"),
    atMainLine('属性やメソッドの名前を確認してください。')
  );
});

test('explains each documented detailed exception using only safely extracted names, values, and counts', () => {
  const examples = [
    ['NameError', "name 'pritn' is not defined", '名前「pritn」が定義されていません。'],
    ['UnboundLocalError', "cannot access local variable 'count' where it is not associated with a value", '関数内の名前「count」を、値が入る前に使おうとしています。'],
    ['AttributeError', "'list' object has no attribute 'find'", 'リストに「find」という属性はありません。'],
    ['ModuleNotFoundError', "No module named 'numpy.linalg'", 'モジュール「numpy.linalg」が見つかりません。'],
    ['ImportError', "cannot import name 'isfinite' from 'math'", 'モジュール「math」から「isfinite」を読み込めません。'],
    ['ImportError', "cannot import name 'isfinite' from 'math' (C:\\Python\\Lib\\math.py)", 'モジュール「math」から「isfinite」を読み込めません。'],
    ['ImportError', "cannot import name 'isfinite' from 'math' (unknown location)", 'モジュール「math」から「isfinite」を読み込めません。'],
    ['IndexError', 'list index out of range', 'リストの添字が範囲外です。'],
    ['IndexError', 'string index out of range', '文字列の添字が範囲外です。'],
    ['IndexError', 'tuple index out of range', 'タプルの添字が範囲外です。'],
    ['KeyError', "'missing'", '「missing」というキーが見つかりません。'],
    ['KeyError', '-123456789012', '-123456789012というキーが見つかりません。'],
    ['ZeroDivisionError', 'division by zero', '0で割ろうとしています。'],
    ['ValueError', "invalid literal for int() with base 10: 'abc'", '「abc」は10進整数に変換できません。'],
    ['ValueError', "could not convert string to float: '1.2.3'", '「1.2.3」は浮動小数点数に変換できません。'],
    ['TypeError', "'int' object is not subscriptable", '数値の値に添字を指定しようとしています。'],
    ['TypeError', "'list' object is not callable", 'リストの値を関数のように呼び出そうとしています。'],
    ['TypeError', "'function' object is not callable", '型や引数に関するエラーが発生しました。'],
    ['TypeError', "len() takes exactly one argument (2 given)", 'len()には引数が1個必要ですが、2個渡されています。'],
    ['TypeError', "can't multiply sequence by non-int of type 'float'", '繰り返す回数には整数が必要ですが、数値を指定しています。'],
    ['EOFError', 'EOF when reading a line', 'input()が読み込む前に入力が終わりました。']
  ];

  for (const [type, detail, expected] of examples) {
    assert.equal(explain(type, detail), atMainLine(expected), `${type}: ${detail}`);
  }
});

test('only accepts identifiers, module names, and ImportError location suffixes in their documented forms', () => {
  const invalidIdentifier = 'bad-name';
  const tooLongIdentifier = 'x'.repeat(65);
  const invalidModule = 'pkg..module';
  const longImportPath = `(${ 'p'.repeat(261) })`;

  const examples = [
    ['NameError', `name '${invalidIdentifier}' is not defined`, '使った名前を確認してください。'],
    ['NameError', `name '${tooLongIdentifier}' is not defined`, '使った名前を確認してください。'],
    ['AttributeError', `'list' object has no attribute '${invalidIdentifier}'`, '属性やメソッドの名前を確認してください。'],
    ['ModuleNotFoundError', `No module named '${invalidModule}'`, 'モジュール名と実行環境を確認してください。'],
    ['ImportError', `cannot import name 'thing' from 'pkg' ${longImportPath}`, '読み込む名前と実行環境を確認してください。'],
    ['ImportError', "cannot import name 'bad-name' from 'pkg'", '読み込む名前と実行環境を確認してください。']
  ];

  for (const [type, detail, expected] of examples) {
    assert.equal(explain(type, detail), atMainLine(expected), `${type}: ${detail}`);
  }
});

test('rejects long, escaped, multiline, and control-character repr values without echoing them', () => {
  const unsafeValues = [
    `'${'a'.repeat(41)}'`,
    "'line\\nbreak'",
    "'quote\\'inside'",
    `'control\u0001character'`,
    "'value with space' trailing"
  ];

  for (const repr of unsafeValues) {
    const keyMessage = explain('KeyError', repr);
    assert.equal(keyMessage, atMainLine('キーが見つかりません。'), `KeyError repr: ${JSON.stringify(repr)}`);
    assert.doesNotMatch(keyMessage, /control|break|inside|value with space|aaaa/);

    const intMessage = explain('ValueError', `invalid literal for int() with base 10: ${repr}`);
    assert.equal(intMessage, atMainLine('整数に変換できません。'), `ValueError repr: ${JSON.stringify(repr)}`);
    assert.doesNotMatch(intMessage, /control|break|inside|value with space|aaaa/);
  }

  assert.equal(explain('KeyError', '1234567890123'), atMainLine('キーが見つかりません。'));
  assert.equal(
    explain('ValueError', `invalid literal for int() with base 10: '${'a'.repeat(41)}'`),
    atMainLine('整数に変換できません。')
  );

  const literalNewline = explain('KeyError', "'line\nbreak'");
  assert.doesNotMatch(literalNewline, /line|break/);
});

test('renders safe strings and integers in KeyError and conversion errors without evaluating repr text', () => {
  assert.equal(explain('KeyError', '123456789012'), atMainLine('123456789012というキーが見つかりません。'));
  assert.equal(
    explain('KeyError', "'<img src=x onerror=alert(1)>'"),
    atMainLine('「<img src=x onerror=alert(1)>」というキーが見つかりません。')
  );
  assert.equal(explain('ValueError', "invalid literal for int() with base 10: '42x'"), atMainLine('「42x」は10進整数に変換できません。'));
  assert.equal(explain('ValueError', "could not convert string to float: 'oops'"), atMainLine('「oops」は浮動小数点数に変換できません。'));
});

test('explains the two documented SyntaxError forms and falls back for other syntax messages', () => {
  const expectedColon = explainPythonError({
    stderr: `  File "${MAIN_FILE}", line 4\n    if ready\n             ^\nSyntaxError: expected ':'`,
    exitCode: 1,
    filePath: MAIN_FILE,
    workspaceFolders: [WORKSPACE]
  });
  assert.equal(expectedColon, '4 行目: コロン「:」が必要です。');

  const unterminated = explainPythonError({
    stderr: `  File "${MAIN_FILE}", line 5\n    text = "unfinished\n                    ^\nSyntaxError: unterminated string literal (detected at line 5)`,
    exitCode: 1,
    filePath: MAIN_FILE,
    workspaceFolders: [WORKSPACE]
  });
  assert.equal(unterminated, '5 行目: 文字列を囲む引用符が閉じられていません。');

  assert.equal(
    explain('SyntaxError', 'invalid syntax'),
    atMainLine('文法に関するエラーが発生しました。括弧、コロン、引用符などを確認してください。')
  );
});

test('uses the general explanation for known exceptions when detailed matching fails', () => {
  const examples = [
    ['SyntaxError', 'invalid syntax', '文法に関するエラーが発生しました。括弧、コロン、引用符などを確認してください。'],
    ['IndentationError', 'unexpected indent', '行頭の空白を確認してください。'],
    ['TabError', 'inconsistent use of tabs and spaces in indentation', 'インデントに使ったタブと空白を確認してください。'],
    ['NameError', 'not a standard NameError body', '使った名前を確認してください。'],
    ['UnboundLocalError', 'not a standard UnboundLocalError body', '関数内で使った名前を確認してください。'],
    ['AttributeError', 'not a standard AttributeError body', '属性やメソッドの名前を確認してください。'],
    ['TypeError', 'unsupported operation', '型や引数に関するエラーが発生しました。'],
    ['ValueError', 'bad value', '値に関するエラーが発生しました。'],
    ['IndexError', 'bad index', '位置に関するエラーが発生しました。'],
    ['ZeroDivisionError', 'custom message', '0で割る処理を確認してください。'],
    ['ImportError', 'cannot resolve dependency', '読み込む名前と実行環境を確認してください。'],
    ['ModuleNotFoundError', 'not a standard module body', 'モジュール名と実行環境を確認してください。'],
    ['FileNotFoundError', 'missing data', 'ファイル名と保存先を確認してください。'],
    ['RecursionError', 'too deep', '再帰の終了条件を確認してください。'],
    ['EOFError', 'custom message', '入力の行数を確認してください。']
  ];

  for (const [type, detail, expected] of examples) {
    assert.equal(explain(type, detail), atMainLine(expected), `${type}: ${detail}`);
  }
  assert.equal(explain('KeyError', 'unprintable key repr'), atMainLine('キーが見つかりません。'));

  assert.equal(
    explain('TabError', 'inconsistent use of tabs and spaces in indentation'),
    atMainLine('インデントに使ったタブと空白を確認してください。')
  );
  assert.equal(
    explain('UnboundLocalError', 'not a standard UnboundLocalError body'),
    atMainLine('関数内で使った名前を確認してください。')
  );
});

test('handles exception classes without an Error suffix and exceptions without a body', () => {
  for (const [type, detail] of [
    ['KeyboardInterrupt', ''],
    ['SystemExit', '0'],
    ['StopIteration', ''],
    ['Exception', '']
  ]) {
    assert.equal(
      explain(type, detail),
      atMainLine('プログラムの実行中にエラーが発生しました。'),
      `${type}: ${detail}`
    );
  }
});

test('uses only the final chained exception and its own deepest traceback frame', () => {
  const helperFile = path.join(WORKSPACE, 'lib', 'helper.py');
  const stderr = [
    'Traceback (most recent call last):',
    `  File "${MAIN_FILE}", line 2, in <module>`,
    '    convert(value)',
    "ValueError: invalid literal for int() with base 10: 'first'",
    '',
    'During handling of the above exception, another exception occurred:',
    'Traceback (most recent call last):',
    `  File "${MAIN_FILE}", line 9, in <module>`,
    '    run() ',
    `  File "${helperFile}", line 14, in run`,
    '    return 1 / 0',
    'ZeroDivisionError: division by zero'
  ].join('\n');

  assert.equal(
    explainPythonError({ stderr, exitCode: 1, filePath: MAIN_FILE, workspaceFolders: [WORKSPACE] }),
    'lib/helper.py の 14 行目: 0で割ろうとしています。'
  );
});

test('keeps BaseException.add_note text from replacing the actual exception detail', () => {
  const stderr = [
    'Traceback (most recent call last):',
    `  File "${MAIN_FILE}", line 7, in <module>`,
    '    raise error',
    "ValueError: invalid literal for int() with base 10: 'abc'",
    "note: NameError: name 'decoy' is not defined"
  ].join('\n');

  const explanation = explainPythonError({ stderr, exitCode: 1, filePath: MAIN_FILE, workspaceFolders: [WORKSPACE] });
  assert.equal(explanation, '7 行目: 「abc」は10進整数に変換できません。');
  assert.doesNotMatch(explanation, /note|decoy|NameError/);
});

test('maps the target file, other workspace files, external libraries, and unrelated paths separately', () => {
  const helperFile = path.join(WORKSPACE, 'lib', 'helper.py');
  const sitePackagesFile = path.join(path.dirname(WORKSPACE), 'venv', 'Lib', 'site-packages', 'pkg.py');
  const otherWorkspaceRoot = path.resolve('another-workspace');
  const otherWorkspaceFile = path.join(otherWorkspaceRoot, 'src', 'shared.py');
  const error = { type: 'ZeroDivisionError', detail: 'division by zero', includeSource: false };

  assert.equal(
    explainPythonError({
      stderr: traceback({ ...error, frames: [{ file: MAIN_FILE, line: 7 }] }),
      exitCode: 1,
      filePath: MAIN_FILE,
      workspaceFolders: [WORKSPACE]
    }),
    '7 行目: 0で割ろうとしています。'
  );

  assert.equal(
    explainPythonError({
      stderr: traceback({ ...error, frames: [{ file: helperFile, line: 12 }] }),
      exitCode: 1,
      filePath: MAIN_FILE,
      workspaceFolders: [WORKSPACE]
    }),
    'lib/helper.py の 12 行目: 0で割ろうとしています。'
  );

  const libraryExplanation = explainPythonError({
    stderr: traceback({
      ...error,
      frames: [
        { file: MAIN_FILE, line: 7, functionName: 'main' },
        { file: sitePackagesFile, line: 81, functionName: 'run' }
      ]
    }),
    exitCode: 1,
    filePath: MAIN_FILE,
    workspaceFolders: [WORKSPACE]
  });
  assert.match(libraryExplanation, /7 行目から呼び出した処理で/);
  assert.match(libraryExplanation, /0で割ろうとしています。/);
  assert.doesNotMatch(libraryExplanation, /site-packages|81 行目/);

  const inWorkspaceVenvFile = path.join(WORKSPACE, '.venv', 'Lib', 'site-packages', 'pkg.py');
  const inWorkspaceVenvExplanation = explainPythonError({
    stderr: traceback({
      ...error,
      frames: [
        { file: MAIN_FILE, line: 7, functionName: 'main' },
        { file: inWorkspaceVenvFile, line: 25, functionName: 'run' }
      ]
    }),
    exitCode: 1,
    filePath: MAIN_FILE,
    workspaceFolders: [WORKSPACE]
  });
  assert.match(inWorkspaceVenvExplanation, /7 行目から呼び出した処理で/);
  assert.match(inWorkspaceVenvExplanation, /0で割ろうとしています。/);
  assert.doesNotMatch(inWorkspaceVenvExplanation, /\.venv|site-packages|25 行目/);

  assert.equal(
    explainPythonError({
      stderr: traceback({ ...error, frames: [{ file: otherWorkspaceFile, line: 21 }] }),
      exitCode: 1,
      filePath: MAIN_FILE,
      workspaceFolders: [WORKSPACE, otherWorkspaceRoot]
    }),
    'src/shared.py の 21 行目: 0で割ろうとしています。'
  );

  assert.equal(
    explainPythonError({
      stderr: traceback({ ...error, frames: [{ file: sitePackagesFile, line: 81 }] }),
      exitCode: 1,
      filePath: MAIN_FILE,
      workspaceFolders: [WORKSPACE]
    }),
    '0で割ろうとしています。'
  );
});

test('normalizes Windows drive letters and separators for target and workspace locations', () => {
  const windowsRoot = 'C:\\Users\\Student\\Project';
  const windowsTarget = path.win32.join(windowsRoot, 'main.py');
  const windowsHelper = path.win32.join(windowsRoot, 'lib', 'helper.py');
  const explanation = explainPythonError({
    stderr: traceback({
      type: 'ZeroDivisionError',
      detail: 'division by zero',
      frames: [{ file: windowsHelper.replaceAll('\\', '/').replace(/^C:/, 'c:'), line: 12 }]
    }),
    exitCode: 1,
    filePath: windowsTarget.replaceAll('\\', '/').replace(/^C:/, 'c:'),
    workspaceFolders: [windowsRoot]
  });

  assert.equal(explanation, 'lib/helper.py の 12 行目: 0で割ろうとしています。');
});

test('does not claim a traceback line unless its file belongs to the target or a workspace', () => {
  const stderr = traceback({ type: 'NameError', detail: "name 'answer' is not defined" });
  assert.equal(explainPythonError({ stderr, exitCode: 1 }), '名前「answer」が定義されていません。');
});

test('does not mistake arbitrary stderr text for a Python exception', () => {
  for (const stderr of [
    'NameError: name \'x\' is not defined',
    'warning: TypeError: unsupported operand type(s) for +: \'list\' and \'str\'',
    'some output\nValueError: invalid literal for int() with base 10: \'x\'\n'
  ]) {
    const explanation = explainPythonError({ stderr, exitCode: 3, filePath: MAIN_FILE, workspaceFolders: [WORKSPACE] });
    assert.match(explanation, /終了コード 3/);
    assert.doesNotMatch(explanation, /名前「x」|10進整数|リストと文字列/);
  }
});

test('falls back for exception groups and unknown exception classes without echoing English text', () => {
  const customExplanation = explain('MyCustomError', 'details');
  assert.equal(customExplanation, atMainLine('プログラムの実行中にエラーが発生しました。'));
  assert.doesNotMatch(customExplanation, /MyCustomError|details/);

  const groupExplanation = explain('ExceptionGroup', 'multiple tasks failed (2 sub-exceptions)');
  assert.match(groupExplanation, /終了コード 1/);
  assert.doesNotMatch(groupExplanation, /ExceptionGroup|multiple tasks|7 行目/);
});

test('handles success, warning-only stderr, nonzero exit, timeout, and Python launch failure', () => {
  assert.equal(explainPythonError({ stderr: '', exitCode: 0 }), '');

  const warning = explainPythonError({
    stderr: 'DeprecationWarning: an old API was used\n',
    exitCode: 0
  });
  assert.match(warning, /注意/);
  assert.doesNotMatch(warning, /DeprecationWarning|old API/);

  const nonzero = explainPythonError({ stderr: 'custom failure', exitCode: 3 });
  assert.match(nonzero, /終了コード 3/);
  assert.doesNotMatch(nonzero, /custom failure/);
  assert.match(explainPythonError({ exitCode: 4 }), /終了コード 4/);

  assert.match(explainPythonError({ timedOut: true, timeoutMs: 100 }), /100 ms/);
  assert.match(explainPythonError({ errorMessage: 'spawn python ENOENT' }), /実行ファイルが見つかりません/);
  assert.match(explainPythonError({ errorMessage: 'Python ファイルが選択されていません。' }), /実行する Python ファイルを選択/);
  assert.match(explainPythonError({ errorMessage: 'Python 実行ファイルが設定されていません。' }), /Python の実行ファイルを設定/);
});
