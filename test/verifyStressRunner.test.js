const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { deriveCaseSeed, getStressPlan, runStressTest } = require('../src/verify/stressRunner');

const INPUT_GENERATOR_SUFFIX = path.join('src', 'verify', 'inputGenerator.js');
const FORMAT = { rows: [{ kind: 'ints', vars: [{ name: 'N', min: '1', max: '10' }] }] };

function okRun(stdout = 'ok\n') {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    outputLimitExceeded: false,
    errorMessage: '',
    elapsedMs: 1
  };
}

function iterationOf(input) {
  return Number(input.split(' ')[0]);
}

function modeOf(input) {
  return input.trim().split(' ')[1];
}

// Fake generator whose input is "<iteration> <mode> <seed>\n", so fakes can tell cases apart.
function makeHarness({ mainFor, naiveFor, generateFor } = {}) {
  const calls = { generate: [], main: [], naive: [], log: [] };
  return {
    calls,
    generate(format, options) {
      const iteration = calls.generate.length;
      calls.generate.push({ format, options });
      calls.log.push(`generate:${iteration}`);
      if (generateFor) {
        return generateFor(iteration, options);
      }
      return { ok: true, input: `${iteration} ${options.mode} ${options.seed}\n`, values: {} };
    },
    async runMain(input) {
      calls.main.push(input);
      calls.log.push(`main:${iterationOf(input)}`);
      return mainFor ? mainFor(input) : okRun();
    },
    async runNaive(input) {
      calls.naive.push(input);
      calls.log.push(`naive:${iterationOf(input)}`);
      return naiveFor ? naiveFor(input) : okRun();
    }
  };
}

function runWithHarness(harness, options = {}) {
  return runStressTest({
    format: FORMAT,
    iterations: 20,
    seed: 42,
    compareMode: 'tokens',
    runMain: harness.runMain,
    runNaive: harness.runNaive,
    generate: harness.generate,
    ...options
  });
}

// Small seeded PRNG for the tests (mulberry32).
function createTestRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('stressRunner does not load inputGenerator until it is needed', () => {
  const loaded = Object.keys(require.cache).some((key) => key.endsWith(INPUT_GENERATOR_SUFFIX));
  assert.equal(loaded, false);
});

test('deriveCaseSeed returns a 32-bit unsigned integer', () => {
  for (const seed of [0, 1, 42, 12345, 2 ** 32 - 1]) {
    for (const iteration of [0, 1, 9, 999, 9999]) {
      const caseSeed = deriveCaseSeed(seed, iteration);
      assert.ok(Number.isInteger(caseSeed));
      assert.ok(caseSeed >= 0 && caseSeed <= 2 ** 32 - 1);
    }
  }
});

test('deriveCaseSeed is deterministic and differs per iteration and seed', () => {
  assert.equal(deriveCaseSeed(12345, 7), deriveCaseSeed(12345, 7));
  const seen = new Set();
  for (let iteration = 0; iteration < 10000; iteration += 1) {
    seen.add(deriveCaseSeed(12345, iteration));
  }
  assert.equal(seen.size, 10000);
  assert.notEqual(deriveCaseSeed(1, 0), deriveCaseSeed(2, 0));
  assert.notEqual(deriveCaseSeed(0, 0), deriveCaseSeed(0, 1));
});

test('deriveCaseSeed treats seeds as 32-bit values', () => {
  assert.equal(deriveCaseSeed(-1, 3), deriveCaseSeed(2 ** 32 - 1, 3));
  assert.equal(deriveCaseSeed(2 ** 32, 3), deriveCaseSeed(0, 3));
  assert.equal(deriveCaseSeed('5', 3), deriveCaseSeed(5, 3));
  assert.equal(deriveCaseSeed(5n, 3), deriveCaseSeed(5, 3));
  assert.equal(deriveCaseSeed(Number.NaN, 3), deriveCaseSeed(0, 3));
});

