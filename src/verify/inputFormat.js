'use strict';

const { parseExpr } = require('./expression');

const ROW_KINDS = ['ints', 'intList', 'matrix', 'string', 'grid'];
const ORDERS = ['none', 'asc', 'desc', 'strictAsc', 'strictDesc'];
const LAYOUTS = ['row', 'column'];
const CHARSETS = ['lower', 'upper', 'digit', 'custom'];

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const VAR_NAME_CANDIDATES = ['N', 'M', 'K', 'Q', 'L', 'R', 'X', 'Y', 'Z', 'D', 'P', 'H', 'W'];
const LIST_NAME_CANDIDATES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const TEXT_NAME_CANDIDATES = ['S', 'T', 'U', 'V'];
const SIZE_FIELDS = {
  ints: [],
  intList: ['length'],
  matrix: ['rows', 'cols'],
  string: ['minLength', 'maxLength'],
  grid: ['rows', 'cols']
};
const FIELD_LABELS = {
  min: '最小値',
  max: '最大値',
  length: '個数',
  rows: '行数',
  cols: '列数',
  minLength: '最短の長さ',
  maxLength: '最長の長さ'
};

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// An empty minLength means the string length is fixed to maxLength.
function isFixedLength(row) {
  return row.minLength === undefined || row.minLength === null
    || (typeof row.minLength === 'string' && row.minLength.trim() === '');
}

function toNameSet(existingNames) {
  const names = Array.isArray(existingNames) ? existingNames : [];
  return new Set(names.filter((name) => typeof name === 'string').map((name) => name.trim()));
}

function pickName(candidates, used) {
  const found = candidates.find((candidate) => !used.has(candidate));
  if (found) {
    return found;
  }

  for (let suffix = 2; ; suffix += 1) {
    const name = `${candidates[0]}${suffix}`;
    if (!used.has(name)) {
      return name;
    }
  }
}

function createVar(existingNames = []) {
  return { name: pickName(VAR_NAME_CANDIDATES, toNameSet(existingNames)), min: '1', max: '2×10^5' };
}

function createRow(kind, existingNames = []) {
  const used = toNameSet(existingNames);
  const pick = (first, second, fallback) => {
    if (used.has(first)) {
      return first;
    }

    return second && used.has(second) ? second : fallback;
  };
  const review = { needsReview: false, reviewReason: '' };

  switch (kind) {
    case 'ints':
      return { kind, vars: [createVar(existingNames)], ...review };
    case 'intList':
      return {
        kind,
        name: pickName(LIST_NAME_CANDIDATES, used),
        length: pick('N', null, '5'),
        min: '1',
        max: '10^9',
        layout: 'row',
        distinct: false,
        order: 'none',
        ...review
      };
    case 'matrix':
      return {
        kind,
        name: pickName(LIST_NAME_CANDIDATES, used),
        rows: pick('N', null, '3'),
        cols: pick('M', 'N', '3'),
        min: '1',
        max: '10^9',
        ...review
      };
    case 'string':
      return {
        kind,
        name: pickName(TEXT_NAME_CANDIDATES, used),
        minLength: '',
        maxLength: pick('N', null, '10'),
        charset: 'lower',
        chars: '',
        ...review
      };
    case 'grid':
      return {
        kind,
        name: pickName(TEXT_NAME_CANDIDATES, used),
        rows: pick('H', 'N', '3'),
        cols: pick('W', 'M', '3'),
        charset: 'custom',
        chars: '.#',
        ...review
      };
    default:
      return null;
  }
}

function collectNames(format) {
  const names = [];
  const rows = isObject(format) && Array.isArray(format.rows) ? format.rows : [];
  for (const row of rows) {
    if (!isObject(row)) {
      continue;
    }

    if (row.kind === 'ints') {
      const vars = Array.isArray(row.vars) ? row.vars : [];
      vars.forEach((variable) => {
        if (isObject(variable) && trimmedString(variable.name) !== '') {
          names.push(variable.name.trim());
        }
      });
    } else if (trimmedString(row.name) !== '') {
      names.push(row.name.trim());
    }
  }

  return names;
}

// ---- normalizeFormat ----

function toExprString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return '';
}

function toBoolean(value) {
  return value === true || value === 'true';
}

function toChoice(value, choices, fallback, label, rowNumber, warnings) {
  if (choices.includes(value)) {
    return value;
  }

  if (value !== undefined && value !== null && value !== '') {
    warnings.push(`${rowNumber}行目: ${label}の指定が正しくないので、初期値に戻しました。`);
  }

  return fallback;
}

