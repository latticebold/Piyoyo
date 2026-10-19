const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHARSETS,
  LAYOUTS,
  ORDERS,
  ROW_KINDS,
  collectNames,
  createRow,
  createVar,
  getSizeVariables,
  normalizeFormat,
  validateFormat
} = require('../src/verify/inputFormat');

function designExample() {
  return {
    rows: [
      { kind: 'ints', vars: [
        { name: 'N', min: '1', max: '2×10^5' },
        { name: 'M', min: '1', max: 'N' }
      ], needsReview: false, reviewReason: '' },
      { kind: 'intList', name: 'A', length: 'N', min: '1', max: '10^9',
        layout: 'row', distinct: false, order: 'none', needsReview: false, reviewReason: '' },
      { kind: 'string', name: 'S', minLength: '', maxLength: 'M',
        charset: 'lower', chars: '', needsReview: false, reviewReason: '' }
    ]
  };
}

function intsRow(...vars) {
  return { kind: 'ints', vars: vars.map(([name, min, max]) => ({ name, min, max })) };
}

function listRow(fields) {
  return { kind: 'intList', name: 'A', length: '3', min: '1', max: '10', layout: 'row', distinct: false, order: 'none', ...fields };
}

function errorsOf(format) {
  const result = validateFormat(format);
  assert.equal(result.ok, result.errors.length === 0);
  return result.errors;
}

function assertSingleError(format, rowIndex, path, pattern) {
  const errors = errorsOf(format);
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.equal(errors[0].rowIndex, rowIndex);
  assert.equal(errors[0].path, path);
  assert.equal(typeof errors[0].message, 'string');
  if (pattern) {
    assert.match(errors[0].message, pattern);
  }
}

test('row kinds and choice lists match the design', () => {
  assert.deepEqual(ROW_KINDS, ['ints', 'intList', 'matrix', 'string', 'grid']);
  assert.deepEqual(ORDERS, ['none', 'asc', 'desc', 'strictAsc', 'strictDesc']);
  assert.deepEqual(LAYOUTS, ['row', 'column']);
  assert.deepEqual(CHARSETS, ['lower', 'upper', 'digit', 'custom']);
});

test('createRow picks unused names in the documented order', () => {
  assert.equal(createRow('ints').vars[0].name, 'N');
  assert.equal(createRow('ints', ['N']).vars[0].name, 'M');
  assert.equal(createRow('ints', ['N', 'M']).vars[0].name, 'K');
  assert.equal(createRow('intList', []).name, 'A');
  assert.equal(createRow('intList', ['A']).name, 'B');
  assert.equal(createRow('matrix', ['A', 'B']).name, 'C');
  assert.equal(createRow('string', []).name, 'S');
  assert.equal(createRow('string', ['S']).name, 'T');
  assert.equal(createRow('grid', ['S', 'T']).name, 'U');
  assert.equal(createVar(['N', 'M']).name, 'K');
  assert.equal(createRow('string', ['S', 'T', 'U', 'V']).name, 'S2');
  assert.equal(createRow('unknown'), null);
});

test('createRow defaults are valid on their own', () => {
  for (const kind of ROW_KINDS) {
    const row = createRow(kind);
    assert.equal(row.kind, kind);
    assert.equal(row.needsReview, false);
    assert.equal(row.reviewReason, '');
    const result = validateFormat({ rows: [row] });
    assert.deepEqual(result, { ok: true, errors: [] }, kind);
  }
});

test('createRow refers to existing size variables when they exist', () => {
  const ints = createRow('ints');
  const second = createVar(['N']);
  ints.vars.push(second);
  const names = ['N', 'M'];
  const list = createRow('intList', names);
  const matrix = createRow('matrix', [...names, list.name]);
  const text = createRow('string', [...names, list.name, matrix.name]);
  assert.equal(list.length, 'N');
  assert.equal(matrix.rows, 'N');
  assert.equal(matrix.cols, 'M');
  assert.equal(text.maxLength, 'N');
  assert.equal(text.minLength, '');
  const grid = createRow('grid', ['H', 'W']);
  assert.equal(grid.rows, 'H');
  assert.equal(grid.cols, 'W');
  assert.equal(grid.charset, 'custom');
  assert.equal(grid.chars, '.#');

  const format = { rows: [ints, list, matrix, text] };
  assert.deepEqual(validateFormat(format), { ok: true, errors: [] });
  assert.deepEqual(collectNames(format), ['N', 'M', 'A', 'B', 'S']);
});

