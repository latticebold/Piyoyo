'use strict';

const path = require('node:path');
const { COMPARE_MODES } = require('./outputCompare');

const VERIFY_FILE_VERSION = 1;
const VERIFY_FILE_SUFFIX = '.piyoyo.json';
const NAIVE_FILE_SUFFIX = '_naive.py';
const DEFAULT_COMPARE_MODE = 'tokens';
const DEFAULT_ITERATIONS = 100;
const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 10000;
const MAX_COUNTEREXAMPLES = 50;
const COUNTEREXAMPLE_KINDS = ['mismatch', 'mainError', 'mainTimeout'];
const MAX_SEED = 0xffffffff;

let idSequence = 0;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function stripExtension(filePath) {
  const extension = path.extname(filePath);
  return extension ? filePath.slice(0, -extension.length) : filePath;
}

function toSlashSeparators(filePath) {
  return filePath.replace(/\\/g, '/');
}

function getVerifyFilePath(pyFilePath) {
  if (!isNonEmptyString(pyFilePath)) {
    return '';
  }

  return `${stripExtension(pyFilePath)}${VERIFY_FILE_SUFFIX}`;
}

function getDefaultNaivePath(pyFilePath) {
  if (!isNonEmptyString(pyFilePath)) {
    return '';
  }

  return `${stripExtension(pyFilePath)}${NAIVE_FILE_SUFFIX}`;
}

function resolveNaivePath(pyFilePath, naivePath) {
  if (!isNonEmptyString(pyFilePath)) {
    return '';
  }

  if (!isNonEmptyString(naivePath)) {
    return path.resolve(getDefaultNaivePath(pyFilePath));
  }

  return path.resolve(path.dirname(pyFilePath), toSlashSeparators(naivePath.trim()));
}

function toRelativeNaivePath(pyFilePath, absPath) {
  if (!isNonEmptyString(pyFilePath) || !isNonEmptyString(absPath)) {
    return '';
  }

  const baseDirectory = path.dirname(path.resolve(pyFilePath));
  const relativePath = path.relative(baseDirectory, path.resolve(baseDirectory, absPath.trim()));
  return relativePath.split(path.sep).join('/');
}

function createEmptyVerifyData() {
  return {
    version: VERIFY_FILE_VERSION,
    format: { rows: [] },
    naivePath: '',
    compareMode: DEFAULT_COMPARE_MODE,
    iterations: DEFAULT_ITERATIONS,
    counterexamples: []
  };
}

function normalizeIterations(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { value: DEFAULT_ITERATIONS, valid: false, changed: true };
  }

  const clamped = Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.floor(value)));
  return { value: clamped, valid: true, changed: clamped !== value };
}

function normalizeSeed(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_SEED ? value : null;
}

function normalizeCounterexample(raw) {
  if (!isPlainObject(raw) || typeof raw.input !== 'string' || !COUNTEREXAMPLE_KINDS.includes(raw.kind)) {
    return null;
  }

  return {
    id: isNonEmptyString(raw.id) ? raw.id : '',
    kind: raw.kind,
    input: raw.input,
    // null means no expected output yet (found before a naive solution existed).
    expected: typeof raw.expected === 'string' ? raw.expected : null,
    seed: normalizeSeed(raw.seed),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : ''
  };
}

function generateCounterexampleId(usedIds) {
  let id = '';
  do {
    idSequence += 1;
    id = `ce-${Date.now()}-${idSequence}`;
  } while (usedIds.has(id));
  return id;
}

function parseCounterexamples(rawList, warnings) {
  if (rawList === undefined) {
    return [];
  }

  if (!Array.isArray(rawList)) {
    warnings.push('保存された反例を読み取れなかったため、反例なしで読み込みました。');
    return [];
  }

  const result = [];
  const seenInputs = new Set();
  const usedIds = new Set();
  let droppedCount = 0;
  let duplicateCount = 0;

  for (const raw of rawList) {
    const entry = normalizeCounterexample(raw);
    if (!entry) {
      droppedCount += 1;
      continue;
    }
    if (seenInputs.has(entry.input)) {
      duplicateCount += 1;
      continue;
    }
    seenInputs.add(entry.input);
    if (!entry.id || usedIds.has(entry.id)) {
      entry.id = generateCounterexampleId(usedIds);
    }
    usedIds.add(entry.id);
    result.push(entry);
  }

  if (droppedCount > 0) {
    warnings.push(`読み取れない反例が ${droppedCount} 件あったため、とばしました。`);
  }
  if (duplicateCount > 0) {
    warnings.push(`同じ入力の反例が ${duplicateCount} 件あったため、1 件にまとめました。`);
  }
  if (result.length > MAX_COUNTEREXAMPLES) {
    warnings.push(`反例が ${MAX_COUNTEREXAMPLES} 件を超えていたため、新しい ${MAX_COUNTEREXAMPLES} 件だけを読み込みました。`);
    return result.slice(-MAX_COUNTEREXAMPLES);
  }
  return result;
}