test('getStressPlan follows the size and value rules for several totals', () => {
  for (const total of [1, 2, 3, 10, 25, 100, 1000]) {
    let previousSize = 0;
    let previousValue = 0;
    let lastCompare = null;
    for (let iteration = 0; iteration < total; iteration += 1) {
      const plan = getStressPlan(iteration, total);
      const where = `total ${total}, iteration ${iteration}`;
      assert.equal(plan.boundaryRate, 0.2, where);

      if (iteration % 10 === 9) {
        assert.deepEqual(plan, { mode: 'max', sizeCap: null, valueCap: null, boundaryRate: 0.2 }, where);
        continue;
      }

      assert.equal(plan.mode, 'compare', where);
      assert.ok(Number.isInteger(plan.sizeCap) && plan.sizeCap >= 1 && plan.sizeCap <= 20, where);
      if (total >= 10 && iteration * 10 >= total * 8) {
        assert.equal(plan.sizeCap, 20, where);
      }
      assert.ok(plan.valueCap === null || (Number.isInteger(plan.valueCap) && plan.valueCap >= 1), where);

      if (iteration * 10 < total * 3) {
        assert.ok(plan.sizeCap <= 8, where);
        assert.notEqual(plan.valueCap, null, where);
        assert.ok(plan.valueCap <= 10, where);
      }

      const valueRank = plan.valueCap === null ? Infinity : plan.valueCap;
      assert.ok(plan.sizeCap >= previousSize, `sizeCap must not decrease (${where})`);
      assert.ok(valueRank >= previousValue, `valueCap must not decrease (${where})`);
      previousSize = plan.sizeCap;
      previousValue = valueRank;
      lastCompare = plan;
    }

    if (total >= 10) {
      assert.equal(lastCompare.valueCap, null, `total ${total}`);
      assert.equal(lastCompare.sizeCap, 20, `total ${total}`);
    }
  }
});

test('getStressPlan opens valueCap only near the end', () => {
  for (const total of [10, 100, 1000]) {
    for (let iteration = 0; iteration < total; iteration += 1) {
      const plan = getStressPlan(iteration, total);
      if (plan.mode !== 'compare') {
        continue;
      }
      if (iteration * 10 >= total * 9) {
        assert.equal(plan.valueCap, null, `total ${total}, iteration ${iteration}`);
      }
      if (iteration * 2 < total) {
        assert.notEqual(plan.valueCap, null, `total ${total}, iteration ${iteration}`);
      }
    }
  }
});

test('getStressPlan starts tiny and grows', () => {
  const first = getStressPlan(0, 100);
  assert.equal(first.mode, 'compare');
  assert.ok(first.sizeCap <= 3);
  assert.ok(first.valueCap <= 5);
  assert.ok(getStressPlan(50, 100).sizeCap > 8);
  assert.ok(getStressPlan(50, 100).valueCap > 10);
});

test('getStressPlan tolerates odd arguments', () => {
  for (const [iteration, total] of [[5, 0], [Number.NaN, Number.NaN], [-3, 10], [500, 10], [2.5, 10]]) {
    const plan = getStressPlan(iteration, total);
    assert.ok(plan.mode === 'compare' || plan.mode === 'max');
    assert.equal(plan.boundaryRate, 0.2);
  }
  assert.equal(getStressPlan(500, 10).mode, 'max');
});

test('runStressTest passes when every case agrees', async () => {
  const harness = makeHarness();
  const result = await runWithHarness(harness);
  assert.equal(result.status, 'passed');
  assert.equal(result.iterationsRun, 20);
  assert.equal(result.iteration, null);
  assert.equal(result.seed, 42);
  assert.equal(result.caseSeed, null);
  assert.equal(result.input, null);
  assert.equal(result.message, '20 回すべて通りました。');
  assert.equal(harness.calls.generate.length, 20);
  assert.equal(harness.calls.main.length, 20);
  assert.equal(harness.calls.naive.length, 18);
});

