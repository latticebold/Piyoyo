'use strict';

const { evaluateExpr } = require('./expression');
const {
  countStrings,
  getCharsetChars,
  getSizeVariables,
  isFixedLength,
  isFixedWidth,
  validateFormat
} = require('./inputFormat');

const MAX_INPUT_CHARS = 20000000n;
const UINT32_RANGE = 0x100000000;
const EXAMPLE_OPTIONS = { seed: 1, mode: 'max', sizeCap: 4, valueCap: 10, boundaryRate: 0 };
const BOUNDARY_PATTERNS = ['min', 'max', 'same', 'minOrMax'];
const LINE_BOUNDARY_PATTERNS = ['sameChar', 'minLength', 'maxLength'];
const TOO_LARGE_MESSAGE = '入力が 2,000 万文字を超えそうなので、作るのをやめました。個数や長さの上限を小さくしてください。';

function fail(message) {
  return { ok: false, message };
}

function minBig(a, b) {
  return a < b ? a : b;
}

function maxBig(a, b) {
  return a > b ? a : b;
}

function toBigInt(value) {
  if (typeof value === 'bigint') {
    return value;
  }

  const number = Number(value);
  return Number.isFinite(number) ? BigInt(Math.trunc(number)) : 0n;
}

function toSeed(seed) {
  const number = Number(seed);
  return Number.isFinite(number) ? Math.trunc(number) >>> 0 : 0;
}

function createRng(seed) {
  let mixState = toSeed(seed);
  const nextMix = () => {
    mixState = (mixState + 0x9e3779b9) | 0;
    let z = mixState;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) | 0;
  };
  let a = nextMix();
  let b = nextMix();
  let c = nextMix();
  let d = nextMix();

  // sfc32
  function nextUint32() {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  }

  for (let index = 0; index < 12; index += 1) {
    nextUint32();
  }

  function int(lo, hi) {
    let low = toBigInt(lo);
    let high = toBigInt(hi);
    if (high < low) {
      [low, high] = [high, low];
    }

    const span = high - low;
    if (span < BigInt(UINT32_RANGE)) {
      return low + BigInt(uniformBelow(nextUint32, Number(span) + 1));
    }

    // Rejection sampling over 32-bit chunks keeps every value equally likely.
    const bits = span.toString(2).length;
    const chunks = Math.ceil(bits / 32);
    const topBits = bits - (chunks - 1) * 32;
    for (;;) {
      let value = BigInt(topBits === 32 ? nextUint32() : nextUint32() >>> (32 - topBits));
      for (let index = 1; index < chunks; index += 1) {
        value = (value << 32n) | BigInt(nextUint32());
      }

      if (value <= span) {
        return low + value;
      }
    }
  }

  function chance(p) {
    return nextUint32() < p * UINT32_RANGE;
  }

  return { nextUint32, int, chance };
}

// Returns an unbiased integer in [0, n) for 1 <= n <= 2^32.
function uniformBelow(nextUint32, n) {
  if (n === UINT32_RANGE) {
    return nextUint32();
  }

  const limit = UINT32_RANGE - (UINT32_RANGE % n);
  let value = nextUint32();
  while (value >= limit) {
    value = nextUint32();
  }

  return value % n;
}

function toCap(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'bigint') {
    return value >= 0n ? value : undefined;
  }

  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? BigInt(Math.floor(value))
    : undefined;
}

function normalizeOptions(options) {
  const source = options !== null && typeof options === 'object' ? options : {};
  const { seed } = source;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    return fail('シード値は 0 以上 4294967295 以下の整数にしてください。');
  }

  const sizeCap = toCap(source.sizeCap);
  const valueCap = toCap(source.valueCap);
  if (sizeCap === undefined || valueCap === undefined) {
    return fail('サイズや値の上限は 0 以上の数にしてください。');
  }

  const rate = source.boundaryRate === undefined || source.boundaryRate === null ? 0 : Number(source.boundaryRate);
  if (!Number.isFinite(rate)) {
    return fail('境界の値を使う割合は 0 から 1 の数にしてください。');
  }

  return {
    ok: true,
    seed,
    // The stress runner passes 'compare'; every mode except 'max' is random.
    mode: source.mode === 'max' ? 'max' : 'random',
    sizeCap,
    valueCap,
    boundaryRate: Math.min(1, Math.max(0, rate))
  };
}

