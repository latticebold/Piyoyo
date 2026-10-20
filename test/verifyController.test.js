const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { VerifyController, parseSeed } = require('../src/verify/verifyController');
const { deriveCaseSeed } = require('../src/verify/stressRunner');
const { createEmptyVerifyData, parseVerifyFile, serializeVerifyFile } = require('../src/verify/verifyFile');

// path.resolve keeps the drive letter on Windows, the same way the controller resolves the naive path.
const DIR = path.resolve(path.sep, 'contest');
const MAIN = path.join(DIR, 'a.py');
const NAIVE = path.join(DIR, 'a_naive.py');
const VERIFY = path.join(DIR, 'a.piyoyo.json');
const NOW = '2026-10-20T00:00:00.000Z';
const TIMEOUT_MS = 2000;
const NAIVE_TIMEOUT_MS = 10000;
const TASK_URL = 'https://atcoder.jp/contests/abc001/tasks/abc001_a';
const JA_TASK_URL = `${TASK_URL}?lang=ja`;

function intsRow(vars, extra = {}) {
  return { kind: 'ints', vars, needsReview: false, reviewReason: '', ...extra };
}

const VALID_FORMAT = { rows: [intsRow([{ name: 'N', min: '1', max: '10' }])] };
const INVALID_FORMAT = { rows: [intsRow([{ name: 'N', min: '1', max: 'X' }])] };

function okRun(stdout = 'ok\n') {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    outputLimitExceeded: false,
    errorMessage: '',
    elapsedMs: 1
  };
}

function errorRun() {
  return { ...okRun(''), exitCode: 1, stderr: 'Traceback (most recent call last):\nZeroDivisionError: division by zero\n' };
}

function timeoutRun() {
  return { ...okRun(''), exitCode: null, timedOut: true, errorMessage: '2000 ms でタイムアウトしました。' };
}

function counterexample(overrides = {}) {
  return {
    id: 'ce-1',
    kind: 'mismatch',
    input: '1\n',
    expected: '1\n',
    seed: 1,
    createdAt: '2026-10-19T12:00:00.000Z',
    ...overrides
  };
}

function verifyFileText(overrides = {}) {
  return serializeVerifyFile({ ...createEmptyVerifyData(), ...overrides });
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

function createFakeFs(initial) {
  const files = new Map(Object.entries(initial));
  const writes = [];
  const reads = [];
  const gates = new Map();
  return {
    files,
    writes,
    reads,
    // Holds readFile(filePath) until release() is called.
    gate(filePath) {
      const entered = deferred();
      const release = deferred();
      gates.set(filePath, { entered, release });
      return { entered: entered.promise, release: release.resolve };
    },
    async readFile(filePath) {
      reads.push(filePath);
      const gate = gates.get(filePath);
      if (gate) {
        gate.entered.resolve();
        await gate.release.promise;
      }
      if (!files.has(filePath)) {
        throw missingFileError(filePath);
      }
      return files.get(filePath);
    },
    async writeFile(filePath, content) {
      writes.push({ filePath, content });
      files.set(filePath, content);
    },
    async access(filePath) {
      if (!files.has(filePath)) {
        throw missingFileError(filePath);
      }
    }
  };
}

function createHarness({ files = {}, run = () => okRun(), fetchImpl = null } = {}) {
  const fs = createFakeFs(files);
  const messages = [];
  const runs = [];
  const fetches = [];
  const controller = new VerifyController({
    vscodeApi: { workspace: { textDocuments: [] } },
    postMessage: (message) => messages.push(message),
    getRunSettings: async () => ({ pythonPath: 'python', timeoutMs: TIMEOUT_MS, workspaceFolders: [] }),
    runPythonFile: async (options) => {
      runs.push(options);
      return run(options);
    },
    fs,
    fetchImpl: async (url, options) => {
      fetches.push({ url, options });
      if (!fetchImpl) {
        throw new Error('fetch must not be called');
      }
      return fetchImpl(url, options);
    },
    random: () => 0.25,
    now: () => new Date(NOW)
  });

  const ofType = (type) => messages.filter((message) => message.type === type);
  return {
    controller,
    fs,
    messages,
    runs,
    fetches,
    ofType,
    send: (message) => controller.handleMessage(message),
    last(type) {
      const found = ofType(type);
      assert.ok(found.length > 0, `no ${type} message was posted`);
      return found[found.length - 1];
    },
    saved() {
      assert.ok(fs.files.has(VERIFY), 'a.piyoyo.json was not written');
      const parsed = parseVerifyFile(fs.files.get(VERIFY));
      assert.equal(parsed.ok, true);
      return parsed.data;
    },
    async load(filePath = MAIN) {
      await controller.setTargetFile(filePath);
      messages.length = 0;
    }
  };
}

// ---------- setTargetFile ----------

test('setTargetFile loads <name>.piyoyo.json and posts verifyLoaded', async () => {
  const saved = counterexample({ id: 'ce-7', input: '3\n', expected: '9\n' });
  const h = createHarness({
    files: {
      [VERIFY]: verifyFileText({ format: VALID_FORMAT, compareMode: 'exact', iterations: 30, counterexamples: [saved] }),
      [NAIVE]: 'print(0)\n'
    }
  });
  await h.controller.setTargetFile(MAIN);

  assert.ok(h.fs.reads.includes(VERIFY));
  assert.equal(h.controller.target, MAIN);
  const loaded = h.ofType('verifyLoaded');
  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded[0].target, { mainFile: 'a.py', naiveFile: 'a_naive.py', naiveExists: true });
  assert.deepEqual(loaded[0].data, {
    format: VALID_FORMAT,
    compareMode: 'exact',
    iterations: 30,
    counterexamples: [saved]
  });
  assert.deepEqual(loaded[0].warnings, []);
  assert.equal(h.fs.writes.length, 0);
});