test('runStressTest runs only main on max iterations', async () => {
  const harness = makeHarness();
  await runWithHarness(harness, { iterations: 30 });
  const maxInputs = harness.calls.main.filter((input) => modeOf(input) === 'max');
  assert.deepEqual(maxInputs.map(iterationOf), [9, 19, 29]);
  assert.equal(harness.calls.naive.some((input) => modeOf(input) === 'max'), false);
  assert.equal(harness.calls.naive.length, 27);
});

test('runStressTest passes the plan and derived seed to the generator', async () => {
  const harness = makeHarness();
  await runWithHarness(harness, { iterations: 25, seed: 777 });
  harness.calls.generate.forEach(({ format, options }, iteration) => {
    const plan = getStressPlan(iteration, 25);
    assert.equal(format, FORMAT);
    assert.deepEqual(options, {
      seed: deriveCaseSeed(777, iteration),
      mode: plan.mode,
      sizeCap: plan.sizeCap,
      valueCap: plan.valueCap,
      boundaryRate: 0.2
    });
  });
});

test('runStressTest reports progress before each iteration', async () => {
  const harness = makeHarness();
  const progress = [];
  await runWithHarness(harness, {
    onProgress(update) {
      progress.push(update);
      harness.calls.log.push(`progress:${update.iteration}`);
    }
  });
  assert.equal(progress.length, 20);
  progress.forEach((update, iteration) => {
    const plan = getStressPlan(iteration, 20);
    assert.deepEqual(update, {
      iteration,
      total: 20,
      mode: plan.mode,
      sizeCap: plan.sizeCap,
      valueCap: plan.valueCap
    });
  });
  assert.deepEqual(harness.calls.log.slice(0, 4), ['progress:0', 'generate:0', 'main:0', 'naive:0']);
});

test('runStressTest reports a mismatch with the failing case', async () => {
  const harness = makeHarness({
    mainFor: (input) => (iterationOf(input) === 4 ? okRun('wrong\n') : okRun())
  });
  const result = await runWithHarness(harness);
  assert.equal(result.status, 'mismatch');
  assert.equal(result.iteration, 4);
  assert.equal(result.iterationsRun, 5);
  assert.equal(result.mode, 'compare');
  assert.equal(result.seed, 42);
  assert.equal(result.caseSeed, deriveCaseSeed(42, 4));
  assert.equal(result.input, `4 compare ${deriveCaseSeed(42, 4)}\n`);
  assert.equal(result.mainResult.stdout, 'wrong\n');
  assert.equal(result.naiveResult.stdout, 'ok\n');
  assert.deepEqual(result.comparison, { equal: false, expectedDiffLines: [0], actualDiffLines: [0] });
  assert.equal(result.message, '5 回目で出力が違いました。');
  assert.equal(harness.calls.main.length, 5);
  assert.equal(harness.calls.naive.length, 5);
});

test('runStressTest compares naive output as expected and main output as actual', async () => {
  const seen = [];
  const harness = makeHarness({
    mainFor: () => okRun('main\n'),
    naiveFor: () => okRun('naive\n')
  });
  const result = await runWithHarness(harness, {
    compareMode: 'float',
    compare(expected, actual, mode) {
      seen.push({ expected, actual, mode });
      return { equal: false, expectedDiffLines: [0], actualDiffLines: [0] };
    }
  });
  assert.equal(result.status, 'mismatch');
  assert.deepEqual(seen, [{ expected: 'naive\n', actual: 'main\n', mode: 'float' }]);
});

