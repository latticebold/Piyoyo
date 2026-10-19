const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  COUNTEREXAMPLE_KINDS,
  MAX_COUNTEREXAMPLES,
  VERIFY_FILE_VERSION,
  addCounterexample,
  createEmptyVerifyData,
  getDefaultNaivePath,
  getVerifyFilePath,
  parseVerifyFile,
  removeCounterexample,
  resolveNaivePath,
  serializeVerifyFile,
  toRelativeNaivePath
} = require('../src/verify/verifyFile');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function makeCounterexample(overrides = {}) {
  return {
    id: 'ce-1',
    kind: 'mismatch',
    input: '3 2\n5 1 4\nab\n',
    expected: '10\n',
    seed: 12345,
    createdAt: '2026-10-19T12:00:00.000Z',
    ...overrides
  };
}

function makeData(overrides = {}) {
  return {
    ...createEmptyVerifyData(),
    format: {
      rows: [
        { kind: 'ints', vars: [{ name: 'N', min: '1', max: '2×10^5' }] },
        { kind: 'intList', name: 'A', length: 'N', min: '1', max: '10^9', layout: 'row', distinct: false, order: 'none' }
      ]
    },
    naivePath: 'a_naive.py',
    compareMode: 'float',
    iterations: 250,
    counterexamples: [makeCounterexample()],
    ...overrides
  };
}

function parseObject(object) {
  return parseVerifyFile(JSON.stringify(object));
}

test('VERIFY_FILE_VERSION is 1 and counterexample kinds are listed', () => {
  assert.equal(VERIFY_FILE_VERSION, 1);
  assert.deepEqual(COUNTEREXAMPLE_KINDS, ['mismatch', 'mainError', 'mainTimeout']);
  assert.equal(MAX_COUNTEREXAMPLES, 50);
});

test('getVerifyFilePath puts the file next to the Python file', () => {
  assert.equal(getVerifyFilePath(path.join('contest', 'a.py')), path.join('contest', 'a.piyoyo.json'));
  assert.equal(getVerifyFilePath('a.py'), 'a.piyoyo.json');
  assert.equal(getVerifyFilePath(path.resolve('contest', 'abc123_b.py')), path.resolve('contest', 'abc123_b.piyoyo.json'));
  assert.equal(getVerifyFilePath(path.join('v1.2', 'main')), path.join('v1.2', 'main.piyoyo.json'));
});

test('getDefaultNaivePath adds _naive before the extension', () => {
  assert.equal(getDefaultNaivePath(path.join('contest', 'a.py')), path.join('contest', 'a_naive.py'));
  assert.equal(getDefaultNaivePath('a.py'), 'a_naive.py');
});

test('path helpers return an empty string for bad input', () => {
  for (const bad of ['', '   ', null, undefined, 42]) {
    assert.equal(getVerifyFilePath(bad), '');
    assert.equal(getDefaultNaivePath(bad), '');
    assert.equal(resolveNaivePath(bad, 'a_naive.py'), '');
    assert.equal(toRelativeNaivePath(bad, path.resolve('contest', 'a_naive.py')), '');
  }
  assert.equal(toRelativeNaivePath(path.resolve('contest', 'a.py'), ''), '');
});

test('resolveNaivePath uses the default when the stored path is empty', () => {
  const pyFile = path.resolve('contest', 'a.py');
  const expected = path.resolve('contest', 'a_naive.py');
  assert.equal(resolveNaivePath(pyFile, ''), expected);
  assert.equal(resolveNaivePath(pyFile, '   '), expected);
  assert.equal(resolveNaivePath(pyFile, undefined), expected);
  assert.equal(resolveNaivePath(pyFile, ''), getDefaultNaivePath(pyFile));
});

test('resolveNaivePath resolves paths relative to the Python file folder', () => {
  const pyFile = path.resolve('contest', 'a.py');
  assert.equal(resolveNaivePath(pyFile, 'a_naive.py'), path.resolve('contest', 'a_naive.py'));
  assert.equal(resolveNaivePath(pyFile, 'naive/b.py'), path.resolve('contest', 'naive', 'b.py'));
  assert.equal(resolveNaivePath(pyFile, '../lib/b.py'), path.resolve('lib', 'b.py'));
  assert.equal(resolveNaivePath(pyFile, 'naive\\b.py'), path.resolve('contest', 'naive', 'b.py'));
});

