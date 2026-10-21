'use strict';

const SUPERSCRIPT_DIGITS = {
  0: '⁰',
  1: '¹',
  2: '²',
  3: '³',
  4: '⁴',
  5: '⁵',
  6: '⁶',
  7: '⁷',
  8: '⁸',
  9: '⁹'
};
const SYMBOL_PRIORITY = ['n', 'm', 'k', 'q', 'h', 'w', 'v', 'e'];
const GROWTH_CLASSES = {
  '0,0': 'O(1)',
  '0,1': 'O(log N)',
  '1,0': 'O(N)',
  '1,1': 'O(N log N)',
  '2,0': 'O(N²)',
  '3,0': 'O(N³)'
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isCollectionSymbol(symbol) {
  return symbol.startsWith('|');
}

function symbolRank(symbol) {
  const index = SYMBOL_PRIORITY.indexOf(symbol.toLowerCase());
  return index >= 0 ? index : SYMBOL_PRIORITY.length;
}

function compareSymbols(a, b) {
  const groupA = isCollectionSymbol(a) ? 1 : 0;
  const groupB = isCollectionSymbol(b) ? 1 : 0;
  if (groupA !== groupB) {
    return groupA - groupB;
  }

  const rankA = symbolRank(a);
  const rankB = symbolRank(b);
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA !== lowerB) {
    return lowerA < lowerB ? -1 : 1;
  }

  return a === b ? 0 : a < b ? -1 : 1;
}

function factorOf(term, symbol) {
  return hasOwn(term.factors, symbol) ? term.factors[symbol] : { pow: 0, log: 0 };
}

function compareFactors(a, b) {
  return a.pow !== b.pow ? a.pow - b.pow : a.log - b.log;
}

function makeTerm(factorEntries, exp) {
  const merged = new Map();
  for (const [symbol, factor] of factorEntries) {
    const previous = merged.get(symbol) || { pow: 0, log: 0 };
    merged.set(symbol, { pow: previous.pow + factor.pow, log: previous.log + factor.log });
  }

  const entries = [...merged.entries()]
    .filter(([, factor]) => factor.pow > 0 || factor.log > 0)
    .sort(([a], [b]) => compareSymbols(a, b))
    .map(([symbol, factor]) => [symbol, { pow: factor.pow, log: factor.log }]);
  return {
    factors: Object.fromEntries(entries),
    exp: [...new Set(exp)].sort(compareSymbols)
  };
}

function termEntries(term) {
  const factors = term.factors || {};
  return Object.keys(factors).map((symbol) => [symbol, factors[symbol]]);
}

function isEmptyTerm(term) {
  return Object.keys(term.factors).length === 0 && term.exp.length === 0;
}

function termsOf(c) {
  return c && Array.isArray(c.terms) ? c.terms : [];
}

// True when `small` grows no faster than `big`.
function termDominates(big, small) {
  if (small.exp.some((symbol) => !big.exp.includes(symbol))) {
    return false;
  }

  const symbols = new Set([...Object.keys(big.factors), ...Object.keys(small.factors)]);
  for (const symbol of symbols) {
    if (big.exp.includes(symbol) && !small.exp.includes(symbol)) {
      continue;
    }
    if (compareFactors(factorOf(small, symbol), factorOf(big, symbol)) > 0) {
      return false;
    }
  }
  return true;
}

function termWeight(term) {
  let pow = 0;
  let log = 0;
  for (const symbol of Object.keys(term.factors)) {
    pow += term.factors[symbol].pow;
    log += term.factors[symbol].log;
  }
  return { exp: term.exp.length, pow, log };
}

function compareTerms(a, b) {
  const weightA = termWeight(a);
  const weightB = termWeight(b);
  if (weightA.exp !== weightB.exp) {
    return weightB.exp - weightA.exp;
  }
  if (weightA.pow !== weightB.pow) {
    return weightB.pow - weightA.pow;
  }
  if (weightA.log !== weightB.log) {
    return weightB.log - weightA.log;
  }

  const keysA = [...a.exp.map((symbol) => `^${symbol}`), ...Object.keys(a.factors)];
  const keysB = [...b.exp.map((symbol) => `^${symbol}`), ...Object.keys(b.factors)];
  for (let index = 0; index < Math.min(keysA.length, keysB.length); index += 1) {
    const order = compareSymbols(keysA[index], keysB[index]);
    if (order !== 0) {
      return order;
    }
  }
  if (keysA.length !== keysB.length) {
    return keysA.length - keysB.length;
  }

  for (const symbol of Object.keys(a.factors)) {
    const order = compareFactors(factorOf(b, symbol), factorOf(a, symbol));
    if (order !== 0) {
      return order;
    }
  }
  return 0;
}

