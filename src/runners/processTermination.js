'use strict';

const { spawn } = require('node:child_process');

// The parent can exit while a descendant still owns its pipes. Never rely on
// ChildProcess's close event alone to complete a cancelled run.
function createProcessStopper(child, {
  onFallback,
  graceMs = 750,
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill
} = {}) {
  let requested = false;
  let fallbackTimer;
  let treeKiller;
  let incomplete = false;

  function killParent() {
    try { child.kill('SIGKILL'); } catch { /* Already exited. */ }
  }

  function requestStop() {
    if (requested) return;
    requested = true;
    fallbackTimer = setTimeout(() => {
      incomplete = true;
      killParent();
      if (treeKiller) {
        try { treeKiller.kill(); } catch { /* Already exited. */ }
      }
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        if (stream) stream.destroy();
      }
      // A failed tree termination must not retain Node's event loop either.
      if (typeof child.unref === 'function') child.unref();
      if (onFallback) onFallback({ processTerminationIncomplete: true });
    }, graceMs);

    if (!Number.isInteger(child.pid) || child.pid <= 0) {
      killParent();
      return;
    }
    if (platform === 'win32') {
      try {
        treeKiller = spawnProcess('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          shell: false,
          windowsHide: true,
          stdio: 'ignore'
        });
        treeKiller.on('error', killParent);
        treeKiller.on('close', (code) => { if (code !== 0) killParent(); });
        // Its pipes are ignored; a stuck taskkill must not keep the host alive
        // after Python's close handler has already settled the result.
        if (typeof treeKiller.unref === 'function') treeKiller.unref();
      } catch {
        killParent();
      }
    } else {
      // Python is spawned as a process-group leader on POSIX.
      try { killProcess(-child.pid, 'SIGKILL'); } catch { killParent(); }
    }
  }

  function dispose() {
    clearTimeout(fallbackTimer);
  }

  return { requestStop, dispose, get incomplete() { return incomplete; } };
}

module.exports = { createProcessStopper };
