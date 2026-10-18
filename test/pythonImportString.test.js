const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { getImportInsertion, getMissingImports, getPythonHeaderInsertionLine } = require('../src/pythonImportInsertion');

const required = ['from math import gcd'];

function insertImport(source) {
  const edit = getImportInsertion(source, required);
  if (edit.line === null) return source;
  const lines = source.split(/\r?\n/);
  const offset = lines.slice(0, edit.line).reduce((total, line) => total + line.length + 1, 0)
    + (edit.character || 0);
  return source.slice(0, offset) + edit.text + source.slice(offset);
}

test('ignores import-shaped lines in comments, assigned strings, and docstrings', () => {
  const examples = [
    '# from math import gcd\n',
    "'''\nfrom math import gcd\n'''\n",
    '"""\nfrom math import gcd\n"""\n',
    "text = '''\nfrom math import gcd\n'''\n",
    'text = r"""\nfrom math import gcd\n"""\n',
    'text = "first line\\\nfrom math import gcd"\n'
  ];
  for (const source of examples) {
    assert.deepEqual(getMissingImports(source, required), required, source);
  }
});

test('recognizes real multiline imports while preserving alias and nested rules', () => {
  const source = [
    "'''from math import gcd'''",
    'from math import (',
    '    gcd, # this is the actual import',
    '    isqrt as root,',
    ')',
    'import collections, \\',
    '    bisect',
    'def solve():',
    '    from math import lcm',
    ''
  ].join('\n');
  assert.deepEqual(getMissingImports(source, [
    'from math import gcd', 'from math import isqrt', 'from math import lcm', 'import bisect'
  ]), ['from math import isqrt', 'from math import lcm']);
});

test('places imports after escaped triple-quote docstrings and future imports', () => {
  const source = [
    '"""First line',
    'An escaped delimiter: \\"""',
    'from math import gcd',
    '"""',
    'from __future__ import annotations',
    'print(gcd(6, 9))',
    ''
  ].join('\n');
  assert.equal(getPythonHeaderInsertionLine(source), 5);
  const result = insertImport(source);
  assert.ok(result.startsWith(source.split('\n').slice(0, 5).join('\n') + '\n'));
  assert.match(result, /from __future__ import annotations\nfrom math import gcd/);
});

test('keeps raw, parenthesized, and continued constant docstrings ahead of imports', () => {
  for (const docstring of [
    'r"""raw \\""" delimiter\nfrom math import gcd\n"""',
    '(\n"module "\n"documentation"\n)',
    '"module " \\\n"documentation"'
  ]) {
    const source = `${docstring}\nfrom __future__ import annotations\nprint(gcd(6, 9))\n`;
    assert.equal(getPythonHeaderInsertionLine(source), docstring.split('\n').length + 1);
    assert.ok(insertImport(source).startsWith(`${docstring}\nfrom __future__ import annotations\n`));
  }
});

test('does not consume assigned strings or f-strings as module docstrings', () => {
  assert.equal(getPythonHeaderInsertionLine('text = """module"""\nprint(text)\n'), 0);
  assert.equal(getPythonHeaderInsertionLine('f"module {1}"\nprint(1)\n'), 0);
});

test('semicolon headers retain docstrings and legal future imports in Python', () => {
  const sources = [
    '"""doc"""; from __future__ import annotations\n',
    '"""doc""";\nfrom __future__ import annotations\n',
    '("doc" "other"); from __future__ import annotations\n',
    '"""doc""";\n',
    '"""doc; from math import gcd"""; from __future__ import (\nannotations,\n)\n',
    'r"""raw \\""" delimiter\nfrom math import gcd\n"""\nfrom __future__ import annotations\n',
    '"""escaped \\""" delimiter\nfrom math import gcd\n"""\nfrom __future__ import annotations\n'
  ].map((header) => `${header}answer = gcd(6, 9)\n`);
  const payload = sources.map((source) => ({ source, changed: insertImport(source) }));
  const result = spawnSync('uv', ['--no-cache', 'run', '--no-project', '--no-python-downloads', 'python', '-c', [
    'import ast, json, sys',
    'verified = 0',
    'for item in json.loads(sys.stdin.read()):',
    '    try:',
    '        compile(item["source"], "before.py", "exec")',
    '    except SyntaxError:',
    '        continue  # Some interpreters reject future imports after semicolons.',
    '    namespace = {}',
    '    exec(compile(item["changed"], "after.py", "exec"), namespace)',
    '    assert namespace["answer"] == 3',
    '    assert namespace["__doc__"] == ast.get_docstring(ast.parse(item["source"]), clean=False)',
    '    verified += 1',
    'assert verified > 0, "No valid original programs were verified"'
  ].join('\n')], { input: JSON.stringify(payload), encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('semicolon imports are detected without treating inline suites as top level', () => {
  assert.deepEqual(getMissingImports('import bisect; from math import gcd\n', required), []);
  assert.deepEqual(getMissingImports('if True: import bisect; from math import gcd\n', required), required);
  assert.deepEqual(getMissingImports('text = "doc; from math import gcd"\n', required), required);
});

test('long backslash runs in string expressions do not block import insertion', () => {
  const source = '"""' + '\\'.repeat(48) + '""" + "suffix"\n';
  const modulePath = require.resolve('../src/pythonImportInsertion');
  const result = spawnSync(process.execPath, ['-e', [
    `const { getImportInsertion } = require(${JSON.stringify(modulePath)});`,
    `const edit = getImportInsertion(${JSON.stringify(source)}, ['from math import gcd']);`,
    'if (edit.line !== 0) process.exit(1);'
  ].join('\n')], { timeout: 2000, encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