function normalizeVar(rawVar) {
  return {
    name: toExprString(rawVar.name),
    min: toExprString(rawVar.min),
    max: toExprString(rawVar.max)
  };
}

function normalizeRow(raw, rowNumber, warnings) {
  const review = {
    needsReview: toBoolean(raw.needsReview),
    reviewReason: typeof raw.reviewReason === 'string' ? raw.reviewReason : ''
  };

  switch (raw.kind) {
    case 'ints': {
      const rawVars = Array.isArray(raw.vars) ? raw.vars : [];
      const vars = [];
      rawVars.forEach((rawVar, index) => {
        if (isObject(rawVar)) {
          vars.push(normalizeVar(rawVar));
        } else {
          warnings.push(`${rowNumber}行目: ${index + 1}番目の変数は形が正しくないので読み飛ばしました。`);
        }
      });
      return { kind: 'ints', vars, ...review };
    }
    case 'intList':
      return {
        kind: 'intList',
        name: toExprString(raw.name),
        length: toExprString(raw.length),
        min: toExprString(raw.min),
        max: toExprString(raw.max),
        layout: toChoice(raw.layout, LAYOUTS, 'row', '並べ方', rowNumber, warnings),
        distinct: toBoolean(raw.distinct),
        order: toChoice(raw.order, ORDERS, 'none', '並び順', rowNumber, warnings),
        ...review
      };
    case 'matrix':
      return {
        kind: 'matrix',
        name: toExprString(raw.name),
        rows: toExprString(raw.rows),
        cols: toExprString(raw.cols),
        min: toExprString(raw.min),
        max: toExprString(raw.max),
        ...review
      };
    case 'string':
      return {
        kind: 'string',
        name: toExprString(raw.name),
        minLength: toExprString(raw.minLength),
        maxLength: toExprString(raw.maxLength),
        charset: toChoice(raw.charset, CHARSETS, 'lower', '文字の種類', rowNumber, warnings),
        chars: typeof raw.chars === 'string' ? raw.chars : '',
        ...review
      };
    default:
      return {
        kind: 'grid',
        name: toExprString(raw.name),
        rows: toExprString(raw.rows),
        cols: toExprString(raw.cols),
        charset: toChoice(raw.charset, CHARSETS, 'lower', '文字の種類', rowNumber, warnings),
        chars: typeof raw.chars === 'string' ? raw.chars : '',
        ...review
      };
  }
}

function normalizeFormat(raw) {
  const warnings = [];
  const rows = [];
  if (raw === null || raw === undefined) {
    return { format: { rows }, warnings };
  }

  if (!isObject(raw) || (raw.rows !== undefined && !Array.isArray(raw.rows))) {
    warnings.push('入力形式の形が正しくないので、空にしました。');
    return { format: { rows }, warnings };
  }

  const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 1;
    if (!isObject(rawRow)) {
      warnings.push(`${rowNumber}行目は形が正しくないので読み飛ばしました。`);
      return;
    }

    if (!ROW_KINDS.includes(rawRow.kind)) {
      const kindText = typeof rawRow.kind === 'string' ? `「${rawRow.kind.slice(0, 20)}」` : '';
      warnings.push(`${rowNumber}行目は知らない種類${kindText}なので読み飛ばしました。`);
      return;
    }

    rows.push(normalizeRow(rawRow, rowNumber, warnings));
  });

  return { format: { rows }, warnings };
}

// ---- validateFormat ----

function shiftBound(bound, offset) {
  return bound === null ? null : bound + offset;
}

function sameVariable(a, b) {
  return a.expr.type === 'var' && b.expr.type === 'var' && a.expr.name === b.expr.name;
}

// True only when min > max for every possible choice of the earlier variables.
function isAlwaysEmpty(minInfo, maxInfo) {
  if (!minInfo || !maxInfo) {
    return false;
  }

  if (sameVariable(minInfo, maxInfo)) {
    return minInfo.expr.offset > maxInfo.expr.offset;
  }

  return minInfo.lo !== null && maxInfo.hi !== null && minInfo.lo > maxInfo.hi;
}

function collectDeclaredNames(rows) {
  const varNames = new Set();
  const otherNames = new Set();
  rows.forEach((row) => {
    if (!isObject(row)) {
      return;
    }

    if (row.kind === 'ints') {
      (Array.isArray(row.vars) ? row.vars : []).forEach((variable) => {
        if (isObject(variable) && NAME_PATTERN.test(trimmedString(variable.name))) {
          varNames.add(variable.name.trim());
        }
      });
    } else if (NAME_PATTERN.test(trimmedString(row.name))) {
      otherNames.add(row.name.trim());
    }
  });
  return { varNames, otherNames };
}

