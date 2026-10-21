const test = require('node:test');
const assert = require('node:assert/strict');

const { createRng, generateExample, generateInput } = require('../src/verify/inputGenerator');

const SEEDS = Array.from({ length: 200 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0);
const SIZE_FIELDS = { intList: ['length'], matrix: ['rows', 'cols'], string: ['minLength', 'maxLength'], grid: ['rows', 'cols'] };
const CHARSET_PATTERNS = { lower: /^[a-z]*$/, upper: /^[A-Z]*$/, digit: /^[0-9]*$/ };

// ---- An independent reader for generated inputs (does not use the generator's helpers) ----

function evalBound(text, env) {
  const source = String(text).replace(/\s+/g, '');
  let match = /^(-?)(\d+)(?:[×*]10\^(\d+))?$/.exec(source);
  if (match) {
    return (match[1] ? -1n : 1n) * BigInt(match[2]) * 10n ** BigInt(match[3] || 0);
  }

  match = /^(-?)10\^(\d+)$/.exec(source);
  if (match) {
    return (match[1] ? -1n : 1n) * 10n ** BigInt(match[2]);
  }

  match = /^([A-Za-z]\w*)([+-]\d+)?$/.exec(source);
  if (match && typeof env[match[1]] === 'bigint') {
    return env[match[1]] + BigInt(match[2] || 0);
  }

  throw new Error(`test helper cannot read ${text}`);
}

function leadingName(text) {
  const match = /^\s*([A-Za-z]\w*)/.exec(text || '');
  return match ? match[1] : null;
}

function sizeVariablesOf(format) {
  const names = new Set();
  for (const row of format.rows) {
    for (const field of SIZE_FIELDS[row.kind] || []) {
      const name = leadingName(row[field]);
      if (name) {
        names.add(name);
      }
    }
  }

  // Variables bounding a size variable are size variables too.
  const vars = format.rows.filter((row) => row.kind === 'ints').flatMap((row) => row.vars);
  let grew = true;
  while (grew) {
    grew = false;
    for (const variable of vars) {
      if (!names.has(variable.name)) {
        continue;
      }

      for (const name of [leadingName(variable.min), leadingName(variable.max)]) {
        if (name && !names.has(name)) {
          names.add(name);
          grew = true;
        }
      }
    }
  }

  return names;
}

function bigMin(a, b) {
  return a < b ? a : b;
}

function bigMax(a, b) {
  return a > b ? a : b;
}

function cappedTop(lo, hi, sizeCap) {
  return sizeCap === undefined || sizeCap === null ? hi : bigMin(hi, bigMax(lo, BigInt(sizeCap)));
}

function capWindow(lo, hi, valueCap) {
  if (valueCap === undefined || valueCap === null) {
    return [lo, hi];
  }

  const cap = BigInt(valueCap);
  if (lo > 0n) {
    return [lo, bigMin(hi, lo + cap)];
  }

  if (hi < 0n) {
    return [bigMax(lo, hi - cap), hi];
  }

  return [bigMax(lo, -cap), bigMin(hi, cap)];
}

function readInts(line, count) {
  if (count === 0) {
    assert.equal(line, '');
    return [];
  }

  const tokens = line.split(' ');
  assert.equal(tokens.length, count, `expected ${count} numbers in "${line.slice(0, 80)}"`);
  return tokens.map((token) => {
    assert.match(token, /^(0|-?[1-9]\d*)$/);
    return BigInt(token);
  });
}

function assertInRange(value, lo, hi, what) {
  assert.ok(value >= lo && value <= hi, `${what}: ${value} is outside [${lo}, ${hi}]`);
}

function assertCharset(text, row) {
  if (row.charset === 'custom') {
    for (const char of text) {
      assert.ok(row.chars.includes(char), `unexpected character ${char}`);
    }
  } else {
    assert.match(text, CHARSET_PATTERNS[row.charset]);
  }
}

function checkValues(values, lo, hi, row, options) {
  const distinct = row.distinct === true || row.order === 'strictAsc' || row.order === 'strictDesc';
  const [windowLo, windowHi] = capWindow(lo, hi, options.valueCap);
  const windowFits = !distinct || windowHi - windowLo + 1n >= BigInt(values.length);
  for (const value of values) {
    assertInRange(value, lo, hi, row.name);
    if (windowFits) {
      assertInRange(value, windowLo, windowHi, `${row.name} with valueCap`);
    }
  }

  if (distinct) {
    assert.equal(new Set(values.map(String)).size, values.length, `${row.name} has repeated values`);
  }

  for (let index = 1; index < values.length; index += 1) {
    const [before, after] = [values[index - 1], values[index]];
    if (row.order === 'asc') {
      assert.ok(before <= after, `${row.name} is not ascending`);
    } else if (row.order === 'desc') {
      assert.ok(before >= after, `${row.name} is not descending`);
    } else if (row.order === 'strictAsc') {
      assert.ok(before < after, `${row.name} is not strictly ascending`);
    } else if (row.order === 'strictDesc') {
      assert.ok(before > after, `${row.name} is not strictly descending`);
    }
  }
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function charCountOf(row) {
  return row.charset === 'custom' ? new Set(row.chars).size : { lower: 26, upper: 26, digit: 10 }[row.charset];
}

// How many different strings have a length in [lo, hi]; stops counting at `cap`.
function stringsUpTo(charCount, lo, hi, cap) {
  let total = 0n;
  for (let length = hi; length >= lo && total < cap; length -= 1n) {
    let count = 1n;
    for (let step = 0n; step < length && count < cap; step += 1n) {
      count *= BigInt(charCount);
    }

    total += count;
  }

  return total;
}

function checkGridLines(grid, row, minCols, cols, options) {
  const top = cappedTop(minCols, cols, options.sizeCap);
  const low = options.mode === 'max' ? top : minCols;
  const lengths = grid.map((line) => BigInt(line.length));
  // Distinct lines may use longer or shorter lines only when the capped range has too few strings.
  const fits = row.distinct !== true || stringsUpTo(charCountOf(row), low, top, BigInt(grid.length)) >= BigInt(grid.length);
  if (fits) {
    lengths.forEach((length) => assertInRange(length, low, top, `${row.name} capped line length`));
  }

  if (row.distinct === true) {
    assert.equal(new Set(grid).size, grid.length, `${row.name} has repeated lines`);
  } else if (options.boundaryRate === 1 && grid.length > 0) {
    const oneChar = new Set(grid.join('')).size <= 1;
    const allMin = lengths.every((length) => length === minCols);
    const allMax = lengths.every((length) => length === top);
    assert.ok(oneChar || allMin || allMax, `${row.name} is not a boundary pattern`);
  }
}

function checkInput(format, result, options = {}) {
  assert.equal(result.ok, true, result.message);
  const { input } = result;
  assert.equal(typeof input, 'string');
  assert.ok(input.endsWith('\n'), 'input must end with a newline');
  assert.ok(!input.includes('\r'));
  const lines = input.slice(0, -1).split('\n');
  let cursor = 0;
  const nextLine = () => {
    assert.ok(cursor < lines.length, 'input has too few lines');
    const line = lines[cursor];
    cursor += 1;
    return line;
  };
  const sizeVars = sizeVariablesOf(format);
  const isMax = options.mode === 'max';
  const allBoundary = options.boundaryRate === 1;
  const env = {};
  const parsed = [];

  for (const row of format.rows) {
    if (row.kind === 'ints') {
      const values = readInts(nextLine(), row.vars.length);
      row.vars.forEach((variable, index) => {
        const value = values[index];
        const lo = evalBound(variable.min, env);
        const hi = evalBound(variable.max, env);
        assertInRange(value, lo, hi, variable.name);
        if (sizeVars.has(variable.name)) {
          const top = cappedTop(lo, hi, options.sizeCap);
          assert.ok(value <= top, `${variable.name}=${value} is above the size cap ${top}`);
          if (isMax) {
            assert.equal(value, top, `${variable.name} must be at its maximum`);
          } else if (allBoundary) {
            assert.ok(value === lo || value === top, `${variable.name}=${value} is not a boundary`);
          }
        } else {
          const [windowLo, windowHi] = capWindow(lo, hi, options.valueCap);
          assertInRange(value, windowLo, windowHi, `${variable.name} with valueCap`);
          if (allBoundary) {
            assert.ok(value === windowLo || value === windowHi, `${variable.name}=${value} is not a boundary`);
          }
        }

        env[variable.name] = value;
      });
      parsed.push({ row, values });
    } else if (row.kind === 'intList') {
      const length = Number(evalBound(row.length, env));
      const lo = evalBound(row.min, env);
      const hi = evalBound(row.max, env);
      let values;
      if (row.layout === 'column') {
        values = [];
        for (let index = 0; index < length; index += 1) {
          values.push(readInts(nextLine(), 1)[0]);
        }
      } else {
        values = readInts(nextLine(), length);
      }

      checkValues(values, lo, hi, row, options);
      parsed.push({ row, values, lo, hi });
    } else if (row.kind === 'matrix') {
      const rows = Number(evalBound(row.rows, env));
      const cols = Number(evalBound(row.cols, env));
      const lo = evalBound(row.min, env);
      const hi = evalBound(row.max, env);
      const values = [];
      for (let r = 0; r < rows; r += 1) {
        values.push(...readInts(nextLine(), cols));
      }

      checkValues(values, lo, hi, row, options);
      parsed.push({ row, values, lo, hi, rows, cols });
    } else if (row.kind === 'string') {
      const maxLength = evalBound(row.maxLength, env);
      const minLength = row.minLength.trim() === '' ? maxLength : evalBound(row.minLength, env);
      const text = nextLine();
      const length = BigInt(text.length);
      assertInRange(length, minLength, maxLength, `${row.name} length`);
      const top = cappedTop(minLength, maxLength, options.sizeCap);
      assert.ok(length <= top, `${row.name} is longer than the size cap`);
      if (isMax) {
        assert.equal(length, top, `${row.name} must have its maximum length`);
      }

      assertCharset(text, row);
      parsed.push({ row, text });
    } else if (row.kind === 'grid') {
      const rows = Number(evalBound(row.rows, env));
      const cols = evalBound(row.cols, env);
      const minCols = isBlank(row.minCols) ? cols : evalBound(row.minCols, env);
      const grid = [];
      for (let r = 0; r < rows; r += 1) {
        const line = nextLine();
        assertInRange(BigInt(line.length), minCols, cols, `${row.name} line length`);
        assertCharset(line, row);
        grid.push(line);
      }

      checkGridLines(grid, row, minCols, cols, options);
      parsed.push({ row, grid, minCols, cols });
    } else {
      throw new Error(`unknown kind ${row.kind}`);
    }
  }

  assert.equal(cursor, lines.length, 'input has extra lines');
  const expectedValues = {};
  for (const [name, value] of Object.entries(env)) {
    expectedValues[name] = value.toString();
  }

  assert.deepEqual(result.values, expectedValues);
  return { env, parsed };
}

function runSeeds(format, options, seeds = SEEDS) {
  return seeds.map((seed) => {
    const fullOptions = { ...options, seed };
    const result = generateInput(format, fullOptions);
    return { result, ...checkInput(format, result, fullOptions) };
  });
}

function ints(...vars) {
  return { kind: 'ints', vars: vars.map(([name, min, max]) => ({ name, min, max })) };
}

function list(name, length, min, max, extra = {}) {
  return { kind: 'intList', name, length, min, max, layout: 'row', distinct: false, order: 'none', ...extra };
}

function text(name, minLength, maxLength, charset, chars = '') {
  return { kind: 'string', name, minLength, maxLength, charset, chars };
}

function designExample() {
  return {
    rows: [
      ints(['N', '1', '2×10^5'], ['M', '1', 'N']),
      list('A', 'N', '1', '10^9'),
      text('S', '', 'M', 'lower')
    ]
  };
}

function bigRangeFormat() {
  return {
    rows: [
      ints(['X', '-10^18', '10^18'], ['N', '1', '20']),
      list('A', 'N', '-10^18', '10^18'),
      { kind: 'matrix', name: 'B', rows: 'N', cols: '2', min: '-10^18', max: '-10^17' }
    ]
  };
}

function orderFormat() {
  return {
    rows: [
      ints(['N', '1', '30']),
      list('A', 'N', '1', '10', { order: 'asc' }),
      list('B', 'N', '-5', '5', { order: 'desc' }),
      list('C', 'N', '1', '40', { order: 'strictAsc' }),
      list('D', 'N', '-50', '-10', { order: 'strictDesc' }),
      list('E', 'N', '0', 'N-1', { distinct: true }),
      list('F', 'N', '1', '10^18', { distinct: true, layout: 'column' })
    ]
  };
}

function textFormat() {
  return {
    rows: [
      ints(['H', '1', '10'], ['W', '1', '10'], ['L', '0', '12']),
      { kind: 'grid', name: 'G', rows: 'H', cols: 'W', charset: 'custom', chars: '.#' },
      text('S', '', 'W', 'upper'),
      text('T', '1', 'L+3', 'digit'),
      text('U', '', '5', 'custom', 'aab'),
      text('V', '', 'L', 'lower')
    ]
  };
}

// ---- createRng ----

test('createRng repeats the same sequence for the same seed', () => {
  const first = createRng(12345);
  const second = createRng(12345);
  const third = createRng(12346);
  const a = Array.from({ length: 50 }, () => first.nextUint32());
  const b = Array.from({ length: 50 }, () => second.nextUint32());
  const c = Array.from({ length: 50 }, () => third.nextUint32());
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const value of a) {
    assert.ok(Number.isInteger(value) && value >= 0 && value < 2 ** 32);
  }

  assert.notDeepEqual(
    Array.from({ length: 5 }, ((rng) => () => rng.nextUint32())(createRng(0))),
    Array.from({ length: 5 }, ((rng) => () => rng.nextUint32())(createRng(4294967295)))
  );
});

test('createRng int stays inside small and huge ranges', () => {
  const rng = createRng(7);
  const ranges = [
    [0n, 0n], [5n, 5n], [-3n, 3n], [1n, 10n ** 9n],
    [0n, 2n ** 32n - 1n], [0n, 2n ** 32n], [-(10n ** 18n), 10n ** 18n], [0n, 2n ** 64n], [2n ** 100n, 2n ** 100n + 7n]
  ];
  for (const [lo, hi] of ranges) {
    for (let index = 0; index < 2000; index += 1) {
      const value = rng.int(lo, hi);
      assert.equal(typeof value, 'bigint');
      assertInRange(value, lo, hi, 'rng.int');
    }
  }
});

test('createRng int is close to uniform', () => {
  const rng = createRng(99);
  const counts = [0, 0, 0];
  for (let index = 0; index < 30000; index += 1) {
    counts[Number(rng.int(0n, 2n))] += 1;
  }

  for (const count of counts) {
    assert.ok(Math.abs(count - 10000) < 600, `counts ${counts}`);
  }

  const limit = 10n ** 18n;
  let lowerHalf = 0;
  let negative = 0;
  let large = 0;
  for (let index = 0; index < 20000; index += 1) {
    if (rng.int(0n, limit) < limit / 2n) {
      lowerHalf += 1;
    }

    const value = rng.int(-limit, limit);
    if (value < 0n) {
      negative += 1;
    }

    if (value > limit / 10n || value < -limit / 10n) {
      large += 1;
    }
  }

  assert.ok(Math.abs(lowerHalf - 10000) < 600, `lower half ${lowerHalf}`);
  assert.ok(Math.abs(negative - 10000) < 600, `negative ${negative}`);
  assert.ok(large > 17000, `large ${large}`);
});

test('createRng chance follows the probability', () => {
  const rng = createRng(3);
  let hits = 0;
  for (let index = 0; index < 20000; index += 1) {
    assert.equal(rng.chance(0), false);
    assert.equal(rng.chance(1), true);
    if (rng.chance(0.25)) {
      hits += 1;
    }
  }

  assert.ok(Math.abs(hits - 5000) < 400, `hits ${hits}`);
});

// ---- generateInput: shape and ranges ----

test('generateInput follows the design example with small caps', () => {
  const format = designExample();
  const runs = runSeeds(format, { sizeCap: 8, valueCap: 10, boundaryRate: 0.2 });
  const sizes = new Set(runs.map((run) => run.env.N));
  assert.ok(sizes.size >= 6, 'N should vary');
  runSeeds(format, { sizeCap: 50, boundaryRate: 0.2 });
});

test('generateInput handles values up to 10^18 exactly', () => {
  const format = bigRangeFormat();
  for (const options of [{}, { boundaryRate: 0.5 }, { valueCap: 1000 }]) {
    runSeeds(format, options);
  }

  const runs = runSeeds(format, {});
  const xs = runs.map((run) => run.env.X);
  assert.ok(xs.some((x) => x > 10n ** 17n));
  assert.ok(xs.some((x) => x < -(10n ** 17n)));
  const elements = runs.flatMap((run) => run.parsed[1].values);
  assert.ok(elements.some((value) => value.toString().length >= 18));
});

test('generateInput keeps distinct values and every order', () => {
  const format = orderFormat();
  for (const options of [{}, { valueCap: 3, boundaryRate: 0.5 }, { mode: 'max' }, { boundaryRate: 1 }, { sizeCap: 4 }]) {
    const runs = runSeeds(format, options);
    for (const run of runs) {
      const permutation = run.parsed[5].values.map(Number).sort((a, b) => a - b);
      assert.deepEqual(permutation, Array.from({ length: permutation.length }, (_, index) => index));
    }
  }
});

test('generateInput builds strings and grids from the chosen characters', () => {
  const format = textFormat();
  for (const options of [{}, { sizeCap: 4, boundaryRate: 0.3 }, { mode: 'max' }]) {
    runSeeds(format, options);
  }

  const runs = runSeeds(format, {});
  const gridText = runs.map((run) => run.parsed[1].grid.join('')).join('');
  assert.ok(gridText.includes('.') && gridText.includes('#'));
  const customText = runs.map((run) => run.parsed[4].text).join('');
  assert.ok(customText.includes('a') && customText.includes('b'));
  assert.ok(runs.some((run) => run.parsed[3].text.length !== run.parsed[2].text.length));
});

function grid(name, rows, minCols, cols, charset, chars = '', distinct = false) {
  return { kind: 'grid', name, rows, minCols, cols, charset, chars, distinct };
}

function lineLengths(run, rowIndex) {
  return run.parsed[rowIndex].grid.map((line) => line.length);
}

test('generateInput picks each grid line length between minCols and cols', () => {
  const format = {
    rows: [
      ints(['H', '5', '8'], ['W', '3', '10']),
      grid('G', 'H', '1', 'W', 'lower'),
      grid('D', '4', 'H-4', '6', 'digit')
    ]
  };
  for (const options of [{}, { boundaryRate: 0.3 }, { valueCap: 2 }]) {
    runSeeds(format, options);
  }

  const runs = runSeeds(format, {});
  assert.ok(runs.some((run) => new Set(lineLengths(run, 1)).size > 1), 'lengths should vary inside one input');
  const seen = new Set(runs.flatMap((run) => lineLengths(run, 1)));
  assert.ok(seen.has(1) && seen.has(10), 'both ends should appear');
  assert.ok(new Set(runs.map((run) => lineLengths(run, 1).join(','))).size > 150);
});

test('generateInput keeps grids fixed-width when minCols is empty or missing', () => {
  const oldGrid = { kind: 'grid', name: 'G', rows: 'H', cols: 'W', charset: 'custom', chars: '.#' };
  const oldFormat = { rows: [ints(['H', '1', '6'], ['W', '1', '6']), oldGrid] };
  const newFormat = { rows: [ints(['H', '1', '6'], ['W', '1', '6']), { ...oldGrid, minCols: '', distinct: false }] };
  for (const run of runSeeds(oldFormat, { boundaryRate: 0.3 })) {
    for (const length of lineLengths(run, 1)) {
      assert.equal(BigInt(length), run.env.W);
    }
  }

  for (const seed of SEEDS.slice(0, 50)) {
    assert.deepEqual(generateInput(oldFormat, { seed, boundaryRate: 0.3 }), generateInput(newFormat, { seed, boundaryRate: 0.3 }));
  }
});

test('generateInput makes every grid line cols long in max mode', () => {
  const format = {
    rows: [
      ints(['H', '2', '6'], ['W', '3', '10']),
      grid('G', 'H', '1', 'W', 'lower'),
      grid('D', 'H', '0', '7', 'custom', '.#', true)
    ]
  };
  for (const run of runSeeds(format, { mode: 'max' }, SEEDS.slice(0, 50))) {
    assert.deepEqual(lineLengths(run, 1), [10, 10, 10, 10, 10, 10]);
    assert.deepEqual(lineLengths(run, 2), [7, 7, 7, 7, 7, 7]);
  }
});

test('generateInput sizeCap caps grid line lengths', () => {
  const format = {
    rows: [
      ints(['W', '1', '50']),
      grid('G', '6', '1', 'W', 'lower'),
      grid('L', '6', '2', '100', 'upper')
    ]
  };
  for (const run of runSeeds(format, { sizeCap: 4 })) {
    assert.ok(run.env.W <= 4n);
    assert.ok(lineLengths(run, 1).every((length) => length <= 4));
    assert.ok(lineLengths(run, 2).every((length) => length >= 2 && length <= 4));
  }

  for (const run of runSeeds(format, { mode: 'max', sizeCap: 4 }, SEEDS.slice(0, 30))) {
    assert.ok(lineLengths(run, 2).every((length) => length === 4));
  }
});

test('generateInput keeps distinct grid lines different', () => {
  const format = {
    rows: [
      ints(['H', '1', '12']),
      grid('A', 'H', '1', '6', 'custom', '.#', true),
      grid('B', '14', '1', '3', 'custom', '.#', true),
      grid('C', '8', '', '3', 'custom', '#.', true),
      grid('D', '50', '1', '5', 'lower', '', true),
      grid('E', '5', '0', '10', 'custom', 'x', true)
    ]
  };
  for (const options of [{}, { sizeCap: 2 }, { sizeCap: 3, boundaryRate: 0.5 }, { boundaryRate: 1 }, { mode: 'max' }]) {
    const runs = runSeeds(format, options);
    for (const run of runs) {
      const all = ['.', '#', '..', '.#', '#.', '##'];
      for (const a of ['.', '#']) {
        for (const b of ['.', '#']) {
          all.push(`${a}${b}.`, `${a}${b}#`);
        }
      }

      assert.deepEqual([...run.parsed[2].grid].sort(), all.sort());
      assert.equal(new Set(run.parsed[3].grid).size, 8);
    }
  }
});

test('generateInput widens the capped length range for distinct grid lines', () => {
  const format = { rows: [grid('G', '8', '1', '3', 'custom', '.#', true)] };
  const lengths = new Set();
  for (const run of runSeeds(format, { sizeCap: 2 })) {
    lineLengths(run, 0).forEach((length) => lengths.add(length));
    assert.ok(lineLengths(run, 0).filter((length) => length === 3).length >= 2, 'six strings of length 1-2 are not enough');
  }

  assert.deepEqual([...lengths].sort(), [1, 2, 3]);

  const maxFormat = { rows: [grid('G', '10', '1', '3', 'custom', '.#', true)] };
  for (const run of runSeeds(maxFormat, { mode: 'max' }, SEEDS.slice(0, 50))) {
    assert.ok(lineLengths(run, 0).every((length) => length >= 2), 'max mode widens toward shorter lines only as needed');
  }
});

test('generateInput uses grid boundary lengths when boundaryRate is 1', () => {
  const format = {
    rows: [
      ints(['H', '4', '4']),
      grid('G', 'H', '1', '8', 'lower'),
      grid('D', 'H', '1', '8', 'lower', '', true)
    ]
  };
  const seen = new Set();
  const distinctSeen = new Set();
  for (const run of runSeeds(format, { boundaryRate: 1 })) {
    const lengths = lineLengths(run, 1);
    if (new Set(run.parsed[1].grid.join('')).size === 1) {
      seen.add('sameChar');
    } else if (lengths.every((length) => length === 1)) {
      seen.add('minLength');
    } else if (lengths.every((length) => length === 8)) {
      seen.add('maxLength');
    }

    const distinctLengths = new Set(lineLengths(run, 2));
    if (distinctLengths.size === 1) {
      distinctSeen.add([...distinctLengths][0]);
    }
  }

  assert.deepEqual([...seen].sort(), ['maxLength', 'minLength', 'sameChar']);
  assert.deepEqual([...distinctSeen].sort((a, b) => a - b), [1, 8]);
});

test('generateInput fails when grid lines cannot all differ', () => {
  const fixed = generateInput({ rows: [grid('G', '20', '', '4', 'custom', '.#', true)] }, { seed: 1 });
  assert.equal(fixed.ok, false);
  assert.match(fixed.message, /16 種類/);

  const format = { rows: [ints(['H', '1', '30']), grid('G', 'H', '', '4', 'custom', '.#', true)] };
  let failures = 0;
  let successes = 0;
  for (const seed of SEEDS) {
    const result = generateInput(format, { seed });
    if (result.ok) {
      successes += 1;
      checkInput(format, result, {});
    } else {
      failures += 1;
      assert.match(result.message, /1行目の|2行目（G）/);
      assert.match(result.message, /すべて異なる文字列にできません/);
    }
  }

  assert.ok(failures > 0 && successes > 0, `${failures} failures, ${successes} successes`);
});

test('generateInput repeats the same input for the same seed only', () => {
  for (const format of [designExample(), bigRangeFormat(), orderFormat(), textFormat()]) {
    const options = { sizeCap: 10, valueCap: 100, boundaryRate: 0.2 };
    const inputs = new Set();
    for (const seed of SEEDS.slice(0, 30)) {
      const first = generateInput(format, { ...options, seed });
      const second = generateInput(format, { ...options, seed });
      assert.deepEqual(first, second);
      inputs.add(first.input);
    }

    assert.ok(inputs.size > 20, `only ${inputs.size} different inputs`);
  }
});

test('generateInput mode max sets size variables to their maximum', () => {
  const format = {
    rows: [
      ints(['N', '3', '30'], ['K', '2', '7']),
      list('A', 'N', '1', '10^9'),
      text('S', '1', 'N', 'lower')
    ]
  };

  for (const run of runSeeds(format, { mode: 'max' }, SEEDS.slice(0, 50))) {
    assert.equal(run.env.N, 30n);
    assert.equal(run.parsed[2].text.length, 30);
  }

  for (const run of runSeeds(format, { mode: 'max', sizeCap: 10 }, SEEDS.slice(0, 50))) {
    assert.equal(run.env.N, 10n);
  }

  for (const run of runSeeds(format, { mode: 'max', sizeCap: 0 }, SEEDS.slice(0, 50))) {
    assert.equal(run.env.N, 3n);
  }

  const ks = new Set(runSeeds(format, { mode: 'max' }, SEEDS.slice(0, 50)).map((run) => run.env.K));
  assert.ok(ks.size > 1, 'non-size variables stay random in max mode');
});

function transitiveFormat() {
  return {
    rows: [
      ints(['N', '1', '2×10^3'], ['M', '1', 'N'], ['K', '1', 'N']),
      list('A', 'M', '1', '10^9')
    ]
  };
}

test('generateInput mode max also maximizes variables that bound a size', () => {
  const format = transitiveFormat();
  const runs = runSeeds(format, { mode: 'max' }, SEEDS.slice(0, 20));
  for (const run of runs) {
    assert.equal(run.env.N, 2000n);
    assert.equal(run.env.M, 2000n);
    assert.equal(run.parsed[1].values.length, 2000);
  }

  const ks = new Set(runs.map((run) => run.env.K));
  assert.ok(ks.size > 1, 'K bounds no size, so it stays random');
});

test('generateInput keeps a variable random when it bounds only values', () => {
  const format = transitiveFormat();
  for (const run of runSeeds(format, { mode: 'max', valueCap: 10 }, SEEDS.slice(0, 50))) {
    assert.equal(run.env.N, 2000n);
    assertInRange(run.env.K, 1n, 11n, 'K with valueCap');
  }
});

test('generateInput applies sizeCap to variables that bound a size', () => {
  const format = transitiveFormat();
  const runs = runSeeds(format, { sizeCap: 8 });
  for (const run of runs) {
    assertInRange(run.env.N, 1n, 8n, 'N with sizeCap');
    assertInRange(run.env.M, 1n, run.env.N, 'M');
    assert.ok(run.parsed[1].values.length <= 8);
  }

  assert.ok(new Set(runs.map((run) => run.env.N)).size >= 6, 'N should vary');
  for (const run of runSeeds(format, { mode: 'max', sizeCap: 8 }, SEEDS.slice(0, 20))) {
    assert.equal(run.env.N, 8n);
    assert.equal(run.env.M, 8n);
  }
});

test('generateInput treats modes other than max as random', () => {
  const format = designExample();
  const random = generateInput(format, { seed: 5, sizeCap: 8 });
  assert.deepEqual(generateInput(format, { seed: 5, sizeCap: 8, mode: 'compare' }), random);
  assert.deepEqual(generateInput(format, { seed: 5, sizeCap: 8, mode: 'random' }), random);
});

test('generateInput sizeCap limits size variables and string lengths', () => {
  const format = { rows: [ints(['N', '1', '2×10^5']), list('A', 'N', '1', '10^9'), text('S', '1', '10^5', 'lower')] };
  const runs = runSeeds(format, { sizeCap: 8 });
  const sizes = new Set(runs.map((run) => Number(run.env.N)));
  assert.deepEqual([...sizes].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(runs.every((run) => run.parsed[2].text.length <= 8));

  const above = { rows: [ints(['N', '10', '20']), list('A', 'N', '1', '5')] };
  for (const run of runSeeds(above, { sizeCap: 5 }, SEEDS.slice(0, 30))) {
    assert.equal(run.env.N, 10n);
  }
});

test('generateInput valueCap narrows values to a small window', () => {
  const format = {
    rows: [
      ints(['N', '5', '5'], ['X', '100', '10^9'], ['Y', '-10^9', '-100']),
      list('A', 'N', '1', '10^9'),
      list('B', 'N', '-10^9', '10^9'),
      list('C', 'N', '-10^9', '-5'),
      { kind: 'matrix', name: 'D', rows: '2', cols: 'N', min: '0', max: '10^18' }
    ]
  };
  const runs = runSeeds(format, { valueCap: 10 });
  for (const run of runs) {
    assertInRange(run.env.X, 100n, 110n, 'X');
    assertInRange(run.env.Y, -110n, -100n, 'Y');
    run.parsed[1].values.forEach((value) => assertInRange(value, 1n, 11n, 'A'));
    run.parsed[2].values.forEach((value) => assertInRange(value, -10n, 10n, 'B'));
    run.parsed[3].values.forEach((value) => assertInRange(value, -15n, -5n, 'C'));
    run.parsed[4].values.forEach((value) => assertInRange(value, 0n, 10n, 'D'));
  }

  assert.ok(runs.some((run) => run.parsed[2].values.some((value) => value < 0n)));
});

test('generateInput widens the window when distinct values need more room', () => {
  const format = {
    rows: [
      ints(['N', '20', '20']),
      list('A', 'N', '1', '10^9', { distinct: true }),
      list('B', '21', '-10^9', '10^9', { order: 'strictAsc' }),
      list('C', 'N', '1', '25', { distinct: true }),
      list('D', '10', '-10^9', '-1', { order: 'strictDesc' })
    ]
  };

  for (const run of runSeeds(format, { valueCap: 3 })) {
    const [, a, b, c, d] = run.parsed;
    assert.deepEqual(a.values.map(Number).sort((x, y) => x - y), Array.from({ length: 20 }, (_, index) => index + 1));
    assert.ok(b.values.every((value) => value >= -21n && value <= 21n));
    assert.ok(c.values.every((value) => value >= 1n && value <= 25n));
    assert.deepEqual(d.values.map(Number), [-1, -2, -3, -4, -5, -6, -7, -8, -9, -10]);
  }
});

test('generateInput uses every boundary pattern when boundaryRate is 1', () => {
  const max = 10n ** 9n;
  const format = {
    rows: [
      ints(['N', '4', '6'], ['X', '1', '10^9']),
      list('A', 'N', '1', '10^9'),
      text('S', '', 'N', 'lower'),
      list('B', 'N', '1', '10^9', { distinct: true }),
      { kind: 'grid', name: 'G', rows: '3', cols: 'N', charset: 'custom', chars: '.#' }
    ]
  };
  const seen = new Set();
  const sizes = new Set();
  for (const run of runSeeds(format, { boundaryRate: 1 })) {
    const values = run.parsed[1].values;
    const unique = new Set(values.map(String));
    if (values.every((value) => value === 1n)) {
      seen.add('min');
    } else if (values.every((value) => value === max)) {
      seen.add('max');
    } else if (unique.size === 1) {
      seen.add('same');
    } else if (values.every((value) => value === 1n || value === max)) {
      seen.add('minOrMax');
    } else {
      assert.fail(`not a boundary pattern: ${values.join(' ')}`);
    }

    assert.equal(new Set(run.parsed[2].text).size, 1, 'string should repeat one character');
    assert.equal(new Set(run.parsed[4].grid.join('')).size, 1, 'grid should repeat one character');
    assert.ok(run.env.X === 1n || run.env.X === max);
    sizes.add(run.env.N);
  }

  assert.deepEqual([...seen].sort(), ['max', 'min', 'minOrMax', 'same']);
  assert.deepEqual([...sizes].sort(), [4n, 6n]);
});

test('generateInput prints one value per line for column layout', () => {
  const format = { rows: [ints(['N', '5', '5']), list('A', 'N', '1', '9', { layout: 'column' })] };
  const result = generateInput(format, { seed: 1 });
  const lines = result.input.split('\n');
  assert.equal(lines.length, 7);
  assert.equal(lines[0], '5');
  assert.equal(lines[6], '');
  for (const line of lines.slice(1, 6)) {
    assert.match(line, /^[1-9]$/);
  }
});

test('generateInput prints empty rows for zero sizes', () => {
  const format = {
    rows: [
      ints(['N', '0', '0']),
      list('A', 'N', '1', '9'),
      list('B', 'N', '1', '9', { layout: 'column' }),
      { kind: 'matrix', name: 'C', rows: '2', cols: 'N', min: '1', max: '9' },
      { kind: 'grid', name: 'G', rows: 'N', cols: '3', charset: 'lower', chars: '' },
      text('S', '', 'N', 'lower')
    ]
  };
  const result = generateInput(format, { seed: 1 });
  assert.deepEqual(result, { ok: true, input: '0\n\n\n\n\n', values: { N: '0' } });
});

// ---- generateInput: failures ----

test('generateInput reports an invalid format with its row number', () => {
  const result = generateInput({ rows: [list('A', 'X', '1', '9')] }, { seed: 1 });
  assert.equal(result.ok, false);
  assert.match(result.message, /1行目/);
  assert.match(result.message, /X/);

  assert.equal(generateInput(null, { seed: 1 }).ok, false);
  assert.equal(generateInput({ rows: [] }, { seed: 1 }).ok, false);
});

test('generateInput checks its options', () => {
  const format = designExample();
  for (const options of [undefined, {}, { seed: -1 }, { seed: 2 ** 32 }, { seed: 1.5 }, { seed: '5' },
    { seed: 1, sizeCap: -1 }, { seed: 1, valueCap: 'x' }, { seed: 1, boundaryRate: Number.NaN }]) {
    const result = generateInput(format, options);
    assert.equal(result.ok, false, JSON.stringify(options));
    assert.equal(typeof result.message, 'string');
  }

  assert.equal(generateInput(format, { seed: 0, sizeCap: 3 }).ok, true);
  assert.equal(generateInput(format, { seed: 4294967295, sizeCap: 3 }).ok, true);
});

test('generateInput fails when resolved bounds cannot work', () => {
  const cases = [
    [{ rows: [ints(['N', '1', '10'], ['M', 'N', '5'])] }, /最小値/],
    [{ rows: [ints(['K', '1', '10']), list('A', '5', '1', 'K', { distinct: true })] }, /種類/],
    [{ rows: [ints(['N', '0', '10']), list('A', 'N-1', '1', '9')] }, /負/],
    [{ rows: [ints(['L', '1', '10']), text('S', 'L', '5', 'lower')] }, /長さ/]
  ];

  for (const [format, pattern] of cases) {
    let failures = 0;
    let successes = 0;
    for (const seed of SEEDS) {
      const result = generateInput(format, { seed, boundaryRate: 0.3 });
      if (result.ok) {
        successes += 1;
        checkInput(format, result, { boundaryRate: 0.3 });
      } else {
        failures += 1;
        assert.match(result.message, pattern);
        assert.match(result.message, /行目/);
      }
    }

    assert.ok(failures > 0 && successes > 0, `${failures} failures, ${successes} successes`);
  }
});

test('generateInput refuses inputs over 20 million characters quickly', () => {
  const started = Date.now();
  const cases = [
    { rows: [list('A', '10^7', '1', '10^9')] },
    { rows: [ints(['N', '1', '10^18']), list('A', 'N', '1', '9')] },
    { rows: [{ kind: 'grid', name: 'G', rows: '10^4', cols: '10^4', charset: 'lower', chars: '' }] },
    { rows: [{ kind: 'matrix', name: 'B', rows: '10^9', cols: '10^9', min: '1', max: '1' }] },
    { rows: [text('S', '', '3×10^7', 'lower')] },
    { rows: [text('S', '', '10^7', 'lower'), text('T', '', '10^7', 'lower')] }
  ];
  for (const format of cases) {
    const result = generateInput(format, { seed: 1, mode: 'max' });
    assert.equal(result.ok, false);
    assert.match(result.message, /2,000 万/);
  }

  assert.ok(Date.now() - started < 1000, 'the guard must run before building the input');

  const big = generateInput({ rows: [{ kind: 'grid', name: 'G', rows: '3000', cols: '3000', charset: 'custom', chars: '.#' }] }, { seed: 1 });
  assert.equal(big.ok, true);
  assert.equal(big.input.length, 3000 * 3001);
});

// ---- generateExample ----

test('generateExample makes the same small example every time', () => {
  const format = designExample();
  const first = generateExample(format);
  const second = generateExample(format);
  assert.deepEqual(first, second);
  const { env } = checkInput(format, first);
  assert.ok(env.N >= 1n && env.N <= 5n);
  assert.ok(first.input.length < 100);

  for (const other of [bigRangeFormat(), orderFormat(), textFormat()]) {
    checkInput(other, generateExample(other));
  }

  assert.equal(generateExample({ rows: [] }).ok, false);
});
