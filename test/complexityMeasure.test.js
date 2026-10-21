const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  MEASURE_SCALES,
  compareModels,
  fitGrowth,
  planMeasurement,
  runMeasurement
} = require('../src/complexity/measure');

const INPUT_GENERATOR_SUFFIX = path.join('src', 'verify', 'inputGenerator.js');
const FORMAT = {
  rows: [
    { kind: 'ints', vars: [{ name: 'N', min: '1', max: '2×10^5' }] },
    { kind: 'intList', name: 'A', length: 'N', min: '1', max: '10^9', layout: 'row', distinct: false, order: 'none' }
  ]
};
const PLAN_SIZES = [3125, 12500, 50000, 200000];

const log2 = (n) => Math.max(1, Math.log2(n));
const MODEL_FUNCTIONS = {
  'O(1)': () => 1,
  'O(log N)': (n) => log2(n),
  'O(N)': (n) => n,
  'O(N log N)': (n) => n * log2(n),
  'O(N²)': (n) => n * n,
  'O(N³)': (n) => n * n * n
};
// Noise that does not trend with n, so it cannot turn one model into another.
const NOISE_PATTERNS = [
  [1, 1, 1, 1],
  [1.1, 0.9, 1.1, 0.9],
  [0.9, 1.1, 0.9, 1.1],
  [1.05, 0.92, 1.08, 0.97],
  [0.95, 1.07, 0.94, 1.03]
];

function synthetic(model, { smallest = null, largest = null, noise = [1, 1, 1, 1], sizes = PLAN_SIZES } = {}) {
  const f = MODEL_FUNCTIONS[model];
  const c = smallest !== null ? smallest / f(sizes[0]) : largest / f(sizes[sizes.length - 1]);
  return sizes.map((n, index) => ({ n, seconds: c * f(n) * noise[index % noise.length], timedOut: false }));
}

function okRun(elapsedMs, stdout = 'ok\n') {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    outputLimitExceeded: false,
    errorMessage: '',
    elapsedMs
  };
}

// Fake generator whose input is "<sizeCap>\n" and whose N equals the size cap.
function makeHarness({ mainFor, baselineFor, generateFor } = {}) {
  const calls = { generate: [], main: [], baseline: 0, log: [] };
  return {
    calls,
    generate(format, options) {
      const index = calls.generate.length;
      calls.generate.push({ format, options });
      calls.log.push(`generate:${options.sizeCap}`);
      if (generateFor) {
        return generateFor(index, options);
      }
      return { ok: true, input: `${options.sizeCap}\n`, values: { N: String(options.sizeCap) } };
    },
    async runMain(input) {
      const n = Number(input.trim());
      const run = calls.main.filter((call) => call.n === n).length;
      calls.main.push({ n, run });
      calls.log.push(`main:${n}:${run}`);
      // Default: 20 ms start-up plus n / 100 ms of work, slower on later runs.
      return mainFor ? mainFor(n, run) : okRun(20 + n / 100 + run * 3);
    },
    async runBaseline() {
      const run = calls.baseline;
      calls.baseline += 1;
      calls.log.push(`baseline:${run}`);
      return baselineFor ? baselineFor(run) : okRun([30, 20, 25][run % 3]);
    }
  };
}

function measureWith(harness, options = {}) {
  return runMeasurement({
    format: FORMAT,
    runMain: harness.runMain,
    runBaseline: harness.runBaseline,
    generate: harness.generate,
    timeoutMs: 5000,
    ...options
  });
}

test('measure does not load inputGenerator until it is needed', () => {
  const loaded = Object.keys(require.cache).some((key) => key.endsWith(INPUT_GENERATOR_SUFFIX));
  assert.equal(loaded, false);
});

test('MEASURE_SCALES has the documented scales', () => {
  assert.deepEqual([...MEASURE_SCALES], [1 / 64, 1 / 16, 1 / 4, 1]);
});

test('planMeasurement plans the sizes for N up to 2×10^5', () => {
  assert.deepEqual(planMeasurement(FORMAT), {
    ok: true,
    primaryVar: 'N',
    primaryMax: 200000,
    steps: [
      { scale: 1 / 64, sizeCap: 3125 },
      { scale: 1 / 16, sizeCap: 12500 },
      { scale: 1 / 4, sizeCap: 50000 },
      { scale: 1, sizeCap: 200000 }
    ]
  });
});