function createRowChecker(rowIndex, state) {
  const push = (path, message) => {
    state.errors.push({ rowIndex, path, message });
  };

  const checkName = (value, path, label) => {
    const name = trimmedString(value);
    if (name === '') {
      push(path, `${label}を入力してください。`);
      return null;
    }

    if (!NAME_PATTERN.test(name)) {
      push(path, `${label}「${name}」は使えません。英字で始め、英字・数字・_ だけにしてください。`);
      return null;
    }

    if (state.seenNames.has(name)) {
      push(path, `${label}「${name}」はほかと重なっています。`);
      return name;
    }

    state.seenNames.add(name);
    return name;
  };

  const checkExpr = (value, path, label) => {
    if (typeof value !== 'string' || value.trim() === '') {
      push(path, `${label}を入力してください。`);
      return null;
    }

    const parsed = parseExpr(value);
    if (!parsed.ok) {
      push(path, `${label}: ${parsed.message}`);
      return null;
    }

    const { expr } = parsed;
    if (expr.type === 'literal') {
      return { expr, lo: expr.value, hi: expr.value };
    }

    const bounds = state.scope.get(expr.name);
    if (bounds) {
      return { expr, lo: shiftBound(bounds.lo, expr.offset), hi: shiftBound(bounds.hi, expr.offset) };
    }

    if (state.varNames.has(expr.name)) {
      push(path, `${label}: 変数「${expr.name}」はここではまだ使えません。前の行か、同じ行の左側で決めた変数だけ使えます。`);
    } else if (state.otherNames.has(expr.name)) {
      push(path, `${label}: 「${expr.name}」は変数ではないので、式に使えません。`);
    } else {
      push(path, `${label}: 変数「${expr.name}」が定義されていません。`);
    }

    return null;
  };

  const checkRange = (minInfo, maxInfo, path, prefix) => {
    if (isAlwaysEmpty(minInfo, maxInfo)) {
      push(path, `${prefix}最小値が最大値より大きくなっています。`);
      return false;
    }

    return true;
  };

  const checkSize = (info, path, label) => {
    if (info && info.hi !== null && info.hi < 0n) {
      push(path, `${label}が負の数です。`);
    }
  };

  const checkChoice = (value, choices, path, label) => {
    if (!choices.includes(value)) {
      push(path, `${label}の指定が正しくありません。`);
    }
  };

  const checkCharset = (row) => {
    checkChoice(row.charset, CHARSETS, 'charset', '文字の種類');
    if (row.charset !== 'custom') {
      return;
    }

    if (typeof row.chars !== 'string' || row.chars === '') {
      push('chars', '使う文字を入力してください。');
    } else if (/\s/.test(row.chars)) {
      push('chars', '使う文字に空白や改行は入れられません。');
    }
  };

  return { push, checkName, checkExpr, checkRange, checkSize, checkChoice, checkCharset };
}

function validateIntsRow(row, checker, state) {
  if (!Array.isArray(row.vars) || row.vars.length === 0) {
    checker.push('vars', '変数を1つ以上追加してください。');
    return;
  }

  row.vars.forEach((variable, index) => {
    const base = `vars.${index}`;
    if (!isObject(variable)) {
      checker.push(base, `${index + 1}番目の変数の形が正しくありません。`);
      return;
    }

    const name = checker.checkName(variable.name, `${base}.name`, '変数名');
    const label = name || `${index + 1}番目の変数`;
    const minInfo = checker.checkExpr(variable.min, `${base}.min`, `${label}の最小値`);
    const maxInfo = checker.checkExpr(variable.max, `${base}.max`, `${label}の最大値`);
    checker.checkRange(minInfo, maxInfo, `${base}.max`, `${label}の`);

    if (name && !state.scope.has(name)) {
      state.scope.set(name, {
        lo: minInfo ? minInfo.lo : null,
        hi: maxInfo ? maxInfo.hi : null
      });
    }
  });
}

function validateDistinct(row, infos, checker) {
  const strict = row.order === 'strictAsc' || row.order === 'strictDesc';
  if (!strict && row.distinct !== true) {
    return;
  }

  const { lengthInfo, minInfo, maxInfo } = infos;
  if (!lengthInfo || !minInfo || !maxInfo || lengthInfo.lo === null || isAlwaysEmpty(minInfo, maxInfo)) {
    return;
  }

  let available = null;
  if (sameVariable(minInfo, maxInfo)) {
    available = maxInfo.expr.offset - minInfo.expr.offset + 1n;
  } else if (minInfo.lo !== null && maxInfo.hi !== null) {
    available = maxInfo.hi - minInfo.lo + 1n;
  }

  if (available !== null && lengthInfo.lo > available) {
    checker.push(strict ? 'order' : 'distinct',
      `値は ${available} 種類しかないので、${lengthInfo.lo} 個をすべて異なる値にできません。`);
  }
}