test('runStressTest reports main errors and still runs naive on compare iterations', async () => {
  const failures = [
    { exitCode: 1 },
    { exitCode: null },
    { errorMessage: '起動できません' },
    { outputLimitExceeded: true, errorMessage: '出力が多すぎます' }
  ];
  for (const failure of failures) {
    const harness = makeHarness({
      mainFor: (input) => (iterationOf(input) === 2 ? { ...okRun(''), ...failure } : okRun())
    });
    const result = await runWithHarness(harness);
    assert.equal(result.status, 'mainError', JSON.stringify(failure));
    assert.equal(result.iteration, 2);
    assert.equal(result.iterationsRun, 3);
    assert.equal(result.mode, 'compare');
    assert.equal(result.naiveResult.stdout, 'ok\n');
    assert.equal(result.comparison, null);
    assert.equal(harness.calls.naive.length, 3);
    assert.match(result.message, /^3 回目で本番の解/);
  }
});

test('runStressTest reports a main timeout before other failure signs', async () => {
  const harness = makeHarness({
    mainFor: (input) => (iterationOf(input) === 3
      ? { ...okRun(''), exitCode: null, timedOut: true, errorMessage: '2000 ms でタイムアウトしました。' }
      : okRun())
  });
  const result = await runWithHarness(harness);
  assert.equal(result.status, 'mainTimeout');
  assert.equal(result.iteration, 3);
  assert.equal(result.naiveResult.stdout, 'ok\n');
  assert.equal(result.message, '4 回目で本番の解が時間切れになりました。');
});

test('runStressTest reports main failures on max iterations without running naive', async () => {
  const cases = [
    [{ exitCode: 1 }, 'mainError'],
    [{ timedOut: true, exitCode: null }, 'mainTimeout']
  ];
  for (const [failure, status] of cases) {
    const harness = makeHarness({
      mainFor: (input) => (modeOf(input) === 'max' ? { ...okRun(''), ...failure } : okRun())
    });
    const result = await runWithHarness(harness);
    assert.equal(result.status, status);
    assert.equal(result.iteration, 9);
    assert.equal(result.iterationsRun, 10);
    assert.equal(result.mode, 'max');
    assert.equal(result.naiveResult, null);
    assert.equal(result.caseSeed, deriveCaseSeed(42, 9));
    assert.match(result.message, /最大サイズ/);
    assert.equal(harness.calls.naive.length, 9);
  }
});

test('runStressTest treats a rejected main run as a main error', async () => {
  const harness = makeHarness({
    mainFor: () => {
      throw new Error('spawn failed');
    }
  });
  const result = await runWithHarness(harness);
  assert.equal(result.status, 'mainError');
  assert.equal(result.iteration, 0);
  assert.equal(result.mainResult.errorMessage, 'spawn failed');
  assert.equal(result.mainResult.exitCode, null);
});

test('runStressTest reports naive errors and timeouts', async () => {
  const cases = [
    [{ exitCode: 1 }, /愚直解がエラー/],
    [{ timedOut: true, exitCode: null }, /愚直解が時間切れ/],
    [{ errorMessage: 'x' }, /愚直解がエラー/]
  ];
  for (const [failure, message] of cases) {
    const harness = makeHarness({
      naiveFor: (input) => (iterationOf(input) === 1 ? { ...okRun(''), ...failure } : okRun())
    });
    const result = await runWithHarness(harness);
    assert.equal(result.status, 'naiveError');
    assert.equal(result.iteration, 1);
    assert.equal(result.iterationsRun, 2);
    assert.equal(result.mainResult.stdout, 'ok\n');
    assert.match(result.message, message);
  }
});

test('runStressTest reports generator failures', async () => {
  const cases = [
    [() => ({ ok: false, message: '範囲が空です。' }), /範囲が空です。/],
    [() => {
      throw new Error('broken generator');
    }, /broken generator/],
    [() => null, /入力を作れませんでした。/],
    [() => ({ ok: true, input: 5 }), /入力を作れませんでした。/]
  ];
  for (const [failure, message] of cases) {
    const harness = makeHarness({
      generateFor: (iteration, options) => (iteration === 3
        ? failure()
        : { ok: true, input: `${iteration} ${options.mode} ${options.seed}\n` })
    });
    const result = await runWithHarness(harness);
    assert.equal(result.status, 'generatorError');
    assert.equal(result.iteration, 3);
    assert.equal(result.iterationsRun, 3);
    assert.equal(result.input, null);
    assert.equal(result.caseSeed, deriveCaseSeed(42, 3));
    assert.match(result.message, /^4 回目の入力を作れませんでした/);
    assert.match(result.message, message);
    assert.equal(harness.calls.main.length, 3);
  }
});

