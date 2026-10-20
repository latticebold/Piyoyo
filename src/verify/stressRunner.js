'use strict';

const DEFAULT_ITERATIONS = 100;
const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 10000;
const DEFAULT_COMPARE_MODE = 'tokens';
const BOUNDARY_RATE = 0.2;
const MAX_MODE_PERIOD = 10;
const SMALL_SIZE_START = 2;
const SMALL_SIZE_CAP = 8;
const SMALL_VALUE_START = 3;
const SMALL_VALUE_CAP = 10;
// Kept low so exhaustive naive solutions (2^N, N!, O(N^3)) still finish in time.
const MAX_SIZE_CAP = 20;
// Progress points (fraction of all iterations): tiny inputs until 30%, caps fully open from 80%.
const SMALL_PHASE_END = 0.3;
const RAMP_END = 0.8;
const UINT32_RANGE = 2 ** 32;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toUint32(value) {
  if (typeof value === 'bigint') {
    return Number(BigInt.asUintN(32, value));
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.floor(number) >>> 0;
}

// MurmurHash3 finalizer: a bijection on 32-bit integers with good mixing.
function mix32(value) {
  let x = value >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

function deriveCaseSeed(seed, iteration) {
  const base = mix32(toUint32(seed));
  return mix32((base + Math.imul(toUint32(iteration) + 1, 0x9e3779b9)) >>> 0);
}

function normalizePlanTotal(totalIterations) {
  const total = Number(totalIterations);
  return Number.isFinite(total) && total >= 1 ? Math.floor(total) : 1;
}

function normalizeIterations(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ITERATIONS;
  }
  return Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.floor(value)));
}

function getStressPlan(iteration, totalIterations) {
  const total = normalizePlanTotal(totalIterations);
  const rawIndex = Number(iteration);
  const index = Math.min(total - 1, Math.max(0, Number.isFinite(rawIndex) ? Math.floor(rawIndex) : 0));

  if (index % MAX_MODE_PERIOD === MAX_MODE_PERIOD - 1) {
    return { mode: 'max', sizeCap: null, valueCap: null, boundaryRate: BOUNDARY_RATE };
  }

  // Integer comparison keeps the 30% boundary exact.
  if (index * 10 < total * 3) {
    const phase = index / (total * SMALL_PHASE_END);
    return {
      mode: 'compare',
      sizeCap: Math.min(SMALL_SIZE_CAP, SMALL_SIZE_START + Math.floor((SMALL_SIZE_CAP - SMALL_SIZE_START + 1) * phase)),
      valueCap: Math.min(SMALL_VALUE_CAP, SMALL_VALUE_START + Math.floor((SMALL_VALUE_CAP - SMALL_VALUE_START + 1) * phase)),
      boundaryRate: BOUNDARY_RATE
    };
  }

  const ramp = Math.min(1, Math.max(0, (index / total - SMALL_PHASE_END) / (RAMP_END - SMALL_PHASE_END)));
  const sizeCap = Math.min(MAX_SIZE_CAP, SMALL_SIZE_CAP + Math.round((MAX_SIZE_CAP - SMALL_SIZE_CAP) * ramp));
  const valueCap = index * 10 >= total * 8 ? null : 10 ** (1 + Math.floor(8 * ramp));
  return { mode: 'compare', sizeCap, valueCap, boundaryRate: BOUNDARY_RATE };
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
    const result = await run(input);
    return isPlainObject(result) ? result : makeFailedRun('実行結果を受け取れませんでした。');
  } catch (error) {
    return makeFailedRun(errorText(error));
  }
}

// => null (success) | 'timeout' | 'outputLimit' | 'error'
function classifyRun(result) {
  if (!isPlainObject(result)) {
    return 'error';
  }
  if (result.timedOut) {
    return 'timeout';
  }
  if (result.outputLimitExceeded) {
    return 'outputLimit';
  }
  if (result.errorMessage || result.exitCode !== 0) {
    return 'error';
  }
  return null;
}

function buildResult(status, fields) {
  return {
    status,
    iteration: null,
    iterationsRun: 0,
    seed: null,
    caseSeed: null,
    mode: null,
    input: null,
    mainResult: null,
    naiveResult: null,
    comparison: null,
    message: '',
    ...fields
  };
}

function iterationLabel(iteration, mode) {
  return mode === 'max' ? `${iteration + 1} 回目（最大サイズの入力）` : `${iteration + 1} 回目`;
}

function mainFailureMessage(failure, label) {
  if (failure === 'timeout') {
    return `${label}で本番の解が時間切れになりました。`;
  }
  if (failure === 'outputLimit') {
    return `${label}で本番の解の出力が多すぎて止めました。`;
  }
  return `${label}で本番の解がエラーになりました。`;
}

function naiveFailureMessage(failure, label) {
  if (failure === 'timeout') {
    return `${label}で愚直解が時間切れになりました。`;
  }
  if (failure === 'outputLimit') {
    return `${label}で愚直解の出力が多すぎて止めました。`;
  }
  return `${label}で愚直解がエラーになりました。`;
}

function cancelledMessage(iterationsRun) {
  return `中止しました（終わった回数：${iterationsRun} 回）。`;
}

function resolveGenerate(generate) {
  if (typeof generate === 'function') {
    return generate;
  }
  try {
    // Loaded lazily so this module works even before inputGenerator.js is ready.
    const generator = require('./inputGenerator');
    return typeof generator.generateInput === 'function' ? generator.generateInput : null;
  } catch {
    return null;
  }
}

