'use strict';

const { evaluateExpr, parseExpr } = require('../verify/expression');

const COLLECTION_PATTERN = /^\|(.+)\|$/;
// Which input kind pairs with which row kind when binding by read order.
const ORDER_KIND_PAIRS = {
  intList: 'intList',
  string: 'string',
  lines: 'grid'
};
// The size field that gives the length of a collection row.
const COLLECTION_SIZE_FIELDS = {
  intList: 'length',
  string: 'maxLength',
  grid: 'rows',
  matrix: 'rows'
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getRows(format) {
  return isObject(format) && Array.isArray(format.rows) ? format.rows : [];
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

// Computes every ints variable's maximum it can, keeping the first error.
function resolveMaxima(format) {
  const env = {};
  const values = {};
  let error = null;
  for (const [rowIndex, row] of getRows(format).entries()) {
    if (!isObject(row) || row.kind !== 'ints' || !Array.isArray(row.vars)) {
      continue;
    }

    for (const variable of row.vars) {
      const name = isObject(variable) ? trimmedString(variable.name) : '';
      if (name === '' || hasOwn(values, name)) {
        continue;
      }

      const result = evaluateExpr(variable.max, env);
      if (!result.ok) {
        error = error || `${rowIndex + 1}行目の ${name} の最大値: ${result.message}`;
        continue;
      }

      const number = Number(result.value);
      if (!Number.isFinite(number)) {
        error = error || `${rowIndex + 1}行目の ${name} の最大値が大きすぎて扱えません。`;
        continue;
      }

      env[name] = result.value;
      values[name] = number;
    }
  }

  return { env, values, error };
}

function formatVariableMaxima(format) {
  if (!isObject(format) || !Array.isArray(format.rows)) {
    return { ok: false, message: '入力形式がありません。' };
  }

  const { values, error } = resolveMaxima(format);
  return error ? { ok: false, message: error } : { ok: true, values };
}

// Resolves an expression text against the maxima.
// => { value, formatVar, rename } | null
function resolveExpr(text, env) {
  const parsed = parseExpr(text);
  if (!parsed.ok) {
    return null;
  }

  const result = evaluateExpr(text, env);
  if (!result.ok) {
    return null;
  }

  const value = Number(result.value);
  if (!Number.isFinite(value)) {
    return null;
  }

  // A literal size gets a value but keeps its code name, so the display never reads O(5).
  const name = parsed.expr.type === 'var' ? parsed.expr.name : null;
  return { value, formatVar: name, rename: name };
}

function collectionName(symbol) {
  const match = COLLECTION_PATTERN.exec(symbol);
  return match ? match[1].trim() : null;
}

function findByName(items, name, getName) {
  const exact = items.find((item) => getName(item) === name);
  if (exact) {
    return exact;
  }

  const lower = name.toLowerCase();
  return items.find((item) => getName(item).toLowerCase() === lower) || null;
}

function listFormatVars(rows) {
  const names = [];
  for (const row of rows) {
    if (!isObject(row) || row.kind !== 'ints' || !Array.isArray(row.vars)) {
      continue;
    }

    for (const variable of row.vars) {
      const name = isObject(variable) ? trimmedString(variable.name) : '';
      if (name !== '' && !names.includes(name)) {
        names.push(name);
      }
    }
  }

  return names;
}

function toManualValue(raw) {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }

  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = parseExpr(raw);
    if (parsed.ok && parsed.expr.type === 'literal' && parsed.expr.value >= 0n) {
      const number = Number(parsed.expr.value);
      return Number.isFinite(number) ? number : null;
    }
  }

  return null;
}

function resolveManual(entry, env) {
  if (!isObject(entry)) {
    return null;
  }

  if (hasOwn(entry, 'value')) {
    const value = toManualValue(entry.value);
    return value === null ? null : { value, formatVar: null, rename: null };
  }

  const text = trimmedString(entry.formatVar);
  if (text === '') {
    return null;
  }

  const resolved = resolveExpr(text, env);
  return resolved ? { ...resolved, formatVar: text } : null;
}

function bindSymbols(analysis, format, options = {}) {
  const source = isObject(analysis) ? analysis : {};
  const symbols = Array.isArray(source.symbols)
    ? [...new Set(source.symbols.filter((symbol) => typeof symbol === 'string' && symbol !== ''))]
    : [];
  const inputs = Array.isArray(source.inputs) ? source.inputs : [];
  const manual = isObject(options) && isObject(options.manual) ? options.manual : {};
  const rows = getRows(format);
  const { env } = resolveMaxima(format);
  const wanted = new Set(symbols);
  const found = new Map();

  const bind = (symbol, sourceName, resolved) => {
    if (!wanted.has(symbol) || found.has(symbol) || !resolved) {
      return;
    }

    found.set(symbol, { source: sourceName, ...resolved });
  };

  // 1. Choices made on screen.
  for (const symbol of symbols) {
    if (hasOwn(manual, symbol)) {
      bind(symbol, 'manual', resolveManual(manual[symbol], env));
    }
  }

  // 2. Same name, ignoring case (n <-> N, |a| <-> the row named A).
  const formatVars = listFormatVars(rows);
  const namedRows = rows.filter((row) => isObject(row)
    && hasOwn(COLLECTION_SIZE_FIELDS, row.kind) && trimmedString(row.name) !== '');
  for (const symbol of symbols) {
    const inner = collectionName(symbol);
    if (inner === null) {
      const name = findByName(formatVars, symbol, (item) => item);
      if (name !== null && hasOwn(env, name)) {
        bind(symbol, 'name', resolveExpr(name, env));
      }
      continue;
    }

    const row = findByName(namedRows, inner, (item) => trimmedString(item.name));
    if (row) {
      bind(symbol, 'name', resolveExpr(row[COLLECTION_SIZE_FIELDS[row.kind]], env));
    }
  }

  // 3. Read order: inputs[i] <-> rows[i]. A kind mismatch skips only that index.
  const count = Math.min(inputs.length, rows.length);
  for (let index = 0; index < count; index += 1) {
    const input = inputs[index];
    const row = rows[index];
    if (!isObject(input) || !isObject(row) || !Array.isArray(input.targets)) {
      continue;
    }

    if (input.kind === 'ints' && row.kind === 'ints' && Array.isArray(row.vars)) {
      const pairs = Math.min(input.targets.length, row.vars.length);
      for (let position = 0; position < pairs; position += 1) {
        const target = input.targets[position];
        const variable = row.vars[position];
        const name = isObject(variable) ? trimmedString(variable.name) : '';
        if (typeof target === 'string' && name !== '' && hasOwn(env, name)) {
          bind(target, 'order', resolveExpr(name, env));
        }
      }
      continue;
    }

    if (ORDER_KIND_PAIRS[input.kind] === row.kind && typeof input.targets[0] === 'string') {
      bind(`|${input.targets[0]}|`, 'order', resolveExpr(row[COLLECTION_SIZE_FIELDS[row.kind]], env));
    }
  }

  const values = {};
  const bindings = [];
  const unbound = [];
  const rename = {};
  for (const symbol of symbols) {
    const binding = found.get(symbol);
    if (!binding) {
      unbound.push(symbol);
      continue;
    }

    values[symbol] = binding.value;
    bindings.push({ symbol, source: binding.source, formatVar: binding.formatVar, value: binding.value });
    if (binding.rename) {
      rename[symbol] = binding.rename;
    }
  }

  return { values, bindings, unbound, rename };
}

module.exports = {
  bindSymbols,
  formatVariableMaxima
};
