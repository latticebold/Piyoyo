'use strict';

const { spawn } = require('node:child_process');
const { createProcessStopper } = require('./processTermination');
const { createBoundedOutput, DEFAULT_OUTPUT_LIMIT_BYTES } = require('./boundedOutput');
const { explainPythonError } = require('./pythonErrorExplainer');

const RUNTIME_PROBE = 'import json, platform, sys; print(json.dumps({"implementation": platform.python_implementation(), "version": sys.version.splitlines()[0], "executable": sys.executable}))';
const TERMINATION_INCOMPLETE_MESSAGE = '子プロセスの停止を確認できないため、結果の待機を打ち切りました。';

function createUtf8PythonEnvironment(baseEnvironment = process.env) {
  return {
    ...baseEnvironment,
    // Python otherwise chooses a Windows locale encoding for redirected pipes,
    // while Node decodes Buffer.toString() as UTF-8.
    PYTHONIOENCODING: 'utf-8:backslashreplace',
    PYTHONUTF8: '1'
  };
}

function makePythonRuntime(overrides = {}) {
  return {
    implementation: '',
    version: '',
    executable: '',
    launcher: '',
    errorMessage: '',
    processTerminationIncomplete: false,
    ...overrides
  };
}

function makeResult(overrides = {}) {
  return {
    stdout: '',
    stderr: '',
    exitCode: null,
    signal: null,
    timedOut: false,
    outputLimitExceeded: false,
    processTerminationIncomplete: false,
    elapsedMs: 0,
    pythonRuntime: makePythonRuntime(),
    errorMessage: '',
    errorExplanation: '',
    ...overrides
  };
}

function elapsedMilliseconds(startTime) {
  return Number(process.hrtime.bigint() - startTime) / 1_000_000;
}

function inspectPythonRuntime({ pythonPath, cwd, outputLimitBytes }) {
  return new Promise((resolve) => {
    const child = spawn(pythonPath, ['-c', RUNTIME_PROBE], {
      cwd,
      env: createUtf8PythonEnvironment(),
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32'
    });

    const output = createBoundedOutput(outputLimitBytes);
    let settled = false;
    let timedOut = false;
    const timeoutResult = () => makePythonRuntime({
      launcher: pythonPath,
      errorMessage: output.reason || 'Python 実行環境の確認がタイムアウトしました。'
    });
    const stopper = createProcessStopper(child, { onFallback: () => finish(timeoutResult()) });
    const timer = setTimeout(() => {
      timedOut = true;
      stopper.requestStop();
    }, 1000);

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stopper.dispose();
      resolve({ ...result, processTerminationIncomplete: stopper.incomplete });
    }

    child.stdout.on('data', (chunk) => {
      if (output.write('stdout', chunk)) {
        clearTimeout(timer);
        stopper.requestStop();
      }
    });

    child.stderr.on('data', (chunk) => {
      if (output.write('stderr', chunk)) {
        clearTimeout(timer);
        stopper.requestStop();
      }
    });

    child.on('error', (error) => {
      finish(makePythonRuntime({
        launcher: pythonPath,
        errorMessage: output.reason || error.message
      }));
    });

    child.on('close', (exitCode) => {
      const { stdout, stderr } = output.finish();
      if (output.exceeded) {
        finish(makePythonRuntime({ launcher: pythonPath, errorMessage: output.reason }));
        return;
      }
      if (timedOut) {
        finish(timeoutResult());
        return;
      }
      if (exitCode !== 0) {
        finish(makePythonRuntime({
          launcher: pythonPath,
          errorMessage: stderr.trim() || `Python 実行環境の確認が終了コード ${exitCode} で終了しました。`
        }));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        finish(makePythonRuntime({
          implementation: String(parsed.implementation || ''),
          version: String(parsed.version || ''),
          executable: String(parsed.executable || ''),
          launcher: pythonPath
        }));
      } catch (error) {
        finish(makePythonRuntime({
          launcher: pythonPath,
          errorMessage: `Python 実行環境の確認結果を読み取れませんでした: ${error.message}`
        }));
      }
    });
  });
}

