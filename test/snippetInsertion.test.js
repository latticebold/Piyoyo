const test = require('node:test');
const assert = require('node:assert/strict');

const { insertInputSnippet } = require('../src/snippetInsertion');

class FakeSnippetString {
  constructor(value) {
    this.value = value;
  }
}

class FakePosition {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

function createVscodeApi() {
  const commands = [];
  return {
    api: {
      SnippetString: FakeSnippetString,
      Position: FakePosition,
      commands: {
        async executeCommand(command) {
          commands.push(command);
        }
      }
    },
    commands
  };
}

function createEditor({
  languageId = 'python',
  selections = [{ id: 1 }],
  text = '',
  editResult = true
} = {}) {
  const calls = [];
  const editCalls = [];
  return {
    editor: {
      document: {
        languageId,
        isUntitled: true,
        getText() {
          return text;
        }
      },
      selections,
      selection: selections[0],
      async edit(callback) {
        const operations = [];
        callback({
          insert(position, value) {
            operations.push({ position, value });
          }
        });
        editCalls.push(operations);
        return editResult;
      },
      async insertSnippet(snippet, locations) {
        calls.push({ snippet, locations });
        return true;
      }
    },
    calls,
    editCalls
  };
}

test('inserts a snippet into every selection and focuses the editor', async () => {
  const selections = [{ id: 1 }, { id: 2 }];
  const { api, commands } = createVscodeApi();
  const { editor, calls, editCalls } = createEditor({ selections });

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: '${1:n} = int(input())' }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.addedImports, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].snippet.value, '${1:n} = int(input())');
  assert.equal(calls[0].locations, selections);
  assert.deepEqual(editCalls, []);
  assert.deepEqual(commands, ['workbench.action.focusActiveEditorGroup']);
});

test('allows insertion into an untitled Python document', async () => {
  const { api } = createVscodeApi();
  const { editor } = createEditor();

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'input()' }
  });

  assert.equal(result.ok, true);
});

test('applies webview placeholder values while keeping VS Code tab stops', async () => {
  const { api } = createVscodeApi();
  const { editor, calls } = createEditor();

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'max(${1:A}) + ${1:A}', imports: [] },
    placeholderValues: { 1: 'values' }
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].snippet.value, 'max(${1:values}) + ${1:values}');
});

test('adds a missing import at the start before inserting the snippet', async () => {
  const { api } = createVscodeApi();
  const { editor, calls, editCalls } = createEditor({ text: 'print(1)\n' });

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: {
      body: 'gcd(${1:a}, ${2:b})',
      imports: ['from math import gcd']
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.addedImports, ['from math import gcd']);
  assert.match(result.message, /importを追加しました/);
  assert.equal(editCalls.length, 1);
  assert.equal(editCalls[0].length, 1);
  assert.equal(editCalls[0][0].position.line, 0);
  assert.equal(editCalls[0][0].position.character, 0);
  assert.equal(editCalls[0][0].value, 'from math import gcd\n\n');
  assert.equal(calls.length, 1);
});

test('does not add an import already covered by a multiple-name import', async () => {
  const { api } = createVscodeApi();
  const { editor, editCalls } = createEditor({
    text: 'from math import gcd, isqrt\n\nprint(1)\n'
  });

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: {
      body: 'isqrt(${1:n})',
      imports: ['from math import isqrt']
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.addedImports, []);
  assert.deepEqual(editCalls, []);
});

test('uses cursor locations updated by the import edit, including multiple cursors', async () => {
  const { api } = createVscodeApi();
  const { editor, calls } = createEditor({
    text: 'print(1)\nprint(2)\n',
    selections: [{ line: 0 }, { line: 1 }]
  });
  const shiftedSelections = [{ line: 2 }, { line: 3 }];
  const edit = editor.edit;
  editor.edit = async (callback) => {
    const result = await edit(callback);
    editor.selections = shiftedSelections;
    return result;
  };

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'deque()', imports: ['from collections import deque'] }
  });

  assert.equal(result.ok, true);
  assert.equal(calls[0].locations, shiftedSelections);
});

test('keeps Python header statements before a new import', async () => {
  const { api } = createVscodeApi();
  const { editor, editCalls } = createEditor({
    text: [
      '#!/usr/bin/env python3',
      '# -*- coding: utf-8 -*-',
      '"""Example module."""',
      '',
      'from __future__ import annotations',
      '',
      'print(1)',
      ''
    ].join('\n')
  });

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: {
      body: 'bisect_left(${1:a}, ${2:x})',
      imports: ['from bisect import bisect_left']
    }
  });

  assert.equal(result.ok, true);
  assert.equal(editCalls[0][0].position.line, 6);
  assert.equal(editCalls[0][0].value, 'from bisect import bisect_left\n\n');
});

test('does not insert the body when import insertion is refused', async () => {
  const { api } = createVscodeApi();
  const { editor, calls, editCalls } = createEditor({
    text: 'print(1)\n',
    editResult: false
  });

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: {
      body: 'isqrt(${1:n})',
      imports: ['from math import isqrt']
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /必要なimportを追加できませんでした/);
  assert.equal(editCalls.length, 1);
  assert.equal(calls.length, 0);
});

