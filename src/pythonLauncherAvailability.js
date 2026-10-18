'use strict';

const { spawn } = require('node:child_process');

const PYTHON_LAUNCHERS = ['python', 'py', 'python3', 'pypy', 'pypy3'];

function makeLauncherResult(overrides = {}) {
  return {
    launcher: '',
    available: false,
    version: '',
    errorMessage: '',
    ...overrides
  };
}

function inspectPythonLauncher(launcher, {
  spawnImpl = spawn,
  timeoutMs = 800
} = {}) {
  return new Promise((resolve) => {
    if (!launcher) {
      resolve(makeLauncherResult({ errorMessage: 'Python 起動設定が空です。' }));
      return;
    }

    let child;
    let settled = false;
    let timer;
    let stdout = '';
    let stderr = '';

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(result);
    }

    try {
      child = spawnImpl(launcher, ['--version'], {
        shell: false,
        windowsHide: true
      });
    } catch (error) {
      resolve(makeLauncherResult({
        launcher,
        errorMessage: error.message
      }));
      return;
    }

    timer = setTimeout(() => {
      child.kill();
      finish(makeLauncherResult({
        launcher,
        errorMessage: `${timeoutMs} ms で判定がタイムアウトしました。`
      }));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      finish(makeLauncherResult({
        launcher,
        errorMessage: error.message
      }));
    });

    child.on('close', (exitCode) => {
      const version = (stdout || stderr).trim().split(/\r?\n/)[0] || '';
      if (exitCode === 0) {
        finish(makeLauncherResult({
          launcher,
          available: true,
          version
        }));
        return;
      }

      finish(makeLauncherResult({
        launcher,
        version,
        errorMessage: stderr.trim() || `終了コード ${exitCode} で終了しました。`
      }));
    });
  });
}

function inspectPythonLaunchers(launchers = PYTHON_LAUNCHERS, options = {}) {
  return Promise.all(launchers.map((launcher) => inspectPythonLauncher(launcher, options)));
}

module.exports = {
  PYTHON_LAUNCHERS,
  inspectPythonLauncher,
  inspectPythonLaunchers
};