test('resolveNaivePath keeps absolute paths', () => {
  const pyFile = path.resolve('contest', 'a.py');
  const absolute = path.resolve('elsewhere', 'b.py');
  assert.equal(resolveNaivePath(pyFile, absolute), absolute);
});

test('toRelativeNaivePath writes paths with / separators', () => {
  const pyFile = path.resolve('contest', 'a.py');
  assert.equal(toRelativeNaivePath(pyFile, path.resolve('contest', 'a_naive.py')), 'a_naive.py');
  assert.equal(toRelativeNaivePath(pyFile, path.resolve('contest', 'naive', 'b.py')), 'naive/b.py');
  assert.equal(toRelativeNaivePath(pyFile, path.resolve('lib', 'b.py')), '../lib/b.py');
});

test('relative naive paths round trip through resolve and toRelative', () => {
  const pyFile = path.resolve('contest', 'a.py');
  const targets = [
    path.resolve('contest', 'a_naive.py'),
    path.resolve('contest', 'naive', 'deep', 'b.py'),
    path.resolve('lib', 'b.py'),
    path.resolve('other', 'x', 'c.py')
  ];
  for (const target of targets) {
    const relative = toRelativeNaivePath(pyFile, target);
    assert.equal(relative.includes('\\'), false);
    assert.equal(path.isAbsolute(relative), false);
    assert.equal(resolveNaivePath(pyFile, relative), target);
  }
  for (const relative of ['a_naive.py', 'naive/b.py', '../lib/b.py']) {
    assert.equal(toRelativeNaivePath(pyFile, resolveNaivePath(pyFile, relative)), relative);
  }
});

test('createEmptyVerifyData returns fresh defaults', () => {
  const first = createEmptyVerifyData();
  assert.deepEqual(first, {
    version: 1,
    format: { rows: [] },
    naivePath: '',
    compareMode: 'tokens',
    iterations: 100,
    counterexamples: []
  });
  first.format.rows.push({});
  first.counterexamples.push({});
  assert.deepEqual(createEmptyVerifyData().format.rows, []);
  assert.deepEqual(createEmptyVerifyData().counterexamples, []);
});

test('serializeVerifyFile writes 2-space JSON with a final newline', () => {
  const text = serializeVerifyFile(createEmptyVerifyData());
  assert.equal(text, [
    '{',
    '  "version": 1,',
    '  "format": {',
    '    "rows": []',
    '  },',
    '  "naivePath": "",',
    '  "compareMode": "tokens",',
    '  "iterations": 100,',
    '  "counterexamples": []',
    '}',
    ''
  ].join('\n'));
});

test('serializeVerifyFile orders fields and writes BigInt values as strings', () => {
  const data = makeData({
    format: { rows: [{ kind: 'ints', vars: [{ name: 'N', min: 1n, max: 10n ** 18n }] }] },
    counterexamples: [{ createdAt: 'x', seed: 1, expected: '', input: '1\n', kind: 'mainError', id: 'ce-9' }]
  });
  const text = serializeVerifyFile(data);
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ['version', 'format', 'naivePath', 'compareMode', 'iterations', 'counterexamples']);
  assert.deepEqual(Object.keys(parsed.counterexamples[0]), ['id', 'kind', 'input', 'expected', 'seed', 'createdAt']);
  assert.equal(parsed.format.rows[0].vars[0].max, '1000000000000000000');
});

test('serializeVerifyFile tolerates bad data', () => {
  assert.equal(serializeVerifyFile(null), serializeVerifyFile(createEmptyVerifyData()));
  const parsed = JSON.parse(serializeVerifyFile({ iterations: 99999, compareMode: 'bad', format: 3 }));
  assert.equal(parsed.iterations, 10000);
  assert.equal(parsed.compareMode, 'tokens');
  assert.deepEqual(parsed.format, { rows: [] });
});

test('parse and serialize round trip', () => {
  const data = makeData({
    counterexamples: [
      makeCounterexample(),
      makeCounterexample({ id: 'ce-2', kind: 'mainTimeout', input: '1\n', expected: '', seed: null, createdAt: '' })
    ]
  });
  const text = serializeVerifyFile(data);
  const result = parseVerifyFile(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.data, data);
  assert.equal(serializeVerifyFile(result.data), text);
});