test('planMeasurement picks the size variable with the largest maximum', () => {
  const format = {
    rows: [
      { kind: 'ints', vars: [{ name: 'Q', min: '1', max: '10^9' }, { name: 'H', min: '1', max: '500' }, { name: 'W', min: '1', max: '2000' }] },
      { kind: 'grid', name: 'S', rows: 'H', cols: 'W', charset: 'custom', chars: '.#' }
    ]
  };
  const plan = planMeasurement(format);
  assert.equal(plan.ok, true);
  assert.equal(plan.primaryVar, 'W');
  assert.equal(plan.primaryMax, 2000);
  assert.deepEqual(plan.steps.map((step) => step.sizeCap), [31, 125, 500, 2000]);
});

test('planMeasurement breaks ties by declaration order', () => {
  const format = {
    rows: [
      { kind: 'ints', vars: [{ name: 'N', min: '1', max: '1000' }, { name: 'M', min: '1', max: 'N' }] },
      { kind: 'intList', name: 'B', length: 'M', min: '1', max: '9', layout: 'row', distinct: false, order: 'none' }
    ]
  };
  const plan = planMeasurement(format);
  assert.equal(plan.primaryVar, 'N');
  assert.equal(plan.primaryMax, 1000);
});

test('planMeasurement drops repeated sizes for a small maximum', () => {
  const format = {
    rows: [
      { kind: 'ints', vars: [{ name: 'N', min: '1', max: '8' }] },
      { kind: 'string', name: 'S', minLength: '', maxLength: 'N', charset: 'lower', chars: '' }
    ]
  };
  const plan = planMeasurement(format);
  assert.deepEqual(plan.steps, [
    { scale: 1 / 64, sizeCap: 1 },
    { scale: 1 / 4, sizeCap: 2 },
    { scale: 1, sizeCap: 8 }
  ]);
});

test('planMeasurement reports empty, invalid and size-less formats', () => {
  const cases = [
    null,
    undefined,
    {},
    { rows: [] },
    { rows: [{ kind: 'ints', vars: [{ name: 'N', min: '1', max: '2N' }] }] },
    { rows: [{ kind: 'ints', vars: [{ name: 'N', min: '1', max: '10^9' }, { name: 'M', min: '1', max: '5' }] }] },
    { rows: [{ kind: 'string', name: 'S', minLength: '', maxLength: '100', charset: 'lower', chars: '' }] }
  ];
  for (const format of cases) {
    const plan = planMeasurement(format);
    assert.equal(plan.ok, false, JSON.stringify(format));
    assert.ok(plan.message.length > 0);
  }
  assert.match(planMeasurement({ rows: [] }).message, /入力形式/);
  assert.match(planMeasurement(cases[5]).message, /変数/);
});

test('fitGrowth finds each model from noisy timings', () => {
  for (const model of Object.keys(MODEL_FUNCTIONS)) {
    for (const noise of NOISE_PATTERNS) {
      const fit = fitGrowth(synthetic(model, { smallest: 0.05, noise }));
      assert.deepEqual(fit, { model, confidence: 'high' }, `${model} with noise ${noise.join(',')}`);
    }
  }
});

test('fitGrowth finds each model when only the larger sizes are long enough to trust', () => {
  for (const model of ['O(N)', 'O(N log N)', 'O(N²)', 'O(N³)']) {
    for (const noise of NOISE_PATTERNS) {
      const points = synthetic(model, { largest: 1.5, noise });
      assert.equal(fitGrowth(points).model, model, `${model} with noise ${noise.join(',')}`);
    }
  }
});

test('fitGrowth works on sizes that are not powers of four apart', () => {
  const sizes = [10, 40, 160, 640];
  for (const model of ['O(N)', 'O(N²)', 'O(N³)']) {
    const fit = fitGrowth(synthetic(model, { smallest: 0.02, sizes, noise: [1.08, 0.94, 1.03, 0.97] }));
    assert.deepEqual(fit, { model, confidence: 'high' }, model);
  }
});

test('fitGrowth gives low confidence when every time is too short', () => {
  const points = PLAN_SIZES.map((n, index) => ({ n, seconds: [0.001, 0.002, 0, 0.004][index] }));
  assert.deepEqual(fitGrowth(points), { model: 'O(1)', confidence: 'low' });
  assert.deepEqual(fitGrowth(synthetic('O(N)', { largest: 0.008 })), { model: 'O(1)', confidence: 'low' });
});

test('fitGrowth calls flat but measurable times O(1)', () => {
  const points = PLAN_SIZES.map((n, index) => ({ n, seconds: [0.5, 0.52, 0.49, 0.51][index] }));
  assert.deepEqual(fitGrowth(points), { model: 'O(1)', confidence: 'high' });
});

