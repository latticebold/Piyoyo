const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const { ComplexityController, isPythonDocument } = require('../src/complexity/complexityController');
const { analyzeAst } = require('../src/complexity/analyzer');
const { compareModels } = require('../src/complexity/measure');
const { runPythonFile } = require('../src/runners/pythonRunner');

const DIR = path.resolve(path.sep, 'contest');
const MAIN = path.join(DIR, 'a.py');
const OTHER = path.join(DIR, 'b.py');
const EXTENSION = path.resolve(path.sep, 'extension');
const AST_DUMP_PATH = path.join(EXTENSION, 'src', 'complexity', 'ast_dump.py');
const BASELINE_PATH = path.join(EXTENSION, 'src', 'complexity', 'baseline.py');
const REAL_AST_DUMP = path.join(__dirname, '..', 'src', 'complexity', 'ast_dump.py');

function code(lines) {
  return `${lines.join('\n')}\n`;
}

const DOUBLE_LOOP = code([
  'n = int(input())',
  'for i in range(n):',
  '    for j in range(n):',
  '        print(i + j)'
]);
const SINGLE_LOOP = code([
  'n = int(input())',
  'for i in range(n):',
  '    print(i)'
]);
const SYNTAX_ERROR = code([
  'n = int(input())',
  'for i in range(n)',
  '    print(i)'
]);
const FUNCTION_CODE = code([
  'def solve(n):',
  '    total = 0',
  '    for i in range(n):',
  '        for j in range(n):',
  '            total += i * j',
  '    return total',
  '',
  'n = int(input())',
  'print(solve(n))'
]);

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

const PYTHON = findPython();

