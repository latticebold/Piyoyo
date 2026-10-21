const test = require('node:test');
const assert = require('node:assert/strict');

const { bindSymbols, formatVariableMaxima } = require('../src/complexity/inputBinding');

function intsRow(...vars) {
  return { kind: 'ints', vars: vars.map(([name, min, max]) => ({ name, min, max })) };
}

function intListRow(name, length) {
  return { kind: 'intList', name, length, min: '1', max: '10^9', layout: 'row', distinct: false, order: 'none' };
}

function stringRow(name, maxLength) {
  return { kind: 'string', name, minLength: '', maxLength, charset: 'lower', chars: '' };
}

function gridRow(name, rows, cols) {
  return { kind: 'grid', name, rows, cols, charset: 'custom', chars: '.#' };
}

const FORMAT = {
  rows: [
    intsRow(['N', '1', '2×10^5'], ['M', '1', 'N']),
    intListRow('A', 'N'),
    stringRow('S', 'M')
  ]
};

function input(kind, targets, line = 1) {
  return { line, targets, kind, count: null };
}

test('formatVariableMaxima resolves each maximum using earlier ones', () => {
  const format = {
    rows: [
      intsRow(['N', '1', '2×10^5'], ['M', '1', 'N'], ['K', '0', 'M-1']),
      intListRow('A', 'N'),
      intsRow(['Q', '1', '10^18'])
    ]
  };
  assert.deepEqual(formatVariableMaxima(format), { ok: true, values: { N: 200000, M: 200000, K: 199999, Q: 1e18 } });
});