test('parseVerifyFile reads the documented example', () => {
  const result = parseVerifyFile(serializeVerifyFile({
    version: 1,
    format: { rows: [] },
    naivePath: 'a_naive.py',
    compareMode: 'tokens',
    iterations: 100,
    counterexamples: [makeCounterexample({ id: 'ce-1760000000000-1' })]
  }));
  assert.equal(result.ok, true);
  assert.equal(result.data.counterexamples[0].id, 'ce-1760000000000-1');
  assert.deepEqual(result.warnings, []);
});

test('parseVerifyFile accepts a leading BOM and CRLF', () => {
  const text = `﻿${serializeVerifyFile(makeData()).replace(/\n/g, '\r\n')}`;
  const result = parseVerifyFile(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, makeData());
});

test('parseVerifyFile rejects text that is not JSON', () => {
  for (const text of ['', '{', 'not json', '{"version": 1,}']) {
    const result = parseVerifyFile(text);
    assert.equal(result.ok, false);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0);
  }
});

test('parseVerifyFile rejects non-string input without throwing', () => {
  for (const value of [null, undefined, 42, {}]) {
    const result = parseVerifyFile(value);
    assert.equal(result.ok, false);
    assert.ok(result.message);
  }
});

test('parseVerifyFile rejects a root that is not an object', () => {
  for (const text of ['null', '[]', '[1, 2]', '42', '"text"', 'true']) {
    const result = parseVerifyFile(text);
    assert.equal(result.ok, false, text);
    assert.ok(result.message);
  }
});

test('parseVerifyFile rejects files from a newer Piyoyo', () => {
  for (const version of [2, 3, 100]) {
    const result = parseObject({ ...makeData(), version });
    assert.equal(result.ok, false);
    assert.match(result.message, /新しい Piyoyo/);
  }
});

test('parseVerifyFile warns and reads version 1 for odd version values', () => {
  for (const version of [0, -1, '1', '2', null, true]) {
    const result = parseObject({ ...makeData(), version });
    assert.equal(result.ok, true, String(version));
    assert.equal(result.data.version, 1);
    assert.equal(result.warnings.length, 1);
  }
});

test('parseVerifyFile fills defaults for missing fields without warnings', () => {
  const result = parseVerifyFile('{}');
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, createEmptyVerifyData());
  assert.deepEqual(result.warnings, []);
});

test('parseVerifyFile replaces a broken format with an empty one', () => {
  for (const format of [null, [], 'rows', { rows: 'x' }, { rows: {} }, {}]) {
    const result = parseObject({ ...makeData(), format });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.format, { rows: [] });
    assert.equal(result.warnings.length, 1);
  }
});

test('parseVerifyFile keeps format rows without checking their contents', () => {
  const format = { rows: [{ kind: 'unknown', foo: 1 }, 'not a row'] };
  const result = parseObject({ ...makeData(), format });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.format, format);
  assert.deepEqual(result.warnings, []);
});

test('parseVerifyFile handles naivePath types and separators', () => {
  const wrongType = parseObject({ ...makeData(), naivePath: 3 });
  assert.equal(wrongType.data.naivePath, '');
  assert.equal(wrongType.warnings.length, 1);

  const backslashes = parseObject({ ...makeData(), naivePath: ' naive\\b.py ' });
  assert.equal(backslashes.data.naivePath, 'naive/b.py');
  assert.deepEqual(backslashes.warnings, []);
});

test('parseVerifyFile replaces an unknown compare mode', () => {
  for (const compareMode of ['fuzzy', '', 1, null]) {
    const result = parseObject({ ...makeData(), compareMode });
    assert.equal(result.data.compareMode, 'tokens');
    assert.equal(result.warnings.length, 1);
  }
  for (const compareMode of ['tokens', 'exact', 'float']) {
    const result = parseObject({ ...makeData(), compareMode });
    assert.equal(result.data.compareMode, compareMode);
    assert.deepEqual(result.warnings, []);
  }
});