function evaluate(text, ctx, where, label) {
  const result = evaluateExpr(text, ctx.env);
  return result.ok ? result : fail(`${where}の${label}: ${result.message}`);
}

function evaluateSize(text, ctx, where, label) {
  const result = evaluate(text, ctx, where, label);
  if (result.ok && result.value < 0n) {
    return fail(`${where}: ${label}が負の数（${result.value}）になりました。`);
  }

  return result;
}

function evaluateRange(source, ctx, where) {
  const min = evaluate(source.min, ctx, where, '最小値');
  if (!min.ok) {
    return min;
  }

  const max = evaluate(source.max, ctx, where, '最大値');
  if (!max.ok) {
    return max;
  }

  if (min.value > max.value) {
    return fail(`${where}: 最小値（${min.value}）が最大値（${max.value}）より大きいので、値を選べません。`);
  }

  return { ok: true, lo: min.value, hi: max.value };
}

function capSize(lo, hi, ctx) {
  return ctx.sizeCap === null ? hi : minBig(hi, maxBig(lo, ctx.sizeCap));
}

function chooseSize(lo, hi, ctx) {
  const top = capSize(lo, hi, ctx);
  if (ctx.mode === 'max') {
    return top;
  }

  if (ctx.rng.chance(ctx.boundaryRate)) {
    return ctx.rng.chance(0.5) ? lo : top;
  }

  return ctx.rng.int(lo, top);
}

function valueWindow(lo, hi, cap) {
  if (cap === null) {
    return [lo, hi];
  }

  if (lo > 0n) {
    return [lo, minBig(hi, lo + cap)];
  }

  if (hi < 0n) {
    return [maxBig(lo, hi - cap), hi];
  }

  return [maxBig(lo, -cap), minBig(hi, cap)];
}

// Grows [windowLo, windowHi] inside [lo, hi] until it holds `count` values.
function widenWindow(lo, hi, windowLo, windowHi, count) {
  const missing = count - (windowHi - windowLo + 1n);
  if (missing <= 0n) {
    return [windowLo, windowHi];
  }

  const upRoom = hi - windowHi;
  const downRoom = windowLo - lo;
  let up = minBig(upRoom, (missing + 1n) / 2n);
  const down = minBig(downRoom, missing - up);
  up = minBig(upRoom, missing - down);
  return [windowLo - down, windowHi + up];
}

function chooseValue(lo, hi, ctx) {
  const [windowLo, windowHi] = valueWindow(lo, hi, ctx.valueCap);
  if (ctx.rng.chance(ctx.boundaryRate)) {
    return ctx.rng.chance(0.5) ? windowLo : windowHi;
  }

  return ctx.rng.int(windowLo, windowHi);
}

function shuffle(values, rng) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = uniformBelow(rng.nextUint32, index + 1);
    [values[index], values[other]] = [values[other], values[index]];
  }
}

// Floyd's algorithm: `count` distinct values without listing the whole range.
function sampleDistinct(count, lo, hi, rng) {
  const size = hi - lo + 1n;
  const picked = new Set();
  const values = [];
  for (let top = size - BigInt(count); top < size; top += 1n) {
    const candidate = rng.int(0n, top);
    const choice = picked.has(candidate) ? top : candidate;
    picked.add(choice);
    values.push(lo + choice);
  }

  shuffle(values, rng);
  return values;
}

function boundaryValues(pattern, count, lo, hi, rng) {
  if (pattern === 'min' || pattern === 'max' || pattern === 'same') {
    const value = pattern === 'min' ? lo : pattern === 'max' ? hi : rng.int(lo, hi);
    return new Array(count).fill(value);
  }

  const values = new Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = rng.chance(0.5) ? lo : hi;
  }

  return values;
}