function parseVerifyFile(text) {
  if (typeof text !== 'string') {
    return { ok: false, message: '保存ファイルを読み取れませんでした。' };
  }

  let raw;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, message: '保存ファイルが JSON の形になっていないため、読み込めませんでした。' };
  }

  if (!isPlainObject(raw)) {
    return { ok: false, message: '保存ファイルの中身の形が正しくないため、読み込めませんでした。' };
  }

  const warnings = [];
  const data = createEmptyVerifyData();

  if (raw.version !== undefined) {
    if (typeof raw.version === 'number' && raw.version > VERIFY_FILE_VERSION) {
      return {
        ok: false,
        message: 'この保存ファイルは新しい Piyoyo で作られたため、読み込めません。Piyoyo を更新してください。'
      };
    }
    if (raw.version !== VERIFY_FILE_VERSION) {
      warnings.push(`保存ファイルの version が正しくないため、${VERIFY_FILE_VERSION} として読み込みました。`);
    }
  }

  if (raw.format !== undefined) {
    if (isPlainObject(raw.format) && Array.isArray(raw.format.rows)) {
      data.format = raw.format;
    } else {
      warnings.push('入力形式を読み取れなかったため、空の入力形式にしました。');
    }
  }

  if (raw.naivePath !== undefined) {
    if (typeof raw.naivePath === 'string') {
      data.naivePath = toSlashSeparators(raw.naivePath.trim());
    } else {
      warnings.push('愚直解の場所を読み取れなかったため、いつもの場所（<名前>_naive.py）にしました。');
    }
  }

  if (raw.compareMode !== undefined) {
    if (COMPARE_MODES.includes(raw.compareMode)) {
      data.compareMode = raw.compareMode;
    } else {
      warnings.push('出力の比べ方を読み取れなかったため、「空白区切り」にしました。');
    }
  }

  if (raw.iterations !== undefined) {
    const iterations = normalizeIterations(raw.iterations);
    data.iterations = iterations.value;
    if (!iterations.valid) {
      warnings.push(`回数を読み取れなかったため、${DEFAULT_ITERATIONS} 回にしました。`);
    } else if (iterations.changed) {
      warnings.push(`回数は ${MIN_ITERATIONS}〜${MAX_ITERATIONS} の整数にしてください。${iterations.value} 回にしました。`);
    }
  }

  data.counterexamples = parseCounterexamples(raw.counterexamples, warnings);

  return { ok: true, data, warnings };
}

function orderCounterexampleFields(item) {
  return {
    id: item.id,
    kind: item.kind,
    input: item.input,
    expected: item.expected,
    seed: item.seed,
    createdAt: item.createdAt
  };
}

function jsonValueReplacer(key, value) {
  return typeof value === 'bigint' ? value.toString() : value;
}

function serializeVerifyFile(data) {
  const source = isPlainObject(data) ? data : {};
  const ordered = {
    version: VERIFY_FILE_VERSION,
    format: isPlainObject(source.format) && Array.isArray(source.format.rows) ? source.format : { rows: [] },
    naivePath: typeof source.naivePath === 'string' ? source.naivePath : '',
    compareMode: COMPARE_MODES.includes(source.compareMode) ? source.compareMode : DEFAULT_COMPARE_MODE,
    iterations: normalizeIterations(source.iterations).value,
    counterexamples: (Array.isArray(source.counterexamples) ? source.counterexamples : [])
      .filter(isPlainObject)
      .map(orderCounterexampleFields)
  };

  return `${JSON.stringify(ordered, jsonValueReplacer, 2)}\n`;
}

function getCounterexampleList(data) {
  return Array.isArray(data.counterexamples) ? data.counterexamples : [];
}

function addCounterexample(data, counterexample) {
  const base = isPlainObject(data) ? data : createEmptyVerifyData();
  const current = getCounterexampleList(base);
  const entry = normalizeCounterexample(counterexample);

  if (!entry || current.some((item) => isPlainObject(item) && item.input === entry.input)) {
    return { ...base, counterexamples: current.slice() };
  }

  const usedIds = new Set(current.filter(isPlainObject).map((item) => item.id));
  if (!entry.id || usedIds.has(entry.id)) {
    entry.id = generateCounterexampleId(usedIds);
  }
  if (!entry.createdAt) {
    entry.createdAt = new Date().toISOString();
  }

  return { ...base, counterexamples: [...current, entry].slice(-MAX_COUNTEREXAMPLES) };
}

function removeCounterexample(data, id) {
  const base = isPlainObject(data) ? data : createEmptyVerifyData();
  return {
    ...base,
    counterexamples: getCounterexampleList(base).filter((item) => !(isPlainObject(item) && item.id === id))
  };
}

module.exports = {
  COUNTEREXAMPLE_KINDS,
  MAX_COUNTEREXAMPLES,
  VERIFY_FILE_VERSION,
  addCounterexample,
  createEmptyVerifyData,
  getDefaultNaivePath,
  getVerifyFilePath,
  parseVerifyFile,
  removeCounterexample,
  resolveNaivePath,
  serializeVerifyFile,
  toRelativeNaivePath
};
