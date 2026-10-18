'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getHelperInsertion, getMissingHelpers } = require('../src/pythonHelperInsertion');
const { insertInputSnippet } = require('../src/snippetInsertion');
const { createFakeTextEditor, createFakeVscodeApi } = require('./fakeTextEditor');

const HELPER = { name: 'twice', code: 'def twice(x):\n    return 2 * x' };
const SNIPPET = { body: 'twice(${1:x})', imports: [], helpers: [HELPER] };

async function insertInto(text, snippet = SNIPPET, cursor = null) {
  const { editor, state } = createFakeTextEditor(text, cursor);
  const result = await insertInputSnippet({ vscodeApi: createFakeVscodeApi(), editor, snippet });
  return { result, text: state.text, order: state.order };
}

test('an empty file gets the def, two blank lines, then the call', async () => {
  const { result, text } = await insertInto('');
  assert.equal(result.ok, true);
  assert.deepEqual(result.addedHelpers, ['twice']);
  assert.equal(text, 'def twice(x):\n    return 2 * x\n\n\ntwice(x)');
});

test('code without imports gets the def at the top', async () => {
  const { text } = await insertInto('x = 3\nprint(');
  assert.equal(text, 'def twice(x):\n    return 2 * x\n\n\nx = 3\nprint(twice(x)');
});

test('the def goes after existing imports with PEP 8 spacing', async () => {
  const { text } = await insertInto('import sys\nfrom math import gcd\n\nx = 3\n');
  assert.equal(
    text,
    'import sys\nfrom math import gcd\n\n\ndef twice(x):\n    return 2 * x\n\n\nx = 3\ntwice(x)'
  );
});

test('the def keeps shebang, encoding, docstring and __future__ above it', async () => {
  const source = [
    '#!/usr/bin/env python3',
    '# -*- coding: utf-8 -*-',
    '"""Example module."""',
    '',
    'from __future__ import annotations',
    '',
    'print(1)',
    ''
  ].join('\n');
  const { text } = await insertInto(source);
  assert.equal(text, [
    '#!/usr/bin/env python3',
    '# -*- coding: utf-8 -*-',
    '"""Example module."""',
    '',
    'from __future__ import annotations',
    '',
    '',
    'def twice(x):',
    '    return 2 * x',
    '',
    '',
    'print(1)',
    'twice(x)'
  ].join('\n'));
});

test('a final import line without a newline is followed by the def', async () => {
  const { text } = await insertInto('import sys', SNIPPET, { line: 0, character: 0 });
  assert.equal(text, 'twice(x)import sys\n\n\ndef twice(x):\n    return 2 * x\n\n\n');
});

test('CRLF files keep CRLF line endings in the def', () => {
  const insertion = getHelperInsertion('import sys\r\n\r\nprint(1)\r\n', [HELPER]);
  assert.equal(insertion.line, 1);
  assert.equal(insertion.text, '\r\n\r\ndef twice(x):\r\n    return 2 * x\r\n\r\n');
});

test('an existing top-level def is not duplicated', async () => {
  const source = 'def twice(value):\n    return value + value\n\nprint(';
  const { result, text, order } = await insertInto(source);
  assert.equal(result.ok, true);
  assert.deepEqual(result.addedHelpers, []);
  assert.doesNotMatch(result.message, /関数の定義/);
  assert.deepEqual(order, ['snippet']);
  assert.equal(text, `${source}twice(x)`);
});

test('only a top-level def counts as already defined', () => {
  assert.deepEqual(
    getMissingHelpers('class A:\n    def twice(self):\n        pass\n', [HELPER]).map((h) => h.name),
    ['twice']
  );
  assert.deepEqual(getMissingHelpers('async def twice(x):\n    pass\n', [HELPER]), []);
  assert.deepEqual(getMissingHelpers('s = "def twice(x):"\n', [HELPER]).map((h) => h.name), ['twice']);
  assert.deepEqual(getMissingHelpers('', [HELPER, HELPER]).map((h) => h.name), ['twice']);
});

test('imports and the helper are both added, imports first', async () => {
  const snippet = {
    body: 'twice(gcd(${1:a}, ${2:b}))',
    imports: ['from math import gcd'],
    helpers: [HELPER]
  };
  const { result, text, order } = await insertInto('print(1)\n', snippet);
  assert.equal(result.ok, true);
  assert.deepEqual(result.addedImports, ['from math import gcd']);
  assert.deepEqual(result.addedHelpers, ['twice']);
  assert.equal(
    result.message,
    'スニペットを挿入しました。importを追加しました: from math import gcd。関数の定義を追加しました: twice'
  );
  assert.deepEqual(order, ['edit', 'edit', 'snippet']);
  assert.equal(
    text,
    'from math import gcd\n\n\ndef twice(x):\n    return 2 * x\n\n\nprint(1)\ntwice(gcd(a, b))'
  );
});

test('the helper is placed after Ruff has organized the imports', async () => {
  const { editor, state } = createFakeTextEditor('import sys\nprint(1)\n');
  const api = createFakeVscodeApi();
  api.Range = class {};
  api.extensions = { getExtension: () => ({ isActive: true }) };
  api.workspace = {
    async applyEdit() {
      state.order.push('ruff');
      // Simulate Ruff sorting the import block.
      state.text = state.text.replace('import sys\nfrom math import gcd\n', 'from math import gcd\nimport sys\n');
      return true;
    }
  };
  api.commands.executeCommand = async (command) => command === 'vscode.executeCodeActionProvider'
    ? [{ kind: 'source.organizeImports.ruff', edit: {} }]
    : undefined;

  const result = await insertInputSnippet({
    vscodeApi: api,
    editor,
    snippet: { body: 'twice(1)', imports: ['from math import gcd'], helpers: [HELPER] }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(state.order, ['edit', 'ruff', 'edit', 'snippet']);
  assert.match(state.text, /^from math import gcd\nimport sys\n\n\ndef twice\(x\):\n    return 2 \* x\n\n\nprint\(1\)\n/);
});

test('the call is not inserted when the helper edit is refused', async () => {
  const { editor, state } = createFakeTextEditor('print(1)\n');
  editor.edit = async () => false;
  const result = await insertInputSnippet({ vscodeApi: createFakeVscodeApi(), editor, snippet: SNIPPET });
  assert.equal(result.ok, false);
  assert.match(result.message, /関数の定義を追加できませんでした/);
  assert.deepEqual(state.order, []);
  assert.equal(state.text, 'print(1)\n');
});
