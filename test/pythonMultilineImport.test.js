const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { getImportInsertion, getPythonHeaderInsertionLine } = require('../src/pythonImportInsertion');
const { scanPythonStatements } = require('../src/pythonStatements');

function insertImports(source) {
  const insertion = getImportInsertion(source, ['from math import isqrt']);
  const lines = source.split(/\r?\n/);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return lines.slice(0, insertion.line).join(newline)
    + (insertion.line > 0 ? newline : '')
    + insertion.text + lines.slice(insertion.line).join(newline);
}

const examples = [
  {
    name: 'parenthesized import',
    source: 'from math import (\n    gcd,\n)\nprint(1)\n',
    line: 3
  },
  {
    name: 'explicit backslash continuation',
    source: 'from math import gcd, \\\n    lcm\nprint(1)\n',
    line: 2
  },
  {
    name: 'multiple backslash continuation lines',
    source: 'import math, \\\n    itertools, \\\n    collections\nprint(1)\n',
    line: 3
  },
  {
    name: 'parenthesized future import with comments',
    source: 'from __future__ import (  # )\n    annotations,\n    # ( comment\n)\nprint(1)\n',
    line: 4
  },
  {
    name: 'future backslash continuation',
    source: 'from __future__ import annotations, \\\n    generator_stop\nprint(1)\n',
    line: 2
  },
  {
    name: 'comments and blank lines between multiline imports',
    source: 'from math import (\n    gcd, # ) (\n\n)\n\n# next import (\nfrom collections import (\n    deque,\n)\nprint(1)\n',
    line: 9
  },
  {
    name: 'CRLF import',
    source: 'from math import (\r\n    gcd,\r\n)\r\nprint(1)\r\n',
    line: 3
  },
  {
    name: 'semicolon after complete import',
    source: 'import math; value = "# ( \\\""\nprint(1)\n',
    line: 1
  }
];

for (const example of examples) {
  test(`places a new import after the complete ${example.name}`, () => {
    assert.equal(getPythonHeaderInsertionLine(example.source), example.line);
    const result = insertImports(example.source);
    const compiled = spawnSync('uv', [
      '--no-cache', 'run', '--no-project', 'python', '-c',
      'import sys; compile(sys.stdin.read(), "snippet.py", "exec")'
    ], { input: result, encoding: 'utf8', timeout: 15000 });
    assert.ifError(compiled.error);
    assert.equal(compiled.status, 0, compiled.stderr);
    if (example.source.includes('\r\n')) {
      assert.ok(!/(?<!\r)\n/.test(result));
    }
  });
}

test('statement scanner preserves boundaries through strings and continuations', () => {
  const statements = scanPythonStatements([
    'text = """',
    'from math import (',
    '"""',
    'value = "# ( \\\""',
    'from math import ( # )',
    '    gcd,',
    ')'
  ].join('\n'));
  assert.deepEqual(statements.map(({ startLine, endLine }) => [startLine, endLine]), [
    [0, 2], [3, 3], [4, 6]
  ]);
  assert.equal(statements[2].text, 'from math import ( \n    gcd,\n)');
});
