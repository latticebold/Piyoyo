'use strict';

const { getSizeVariables, validateFormat } = require('../verify/inputFormat');
const { formatVariableMaxima } = require('./inputBinding');

const MEASURE_SCALES = Object.freeze([1 / 64, 1 / 16, 1 / 4, 1]);
const RUNS_PER_SIZE = 3;
const BASELINE_RUNS = 3;
// Fixed seeds keep a measurement reproducible.
const BASE_SEED = 1;
// Times below this are mostly start-up noise after the baseline is subtracted.
const MIN_RELIABLE_SECONDS = 0.01;
// A fit this poor (standard deviation in log space) means the timings were too noisy.
const MAX_RELIABLE_SPREAD = 0.3;
// A simpler model wins when its spread is within this of the best one.
const TIE_RELATIVE = 1.05;
const TIE_ABSOLUTE = 0.01;

const log2 = (n) => Math.max(1, Math.log2(n));
// Ordered from the simplest model.
const MODELS = [
  { model: 'O(1)', degree: 0, f: () => 1 },
  { model: 'O(log N)', degree: 0, f: (n) => log2(n) },
  { model: 'O(N)', degree: 1, f: (n) => n },
  { model: 'O(N log N)', degree: 1, f: (n) => n * log2(n) },
  { model: 'O(N²)', degree: 2, f: (n) => n * n },
  { model: 'O(N³)', degree: 3, f: (n) => n * n * n }
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
  return { ok: false, message };
}

function planMeasurement(format) {
  if (!isObject(format) || !Array.isArray(format.rows) || format.rows.length === 0) {
    return fail('入力形式がないので測れません。「検証」タブで入力形式を作ってください。');
  }

  const validation = validateFormat(format);
  if (!validation.ok) {
    const [first] = validation.errors;
    const where = first.rowIndex >= 0 ? `${first.rowIndex + 1}行目: ` : '';
    return fail(`入力形式に誤りがあるので測れません（${where}${first.message}）`);
  }

  const maxima = formatVariableMaxima(format);
  if (!maxima.ok) {
    return fail(`入力形式の上限を計算できないので測れません（${maxima.message}）`);
  }

  const sizeVars = getSizeVariables(format);
  let primaryVar = null;
  let primaryMax = -Infinity;
  // Object keys keep the declaration order, so ties go to the earlier variable.
  for (const [name, value] of Object.entries(maxima.values)) {
    if (sizeVars.has(name) && value > primaryMax) {
      primaryVar = name;
      primaryMax = value;
    }
  }

  if (primaryVar === null) {
    return fail('入力形式に個数や長さを決める変数（N など）がないので、サイズを変えて測れません。');
  }

  const steps = [];
  for (const scale of MEASURE_SCALES) {
    const sizeCap = Math.max(1, Math.floor(primaryMax * scale));
    // A small maximum gives the same size twice; measuring it again tells nothing new.
    if (!steps.some((step) => step.sizeCap === sizeCap)) {
      steps.push({ scale, sizeCap });
    }
  }

  return { ok: true, primaryVar, primaryMax, steps };
}

function spreadOf(points, f) {
  const residuals = points.map((point) => Math.log(point.seconds) - Math.log(f(point.n)));
  const mean = residuals.reduce((sum, value) => sum + value, 0) / residuals.length;
  const variance = residuals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / residuals.length;
  return Math.sqrt(variance);
}

function distinctSizes(points) {
  return new Set(points.map((point) => point.n)).size;
}

