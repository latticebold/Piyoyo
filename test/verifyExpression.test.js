const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateExpr, parseExpr, parseIntegerLiteral } = require('../src/verify/expression');

test('parseIntegerLiteral reads plain and signed integers', () => {
  assert.equal(parseIntegerLiteral('200000'), 200000n);
  assert.equal(parseIntegerLiteral('-5'), -5n);
  assert.equal(parseIntegerLiteral('0'), 0n);
  assert.equal(parseIntegerLiteral('  42  '), 42n);
});

test('parseIntegerLiteral reads every times-ten form', () => {
  assert.equal(parseIntegerLiteral('2×10^5'), 200000n);
  assert.equal(parseIntegerLiteral('2*10^5'), 200000n);
  assert.equal(parseIntegerLiteral('2 \\times 10^5'), 200000n);
  assert.equal(parseIntegerLiteral('2\\times10^{5}'), 200000n);
  assert.equal(parseIntegerLiteral('1.5×10^5'), 150000n);
  assert.equal(parseIntegerLiteral(' 2 × 10 ^ 5 '), 200000n);
  assert.equal(parseIntegerLiteral('-2×10^5'), -200000n);
});

test('parseIntegerLiteral reads powers and e notation exactly', () => {
  assert.equal(parseIntegerLiteral('10^9'), 1000000000n);
  assert.equal(parseIntegerLiteral('-10^9'), -1000000000n);
  assert.equal(parseIntegerLiteral('10^18'), 1000000000000000000n);
  assert.equal(parseIntegerLiteral('-10^18'), -(10n ** 18n));
  assert.equal(parseIntegerLiteral('10^{18}'), 10n ** 18n);
  assert.equal(parseIntegerLiteral('2e5'), 200000n);
  assert.equal(parseIntegerLiteral('1.5e5'), 150000n);
  assert.equal(parseIntegerLiteral('1e18'), 10n ** 18n);
  assert.equal(parseIntegerLiteral('2e+21'), 2n * 10n ** 21n);
  assert.equal(parseIntegerLiteral(String(2e21)), 2n * 10n ** 21n);
  assert.equal(parseIntegerLiteral('2^31'), 2147483648n);
});

test('parseIntegerLiteral accepts one plus or minus after a number', () => {
  assert.equal(parseIntegerLiteral('10^9+7'), 1000000007n);
  assert.equal(parseIntegerLiteral('2^31-1'), 2147483647n);
  assert.equal(parseIntegerLiteral('-10^9 - 1'), -1000000001n);
});

test('parseIntegerLiteral rejects non-integers and malformed text', () => {
  for (const text of ['1.5', '1e-3', '2.5×10^0', '', '   ', 'abc', '2N', 'N', '--5', '+5', '1.', '.5',
    '10^', '×10^5', '1+2+3', '10^9+N', '1,000']) {
    assert.equal(parseIntegerLiteral(text), null, text);
  }

  assert.equal(parseIntegerLiteral(5), null);
  assert.equal(parseIntegerLiteral(null), null);
  assert.equal(parseIntegerLiteral(undefined), null);
});

test('parseIntegerLiteral gives up quickly on huge exponents', () => {
  const started = Date.now();
  assert.equal(parseIntegerLiteral('10^99999999'), null);
  assert.equal(parseIntegerLiteral('1e999999999'), null);
  assert.equal(parseIntegerLiteral('9'.repeat(10000)), null);
  assert.ok(Date.now() - started < 1000);
});

test('parseExpr returns literal and variable expressions', () => {
  assert.deepEqual(parseExpr('2×10^5'), { ok: true, expr: { type: 'literal', value: 200000n } });
  assert.deepEqual(parseExpr('N'), { ok: true, expr: { type: 'var', name: 'N', offset: 0n } });
  assert.deepEqual(parseExpr('N-1'), { ok: true, expr: { type: 'var', name: 'N', offset: -1n } });
  assert.deepEqual(parseExpr(' N + 2 '), { ok: true, expr: { type: 'var', name: 'N', offset: 2n } });
  assert.deepEqual(parseExpr('max_N2-10^5'), { ok: true, expr: { type: 'var', name: 'max_N2', offset: -100000n } });
  assert.deepEqual(parseExpr('e5'), { ok: true, expr: { type: 'var', name: 'e5', offset: 0n } });
});

test('parseExpr rejects forms the first version does not support', () => {
  for (const text of ['2N', 'N*M', 'N(N-1)/2', 'N^2', '-N', 'N+-1', 'N-1-1', '_N', '1N', 'N+']) {
    const result = parseExpr(text);
    assert.equal(result.ok, false, text);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0);
  }
});

test('parseExpr explains empty, non-integer and too large input', () => {
  assert.equal(parseExpr('').ok, false);
  assert.match(parseExpr('   ').message, /空/);
  assert.equal(parseExpr(null).ok, false);
  assert.equal(parseExpr(5).ok, false);
  assert.match(parseExpr('1.5').message, /整数/);
  assert.match(parseExpr('1e-3').message, /整数/);
  assert.match(parseExpr('N-1.5').message, /整数/);
  assert.match(parseExpr('10^99999999').message, /大きすぎ/);
  assert.match(parseExpr('2N').message, /2N/);
});

test('evaluateExpr computes literals and variables with offsets', () => {
  const env = { N: 10n, M: 3n };
  assert.deepEqual(evaluateExpr('10^18', env), { ok: true, value: 10n ** 18n });
  assert.deepEqual(evaluateExpr('N', env), { ok: true, value: 10n });
  assert.deepEqual(evaluateExpr('N-1', env), { ok: true, value: 9n });
  assert.deepEqual(evaluateExpr('M + 2', env), { ok: true, value: 5n });
  assert.deepEqual(evaluateExpr('5', undefined), { ok: true, value: 5n });
});

test('evaluateExpr names an undefined variable', () => {
  const result = evaluateExpr('K+1', { N: 1n });
  assert.equal(result.ok, false);
  assert.match(result.message, /K/);
  assert.match(result.message, /定義されていません/);

  assert.equal(evaluateExpr('toString', {}).ok, false);
  assert.equal(evaluateExpr('N', null).ok, false);
  assert.equal(evaluateExpr('2N', { N: 1n }).ok, false);
});