test('formatVariableMaxima returns numbers, not BigInt', () => {
  const result = formatVariableMaxima(FORMAT);
  assert.equal(result.ok, true);
  for (const value of Object.values(result.values)) {
    assert.equal(typeof value, 'number');
  }
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('formatVariableMaxima reports a missing format or a broken maximum', () => {
  for (const format of [null, undefined, {}, { rows: 'x' }, 5]) {
    const result = formatVariableMaxima(format);
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0);
  }

  const broken = formatVariableMaxima({ rows: [intsRow(['N', '1', 'X'])] });
  assert.equal(broken.ok, false);
  assert.match(broken.message, /N/);

  assert.deepEqual(formatVariableMaxima({ rows: [] }), { ok: true, values: {} });
});

test('bindSymbols binds by name, ignoring case', () => {
  const result = bindSymbols({ symbols: ['n', 'm'], inputs: [] }, FORMAT);
  assert.deepEqual(result.values, { n: 200000, m: 200000 });
  assert.deepEqual(result.bindings, [
    { symbol: 'n', source: 'name', formatVar: 'N', value: 200000 },
    { symbol: 'm', source: 'name', formatVar: 'M', value: 200000 }
  ]);
  assert.deepEqual(result.unbound, []);
  assert.deepEqual(result.rename, { n: 'N', m: 'M' });
});

test('bindSymbols prefers an exact-case name', () => {
  const format = { rows: [intsRow(['N', '1', '100'], ['n', '1', '7'])] };
  const result = bindSymbols({ symbols: ['n', 'N'], inputs: [] }, format);
  assert.deepEqual(result.values, { n: 7, N: 100 });
  assert.deepEqual(result.rename, { n: 'n', N: 'N' });
});

test('bindSymbols binds ints by read order from left to right', () => {
  const result = bindSymbols({ symbols: ['h', 'w'], inputs: [input('ints', ['h', 'w'])] }, FORMAT);
  assert.deepEqual(result.values, { h: 200000, w: 200000 });
  assert.deepEqual(result.bindings.map((binding) => [binding.symbol, binding.source, binding.formatVar]), [
    ['h', 'order', 'N'],
    ['w', 'order', 'M']
  ]);
  assert.deepEqual(result.rename, { h: 'N', w: 'M' });
});

test('bindSymbols lets a name win over read order', () => {
  const format = { rows: [intsRow(['N', '1', '100'], ['M', '1', '50'])] };
  const result = bindSymbols({ symbols: ['m', 'n'], inputs: [input('ints', ['m', 'n'])] }, format);
  assert.deepEqual(result.values, { m: 50, n: 100 });
  assert.deepEqual(result.bindings.map((binding) => binding.source), ['name', 'name']);
});

test('bindSymbols pairs only the overlap when ints counts differ', () => {
  const format = { rows: [intsRow(['N', '1', '100'])] };
  const result = bindSymbols({ symbols: ['h', 'w'], inputs: [input('ints', ['h', 'w'])] }, format);
  assert.deepEqual(result.values, { h: 100 });
  assert.deepEqual(result.unbound, ['w']);
});

test('bindSymbols binds |a| of an intList to the row length by read order', () => {
  const analysis = {
    symbols: ['|xs|'],
    inputs: [input('ints', ['k']), input('intList', ['xs'], 2)]
  };
  const result = bindSymbols(analysis, FORMAT);
  assert.deepEqual(result.values, { '|xs|': 200000 });
  assert.deepEqual(result.bindings, [{ symbol: '|xs|', source: 'order', formatVar: 'N', value: 200000 }]);
  assert.deepEqual(result.rename, { '|xs|': 'N' });
});

test('bindSymbols binds |s| of a string to maxLength by read order', () => {
  const format = {
    rows: [
      intsRow(['N', '1', '2×10^5'], ['K', '1', '5000']),
      stringRow('S', 'K')
    ]
  };
  const analysis = { symbols: ['|t|'], inputs: [input('ints', ['x', 'y']), input('string', ['t'], 2)] };
  const result = bindSymbols(analysis, format);
  assert.deepEqual(result.values, { '|t|': 5000 });
  assert.equal(result.bindings[0].source, 'order');
  assert.deepEqual(result.rename, { '|t|': 'K' });
});

test('bindSymbols binds |g| of read lines to the grid rows by read order', () => {
  const format = {
    rows: [
      intsRow(['H', '1', '500'], ['W', '1', '2000']),
      gridRow('C', 'H', 'W')
    ]
  };
  const analysis = { symbols: ['h', 'w', '|g|'], inputs: [input('ints', ['h', 'w']), input('lines', ['g'], 2)] };
  const result = bindSymbols(analysis, format);
  assert.deepEqual(result.values, { h: 500, w: 2000, '|g|': 500 });
  assert.deepEqual(result.bindings.map((binding) => binding.source), ['name', 'name', 'order']);
  assert.deepEqual(result.rename, { h: 'H', w: 'W', '|g|': 'H' });
});

test('bindSymbols binds |a| to a collection row with the same name', () => {
  const format = {
    rows: [
      intsRow(['N', '1', '1000'], ['M', '1', '30']),
      intListRow('A', 'N'),
      stringRow('S', 'M'),
      gridRow('G', 'M', 'N')
    ]
  };
  const result = bindSymbols({ symbols: ['|a|', '|s|', '|g|'], inputs: [] }, format);
  assert.deepEqual(result.values, { '|a|': 1000, '|s|': 30, '|g|': 30 });
  assert.deepEqual(result.bindings.map((binding) => binding.source), ['name', 'name', 'name']);
  assert.deepEqual(result.rename, { '|a|': 'N', '|s|': 'M', '|g|': 'M' });
});

test('bindSymbols binds a literal length without renaming it', () => {
  const format = { rows: [intListRow('A', '5')] };
  const result = bindSymbols({ symbols: ['|b|'], inputs: [input('intList', ['b'])] }, format);
  assert.deepEqual(result.values, { '|b|': 5 });
  assert.deepEqual(result.bindings, [{ symbol: '|b|', source: 'order', formatVar: null, value: 5 }]);
  assert.deepEqual(result.rename, {});
});

test('bindSymbols uses the shifted maximum and drops the offset from the display name', () => {
  const format = { rows: [intsRow(['N', '2', '2×10^5']), intListRow('A', 'N-1')] };
  const result = bindSymbols({ symbols: ['|a|'], inputs: [] }, format);
  assert.deepEqual(result.values, { '|a|': 199999 });
  assert.equal(result.bindings[0].formatVar, 'N');
  assert.deepEqual(result.rename, { '|a|': 'N' });
});

test('bindSymbols applies manual choices first', () => {
  const analysis = { symbols: ['n', 'm', 'k'], inputs: [input('ints', ['n', 'm'])] };
  const result = bindSymbols(analysis, FORMAT, {
    manual: {
      n: { formatVar: 'M' },
      k: { value: 123 }
    }
  });
  assert.deepEqual(result.values, { n: 200000, m: 200000, k: 123 });
  assert.deepEqual(result.bindings, [
    { symbol: 'n', source: 'manual', formatVar: 'M', value: 200000 },
    { symbol: 'm', source: 'name', formatVar: 'M', value: 200000 },
    { symbol: 'k', source: 'manual', formatVar: null, value: 123 }
  ]);
  assert.deepEqual(result.rename, { n: 'M', m: 'M' });
});

test('bindSymbols lets a manual value override a name match', () => {
  const result = bindSymbols({ symbols: ['n'], inputs: [] }, FORMAT, { manual: { n: { value: 1000 } } });
  assert.deepEqual(result.values, { n: 1000 });
  assert.equal(result.bindings[0].source, 'manual');
  assert.deepEqual(result.rename, {});
});

test('bindSymbols accepts a manual value written as text', () => {
  const result = bindSymbols({ symbols: ['q'], inputs: [] }, FORMAT, { manual: { q: { value: '2×10^5' } } });
  assert.deepEqual(result.values, { q: 200000 });
});

test('bindSymbols ignores broken manual choices and falls back', () => {
  const manual = {
    n: { formatVar: 'NOPE' },
    m: { value: -1 },
    '|a|': { value: 'abc' },
    k: null
  };
  const result = bindSymbols({ symbols: ['n', 'm', '|a|', 'k'], inputs: [] }, FORMAT, { manual });
  assert.deepEqual(result.values, { n: 200000, m: 200000, '|a|': 200000 });
  assert.deepEqual(result.bindings.map((binding) => binding.source), ['name', 'name', 'name']);
  assert.deepEqual(result.unbound, ['k']);
});

test('bindSymbols leaves unknown symbols unbound', () => {
  const result = bindSymbols({ symbols: ['n', 'q', '|zz|'], inputs: [] }, FORMAT);
  assert.deepEqual(result.values, { n: 200000 });
  assert.deepEqual(result.unbound, ['q', '|zz|']);
  assert.equal('q' in result.rename, false);
});

test('bindSymbols binds only the listed symbols', () => {
  const result = bindSymbols({ symbols: ['n'], inputs: [input('ints', ['n', 'm']), input('intList', ['a'])] }, FORMAT);
  assert.deepEqual(Object.keys(result.values), ['n']);
  assert.deepEqual(result.bindings.map((binding) => binding.symbol), ['n']);
});

test('bindSymbols without a format binds only manual values', () => {
  const analysis = { symbols: ['n', '|a|', 'm'], inputs: [input('ints', ['n']), input('intList', ['a'])] };
  const result = bindSymbols(analysis, null, { manual: { m: { value: 50 }, n: { formatVar: 'N' } } });
  assert.deepEqual(result.values, { m: 50 });
  assert.deepEqual(result.unbound, ['n', '|a|']);
  assert.deepEqual(result.bindings, [{ symbol: 'm', source: 'manual', formatVar: null, value: 50 }]);
  assert.deepEqual(result.rename, {});
});

test('bindSymbols skips mismatched kinds without shifting later rows', () => {
  const format = {
    rows: [
      intsRow(['N', '1', '100']),
      intListRow('A', 'N'),
      intsRow(['Q', '1', '7'])
    ]
  };
  const analysis = {
    symbols: ['x', '|s|', 'y'],
    inputs: [input('ints', ['x']), input('string', ['s']), input('ints', ['y'])]
  };
  const result = bindSymbols(analysis, format);
  assert.deepEqual(result.values, { x: 100, y: 7 });
  assert.deepEqual(result.unbound, ['|s|']);
});

test('bindSymbols ignores inputs beyond the last row', () => {
  const format = { rows: [intsRow(['N', '1', '100'])] };
  const analysis = {
    symbols: ['x', 'y', '|a|'],
    inputs: [input('ints', ['x']), input('ints', ['y']), input('intList', ['a']), input('unknown', [])]
  };
  const result = bindSymbols(analysis, format);
  assert.deepEqual(result.values, { x: 100 });
  assert.deepEqual(result.unbound, ['y', '|a|']);
});

test('bindSymbols still binds the other symbols when one maximum is broken', () => {
  const format = { rows: [intsRow(['N', '1', '100'], ['M', '1', 'X'])] };
  const result = bindSymbols({ symbols: ['n', 'm'], inputs: [] }, format);
  assert.deepEqual(result.values, { n: 100 });
  assert.deepEqual(result.unbound, ['m']);
});

test('bindSymbols tolerates odd arguments', () => {
  for (const analysis of [null, undefined, {}, { symbols: 'n' }, { symbols: [null, 3, 'n'], inputs: [null, 5, {}] }]) {
    const result = bindSymbols(analysis, FORMAT, undefined);
    assert.ok(result && typeof result === 'object');
    assert.ok(Array.isArray(result.bindings));
    assert.ok(Array.isArray(result.unbound));
    assert.doesNotThrow(() => JSON.stringify(result));
  }

  const result = bindSymbols({ symbols: ['n'], inputs: [] }, { rows: [null, { kind: 'ints' }, intsRow(['N', '1', '9'])] });
  assert.deepEqual(result.values, { n: 9 });
});
