const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  inspectPythonLauncher,
  inspectPythonLaunchers
} = require('../src/pythonLauncherAvailability');

function fakeSpawn({ stdout = '', stderr = '', exitCode = 0, error = null } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {
      child.killed = true;
    };

    process.nextTick(() => {
      if (error) {
        child.emit('error', error);
        return;
      }

      if (stdout) {
        child.stdout.emit('data', Buffer.from(stdout));
      }
      if (stderr) {
        child.stderr.emit('data', Buffer.from(stderr));
      }
      child.emit('close', exitCode, null);
    });

    return child;
  };
}

test('inspectPythonLauncher marks launcher available when --version exits successfully', async () => {
  const result = await inspectPythonLauncher('pypy3', {
    spawnImpl: fakeSpawn({ stdout: 'Python 3.10.13 (PyPy 7.3.15)\n' })
  });

  assert.deepEqual(result, {
    launcher: 'pypy3',
    available: true,
    version: 'Python 3.10.13 (PyPy 7.3.15)',
    errorMessage: ''
  });
});

test('inspectPythonLauncher marks launcher unavailable on spawn error', async () => {
  const result = await inspectPythonLauncher('missing-python', {
    spawnImpl: fakeSpawn({ error: new Error('ENOENT') })
  });

  assert.equal(result.launcher, 'missing-python');
  assert.equal(result.available, false);
  assert.equal(result.version, '');
  assert.match(result.errorMessage, /ENOENT/);
});

test('inspectPythonLaunchers checks all requested launchers', async () => {
  const results = await inspectPythonLaunchers(['python', 'pypy'], {
    spawnImpl: fakeSpawn({ stderr: 'Python 3.12.0\n' })
  });

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((result) => result.launcher), ['python', 'pypy']);
  assert.ok(results.every((result) => result.available));
});