test('fitGrowth gives low confidence with fewer than two usable points', () => {
  assert.equal(fitGrowth([]).confidence, 'low');
  assert.equal(fitGrowth(null).confidence, 'low');
  assert.equal(fitGrowth([{ n: 200000, seconds: 1 }]).confidence, 'low');
  assert.equal(fitGrowth([{ n: 1, seconds: 1 }, { n: 1, seconds: 1.1 }, { n: 1, seconds: 0.9 }]).confidence, 'low');
  assert.equal(fitGrowth([{ n: 3125, seconds: 0.001 }, { n: 200000, seconds: 1 }]).confidence, 'low');
  assert.equal(fitGrowth([{ n: Number.NaN, seconds: 1 }, { n: 5, seconds: -1 }, null, 'x']).confidence, 'low');
});

test('fitGrowth leaves out timed-out points', () => {
  const points = synthetic('O(N)', { smallest: 0.05 });
  points[3] = { ...points[3], seconds: 2, timedOut: true };
  assert.deepEqual(fitGrowth(points), { model: 'O(N)', confidence: 'high' });
});

test('fitGrowth gives low confidence for timings that fit no model', () => {
  const points = PLAN_SIZES.map((n, index) => ({ n, seconds: [0.5, 0.02, 3, 0.1][index] }));
  assert.equal(fitGrowth(points).confidence, 'low');
});

test('compareModels agrees when the models match', () => {
  const result = compareModels('O(N)', 'O(N)');
  assert.equal(result.mismatch, false);
  assert.match(result.message, /合って/);
});

test('compareModels does not count a log factor as a mismatch', () => {
  for (const [measured, expected] of [['O(N)', 'O(N log N)'], ['O(N log N)', 'O(N)'], ['O(1)', 'O(log N)']]) {
    const result = compareModels(measured, expected);
    assert.equal(result.mismatch, false, `${measured} vs ${expected}`);
    assert.ok(result.message.length > 0);
  }
});

test('compareModels reports a slower measurement as a mismatch', () => {
  const result = compareModels('O(N²)', 'O(N)');
  assert.equal(result.mismatch, true);
  assert.match(result.message, /O\(N²\)/);
  assert.match(result.message, /遅い/);
});

test('compareModels reports a faster measurement as a mismatch too', () => {
  const result = compareModels('O(N)', 'O(N³)');
  assert.equal(result.mismatch, true);
  assert.match(result.message, /速い/);
});

test('compareModels does not compare "other" or unknown models', () => {
  for (const [measured, expected] of [['O(N)', 'other'], ['O(N²)', 'O(2^N)'], [null, 'O(N)'], ['other', 'O(N)']]) {
    const result = compareModels(measured, expected);
    assert.equal(result.mismatch, false, `${measured} vs ${expected}`);
    assert.ok(result.message.length > 0);
  }
});

