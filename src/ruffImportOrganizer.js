'use strict';

const RUFF_EXTENSION_ID = 'charliermarsh.ruff';
const RUFF_ORGANIZE_IMPORTS_KIND = 'source.organizeImports.ruff';
const DEFAULT_TIMEOUT_MS = 3000;

// Runs Ruff's organize-imports code action when the Ruff extension is active.
// Never throws: any problem means "leave the document as it is".
async function organizeImportsWithRuff({
  getExtension,
  executeCommand,
  applyEdit,
  document,
  range,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  try {
    if (
      typeof getExtension !== 'function'
      || typeof executeCommand !== 'function'
      || typeof applyEdit !== 'function'
      || !document
      || !document.uri
      || !range
    ) {
      return skipped('unsupported');
    }

    const extension = getExtension(RUFF_EXTENSION_ID);
    if (!extension) {
      return skipped('not-installed');
    }
    if (!extension.isActive) {
      return skipped('inactive');
    }

    const actions = await withTimeout(
      executeCommand(
        'vscode.executeCodeActionProvider',
        document.uri,
        range,
        RUFF_ORGANIZE_IMPORTS_KIND,
        1
      ),
      timeoutMs
    );

    const action = Array.isArray(actions)
      ? actions.find((candidate) => getKindValue(candidate) === RUFF_ORGANIZE_IMPORTS_KIND)
      : undefined;
    if (!action) {
      return skipped('no-action');
    }

    if (action.edit) {
      const applied = await withTimeout(applyEdit(action.edit), timeoutMs);
      if (!applied) {
        return skipped('edit-rejected');
      }
    }

    if (action.command && typeof action.command.command === 'string') {
      await withTimeout(
        executeCommand(action.command.command, ...(action.command.arguments || [])),
        timeoutMs
      );
    }

    if (!action.edit && !action.command) {
      return skipped('no-action');
    }

    return { organized: true, reason: 'organized' };
  } catch {
    return skipped('failed');
  }
}

function getKindValue(action) {
  if (!action || !action.kind) {
    return undefined;
  }
  return typeof action.kind === 'string' ? action.kind : action.kind.value;
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function skipped(reason) {
  return { organized: false, reason };
}

module.exports = {
  RUFF_EXTENSION_ID,
  RUFF_ORGANIZE_IMPORTS_KIND,
  organizeImportsWithRuff
};