test('setTargetFile starts with empty data and naiveExists false when nothing is saved', async () => {
  const h = createHarness();
  await h.controller.setTargetFile(MAIN);
  const loaded = h.last('verifyLoaded');
  assert.deepEqual(loaded.target, { mainFile: 'a.py', naiveFile: 'a_naive.py', naiveExists: false });
  assert.deepEqual(loaded.data, { format: { rows: [] }, compareMode: 'tokens', iterations: 100, counterexamples: [] });
  assert.deepEqual(loaded.warnings, []);
  assert.equal(h.fs.writes.length, 0);
});

test('setTargetFile passes warnings for a broken save file', async () => {
  const h = createHarness({ files: { [VERIFY]: '{ broken' } });
  await h.controller.setTargetFile(MAIN);
  const loaded = h.last('verifyLoaded');
  assert.equal(loaded.warnings.length, 1);
  assert.match(loaded.warnings[0], /JSON/);
  assert.match(loaded.warnings[0], /このファイルは上書きしません/);
  assert.deepEqual(loaded.data.format, { rows: [] });
});

test('a save file that could not be read is never overwritten', async () => {
  const cases = [
    {
      name: 'newer version',
      text: `${JSON.stringify({ version: 2, format: VALID_FORMAT, counterexamples: [counterexample()] }, null, 2)}\n`,
      warning: /新しい Piyoyo/
    },
    { name: 'broken JSON', text: '{ "version": 1, "format": ', warning: /JSON/ }
  ];
  for (const { name, text, warning } of cases) {
    const h = createHarness({ files: { [VERIFY]: text }, run: () => errorRun() });
    await h.controller.setTargetFile(MAIN);
    const loaded = h.last('verifyLoaded');
    assert.equal(loaded.warnings.length, 1, name);
    assert.match(loaded.warnings[0], warning, name);
    assert.match(loaded.warnings[0], /このファイルは上書きしません/, name);
    h.messages.length = 0;

    await h.send({ type: 'verifySettingsChanged', compareMode: 'exact', iterations: 50 });
    await h.controller.flushSave();
    assert.equal(h.fs.writes.length, 0, `${name}: settings`);
    assert.equal(h.last('verifySaved').failed, true, `${name}: settings`);
    assert.match(h.last('verifySaved').message, /上書きしない/, `${name}: settings`);

    await h.send({ type: 'verifyDeleteCounterexample', id: 'ce-1' });
    assert.equal(h.fs.writes.length, 0, `${name}: forced save`);
    assert.equal(h.fs.files.get(VERIFY), text, `${name}: forced save`);

    await h.send({ type: 'verifyFormatChanged', format: VALID_FORMAT });
    await h.send({ type: 'verifyStart', iterations: 5, compareMode: 'tokens', seed: '1' });
    assert.equal(h.last('verifyStressResult').status, 'mainError', `${name}: stress`);
    assert.equal(h.controller.data.counterexamples.length, 1, `${name}: stress`);

    assert.equal(h.fs.writes.length, 0, name);
    assert.equal(h.fs.files.get(VERIFY), text, name);
    const savedMessages = h.ofType('verifySaved');
    assert.ok(savedMessages.length >= 3, name);
    for (const message of savedMessages) {
      assert.equal(message.failed, true, name);
      assert.match(message.message, /上書きしない/, name);
    }
  }
});

test('switching from an unreadable save file to a normal one unlocks saving', async () => {
  const otherMain = path.join(DIR, 'b.py');
  const otherVerify = path.join(DIR, 'b.piyoyo.json');
  const newMain = path.join(DIR, 'c.py');
  const newVerify = path.join(DIR, 'c.piyoyo.json');
  const broken = '{ broken';
  const h = createHarness({
    files: { [VERIFY]: broken, [otherVerify]: verifyFileText({ format: VALID_FORMAT }) }
  });
  await h.load();
  // The pending save is flushed for the locked file during the switch and must not write.
  await h.send({ type: 'verifySettingsChanged', iterations: 50 });
  await h.controller.setTargetFile(otherMain);
  assert.equal(h.fs.writes.length, 0);
  assert.equal(h.controller.target, otherMain);
  assert.deepEqual(h.last('verifyLoaded').warnings, []);

  await h.send({ type: 'verifySettingsChanged', iterations: 77 });
  await h.controller.flushSave();
  assert.equal(h.fs.writes.length, 1);
  assert.equal(h.fs.writes[0].filePath, otherVerify);
  assert.equal(parseVerifyFile(h.fs.files.get(otherVerify)).data.iterations, 77);
  const saved = h.last('verifySaved');
  assert.equal(saved.failed, undefined);
  assert.equal(saved.message, 'b.piyoyo.json に保存しました');

  await h.controller.setTargetFile(newMain);
  await h.send({ type: 'verifyFormatChanged', format: VALID_FORMAT });
  await h.controller.flushSave();
  assert.equal(h.fs.writes.length, 2);
  assert.equal(h.fs.writes[1].filePath, newVerify);
  assert.equal(h.fs.files.get(VERIFY), broken);
});