test('runStressTest accepts an async generator', async () => {
  const harness = makeHarness({
    generateFor: async (iteration, options) => ({ ok: true, input: `${iteration} ${options.mode} ${options.seed}\n` })
  });
  const result = await runWithHarness(harness);
  assert.equal(result.status, 'passed');
});

test('runStressTest stops before starting when already cancelled', async () => {
  const harness = makeHarness();
  const result = await runWithHarness(harness, { isCancelled: () => true });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.iteration, 0);
  assert.equal(result.iterationsRun, 0);
  assert.equal(harness.calls.generate.length, 0);
  assert.equal(harness.calls.main.length, 0);
  assert.match(result.message, /中止しました/);
});

test('runStressTest checks cancellation right after the main run', async () => {
  let cancelled = false;
  const harness = makeHarness({
    mainFor: (input) => {
      if (iterationOf(input) === 2) {
        cancelled = true;
      }
      return okRun();
    }
  });
  const result = await runWithHarness(harness, { isCancelled: () => cancelled });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.iteration, 2);
  assert.equal(result.iterationsRun, 2);
  assert.equal(result.mainResult.stdout, 'ok\n');
  assert.equal(result.naiveResult, null);
  assert.equal(harness.calls.naive.length, 2);
});

test('runStressTest checks cancellation right after the naive run', async () => {
  let cancelled = false;
  const harness = makeHarness({
    mainFor: () => okRun('different\n'),
    naiveFor: () => {
      cancelled = true;
      return okRun();
    }
  });
  const result = await runWithHarness(harness, { isCancelled: () => cancelled });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.iteration, 0);
  assert.equal(result.iterationsRun, 0);
  assert.equal(result.naiveResult.stdout, 'ok\n');
  assert.equal(result.comparison, null);
});

test('runStressTest checks cancellation before each iteration and after each run', async () => {
  const harness = makeHarness();
  let checks = 0;
  await runWithHarness(harness, {
    isCancelled: () => {
      checks += 1;
      return false;
    }
  });
  assert.equal(checks, 20 + 20 + 18);
});

test('runStressTest is reproducible from the seed', async () => {
  const first = makeHarness();
  const second = makeHarness();
  const other = makeHarness();
  await runWithHarness(first, { seed: 7 });
  await runWithHarness(second, { seed: 7 });
  await runWithHarness(other, { seed: 8 });
  assert.deepEqual(second.calls.generate.map((call) => call.options), first.calls.generate.map((call) => call.options));
  assert.notDeepEqual(other.calls.generate.map((call) => call.options.seed), first.calls.generate.map((call) => call.options.seed));
});

test('a failing case can be regenerated from caseSeed and the plan', async () => {
  const generate = (format, options) => {
    const rng = createTestRng(options.seed);
    const values = Array.from({ length: 3 }, () => Math.floor(rng() * 100));
    return { ok: true, input: `${values.join(' ')}\n` };
  };
  const runMain = async (input) => okRun(input.startsWith('9') ? 'bad\n' : 'ok\n');
  const runNaive = async () => okRun();
  const result = await runStressTest({ format: FORMAT, iterations: 200, seed: 99, runMain, runNaive, generate });
  assert.equal(result.status, 'mismatch');
  assert.equal(result.caseSeed, deriveCaseSeed(result.seed, result.iteration));
  const replay = generate(FORMAT, { seed: result.caseSeed, ...getStressPlan(result.iteration, 200) });
  assert.equal(replay.input, result.input);
});