test('parseVerifyFile clamps iterations to 1..10000', () => {
  const cases = [
    [0, 1],
    [-5, 1],
    [20000, 10000],
    [3.7, 3],
    [10000, 10000],
    [1, 1]
  ];
  for (const [input, expected] of cases) {
    const result = parseObject({ ...makeData(), iterations: input });
    assert.equal(result.data.iterations, expected, String(input));
    assert.equal(result.warnings.length, input === expected ? 0 : 1, String(input));
  }
});

test('parseVerifyFile uses 100 iterations for non-numbers', () => {
  for (const iterations of ['50', null, true, {}, []]) {
    const result = parseObject({ ...makeData(), iterations });
    assert.equal(result.data.iterations, 100);
    assert.equal(result.warnings.length, 1);
  }
});

test('parseVerifyFile replaces a counterexample list that is not an array', () => {
  for (const counterexamples of [null, {}, 'x', 3]) {
    const result = parseObject({ ...makeData(), counterexamples });
    assert.deepEqual(result.data.counterexamples, []);
    assert.equal(result.warnings.length, 1);
  }
});

test('parseVerifyFile drops malformed counterexamples with one warning', () => {
  const good = makeCounterexample();
  const result = parseObject({
    ...makeData(),
    counterexamples: [
      null,
      'text',
      [],
      { kind: 'mismatch' },
      { kind: 'mismatch', input: 3 },
      { kind: 'wrongAnswer', input: '1\n' },
      { input: '2\n' },
      good
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.counterexamples, [good]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /7 件/);
});

test('parseVerifyFile fills optional counterexample fields', () => {
  const result = parseObject({
    ...makeData(),
    counterexamples: [
      { kind: 'mainError', input: '1\n' },
      { kind: 'mismatch', input: '2\n', id: '', expected: 5, seed: -1, createdAt: 7 },
      { kind: 'mismatch', input: '3\n', seed: 2 ** 32 },
      { kind: 'mismatch', input: '4\n', seed: 1.5 },
      { kind: 'mismatch', input: '5\n', seed: 4294967295, extra: 'dropped' }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  const [first, second, third, fourth, fifth] = result.data.counterexamples;
  assert.match(first.id, /^ce-\d+-\d+$/);
  assert.equal(first.expected, '');
  assert.equal(first.seed, null);
  assert.equal(first.createdAt, '');
  assert.match(second.id, /^ce-\d+-\d+$/);
  assert.equal(second.expected, '');
  assert.equal(second.seed, null);
  assert.equal(second.createdAt, '');
  assert.equal(third.seed, null);
  assert.equal(fourth.seed, null);
  assert.equal(fifth.seed, 4294967295);
  assert.equal('extra' in fifth, false);
});

test('parseVerifyFile merges duplicate inputs and repairs duplicate ids', () => {
  const result = parseObject({
    ...makeData(),
    counterexamples: [
      makeCounterexample({ id: 'same', input: '1\n', expected: 'first' }),
      makeCounterexample({ id: 'other', input: '1\n', expected: 'second' }),
      makeCounterexample({ id: 'same', input: '2\n' })
    ]
  });
  assert.equal(result.ok, true);
  const list = result.data.counterexamples;
  assert.equal(list.length, 2);
  assert.equal(list[0].expected, 'first');
  assert.equal(list[0].id, 'same');
  assert.notEqual(list[1].id, 'same');
  assert.equal(result.warnings.length, 1);
});

test('parseVerifyFile keeps only the newest 50 counterexamples', () => {
  const counterexamples = Array.from({ length: 55 }, (_, index) => makeCounterexample({
    id: `ce-${index}`,
    input: `${index}\n`
  }));
  const result = parseObject({ ...makeData(), counterexamples });
  assert.equal(result.ok, true);
  assert.equal(result.data.counterexamples.length, 50);
  assert.equal(result.data.counterexamples[0].id, 'ce-5');
  assert.equal(result.data.counterexamples[49].id, 'ce-54');
  assert.equal(result.warnings.length, 1);
});

test('addCounterexample appends without mutating its arguments', () => {
  const data = deepFreeze(makeData());
  const counterexample = deepFreeze(makeCounterexample({ id: 'ce-new', input: '9\n' }));
  const next = addCounterexample(data, counterexample);
  assert.notEqual(next, data);
  assert.notEqual(next.counterexamples, data.counterexamples);
  assert.equal(data.counterexamples.length, 1);
  assert.equal(next.counterexamples.length, 2);
  assert.deepEqual(next.counterexamples[1], counterexample);
  assert.notEqual(next.counterexamples[1], counterexample);
  assert.equal(next.naivePath, data.naivePath);
  assert.equal(next.iterations, data.iterations);
  assert.deepEqual(next.format, data.format);
});

test('addCounterexample does not add the same input twice', () => {
  const data = deepFreeze(makeData());
  const next = addCounterexample(data, makeCounterexample({ id: 'ce-other', expected: 'changed' }));
  assert.deepEqual(next.counterexamples, data.counterexamples);
  assert.notEqual(next.counterexamples, data.counterexamples);
});

test('addCounterexample generates missing ids and createdAt', () => {
  const data = deepFreeze(createEmptyVerifyData());
  const next = addCounterexample(data, deepFreeze({ kind: 'mainTimeout', input: '1\n', seed: 7 }));
  const [entry] = next.counterexamples;
  assert.match(entry.id, /^ce-\d+-\d+$/);
  assert.equal(entry.kind, 'mainTimeout');
  assert.equal(entry.expected, '');
  assert.equal(entry.seed, 7);
  assert.ok(!Number.isNaN(Date.parse(entry.createdAt)));
});

test('addCounterexample keeps ids unique when many are added at once', () => {
  let data = createEmptyVerifyData();
  for (let index = 0; index < 30; index += 1) {
    data = addCounterexample(data, { kind: 'mismatch', input: `${index}\n` });
  }
  data = addCounterexample(data, { id: data.counterexamples[0].id, kind: 'mismatch', input: 'clash\n' });
  const ids = data.counterexamples.map((item) => item.id);
  assert.equal(ids.length, 31);
  assert.equal(new Set(ids).size, 31);
});

test('addCounterexample keeps at most 50 and drops the oldest', () => {
  let data = deepFreeze(createEmptyVerifyData());
  for (let index = 0; index < 55; index += 1) {
    data = deepFreeze(addCounterexample(data, makeCounterexample({ id: `ce-${index}`, input: `${index}\n` })));
  }
  assert.equal(data.counterexamples.length, 50);
  assert.equal(data.counterexamples[0].id, 'ce-5');
  assert.equal(data.counterexamples[49].id, 'ce-54');
  assert.equal(data.counterexamples.some((item) => item.id === 'ce-4'), false);
});

test('addCounterexample ignores invalid counterexamples', () => {
  const data = deepFreeze(makeData());
  for (const bad of [null, 'x', {}, { kind: 'mismatch' }, { kind: 'nope', input: '1\n' }]) {
    const next = addCounterexample(data, bad);
    assert.deepEqual(next.counterexamples, data.counterexamples);
  }
});

test('addCounterexample starts from empty data when data is invalid', () => {
  const next = addCounterexample(null, makeCounterexample());
  assert.equal(next.version, 1);
  assert.equal(next.counterexamples.length, 1);

  const withoutList = addCounterexample({ ...createEmptyVerifyData(), counterexamples: 'bad' }, makeCounterexample());
  assert.equal(withoutList.counterexamples.length, 1);
});

test('removeCounterexample removes by id without mutating', () => {
  const data = deepFreeze(makeData({
    counterexamples: [
      makeCounterexample({ id: 'ce-1', input: '1\n' }),
      makeCounterexample({ id: 'ce-2', input: '2\n' }),
      makeCounterexample({ id: 'ce-3', input: '3\n' })
    ]
  }));
  const next = removeCounterexample(data, 'ce-2');
  assert.deepEqual(next.counterexamples.map((item) => item.id), ['ce-1', 'ce-3']);
  assert.equal(data.counterexamples.length, 3);
  assert.equal(next.compareMode, data.compareMode);
});

test('removeCounterexample with an unknown id keeps the list', () => {
  const data = deepFreeze(makeData());
  const next = removeCounterexample(data, 'missing');
  assert.deepEqual(next.counterexamples, data.counterexamples);
  assert.notEqual(next.counterexamples, data.counterexamples);
  assert.deepEqual(removeCounterexample(null, 'x').counterexamples, []);
});