function fitGrowth(points) {
  const valid = (Array.isArray(points) ? points : []).filter((point) => isObject(point)
    && point.timedOut !== true
    && Number.isFinite(point.n) && point.n > 0
    && Number.isFinite(point.seconds) && point.seconds >= 0);
  const reliable = valid.filter((point) => point.seconds >= MIN_RELIABLE_SECONDS);
  if (distinctSizes(reliable) < 2) {
    // Too few points, or every run was too short to show any growth.
    return { model: 'O(1)', confidence: 'low' };
  }

  const scored = MODELS.map((candidate) => ({ ...candidate, spread: spreadOf(reliable, candidate.f) }));
  const bestSpread = Math.min(...scored.map((candidate) => candidate.spread));
  const limit = bestSpread * TIE_RELATIVE + TIE_ABSOLUTE;
  const chosen = scored.find((candidate) => candidate.spread <= limit);
  return {
    model: chosen.model,
    confidence: bestSpread <= MAX_RELIABLE_SPREAD ? 'high' : 'low'
  };
}

function degreeOf(model) {
  const found = MODELS.find((candidate) => candidate.model === model);
  return found ? found.degree : null;
}

function compareModels(measuredModel, staticModel) {
  const measured = degreeOf(measuredModel);
  if (measured === null) {
    return { mismatch: false, message: '実測の結果がないので、比べていません。' };
  }

  const expected = degreeOf(staticModel);
  if (expected === null) {
    return { mismatch: false, message: '静的な推定が単純な形ではないので、実測とは比べていません。' };
  }

  if (measuredModel === staticModel) {
    return { mismatch: false, message: `実測の増え方は、静的な推定（${staticModel}）と合っています。` };
  }

  if (measured === expected) {
    return {
      mismatch: false,
      message: `実測（${measuredModel}）と静的な推定（${staticModel}）はほぼ同じ増え方です。log の差は実測では見分けにくいので、食い違いとはしません。`
    };
  }

  if (measured > expected) {
    return {
      mismatch: true,
      message: `実測では ${measuredModel} のように増えていて、静的な推定（${staticModel}）より遅いです。推定が見落としている重い処理があるかもしれません。`
    };
  }

  return {
    mismatch: true,
    message: `実測では ${measuredModel} のように増えていて、静的な推定（${staticModel}）より速いです。推定が大きめに出ているかもしれません。`
  };
}

function errorText(error) {
  if (error && typeof error.message === 'string' && error.message) {
    return error.message;
  }

  return String(error);
}

function makeFailedRun(errorMessage) {
  return {
    stdout: '',
    stderr: '',
    exitCode: null,
    timedOut: false,
    outputLimitExceeded: false,
    errorMessage,
    elapsedMs: 0
  };
}

async function runSafely(run, input) {
  try {
    const result = await (input === undefined ? run() : run(input));
    return isObject(result) ? result : makeFailedRun('実行結果を受け取れませんでした。');
  } catch (error) {
    return makeFailedRun(errorText(error));
  }
}

// => null (success) | 'timeout' | 'error'
function classifyRun(result) {
  if (result.timedOut) {
    return 'timeout';
  }

  if (result.outputLimitExceeded || result.errorMessage || result.exitCode !== 0) {
    return 'error';
  }

  return null;
}

function elapsedSeconds(result) {
  const ms = Number(result.elapsedMs);
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0;
}

function resolveGenerate(generate) {
  if (typeof generate === 'function') {
    return generate;
  }

  try {
    // Loaded lazily so tests with a fake generator never load it.
    const generator = require('../verify/inputGenerator');
    return typeof generator.generateInput === 'function' ? generator.generateInput : null;
  } catch {
    return null;
  }
}

function sizeLabel(primaryVar, sizeCap) {
  return `${primaryVar} = ${sizeCap}`;
}

function cancelledResult() {
  return { ok: false, cancelled: true, message: '測るのを中止しました。' };
}