test('setTargetFile keeps <name>.py as the target when <name>_naive.py is opened', async () => {
  const h = createHarness({
    files: {
      [MAIN]: 'print(1)\n',
      [NAIVE]: 'print(1)\n',
      [VERIFY]: verifyFileText({ format: VALID_FORMAT })
    }
  });
  await h.controller.setTargetFile(NAIVE);
  assert.equal(h.controller.target, MAIN);
  assert.ok(h.fs.reads.includes(VERIFY));
  assert.equal(h.fs.reads.includes(path.join(DIR, 'a_naive.piyoyo.json')), false);
  const loaded = h.last('verifyLoaded');
  assert.deepEqual(loaded.target, { mainFile: 'a.py', naiveFile: 'a_naive.py', naiveExists: true });
  assert.deepEqual(loaded.data.format, VALID_FORMAT);
});

test('setTargetFile uses <name>_naive.py itself when <name>.py does not exist', async () => {
  const h = createHarness({ files: { [NAIVE]: 'print(1)\n' } });
  await h.controller.setTargetFile(NAIVE);
  assert.equal(h.controller.target, NAIVE);
  assert.ok(h.fs.reads.includes(path.join(DIR, 'a_naive.piyoyo.json')));
  assert.equal(h.last('verifyLoaded').target.mainFile, 'a_naive.py');
});

test('overlapping setTargetFile calls end with the data of the last requested file', async () => {
  const otherMain = path.join(DIR, 'b.py');
  const otherVerify = path.join(DIR, 'b.piyoyo.json');
  const otherFormat = { rows: [intsRow([{ name: 'K', min: '2', max: '5' }])] };
  for (const laterFinishesFirst of [true, false]) {
    const h = createHarness({
      files: {
        [VERIFY]: verifyFileText({ format: VALID_FORMAT, iterations: 11 }),
        [otherVerify]: verifyFileText({ format: otherFormat, iterations: 22 })
      }
    });
    const gateA = h.fs.gate(VERIFY);
    const gateB = h.fs.gate(otherVerify);
    const first = h.controller.setTargetFile(MAIN);
    await gateA.entered;
    const second = h.controller.setTargetFile(otherMain);
    await gateB.entered;
    if (laterFinishesFirst) {
      gateB.release();
      await second;
      gateA.release();
      await first;
    } else {
      gateA.release();
      await first;
      gateB.release();
      await second;
    }

    const where = `later finishes first: ${laterFinishesFirst}`;
    assert.equal(h.controller.target, otherMain, where);
    assert.equal(h.controller.data.iterations, 22, where);
    assert.deepEqual(h.controller.data.format, otherFormat, where);
    const loaded = h.ofType('verifyLoaded');
    assert.equal(loaded.length, 1, where);
    assert.equal(loaded[0].target.mainFile, 'b.py', where);
    assert.deepEqual(loaded[0].data.format, otherFormat, where);
    assert.equal(loaded[0].data.iterations, 22, where);
  }
});

test('setTargetFile ignores an empty path and the file that is already loaded', async () => {
  const h = createHarness({ files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) } });
  await h.load();
  const readsBefore = h.fs.reads.length;
  await h.controller.setTargetFile('');
  await h.controller.setTargetFile(MAIN);
  assert.equal(h.fs.reads.length, readsBefore);
  assert.equal(h.ofType('verifyLoaded').length, 0);
});

// ---------- verifyFormatChanged / verifySettingsChanged ----------

test('verifyFormatChanged reports no errors for an empty format', async () => {
  const h = createHarness();
  await h.load();
  assert.equal(await h.send({ type: 'verifyFormatChanged', format: { rows: [] } }), true);
  assert.deepEqual(h.last('verifyFormatStatus'), { type: 'verifyFormatStatus', errors: [], example: '', exampleError: '' });
  await h.controller.flushSave();
  assert.equal(h.fs.writes.length, 0);
});

test('verifyFormatChanged posts the errors of an invalid row', async () => {
  const h = createHarness();
  await h.load();
  await h.send({ type: 'verifyFormatChanged', format: INVALID_FORMAT });
  const status = h.last('verifyFormatStatus');
  assert.ok(status.errors.length > 0);
  assert.equal(status.errors[0].rowIndex, 0);
  assert.equal(status.errors[0].path, 'vars.0.max');
  assert.equal(typeof status.errors[0].message, 'string');
  assert.equal(status.example, '');
  assert.match(status.exampleError, /誤り/);
  await h.controller.flushSave();
});

test('verifyFormatChanged posts an example for a valid format', async () => {
  const h = createHarness();
  await h.load();
  await h.send({ type: 'verifyFormatChanged', format: VALID_FORMAT });
  const status = h.last('verifyFormatStatus');
  assert.deepEqual(status.errors, []);
  assert.equal(status.exampleError, '');
  assert.match(status.example, /^\d+\n$/);
  const value = Number(status.example.trim());
  assert.ok(value >= 1 && value <= 10);
  await h.controller.flushSave();
});

test('verifyFormatChanged does nothing without a target', async () => {
  const h = createHarness();
  await h.send({ type: 'verifyFormatChanged', format: VALID_FORMAT });
  assert.equal(h.ofType('verifyFormatStatus').length, 0);
  await h.controller.flushSave();
  assert.equal(h.fs.writes.length, 0);
});

