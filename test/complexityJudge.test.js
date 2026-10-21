const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_OPS_PER_SECOND,
  detectImplementation,
  formatOperations,
  judgeOperations,
  opsPerSecondFromMeasurement
} = require('../src/complexity/judge');

test('DEFAULT_OPS_PER_SECOND has the documented speeds', () => {
  assert.deepEqual({ ...DEFAULT_OPS_PER_SECOND }, { pypy: 3e7, cpython: 1e7 });
});

test('detectImplementation reads PyPy from the path', () => {
  const pypyPaths = ['pypy3', 'pypy', 'C:\\PyPy\\pypy3.exe', 'C:\\PyPy\\python.exe', '/usr/local/bin/pypy3', 'PYPY3.EXE'];
  for (const pythonPath of pypyPaths) {
    assert.equal(detectImplementation(pythonPath), 'pypy', pythonPath);
  }

  const cpythonPaths = ['python', 'py', 'python3', 'C:\\Python\\python.exe', '/usr/bin/python3', '', null, undefined];
  for (const pythonPath of cpythonPaths) {
    assert.equal(detectImplementation(pythonPath), 'cpython', String(pythonPath));
  }
});

test('detectImplementation trusts the runtime name over the path', () => {
  assert.equal(detectImplementation('python', 'PyPy'), 'pypy');
  assert.equal(detectImplementation('', 'PyPy'), 'pypy');
  assert.equal(detectImplementation('pypy3', 'CPython'), 'cpython');
  assert.equal(detectImplementation('python', 'CPython'), 'cpython');
  assert.equal(detectImplementation('pypy3', ''), 'pypy');
  assert.equal(detectImplementation('pypy3', '   '), 'pypy');
  assert.equal(detectImplementation('pypy3', null), 'pypy');
});

test('judgeOperations gives each verdict', () => {
  const base = { timeoutMs: 2000, opsPerSecond: 1e7 };
  assert.deepEqual(judgeOperations({ ...base, operations: 2e6 }), { ok: true, ratio: 0.1, verdict: 'safe', label: '余裕' });
  assert.deepEqual(judgeOperations({ ...base, operations: 1e7 }), { ok: true, ratio: 0.5, verdict: 'tight', label: '厳しい' });
  assert.deepEqual(judgeOperations({ ...base, operations: 4e10 }), { ok: true, ratio: 2000, verdict: 'tle', label: 'TLE の恐れ' });
  assert.equal(judgeOperations({ ...base, operations: 0 }).verdict, 'safe');
});

test('judgeOperations includes the exact 0.3 and 1.0 boundaries', () => {
  const cases = [
    [{ operations: 6e6, timeoutMs: 2000, opsPerSecond: 1e7 }, 'safe'],
    [{ operations: 6e6 + 1, timeoutMs: 2000, opsPerSecond: 1e7 }, 'tight'],
    [{ operations: 2e7, timeoutMs: 2000, opsPerSecond: 1e7 }, 'tight'],
    [{ operations: 2e7 + 1, timeoutMs: 2000, opsPerSecond: 1e7 }, 'tle'],
    [{ operations: 3e6, timeoutMs: 1000, opsPerSecond: 1e7 }, 'safe'],
    [{ operations: 9e6, timeoutMs: 1000, opsPerSecond: 3e7 }, 'safe'],
    [{ operations: 3e7, timeoutMs: 1000, opsPerSecond: 3e7 }, 'tight'],
    [{ operations: 9e7, timeoutMs: 3000, opsPerSecond: 3e7 }, 'tight'],
    [{ operations: 2.7e7, timeoutMs: 3000, opsPerSecond: 3e7 }, 'safe']
  ];
  for (const [options, verdict] of cases) {
    assert.equal(judgeOperations(options).verdict, verdict, JSON.stringify(options));
  }
});

test('judgeOperations treats an endless count as TLE and keeps the ratio JSON-safe', () => {
  const result = judgeOperations({ operations: Infinity, timeoutMs: 2000, opsPerSecond: 3e7 });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, 'tle');
  assert.ok(Number.isFinite(result.ratio));
  assert.equal(JSON.parse(JSON.stringify(result)).ratio, result.ratio);
});