// Real ast_dump.py output, captured once per source; the fake runner replays it.
const astOutputs = new Map();
function dumpAst(source) {
  if (!astOutputs.has(source)) {
    const result = spawnSync(PYTHON, [REAL_AST_DUMP], {
      input: source,
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    if (result.error || result.status !== 0) {
      throw new Error(`ast_dump.py failed: ${result.error?.message || result.stderr}`);
    }
    astOutputs.set(source, result.stdout);
  }
  return astOutputs.get(source);
}
const SORTED_LOOP_AND_RECURSION = code([
  'def depth(k):',
  '    if k == 0:',
  '        return 0',
  '    return depth(k - 1) + 1',
  '',
  'n = int(input())',
  'a = list(map(int, input().split()))',
  'for x in sorted(a):',
  '    print(x)',
  'print(depth(n))'
]);
const WORD_MATCH = code([
  'N,M=map(int,input().split())',
  'S=[input() for i in range(N)]',
  'T=[input() for j in range(M)]',
  'ans_lst=[0]*N',
  'for j in range(M):',
  '    if T[j] in S:',
  '        ans_lst[S.index(T[j])]+=1',
  '    else:',
  '        I=[]',
  '        for i in range(N):',
  '            if len(S[i])==len(T[j]) and sum(s!=t for s,t in zip(S[i],T[j]))==1:',
  '                I.append(i)',
  '        if len(I)==1:',
  '            ans_lst[I[0]]+=1',
  '',
  'print(*ans_lst,sep="\\n")'
]);
[DOUBLE_LOOP, SINGLE_LOOP, SYNTAX_ERROR, FUNCTION_CODE, SORTED_LOOP_AND_RECURSION, WORD_MATCH].forEach(dumpAst);
// FUNCTION_CODE hints: the function line, two loop lines and the solve(n) call line.
const FUNCTION_CODE_HINT_COUNT = 4;

function intsRow(vars) {
  return { kind: 'ints', vars, needsReview: false, reviewReason: '' };
}

function intListRow(name, length) {
  return {
    kind: 'intList', name, length, min: '1', max: '9', layout: 'row', distinct: false, order: 'none',
    needsReview: false, reviewReason: ''
  };
}

function formatN(max) {
  return { rows: [intsRow([{ name: 'N', min: '1', max }])] };
}

const NO_ROWS = { rows: [] };
const INVALID_FORMAT = { rows: [intsRow([{ name: 'N', min: '1', max: 'X' }])] };
// N is a size variable here (the length of A), so it can be measured.
const MEASURE_FORMAT = { rows: [intsRow([{ name: 'N', min: '1', max: '2000' }]), intListRow('A', 'N')] };

function okRun(stdout = '', elapsedMs = 1) {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    outputLimitExceeded: false,
    errorMessage: '',
    errorExplanation: '',
    elapsedMs
  };
}

function timeoutRun(elapsedMs = 2000) {
  return { ...okRun('', elapsedMs), exitCode: null, timedOut: true, errorMessage: '2000 ms でタイムアウトしました。' };
}

function firstNumber(input) {
  return Number(String(input).split('\n')[0]);
}

// Baseline 50 ms plus the program's own time for the size on the first input line.
function timedRun(programMs) {
  return ({ filePath, input }) => {
    if (filePath === BASELINE_PATH) {
      return okRun('', 50);
    }
    const value = programMs(firstNumber(input));
    return typeof value === 'number' ? okRun('', 50 + value) : value;
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function missingFileError(filePath) {
  const error = new Error(`ENOENT: no such file or directory, '${filePath}'`);
  error.code = 'ENOENT';
  return error;
}

async function waitFor(predicate, what) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`timed out waiting for ${what}`);
}

async function settle() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createHarness({
  pythonPath = 'pypy3',
  timeoutMs = 2000,
  target = MAIN,
  format = NO_ROWS,
  files = { [MAIN]: DOUBLE_LOOP },
  vscodeApi = { workspace: { textDocuments: [] } },
  ast = ({ input }) => okRun(dumpAst(input)),
  run = () => okRun(),
  // Optional overrides: read(filePath, defaultRead) and getRunSettings(defaultSettings).
  read = null,
  getRunSettings = null
} = {}) {
  const state = { target, format, pythonPath };
  const fileMap = new Map(Object.entries(files));
  const messages = [];
  const runs = [];
  const reads = [];
  const defaultRead = async (filePath) => {
    if (!fileMap.has(filePath)) {
      throw missingFileError(filePath);
    }
    return fileMap.get(filePath);
  };
  const defaultSettings = async () => ({ pythonPath: state.pythonPath, timeoutMs, workspaceFolders: [] });
  const controller = new ComplexityController({
    vscodeApi,
    postMessage: (message) => messages.push(message),
    getRunSettings: getRunSettings ? () => getRunSettings(defaultSettings) : defaultSettings,
    runPythonFile: async (options) => {
      runs.push(options);
      return options.filePath === AST_DUMP_PATH ? ast(options) : run(options);
    },
    getVerifyState: () => ({ target: state.target, format: state.format }),
    extensionPath: EXTENSION,
    fs: {
      async readFile(filePath) {
        reads.push(filePath);
        return read ? read(filePath, defaultRead) : defaultRead(filePath);
      }
    }
  });

  const ofType = (type) => messages.filter((message) => message.type === type);
  return {
    controller,
    state,
    files: fileMap,
    messages,
    runs,
    reads,
    ofType,
    astRuns: () => runs.filter((item) => item.filePath === AST_DUMP_PATH),
    mainRuns: () => runs.filter((item) => item.filePath === state.target),
    send: (message) => controller.handleMessage(message),
    last(type) {
      const found = ofType(type);
      assert.ok(found.length > 0, `no ${type} message was posted`);
      return found[found.length - 1];
    }
  };
}

class FakeRange {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class FakeSelection {
  constructor(anchor, active) {
    this.anchor = anchor;
    this.active = active;
  }
}

class FakeThemeColor {
  constructor(id) {
    this.id = id;
  }
}

function fakeDocument(fileName, text) {
  const lines = text.split('\n');
  return {
    fileName,
    lineCount: lines.length,
    lineAt(index) {
      assert.ok(Number.isInteger(index) && index >= 0 && index < lines.length, `lineAt(${index})`);
      return {
        range: {
          start: { line: index, character: 0 },
          end: { line: index, character: lines[index].length }
        }
      };
    }
  };
}

function fakeEditor(document) {
  return {
    document,
    calls: [],
    setDecorations(type, options) {
      this.calls.push({ type, options });
    },
    lastOptions() {
      assert.ok(this.calls.length > 0, `no decorations were set for ${this.document.fileName}`);
      return this.calls[this.calls.length - 1].options;
    }
  };
}

function createFakeVscode({ sources = {}, visible = [] } = {}) {
  const config = { showInlineHints: true };
  const decorationTypes = [];
  const opened = [];
  const shown = [];
  const vscodeApi = {
    Range: FakeRange,
    Selection: FakeSelection,
    ThemeColor: FakeThemeColor,
    TextEditorRevealType: { InCenterIfOutsideViewport: 2 },
    Uri: { file: (fsPath) => ({ fsPath }) },
    workspace: {
      textDocuments: [],
      getConfiguration(section) {
        return {
          get(key, fallback) {
            return section === 'piyoyo' && key === 'complexity.showInlineHints' ? config.showInlineHints : fallback;
          }
        };
      },
      async openTextDocument(uri) {
        opened.push(uri.fsPath);
        return fakeDocument(uri.fsPath, sources[uri.fsPath] || '');
      }
    },
    window: {
      visibleTextEditors: visible,
      createTextEditorDecorationType(options) {
        const type = {
          options,
          disposed: false,
          dispose() {
            this.disposed = true;
          }
        };
        decorationTypes.push(type);
        return type;
      },
      async showTextDocument(document, options) {
        const editor = {
          document,
          selection: null,
          revealed: [],
          revealRange(range, revealType) {
            this.revealed.push({ range, revealType });
          }
        };
        shown.push({ document, options, editor });
        return editor;
      }
    }
  };
  return { vscodeApi, config, decorationTypes, opened, shown };
}

function hintsOf(options) {
  return options.map((option) => ({
    line: option.range.start.line,
    character: option.range.start.character,
    text: option.renderOptions.after.contentText
  }));
}

// ---------- analyze ----------

test('analyze runs the bundled ast_dump.py with Python found through uv', async () => {
  // The directory must exist because it becomes the working directory of Python.
  const target = path.join(os.tmpdir(), 'piyoyo-complexity-e2e.py');
  const documents = [{ fileName: target, getText: () => DOUBLE_LOOP }];
  const messages = [];
  const controller = new ComplexityController({
    vscodeApi: { workspace: { textDocuments: documents } },
    postMessage: (message) => messages.push(message),
    getRunSettings: async () => ({ pythonPath: PYTHON, timeoutMs: 2000, workspaceFolders: [] }),
    runPythonFile,
    getVerifyState: () => ({ target, format: formatN('2×10^5') }),
    extensionPath: path.join(__dirname, '..'),
    fs: {
      async readFile() {
        throw new Error('the open document must be used');
      }
    }
  });
  const results = () => messages.filter((message) => message.type === 'complexityResult');

  await controller.analyze(target);
  const result = results().at(-1);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.fileName, 'piyoyo-complexity-e2e.py');
  assert.equal(result.time, 'O(N²)');
  assert.equal(result.verdict.label, 'TLE の恐れ');

  documents[0].getText = () => SYNTAX_ERROR;
  await controller.analyze(target);
  const failed = results().at(-1);
  assert.equal(failed.ok, false);
  assert.match(failed.message, /2 行目に文法の誤り/);
  assert.doesNotMatch(failed.message, /コードを読み取れませんでした/);
});

test('analyze posts the time, space, confidence and a TLE verdict for a double loop', async () => {
  const h = createHarness({ format: formatN('2×10^5') });
  await h.controller.analyze(MAIN);

  assert.equal(h.runs.length, 1);
  const run = h.runs[0];
  assert.equal(run.filePath, AST_DUMP_PATH);
  assert.equal(run.cwd, DIR);
  assert.equal(run.input, DOUBLE_LOOP);
  assert.equal(run.pythonPath, 'pypy3');
  assert.equal(run.timeoutMs, 15000);
  assert.equal(run.inspectRuntime, false);
  assert.ok(run.outputLimitBytes >= 1024 * 1024);
  assert.deepEqual(h.reads, [MAIN]);

  assert.deepEqual(h.messages.map((message) => message.type), ['complexityState', 'complexityResult']);
  const result = h.last('complexityResult');
  assert.equal(result.ok, true);
  assert.equal(result.fileName, 'a.py');
  assert.equal(result.time, 'O(N²)');
  assert.equal(result.space, 'O(1)');
  assert.equal(result.confidence, 'high');
  assert.equal(result.confidenceLabel, '高');
  assert.deepEqual(result.verdict, { text: 'N = 2×10^5 → 4×10^10 回', label: 'TLE の恐れ', verdict: 'tle' });
  assert.equal(result.verdictNote, '');
  assert.equal(result.speedText, '1 秒あたり 3×10^7 回として計算（PyPy・目安の値）、制限時間 2 秒');
  assert.deepEqual(result.bindings, [
    { symbol: 'n', display: 'N', source: 'name', formatVar: 'N', value: 200000, valueText: '2×10^5' }
  ]);
  assert.deepEqual(result.unbound, []);
  assert.deepEqual(result.formatVars, ['N']);
  assert.deepEqual(result.lines.map(({ line, kind, label }) => ({ line, kind, label })), [
    { line: 2, kind: 'loop', label: '× N' },
    { line: 3, kind: 'loop', label: '× N' }
  ]);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('the speed text and the verdict follow PyPy or CPython from the Python path', async () => {
  const cases = [
    { pythonPath: 'pypy3', name: 'PyPy', speed: '3×10^7', label: '厳しい', verdict: 'tight' },
    { pythonPath: 'python', name: 'Python', speed: '1×10^7', label: 'TLE の恐れ', verdict: 'tle' }
  ];
  for (const item of cases) {
    const h = createHarness({ pythonPath: item.pythonPath, format: formatN('5000') });
    await h.controller.analyze(MAIN);
    const result = h.last('complexityResult');
    assert.equal(
      result.speedText,
      `1 秒あたり ${item.speed} 回として計算（${item.name}・目安の値）、制限時間 2 秒`,
      item.pythonPath
    );
    assert.equal(result.verdict.text, 'N = 5×10^3 → 3×10^7 回', item.pythonPath);
    assert.equal(result.verdict.label, item.label, item.pythonPath);
    assert.equal(result.verdict.verdict, item.verdict, item.pythonPath);
  }
});

test('without an input format the verdict is null and the note lists the unbound symbols', async () => {
  const h = createHarness();
  await h.controller.analyze(MAIN);
  const result = h.last('complexityResult');
  assert.equal(result.ok, true);
  assert.equal(result.time, 'O(N²)');
  assert.equal(result.verdict, null);
  assert.deepEqual(result.unbound, ['n']);
  assert.match(result.verdictNote, /上限が決まっていない変数があります（n）/);
  assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.formatVars, []);
  assert.equal(h.last('complexityState').canMeasure, false);
});

test('a syntax error posts the analyzer message as it is', async () => {
  const h = createHarness({ files: { [MAIN]: SYNTAX_ERROR } });
  await h.controller.analyze(MAIN);
  const expected = analyzeAst(JSON.parse(dumpAst(SYNTAX_ERROR)));
  assert.equal(expected.ok, false);
  assert.deepEqual(h.messages, [{ type: 'complexityResult', ok: false, message: expected.message }]);
  assert.match(expected.message, /2 行目に文法の誤り/);
  assert.doesNotMatch(expected.message, /コードを読み取れませんでした/);
  assert.equal(h.controller.analysis, null);
});

test('a failed AST run or an unreadable file posts ok false', async () => {
  const cases = [
    {
      name: 'exit code 1',
      ast: () => ({ ...okRun(''), exitCode: 1, stderr: 'Traceback', errorExplanation: 'Python がエラーで止まりました。' }),
      message: 'コードを読み取れませんでした。 Python がエラーで止まりました。'
    },
    { name: 'timeout', ast: () => timeoutRun(15000), message: 'コードを読み取れませんでした。' },
    { name: 'output that is not JSON', ast: () => okRun('Traceback'), message: 'コードを読み取った結果を解釈できませんでした。' }
  ];
  for (const item of cases) {
    const h = createHarness({ ast: item.ast });
    await h.controller.analyze(MAIN);
    assert.deepEqual(h.messages, [{ type: 'complexityResult', ok: false, message: item.message }], item.name);
  }

  const missing = createHarness({ files: {} });
  await missing.controller.analyze(MAIN);
  assert.equal(missing.runs.length, 0);
  const result = missing.last('complexityResult');
  assert.equal(result.ok, false);
  assert.match(result.message, /^ファイルを読めませんでした: ENOENT/);
});

test('overlapping analyze calls publish only the latest one', async () => {
  for (const laterFinishesFirst of [true, false]) {
    const pending = [];
    const h = createHarness({
      ast: ({ input }) => new Promise((resolve) => {
        pending.push({ input, release: () => resolve(okRun(dumpAst(input))) });
      })
    });
    const first = h.controller.analyze(MAIN);
    await waitFor(() => pending.length === 1, 'the first AST run');
    h.files.set(MAIN, SINGLE_LOOP);
    const second = h.controller.analyze(MAIN);
    await waitFor(() => pending.length === 2, 'the second AST run');
    assert.deepEqual(pending.map((item) => item.input), [DOUBLE_LOOP, SINGLE_LOOP]);

    if (laterFinishesFirst) {
      pending[1].release();
      await second;
      pending[0].release();
      await first;
    } else {
      pending[0].release();
      await first;
      pending[1].release();
      await second;
    }

    const where = `later finishes first: ${laterFinishesFirst}`;
    const results = h.ofType('complexityResult');
    assert.equal(results.length, 1, where);
    assert.equal(results[0].ok, true, where);
    assert.equal(results[0].time, 'O(N)', where);
  }
});

test('analyze reads the unsaved text of an open document before the file on disk', async () => {
  const documents = [
    { fileName: OTHER, getText: () => DOUBLE_LOOP },
    { fileName: MAIN, isDirty: true, getText: () => SINGLE_LOOP }
  ];
  const h = createHarness({ vscodeApi: { workspace: { textDocuments: documents } }, files: { [MAIN]: DOUBLE_LOOP } });
  await h.controller.analyze(MAIN);
  assert.equal(h.runs[0].input, SINGLE_LOOP);
  assert.deepEqual(h.reads, []);
  assert.equal(h.last('complexityResult').time, 'O(N)');

  documents.pop();
  await h.controller.analyze(MAIN);
  assert.deepEqual(h.reads, [MAIN]);
  assert.equal(h.runs[1].input, DOUBLE_LOOP);
  assert.equal(h.last('complexityResult').time, 'O(N²)');
});

test('complexityAnalyze analyzes the verify target and asks for a Python file without one', async () => {
  const h = createHarness({ target: null });
  assert.equal(await h.send({ type: 'complexityAnalyze' }), true);
  assert.deepEqual(h.messages, [{ type: 'complexityStatus', message: 'Python ファイルを開いてください。', tone: 'error' }]);
  assert.equal(h.runs.length, 0);

  h.state.target = MAIN;
  assert.equal(await h.send({ type: 'complexityAnalyze' }), true);
  assert.equal(h.runs[0].input, DOUBLE_LOOP);
  assert.equal(h.last('complexityResult').fileName, 'a.py');
});

test('handleMessage returns false for messages of other features', async () => {
  const h = createHarness();
  assert.equal(await h.send({ type: 'verifyStart' }), false);
  assert.equal(h.messages.length, 0);
});

// ---------- failures after a success ----------

test('a failed analysis after a success clears the result and the editor hints for good', async () => {
  const failures = [
    { name: 'exit code 1', ast: () => ({ ...okRun(''), exitCode: 1, stderr: 'Traceback' }) },
    { name: 'timeout', ast: () => timeoutRun(15000) },
    { name: 'output that is not JSON', ast: () => okRun('Traceback') },
    { name: 'syntax error', source: SYNTAX_ERROR },
    { name: 'read error', remove: true },
    {
      name: 'exception from the runner',
      ast: () => {
        throw new Error('spawn failed');
      },
      message: /計算量を解析できませんでした/
    }
  ];
  for (const failure of failures) {
    const mainEditor = fakeEditor(fakeDocument(MAIN, FUNCTION_CODE));
    const fake = createFakeVscode({ visible: [mainEditor] });
    let failing = false;
    const h = createHarness({
      vscodeApi: fake.vscodeApi,
      files: { [MAIN]: FUNCTION_CODE },
      format: formatN('2×10^5'),
      ast: (options) => (failing && failure.ast ? failure.ast(options) : okRun(dumpAst(options.input)))
    });
    await h.controller.analyze(MAIN);
    assert.equal(h.last('complexityResult').ok, true, failure.name);
    assert.equal(mainEditor.lastOptions().length, FUNCTION_CODE_HINT_COUNT, failure.name);

    failing = true;
    if (failure.source) {
      h.files.set(MAIN, failure.source);
    }
    if (failure.remove) {
      h.files.delete(MAIN);
    }
    h.messages.length = 0;
    await h.controller.analyze(MAIN);
    assert.deepEqual(h.ofType('complexityResult').map((message) => message.ok), [false], failure.name);
    if (failure.message) {
      assert.match(h.last('complexityResult').message, failure.message, failure.name);
    }
    assert.deepEqual(mainEditor.lastOptions(), [], failure.name);
    assert.equal(h.controller.analysis, null, failure.name);

    h.controller.handleFormatChanged();
    await h.send({ type: 'complexityBindingChanged', symbol: 'n', value: '10' });
    await h.send({ type: 'complexityBindingChanged', symbol: 'n', clear: true });
    h.controller.publish();
    h.controller.handleTargetChanged(null);
    h.controller.refreshDecorations();
    assert.equal(h.ofType('complexityResult').length, 1, `${failure.name}: the old result must not come back`);
    assert.deepEqual(mainEditor.lastOptions(), [], failure.name);
  }
});

test('analyzing another file drops the previous file result at once', async () => {
  const mainEditor = fakeEditor(fakeDocument(MAIN, FUNCTION_CODE));
  const fake = createFakeVscode({ visible: [mainEditor] });
  const pending = [];
  const h = createHarness({
    vscodeApi: fake.vscodeApi,
    files: { [MAIN]: FUNCTION_CODE, [OTHER]: SINGLE_LOOP },
    format: formatN('2×10^5'),
    ast: (options) => (options.input === SINGLE_LOOP
      ? new Promise((resolve) => pending.push(resolve))
      : okRun(dumpAst(options.input)))
  });
  await h.controller.analyze(MAIN);
  assert.equal(h.last('complexityResult').fileName, 'a.py');
  assert.equal(mainEditor.lastOptions().length, FUNCTION_CODE_HINT_COUNT);
  const firstCount = h.ofType('complexityResult').length;

  h.state.target = OTHER;
  const analyzing = h.controller.analyze(OTHER);
  assert.deepEqual(mainEditor.lastOptions(), [], 'a.py hints go away as soon as b.py starts');
  await waitFor(() => pending.length === 1, 'the b.py AST run');
  h.controller.handleFormatChanged();
  await h.send({ type: 'complexityBindingChanged', symbol: 'n', value: '10' });
  pending[0]({ ...okRun(''), exitCode: 1, stderr: 'Traceback' });
  await analyzing;
  h.controller.handleFormatChanged();
  await h.send({ type: 'complexityBindingChanged', symbol: 'n', value: '10' });

  const later = h.ofType('complexityResult').slice(firstCount);
  assert.deepEqual(later.map((message) => message.ok), [false]);
  assert.equal(later.some((message) => message.fileName === 'a.py'), false);
  assert.deepEqual(mainEditor.lastOptions(), []);

  // The binding changes above were not stored for a.py.
  h.state.target = MAIN;
  await h.controller.analyze(MAIN);
  const result = h.last('complexityResult');
  assert.equal(result.fileName, 'a.py');
  assert.equal(result.bindings[0].source, 'name');
  assert.equal(result.bindings[0].value, 200000);
});

test('a read error from an older analyze does not replace a newer result', async () => {
  let rejectFirstRead;
  const firstRead = new Promise((resolve, reject) => {
    rejectFirstRead = reject;
  });
  let readCount = 0;
  const h = createHarness({
    read: (filePath, defaultRead) => {
      readCount += 1;
      return readCount === 1 ? firstRead : defaultRead(filePath);
    }
  });
  const first = h.controller.analyze(MAIN);
  await waitFor(() => readCount === 1, 'the first read');
  h.files.set(MAIN, SINGLE_LOOP);
  await h.controller.analyze(MAIN);
  const newer = h.last('complexityResult');
  assert.equal(newer.ok, true);
  assert.equal(newer.time, 'O(N)');

  rejectFirstRead(missingFileError(MAIN));
  await first;
  assert.deepEqual(h.ofType('complexityResult'), [newer]);
  assert.equal(h.controller.analysis.filePath, MAIN);
});

test('getRunSettings throwing posts a failure without an unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    let broken = false;
    const h = createHarness({
      getRunSettings: (defaultSettings) => {
        if (broken) {
          throw new Error('launcher probe failed');
        }
        return defaultSettings();
      }
    });
    await h.controller.analyze(MAIN);
    assert.equal(h.last('complexityResult').ok, true);

    broken = true;
    await assert.doesNotReject(h.controller.analyze(MAIN));
    let result = h.last('complexityResult');
    assert.equal(result.ok, false);
    assert.match(result.message, /計算量を解析できませんでした/);
    assert.match(result.message, /launcher probe failed/);
    assert.equal(h.controller.analysis, null);

    // Fire-and-forget callers must not leak a rejection either.
    const count = h.ofType('complexityResult').length;
    h.controller.handleTargetChanged(MAIN);
    await waitFor(() => h.ofType('complexityResult').length === count + 1, 'the failure from handleTargetChanged');
    result = h.last('complexityResult');
    assert.equal(result.ok, false);
    assert.match(result.message, /計算量を解析できませんでした/);
    await settle();
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

// ---------- complexityBindingChanged ----------

test('complexityBindingChanged with a value gives an unbound symbol a limit and a verdict', async () => {
  const h = createHarness();
  await h.send({ type: 'complexityBindingChanged', symbol: 'n', value: '2×10^3' });
  assert.equal(h.messages.length, 0, 'nothing to bind before an analysis');

  await h.controller.analyze(MAIN);
  assert.equal(h.last('complexityResult').verdict, null);

  assert.equal(await h.send({ type: 'complexityBindingChanged', symbol: 'n', value: '2×10^3' }), true);
  const result = h.last('complexityResult');
  assert.deepEqual(result.unbound, []);
  assert.equal(result.bindings.length, 1);
  // The display name follows formatComplexity (n → N), like the time O(N²).
  assert.deepEqual(result.bindings, [
    { symbol: 'n', display: 'N', source: 'manual', formatVar: '', value: 2000, valueText: '2×10^3' }
  ]);
  assert.equal(result.time, 'O(N²)');
  assert.equal(result.verdictNote, '');
  assert.deepEqual(result.verdict, { text: 'N = 2×10^3 → 4×10^6 回', label: '余裕', verdict: 'safe' });
  assert.equal(h.astRuns().length, 1, 'changing a binding does not run Python again');
});

test('complexityBindingChanged can pick another format variable, clear the choice, and rejects unreadable limits', async () => {
  const format = {
    rows: [intsRow([{ name: 'N', min: '1', max: '2×10^5' }, { name: 'M', min: '1', max: '10' }])]
  };
  const h = createHarness({ format });
  await h.controller.analyze(MAIN);
  let result = h.last('complexityResult');
  assert.deepEqual(result.formatVars, ['N', 'M']);
  assert.equal(result.bindings[0].source, 'name');
  assert.equal(result.verdict.label, 'TLE の恐れ');

  await h.send({ type: 'complexityBindingChanged', symbol: 'n', formatVar: 'M' });
  result = h.last('complexityResult');
  assert.deepEqual(result.bindings, [
    { symbol: 'n', display: 'M', source: 'manual', formatVar: 'M', value: 10, valueText: '10' }
  ]);
  assert.equal(result.time, 'O(M²)');
  assert.deepEqual(result.verdict, { text: 'M = 10 → 100 回', label: '余裕', verdict: 'safe' });

  await h.send({ type: 'complexityBindingChanged', symbol: 'n', value: '2×10^3' });
  result = h.last('complexityResult');
  assert.deepEqual(result.bindings, [
    { symbol: 'n', display: 'N', source: 'manual', formatVar: '', value: 2000, valueText: '2×10^3' }
  ]);
  assert.equal(result.time, 'O(N²)');
  assert.deepEqual(result.verdict, { text: 'N = 2×10^3 → 4×10^6 回', label: '余裕', verdict: 'safe' });

  await h.send({ type: 'complexityBindingChanged', symbol: 'n', clear: true });
  result = h.last('complexityResult');
  assert.deepEqual(result.bindings, [
    { symbol: 'n', display: 'N', source: 'name', formatVar: 'N', value: 200000, valueText: '2×10^5' }
  ]);
  assert.equal(result.verdict.label, 'TLE の恐れ');

  const resultCount = h.ofType('complexityResult').length;
  for (const value of ['abc', '-5', '1.5']) {
    await h.send({ type: 'complexityBindingChanged', symbol: 'n', value });
    assert.deepEqual(h.last('complexityStatus'), {
      type: 'complexityStatus',
      message: `「${value}」は上限として読めません（例: 2×10^5）。`,
      tone: 'error'
    }, value);
  }
  assert.equal(h.ofType('complexityResult').length, resultCount);
  await h.controller.handleFormatChanged();
  assert.equal(h.last('complexityResult').bindings[0].source, 'name', 'a rejected limit is not stored');
});

// ---------- complexityState ----------

test('complexityState says whether measuring is possible', () => {
  const cases = [
    { name: 'no target', target: null, format: MEASURE_FORMAT, canMeasure: false, reason: /^Python ファイルを開いてください。$/ },
    { name: 'no rows', target: MAIN, format: NO_ROWS, canMeasure: false, reason: /入力形式がないため実測できません/ },
    { name: 'invalid format', target: MAIN, format: INVALID_FORMAT, canMeasure: false, reason: /入力形式に誤りがあるため/ },
    { name: 'no size variable', target: MAIN, format: formatN('2×10^5'), canMeasure: false, reason: /個数や長さ/ },
    { name: 'valid format', target: MAIN, format: MEASURE_FORMAT, canMeasure: true, reason: /^$/ }
  ];
  for (const item of cases) {
    const h = createHarness({ target: item.target, format: item.format });
    h.controller.handleFormatChanged();
    assert.deepEqual(h.messages.map((message) => message.type), ['complexityState'], item.name);
    const state = h.last('complexityState');
    assert.equal(state.canMeasure, item.canMeasure, item.name);
    assert.equal(typeof state.measureReason, 'string', item.name);
    if (item.reason) {
      assert.match(state.measureReason, item.reason, item.name);
    }
  }
});

// ---------- saves and verify tab events ----------

test('handleDocumentSaved re-analyzes only the target Python file after a short delay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = createHarness({ files: { [MAIN]: DOUBLE_LOOP, [OTHER]: SINGLE_LOOP } });
  const saved = (fileName, extra = {}) => h.controller.handleDocumentSaved({
    fileName,
    languageId: 'python',
    isUntitled: false,
    ...extra
  });

  saved(OTHER);
  saved(MAIN, { isUntitled: true });
  saved(path.join(DIR, 'a.piyoyo.json'), { languageId: 'json' });
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(h.runs.length, 0);

  saved(MAIN);
  saved(MAIN);
  t.mock.timers.tick(299);
  await settle();
  assert.equal(h.runs.length, 0, 'waits for the delay');
  t.mock.timers.tick(1);
  await waitFor(() => h.ofType('complexityResult').length === 1, 'the analysis after saving');
  assert.equal(h.astRuns().length, 1, 'two quick saves give one analysis');
  assert.equal(h.astRuns()[0].input, DOUBLE_LOOP);

  // A .py file is a Python document even when VS Code does not know the language.
  saved(MAIN, { languageId: 'plaintext' });
  t.mock.timers.tick(300);
  await waitFor(() => h.ofType('complexityResult').length === 2, 'the analysis of a .py file');
  h.controller.dispose();

  assert.equal(isPythonDocument({ fileName: MAIN, languageId: 'python', isUntitled: false }), true);
  assert.equal(isPythonDocument({ fileName: 'Untitled-1', languageId: 'python', isUntitled: true }), false);
  assert.equal(isPythonDocument({ fileName: path.join(DIR, 'notes.txt'), languageId: 'plaintext', isUntitled: false }), false);
  assert.equal(isPythonDocument(null), false);
});

test('a save scheduled before dispose never analyzes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = createHarness();
  h.controller.handleDocumentSaved({ fileName: MAIN, languageId: 'python', isUntitled: false });
  h.controller.dispose();
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(h.runs.length, 0);
});

test('handleTargetChanged analyzes a new target and only republishes the same one', async () => {
  const h = createHarness({ files: { [MAIN]: DOUBLE_LOOP, [OTHER]: SINGLE_LOOP } });
  h.controller.handleTargetChanged(MAIN);
  await waitFor(() => h.ofType('complexityResult').length === 1, 'the first analysis');
  assert.equal(h.astRuns().length, 1);
  assert.equal(h.last('complexityResult').fileName, 'a.py');

  h.controller.handleTargetChanged(MAIN);
  assert.equal(h.ofType('complexityResult').length, 2);
  assert.equal(h.astRuns().length, 1);

  h.state.target = OTHER;
  h.controller.handleTargetChanged(OTHER);
  await waitFor(() => h.ofType('complexityResult').length === 3, 'the analysis of the new target');
  assert.equal(h.astRuns().length, 2);
  assert.equal(h.astRuns()[1].input, SINGLE_LOOP);
  assert.equal(h.last('complexityResult').fileName, 'b.py');
  assert.equal(h.last('complexityResult').time, 'O(N)');
});

test('handleFormatChanged republishes the estimate with the new format', async () => {
  const h = createHarness();
  await h.controller.analyze(MAIN);
  assert.equal(h.last('complexityResult').verdict, null);

  h.state.format = formatN('2×10^5');
  h.messages.length = 0;
  h.controller.handleFormatChanged();
  assert.deepEqual(h.messages.map((message) => message.type), ['complexityState', 'complexityResult']);
  const result = h.last('complexityResult');
  assert.equal(result.verdict.label, 'TLE の恐れ');
  assert.equal(result.bindings[0].formatVar, 'N');
  assert.equal(h.astRuns().length, 1);

  // A format that belongs to another target does not apply to this analysis.
  h.state.target = OTHER;
  h.controller.handleFormatChanged();
  assert.equal(h.last('complexityResult').verdict, null);
});

// ---------- measure ----------

test('measure fits the growth and replaces the default speed with the measured one', async () => {
  let saves = 0;
  const documents = [{
    fileName: MAIN,
    isDirty: true,
    getText: () => DOUBLE_LOOP,
    save: async () => {
      saves += 1;
    }
  }];
  const h = createHarness({
    pythonPath: 'python',
    format: MEASURE_FORMAT,
    vscodeApi: { workspace: { textDocuments: documents } },
    run: timedRun((n) => n * n * 4e-4)
  });
  await h.controller.analyze(MAIN);
  const before = h.last('complexityResult');
  assert.equal(before.verdict.label, '余裕');
  assert.match(before.speedText, /（Python・目安の値）/);
  assert.equal(h.last('complexityState').canMeasure, true);

  h.messages.length = 0;
  assert.equal(await h.send({ type: 'complexityMeasure' }), true);
  assert.equal(saves, 1);

  const baselineRuns = h.runs.filter((item) => item.filePath === BASELINE_PATH);
  assert.equal(baselineRuns.length, 3);
  assert.ok(baselineRuns.every((item) => item.input === ''));
  const mainRuns = h.mainRuns();
  assert.equal(mainRuns.length, 12);
  for (const item of [...baselineRuns, ...mainRuns]) {
    assert.equal(item.cwd, DIR);
    assert.equal(item.pythonPath, 'python');
    assert.equal(item.timeoutMs, 2000);
    assert.equal(item.inspectRuntime, false);
  }
  assert.deepEqual([...new Set(mainRuns.map((item) => firstNumber(item.input)))], [31, 125, 500, 2000]);

  const progress = h.ofType('complexityProgress').map((message) => message.text);
  assert.equal(progress.length, 4);
  assert.equal(progress[0], '1 / 4 段目を測っています（最大の 1/64 のサイズ）...');
  assert.equal(progress[3], '4 / 4 段目を測っています（最大サイズ）...');

  const result = h.last('complexityMeasureResult');
  assert.equal(result.ok, true);
  assert.equal(result.model, 'O(N²)');
  assert.equal(result.mismatch, false);
  assert.deepEqual(result.points.map((point) => [point.n, point.timedOut]), [[31, false], [125, false], [500, false], [2000, false]]);
  assert.match(result.text, /^N=31: \d+ ms \/ N=125: \d+ ms \/ N=500: 100 ms \/ N=2000: 1600 ms → O\(N²\) に近い$/);

  const after = h.last('complexityResult');
  assert.match(after.speedText, /（Python・この PC で実測した値）/);
  assert.equal(after.verdict.label, '厳しい');
});

test('measure reports a mismatch only for a confident fit that differs from the static estimate', async () => {
  const cases = [
    { name: 'linear and confident', programMs: (n) => n * 0.5, model: 'O(N)', mismatch: true },
    { name: 'flat and unsure', programMs: () => 0, model: 'O(1)', mismatch: false },
    { name: 'quadratic like the estimate', programMs: (n) => n * n * 4e-4, model: 'O(N²)', mismatch: false }
  ];
  for (const item of cases) {
    const h = createHarness({ format: MEASURE_FORMAT, run: timedRun(item.programMs) });
    await h.controller.analyze(MAIN);
    await h.send({ type: 'complexityMeasure' });
    const result = h.last('complexityMeasureResult');
    assert.equal(result.ok, true, item.name);
    assert.equal(result.model, item.model, item.name);
    assert.equal(result.mismatch, item.mismatch, item.name);
    if (item.mismatch) {
      assert.ok(result.text.includes(compareModels(item.model, 'O(N²)').message), item.name);
    } else {
      assert.doesNotMatch(result.text, /静的な推定/, item.name);
    }
  }

  const unsure = createHarness({ format: MEASURE_FORMAT, run: timedRun(() => 0) });
  await unsure.controller.analyze(MAIN);
  await unsure.send({ type: 'complexityMeasure' });
  assert.match(unsure.last('complexityMeasureResult').text, /はっきりしません/);
  assert.match(unsure.last('complexityResult').speedText, /目安の値/, 'too short runs do not change the speed');
});

test('measure explains a timeout and does not try larger sizes', async () => {
  const atLargest = createHarness({
    format: MEASURE_FORMAT,
    run: timedRun((n) => (n >= 2000 ? timeoutRun() : n * n * 1e-3))
  });
  await atLargest.controller.analyze(MAIN);
  await atLargest.send({ type: 'complexityMeasure' });
  let result = atLargest.last('complexityMeasureResult');
  assert.equal(result.ok, true);
  assert.deepEqual(result.points.map((point) => [point.n, point.timedOut]), [[31, false], [125, false], [500, false], [2000, true]]);
  assert.match(result.text, /N=2000: 時間切れ/);
  assert.match(result.text, /最大サイズで時間切れになりました/);
  assert.equal(atLargest.mainRuns().filter((item) => firstNumber(item.input) === 2000).length, 1);

  const atQuarter = createHarness({
    format: MEASURE_FORMAT,
    run: timedRun((n) => (n >= 500 ? timeoutRun() : n * n * 1e-3))
  });
  await atQuarter.send({ type: 'complexityMeasure' });
  result = atQuarter.last('complexityMeasureResult');
  assert.equal(result.ok, true);
  assert.deepEqual(result.points.map((point) => [point.n, point.timedOut]), [[31, false], [125, false], [500, true]]);
  assert.match(result.text, /最大の 1\/4 のサイズで時間切れになったため、それより大きいサイズは測っていません/);
  assert.equal(atQuarter.mainRuns().some((item) => firstNumber(item.input) === 2000), false);
});

test('measure can be cancelled and ignores a second request while it runs', async () => {
  const started = deferred();
  const release = deferred();
  let mainCount = 0;
  const h = createHarness({
    format: MEASURE_FORMAT,
    run: async ({ filePath }) => {
      if (filePath === BASELINE_PATH) {
        return okRun('', 50);
      }
      mainCount += 1;
      if (mainCount === 1) {
        started.resolve();
        await release.promise;
      }
      return okRun('', 60);
    }
  });

  const measuring = h.send({ type: 'complexityMeasure' });
  await started.promise;
  await h.send({ type: 'complexityMeasure' });
  assert.equal(h.ofType('complexityMeasureResult').length, 0);
  assert.equal(await h.send({ type: 'complexityCancel' }), true);
  release.resolve();
  await measuring;

  assert.equal(mainCount, 1);
  assert.deepEqual(h.ofType('complexityMeasureResult'), [
    { type: 'complexityMeasureResult', ok: false, message: '測るのを中止しました。' }
  ]);
  assert.equal(h.controller.busy, false);

  await h.send({ type: 'complexityMeasure' });
  assert.equal(h.last('complexityMeasureResult').ok, true, 'a new measurement starts after a cancel');
});

test('measure without a usable input format posts the reason and runs nothing', async () => {
  const cases = [
    { name: 'no rows', format: NO_ROWS, pattern: /入力形式がないため実測できません/ },
    { name: 'invalid format', format: INVALID_FORMAT, pattern: /入力形式に誤りがあるため/ },
    { name: 'no size variable', format: formatN('2×10^5'), pattern: /個数や長さ/ }
  ];
  for (const item of cases) {
    const h = createHarness({ format: item.format });
    await h.send({ type: 'complexityMeasure' });
    assert.deepEqual(h.messages.map((message) => message.type), ['complexityMeasureResult'], item.name);
    const result = h.last('complexityMeasureResult');
    assert.equal(result.ok, false, item.name);
    assert.match(result.message, item.pattern, item.name);
    assert.equal(h.runs.length, 0, item.name);
  }
});

// ---------- editor ----------

test('complexityRevealLine opens the analyzed file and puts the cursor on the line', async () => {
  const fake = createFakeVscode({ sources: { [MAIN]: FUNCTION_CODE } });
  const h = createHarness({ vscodeApi: fake.vscodeApi, files: { [MAIN]: FUNCTION_CODE } });
  await h.send({ type: 'complexityRevealLine', line: 3 });
  assert.equal(fake.opened.length, 0, 'nothing to reveal before an analysis');

  await h.controller.analyze(MAIN);
  assert.equal(await h.send({ type: 'complexityRevealLine', line: 3 }), true);
  assert.deepEqual(fake.opened, [MAIN]);
  assert.equal(fake.shown.length, 1);
  assert.deepEqual(fake.shown[0].options, { preview: false });
  const { editor } = fake.shown[0];
  assert.ok(editor.selection instanceof FakeSelection);
  assert.deepEqual(editor.selection.anchor, { line: 2, character: 0 });
  assert.deepEqual(editor.selection.active, { line: 2, character: 0 });
  assert.equal(editor.revealed.length, 1);
  assert.ok(editor.revealed[0].range instanceof FakeRange);
  assert.deepEqual(editor.revealed[0].range.start, { line: 2, character: 0 });
  assert.equal(editor.revealed[0].revealType, fake.vscodeApi.TextEditorRevealType.InCenterIfOutsideViewport);

  await h.send({ type: 'complexityRevealLine', line: 999 });
  const lastLine = FUNCTION_CODE.split('\n').length - 1;
  assert.deepEqual(fake.shown.at(-1).editor.selection.anchor, { line: lastLine, character: 0 });

  const shownCount = fake.shown.length;
  for (const line of [0, -1, 1.5, 'abc', null]) {
    await h.send({ type: 'complexityRevealLine', line });
  }
  assert.equal(fake.shown.length, shownCount);
});

test('refreshDecorations shows loop counts, function costs and call costs only in editors of the analyzed file', async () => {
  const mainEditor = fakeEditor(fakeDocument(MAIN, FUNCTION_CODE));
  const otherEditor = fakeEditor(fakeDocument(OTHER, DOUBLE_LOOP));
  const fake = createFakeVscode({ visible: [mainEditor, otherEditor] });
  const h = createHarness({ vscodeApi: fake.vscodeApi, files: { [MAIN]: FUNCTION_CODE }, format: formatN('2×10^5') });
  await h.controller.analyze(MAIN);

  assert.equal(fake.decorationTypes.length, 1);
  const [type] = fake.decorationTypes;
  assert.ok(type.options.after.color instanceof FakeThemeColor);
  assert.equal(type.options.after.color.id, 'editorCodeLens.foreground');

  const result = h.last('complexityResult');
  assert.equal(result.ok, true);
  assert.equal(result.lines.find((item) => item.line === 9).kind, 'call');
  const lines = FUNCTION_CODE.split('\n');
  const options = mainEditor.lastOptions();
  assert.equal(options.length, FUNCTION_CODE_HINT_COUNT);
  assert.deepEqual(hintsOf(options), [
    { line: 0, character: lines[0].length, text: 'O(N²)' },
    { line: 2, character: lines[2].length, text: '× N' },
    { line: 3, character: lines[3].length, text: '× N' },
    { line: 8, character: lines[8].length, text: 'O(N²)' }
  ]);
  for (const option of options) {
    assert.ok(option.range instanceof FakeRange);
    assert.deepEqual(option.range.start, option.range.end);
  }
  assert.ok(mainEditor.calls.every((call) => call.type === type));
  assert.deepEqual(otherEditor.lastOptions(), []);

  const laterEditor = fakeEditor(fakeDocument(MAIN, FUNCTION_CODE));
  fake.vscodeApi.window.visibleTextEditors.push(laterEditor);
  h.controller.refreshDecorations();
  assert.deepEqual(hintsOf(laterEditor.lastOptions()), hintsOf(options));
  assert.equal(fake.decorationTypes.length, 1, 'the decoration type is created once');

  h.controller.dispose();
  assert.equal(type.disposed, true);
});

test('refreshDecorations clears the hints when the setting is off or the code stops parsing', async () => {
  const mainEditor = fakeEditor(fakeDocument(MAIN, FUNCTION_CODE));
  const fake = createFakeVscode({ visible: [mainEditor] });
  const h = createHarness({ vscodeApi: fake.vscodeApi, files: { [MAIN]: FUNCTION_CODE } });
  await h.controller.analyze(MAIN);
  assert.equal(mainEditor.lastOptions().length, FUNCTION_CODE_HINT_COUNT);

  fake.config.showInlineHints = false;
  h.controller.refreshDecorations();
  assert.deepEqual(mainEditor.lastOptions(), []);

  fake.config.showInlineHints = true;
  h.controller.refreshDecorations();
  assert.equal(mainEditor.lastOptions().length, FUNCTION_CODE_HINT_COUNT);

  h.files.set(MAIN, SYNTAX_ERROR);
  await h.controller.analyze(MAIN);
  assert.equal(h.last('complexityResult').ok, false);
  assert.deepEqual(mainEditor.lastOptions(), []);
  h.controller.refreshDecorations();
  assert.deepEqual(mainEditor.lastOptions(), []);
});

test('refreshDecorations joins a loop and a call on one line and skips recursion entries', async () => {
  const mainEditor = fakeEditor(fakeDocument(MAIN, SORTED_LOOP_AND_RECURSION));
  const fake = createFakeVscode({ visible: [mainEditor] });
  // A binds |a| to N, so sorted(a) reads O(N log N).
  const format = { rows: [intsRow([{ name: 'N', min: '1', max: '2×10^5' }]), intListRow('A', 'N')] };
  const h = createHarness({ vscodeApi: fake.vscodeApi, files: { [MAIN]: SORTED_LOOP_AND_RECURSION }, format });
  await h.controller.analyze(MAIN);

  const result = h.last('complexityResult');
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines.map(({ line, kind, label }) => ({ line, kind, label })), [
    { line: 1, kind: 'function', label: 'O(N)' },
    { line: 4, kind: 'recursion', label: 'O(N)' },
    { line: 8, kind: 'loop', label: '× N' },
    { line: 8, kind: 'call', label: 'O(N log N)' },
    { line: 10, kind: 'call', label: 'O(N)' }
  ]);

  const lines = SORTED_LOOP_AND_RECURSION.split('\n');
  assert.deepEqual(hintsOf(mainEditor.lastOptions()), [
    { line: 0, character: lines[0].length, text: 'O(N)' },
    { line: 7, character: lines[7].length, text: '× N  O(N log N)' },
    { line: 9, character: lines[9].length, text: 'O(N)' }
  ]);
});

test('refreshDecorations marks the loops and the expensive list operations of a real program', async () => {
  const mainEditor = fakeEditor(fakeDocument(MAIN, WORD_MATCH));
  const fake = createFakeVscode({ visible: [mainEditor] });
  const h = createHarness({ vscodeApi: fake.vscodeApi, files: { [MAIN]: WORD_MATCH } });
  await h.controller.analyze(MAIN);

  const result = h.last('complexityResult');
  assert.equal(result.ok, true);
  // The input comprehensions on lines 2 and 3 are input reading, so the analyzer reports nothing for them.
  assert.equal(result.lines.some((item) => item.line === 2 || item.line === 3), false);

  const textByLine = new Map(hintsOf(mainEditor.lastOptions()).map((hint) => [hint.line + 1, hint.text]));
  assert.deepEqual([...textByLine], [
    [5, '× M'],
    [6, 'O(N)'],
    [7, 'O(N)'],
    [10, '× N'],
    [11, '× |S[]|'],
    [16, 'O(N)']
  ]);
  for (const line of [1, 2, 3, 4, 8, 9, 12, 13, 14]) {
    assert.equal(textByLine.has(line), false, `line ${line}`);
  }
});