test('runMeasurement subtracts the baseline from the fastest of three runs', async () => {
  const harness = makeHarness();
  const result = await measureWith(harness);
  assert.equal(result.ok, true);
  assert.equal(result.baselineSeconds, 0.02);
  assert.equal(result.stoppedAtScale, null);
  assert.equal(result.points.length, 4);
  result.points.forEach((point, index) => {
    assert.equal(point.scale, MEASURE_SCALES[index]);
    assert.equal(point.n, PLAN_SIZES[index]);
    assert.equal(point.timedOut, false);
    assert.ok(Math.abs(point.seconds - PLAN_SIZES[index] / 1e5) < 1e-9, `${point.seconds}`);
  });
  assert.deepEqual(result.fit, { model: 'O(N)', confidence: 'high' });
  assert.equal(harness.calls.baseline, 3);
  assert.equal(harness.calls.main.length, 12);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('runMeasurement asks the generator for max-mode inputs with fixed seeds', async () => {
  const harness = makeHarness();
  await measureWith(harness);
  assert.equal(harness.calls.generate.length, 4);
  harness.calls.generate.forEach(({ format, options }, index) => {
    assert.equal(format, FORMAT);
    assert.equal(options.mode, 'max');
    assert.equal(options.sizeCap, PLAN_SIZES[index]);
    assert.ok(Number.isInteger(options.seed) && options.seed >= 0 && options.seed <= 0xffffffff);
  });

  const again = makeHarness();
  await measureWith(again);
  assert.deepEqual(again.calls.generate.map((call) => call.options), harness.calls.generate.map((call) => call.options));
});

test('runMeasurement floors the time at zero', async () => {
  const harness = makeHarness({ mainFor: () => okRun(5) });
  const result = await measureWith(harness);
  assert.equal(result.ok, true);
  assert.deepEqual(result.points.map((point) => point.seconds), [0, 0, 0, 0]);
  assert.equal(result.fit.confidence, 'low');
});

test('runMeasurement records n from the generated values', async () => {
  const harness = makeHarness({
    generateFor: (index, options) => ({ ok: true, input: `${options.sizeCap}\n`, values: { N: String(options.sizeCap - 1) } })
  });
  const result = await measureWith(harness);
  assert.deepEqual(result.points.map((point) => point.n), PLAN_SIZES.map((size) => size - 1));

  const noValues = makeHarness({ generateFor: (index, options) => ({ ok: true, input: `${options.sizeCap}\n` }) });
  const fallback = await measureWith(noValues);
  assert.deepEqual(fallback.points.map((point) => point.n), PLAN_SIZES);
});

test('runMeasurement stops after a timeout and skips larger sizes', async () => {
  const harness = makeHarness({
    mainFor: (n) => (n === 50000 ? { ...okRun(2010, ''), exitCode: null, timedOut: true } : okRun(20 + n / 100))
  });
  const result = await measureWith(harness);
  assert.equal(result.ok, true);
  assert.equal(result.stoppedAtScale, 1 / 4);
  assert.equal(result.points.length, 3);
  assert.deepEqual(result.points.map((point) => point.timedOut), [false, false, true]);
  assert.equal(result.points[2].n, 50000);
  assert.deepEqual(harness.calls.main.map((call) => call.n), [3125, 3125, 3125, 12500, 12500, 12500, 50000]);
  assert.equal(harness.calls.generate.length, 3);
});

test('runMeasurement stops when a run takes longer than the time limit', async () => {
  const harness = makeHarness({ mainFor: (n) => okRun(20 + n / 20) });
  const result = await measureWith(harness, { timeoutMs: 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.stoppedAtScale, 1 / 4);
  assert.equal(result.points.length, 3);
  assert.equal(result.points[2].timedOut, false);
  assert.ok(Math.abs(result.points[2].seconds - 2.5) < 1e-9);
  assert.equal(harness.calls.main.length, 9);
});

test('runMeasurement marks a timeout at the largest size', async () => {
  const harness = makeHarness({
    mainFor: (n) => (n === 200000 ? { ...okRun(5010, ''), exitCode: null, timedOut: true } : okRun(20 + n / 100))
  });
  const result = await measureWith(harness);
  assert.equal(result.ok, true);
  assert.equal(result.stoppedAtScale, 1);
  assert.equal(result.points.length, 4);
  assert.equal(result.points[3].timedOut, true);
  assert.deepEqual(result.fit, { model: 'O(N)', confidence: 'high' });
});

test('runMeasurement stops with a message when main fails', async () => {
  const failures = [
    { exitCode: 1, stderr: 'Traceback' },
    { exitCode: null, errorMessage: '起動できません' },
    { outputLimitExceeded: true }
  ];
  for (const failure of failures) {
    const harness = makeHarness({ mainFor: (n) => (n === 12500 ? { ...okRun(30, ''), ...failure } : okRun(20 + n / 100)) });
    const result = await measureWith(harness);
    assert.equal(result.ok, false, JSON.stringify(failure));
    assert.match(result.message, /本番の解がエラー/);
    assert.match(result.message, /12500/);
    assert.equal(harness.calls.main.length, 4);
  }
});

test('runMeasurement treats a rejected main run as an error', async () => {
  const harness = makeHarness({
    mainFor: () => {
      throw new Error('spawn failed');
    }
  });
  const result = await measureWith(harness);
  assert.equal(result.ok, false);
  assert.match(result.message, /spawn failed/);
});

test('runMeasurement reports a broken baseline', async () => {
  const cases = [
    () => ({ ...okRun(10), exitCode: 1 }),
    () => ({ ...okRun(10), errorMessage: 'Python が見つかりません' }),
    () => ({ ...okRun(10), timedOut: true }),
    () => {
      throw new Error('spawn failed');
    }
  ];
  for (const baselineFor of cases) {
    const harness = makeHarness({ baselineFor });
    const result = await measureWith(harness);
    assert.equal(result.ok, false);
    assert.match(result.message, /起動時間/);
    assert.equal(harness.calls.main.length, 0);
  }
});

test('runMeasurement reports a generator failure at the first size', async () => {
  const harness = makeHarness({ generateFor: () => ({ ok: false, message: '範囲が空です。' }) });
  const result = await measureWith(harness);
  assert.equal(result.ok, false);
  assert.match(result.message, /範囲が空です。/);
  assert.equal(harness.calls.main.length, 0);

  const throwing = makeHarness({
    generateFor: () => {
      throw new Error('broken generator');
    }
  });
  assert.match((await measureWith(throwing)).message, /broken generator/);
});

test('runMeasurement keeps earlier points when a larger input cannot be made', async () => {
  const harness = makeHarness({
    generateFor: (index, options) => (index === 2
      ? { ok: false, message: '入力が大きすぎます。' }
      : { ok: true, input: `${options.sizeCap}\n`, values: { N: String(options.sizeCap) } })
  });
  const result = await measureWith(harness);
  assert.equal(result.ok, true);
  assert.equal(result.points.length, 2);
  assert.equal(result.stoppedAtScale, null);
  assert.match(result.message, /入力が大きすぎます。/);
  assert.equal(harness.calls.generate.length, 3);
});

test('runMeasurement reports progress before each size', async () => {
  const harness = makeHarness();
  const progress = [];
  await measureWith(harness, {
    onProgress(update) {
      progress.push(update);
      harness.calls.log.push(`progress:${update.step}`);
    }
  });
  assert.deepEqual(progress, MEASURE_SCALES.map((scale, step) => ({ step, total: 4, scale })));
  assert.deepEqual(harness.calls.log.slice(0, 6), ['baseline:0', 'baseline:1', 'baseline:2', 'progress:0', 'generate:3125', 'main:3125:0']);
});

test('runMeasurement stops before starting when already cancelled', async () => {
  const harness = makeHarness();
  const result = await measureWith(harness, { isCancelled: () => true });
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.match(result.message, /中止/);
  assert.equal(harness.calls.baseline, 0);
  assert.equal(harness.calls.main.length, 0);
});

test('runMeasurement checks cancellation between runs', async () => {
  let cancelled = false;
  const harness = makeHarness({
    mainFor: (n, run) => {
      if (n === 12500 && run === 1) {
        cancelled = true;
      }
      return okRun(20 + n / 100);
    }
  });
  const result = await measureWith(harness, { isCancelled: () => cancelled });
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(harness.calls.main.length, 5);
  assert.equal(harness.calls.generate.length, 2);
});

test('runMeasurement checks cancellation during the baseline runs', async () => {
  let cancelled = false;
  const harness = makeHarness({
    baselineFor: () => {
      cancelled = true;
      return okRun(20);
    }
  });
  const result = await measureWith(harness, { isCancelled: () => cancelled });
  assert.equal(result.cancelled, true);
  assert.equal(harness.calls.baseline, 1);
  assert.equal(harness.calls.generate.length, 0);
});

test('runMeasurement survives throwing callbacks', async () => {
  const harness = makeHarness();
  const result = await measureWith(harness, {
    onProgress: () => {
      throw new Error('ui closed');
    },
    isCancelled: () => {
      throw new Error('broken');
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.points.length, 4);
});

test('runMeasurement returns ok false for missing runners or a bad format', async () => {
  const harness = makeHarness();
  const cases = [
    undefined,
    null,
    {},
    { format: FORMAT, runBaseline: harness.runBaseline },
    { format: FORMAT, runMain: harness.runMain },
    { format: { rows: [] }, runMain: harness.runMain, runBaseline: harness.runBaseline }
  ];
  for (const options of cases) {
    const result = await runMeasurement(options);
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0);
  }
  assert.equal(harness.calls.main.length, 0);
});

test('runMeasurement uses the real input generator by default', async () => {
  const format = {
    rows: [
      { kind: 'ints', vars: [{ name: 'N', min: '1', max: '640' }] },
      { kind: 'intList', name: 'A', length: 'N', min: '1', max: '100', layout: 'row', distinct: false, order: 'none' }
    ]
  };
  const seen = [];
  const runMain = async (input) => {
    const [first, second] = input.split('\n');
    const n = Number(first);
    seen.push({ n, count: second.split(' ').length });
    return okRun(20 + n * n / 100);
  };
  const result = await runMeasurement({ format, runMain, runBaseline: async () => okRun(20), timeoutMs: 1e9 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.points.map((point) => point.n), [10, 40, 160, 640]);
  assert.ok(seen.every((entry) => entry.count === entry.n));
  assert.deepEqual(result.fit, { model: 'O(N²)', confidence: 'high' });
});
