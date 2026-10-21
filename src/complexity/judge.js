'use strict';

const DEFAULT_OPS_PER_SECOND = Object.freeze({ pypy: 3e7, cpython: 1e7 });
const SAFE_RATIO = 0.3;
const TIGHT_RATIO = 1.0;
// Keeps exact boundary values (e.g. 0.3) on the inclusive side despite rounding.
const RATIO_EPSILON = 1e-9;
const VERDICT_LABELS = { safe: '余裕', tight: '厳しい', tle: 'TLE の恐れ' };
// Shorter runs are mostly start-up noise, so they say little about speed.
const MIN_RELIABLE_SECONDS = 0.05;

function detectImplementation(pythonPath, runtimeImplementation = '') {
  const runtime = typeof runtimeImplementation === 'string' ? runtimeImplementation.trim() : '';
  if (runtime !== '') {
    return /pypy/i.test(runtime) ? 'pypy' : 'cpython';
  }

  const parts = typeof pythonPath === 'string' ? pythonPath.split(/[\\/]/) : [];
  return parts.some((part) => /pypy/i.test(part)) ? 'pypy' : 'cpython';
}

function judgeOperations(options) {
  const { operations, timeoutMs, opsPerSecond } = options !== null && typeof options === 'object' ? options : {};
  if (typeof operations !== 'number' || Number.isNaN(operations) || operations < 0) {
    return { ok: false, message: '演算回数が分からないので、判定できません。' };
  }

  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { ok: false, message: '時間制限が正しくないので、判定できません。' };
  }

  if (typeof opsPerSecond !== 'number' || !Number.isFinite(opsPerSecond) || opsPerSecond <= 0) {
    return { ok: false, message: '1秒あたりの演算回数が正しくないので、判定できません。' };
  }

  const rawRatio = operations / (opsPerSecond * timeoutMs / 1000);
  let verdict = 'tle';
  if (rawRatio <= SAFE_RATIO * (1 + RATIO_EPSILON)) {
    verdict = 'safe';
  } else if (rawRatio <= TIGHT_RATIO * (1 + RATIO_EPSILON)) {
    verdict = 'tight';
  }

  // Infinity would turn into null in JSON.
  const ratio = Number.isFinite(rawRatio) ? rawRatio : Number.MAX_VALUE;
  return { ok: true, ratio, verdict, label: VERDICT_LABELS[verdict] };
}

// One significant digit, rounding half up: 4e10 => '4×10^10', 2.5e5 => '3×10^5', 9.6e5 => '1×10^6'.
function formatOperations(operations) {
  if (typeof operations !== 'number' || Number.isNaN(operations) || operations < 0) {
    return '?';
  }

  if (operations === Infinity) {
    return '∞';
  }

  const rounded = Math.round(operations);
  if (rounded < 1000) {
    return String(rounded);
  }

  const [mantissa, exponent] = operations.toExponential(0).split('e');
  return `${mantissa}×10^${Number(exponent)}`;
}

function opsPerSecondFromMeasurement(points, operationsAt) {
  if (!Array.isArray(points) || typeof operationsAt !== 'function') {
    return null;
  }

  const usable = points
    .filter((point) => point !== null && typeof point === 'object' && point.timedOut !== true
      && Number.isFinite(point.n) && Number.isFinite(point.seconds) && point.seconds >= MIN_RELIABLE_SECONDS)
    .sort((a, b) => b.n - a.n);

  for (const point of usable) {
    let operations;
    try {
      operations = operationsAt(point);
    } catch {
      operations = null;
    }

    if (typeof operations === 'number' && Number.isFinite(operations) && operations > 0) {
      return operations / point.seconds;
    }
  }

  return null;
}

module.exports = {
  DEFAULT_OPS_PER_SECOND,
  detectImplementation,
  formatOperations,
  judgeOperations,
  opsPerSecondFromMeasurement
};