test('small counterexamples are found first', async () => {
  const generate = (format, { seed, mode, sizeCap }) => {
    const upper = mode === 'max' || sizeCap === null ? 200000 : sizeCap;
    const rng = createTestRng(seed);
    const n = mode === 'max' ? upper : 1 + Math.floor(rng() * upper);
    return { ok: true, input: `${n}\n` };
  };
  // The bug only shows when n >= 3; main still exits normally.
  const runMain = async (input) => {
    const n = Number(input.trim());
    return okRun(`${n >= 3 ? n + 1 : n}\n`);
  };
  const runNaive = async (input) => okRun(`${Number(input.trim())}\n`);

  for (const total of [100, 1000]) {
    for (let baseSeed = 1; baseSeed <= 50; baseSeed += 1) {
      const result = await runStressTest({
        format: FORMAT,
        iterations: total,
        seed: baseSeed * 7919,
        runMain,
        runNaive,
        generate
      });
      const n = Number(result.input.trim());
      const where = `total ${total}, seed ${baseSeed * 7919}`;
      assert.equal(result.status, 'mismatch', where);
      assert.equal(result.mode, 'compare', where);
      assert.ok(n >= 3 && n <= 8, `${where}: n = ${n}`);
      assert.ok(result.iteration * 10 < total * 3, where);
    }
  }
});

test('runStressTest uses compareOutputs when no compare is given', async () => {
  const floatHarness = makeHarness({ mainFor: () => okRun('1.0000001\n'), naiveFor: () => okRun('1\n') });
  assert.equal((await runWithHarness(floatHarness, { compareMode: 'float' })).status, 'passed');

  const exactHarness = makeHarness({ mainFor: () => okRun('ok \n') });
  const exact = await runWithHarness(exactHarness, { compareMode: 'exact' });
  assert.equal(exact.status, 'mismatch');
  assert.equal(exact.iteration, 0);

  const tokensHarness = makeHarness({ mainFor: () => okRun('ok \n') });
  assert.equal((await runWithHarness(tokensHarness, { compareMode: undefined })).status, 'passed');
});

test('runStressTest picks a random seed when none is given', async () => {
  const harness = makeHarness();
  const result = await runWithHarness(harness, { seed: undefined, iterations: 3 });
  assert.equal(result.status, 'passed');
  assert.ok(Number.isInteger(result.seed) && result.seed >= 0 && result.seed <= 2 ** 32 - 1);
  assert.equal(harness.calls.generate[0].options.seed, deriveCaseSeed(result.seed, 0));
});

test('runStressTest normalizes the number of iterations', async () => {
  const cases = [[0, 1], [3.9, 3], ['abc', 100], [undefined, 100], [20000, 10000]];
  for (const [iterations, expected] of cases) {
    const harness = makeHarness();
    const result = await runWithHarness(harness, { iterations });
    assert.equal(result.iterationsRun, expected, String(iterations));
    assert.equal(harness.calls.generate.length, expected);
  }
});

test('runStressTest survives throwing callbacks', async () => {
  const harness = makeHarness();
  const result = await runWithHarness(harness, {
    onProgress: () => {
      throw new Error('ui closed');
    },
    isCancelled: () => {
      throw new Error('broken');
    }
  });
  assert.equal(result.status, 'passed');
});

test('runStressTest returns ok false when runMain is missing', async () => {
  const harness = makeHarness();
  const cases = [undefined, null, {}, { runNaive: harness.runNaive }, { runMain: 'main.py', runNaive: harness.runNaive }];
  for (const options of cases) {
    const result = await runStressTest(options);
    assert.equal(result.ok, false);
    assert.equal('status' in result, false);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0);
  }
  assert.equal(harness.calls.naive.length, 0);
});

