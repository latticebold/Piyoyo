'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runPythonFile } = require('../src/runners/pythonRunner');
const { createProcessStopper } = require('../src/runners/processTermination');

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function descendantCase(parentExits) {
  const resolved = spawnSync('uv', ['--no-cache', 'run', '--no-project', 'python', '-c',
    'import sys; print(sys.executable)'], { encoding: 'utf8' });
  assert.equal(resolved.status, 0, resolved.error?.message || resolved.stderr);
  const pythonPath = resolved.stdout.trim();
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'piyoyo-tree-'));
  const filePath = path.join(cwd, 'main.py');
  const pidPath = path.join(cwd, 'child.pid');
  let childPid;
  try {
    await fs.writeFile(filePath, [
      'import pathlib, subprocess, sys, time',
      'child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(2)"])',
      'pathlib.Path("child.pid").write_text(str(child.pid))',
      'print(child.pid, flush=True)',
      parentExits ? 'sys.exit(0)' : 'time.sleep(10)'
    ].join('\n'));
    const result = await runPythonFile({ filePath, cwd, pythonPath, timeoutMs: 100 });
    childPid = Number(await fs.readFile(pidPath, 'utf8'));
    assert.ok(Number.isInteger(childPid) && childPid > 0);
    assert.equal(result.timedOut, true);
    assert.ok(result.elapsedMs < 1500, `execution took ${result.elapsedMs} ms`);
    assert.equal(result.processTerminationIncomplete, parentExits && process.platform === 'win32');
    if (result.processTerminationIncomplete) {
      assert.match(result.errorExplanation, /子プロセスの停止を確認できないため、結果の待機を打ち切りました。/);
      assert.match(result.errorExplanation, /100 ms/);
    }
    if (!parentExits || process.platform !== 'win32') {
      assert.equal(alive(childPid), false, `descendant ${childPid} survived cancellation`);
    }
  } finally {
    // Read the PID even when an assertion failed, and only clean up our child.
    if (!childPid) {
      try { childPid = Number(await fs.readFile(pidPath, 'utf8')); } catch { /* Not spawned. */ }
    }
    if (Number.isInteger(childPid) && childPid > 0 && alive(childPid)) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(childPid), '/T', '/F'], {
          shell: false, windowsHide: true, stdio: 'ignore'
        });
      } else {
        try { process.kill(childPid, 'SIGKILL'); } catch { /* Already exited. */ }
      }
    }
    assert.ok(path.resolve(cwd).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test('timeout kills a Python descendant holding inherited stdout and stderr', () => descendantCase(false));
test('timeout settles when the Python parent already exited with pipes inherited', () => descendantCase(true));

test('failed Windows tree termination destroys pipes and settles within its grace period', async () => {
  const destroyed = [];
  let kills = 0;
  let unrefs = 0;
  let invocations = 0;
  let fallbackState;
  let stopper;
  const child = {
    pid: 12345,
    stdin: { destroy: () => destroyed.push('stdin') },
    stdout: { destroy: () => destroyed.push('stdout') },
    stderr: { destroy: () => destroyed.push('stderr') },
    kill: () => { kills += 1; },
    unref: () => { unrefs += 1; }
  };
  const start = Date.now();
  await new Promise((resolve) => {
    stopper = createProcessStopper(child, {
      platform: 'win32', graceMs: 25, onFallback(state) { fallbackState = state; resolve(); },
      spawnProcess(executable, args, options) {
        invocations += 1;
        assert.equal(executable, 'taskkill');
        assert.deepEqual(args, ['/PID', '12345', '/T', '/F']);
        assert.equal(options.shell, false);
        assert.equal(options.windowsHide, true);
        const failed = new EventEmitter();
        failed.kill = () => {};
        process.nextTick(() => failed.emit('error', new Error('taskkill unavailable')));
        return failed;
      }
    });
    stopper.requestStop();
    stopper.requestStop();
  });
  assert.ok(Date.now() - start < 500);
  assert.equal(invocations, 1);
  assert.ok(kills >= 1);
  assert.equal(unrefs, 1);
  assert.deepEqual(destroyed, ['stdin', 'stdout', 'stderr']);
  assert.equal(stopper.incomplete, true);
  assert.deepEqual(fallbackState, { processTerminationIncomplete: true });
});

test('runner reports incomplete termination when mocked taskkill fails and pipes remain open', () => {
  const script = `
    const cp = require('node:child_process');
    const { EventEmitter } = require('node:events');
    const { PassThrough } = require('node:stream');
    cp.spawn = (command, args) => {
      const child = new EventEmitter();
      child.kill = () => false;
      child.unref = () => {};
      if (command === 'taskkill') {
        process.nextTick(() => child.emit('error', new Error('mocked taskkill failure')));
        return child;
      }
      child.pid = 12345;
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      if (args[0] === '-c') {
        process.nextTick(() => {
          child.stdout.write(JSON.stringify({ implementation: 'CPython' }));
          child.emit('close', 0, null);
        });
      }
      return child;
    };
    require(${JSON.stringify(path.resolve(__dirname, '../src/runners/pythonRunner.js'))})
      .runPythonFile({ filePath: 'mock.py', pythonPath: 'mock-python', timeoutMs: 100 })
      .then(result => console.log(JSON.stringify(result)));
  `;
  const host = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8', timeout: 3000
  });
  assert.equal(host.status, 0, host.error?.message || host.stderr);
  const result = JSON.parse(host.stdout.trim());
  assert.equal(result.processTerminationIncomplete, true);
  assert.equal(result.timedOut, true);
  assert.match(result.errorExplanation, /100 ms/);
  assert.match(result.errorExplanation, /子プロセスの停止を確認できないため、結果の待機を打ち切りました。/);
});
