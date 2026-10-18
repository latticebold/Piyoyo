const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createUtf8PythonEnvironment,
  runPythonFile
} = require('../src/runners/pythonRunner');

function findPython() {
  const result = spawnSync(
    'uv',
    ['--no-cache', 'run', '--no-project', 'python', '-c', 'import sys; print(sys.executable)'],
    { encoding: 'utf8' }
  );
  if (!result.error && result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  throw new Error(`Could not resolve Python through uv: ${result.error?.message || result.stderr || result.status}`);
}

async function withPythonFile(source, callback, fileName = 'main.py') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'piyoyo-runner-'));
  const filePath = path.join(directory, fileName);
  await fs.writeFile(filePath, source, 'utf8');

  try {
    return await callback(filePath, directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('forces UTF-8 for Python pipes while preserving the parent environment', () => {
  const environment = createUtf8PythonEnvironment({
    PATH: 'example-path',
    CUSTOM_VALUE: 'keep-me',
    PYTHONIOENCODING: 'cp932'
  });

  assert.equal(environment.PATH, 'example-path');
  assert.equal(environment.CUSTOM_VALUE, 'keep-me');
  assert.equal(environment.PYTHONIOENCODING, 'utf-8:backslashreplace');
  assert.equal(environment.PYTHONUTF8, '1');
});

test('runPythonFile passes multiline stdin and captures stdout', async () => {
  const pythonPath = findPython();
  const source = [
    'import sys',
    'values = sys.stdin.read().splitlines()',
    'print(",".join(reversed(values)))'
  ].join('\n');

  const result = await withPythonFile(source, (filePath, cwd) =>
    runPythonFile({
      filePath,
      cwd,
      input: 'alpha\nbeta\ngamma\n',
      pythonPath,
      timeoutMs: 5000
    })
  );

  assert.equal(result.stdout.trim(), 'gamma,beta,alpha');
  assert.equal(result.stderr, '');
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.errorMessage, '');
  assert.equal(result.errorExplanation, '');
  assert.equal(typeof result.elapsedMs, 'number');
  assert.ok(result.elapsedMs >= 0);
  assert.equal(typeof result.pythonRuntime.implementation, 'string');
  assert.notEqual(result.pythonRuntime.implementation, '');
  assert.equal(typeof result.pythonRuntime.version, 'string');
  assert.notEqual(result.pythonRuntime.version, '');
  assert.equal(typeof result.pythonRuntime.executable, 'string');
  assert.notEqual(result.pythonRuntime.executable, '');
  assert.equal(result.pythonRuntime.launcher, pythonPath);
});

test('runPythonFile captures stderr and non-zero exit code', async () => {
  const pythonPath = findPython();
  const source = [
    'import sys',
    'print("before crash")',
    'print("bad input", file=sys.stderr)',
    'sys.exit(7)'
  ].join('\n');

  const result = await withPythonFile(source, (filePath, cwd) =>
    runPythonFile({
      filePath,
      cwd,
      input: '',
      pythonPath,
      timeoutMs: 5000
    })
  );

  assert.equal(result.stdout.trim(), 'before crash');
  assert.match(result.stderr, /bad input/);
  assert.equal(result.exitCode, 7);
  assert.equal(result.timedOut, false);
  assert.match(result.errorExplanation, /終了コード 7/);
});

test('keeps Japanese file names and source comments readable in tracebacks', async () => {
  const pythonPath = findPython();
  const source = 'x = int(input())  # 整数を1つ読み込む\n';

  const result = await withPythonFile(source, (filePath, cwd) =>
    runPythonFile({
      filePath,
      cwd,
      input: '',
      pythonPath,
      timeoutMs: 5000
    }), 'カンペ.py');

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /カンペ\.py/);
  assert.match(result.stderr, /整数を1つ読み込む/);
  assert.match(result.stderr, /EOFError/);
  assert.doesNotMatch(result.stderr, /\uFFFD/);
  assert.match(result.errorExplanation, /1 行目: .*入力/);
});