test('runStressTest without runNaive runs only main and never compares', async () => {
  for (const runNaive of [undefined, null]) {
    const harness = makeHarness({ mainFor: (input) => okRun(`${iterationOf(input)}\n`) });
    let compareCalls = 0;
    let checks = 0;
    const result = await runWithHarness(harness, {
      runNaive,
      compare() {
        compareCalls += 1;
        return { equal: false, expectedDiffLines: [0], actualDiffLines: [0] };
      },
      isCancelled: () => {
        checks += 1;
        return false;
      }
    });
    const where = String(runNaive);
    assert.equal(result.status, 'passed', where);
    assert.equal(result.iterationsRun, 20, where);
    assert.equal(result.naiveResult, null, where);
    assert.equal(result.comparison, null, where);
    assert.match(result.message, /20 回/, where);
    assert.match(result.message, /エラー/, where);
    assert.match(result.message, /時間切れ/, where);
    assert.match(result.message, /愚直解がない/, where);
    assert.notEqual(result.message, '20 回すべて通りました。', where);
    assert.equal(harness.calls.main.length, 20, where);
    assert.equal(harness.calls.naive.length, 0, where);
    assert.equal(compareCalls, 0, where);
    assert.equal(checks, 20 + 20, where);
  }
});

test('runStressTest without runNaive still uses the plan for every iteration', async () => {
  const harness = makeHarness();
  const progress = [];
  await runWithHarness(harness, { runNaive: null, onProgress: (update) => progress.push(update.mode) });
  assert.equal(progress.length, 20);
  assert.deepEqual(harness.calls.main.map(modeOf), progress);
  assert.deepEqual(harness.calls.main.filter((input) => modeOf(input) === 'max').map(iterationOf), [9, 19]);
});

test('runStressTest without runNaive stops on main errors and timeouts at compare iterations', async () => {
  const cases = [
    [{ exitCode: 1 }, 'mainError', /本番の解がエラー/],
    [{ errorMessage: '起動できません', exitCode: null }, 'mainError', /本番の解がエラー/],
    [{ outputLimitExceeded: true }, 'mainError', /出力が多すぎて/],
    [{ timedOut: true, exitCode: null }, 'mainTimeout', /本番の解が時間切れ/]
  ];
  for (const [failure, status, message] of cases) {
    const harness = makeHarness({
      mainFor: (input) => (iterationOf(input) === 2 ? { ...okRun(''), ...failure } : okRun())
    });
    const result = await runWithHarness(harness, { runNaive: undefined });
    const where = JSON.stringify(failure);
    assert.equal(result.status, status, where);
    assert.equal(result.iteration, 2, where);
    assert.equal(result.iterationsRun, 3, where);
    assert.equal(result.mode, 'compare', where);
    assert.equal(result.caseSeed, deriveCaseSeed(42, 2), where);
    assert.equal(result.input, `2 compare ${deriveCaseSeed(42, 2)}\n`, where);
    assert.equal(result.naiveResult, null, where);
    assert.equal(result.comparison, null, where);
    assert.match(result.message, /^3 回目で/, where);
    assert.match(result.message, message, where);
    assert.equal(harness.calls.main.length, 3, where);
    assert.equal(harness.calls.naive.length, 0, where);
  }
});

test('runStressTest without runNaive reports max-size failures too', async () => {
  const harness = makeHarness({
    mainFor: (input) => (modeOf(input) === 'max' ? { ...okRun(''), timedOut: true, exitCode: null } : okRun())
  });
  const result = await runWithHarness(harness, { runNaive: null });
  assert.equal(result.status, 'mainTimeout');
  assert.equal(result.iteration, 9);
  assert.equal(result.mode, 'max');
  assert.match(result.message, /最大サイズ/);
  assert.equal(harness.calls.naive.length, 0);
});

test('every stress result has the documented fields', async () => {
  const harness = makeHarness({ mainFor: (input) => (iterationOf(input) === 1 ? okRun('x\n') : okRun()) });
  const result = await runWithHarness(harness);
  assert.deepEqual(Object.keys(result).sort(), [
    'caseSeed',
    'comparison',
    'input',
    'iteration',
    'iterationsRun',
    'mainResult',
    'message',
    'mode',
    'naiveResult',
    'seed',
    'status'
  ]);
});
