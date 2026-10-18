'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createBoundedOutput, DEFAULT_OUTPUT_LIMIT_BYTES } = require('../src/runners/boundedOutput');

function fakeRunner(plans) {
  const runnerPath = require.resolve('../src/runners/pythonRunner');
  const originalSpawn = childProcess.spawn;
  const children = [];
  delete require.cache[runnerPath];
  childProcess.spawn = () => {
    const plan = plans[children.length];
    assert.ok(plan, 'unexpected subprocess');
    const child = new EventEmitter();
    children.push(child);
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kills = 0;
    child.kill = () => { child.kills += 1; return true; };
    setImmediate(() => {
      for (const [stream, bytes] of plan.chunks || []) child[stream].write(bytes);
      child.stdout.end();
      child.stderr.end();
      child.emit('close', 0, null);
    });
    return child;
  };
  let run;
  try { run = require(runnerPath).runPythonFile; }
  finally {
    childProcess.spawn = originalSpawn;
    delete require.cache[runnerPath];
  }
  return { run: (options = {}) => run({ filePath: 'main.py', pythonPath: 'python', ...options }), children };
}

const probe = () => ({ chunks: [['stdout', Buffer.from('{"implementation":"CPython","version":"3.14","executable":"python"}')]] });

test('output collector uses a shared byte cap and stops retaining later chunks', () => {
  const output = createBoundedOutput(8);
  assert.equal(output.write('stdout', Buffer.from('abc')), false);
  assert.equal(output.write('stderr', Buffer.from('123456')), true);
  assert.equal(output.write('stdout', Buffer.alloc(1000, 120)), false);
  assert.deepEqual(output.finish(), { stdout: 'abc', stderr: '12345' });
  assert.equal(output.retainedBytes, 8);
  assert.match(output.reason, /8 バイト.*省略/);
});

test('collector does not fabricate a replacement character at the truncation boundary', () => {
  const output = createBoundedOutput(4);
  output.write('stdout', Buffer.from('a🙂z'));
  assert.deepEqual(output.finish(), { stdout: 'a', stderr: '' });
  assert.equal(output.exceeded, true);
});

test('collector counts fragmented multibyte characters in bytes across both pipes', () => {
  const output = createBoundedOutput(7);
  const bytes = Buffer.from('あ');
  for (const byte of bytes) output.write('stdout', Buffer.from([byte]));
  output.write('stderr', Buffer.from('🙂'));
  assert.deepEqual(output.finish(), { stdout: 'あ', stderr: '🙂' });
  assert.equal(output.exceeded, false);
  assert.equal(output.retainedBytes, 7);
});

test('collector preserves ordinary EOF decoding and rejects unsafe byte limits', () => {
  const output = createBoundedOutput(Infinity);
  output.write('stdout', Buffer.from([0xe3, 0x81]));
  assert.deepEqual(output.finish(), { stdout: '\uFFFD', stderr: '' });
  assert.equal(output.limitBytes, DEFAULT_OUTPUT_LIMIT_BYTES);
  assert.equal(output.reason, '');
});

test('runner stops output flooding at the default cap and explains the omission', async () => {
  const fixture = fakeRunner([probe(), { chunks: [
    ['stdout', Buffer.alloc(DEFAULT_OUTPUT_LIMIT_BYTES, 97)],
    ['stderr', Buffer.from('b')], ['stdout', Buffer.alloc(1000, 99)]
  ] }]);
  const result = await fixture.run();
  assert.equal(result.stdout.length, DEFAULT_OUTPUT_LIMIT_BYTES);
  assert.equal(result.stderr, '');
  assert.equal(result.outputLimitExceeded, true);
  assert.equal(result.timedOut, false);
  assert.match(result.errorMessage, /上限.*省略/);
  assert.match(result.errorExplanation, /上限.*省略/);
  assert.ok(fixture.children[1].kills >= 1);
});

test('runner shares the output cap between stdout and stderr', async () => {
  const fixture = fakeRunner([probe(), { chunks: [
    ['stdout', Buffer.alloc(600, 97)], ['stderr', Buffer.alloc(600, 98)]
  ] }]);
  const result = await fixture.run({ outputLimitBytes: 1024 });
  assert.equal(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), 1024);
  assert.equal(result.outputLimitExceeded, true);
});

test('runner retains complete UTF-8 characters when the cap cuts a character', async () => {
  const fixture = fakeRunner([probe(), { chunks: [
    ['stdout', Buffer.alloc(1020, 97)], ['stderr', Buffer.from('🙂あ')]
  ] }]);
  const result = await fixture.run({ outputLimitBytes: 1025 });
  assert.equal(result.stdout, 'a'.repeat(1020));
  assert.equal(result.stderr, '🙂');
  assert.doesNotMatch(result.stdout + result.stderr, /\uFFFD/);
  assert.equal(result.outputLimitExceeded, true);
});

test('runner bounds a flooding runtime probe and retains its Japanese explanation', async () => {
  const fixture = fakeRunner([{ chunks: [['stderr', Buffer.alloc(2000, 97)]] }, {}]);
  const result = await fixture.run({ outputLimitBytes: 1024 });
  assert.match(result.pythonRuntime.errorMessage, /上限.*省略/);
  assert.ok(result.pythonRuntime.errorMessage.length < 1024);
  assert.ok(fixture.children[0].kills >= 1);
});

test('actual Python is stopped when stdout and stderr loop beyond the shared 1MiB cap', async () => {
  const resolved = childProcess.spawnSync('uv', [
    '--no-cache', 'run', '--no-project', 'python', '-c', 'import sys; print(sys.executable)'
  ], { encoding: 'utf8' });
  assert.equal(resolved.status, 0, resolved.error?.message || resolved.stderr);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'piyoyo-output-limit-'));
  const filePath = path.join(directory, 'main.py');
  try {
    await fs.writeFile(filePath, [
      'import os, time',
      'chunk = b"x" * 65536',
      'for i in range(512):',
      '    os.write(1 if i % 2 == 0 else 2, chunk)',
      'time.sleep(30)'
    ].join('\n'), 'utf8');
    const result = await require('../src/runners/pythonRunner').runPythonFile({
      filePath, cwd: directory, pythonPath: resolved.stdout.trim(), timeoutMs: 10000
    });
    assert.equal(result.outputLimitExceeded, true);
    assert.equal(result.timedOut, false);
    assert.ok(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) <= DEFAULT_OUTPUT_LIMIT_BYTES);
    assert.match(result.errorExplanation, /上限.*省略/);
    assert.ok(result.elapsedMs < 5000, `output stop took ${result.elapsedMs} ms`);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