test('normalizeFormat keeps a complete format unchanged', () => {
  const raw = designExample();
  const before = JSON.stringify(raw);
  const { format, warnings } = normalizeFormat(raw);
  assert.deepEqual(format, designExample());
  assert.deepEqual(warnings, []);
  assert.equal(JSON.stringify(raw), before);
  assert.notEqual(format.rows[0], raw.rows[0]);
  assert.deepEqual(validateFormat(format), { ok: true, errors: [] });
});

test('normalizeFormat survives arbitrary JSON values', () => {
  for (const raw of [null, undefined, {}]) {
    assert.deepEqual(normalizeFormat(raw), { format: { rows: [] }, warnings: [] });
  }

  for (const raw of [5, 'text', true, [], { rows: 'x' }, { rows: {} }]) {
    const { format, warnings } = normalizeFormat(raw);
    assert.deepEqual(format, { rows: [] });
    assert.equal(warnings.length, 1);
  }
});

test('normalizeFormat drops unknown rows with a warning', () => {
  const { format, warnings } = normalizeFormat({
    rows: [null, 3, 'ints', { kind: 'tree' }, { kind: 'ints', vars: [{ name: 'N', min: '1', max: '5' }] }, {}]
  });
  assert.equal(format.rows.length, 1);
  assert.equal(format.rows[0].kind, 'ints');
  assert.equal(warnings.length, 5);
  assert.ok(warnings.some((warning) => warning.includes('tree')));
});

test('normalizeFormat fills defaults and converts types', () => {
  const { format, warnings } = normalizeFormat({
    rows: [
      { kind: 'ints', vars: [{ name: ' N ', min: 1, max: 1e18 }, 'bad', { name: 'M' }] },
      { kind: 'intList', name: 'A', length: 'N', min: -5, max: 10n, distinct: 'true', order: 'sideways', layout: 7 },
      { kind: 'matrix' },
      { kind: 'string', name: 'S', maxLength: 'N', charset: 'emoji', chars: 9, needsReview: true, reviewReason: '長さが不明' },
      { kind: 'grid', name: 'G', rows: 3, cols: 4, charset: 'custom', chars: '.#' }
    ]
  });

  assert.deepEqual(format.rows[0], {
    kind: 'ints',
    vars: [{ name: 'N', min: '1', max: '1000000000000000000' }, { name: 'M', min: '', max: '' }],
    needsReview: false,
    reviewReason: ''
  });
  assert.deepEqual(format.rows[1], {
    kind: 'intList', name: 'A', length: 'N', min: '-5', max: '10',
    layout: 'row', distinct: true, order: 'none', needsReview: false, reviewReason: ''
  });
  assert.deepEqual(format.rows[2], {
    kind: 'matrix', name: '', rows: '', cols: '', min: '', max: '', needsReview: false, reviewReason: ''
  });
  assert.deepEqual(format.rows[3], {
    kind: 'string', name: 'S', minLength: '', maxLength: 'N', charset: 'lower', chars: '',
    needsReview: true, reviewReason: '長さが不明'
  });
  assert.deepEqual(format.rows[4], {
    kind: 'grid', name: 'G', rows: '3', cols: '4', charset: 'custom', chars: '.#', needsReview: false, reviewReason: ''
  });
  assert.equal(warnings.length, 4);
});