test('no save file is created when nothing meaningful exists and none existed', async () => {
  const h = createHarness();
  await h.load();
  await h.send({ type: 'verifyFormatChanged', format: VALID_FORMAT });
  await h.send({ type: 'verifyFormatChanged', format: { rows: [] } });
  await h.send({ type: 'verifySettingsChanged', compareMode: 'exact', iterations: 50 });
  await h.controller.flushSave();
  assert.equal(h.controller.data.compareMode, 'exact');
  assert.equal(h.controller.data.iterations, 50);
  assert.equal(h.fs.writes.length, 0);
  assert.equal(h.ofType('verifySaved').length, 0);
});

test('a real format change schedules one save', async () => {
  const h = createHarness();
  await h.load();
  await h.send({ type: 'verifyFormatChanged', format: VALID_FORMAT });
  assert.equal(h.fs.writes.length, 0);
  await h.controller.flushSave();
  assert.equal(h.fs.writes.length, 1);
  assert.equal(h.fs.writes[0].filePath, VERIFY);
  assert.deepEqual(h.saved().format, VALID_FORMAT);
  assert.equal(h.last('verifySaved').message, 'a.piyoyo.json に保存しました');

  await h.send({ type: 'verifyFormatChanged', format: VALID_FORMAT });
  await h.controller.flushSave();
  assert.equal(h.fs.writes.length, 1);
});

test('verifySettingsChanged saves valid settings and ignores invalid ones', async () => {
  const h = createHarness({ files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) } });
  await h.load();
  await h.send({ type: 'verifySettingsChanged', compareMode: 'float', iterations: 250 });
  await h.send({ type: 'verifySettingsChanged', compareMode: 'fuzzy', iterations: 0 });
  await h.send({ type: 'verifySettingsChanged', iterations: 10001 });
  await h.controller.flushSave();
  assert.equal(h.fs.writes.length, 1);
  const saved = h.saved();
  assert.equal(saved.compareMode, 'float');
  assert.equal(saved.iterations, 250);
  assert.deepEqual(saved.format, VALID_FORMAT);
});

// ---------- verifyStart ----------

test('parseSeed accepts 0..4294967295 and uses random for an empty text', () => {
  assert.deepEqual(parseSeed('', () => 0.25), { ok: true, seed: 1073741824 });
  assert.deepEqual(parseSeed('   ', () => 0), { ok: true, seed: 0 });
  assert.deepEqual(parseSeed(' 42 ', () => 0.5), { ok: true, seed: 42 });
  assert.deepEqual(parseSeed('4294967295', () => 0), { ok: true, seed: 4294967295 });
  for (const bad of ['4294967296', '-1', '1.5', '1e3', 'abc', '12 34']) {
    const result = parseSeed(bad, () => 0);
    assert.equal(result.ok, false, bad);
    assert.match(result.message, /シード値/, bad);
  }
});

test('verifyStart stops before running anything when it cannot start', async () => {
  const cases = [
    { name: 'no target', files: {}, load: false, seed: '', pattern: /Python ファイルを開いて/ },
    { name: 'empty format', files: {}, load: true, seed: '', pattern: /入力形式/ },
    {
      name: 'invalid format',
      files: { [VERIFY]: verifyFileText({ format: INVALID_FORMAT }) },
      load: true,
      seed: '',
      pattern: /入力形式に誤りがあります（1行目/
    },
    {
      name: 'row needs review',
      files: {
        [VERIFY]: verifyFileText({
          format: { rows: [intsRow([{ name: 'N', min: '1', max: '10' }], { needsReview: true, reviewReason: '確認して' })] }
        })
      },
      load: true,
      seed: '',
      pattern: /要確認/
    },
    { name: 'letters in seed', files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) }, load: true, seed: 'abc', pattern: /シード値/ },
    { name: 'seed too large', files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) }, load: true, seed: '4294967296', pattern: /シード値/ },
    { name: 'negative seed', files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) }, load: true, seed: '-5', pattern: /シード値/ }
  ];
  for (const item of cases) {
    const h = createHarness({ files: { ...item.files, [NAIVE]: 'print(0)\n' } });
    if (item.load) {
      await h.load();
    }
    await h.send({ type: 'verifyStart', iterations: 5, compareMode: 'tokens', seed: item.seed });
    const stopped = h.ofType('verifyStressStopped');
    assert.equal(stopped.length, 1, item.name);
    assert.match(stopped[0].message, item.pattern, item.name);
    assert.equal(h.runs.length, 0, item.name);
    assert.equal(h.ofType('verifyStressResult').length, 0, item.name);
    assert.equal(h.controller.busy, false, item.name);
  }
});