function normalize(terms) {
  const cleaned = terms
    .map((term) => makeTerm(termEntries(term), term.exp || []))
    .filter((term) => !isEmptyTerm(term));
  const kept = cleaned.filter((term, index) =>
    !cleaned.some((other, otherIndex) =>
      otherIndex !== index &&
      termDominates(other, term) &&
      (!termDominates(term, other) || otherIndex < index)
    )
  );
  return { terms: kept.sort(compareTerms) };
}

function constant() {
  return { terms: [] };
}

function symbolComplexity(symbol, { pow = 1, log = 0 } = {}) {
  return normalize([{ factors: Object.fromEntries([[String(symbol), { pow, log }]]), exp: [] }]);
}

function logOf(symbol) {
  return symbolComplexity(symbol, { pow: 0, log: 1 });
}

function exponential(symbol) {
  return normalize([{ factors: {}, exp: [String(symbol)] }]);
}

function multiplyTerms(a, b) {
  return makeTerm([...termEntries(a), ...termEntries(b)], [...a.exp, ...b.exp]);
}

function multiply(a, b) {
  const termsA = termsOf(a);
  const termsB = termsOf(b);
  if (termsA.length === 0) {
    return normalize(termsB);
  }
  if (termsB.length === 0) {
    return normalize(termsA);
  }

  const products = [];
  for (const termA of termsA) {
    for (const termB of termsB) {
      products.push(multiplyTerms(termA, termB));
    }
  }
  return normalize(products);
}

function add(a, b) {
  return normalize([...termsOf(a), ...termsOf(b)]);
}

function isConstant(c) {
  return termsOf(c).length === 0;
}

function symbolsOf(c) {
  const symbols = new Set();
  for (const term of termsOf(c)) {
    Object.keys(term.factors).forEach((symbol) => symbols.add(symbol));
    term.exp.forEach((symbol) => symbols.add(symbol));
  }
  return [...symbols].sort(compareSymbols);
}

// (a + b)^p is treated as a^p + b^p; log powers are rounded up to stay integers.
function powerOf(c, power) {
  if (!(power > 0)) {
    return constant();
  }
  return normalize(termsOf(c).map((term) => ({
    factors: Object.fromEntries(termEntries(term).map(([symbol, factor]) => [
      symbol,
      { pow: factor.pow * power, log: Math.ceil(factor.log * power) }
    ])),
    exp: term.exp
  })));
}

// log(N^2 M) = log N + log M, log(log N) <= log N, log(2^N) = N.
function logOfComplexity(c) {
  let result = constant();
  for (const term of termsOf(c)) {
    for (const symbol of Object.keys(term.factors)) {
      result = add(result, logOf(symbol));
    }
    for (const symbol of term.exp) {
      result = add(result, symbolComplexity(symbol));
    }
  }
  return result;
}

// 2^(N + M) is kept as 2^N·2^M; other exponents are approximated by their symbols.
function exponentialOf(c) {
  const symbols = symbolsOf(c);
  return symbols.length === 0 ? constant() : normalize([{ factors: {}, exp: symbols }]);
}

function substitute(c, symbol, replacement) {
  const results = [];
  for (const term of termsOf(c)) {
    const hasFactor = hasOwn(term.factors, symbol);
    const hasExp = term.exp.includes(symbol);
    if (!hasFactor && !hasExp) {
      results.push(term);
      continue;
    }

    const rest = makeTerm(
      termEntries(term).filter(([name]) => name !== symbol),
      term.exp.filter((name) => name !== symbol)
    );
    let part = { terms: isEmptyTerm(rest) ? [] : [rest] };
    if (hasFactor) {
      const factor = term.factors[symbol];
      part = multiply(part, powerOf(replacement, factor.pow));
      part = multiply(part, powerOf(logOfComplexity(replacement), factor.log));
    }
    if (hasExp) {
      part = multiply(part, exponentialOf(replacement));
    }
    results.push(...part.terms);
  }
  return normalize(results);
}