test('explains detailed errors from actual Python tracebacks without altering stderr', async () => {
  const pythonPath = findPython();
  const examples = [
    {
      source: 'print([0] + "str")',
      explanation: 'リストと文字列を足そうとしています。',
      exception: /TypeError/,
      originalDetails: ['can only concatenate list (not "str") to list', "unsupported operand type(s) for +: 'list' and 'str'", "unsupported operand type for +: 'list' and 'str'"]
    },
    {
      source: 'print("str" + [0])',
      explanation: '文字列とリストを足そうとしています。',
      exception: /TypeError/,
      originalDetails: ['can only concatenate str (not "list") to str', "unsupported operand type(s) for +: 'str' and 'list'", "unsupported operand type for +: 'str' and 'list'"]
    },
    {
      source: 'print("str" + 1)',
      explanation: '文字列と数値を足そうとしています。',
      exception: /TypeError/,
      originalDetails: ['can only concatenate str (not "int") to str', "unsupported operand type(s) for +: 'str' and 'int'", "unsupported operand type for +: 'str' and 'int'"]
    },
    {
      source: 'print(1 + "str")',
      explanation: '数値と文字列を足そうとしています。',
      exception: /TypeError/,
      originalDetails: ["unsupported operand type(s) for +: 'int' and 'str'", "unsupported operand type for +: 'int' and 'str'"]
    },
    {
      source: 'print([0] + 1)',
      explanation: 'リストと数値を足そうとしています。',
      exception: /TypeError/,
      originalDetails: ['can only concatenate list (not "int") to list', "unsupported operand type(s) for +: 'list' and 'int'", "unsupported operand type for +: 'list' and 'int'"]
    },
    {
      source: 'print(1 + [0])',
      explanation: '数値とリストを足そうとしています。',
      exception: /TypeError/,
      originalDetails: ["unsupported operand type(s) for +: 'int' and 'list'", "unsupported operand type for +: 'int' and 'list'"]
    },
    { source: 'print(misspelled_name)', explanation: '名前「misspelled_name」が定義されていません。', exception: /NameError/ },
    { source: 'print([].find("x"))', explanation: 'リストに「find」という属性はありません。', exception: /AttributeError/ },
    { source: 'print(int("not-a-number"))', explanation: '「not-a-number」は10進整数に変換できません。', exception: /ValueError/ }
  ];

  for (const { source, explanation, exception, originalDetails = [] } of examples) {
    const result = await withPythonFile(source, (filePath, cwd) =>
      runPythonFile({ filePath, cwd, pythonPath, timeoutMs: 5000 })
    );

    assert.equal(result.exitCode, 1, source);
    assert.match(result.stderr, exception, source);
    assert.match(result.stderr, /Traceback \(most recent call last\):/, source);
    if (originalDetails.length > 0) {
      assert.ok(
        originalDetails.some((detail) => result.stderr.includes(detail)),
        `stderr did not retain the CPython operand details for ${source}:\n${result.stderr}`
      );
    }
    assert.equal(result.errorExplanation, `1 行目: ${explanation}`, source);
  }
});

test('reports an actual syntax error at its source line', async () => {
  const pythonPath = findPython();
  const source = 'if True\n    print("missing colon")\n';

  const result = await withPythonFile(source, (filePath, cwd) =>
    runPythonFile({ filePath, cwd, pythonPath, timeoutMs: 5000 })
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /SyntaxError/);
  assert.equal(result.errorExplanation, '1 行目: コロン「:」が必要です。');
});

test('keeps an actual exception detail when BaseException.add_note adds trailing text', async () => {
  const pythonPath = findPython();
  const source = [
    'try:',
    '    int("not-a-number")',
    'except ValueError as error:',
    '    error.add_note("原因を確認")',
    '    raise'
  ].join('\n');

  const result = await withPythonFile(source, (filePath, cwd) =>
    runPythonFile({ filePath, cwd, pythonPath, timeoutMs: 5000 })
  );

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /原因を確認/);
  assert.equal(result.errorExplanation, '2 行目: 「not-a-number」は10進整数に変換できません。');
});

test('reports stderr warnings on successful execution and preserves the original warning text', async () => {
  const pythonPath = findPython();
  const warning = 'DeprecationWarning: old api will be removed';
  const source = `import sys\nprint(${JSON.stringify(warning)}, file=sys.stderr)\n`;

  const result = await withPythonFile(source, (filePath, cwd) =>
    runPythonFile({ filePath, cwd, pythonPath, timeoutMs: 5000 })
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, `${warning}${os.EOL}`);
  assert.match(result.errorExplanation, /注意/);
  assert.doesNotMatch(result.errorExplanation, /DeprecationWarning|old api/);
});

test('runPythonFile reports timeout when process exceeds timeoutMs', async () => {
  const pythonPath = findPython();
  const source = [
    'import time',
    'time.sleep(10)'
  ].join('\n');

  const result = await withPythonFile(source, (filePath, cwd) =>
    runPythonFile({
      filePath,
      cwd,
      input: '',
      pythonPath,
      timeoutMs: 100
    })
  );

  assert.equal(result.timedOut, true);
  assert.notEqual(result.signal, null);
  assert.match(result.errorExplanation, /100 ms/);
});

test('runPythonFile reports spawn errors without shell execution', async () => {
  const result = await withPythonFile('print("unused")\n', (filePath, cwd) =>
    runPythonFile({
      filePath,
      cwd,
      input: '',
      pythonPath: 'definitely-missing-python-executable-for-piyoyo-runner',
      timeoutMs: 5000
    })
  );

  assert.equal(result.stdout, '');
  assert.equal(result.exitCode, null);
  assert.equal(result.timedOut, false);
  assert.match(result.errorMessage, /definitely-missing-python-executable-for-piyoyo-runner|ENOENT/);
  assert.match(result.errorExplanation, /Python の実行ファイルが見つかりません/);
});
