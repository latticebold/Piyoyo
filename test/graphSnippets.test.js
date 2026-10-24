'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const { INPUT_SNIPPETS, getInputSnippet } = require('../src/snippetLibrary');

const GRAPH_IDS = [
  'graph-adjacency-list',
  'graph-add-edge',
  'graph-read-undirected',
  'graph-bfs-distance',
  'tree-parent-depth',
  'tree-diameter'
];

const pythonResult = spawnSync('uv', [
  '--no-cache', 'run', '--no-project', 'python', '-c', 'import sys; print(sys.executable)'
], { encoding: 'utf8' });
assert.equal(pythonResult.status, 0, pythonResult.error?.message || pythonResult.stderr);
const pythonPath = pythonResult.stdout.trim();

// The program goes in -c so that stdin stays free for read_graph.
function runPython(source, stdin = '') {
  const result = spawnSync(pythonPath, ['-I', '-X', 'utf8', '-c', source], {
    input: stdin,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function runWithSnippet(id, checks, stdin) {
  const snippet = getInputSnippet(id);
  const source = [
    ...snippet.imports,
    ...snippet.helpers.map((helper) => helper.code),
    ...checks,
    'print("ok")'
  ].join('\n\n');
  return runPython(source, stdin);
}

test('graph snippets form one category with built-ins before helpers', () => {
  assert.deepEqual(
    INPUT_SNIPPETS.filter((snippet) => snippet.category === 'graph').map((snippet) => snippet.id),
    GRAPH_IDS
  );
  for (const id of GRAPH_IDS) {
    const snippet = getInputSnippet(id);
    assert.equal(snippet.categoryLabel, 'グラフ・木', id);
    assert.equal(snippet.body.replace(/\$\{\d+:([^}]*)\}/g, '$1'), snippet.label, id);
    assert.doesNotMatch(snippet.body, /\n/, id);
    for (const helper of snippet.helpers) {
      assert.ok(helper.code.startsWith(`def ${helper.name}(`), id);
      assert.doesNotMatch(helper.code, /[$\\]/, id);
    }
    if (snippet.helpers.length > 0) {
      assert.ok(snippet.label.startsWith(`${snippet.helpers.at(-1).name}(`), id);
    }
  }
  assert.deepEqual(getInputSnippet('graph-bfs-distance').imports, ['from collections import deque']);
  assert.deepEqual(
    getInputSnippet('tree-diameter').helpers.map((helper) => helper.name),
    ['bfs_distance', 'tree_diameter']
  );
  assert.equal(
    getInputSnippet('tree-diameter').helpers[0].code,
    getInputSnippet('graph-bfs-distance').helpers[0].code
  );
});

test('built-in graph snippets build an adjacency list', () => {
  assert.equal(runPython([
    'G = [[] for _ in range(3)]',
    'G[0].append(1)',
    'assert G == [[1], [], []]',
    'print("ok")'
  ].join('\n')), 'ok');
});

test('read_graph reads 1-indexed undirected edges into a 0-indexed adjacency list', () => {
  assert.equal(runWithSnippet('graph-read-undirected', [
    'G = read_graph(4, 3)',
    'assert G == [[1, 2], [0], [0, 3], [2]], G'
  ], '1 2\n1 3\n3 4\n'), 'ok');
  assert.equal(runWithSnippet('graph-read-undirected', [
    'assert read_graph(1, 0) == [[]]'
  ]), 'ok');
});

test('bfs_distance gives edge counts and -1 for unreachable vertices', () => {
  assert.equal(runWithSnippet('graph-bfs-distance', [
    'G = [[1, 2], [0, 3], [0, 3], [1, 2], []]',
    'assert bfs_distance(G, 0) == [0, 1, 1, 2, -1]',
    'assert bfs_distance(G, 3) == [2, 1, 1, 0, -1]',
    'assert bfs_distance(G, 4) == [-1, -1, -1, -1, 0]'
  ]), 'ok');
});

test('tree_parent_depth returns parents and depths without recursion', () => {
  assert.equal(runWithSnippet('tree-parent-depth', [
    'G = [[1, 2], [0, 3, 4], [0], [1], [1]]',
    'assert tree_parent_depth(G, 0) == ([-1, 0, 0, 1, 1], [0, 1, 1, 2, 2])',
    'assert tree_parent_depth(G, 3) == ([1, 3, 0, -1, 1], [2, 1, 3, 0, 2])',
    'assert tree_parent_depth([[]], 0) == ([-1], [0])',
    'n = 200000',
    'path = [[] for _ in range(n)]',
    'for v in range(n - 1):',
    '    path[v].append(v + 1)',
    '    path[v + 1].append(v)',
    'parent, depth = tree_parent_depth(path, 0)',
    'assert depth[-1] == n - 1 and parent[-1] == n - 2'
  ]), 'ok');
});

test('tree_diameter finds the longest path in edges', () => {
  assert.equal(runWithSnippet('tree-diameter', [
    'assert tree_diameter([[]]) == 0',
    'assert tree_diameter([[1], [0]]) == 1',
    'G = [[1, 2], [0, 3, 4], [0], [1], [1, 5], [4]]',
    'assert tree_diameter(G) == 4'
  ]), 'ok');
});

test('dictionary snippets behave as described', () => {
  const ids = [
    'dict-lookup', 'dict-get-default', 'dict-assign', 'dict-delete',
    'dict-keys', 'dict-values', 'dict-items', 'dict-sorted-items', 'dict-max-key'
  ];
  assert.deepEqual(
    INPUT_SNIPPETS.filter((snippet) => snippet.id.startsWith('dict-')).map((snippet) => snippet.id),
    ids
  );
  for (const id of ids) {
    const snippet = getInputSnippet(id);
    assert.equal(snippet.category, 'aggregation', id);
    assert.deepEqual(snippet.imports, [], id);
    assert.deepEqual(snippet.helpers, [], id);
  }
  assert.deepEqual(
    INPUT_SNIPPETS.filter((snippet) => snippet.selectorGroup === 'dict-view').map((snippet) => snippet.id),
    ['dict-keys', 'dict-values', 'dict-items']
  );
  const labels = ids.slice(1).map((id) => getInputSnippet(id).label);
  assert.equal(runPython([
    'd = {"b": 2, "a": 3}',
    'x = "a"',
    'v = 5',
    `assert ${labels[0]} == 3`,
    'assert d.get("z", 0) == 0',
    `${labels[1]}`,
    'assert d == {"b": 2, "a": 5}',
    `assert list(${labels[3]}) == ["b", "a"]`,
    `assert list(${labels[4]}) == [2, 5]`,
    `assert list(${labels[5]}) == [("b", 2), ("a", 5)]`,
    `assert ${labels[6]} == [("a", 5), ("b", 2)]`,
    `assert ${labels[7]} == "a"`,
    `${labels[2]}`,
    'assert d == {"b": 2}',
    'print("ok")'
  ].join('\n')), 'ok');
});