function generateValues(count, lo, hi, distinct, ctx) {
  const { rng } = ctx;
  if (rng.chance(ctx.boundaryRate) && (!distinct || count <= 1)) {
    const pattern = BOUNDARY_PATTERNS[uniformBelow(rng.nextUint32, BOUNDARY_PATTERNS.length)];
    return boundaryValues(pattern, count, lo, hi, rng);
  }

  if (distinct) {
    return sampleDistinct(count, lo, hi, rng);
  }

  const values = new Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = rng.int(lo, hi);
  }

  return values;
}

function compareAsc(a, b) {
  if (a < b) {
    return -1;
  }

  return a > b ? 1 : 0;
}

function sortValues(values, order) {
  if (order === 'asc' || order === 'strictAsc') {
    values.sort(compareAsc);
  } else if (order === 'desc' || order === 'strictDesc') {
    values.sort((a, b) => compareAsc(b, a));
  }
}

function tokenWidth(lo, hi) {
  return BigInt(Math.max(lo.toString().length, hi.toString().length) + 1);
}

function rowLabel(row, rowIndex) {
  return `${rowIndex + 1}行目（${String(row.name).trim()}）`;
}

// A row plan knows its numbers and an upper bound of its size; `build` fills in the contents.
function rowPlan(chars, build) {
  return { ok: true, chars, build };
}

function planIntsRow(row, rowIndex, ctx) {
  const tokens = [];
  for (const variable of row.vars) {
    const name = variable.name.trim();
    const where = `${rowIndex + 1}行目の ${name}`;
    const range = evaluateRange(variable, ctx, where);
    if (!range.ok) {
      return range;
    }

    const value = ctx.sizeVars.has(name)
      ? chooseSize(range.lo, range.hi, ctx)
      : chooseValue(range.lo, range.hi, ctx);
    ctx.env[name] = value;
    ctx.values[name] = value.toString();
    tokens.push(value.toString());
  }

  const line = tokens.join(' ');
  return rowPlan(BigInt(line.length + 1), (lines) => {
    lines.push(line);
  });
}

function planIntList(row, rowIndex, ctx) {
  const where = rowLabel(row, rowIndex);
  const length = evaluateSize(row.length, ctx, where, '個数');
  if (!length.ok) {
    return length;
  }

  const range = evaluateRange(row, ctx, where);
  if (!range.ok) {
    return range;
  }

  const distinct = row.distinct === true || row.order === 'strictAsc' || row.order === 'strictDesc';
  let [lo, hi] = valueWindow(range.lo, range.hi, ctx.valueCap);
  if (distinct) {
    const available = range.hi - range.lo + 1n;
    if (available < length.value) {
      return fail(`${where}: 値は ${available} 種類しかないので、${length.value} 個をすべて異なる値にできません。`);
    }

    [lo, hi] = widenWindow(range.lo, range.hi, lo, hi, length.value);
  }

  return rowPlan(length.value * tokenWidth(lo, hi) + 1n, (lines) => {
    const values = generateValues(Number(length.value), lo, hi, distinct, ctx);
    sortValues(values, row.order);
    if (row.layout === 'column') {
      for (const value of values) {
        lines.push(value.toString());
      }
    } else {
      lines.push(values.join(' '));
    }
  });
}

function planMatrix(row, rowIndex, ctx) {
  const where = rowLabel(row, rowIndex);
  const rows = evaluateSize(row.rows, ctx, where, '行数');
  if (!rows.ok) {
    return rows;
  }

  const cols = evaluateSize(row.cols, ctx, where, '列数');
  if (!cols.ok) {
    return cols;
  }

  const range = evaluateRange(row, ctx, where);
  if (!range.ok) {
    return range;
  }

  const [lo, hi] = valueWindow(range.lo, range.hi, ctx.valueCap);
  return rowPlan(rows.value * (cols.value * tokenWidth(lo, hi) + 1n), (lines) => {
    const rowCount = Number(rows.value);
    const colCount = Number(cols.value);
    const values = generateValues(rowCount * colCount, lo, hi, false, ctx);
    for (let r = 0; r < rowCount; r += 1) {
      lines.push(values.slice(r * colCount, (r + 1) * colCount).join(' '));
    }
  });
}