test('validateFormat accepts the design example and valid forward references', () => {
  assert.deepEqual(validateFormat(designExample()), { ok: true, errors: [] });
  assert.deepEqual(validateFormat({ rows: [
    intsRow(['N', '2', '10'], ['K', '1', 'N-1']),
    listRow({ length: 'N-1', min: '1', max: 'N', order: 'strictAsc' }),
    listRow({ name: 'B', length: 'K', min: '-10^18', max: '10^18', distinct: true, layout: 'column' }),
    { kind: 'matrix', name: 'C', rows: 'N', cols: 'K+1', min: '0', max: '0' },
    { kind: 'string', name: 'S', minLength: '1', maxLength: 'N', charset: 'digit', chars: '' },
    { kind: 'grid', name: 'G', rows: 'N', cols: 'N', charset: 'upper', chars: '' }
  ] }), { ok: true, errors: [] });
});

test('validateFormat rejects a missing or empty format', () => {
  for (const format of [null, undefined, 5, {}, { rows: 'x' }]) {
    const result = validateFormat(format);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].rowIndex, -1);
    assert.equal(result.errors[0].path, 'rows');
  }

  assertSingleError({ rows: [] }, -1, 'rows');
});

test('validateFormat survives broken rows', () => {
  const errors = errorsOf({ rows: [null, { kind: 'tree' }, { kind: 'ints', vars: 'x' }, { kind: 'ints', vars: [5] },
    { kind: 'intList' }, { kind: 'string' }, { kind: 'grid' }, { kind: 'matrix', rows: null }] });
  const paths = errors.map((error) => `${error.rowIndex}:${error.path}`);
  assert.ok(paths.includes('0:'));
  assert.ok(paths.includes('1:kind'));
  assert.ok(paths.includes('2:vars'));
  assert.ok(paths.includes('3:vars.0'));
  assert.ok(paths.includes('4:length'));
  assert.ok(paths.includes('4:layout'));
  assert.ok(paths.includes('4:distinct'));
  assert.ok(paths.includes('5:maxLength'));
  assert.ok(!paths.includes('5:minLength'));
  assert.ok(paths.includes('6:charset'));
  assert.ok(paths.includes('7:rows'));
  assertSingleError({ rows: [{ kind: 'ints', vars: [] }] }, 0, 'vars');
});

test('validateFormat reports empty and invalid names', () => {
  assertSingleError({ rows: [intsRow(['', '1', '5'])] }, 0, 'vars.0.name', /入力/);
  assertSingleError({ rows: [intsRow(['N', '1', '5'], ['1N', '1', '5'])] }, 0, 'vars.1.name', /1N/);
  assertSingleError({ rows: [listRow({ name: 'A-B' })] }, 0, 'name');
  assertSingleError({ rows: [listRow({ name: '   ' })] }, 0, 'name');
});

test('validateFormat reports duplicate names across all rows', () => {
  assertSingleError({ rows: [intsRow(['N', '1', '5'], ['N', '1', '5'])] }, 0, 'vars.1.name', /N/);
  assertSingleError({ rows: [intsRow(['N', '1', '5']), listRow({ name: 'N' })] }, 1, 'name', /N/);
  assertSingleError({ rows: [listRow({ name: 'A' }), listRow({ name: 'A' })] }, 1, 'name');
  assertSingleError({ rows: [listRow({ name: 'A' }), intsRow(['A', '1', '5'])] }, 1, 'vars.0.name');
});

test('validateFormat reports invalid expressions with their path', () => {
  assertSingleError({ rows: [intsRow(['N', '1', '2N'])] }, 0, 'vars.0.max', /2N/);
  assertSingleError({ rows: [intsRow(['N', '1', '5']), listRow({ length: 'N*2' })] }, 1, 'length');
  assertSingleError({ rows: [listRow({ min: '1.5' })] }, 0, 'min', /整数/);
  assertSingleError({ rows: [listRow({ max: '' })] }, 0, 'max', /入力/);
});