test('verifyStart without the naive file runs only main and saves the failure with expected null', async () => {
  const cases = [
    [errorRun, 'mainError', '実行時エラー'],
    [timeoutRun, 'mainTimeout', '時間切れ']
  ];
  for (const [failure, status, summary] of cases) {
    const h = createHarness({
      files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) },
      run: () => failure()
    });
    await h.load();
    await h.send({ type: 'verifyStart', iterations: 5, compareMode: 'tokens', seed: '12345' });

    assert.equal(h.runs.length, 1, status);
    assert.ok(h.runs.every((run) => run.filePath === MAIN), status);
    assert.equal(h.runs.some((run) => run.filePath === NAIVE), false, status);
    assert.equal(h.runs[0].cwd, DIR, status);
    assert.equal(h.runs[0].timeoutMs, TIMEOUT_MS, status);
    assert.equal(h.runs[0].pythonPath, 'python', status);
    const input = h.runs[0].input;
    assert.match(input, /^\d+\n$/, status);

    const progress = h.ofType('verifyProgress');
    assert.ok(progress.length >= 1, status);
    assert.equal(progress[0].iteration, 0, status);
    assert.equal(progress[0].total, 5, status);
    assert.match(progress[0].text, /愚直解なし/, status);

    const result = h.last('verifyStressResult');
    assert.equal(result.status, status);
    assert.equal(result.summary, summary, status);
    assert.equal(result.seed, 12345, status);
    assert.equal(result.iteration, 0, status);
    assert.equal(result.mode, 'compare', status);
    assert.equal(result.input, input, status);
    assert.equal(result.naiveResult, null, status);
    assert.equal(result.comparison, null, status);
    if (status === 'mainError') {
      assert.match(result.errorText, /ZeroDivisionError/);
    }

    const expectedEntry = {
      kind: status,
      input,
      expected: null,
      seed: deriveCaseSeed(12345, 0),
      createdAt: NOW
    };
    const posted = h.last('verifyCounterexamples').counterexamples;
    assert.equal(posted.length, 1, status);
    const { id, ...rest } = posted[0];
    assert.match(id, /^ce-/, status);
    assert.deepEqual(rest, expectedEntry, status);

    assert.equal(h.fs.writes.length, 1, status);
    assert.match(h.fs.files.get(VERIFY), /"expected": null/, status);
    const saved = h.saved();
    assert.equal(saved.counterexamples.length, 1, status);
    assert.equal(saved.counterexamples[0].expected, null, status);
    assert.equal(saved.counterexamples[0].kind, status, status);
    assert.equal(h.ofType('verifyStressStopped').length, 0, status);
    assert.equal(h.controller.busy, false, status);
  }
});

test('verifyStart without the naive file passes when main never fails', async () => {
  let count = 0;
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) },
    run: () => {
      count += 1;
      return okRun(`${count}\n`);
    }
  });
  await h.load();
  await h.send({ type: 'verifyStart', iterations: 12, compareMode: 'tokens', seed: '' });

  assert.equal(h.runs.length, 12);
  assert.ok(h.runs.every((run) => run.filePath === MAIN));
  const result = h.last('verifyStressResult');
  assert.equal(result.status, 'passed');
  assert.equal(result.summary, '通過');
  assert.equal(result.seed, 1073741824);
  assert.match(result.message, /12 回/);
  assert.match(result.message, /愚直解がない/);
  assert.equal(result.mainResult, null);
  assert.equal(h.ofType('verifyCounterexamples').length, 0);
  assert.equal(h.fs.writes.length, 0);
});

test('verifyStart with the naive file saves the naive output as expected on a mismatch', async () => {
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }), [NAIVE]: 'print(0)\n' },
    run: ({ filePath }) => (filePath === NAIVE ? okRun('right\n') : okRun('wrong\n'))
  });
  await h.load();
  await h.send({ type: 'verifyStart', iterations: 5, compareMode: 'tokens', seed: '7' });

  assert.deepEqual(h.runs.map((run) => run.filePath), [MAIN, NAIVE]);
  assert.equal(h.runs[0].timeoutMs, TIMEOUT_MS);
  assert.equal(h.runs[1].timeoutMs, NAIVE_TIMEOUT_MS);
  assert.equal(h.runs[1].input, h.runs[0].input);
  assert.match(h.ofType('verifyProgress')[0].text, /愚直解と比較/);

  const result = h.last('verifyStressResult');
  assert.equal(result.status, 'mismatch');
  assert.equal(result.summary, '出力が違う');
  assert.deepEqual(result.mainResult, { stdout: 'wrong\n' });
  assert.deepEqual(result.naiveResult, { stdout: 'right\n' });
  assert.equal(result.comparison.equal, false);

  const saved = h.saved();
  assert.equal(saved.counterexamples.length, 1);
  assert.equal(saved.counterexamples[0].kind, 'mismatch');
  assert.equal(saved.counterexamples[0].expected, 'right\n');
  assert.equal(saved.counterexamples[0].input, h.runs[0].input);
  assert.equal(saved.counterexamples[0].seed, deriveCaseSeed(7, 0));
  assert.equal(h.last('verifyCounterexamples').counterexamples[0].expected, 'right\n');
});

test('verifyStart with the naive file keeps the naive output for a main error', async () => {
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }), [NAIVE]: 'print(0)\n' },
    run: ({ filePath }) => (filePath === NAIVE ? okRun('5\n') : errorRun())
  });
  await h.load();
  await h.send({ type: 'verifyStart', iterations: 5, compareMode: 'tokens', seed: '3' });
  assert.equal(h.last('verifyStressResult').status, 'mainError');
  const [entry] = h.saved().counterexamples;
  assert.equal(entry.kind, 'mainError');
  assert.equal(entry.expected, '5\n');
});

test('verifyStart does not save a failure found on a max-size input', async () => {
  const format = {
    rows: [
      intsRow([{ name: 'N', min: '1', max: '100000' }]),
      { kind: 'intList', name: 'A', length: 'N', min: '1', max: '9', layout: 'row', distinct: false, order: 'none', needsReview: false, reviewReason: '' }
    ]
  };
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format }) },
    run: ({ input }) => (Number(input.split('\n')[0]) > 1000 ? timeoutRun() : okRun())
  });
  await h.load();
  await h.send({ type: 'verifyStart', iterations: 10, compareMode: 'tokens', seed: '99' });

  const result = h.last('verifyStressResult');
  assert.equal(result.status, 'mainTimeout');
  assert.equal(result.mode, 'max');
  assert.equal(result.iteration, 9);
  assert.equal(result.seed, 99);
  assert.equal(h.runs.length, 10);
  assert.equal(h.ofType('verifyCounterexamples').length, 0);
  assert.equal(h.fs.writes.length, 0);
});