function randomLine(length, chars, sameChar, rng) {
  if (sameChar !== null) {
    return sameChar.repeat(length);
  }

  const picked = new Array(length);
  for (let index = 0; index < length; index += 1) {
    picked[index] = chars[uniformBelow(rng.nextUint32, chars.length)];
  }

  return picked.join('');
}

function pickSameChar(chars, ctx) {
  return ctx.rng.chance(ctx.boundaryRate) ? chars[uniformBelow(ctx.rng.nextUint32, chars.length)] : null;
}

function planString(row, rowIndex, ctx) {
  const where = rowLabel(row, rowIndex);
  const maxLength = evaluateSize(row.maxLength, ctx, where, '最長の長さ');
  if (!maxLength.ok) {
    return maxLength;
  }

  const minLength = isFixedLength(row) ? maxLength : evaluateSize(row.minLength, ctx, where, '最短の長さ');
  if (!minLength.ok) {
    return minLength;
  }

  if (minLength.value > maxLength.value) {
    return fail(`${where}: 最短の長さ（${minLength.value}）が最長の長さ（${maxLength.value}）より長いので、長さを選べません。`);
  }

  const length = chooseSize(minLength.value, maxLength.value, ctx);
  return rowPlan(length + 1n, (lines) => {
    const chars = getCharsetChars(row);
    lines.push(randomLine(Number(length), chars, pickSameChar(chars, ctx), ctx.rng));
  });
}

// Grows the line-length range inside [minLength, maxLength] until `need` different strings exist.
function widenLineLengths(minLength, maxLength, lo, hi, charCount, need) {
  if (charCount === 1) {
    let missing = need - (hi - lo + 1n);
    const up = missing > 0n ? minBig(maxLength - hi, missing) : 0n;
    missing -= up;
    const down = missing > 0n ? minBig(lo - minLength, missing) : 0n;
    missing -= down;
    return missing > 0n ? null : [lo - down, hi + up];
  }

  let low = lo;
  let high = hi;
  let total = countStrings(charCount, low, high, need);
  while (total < need) {
    if (high < maxLength) {
      high += 1n;
      total += countStrings(charCount, high, high, need);
    } else if (low > minLength) {
      low -= 1n;
      total += countStrings(charCount, low, low, need);
    } else {
      return null;
    }
  }

  return [low, high];
}

function randomLines(count, lo, hi, chars, ctx) {
  const { rng } = ctx;
  if (lo === hi) {
    const sameChar = pickSameChar(chars, ctx);
    return Array.from({ length: count }, () => randomLine(Number(hi), chars, sameChar, rng));
  }

  const pattern = rng.chance(ctx.boundaryRate)
    ? LINE_BOUNDARY_PATTERNS[uniformBelow(rng.nextUint32, LINE_BOUNDARY_PATTERNS.length)]
    : null;
  const sameChar = pattern === 'sameChar' ? chars[uniformBelow(rng.nextUint32, chars.length)] : null;
  const lines = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const length = pattern === 'minLength' ? lo : pattern === 'maxLength' ? hi : rng.int(lo, hi);
    lines[index] = randomLine(Number(length), chars, sameChar, rng);
  }

  return lines;
}

// Turns 0, 1, 2, ... into the strings of length minLength, minLength + 1, ... in order.
function decodeLine(index, minLength, chars) {
  const base = BigInt(chars.length);
  if (base === 1n) {
    return chars[0].repeat(Number(minLength + index));
  }

  let length = minLength;
  let rest = index;
  while (rest >= base ** length) {
    rest -= base ** length;
    length += 1n;
  }

  const picked = new Array(Number(length));
  for (let position = picked.length - 1; position >= 0; position -= 1) {
    picked[position] = chars[Number(rest % base)];
    rest /= base;
  }

  return picked.join('');
}