async function runPythonFile({
  filePath,
  cwd,
  input = '',
  pythonPath,
  timeoutMs = 5000,
  outputLimitBytes = DEFAULT_OUTPUT_LIMIT_BYTES,
  workspaceFolders = [],
  // Stress tests run many times in a row; skipping the probe halves the process starts.
  inspectRuntime = true
}) {
  const baseRuntime = makePythonRuntime({ launcher: pythonPath || '' });
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;
  const safeWorkspaceFolders = Array.isArray(workspaceFolders) ? workspaceFolders : [];

  if (!filePath) {
    const errorMessage = 'Python ファイルが選択されていません。';
    return makeResult({
      pythonRuntime: baseRuntime,
      errorMessage,
      errorExplanation: explainPythonError({
        stderr: '',
        exitCode: null,
        errorMessage,
        timedOut: false,
        timeoutMs: safeTimeoutMs,
        filePath,
        workspaceFolders: safeWorkspaceFolders
      })
    });
  }

  if (!pythonPath) {
    const errorMessage = 'Python 実行ファイルが設定されていません。';
    return makeResult({
      pythonRuntime: baseRuntime,
      errorMessage,
      errorExplanation: explainPythonError({
        stderr: '',
        exitCode: null,
        errorMessage,
        timedOut: false,
        timeoutMs: safeTimeoutMs,
        filePath,
        workspaceFolders: safeWorkspaceFolders
      })
    });
  }

  const pythonRuntime = inspectRuntime
    ? await inspectPythonRuntime({ pythonPath, cwd, outputLimitBytes })
    : baseRuntime;

  return new Promise((resolve) => {
    const child = spawn(pythonPath, [filePath], {
      cwd,
      env: createUtf8PythonEnvironment(),
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32'
    });

    const output = createBoundedOutput(outputLimitBytes);
    let timedOut = false;
    let stdinError = null;
    let settled = false;
    const startTime = process.hrtime.bigint();

    const stopper = createProcessStopper(child, { onFallback: () => complete(null, null) });
    const timer = setTimeout(() => {
      timedOut = true;
      stopper.requestStop();
    }, safeTimeoutMs);

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stopper.dispose();
      const processTerminationIncomplete = stopper.incomplete || pythonRuntime.processTerminationIncomplete;
      resolve({
        ...result,
        processTerminationIncomplete,
        errorExplanation: processTerminationIncomplete
          ? [result.errorExplanation, TERMINATION_INCOMPLETE_MESSAGE].filter(Boolean).join('\n')
          : result.errorExplanation
      });
    }

    child.stdout.on('data', (chunk) => {
      if (output.write('stdout', chunk)) {
        clearTimeout(timer);
        stopper.requestStop();
      }
    });

    child.stderr.on('data', (chunk) => {
      if (output.write('stderr', chunk)) {
        clearTimeout(timer);
        stopper.requestStop();
      }
    });

    function handleStdinError(error) {
      // Stopping after a write failure may cause another closed-pipe error.
      // Preserve the original failure instead of replacing its explanation.
      if (!stdinError || ['EPIPE', 'EOF', 'ECONNRESET'].includes(stdinError.code)) {
        stdinError = error;
      }
      // A program may finish without consuming all supplied input. Keep its
      // exit status authoritative for these ordinary closed-pipe errors.
      if (!['EPIPE', 'EOF', 'ECONNRESET'].includes(error.code)) {
        stopper.requestStop();
      }
    }

    // Register before end(): a failed spawn or early exit can reject a pending
    // write asynchronously, even after the child itself emitted an error.
    child.stdin.on('error', handleStdinError);

    child.on('error', (error) => {
      const { stdout, stderr } = output.finish();
      finish(makeResult({
        stdout,
        stderr,
        exitCode: null,
        elapsedMs: elapsedMilliseconds(startTime),
        pythonRuntime,
        outputLimitExceeded: output.exceeded,
        errorMessage: output.reason || error.message,
        errorExplanation: output.reason || explainPythonError({
          stderr,
          exitCode: null,
          errorMessage: error.message,
          timedOut,
          timeoutMs: safeTimeoutMs,
          filePath,
          workspaceFolders: safeWorkspaceFolders
        })
      }));
    });

    function complete(exitCode, signal) {
      const { stdout, stderr } = output.finish();
      const inputErrorMessage = stdinError &&
        (!['EPIPE', 'EOF', 'ECONNRESET'].includes(stdinError.code) || exitCode === null)
        ? `標準入力を書き込めませんでした: ${stdinError.message}`
        : '';
      const errorMessage = output.reason || (timedOut ? `${safeTimeoutMs} ms でタイムアウトしました。` : inputErrorMessage);
      finish(makeResult({
        stdout,
        stderr,
        exitCode,
        signal: signal || (timedOut ? 'SIGKILL' : null),
        timedOut,
        outputLimitExceeded: output.exceeded,
        elapsedMs: elapsedMilliseconds(startTime),
        pythonRuntime,
        errorMessage,
        errorExplanation: output.reason || explainPythonError({
          stderr,
          exitCode,
          errorMessage,
          timedOut,
          timeoutMs: safeTimeoutMs,
          filePath,
          workspaceFolders: safeWorkspaceFolders
        })
      }));
    }

    child.on('close', complete);

    try {
      child.stdin.end(input);
    } catch (error) {
      handleStdinError(error);
    }
  });
}

module.exports = {
  createUtf8PythonEnvironment,
  runPythonFile
};
