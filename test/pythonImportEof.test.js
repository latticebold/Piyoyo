const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { getImportInsertion } = require('../src/pythonImportInsertion');
const { insertInputSnippet } = require('../src/snippetInsertion');

function applyInsertion(source, insertion) {
  const lines = source.split(/\r?\n/);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const offset = lines.slice(0, insertion.line)
    .reduce((length, line) => length + line.length + newline.length, 0)
    + (insertion.character || 0);
  return source.slice(0, offset) + insertion.text + source.slice(offset);
}

const cases = [
  { name: 'future import', source: 'from __future__ import annotations' },
  { name: 'multiline future import', source: 'from __future__ import (\n    annotations,\n)' },
  { name: 'single-line docstring', source: '"""A module."""', docstring: 'A module.' },
  { name: 'multiline docstring', source: '"""A module.\nDetails."""', docstring: 'A module.\nDetails.' },
  { name: 'shebang', source: '#!/usr/bin/env python3' },
  { name: 'encoding comment', source: '# coding: utf-8' },
  { name: 'header comment', source: '#競技プログラミング用' },
  { name: 'ordinary import', source: 'import sys' },
  { name: 'multiline ordinary import', source: 'from collections import (\n    deque,\n)' },
  { name: 'complete CRLF header', source: '#!/usr/bin/env python3\r\n# coding: utf-8\r\n"""A module."""\r\nfrom __future__ import annotations', docstring: 'A module.' },
  { name: 'trailing comment after future', source: 'from __future__ import annotations\n#header end' }
];

for (const example of cases) {
  test(`appends a required import after EOF ${example.name}`, () => {
    const insertion = getImportInsertion(example.source, ['from math import isqrt']);
    const lines = example.source.split(/\r?\n/);
    const newline = example.source.includes('\r\n') ? '\r\n' : '\n';
    assert.equal(insertion.line, lines.length - 1);
    assert.equal(insertion.character, lines.at(-1).length);
    assert.equal(insertion.text, `${newline}from math import isqrt${newline}`);
    assert.equal(applyInsertion(example.source, insertion), example.source + insertion.text);
  });
}

test('keeps empty documents and trailing-newline edit shapes compatible', () => {
  assert.deepEqual(getImportInsertion('', ['from math import isqrt']), {
    imports: ['from math import isqrt'], line: 0, text: 'from math import isqrt\n'
  });
  assert.deepEqual(getImportInsertion('import sys\n', ['from math import isqrt']), {
    imports: ['from math import isqrt'], line: 1, text: 'from math import isqrt\n'
  });
});

test('EOF edits compile, keep module docstrings, and make the imported name usable in Python', () => {
  const editedCases = [...cases, { name: 'empty document', source: '' }].map((example) => ({
    source: applyInsertion(example.source, getImportInsertion(example.source, ['from math import isqrt'])),
    docstring: example.docstring || null
  }));
  const result = spawnSync('uv', [
    '--no-cache', 'run', '--no-project', 'python', '-c',
    'import json, sys\nfor case in json.load(sys.stdin):\n namespace = {}\n exec(compile(case["source"], "snippet.py", "exec"), namespace)\n assert namespace["isqrt"](81) == 9\n assert namespace.get("__doc__") == case["docstring"]'
  ], { input: JSON.stringify(editedCases), encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('snippet editor receives the EOF character and applies the import after the header', async () => {
  for (const example of cases) {
    let text = example.source;
    let editPosition;
    const editor = {
      document: { languageId: 'python', getText: () => text },
      selections: [{ id: 'tracked-selection' }],
      async edit(callback) {
        callback({ insert(position, value) {
          editPosition = position;
          text = applyInsertion(text, { ...position, text: value });
        } });
        return true;
      },
      async insertSnippet() { return true; }
    };
    const vscodeApi = {
      Position: class { constructor(line, character) { this.line = line; this.character = character; } },
      SnippetString: class { constructor(value) { this.value = value; } },
      commands: { async executeCommand() {} }
    };
    const result = await insertInputSnippet({
      vscodeApi, editor, snippet: { body: 'isqrt(81)', imports: ['from math import isqrt'] }
    });
    assert.equal(result.ok, true);
    assert.equal(editPosition.character, example.source.split(/\r?\n/).at(-1).length);
    const newline = example.source.includes('\r\n') ? '\r\n' : '\n';
    assert.equal(text, `${example.source}${newline}from math import isqrt${newline}`);
  }
});
