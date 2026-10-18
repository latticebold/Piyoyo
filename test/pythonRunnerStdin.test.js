'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runnerPath = path.resolve(__dirname, '../src/runners/pythonRunner.js');
const pythonResult = spawnSync('uv', [
  '--no-cache', 'run', '--no-project', 'python', '-c', 'import sys; print(sys.executable)'
], { encoding: 'utf8' });
assert.equal(pythonResult.status, 0, pythonResult.error?.message || pythonResult.stderr);
const pythonPath = pythonResult.stdout.trim();

function runInIsolatedHost(source, { missingPython = false, injectedError = '' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'piyoyo-stdin-'));
  const filePath = path.join(cwd, 'main.py');
  fs.writeFileSync(filePath, source, 'utf8');
  const options = {
    filePath,
    cwd,
    pythonPath: missingPython ? path.join(cwd, 'missing-python-executable') : pythonPath,
    timeoutMs: 5000
  };
  const script = `
    const childProcess = require('node:child_process');
    const realSpawn = childProcess.spawn;
    const injectedError = ${JSON.stringify(injectedError)};
    if (injectedError) {
      childProcess.spawn = function (executable, args, options) {
        const child = realSpawn(executable, args, options);
        if (args[0] !== '-c') {
          const realEnd = child.stdin.end;
          child.stdin.end = function (input) {
            const error = Object.assign(new Error('injected write failure'), { code: injectedError });
            if (injectedError === 'SYNC_FAILURE') throw error;
            process.nextTick(() => this.emit('error', error));
            return realEnd.call(this, input);
          };
        }
        return child;
      };
    }
    const { runPythonFile } = require(${JSON.stringify(runnerPath)});
    runPythonFile({ ...${JSON.stringify(options)}, input: 'x'.repeat(10 * 1024 * 1024) })
      .then(result => {
        // Wait for late stream errors too; promise resolution alone is not a
        // guarantee that the extension host remains alive.
        setTimeout(() => console.log(JSON.stringify({ survived: true, result })), 100);
      })
      .catch(error => { console.error(error); process.exitCode = 1; });
  `;
  try {
    const host = spawnSync(process.execPath, ['-e', script], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024
    });
    assert.equal(host.error, undefined, host.error?.message);
    assert.equal(host.status, 0, host.stderr);
    const parsed = JSON.parse(host.stdout.trim());
    assert.equal(parsed.survived, true);
    return parsed.result;
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

test('isolated host survives large stdin when Python exits without reading', () => {
  const result = runInIsolatedHost('print("finished")\n');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), 'finished');
  assert.equal(result.errorMessage, '');
  assert.equal(result.errorExplanation, '');
});

test('isolated host preserves Python failure when it exits before reading stdin', () => {
  const result = runInIsolatedHost('import sys\nprint("failed", file=sys.stderr)\nsys.exit(7)\n');
  assert.equal(result.exitCode, 7);
  assert.equal(result.stderr.trim(), 'failed');
  assert.equal(result.errorMessage, '');
  assert.match(result.errorExplanation, /終了コード 7/);
});

test('isolated host survives missing Python executable with pending large stdin', () => {
  const result = runInIsolatedHost('', { missingPython: true });
  assert.equal(result.exitCode, null);
  assert.match(result.errorMessage, /ENOENT/);
  assert.notEqual(result.errorExplanation, '');
});

test('isolated host delivers large stdin fully to a reader', () => {
  const result = runInIsolatedHost('import sys\nprint(len(sys.stdin.read()))\n');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), String(10 * 1024 * 1024));
  assert.equal(result.errorMessage, '');
});

for (const injectedError of ['ENOSPC', 'SYNC_FAILURE']) {
  test(`isolated host reports abnormal stdin failure (${injectedError})`, () => {
    const result = runInIsolatedHost('import time\ntime.sleep(10)\n', { injectedError });
    assert.match(result.errorMessage, /標準入力を書き込めませんでした: injected write failure/);
    assert.notEqual(result.errorExplanation, '');
    assert.equal(result.timedOut, false);
  });
}