function resolveCompare(compare) {
  if (typeof compare === 'function') {
    return compare;
  }
  try {
    return require('./outputCompare').compareOutputs;
  } catch {
    return null;
  }
}

async function runStressTest(options) {
  const {
    format,
    iterations,
    seed,
    compareMode = DEFAULT_COMPARE_MODE,
    runMain,
    runNaive,
    generate,
    compare,
    isCancelled = () => false,
    onProgress = () => {}
  } = isPlainObject(options) ? options : {};

  if (typeof runMain !== 'function') {
    return { ok: false, message: '本番の解を動かす方法が渡されていません。' };
  }
  // Without a naive solution only runtime errors and timeouts of the main solution are checked.
  const hasNaive = typeof runNaive === 'function';

  const total = normalizeIterations(iterations);
  const baseSeed = seed === undefined || seed === null
    ? Math.floor(Math.random() * UINT32_RANGE) >>> 0
    : toUint32(seed);
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
      // A broken progress callback must not stop the test.
    }
  };

  const generateInput = resolveGenerate(generate);
  if (!generateInput) {
    return buildResult('generatorError', {
      iteration: 0,
      seed: baseSeed,
      message: '入力を作る機能を読み込めませんでした。'
    });
  }

  const compareOutputs = resolveCompare(compare);
  if (!compareOutputs) {
    return { ok: false, message: '出力を比べる機能を読み込めませんでした。' };
  }

  for (let iteration = 0; iteration < total; iteration += 1) {
    if (cancelled()) {
      return buildResult('cancelled', {
        iteration,
        iterationsRun: iteration,
        seed: baseSeed,
        message: cancelledMessage(iteration)
      });
    }

    const plan = getStressPlan(iteration, total);
    const caseSeed = deriveCaseSeed(baseSeed, iteration);
    const label = iterationLabel(iteration, plan.mode);
    const caseFields = { iteration, seed: baseSeed, caseSeed, mode: plan.mode };
    reportProgress({ iteration, total, mode: plan.mode, sizeCap: plan.sizeCap, valueCap: plan.valueCap });

    let generated;
    try {
      generated = await generateInput(format, {
        seed: caseSeed,
        mode: plan.mode,
        sizeCap: plan.sizeCap,
        valueCap: plan.valueCap,
        boundaryRate: plan.boundaryRate
      });
    } catch (error) {
      generated = { ok: false, message: errorText(error) };
    }

    if (!isPlainObject(generated) || generated.ok !== true || typeof generated.input !== 'string') {
      const reason = isPlainObject(generated) && typeof generated.message === 'string' ? generated.message.trim() : '';
      return buildResult('generatorError', {
        ...caseFields,
        iterationsRun: iteration,
        message: reason ? `${label}の入力を作れませんでした：${reason}` : `${label}の入力を作れませんでした。`
      });
    }

    const input = generated.input;
    const mainResult = await runSafely(runMain, input);
    if (cancelled()) {
      return buildResult('cancelled', {
        ...caseFields,
        iterationsRun: iteration,
        input,
        mainResult,
        message: cancelledMessage(iteration)
      });
    }

    const mainFailure = classifyRun(mainResult);
    const mainStatus = mainFailure === 'timeout' ? 'mainTimeout' : 'mainError';

    if (plan.mode === 'max' || !hasNaive) {
      if (mainFailure) {
        return buildResult(mainStatus, {
          ...caseFields,
          iterationsRun: iteration + 1,
          input,
          mainResult,
          message: mainFailureMessage(mainFailure, label)
        });
      }
      continue;
    }

    // Run the naive solution even when main failed, so its output can be kept as the expected output.
    const naiveResult = await runSafely(runNaive, input);
    if (cancelled()) {
      return buildResult('cancelled', {
        ...caseFields,
        iterationsRun: iteration,
        input,
        mainResult,
        naiveResult,
        message: cancelledMessage(iteration)
      });
    }

    if (mainFailure) {
      return buildResult(mainStatus, {
        ...caseFields,
        iterationsRun: iteration + 1,
        input,
        mainResult,
        naiveResult,
        message: mainFailureMessage(mainFailure, label)
      });
    }

    const naiveFailure = classifyRun(naiveResult);
    if (naiveFailure) {
      return buildResult('naiveError', {
        ...caseFields,
        iterationsRun: iteration + 1,
        input,
        mainResult,
        naiveResult,
        message: naiveFailureMessage(naiveFailure, label)
      });
    }

    const comparison = compareOutputs(naiveResult.stdout, mainResult.stdout, compareMode);
    if (!isPlainObject(comparison) || comparison.equal !== true) {
      return buildResult('mismatch', {
        ...caseFields,
        iterationsRun: iteration + 1,
        input,
        mainResult,
        naiveResult,
        comparison,
        message: `${label}で出力が違いました。`
      });
    }
  }

  return buildResult('passed', {
    iterationsRun: total,
    seed: baseSeed,
    message: hasNaive
      ? `${total} 回すべて通りました。`
      : `${total} 回とも、実行時エラーも時間切れもありませんでした（愚直解がないので、出力が正しいかは比べていません）。`
  });
}

module.exports = {
  deriveCaseSeed,
  getStressPlan,
  runStressTest
};
