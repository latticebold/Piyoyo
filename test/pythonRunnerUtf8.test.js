'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function loadRunner(spawn) {
  const runnerPath = require.resolve('../src/runners/pythonRunner');
  const originalSpawn = childProcess.spawn;
  delete require.cache[runnerPath];
  childProcess.spawn = spawn;
  try {
    return require(runnerPath).runPythonFile;
  } finally {
    childProcess.spawn = originalSpawn;
    delete require.cache[runnerPath];
  }
}

const runtimeJson = JSON.stringify({
  implementation: 'CPython', version: '3.14', executable: 'C:/日本語/python.exe'
});

function splitBytes(text) {
  return [...Buffer.from(text)].map((byte) => Buffer.from([byte]));
}

function fakeRunner(plans) {
  const queue = [...plans];
  const run = loadRunner(() => {
    const plan = queue.shift();
    assert.ok(plan, 'unexpected subprocess');
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => true;
    setImmediate(async () => {
      for (const stream of ['stdout', 'stderr']) {
        for (const chunk of plan[stream] || []) {
          child[stream].write(chunk);
          await new Promise((resolve) => setImmediate(resolve));
        }
        child[stream].end();
      }
      setImmediate(() => child.emit('close', plan.exitCode || 0, null));
    });
    return child;
  });
  return () => run({ filePath: 'main.py', cwd: process.cwd(), pythonPath: 'python' });
}

const validProbe = () => ({ stdout: [Buffer.from(runtimeJson)] });

test('decodes split UTF-8 on stdout and stderr without replacement characters', async () => {
  const expected = 'あいうえお🙂漢字\n';
  const result = await fakeRunner([
    validProbe(), { stdout: splitBytes(expected), stderr: splitBytes(expected) }
  ])();
  assert.equal(result.stdout, expected);
  assert.equal(result.stderr, expected);
  assert.equal(result.exitCode, 0);
});

test('preserves complete UTF-8 chunks and ASCII output', async () => {
  const result = await fakeRunner([
    validProbe(), {
      stdout: [Buffer.from('answer: '), Buffer.from('日本語🙂\n')],
      stderr: [Buffer.from('warning: 123\n')]
    }
  ])();
  assert.equal(result.stdout, 'answer: 日本語🙂\n');
  assert.equal(result.stderr, 'warning: 123\n');
});

test('flushes one replacement character for an incomplete final UTF-8 sequence', async () => {
  const incomplete = Buffer.from([0xe3, 0x81]);
  const result = await fakeRunner([
    validProbe(), {
      stdout: [Buffer.from('prefix '), incomplete.subarray(0, 1), incomplete.subarray(1)],
      stderr: [incomplete.subarray(0, 1), incomplete.subarray(1)]
    }
  ])();
  assert.equal(result.stdout, 'prefix \uFFFD');
  assert.equal(result.stderr, '\uFFFD');
});

test('decodes runtime probe JSON across UTF-8 character boundaries', async () => {
  const result = await fakeRunner([
    { stdout: splitBytes(runtimeJson) }, { stdout: [Buffer.from('ok\n')] }
  ])();
  assert.equal(result.pythonRuntime.executable, 'C:/日本語/python.exe');
  assert.equal(result.pythonRuntime.errorMessage, '');
});

test('decodes failed runtime probe stderr across UTF-8 character boundaries', async () => {
  const result = await fakeRunner([
    { stderr: splitBytes('環境の確認に失敗\n'), exitCode: 1 }, {}
  ])();
  assert.equal(result.pythonRuntime.errorMessage, '環境の確認に失敗');
});

test('captures actual Python os.write output split inside a UTF-8 character', async () => {
  const resolved = childProcess.spawnSync('uv', [
    '--no-cache', 'run', '--no-project', 'python', '-c', 'import sys; print(sys.executable)'
  ], { encoding: 'utf8' });
  assert.equal(resolved.status, 0, resolved.error?.message || resolved.stderr);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'piyoyo-utf8-'));
  const filePath = path.join(directory, 'main.py');
  try {
    await fs.writeFile(filePath, [
      'import os, time',
      'data = "あ🙂い\\n".encode("utf-8")',
      'for fd in (1, 2):',
      '    os.write(fd, data[:1])',
      '    time.sleep(0.1)',
      '    os.write(fd, data[1:])'
    ].join('\n'), 'utf8');
    const run = loadRunner(childProcess.spawn);
    const result = await run({ filePath, cwd: directory, pythonPath: resolved.stdout.trim() });
    assert.equal(result.stdout, 'あ🙂い\n');
    assert.equal(result.stderr, 'あ🙂い\n');
    assert.equal(result.exitCode, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