test('validateFormat reports undefined and not-yet-defined variables', () => {
  assertSingleError({ rows: [listRow({ length: 'X' })] }, 0, 'length', /X.*定義されていません/);
  assertSingleError({ rows: [listRow({ length: 'N' }), intsRow(['N', '1', '5'])] }, 0, 'length', /まだ使えません/);
  assertSingleError({ rows: [intsRow(['N', '1', 'M'], ['M', '1', '10'])] }, 0, 'vars.0.max', /M/);
  assertSingleError({ rows: [intsRow(['N', '1', 'N'])] }, 0, 'vars.0.max', /まだ使えません/);
  assertSingleError({ rows: [listRow({ name: 'A' }), listRow({ name: 'B', length: 'A' })] }, 1, 'length', /変数ではない/);
});

test('validateFormat reports min greater than max when it can never work', () => {
  assertSingleError({ rows: [listRow({ min: '10', max: '5' })] }, 0, 'max', /最小値が最大値/);
  assertSingleError({ rows: [intsRow(['N', '10', '5'])] }, 0, 'vars.0.max', /最小値が最大値/);
  assertSingleError({ rows: [intsRow(['N', '1', '10'], ['M', 'N+20', '5'])] }, 0, 'vars.1.max');
  assertSingleError({ rows: [intsRow(['N', '1', '10']), listRow({ min: 'N', max: 'N-1' })] }, 1, 'max');
  assertSingleError({ rows: [intsRow(['N', '1', '10']), { kind: 'string', name: 'S', minLength: '5', maxLength: '3', charset: 'lower', chars: '' }] }, 1, 'maxLength');

  // These can work for some N, so the generator decides at run time.
  assert.equal(validateFormat({ rows: [intsRow(['N', '1', '10'], ['M', 'N', '5'])] }).ok, true);
  assert.equal(validateFormat({ rows: [intsRow(['N', '1', '10']), listRow({ min: 'N', max: 'N+1' })] }).ok, true);
});

test('validateFormat reports negative sizes only when they are always negative', () => {
  assertSingleError({ rows: [listRow({ length: '-1' })] }, 0, 'length', /負/);
  assertSingleError({ rows: [{ kind: 'matrix', name: 'A', rows: '-2', cols: '2', min: '1', max: '5' }] }, 0, 'rows');
  assertSingleError({ rows: [{ kind: 'grid', name: 'G', rows: '2', cols: '-1', charset: 'lower', chars: '' }] }, 0, 'cols');
  assertSingleError({ rows: [{ kind: 'string', name: 'S', minLength: '', maxLength: '-3', charset: 'lower', chars: '' }] }, 0, 'maxLength');
  assertSingleError({ rows: [intsRow(['N', '1', '10']), listRow({ length: 'N-20' })] }, 1, 'length');

  assert.equal(validateFormat({ rows: [intsRow(['N', '1', '10']), listRow({ length: 'N-2' })] }).ok, true);
  assert.equal(validateFormat({ rows: [intsRow(['N', '1', '10'], ['K', '1', 'N-1'])] }).ok, true);
});

test('validateFormat checks custom characters', () => {
  assertSingleError({ rows: [{ kind: 'string', name: 'S', minLength: '', maxLength: '3', charset: 'custom', chars: '' }] }, 0, 'chars');
  assertSingleError({ rows: [{ kind: 'grid', name: 'G', rows: '2', cols: '2', charset: 'custom', chars: '. #' }] }, 0, 'chars', /空白/);
  assert.equal(validateFormat({ rows: [{ kind: 'grid', name: 'G', rows: '2', cols: '2', charset: 'lower', chars: '' }] }).ok, true);
});

