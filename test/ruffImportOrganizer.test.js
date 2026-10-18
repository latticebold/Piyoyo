const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RUFF_EXTENSION_ID,
  RUFF_ORGANIZE_IMPORTS_KIND,
  organizeImportsWithRuff
} = require('../src/ruffImportOrganizer');

const document = { uri: { path: '/work/main.py' } };
const range = { start: 0, end: 3 };

function createDeps({
  extension = { isActive: true },
  actions = [{ kind: { value: RUFF_ORGANIZE_IMPORTS_KIND }, edit: { id: 'edit' } }],
  applyResult = true,
  executeCommand
} = {}) {
  const calls = { getExtension: [], executeCommand: [], applyEdit: [] };
  return {
    deps: {
      getExtension(id) {
        calls.getExtension.push(id);
        return extension;
      },
      executeCommand: executeCommand || (async (...args) => {
        calls.executeCommand.push(args);
        return actions;
      }),
      applyEdit: async (edit) => {
        calls.applyEdit.push(edit);
        return applyResult;
      },
      document,
      range
    },
    calls
  };
}

test('applies the Ruff organize-imports edit when Ruff is active', async () => {
  const { deps, calls } = createDeps();

  const result = await organizeImportsWithRuff(deps);

  assert.deepEqual(result, { organized: true, reason: 'organized' });
  assert.deepEqual(calls.getExtension, [RUFF_EXTENSION_ID]);
  assert.deepEqual(calls.executeCommand, [[
    'vscode.executeCodeActionProvider',
    document.uri,
    range,
    RUFF_ORGANIZE_IMPORTS_KIND,
    1
  ]]);
  assert.deepEqual(calls.applyEdit, [{ id: 'edit' }]);
});

test('does nothing when the Ruff extension is not installed', async () => {
  const { deps, calls } = createDeps({ extension: null });

  const result = await organizeImportsWithRuff(deps);

  assert.deepEqual(result, { organized: false, reason: 'not-installed' });
  assert.equal(calls.executeCommand.length, 0);
  assert.equal(calls.applyEdit.length, 0);
});

test('does nothing when the Ruff extension is not active', async () => {
  const { deps, calls } = createDeps({ extension: { isActive: false } });

  const result = await organizeImportsWithRuff(deps);

  assert.deepEqual(result, { organized: false, reason: 'inactive' });
  assert.equal(calls.executeCommand.length, 0);
});

test('does nothing when required APIs are missing', async () => {
  assert.deepEqual(await organizeImportsWithRuff(), { organized: false, reason: 'unsupported' });
  const { deps } = createDeps();
  assert.deepEqual(
    await organizeImportsWithRuff({ ...deps, applyEdit: undefined }),
    { organized: false, reason: 'unsupported' }
  );
  assert.deepEqual(
    await organizeImportsWithRuff({ ...deps, document: {} }),
    { organized: false, reason: 'unsupported' }
  );
});

test('swallows errors thrown by the code action provider', async () => {
  const { deps, calls } = createDeps({
    executeCommand: async () => {
      throw new Error('server crashed');
    }
  });

  const result = await organizeImportsWithRuff(deps);

  assert.deepEqual(result, { organized: false, reason: 'failed' });
  assert.equal(calls.applyEdit.length, 0);
});

test('swallows errors thrown by getExtension', async () => {
  const { deps } = createDeps();

  const result = await organizeImportsWithRuff({
    ...deps,
    getExtension() {
      throw new Error('boom');
    }
  });

  assert.deepEqual(result, { organized: false, reason: 'failed' });
});

test('gives up when the code action provider does not answer in time', async () => {
  const { deps, calls } = createDeps({
    executeCommand: () => new Promise(() => {})
  });

  const result = await organizeImportsWithRuff({ ...deps, timeoutMs: 10 });

  assert.deepEqual(result, { organized: false, reason: 'failed' });
  assert.equal(calls.applyEdit.length, 0);
});

test('skips when Ruff returns no matching action', async () => {
  for (const actions of [null, [], [{ kind: { value: 'source.fixAll.ruff' }, edit: {} }]]) {
    const { deps, calls } = createDeps({ actions });

    const result = await organizeImportsWithRuff(deps);

    assert.deepEqual(result, { organized: false, reason: 'no-action' });
    assert.equal(calls.applyEdit.length, 0);
  }
});

test('reports a rejected edit without throwing', async () => {
  const { deps } = createDeps({ applyResult: false });

  const result = await organizeImportsWithRuff(deps);

  assert.deepEqual(result, { organized: false, reason: 'edit-rejected' });
});

test('runs the action command when Ruff returns one', async () => {
  const commandCalls = [];
  const { deps, calls } = createDeps({
    executeCommand: async (...args) => {
      commandCalls.push(args);
      if (args[0] === 'vscode.executeCodeActionProvider') {
        return [{
          kind: { value: RUFF_ORGANIZE_IMPORTS_KIND },
          command: { command: 'ruff.applyOrganizeImports', arguments: ['a'] }
        }];
      }
      return undefined;
    }
  });

  const result = await organizeImportsWithRuff(deps);

  assert.deepEqual(result, { organized: true, reason: 'organized' });
  assert.deepEqual(commandCalls[1], ['ruff.applyOrganizeImports', 'a']);
  assert.equal(calls.applyEdit.length, 0);
});