function distinctLines(count, lo, hi, chars, ctx) {
  const { rng } = ctx;
  const need = BigInt(count);
  let low = lo;
  let high = hi;
  if (rng.chance(ctx.boundaryRate)) {
    const lengths = (low === high ? [low] : [low, high])
      .filter((length) => countStrings(chars.length, length, length, need) >= need);
    if (lengths.length > 0) {
      low = lengths[uniformBelow(rng.nextUint32, lengths.length)];
      high = low;
    }
  }

  // With few possible strings, pick distinct indexes; otherwise retrying on a repeat is cheap.
  const plenty = 2n * need;
  const total = countStrings(chars.length, low, high, plenty);
  if (total < plenty) {
    return sampleDistinct(count, 0n, total - 1n, rng).map((index) => decodeLine(index, low, chars));
  }

  const seen = new Set();
  const lines = [];
  while (lines.length < count) {
    const line = randomLine(Number(rng.int(low, high)), chars, null, rng);
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }

  return lines;
}

function planGrid(row, rowIndex, ctx) {
  const where = rowLabel(row, rowIndex);
  const rows = evaluateSize(row.rows, ctx, where, '行数');
  if (!rows.ok) {
    return rows;
  }

  const fixed = isFixedWidth(row);
  const cols = evaluateSize(row.cols, ctx, where, fixed ? '文字列の長さ' : '最長の長さ');
  if (!cols.ok) {
    return cols;
  }

  const minCols = fixed ? cols : evaluateSize(row.minCols, ctx, where, '最短の長さ');
  if (!minCols.ok) {
    return minCols;
  }

  if (minCols.value > cols.value) {
    return fail(`${where}: 最短の長さ（${minCols.value}）が最長の長さ（${cols.value}）より長いので、長さを選べません。`);
  }

  if (rows.value > MAX_INPUT_CHARS) {
    return fail(TOO_LARGE_MESSAGE);
  }

  const chars = getCharsetChars(row);
  const distinct = row.distinct === true;
  const top = capSize(minCols.value, cols.value, ctx);
  let lo = ctx.mode === 'max' ? top : minCols.value;
  let hi = top;
  if (distinct) {
    const widened = widenLineLengths(minCols.value, cols.value, lo, hi, chars.length, rows.value);
    if (!widened) {
      const available = countStrings(chars.length, minCols.value, cols.value, rows.value);
      return fail(`${where}: 作れる文字列は ${available} 種類しかないので、${rows.value} 行をすべて異なる文字列にできません。`);
    }

    [lo, hi] = widened;
  }

  return rowPlan(rows.value * (hi + 1n), (lines) => {
    const count = Number(rows.value);
    const built = distinct ? distinctLines(count, lo, hi, chars, ctx) : randomLines(count, lo, hi, chars, ctx);
    for (const line of built) {
      lines.push(line);
    }
  });
}

const ROW_PLANNERS = {
  ints: planIntsRow,
  intList: planIntList,
  matrix: planMatrix,
  string: planString,
  grid: planGrid
};

function generateInput(format, options = {}) {
  const settings = normalizeOptions(options);
  if (!settings.ok) {
    return settings;
  }

  const validation = validateFormat(format);
  if (!validation.ok) {
    const [first] = validation.errors;
    return fail(first.rowIndex >= 0 ? `${first.rowIndex + 1}行目: ${first.message}` : first.message);
  }

  const ctx = {
    rng: createRng(settings.seed),
    mode: settings.mode,
    sizeCap: settings.sizeCap,
    valueCap: settings.valueCap,
    boundaryRate: settings.boundaryRate,
    sizeVars: getSizeVariables(format),
    env: {},
    values: {}
  };

  // Resolve every size first so an oversized input is refused before anything is built.
  const plans = [];
  let totalChars = 0n;
  for (let rowIndex = 0; rowIndex < format.rows.length; rowIndex += 1) {
    const row = format.rows[rowIndex];
    const plan = ROW_PLANNERS[row.kind](row, rowIndex, ctx);
    if (!plan.ok) {
      return plan;
    }

    totalChars += plan.chars;
    if (totalChars > MAX_INPUT_CHARS) {
      return fail(TOO_LARGE_MESSAGE);
    }

    plans.push(plan);
  }

  const lines = [];
  for (const plan of plans) {
    plan.build(lines);
  }

  return { ok: true, input: `${lines.join('\n')}\n`, values: ctx.values };
}

function generateExample(format) {
  return generateInput(format, { ...EXAMPLE_OPTIONS });
}

module.exports = {
  createRng,
  generateExample,
  generateInput
};