test('validateFormat reports impossible distinct values', () => {
  assertSingleError({ rows: [listRow({ length: '5', min: '1', max: '3', order: 'strictAsc' })] }, 0, 'order', /3 種類/);
  assertSingleError({ rows: [listRow({ length: '5', min: '1', max: '3', order: 'strictDesc' })] }, 0, 'order');
  assertSingleError({ rows: [listRow({ length: '5', min: '1', max: '3', distinct: true })] }, 0, 'distinct');
  assertSingleError({ rows: [intsRow(['N', '10', '20']), listRow({ length: 'N', min: '1', max: '5', distinct: true })] }, 1, 'distinct');
  assertSingleError({ rows: [intsRow(['N', '1', '20']), listRow({ length: '5', min: 'N', max: 'N+2', distinct: true })] }, 1, 'distinct');

  assert.equal(validateFormat({ rows: [listRow({ length: '5', min: '1', max: '3', order: 'asc' })] }).ok, true);
  assert.equal(validateFormat({ rows: [listRow({ length: '3', min: '1', max: '3', order: 'strictAsc' })] }).ok, true);
  assert.equal(validateFormat({ rows: [intsRow(['N', '1', '20']), listRow({ length: 'N', min: '1', max: '10', distinct: true })] }).ok, true);
});

test('validateFormat reports unknown choices', () => {
  assertSingleError({ rows: [listRow({ order: 'random' })] }, 0, 'order');
  assertSingleError({ rows: [listRow({ layout: 'diagonal' })] }, 0, 'layout');
  assertSingleError({ rows: [listRow({ distinct: 'yes' })] }, 0, 'distinct');
  assertSingleError({ rows: [{ kind: 'string', name: 'S', minLength: '', maxLength: '3', charset: 'kanji', chars: '' }] }, 0, 'charset');
  assertSingleError({ rows: [{ kind: 'grid', name: 'G', rows: '1', cols: '1', charset: null, chars: '' }] }, 0, 'charset');
});

test('validateFormat lists errors in row order', () => {
  const errors = errorsOf({ rows: [listRow({ min: 'x1' }), listRow({ name: 'A', max: '' })] });
  assert.deepEqual(errors.map((error) => [error.rowIndex, error.path]), [[0, 'min'], [1, 'name'], [1, 'max']]);
});

test('getSizeVariables collects variables used by size fields only', () => {
  assert.deepEqual(getSizeVariables(designExample()), new Set(['N', 'M']));
  assert.deepEqual(getSizeVariables({ rows: [
    intsRow(['H', '1', '5'], ['W', '1', '5'], ['K', '1', '5'], ['L', '1', '5'], ['X', '1', '5']),
    { kind: 'matrix', name: 'A', rows: 'H', cols: 'W+1', min: '1', max: 'X' },
    { kind: 'string', name: 'S', minLength: 'K-1', maxLength: 'L', charset: 'lower', chars: '' },
    { kind: 'grid', name: 'G', rows: '3', cols: 'W', charset: 'lower', chars: '' }
  ] }), new Set(['H', 'W', 'K', 'L']));
  assert.deepEqual(getSizeVariables(null), new Set());
  assert.deepEqual(getSizeVariables({ rows: [null, { kind: 'intList', length: 5 }, { kind: 'toString' }] }), new Set());
  assert.deepEqual(getSizeVariables({ rows: [{ kind: 'ints', vars: 'x' }, { kind: 'ints', vars: [null, { name: 5 }] }] }), new Set());
});

test('getSizeVariables adds variables that bound a size variable', () => {
  assert.deepEqual(getSizeVariables({ rows: [
    intsRow(['N', '1', '2×10^5'], ['M', '1', 'N'], ['K', '1', 'N']),
    listRow({ length: 'M' })
  ] }), new Set(['M', 'N']));

  assert.deepEqual(getSizeVariables({ rows: [
    intsRow(['A', '1', '5'], ['B', 'A', '10'], ['C', '1', 'B-1'], ['X', '1', '9'], ['Y', 'X', '20']),
    listRow({ name: 'L', length: 'C', min: '1', max: 'Y' })
  ] }), new Set(['C', 'B', 'A']));

  assert.deepEqual(getSizeVariables({ rows: [
    intsRow(['N', '1', '10']),
    intsRow(['M', 'N', '20']),
    { kind: 'grid', name: 'G', rows: 'M', cols: '3', charset: 'lower', chars: '' }
  ] }), new Set(['M', 'N']));
});