// ---------- verifyRecheck ----------

test('verifyRecheck runs main on each counterexample and compares when an expected output exists', async () => {
  const saved = [
    counterexample({ id: 'ce-null', kind: 'mainError', input: '1\n', expected: null }),
    counterexample({ id: 'ce-same', input: '2\n', expected: '4\n' }),
    counterexample({ id: 'ce-diff', input: '3\n', expected: '9\n' }),
    counterexample({ id: 'ce-timeout', kind: 'mainTimeout', input: '4\n', expected: '16\n' }),
    counterexample({ id: 'ce-error', kind: 'mainError', input: '5\n', expected: null })
  ];
  const outputs = {
    '1\n': () => okRun('anything\n'),
    '2\n': () => okRun('4\n'),
    '3\n': () => okRun('8\n'),
    '4\n': () => timeoutRun(),
    '5\n': () => errorRun()
  };
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT, counterexamples: saved }), [NAIVE]: 'print(0)\n' },
    run: ({ input }) => outputs[input]()
  });
  await h.load();
  await h.send({ type: 'verifyRecheck', compareMode: 'tokens' });

  assert.equal(h.runs.length, 5);
  assert.ok(h.runs.every((run) => run.filePath === MAIN && run.timeoutMs === TIMEOUT_MS));
  const recheck = h.last('verifyRecheckResult');
  const byId = Object.fromEntries(recheck.results.map((item) => [item.id, item]));

  assert.equal(byId['ce-null'].status, 'ok');
  assert.match(byId['ce-null'].message, /エラーなし/);
  assert.equal(byId['ce-null'].comparison, null);
  assert.equal(byId['ce-null'].output, 'anything\n');

  assert.equal(byId['ce-same'].status, 'ok');
  assert.equal(byId['ce-same'].message, '✔ 一致');
  assert.equal(byId['ce-same'].comparison.equal, true);

  assert.equal(byId['ce-diff'].status, 'mismatch');
  assert.match(byId['ce-diff'].message, /出力が違う/);
  assert.equal(byId['ce-diff'].comparison.equal, false);

  assert.equal(byId['ce-timeout'].status, 'timeout');
  assert.match(byId['ce-timeout'].message, /時間切れ/);

  assert.equal(byId['ce-error'].status, 'error');
  assert.match(byId['ce-error'].message, /実行時エラー/);
  assert.match(byId['ce-error'].errorText, /ZeroDivisionError/);

  assert.equal(recheck.allPassed, false);
  assert.equal(recheck.message, '5 件中 3 件で問題が見つかりました。');
  assert.equal(h.fs.writes.length, 0);
});

test('verifyRecheck summary separates matches from runs without an expected output', async () => {
  async function recheckWith(saved) {
    const h = createHarness({
      files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT, counterexamples: saved }) },
      run: ({ input }) => okRun(input)
    });
    await h.load();
    await h.send({ type: 'verifyRecheck', compareMode: 'exact' });
    return h.last('verifyRecheckResult');
  }

  const allMatched = await recheckWith([
    counterexample({ id: 'ce-1', input: '1\n', expected: '1\n' }),
    counterexample({ id: 'ce-2', input: '2\n', expected: '2\n' })
  ]);
  assert.equal(allMatched.allPassed, true);
  assert.match(allMatched.message, /2 件すべての反例で一致しました/);
  assert.doesNotMatch(allMatched.message, /問題ありませんでした/);

  const someWithoutExpected = await recheckWith([
    counterexample({ id: 'ce-1', input: '1\n', expected: '1\n' }),
    counterexample({ id: 'ce-2', kind: 'mainError', input: '2\n', expected: null }),
    counterexample({ id: 'ce-3', input: '3\n', expected: '3\n' })
  ]);
  assert.equal(someWithoutExpected.allPassed, true);
  assert.match(someWithoutExpected.message, /3 件/);
  assert.match(someWithoutExpected.message, /問題ありませんでした/);
  assert.match(someWithoutExpected.message, /期待する出力がない 1 件/);
  assert.doesNotMatch(someWithoutExpected.message, /一致しました/);

  const noneWithExpected = await recheckWith([
    counterexample({ id: 'ce-1', kind: 'mainError', input: '1\n', expected: null }),
    counterexample({ id: 'ce-2', kind: 'mainTimeout', input: '2\n', expected: null })
  ]);
  assert.equal(noneWithExpected.allPassed, true);
  assert.match(noneWithExpected.message, /期待する出力がない 2 件/);

  const oneFailed = await recheckWith([
    counterexample({ id: 'ce-1', input: '1\n', expected: 'other\n' }),
    counterexample({ id: 'ce-2', kind: 'mainError', input: '2\n', expected: null })
  ]);
  assert.equal(oneFailed.allPassed, false);
  assert.equal(oneFailed.message, '2 件中 1 件で問題が見つかりました。');
});

test('verifyRecheck reports when no counterexamples are saved', async () => {
  const empty = createHarness({ files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT }) } });
  await empty.load();
  await empty.send({ type: 'verifyRecheck' });
  const none = empty.last('verifyRecheckResult');
  assert.deepEqual(none.results, []);
  assert.match(none.message, /反例はありません/);
  assert.equal(empty.runs.length, 0);
});