function validateRow(row, rowIndex, state) {
  const checker = createRowChecker(rowIndex, state);
  if (!isObject(row)) {
    checker.push('', '行の形が正しくありません。');
    return;
  }

  if (!ROW_KINDS.includes(row.kind)) {
    checker.push('kind', '行の種類が正しくありません。');
    return;
  }

  if (row.kind === 'ints') {
    validateIntsRow(row, checker, state);
    return;
  }

  checker.checkName(row.name, 'name', '名前');
  const infos = {};
  for (const field of SIZE_FIELDS[row.kind]) {
    if (field === 'minLength' && isFixedLength(row)) {
      continue;
    }

    infos[field] = checker.checkExpr(row[field], field, FIELD_LABELS[field]);
    checker.checkSize(infos[field], field, FIELD_LABELS[field]);
  }

  if (row.kind === 'string') {
    if (infos.minLength && infos.maxLength && isAlwaysEmpty(infos.minLength, infos.maxLength)) {
      checker.push('maxLength', '最短の長さが最長の長さより長くなっています。');
    }

    checker.checkCharset(row);
    return;
  }

  if (row.kind === 'grid') {
    checker.checkCharset(row);
    return;
  }

  const minInfo = checker.checkExpr(row.min, 'min', FIELD_LABELS.min);
  const maxInfo = checker.checkExpr(row.max, 'max', FIELD_LABELS.max);
  const rangeOk = checker.checkRange(minInfo, maxInfo, 'max', '');

  if (row.kind === 'intList') {
    checker.checkChoice(row.layout, LAYOUTS, 'layout', '並べ方');
    checker.checkChoice(row.order, ORDERS, 'order', '並び順');
    if (typeof row.distinct !== 'boolean') {
      checker.push('distinct', '「すべて異なる」の指定が正しくありません。');
    }

    if (rangeOk) {
      validateDistinct(row, { lengthInfo: infos.length, minInfo, maxInfo }, checker);
    }
  }
}

function validateFormat(format) {
  if (!isObject(format) || !Array.isArray(format.rows)) {
    return { ok: false, errors: [{ rowIndex: -1, path: 'rows', message: '入力形式の形が正しくありません。' }] };
  }

  const { varNames, otherNames } = collectDeclaredNames(format.rows);
  const state = {
    errors: [],
    varNames,
    otherNames,
    seenNames: new Set(),
    scope: new Map()
  };

  if (format.rows.length === 0) {
    state.errors.push({ rowIndex: -1, path: 'rows', message: '行を1つ以上追加してください。' });
  }

  format.rows.forEach((row, rowIndex) => validateRow(row, rowIndex, state));
  return { ok: state.errors.length === 0, errors: state.errors };
}

function referencedName(text) {
  const parsed = typeof text === 'string' ? parseExpr(text) : null;
  return parsed && parsed.ok && parsed.expr.type === 'var' ? parsed.expr.name : null;
}

// Size fields, plus (transitively) the variables that bound a size variable's range,
// so that max mode can make every size reach its true maximum.
function getSizeVariables(format) {
  const names = new Set();
  const boundsOf = new Map();
  const rows = isObject(format) && Array.isArray(format.rows) ? format.rows : [];
  for (const row of rows) {
    if (!isObject(row) || !Object.prototype.hasOwnProperty.call(SIZE_FIELDS, row.kind)) {
      continue;
    }

    if (row.kind === 'ints') {
      (Array.isArray(row.vars) ? row.vars : []).forEach((variable) => {
        if (!isObject(variable) || trimmedString(variable.name) === '') {
          return;
        }

        const name = variable.name.trim();
        const refs = boundsOf.get(name) || [];
        refs.push(referencedName(variable.min), referencedName(variable.max));
        boundsOf.set(name, refs);
      });
    }

    for (const field of SIZE_FIELDS[row.kind]) {
      const name = referencedName(row[field]);
      if (name) {
        names.add(name);
      }
    }
  }

  const pending = [...names];
  while (pending.length > 0) {
    for (const ref of boundsOf.get(pending.pop()) || []) {
      if (ref && !names.has(ref)) {
        names.add(ref);
        pending.push(ref);
      }
    }
  }

  return names;
}

module.exports = {
  CHARSETS,
  LAYOUTS,
  ORDERS,
  ROW_KINDS,
  collectNames,
  createRow,
  createVar,
  getSizeVariables,
  isFixedLength,
  normalizeFormat,
  validateFormat
};
