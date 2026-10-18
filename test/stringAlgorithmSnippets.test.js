'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { INPUT_SNIPPETS, getInputSnippet, getSnippetPlaceholders } = require('../src/snippetLibrary');

const STRING_ALGORITHM_IDS = [
  'string-hamming-distance',
  'string-levenshtein-distance',
  'string-find-all',
  'string-z-algorithm'
];

const pythonResult = spawnSync('uv', [
  '--no-cache', 'run', '--no-project', 'python', '-c', 'import sys; print(sys.executable)'
], { encoding: 'utf8' });
assert.equal(pythonResult.status, 0, pythonResult.error?.message || pythonResult.stderr);
const pythonPath = pythonResult.stdout.trim();

function runPython(source) {
  const result = spawnSync(pythonPath, ['-I', '-X', 'utf8', '-'], {
    input: source,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function runWithSnippet(id, checks) {
  return runPython(`${getInputSnippet(id).body}\n\n${checks.join('\n')}\nprint("ok")\n`);
}

test('string algorithm snippets form their own category with literal function bodies', () => {
  assert.deepEqual(
    INPUT_SNIPPETS.filter((snippet) => snippet.category === 'string-algorithm').map((snippet) => snippet.id),
    STRING_ALGORITHM_IDS
  );
  for (const id of STRING_ALGORITHM_IDS) {
    const snippet = getInputSnippet(id);
    assert.equal(snippet.categoryLabel, '文字列アルゴリズム');
    assert.match(snippet.label, /^def [a-z_]+\(/);
    assert.ok(snippet.body.startsWith(`${snippet.label}:\n`), id);
    assert.deepEqual(getSnippetPlaceholders(snippet.body), [], id);
    assert.doesNotMatch(snippet.body, /[$\\]/, id);
    assert.deepEqual(snippet.imports, []);
  }
  assert.match(getInputSnippet('string-hamming-distance').precondition, /長さが違うとValueError/);
  assert.match(getInputSnippet('string-find-all').precondition, /空文字列だとValueError/);
  assert.equal(getInputSnippet('string-levenshtein-distance').complexity.time, 'O(n × m)');
});

test('hamming_distance counts differing positions and rejects different lengths', () => {
  assert.equal(runWithSnippet('string-hamming-distance', [
    'assert hamming_distance("", "") == 0',
    'assert hamming_distance("abc", "abc") == 0',
    'assert hamming_distance("karolin", "kathrin") == 3',
    'assert hamming_distance("a", "b") == 1',
    'for s, t in [("abc", "ab"), ("", "a"), ("a", "")]:',
    '    try:',
    '        hamming_distance(s, t)',
    '    except ValueError:',
    '        pass',
    '    else:',
    '        raise AssertionError((s, t))'
  ]).trim(), 'ok');
});

test('levenshtein_distance handles empty strings and different lengths', () => {
  assert.equal(runWithSnippet('string-levenshtein-distance', [
    'assert levenshtein_distance("", "") == 0',
    'assert levenshtein_distance("", "abc") == 3',
    'assert levenshtein_distance("abc", "") == 3',
    'assert levenshtein_distance("abc", "abc") == 0',
    'assert levenshtein_distance("kitten", "sitting") == 3',
    'assert levenshtein_distance("flaw", "lawn") == 2',
    'assert levenshtein_distance("a", "b") == 1'
  ]).trim(), 'ok');
});

test('find_all returns overlapping indices and rejects an empty pattern', () => {
  assert.equal(runWithSnippet('string-find-all', [
    'assert find_all("aaa", "aa") == [0, 1]',
    'assert find_all("abcabc", "abc") == [0, 3]',
    'assert find_all("abc", "d") == []',
    'assert find_all("", "a") == []',
    'assert find_all("ab", "abc") == []',
    'assert find_all("abc", "abc") == [0]',
    'try:',
    '    find_all("abc", "")',
    'except ValueError:',
    '    pass',
    'else:',
    '    raise AssertionError("empty pattern")'
  ]).trim(), 'ok');
});

test('z_algorithm matches a brute-force definition', () => {
  assert.equal(runWithSnippet('string-z-algorithm', [
    'def naive(s):',
    '    z = []',
    '    for i in range(len(s)):',
    '        k = 0',
    '        while i + k < len(s) and s[k] == s[i + k]:',
    '            k += 1',
    '        z.append(k)',
    '    return z',
    'assert z_algorithm("") == []',
    'assert z_algorithm("a") == [1]',
    'assert z_algorithm("aaaaa") == [5, 4, 3, 2, 1]',
    'assert z_algorithm("abacaba") == [7, 0, 1, 0, 3, 0, 1]',
    'from itertools import product',
    'for n in range(1, 9):',
    '    for chars in product("ab", repeat=n):',
    '        s = "".join(chars)',
    '        assert z_algorithm(s) == naive(s), s',
    't, s = "aba", "ababa"',
    'z = z_algorithm(t + "#" + s)',
    'assert [i - len(t) - 1 for i in range(len(z)) if z[i] == len(t)] == [0, 2]'
  ]).trim(), 'ok');
});