test('verifyRecheck without a target posts a notice', async () => {
  const h = createHarness();
  await h.send({ type: 'verifyRecheck' });
  assert.match(h.last('verifyNotice').message, /Python ファイル/);
  assert.equal(h.runs.length, 0);
});

// ---------- verifyRegenerateExpected ----------

test('verifyRegenerateExpected needs the naive file', async () => {
  const saved = [counterexample({ id: 'ce-1', kind: 'mainError', expected: null })];
  const h = createHarness({ files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT, counterexamples: saved }) } });
  await h.load();
  await h.send({ type: 'verifyRegenerateExpected' });
  const notice = h.last('verifyNotice');
  assert.match(notice.message, /a_naive\.py/);
  assert.match(notice.message, /見つかりません/);
  assert.equal(h.runs.length, 0);
  assert.equal(h.fs.writes.length, 0);
  assert.equal(h.controller.data.counterexamples[0].expected, null);
  assert.equal(h.controller.busy, false);
});

test('verifyRegenerateExpected fills expected outputs and keeps the old ones when naive fails', async () => {
  const saved = [
    counterexample({ id: 'ce-1', kind: 'mainError', input: '1\n', expected: null }),
    counterexample({ id: 'ce-2', input: '2\n', expected: 'old\n' }),
    counterexample({ id: 'ce-3', kind: 'mainTimeout', input: '3\n', expected: null }),
    counterexample({ id: 'ce-4', input: '4\n', expected: 'stale\n' })
  ];
  const outputs = {
    '1\n': () => okRun('1\n'),
    '2\n': () => errorRun(),
    '3\n': () => timeoutRun(),
    '4\n': () => okRun('16\n')
  };
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT, counterexamples: saved }), [NAIVE]: 'print(0)\n' },
    run: ({ input }) => outputs[input]()
  });
  await h.load();
  await h.send({ type: 'verifyRegenerateExpected' });

  assert.equal(h.runs.length, 4);
  assert.ok(h.runs.every((run) => run.filePath === NAIVE && run.timeoutMs === NAIVE_TIMEOUT_MS));
  const posted = h.last('verifyCounterexamples');
  assert.equal(posted.failed, true);
  assert.equal(posted.clearRecheck, true);
  assert.match(posted.message, /2 件/);
  assert.match(posted.message, /前の期待する出力のまま/);
  const expectedOutputs = ['1\n', 'old\n', null, '16\n'];
  assert.deepEqual(posted.counterexamples.map((item) => item.expected), expectedOutputs);
  assert.equal(h.fs.writes.length, 1);
  assert.deepEqual(h.saved().counterexamples.map((item) => item.expected), expectedOutputs);
  assert.deepEqual(h.saved().counterexamples.map((item) => item.id), ['ce-1', 'ce-2', 'ce-3', 'ce-4']);
});

test('verifyRegenerateExpected reports success when naive never fails', async () => {
  const saved = [counterexample({ id: 'ce-1', kind: 'mainError', input: '6\n', expected: null })];
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT, counterexamples: saved }), [NAIVE]: 'print(0)\n' },
    run: () => okRun('36\n')
  });
  await h.load();
  await h.send({ type: 'verifyRegenerateExpected' });
  const posted = h.last('verifyCounterexamples');
  assert.equal(posted.failed, false);
  assert.equal(posted.message, '期待する出力を作り直しました。');
  assert.equal(h.saved().counterexamples[0].expected, '36\n');
});

test('a counterexample deleted while expected outputs are regenerated stays deleted', async () => {
  const saved = [
    counterexample({ id: 'ce-1', kind: 'mainError', input: '1\n', expected: null }),
    counterexample({ id: 'ce-2', kind: 'mainError', input: '2\n', expected: null }),
    counterexample({ id: 'ce-3', input: '3\n', expected: 'old\n' })
  ];
  const firstRunStarted = deferred();
  const releaseFirstRun = deferred();
  const h = createHarness({
    files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT, counterexamples: saved }), [NAIVE]: 'print(0)\n' },
    run: async ({ input }) => {
      if (input === '1\n') {
        firstRunStarted.resolve();
        await releaseFirstRun.promise;
      }
      const n = Number(input.trim());
      return okRun(`${n * n}\n`);
    }
  });
  await h.load();

  const regenerating = h.send({ type: 'verifyRegenerateExpected' });
  await firstRunStarted.promise;
  await h.send({ type: 'verifyDeleteCounterexample', id: 'ce-2' });
  assert.deepEqual(h.saved().counterexamples.map((item) => item.id), ['ce-1', 'ce-3']);
  releaseFirstRun.resolve();
  await regenerating;

  const posted = h.last('verifyCounterexamples');
  assert.equal(posted.clearRecheck, true);
  assert.equal(posted.failed, false);
  assert.deepEqual(posted.counterexamples.map((item) => item.id), ['ce-1', 'ce-3']);
  assert.deepEqual(posted.counterexamples.map((item) => item.expected), ['1\n', '9\n']);

  const written = h.saved().counterexamples;
  assert.deepEqual(written.map((item) => item.id), ['ce-1', 'ce-3']);
  assert.deepEqual(written.map((item) => item.expected), ['1\n', '9\n']);
  assert.deepEqual(h.controller.data.counterexamples.map((item) => item.id), ['ce-1', 'ce-3']);
  assert.equal(h.controller.busy, false);
});