test('judgeOperations returns ok false for bad arguments', () => {
  const cases = [
    undefined,
    null,
    { operations: null, timeoutMs: 2000, opsPerSecond: 1e7 },
    { operations: Number.NaN, timeoutMs: 2000, opsPerSecond: 1e7 },
    { operations: -1, timeoutMs: 2000, opsPerSecond: 1e7 },
    { operations: 10, timeoutMs: 0, opsPerSecond: 1e7 },
    { operations: 10, timeoutMs: '2000', opsPerSecond: 1e7 },
    { operations: 10, timeoutMs: 2000, opsPerSecond: 0 },
    { operations: 10, timeoutMs: 2000, opsPerSecond: Infinity }
  ];
  for (const options of cases) {
    const result = judgeOperations(options);
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.ok(result.message.length > 0);
  }
});

test('formatOperations keeps one significant digit, rounding half up', () => {
  const cases = [
    [4e10, '4×10^10'],
    [2.5e5, '3×10^5'],
    [1.5e5, '2×10^5'],
    [2.4e5, '2×10^5'],
    [200000, '2×10^5'],
    [9.6e5, '1×10^6'],
    [1000, '1×10^3'],
    [999.6, '1×10^3'],
    [1.23e18, '1×10^18'],
    [3.7e100, '4×10^100']
  ];
  for (const [operations, text] of cases) {
    assert.equal(formatOperations(operations), text, String(operations));
  }
});

test('formatOperations shows small counts as they are', () => {
  assert.equal(formatOperations(0), '0');
  assert.equal(formatOperations(1), '1');
  assert.equal(formatOperations(999), '999');
  assert.equal(formatOperations(12.3), '12');
  assert.equal(formatOperations(17.6), '18');
});

test('formatOperations handles endless and broken counts', () => {
  assert.equal(formatOperations(Infinity), '∞');
  for (const value of [Number.NaN, null, undefined, -5, '100']) {
    assert.equal(formatOperations(value), '?', String(value));
  }
});

test('opsPerSecondFromMeasurement uses the largest size', () => {
  const points = [
    { scale: 1 / 4, n: 50000, seconds: 0.1, timedOut: false },
    { scale: 1, n: 200000, seconds: 0.5, timedOut: false },
    { scale: 1 / 16, n: 12500, seconds: 0.06, timedOut: false }
  ];
  assert.equal(opsPerSecondFromMeasurement(points, (point) => point.n * 100), 4e7);
});

test('opsPerSecondFromMeasurement ignores too-short and timed-out points', () => {
  const points = [
    { n: 3125, seconds: 0.001 },
    { n: 12500, seconds: 0.2 },
    { n: 50000, seconds: 0.01 },
    { n: 200000, seconds: 2, timedOut: true }
  ];
  assert.equal(opsPerSecondFromMeasurement(points, (point) => point.n), 12500 / 0.2);
});

test('opsPerSecondFromMeasurement returns null when nothing is usable', () => {
  const shortPoints = [{ n: 3125, seconds: 0.001 }, { n: 200000, seconds: 0.02 }];
  assert.equal(opsPerSecondFromMeasurement(shortPoints, (point) => point.n), null);
  assert.equal(opsPerSecondFromMeasurement([], (point) => point.n), null);
  assert.equal(opsPerSecondFromMeasurement(null, (point) => point.n), null);
  assert.equal(opsPerSecondFromMeasurement([{ n: 10, seconds: 1 }], null), null);

  const points = [{ n: 200000, seconds: 1 }];
  assert.equal(opsPerSecondFromMeasurement(points, () => null), null);
  assert.equal(opsPerSecondFromMeasurement(points, () => Infinity), null);
  assert.equal(opsPerSecondFromMeasurement(points, () => 0), null);
  assert.equal(opsPerSecondFromMeasurement(points, () => {
    throw new Error('broken');
  }), null);
});

test('opsPerSecondFromMeasurement falls back to the next size when the largest has no estimate', () => {
  const points = [{ n: 50000, seconds: 0.1 }, { n: 200000, seconds: 0.4 }];
  const operationsAt = (point) => (point.n === 200000 ? null : point.n);
  assert.equal(opsPerSecondFromMeasurement(points, operationsAt), 500000);
});
