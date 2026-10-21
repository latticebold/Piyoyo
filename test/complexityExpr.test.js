const test = require('node:test');
const assert = require('node:assert/strict');

const {
  add,
  classifyGrowth,
  constant,
  evaluateComplexity,
  exponential,
  formatComplexity,
  formatCount,
  isConstant,
  logOf,
  multiply,
  substitute,
  symbolComplexity,
  symbolsOf
} = require('../src/complexity/complexityExpr');

const n = symbolComplexity('n');
const m = symbolComplexity('m');
const logN = logOf('n');
const nLogN = multiply(n, logN);
const nSquared = multiply(n, n);

test('constant is O(1) and stays JSON-safe', () => {
  assert.deepEqual(constant(), { terms: [] });
  assert.equal(isConstant(constant()), true);
  assert.equal(isConstant(n), false);
  assert.equal(isConstant(null), true);
  assert.equal(formatComplexity(constant()), 'O(1)');
  assert.deepEqual(JSON.parse(JSON.stringify(nLogN)), nLogN);
});

test('symbolComplexity, logOf and exponential build single terms', () => {
  assert.deepEqual(n, { terms: [{ factors: { n: { pow: 1, log: 0 } }, exp: [] }] });
  assert.deepEqual(symbolComplexity('n', { pow: 2, log: 1 }), {
    terms: [{ factors: { n: { pow: 2, log: 1 } }, exp: [] }]
  });
  assert.deepEqual(logN, { terms: [{ factors: { n: { pow: 0, log: 1 } }, exp: [] }] });
  assert.deepEqual(exponential('n'), { terms: [{ factors: {}, exp: ['n'] }] });
  assert.deepEqual(symbolComplexity('n', { pow: 0, log: 0 }), constant());
});

test('multiply adds powers and logs and treats O(1) as the identity', () => {
  assert.deepEqual(nLogN, symbolComplexity('n', { pow: 1, log: 1 }));
  assert.deepEqual(multiply(constant(), n), n);
  assert.deepEqual(multiply(n, constant()), n);
  assert.deepEqual(multiply(n, m), multiply(m, n));
  assert.equal(formatComplexity(multiply(add(n, m), n)), 'O(N² + N·M)');
});

test('add removes dominated terms (pow first, then log)', () => {
  assert.deepEqual(add(n, nSquared), nSquared);
  assert.deepEqual(add(nLogN, n), nLogN);
  assert.deepEqual(add(nLogN, nSquared), nSquared);
  assert.deepEqual(add(n, constant()), n);
  assert.deepEqual(add(n, n), n);
  assert.deepEqual(add(logN, n), n);
  assert.deepEqual(add(exponential('n'), multiply(nSquared, n)), exponential('n'));
});

test('add keeps terms of different symbols that cannot be compared', () => {
  const sum = add(n, m);
  assert.equal(sum.terms.length, 2);
  assert.deepEqual(add(m, n), sum);
  assert.equal(formatComplexity(sum), 'O(N + M)');

  const mixed = add(multiply(n, logOf('m')), m);
  assert.equal(mixed.terms.length, 2);
  assert.equal(formatComplexity(add(multiply(n, m), nSquared)), 'O(N² + N·M)');
  assert.deepEqual(add(multiply(n, m), n), multiply(n, m));
  assert.equal(add(exponential('n'), multiply(m, m)).terms.length, 2);
});

test('substitute replaces a symbol with another complexity', () => {
  assert.deepEqual(substitute(symbolComplexity('i'), 'i', n), n);
  assert.deepEqual(substitute(multiply(symbolComplexity('i'), n), 'i', n), nSquared);
  assert.deepEqual(substitute(symbolComplexity('i', { pow: 1, log: 1 }), 'i', nSquared), symbolComplexity('n', { pow: 2, log: 1 }));
  assert.deepEqual(substitute(logOf('i'), 'i', multiply(n, m)), add(logN, logOf('m')));
  assert.deepEqual(substitute(exponential('i'), 'i', n), exponential('n'));
  assert.deepEqual(substitute(add(symbolComplexity('i'), m), 'i', constant()), m);
  assert.deepEqual(substitute(n, 'x', m), n);
});

test('formatComplexity uses superscripts, log, square roots and 2^N', () => {
  assert.equal(formatComplexity(symbolComplexity('n', { pow: 2, log: 1 })), 'O(N² log N)');
  assert.equal(formatComplexity(symbolComplexity('n', { pow: 3 })), 'O(N³)');
  assert.equal(formatComplexity(symbolComplexity('n', { pow: 1, log: 2 })), 'O(N log² N)');
  assert.equal(formatComplexity(symbolComplexity('n', { pow: 0.5 })), 'O(√N)');
  assert.equal(formatComplexity(logN), 'O(log N)');
  assert.equal(formatComplexity(exponential('n')), 'O(2^N)');
  assert.equal(formatComplexity(multiply(exponential('n'), n)), 'O(N·2^N)');
  assert.equal(formatComplexity(multiply(n, m)), 'O(N·M)');
  assert.equal(formatComplexity(symbolComplexity('|a|', { pow: 1, log: 1 })), 'O(|a| log |a|)');
  assert.equal(formatComplexity(multiply(n, symbolComplexity('|a|', { pow: 1, log: 1 }))), 'O(N·|a| log |a|)');
});