// ---------- verifyFetchProblem ----------

const PROBLEM_HTML = `<!DOCTYPE html>
<html><body>
<span class="lang">
<span class="lang-ja">
<div class="part"><section><h3>問題文</h3><p>整数 <var>N</var> が与えられます。</p></section></div>
<div class="part"><section><h3>制約</h3><ul>
<li><var>1 \\leq N \\leq 100</var></li>
<li>入力はすべて整数である</li>
</ul></section></div>
<div class="part"><section><h3>入力</h3><p>入力は以下の形式で標準入力から与えられる。</p>
<pre><var>N</var>
</pre></section></div>
<div class="part"><section><h3>入力例 1</h3><pre>5
</pre></section></div>
</span>
</span>
</body></html>`;

function response({ status = 200, url = null, body = '' } = {}) {
  return (requestedUrl) => ({
    status,
    ok: status >= 200 && status < 300,
    url: url || requestedUrl,
    text: async () => body
  });
}

test('verifyFetchProblem rejects URLs that are not AtCoder task pages without fetching', async () => {
  const urls = [
    'https://example.com/contests/abc001/tasks/abc001_a',
    'http://atcoder.jp/contests/abc001/tasks/abc001_a',
    'https://atcoder.jp/contests/abc001',
    'not a url',
    ''
  ];
  for (const url of urls) {
    const h = createHarness({ fetchImpl: response({ body: PROBLEM_HTML }) });
    assert.equal(await h.send({ type: 'verifyFetchProblem', url }), true);
    const result = h.last('verifyImportResult');
    assert.equal(result.ok, false, url);
    assert.match(result.message, /atcoder\.jp/, url);
    assert.equal(h.fetches.length, 0, url);
  }
});

test('verifyFetchProblem explains each kind of failed fetch', async () => {
  const abortError = new Error('This operation was aborted');
  abortError.name = 'AbortError';
  const cases = [
    ['not found', response({ status: 404, body: 'Not Found' }), /見つかりませんでした/],
    ['login redirect', response({ url: 'https://atcoder.jp/login?continue=https%3A%2F%2Fatcoder.jp%2F', body: '<html></html>' }), /ログインが必要/],
    ['forbidden', response({ status: 403 }), /ログインが必要/],
    ['unauthorized', response({ status: 401 }), /ログインが必要/],
    ['server error', response({ status: 503 }), /503/],
    ['network error', () => {
      throw new TypeError('fetch failed');
    }, /ネットワーク/],
    ['timeout', () => {
      throw abortError;
    }, /時間がかかりすぎた/]
  ];
  for (const [name, fetchImpl, pattern] of cases) {
    const h = createHarness({ fetchImpl });
    await h.send({ type: 'verifyFetchProblem', url: TASK_URL });
    const result = h.last('verifyImportResult');
    assert.equal(result.ok, false, name);
    assert.match(result.message, pattern, name);
    assert.equal(result.format, undefined, name);
    assert.equal(h.fetches.length, 1, name);
    assert.equal(h.fetches[0].url, JA_TASK_URL, name);
  }
});

test('verifyFetchProblem reads the input format from the Japanese page', async () => {
  const h = createHarness({ fetchImpl: response({ body: PROBLEM_HTML }) });
  await h.send({ type: 'verifyFetchProblem', url: `${TASK_URL}?lang=en` });

  assert.equal(h.fetches.length, 1);
  assert.equal(h.fetches[0].url, JA_TASK_URL);
  assert.equal(h.fetches[0].options.headers['Accept-Language'], 'ja');
  assert.ok(h.fetches[0].options.signal instanceof AbortSignal);

  const result = h.last('verifyImportResult');
  assert.equal(result.ok, true, result.message);
  assert.ok(Array.isArray(result.warnings));
  assert.equal(result.format.rows.length, 1);
  assert.equal(result.format.rows[0].kind, 'ints');
  assert.deepEqual(result.format.rows[0].vars, [{ name: 'N', min: '1', max: '100' }]);
  assert.equal(result.format.rows[0].needsReview, false);
});

// ---------- verifyDeleteCounterexample ----------

test('verifyDeleteCounterexample removes the counterexample and saves', async () => {
  const saved = [
    counterexample({ id: 'ce-1', input: '1\n' }),
    counterexample({ id: 'ce-2', kind: 'mainError', input: '2\n', expected: null })
  ];
  const h = createHarness({ files: { [VERIFY]: verifyFileText({ format: VALID_FORMAT, counterexamples: saved }) } });
  await h.load();
  assert.equal(await h.send({ type: 'verifyDeleteCounterexample', id: 'ce-1' }), true);

  assert.equal(h.fs.writes.length, 1);
  assert.deepEqual(h.saved().counterexamples.map((item) => item.id), ['ce-2']);
  assert.equal(h.saved().counterexamples[0].expected, null);
  const posted = h.last('verifyCounterexamples');
  assert.deepEqual(posted.counterexamples.map((item) => item.id), ['ce-2']);
  assert.equal(posted.message, '反例を消しました。');
  assert.deepEqual(h.controller.data.counterexamples.map((item) => item.id), ['ce-2']);
});

test('handleMessage returns false for unknown messages', async () => {
  const h = createHarness();
  assert.equal(await h.send({ type: 'somethingElse' }), false);
  assert.equal(h.messages.length, 0);
});