async function runMeasurement(options) {
  const {
    format,
    runMain,
    runBaseline,
    generate,
    timeoutMs,
    isCancelled = () => false,
    onProgress = () => {}
  } = isObject(options) ? options : {};

  if (typeof runMain !== 'function') {
    return fail('本番の解を動かす方法が渡されていません。');
  }

  if (typeof runBaseline !== 'function') {
    return fail('起動時間を測る方法が渡されていません。');
  }

  const plan = planMeasurement(format);
  if (!plan.ok) {
    return plan;
  }

  const generateInput = resolveGenerate(generate);
  if (!generateInput) {
    return fail('入力を作る機能を読み込めませんでした。');
  }

  const cancelled = () => {
    try {
      return typeof isCancelled === 'function' && Boolean(isCancelled());
    } catch {
      return false;
    }
  };
  const reportProgress = (progress) => {
    try {
      if (typeof onProgress === 'function') {
        onProgress(progress);
      }
    } catch {
      // A broken progress callback must not stop the measurement.
    }
  };
  const limitSeconds = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs / 1000
    : Infinity;

  if (cancelled()) {
    return cancelledResult();
  }

  let baselineSeconds = Infinity;
  for (let run = 0; run < BASELINE_RUNS; run += 1) {
    const result = await runSafely(runBaseline);
    if (cancelled()) {
      return cancelledResult();
    }

    if (classifyRun(result) !== null) {
      const detail = typeof result.errorMessage === 'string' && result.errorMessage ? `（${result.errorMessage}）` : '';
      return fail(`何もしないプログラムを動かせなかったので、起動時間を測れませんでした${detail}。Python の設定を確かめてください。`);
    }

    baselineSeconds = Math.min(baselineSeconds, elapsedSeconds(result));
  }

  const points = [];
  let stoppedAtScale = null;
  let message = '';
  const total = plan.steps.length;
  for (let step = 0; step < total; step += 1) {
    const { scale, sizeCap } = plan.steps[step];
    if (cancelled()) {
      return cancelledResult();
    }

    reportProgress({ step, total, scale });

    let generated;
    try {
      generated = await generateInput(format, { seed: BASE_SEED + step, mode: 'max', sizeCap });
    } catch (error) {
      generated = { ok: false, message: errorText(error) };
    }

    if (!isObject(generated) || generated.ok !== true || typeof generated.input !== 'string') {
      const reason = isObject(generated) && typeof generated.message === 'string' ? generated.message.trim() : '';
      const text = `${sizeLabel(plan.primaryVar, sizeCap)} の入力を作れませんでした${reason ? `：${reason}` : '。'}`;
      if (points.length === 0) {
        return fail(text);
      }

      // Keep what was measured so far; larger inputs would fail the same way.
      // stoppedAtScale stays for time limits only, so the screen never calls this a timeout.
      message = `${text} ここまでの結果で判断します。`;
      break;
    }

    const values = isObject(generated.values) ? generated.values : {};
    const actual = Number(values[plan.primaryVar]);
    const n = Number.isFinite(actual) && actual > 0 ? actual : sizeCap;

    let best = Infinity;
    let timedOut = false;
    for (let run = 0; run < RUNS_PER_SIZE; run += 1) {
      const result = await runSafely(runMain, generated.input);
      if (cancelled()) {
        return cancelledResult();
      }

      const failure = classifyRun(result);
      if (failure === 'error') {
        const detail = typeof result.errorMessage === 'string' && result.errorMessage ? `（${result.errorMessage}）` : '';
        return fail(`${sizeLabel(plan.primaryVar, n)} の入力で本番の解がエラーになったので、測るのをやめました${detail}。「検証」タブのストレステストで原因を確かめてください。`);
      }

      best = Math.min(best, elapsedSeconds(result));
      if (failure === 'timeout') {
        // More runs at this size, or any larger size, would only time out again.
        timedOut = true;
        break;
      }
    }

    points.push({ scale, n, seconds: Math.max(0, best - baselineSeconds), timedOut });
    if (timedOut || best > limitSeconds) {
      stoppedAtScale = scale;
      break;
    }
  }

  return { ok: true, points, baselineSeconds, fit: fitGrowth(points), stoppedAtScale, message };
}

module.exports = {
  MEASURE_SCALES,
  compareModels,
  fitGrowth,
  planMeasurement,
  runMeasurement
};