test('formatComplexity renames symbols and merges names that become equal', () => {
  const sortInLoop = multiply(n, symbolComplexity('|a|', { pow: 1, log: 1 }));
  assert.equal(formatComplexity(sortInLoop, { rename: { n: 'N', '|a|': 'N' } }), 'O(N² log N)');
  assert.equal(formatComplexity(add(n, symbolComplexity('|a|')), { rename: { '|a|': 'N' } }), 'O(N)');
  assert.equal(formatComplexity(symbolComplexity('|s|'), { rename: { '|s|': 'L' } }), 'O(L)');
  assert.equal(formatComplexity(symbolComplexity('h'), { rename: { h: 'H' } }), 'O(H)');
  assert.equal(formatComplexity(symbolComplexity('cnt')), 'O(CNT)');
});

test('formatCount omits O( ) for loop labels', () => {
  assert.equal(formatCount(n), 'N');
  assert.equal(formatCount(nLogN), 'N log N');
  assert.equal(formatCount(symbolComplexity('n', { pow: 0.5 })), '√N');
  assert.equal(formatCount(constant()), '1');
  assert.equal(formatCount(symbolComplexity('|a|'), { rename: { '|a|': 'N' } }), 'N');
});

test('evaluateComplexity uses log base 2 with a floor of 1', () => {
  assert.equal(evaluateComplexity(constant(), {}), 1);
  assert.equal(evaluateComplexity(nSquared, { n: 1000 }), 1e6);
  assert.equal(evaluateComplexity(nLogN, { n: 1024 }), 10240);
  assert.equal(evaluateComplexity(logN, { n: 1 }), 1);
  assert.equal(evaluateComplexity(add(n, m), { n: 10, m: 5 }), 15);
  assert.equal(evaluateComplexity(exponential('n'), { n: 10 }), 1024);
  assert.equal(evaluateComplexity(symbolComplexity('n', { pow: 0.5 }), { n: 100 }), 10);
  assert.equal(evaluateComplexity(exponential('n'), { n: 5000 }), Number.MAX_VALUE);
});

test('evaluateComplexity returns null when a symbol has no value', () => {
  assert.equal(evaluateComplexity(add(n, m), { n: 10 }), null);
  assert.equal(evaluateComplexity(n, {}), null);
  assert.equal(evaluateComplexity(n, { n: Number.NaN }), null);
});

test('classifyGrowth looks at one symbol and keeps the largest term', () => {
  assert.equal(classifyGrowth(constant(), 'n'), 'O(1)');
  assert.equal(classifyGrowth(logN, 'n'), 'O(log N)');
  assert.equal(classifyGrowth(n, 'n'), 'O(N)');
  assert.equal(classifyGrowth(nLogN, 'n'), 'O(N log N)');
  assert.equal(classifyGrowth(nSquared, 'n'), 'O(N²)');
  assert.equal(classifyGrowth(multiply(nSquared, n), 'n'), 'O(N³)');
  assert.equal(classifyGrowth(multiply(nSquared, logN), 'n'), 'other');
  assert.equal(classifyGrowth(symbolComplexity('n', { pow: 0.5 }), 'n'), 'other');
  assert.equal(classifyGrowth(exponential('n'), 'n'), 'other');
  assert.equal(classifyGrowth(add(multiply(m, m), n), 'n'), 'O(N)');
  assert.equal(classifyGrowth(multiply(n, symbolComplexity('|a|')), ['n', '|a|']), 'O(N²)');
});

test('symbolsOf lists every symbol in a stable order', () => {
  assert.deepEqual(symbolsOf(add(multiply(m, symbolComplexity('|a|')), add(n, exponential('k')))), ['n', 'm', 'k', '|a|']);
  assert.deepEqual(symbolsOf(constant()), []);
});

test('a symbol named __proto__ is stored as data', () => {
  const odd = symbolComplexity('__proto__');
  assert.equal(formatComplexity(odd), 'O(__PROTO__)');
  assert.equal(evaluateComplexity(odd, { ['__proto__']: 3 }), 3);
  assert.equal(evaluateComplexity(odd, {}), null);
  assert.deepEqual(symbolsOf(odd), ['__proto__']);
});