test('reports an insertion failure after keeping imports that were added', async () => {
  const { api } = createVscodeApi();
  const { editor, editCalls } = createEditor({ text: 'print(1)\n' });
  editor.insertSnippet = async () => false;

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: {
      body: 'gcd(${1:a}, ${2:b})',
      imports: ['from math import gcd']
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /importは追加しました/);
  assert.deepEqual(result.addedImports, ['from math import gcd']);
  assert.equal(editCalls.length, 1);
});

test('rejects a missing editor, a non-Python editor, and an unknown snippet', async () => {
  const { api } = createVscodeApi();
  const { editor, calls } = createEditor({ languageId: 'javascript' });

  const missingEditor = await insertInputSnippet({
    vscodeApi: api,
    editor: undefined,
    snippet: { body: 'input()' }
  });
  const wrongLanguage = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'input()' }
  });
  editor.document.languageId = 'python';
  const missingSnippet = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: undefined
  });

  assert.equal(missingEditor.ok, false);
  assert.match(missingEditor.message, /Pythonファイル/);
  assert.equal(wrongLanguage.ok, false);
  assert.match(wrongLanguage.message, /Pythonファイル/);
  assert.equal(missingSnippet.ok, false);
  assert.match(missingSnippet.message, /見つかりません/);
  assert.equal(calls.length, 0);
});

test('reports when VS Code refuses or throws during insertion', async () => {
  const { api } = createVscodeApi();
  const { editor } = createEditor();
  editor.insertSnippet = async () => false;

  const refused = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'input()' }
  });
  editor.insertSnippet = async () => {
    throw new Error('editor closed');
  };
  const thrown = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'input()' }
  });

  assert.equal(refused.ok, false);
  assert.match(refused.message, /挿入できませんでした/);
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /editor closed/);
});

function createRuffVscodeApi({ extension = { isActive: true }, provideActions }) {
  const { api, commands } = createVscodeApi();
  const order = [];
  const appliedEdits = [];
  api.Range = class FakeRange {
    constructor(startLine, startCharacter, endLine, endCharacter) {
      Object.assign(this, { startLine, startCharacter, endLine, endCharacter });
    }
  };
  api.extensions = { getExtension: () => extension };
  api.workspace = {
    async applyEdit(edit) {
      order.push('ruff-edit');
      appliedEdits.push(edit);
      return true;
    }
  };
  api.commands.executeCommand = async (command, ...args) => {
    commands.push(command);
    if (command === 'vscode.executeCodeActionProvider') {
      return provideActions(...args);
    }
    return undefined;
  };
  return { api, commands, order, appliedEdits };
}

function createDocumentEditor(text) {
  const created = createEditor({ text });
  created.editor.document.uri = { path: '/work/main.py' };
  created.editor.document.lineCount = 2;
  return created;
}

test('lets Ruff organize imports after adding them and before the snippet', async () => {
  const { api, order, appliedEdits } = createRuffVscodeApi({
    provideActions: () => [{ kind: { value: 'source.organizeImports.ruff' }, edit: { id: 1 } }]
  });
  const { editor } = createDocumentEditor('print(1)\n');
  const insertSnippet = editor.insertSnippet;
  editor.insertSnippet = async (...args) => {
    order.push('snippet');
    return insertSnippet(...args);
  };

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'gcd(${1:a}, ${2:b})', imports: ['from math import gcd'] }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(appliedEdits, [{ id: 1 }]);
  assert.deepEqual(order, ['ruff-edit', 'snippet']);
});

test('keeps inserting normally when Ruff fails', async () => {
  const { api, commands, appliedEdits } = createRuffVscodeApi({
    provideActions: () => {
      throw new Error('ruff server is down');
    }
  });
  const { editor, calls, editCalls } = createDocumentEditor('print(1)\n');

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'gcd(${1:a}, ${2:b})', imports: ['from math import gcd'] }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.addedImports, ['from math import gcd']);
  assert.equal(editCalls.length, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(appliedEdits, []);
  assert.equal(commands.at(-1), 'workbench.action.focusActiveEditorGroup');
});

test('does not call Ruff when the Ruff extension is missing or no import was added', async () => {
  const missing = createRuffVscodeApi({
    extension: null,
    provideActions: () => assert.fail('should not ask Ruff')
  });
  const first = await insertInputSnippet({
    vscodeApi: missing.api,
    editor: createDocumentEditor('print(1)\n').editor,
    snippet: { body: 'gcd(a, b)', imports: ['from math import gcd'] }
  });
  assert.equal(first.ok, true);
  assert.ok(!missing.commands.includes('vscode.executeCodeActionProvider'));

  const noImports = createRuffVscodeApi({
    provideActions: () => assert.fail('should not ask Ruff')
  });
  const second = await insertInputSnippet({
    vscodeApi: noImports.api,
    editor: createDocumentEditor('').editor,
    snippet: { body: 'input()' }
  });
  assert.equal(second.ok, true);
  assert.ok(!noImports.commands.includes('vscode.executeCodeActionProvider'));
});