function isPlainName(symbol) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol);
}

function displayName(symbol, rename) {
  if (rename && hasOwn(rename, symbol)) {
    return String(rename[symbol]);
  }
  return isPlainName(symbol) ? symbol.toUpperCase() : symbol;
}

function renameComplexity(c, rename) {
  return normalize(termsOf(c).map((term) => makeTerm(
    termEntries(term).map(([symbol, factor]) => [displayName(symbol, rename), factor]),
    term.exp.map((symbol) => displayName(symbol, rename))
  )));
}

function superscript(value) {
  return String(value).split('').map((digit) => SUPERSCRIPT_DIGITS[digit] || digit).join('');
}

function wrapName(name) {
  return /^[\p{L}\p{N}_|]+$/u.test(name) ? name : `(${name})`;
}

function formatPower(name, pow) {
  const shown = wrapName(name);
  if (Number.isInteger(pow)) {
    return pow === 1 ? shown : `${shown}${superscript(pow)}`;
  }
  if (Number.isInteger(pow * 2)) {
    const whole = Math.floor(pow);
    const head = whole === 0 ? '' : whole === 1 ? shown : `${shown}${superscript(whole)}`;
    return `${head}√${shown}`;
  }
  return `${shown}^${pow}`;
}

function formatTerm(term) {
  const products = [];
  const logs = [];
  for (const [name, factor] of termEntries(term)) {
    if (factor.pow > 0) {
      products.push(formatPower(name, factor.pow));
    }
    if (factor.log > 0) {
      logs.push(`log${factor.log > 1 ? superscript(factor.log) : ''} ${wrapName(name)}`);
    }
  }
  products.push(...term.exp.map((name) => `2^${wrapName(name)}`));
  return [products.join('·'), ...logs].filter(Boolean).join(' ');
}

function formatCount(c, { rename = {} } = {}) {
  const renamed = renameComplexity(c, rename);
  if (renamed.terms.length === 0) {
    return '1';
  }
  return renamed.terms.map(formatTerm).join(' + ');
}

function formatComplexity(c, { rename = {} } = {}) {
  return `O(${formatCount(c, { rename })})`;
}

function evaluateComplexity(c, values = {}) {
  const terms = termsOf(c);
  if (terms.length === 0) {
    return 1;
  }

  const read = (symbol) => {
    const value = values && hasOwn(values, symbol) ? values[symbol] : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  let total = 0;
  for (const term of terms) {
    let product = 1;
    for (const [symbol, factor] of termEntries(term)) {
      const value = read(symbol);
      if (value === null) {
        return null;
      }
      const base = Math.max(value, 0);
      product *= Math.pow(base, factor.pow) * Math.pow(Math.max(1, Math.log2(Math.max(base, 1))), factor.log);
    }
    for (const symbol of term.exp) {
      const value = read(symbol);
      if (value === null) {
        return null;
      }
      product *= Math.pow(2, Math.max(value, 0));
    }
    total += product;
  }
  return Number.isFinite(total) ? total : Number.MAX_VALUE;
}

function classifyGrowth(c, symbol) {
  const symbols = Array.isArray(symbol) ? symbol : [symbol];
  let best = { pow: 0, log: 0 };
  for (const term of termsOf(c)) {
    if (term.exp.some((name) => symbols.includes(name))) {
      return 'other';
    }
    const current = { pow: 0, log: 0 };
    for (const name of symbols) {
      const factor = factorOf(term, name);
      current.pow += factor.pow;
      current.log += factor.log;
    }
    if (compareFactors(current, best) > 0) {
      best = current;
    }
  }
  return GROWTH_CLASSES[`${best.pow},${best.log}`] || 'other';
}

module.exports = {
  add,
  classifyGrowth,
  compareSymbols,
  constant,
  evaluateComplexity,
  exponential,
  exponentialOf,
  formatComplexity,
  formatCount,
  isConstant,
  logOf,
  logOfComplexity,
  multiply,
  powerOf,
  substitute,
  symbolComplexity,
  symbolsOf
};
