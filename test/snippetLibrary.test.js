const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INPUT_SNIPPETS,
  SNIPPET_CATEGORY_ORDER,
  SNIPPET_DISPLAY_ORDER,
  SNIPPET_ID_ALIASES,
  getInputSnippet,
  getSnippetPlaceholders,
  applySnippetPlaceholderValues
} = require('../src/snippetLibrary');

const EXPECTED_CATEGORY_COUNTS = {
  input: 15,
  'number-conversion': 12,
  string: 18,
  list: 20,
  tuple: 3,
  aggregation: 16,
  queue: 7,
  'brute-force': 2,
  'prefix-sum': 2,
  'binary-search': 3,
  graph: 6,
  output: 7
};

const EXPECTED_CATEGORY_LABELS = {
  input: '入力',
  'number-conversion': '数値・型変換',
  string: '文字列',
  list: 'リスト',
  tuple: 'タプル・座標',
  aggregation: '集合・辞書・数え上げ',
  queue: 'キュー・deque',
  'brute-force': '全探索',
  'prefix-sum': '累積和',
  'binary-search': '二分探索',
  graph: 'グラフ・木',
  output: '出力・デバッグ'
};

const EXISTING_SNIPPET_BODIES_AND_IMPORTS = {
  'basic-string': ['input()', []],
  'basic-int': ['int(input())', []],
  'basic-float': ['float(input())', []],
  'basic-chars': ['list(input())', []],
  'split-strings': ['input().split()', []],
  'split-map-int': ['map(int, input().split())', []],
  'split-int-list': ['list(map(int, input().split()))', []],
  'split-float-list': ['list(map(float, input().split()))', []],
  'multiline-strings': ['[input() for _ in range(${1:n})]', []],
  'multiline-ints': ['[int(input()) for _ in range(${1:n})]', []],
  'multiline-int-matrix': ['[list(map(int, input().split())) for _ in range(${1:n})]', []],
  'multiline-char-grid': ['[list(input()) for _ in range(${1:n})]', []],
  'convenient-sorted-ints': ['sorted(map(int, input().split()))', []],
  'convenient-int-set': ['set(map(int, input().split()))', []],
  'convenient-indexed-ints': ['[0] + list(map(int, input().split()))', []],
  'math-gcd': ['gcd(${1:a}, ${2:b})', ['from math import gcd']],
  'math-isqrt': ['isqrt(${1:n})', ['from math import isqrt']],
  'binary-bisect-left': ['bisect_left(${1:a}, ${2:x})', ['from bisect import bisect_left']],
  'binary-bisect-right': ['bisect_right(${1:a}, ${2:x})', ['from bisect import bisect_right']],
  'aggregation-counter': ['Counter(${1:a})', ['from collections import Counter']],
  'aggregation-defaultdict-int': ['defaultdict(int)', ['from collections import defaultdict']],
  'aggregation-defaultdict-list': ['defaultdict(list)', ['from collections import defaultdict']],
  'aggregation-accumulate': ['list(accumulate(${1:a}, initial=0))', ['from itertools import accumulate']],
  'queue-deque': ['deque([${1:start}])', ['from collections import deque']]
};

const ADDED_SNIPPET_IDS = [
  'output-value', 'output-text', 'output-two-values', 'output-unpack-list',
  'number-abs', 'number-max-two', 'number-min-two', 'number-floor-division',
  'number-remainder', 'math-lcm', 'conversion-int', 'conversion-float',
  'conversion-str', 'conversion-digit-list',
  'sequence-length',
  'list-access', 'list-access-from-end', 'list-slice',
  'string-count',
  'string-contains', 'string-reverse', 'string-lower', 'string-upper',
  'string-replace', 'string-find',
  'string-set-char',
  'list-max', 'list-min', 'list-sum', 'list-contains', 'list-count',
  'list-sort-ascending', 'list-sort-descending', 'comprehension-range',
  'comprehension-squares', 'comprehension-even-filter', 'comprehension-conditional-expression', 'comprehension-zero-matrix',
  'string-isdigit',
  'string-isalpha', 'string-isalnum', 'string-islower', 'string-isupper',
  'string-isspace', 'aggregation-counter-value', 'aggregation-increment',
  'prefix-sum-range', 'brute-combinations', 'brute-permutations',
  'binary-count-closed-interval',
  'queue-deque-empty', 'queue-append', 'queue-popleft',
  'queue-appendleft', 'queue-pop',
  'queue-index',
  'tuple-coordinate', 'tuple-single-item', 'tuple-unpack-coordinate',
  'debug-type', 'debug-isinstance-int', 'debug-isinstance-str',
  'list-append', 'list-pop', 'list-pop-first', 'list-index',
  'set-add', 'set-contains', 'dict-lookup'
];

test('111 snippets have complete frozen metadata in the 12-category usage order', () => {
  const ids = INPUT_SNIPPETS.map((snippet) => snippet.id);
  const categories = [...new Set(INPUT_SNIPPETS.map((snippet) => snippet.category))];

  assert.equal(INPUT_SNIPPETS.length, 111);
  assert.equal(new Set(ids).size, 111);
  assert.deepEqual(SNIPPET_CATEGORY_ORDER, Object.keys(EXPECTED_CATEGORY_COUNTS));
  assert.deepEqual(categories, SNIPPET_CATEGORY_ORDER);
  assert.deepEqual(
    Object.fromEntries(
      SNIPPET_CATEGORY_ORDER.map((category) => [
        category,
        INPUT_SNIPPETS.filter((snippet) => snippet.category === category).length
      ])
    ),
    EXPECTED_CATEGORY_COUNTS
  );
  assert.ok(Object.isFrozen(INPUT_SNIPPETS));

  INPUT_SNIPPETS.forEach((snippet) => {
    for (const field of [
      'id', 'category', 'categoryLabel', 'selectorGroup', 'selectorGroupLabel', 'choiceLabel',
      'summary', 'description', 'input',
      'returns', 'precondition', 'label', 'body', 'imports', 'helpers', 'externalPackages', 'complexity'
    ]) {
      assert.ok(Object.hasOwn(snippet, field), `${snippet.id} is missing ${field}`);
    }
    assert.equal(snippet.categoryLabel, EXPECTED_CATEGORY_LABELS[snippet.category], snippet.id);
    assert.ok(snippet.summary);
    assert.ok(snippet.description);
    assert.ok(snippet.input);
    assert.ok(snippet.returns);
    assert.ok(snippet.label);
    assert.equal(typeof snippet.precondition, 'string');
    assert.equal(typeof snippet.selectorGroup, 'string');
    assert.equal(typeof snippet.selectorGroupLabel, 'string');
    assert.equal(typeof snippet.choiceLabel, 'string');
    assert.equal(typeof snippet.body, 'string');
    assert.ok(Object.isFrozen(snippet));
    assert.ok(Object.isFrozen(snippet.imports));
    assert.ok(Object.isFrozen(snippet.helpers));
    assert.ok(Object.isFrozen(snippet.externalPackages));
    // Every current snippet uses only Python and its standard library.
    assert.deepEqual(snippet.externalPackages, []);
    assert.ok(Object.isFrozen(snippet.complexity));
    assert.ok(snippet.complexity.time);
    assert.ok(['最悪', '平均', '償却'].includes(snippet.complexity.qualifier));
    assert.ok(snippet.complexity.detail);
  });
});

test('queue snippets are ordered by common use', () => {
  assert.deepEqual(
    INPUT_SNIPPETS.filter((snippet) => snippet.category === 'queue').map((snippet) => snippet.id),
    [
      'queue-deque-empty',
      'queue-deque',
      'queue-append',
      'queue-popleft',
      'queue-appendleft',
      'queue-pop',
      'queue-index'
    ]
  );
  assert.equal(INPUT_SNIPPETS.some((snippet) => ['bfs-graph', 'heap'].includes(snippet.category)), false);
});

test('rows follow the display order, with each selector group kept together', () => {
  assert.equal(new Set(SNIPPET_DISPLAY_ORDER).size, SNIPPET_DISPLAY_ORDER.length);
  assert.deepEqual(INPUT_SNIPPETS.map((snippet) => snippet.id), SNIPPET_DISPLAY_ORDER);

  for (const category of SNIPPET_CATEGORY_ORDER) {
    const rows = INPUT_SNIPPETS.filter((snippet) => snippet.category === category);
    // Queue rows alternate add/remove by usage; their groups render at the first member.
    const groups = category === 'queue' ? [] : rows.map((snippet) => snippet.selectorGroup).filter(Boolean);
    for (const group of new Set(groups)) {
      const positions = rows
        .map((snippet, index) => (snippet.selectorGroup === group ? index : -1))
        .filter((index) => index >= 0);
      assert.equal(positions.at(-1) - positions[0] + 1, positions.length, `${group} is split`);
    }
    const firstHelper = rows.findIndex((snippet) => snippet.helpers.length > 0);
    if (firstHelper >= 0) {
      assert.ok(rows.slice(firstHelper).every((snippet) => snippet.helpers.length > 0), `${category} helpers last`);
    }
  }
});

test('related snippets share one category instead of split ones', () => {
  const categoryOf = (id) => getInputSnippet(id).category;
  for (const id of [
    'string-find', 'string-isdigit', 'string-isspace',
    'string-find-all', 'string-z-algorithm', 'string-hamming-distance', 'string-levenshtein-distance'
  ]) {
    assert.equal(categoryOf(id), 'string', id);
  }
  for (const id of ['sequence-length', 'list-access', 'list-slice', 'list-max', 'comprehension-zero-matrix']) {
    assert.equal(categoryOf(id), 'list', id);
  }
  for (const id of ['output-value', 'debug-type', 'debug-isinstance-str']) {
    assert.equal(categoryOf(id), 'output', id);
  }
  for (const removed of ['index-slice', 'condition-check', 'string-algorithm', 'list-comprehension', 'debug']) {
    assert.equal(SNIPPET_CATEGORY_ORDER.includes(removed), false, removed);
  }
  assert.deepEqual(
    INPUT_SNIPPETS.filter((snippet) => snippet.category === 'string').slice(-4).map((snippet) => snippet.id),
    ['string-find-all', 'string-z-algorithm', 'string-hamming-distance', 'string-levenshtein-distance']
  );
});

test('similar alternatives expose stable selector groups for the compact UI', () => {
  assert.deepEqual(
    [
      getInputSnippet('number-max-two').selectorGroup,
      getInputSnippet('number-min-two').selectorGroup,
      getInputSnippet('basic-int').selectorGroup,
      getInputSnippet('basic-float').selectorGroup,
      getInputSnippet('split-int-list').selectorGroup,
      getInputSnippet('split-float-list').selectorGroup,
      getInputSnippet('multiline-strings').selectorGroup,
      getInputSnippet('multiline-ints').selectorGroup,
      getInputSnippet('list-max').selectorGroup,
      getInputSnippet('list-min').selectorGroup,
      getInputSnippet('binary-bisect-left').selectorGroup,
      getInputSnippet('binary-bisect-right').selectorGroup,
      getInputSnippet('queue-append').selectorGroup,
      getInputSnippet('queue-appendleft').selectorGroup,
      getInputSnippet('queue-popleft').selectorGroup,
      getInputSnippet('queue-pop').selectorGroup
    ],
    [
      'number-min-max',
      'number-min-max',
      'single-line-type',
      'single-line-type',
      'number-line-type',
      'number-line-type',
      'multiline-list-type',
      'multiline-list-type',
      'list-min-max',
      'list-min-max',
      'bisect-bound',
      'bisect-bound',
      'deque-add-end',
      'deque-add-end',
      'deque-remove-end',
      'deque-remove-end'
    ]
  );
});

test('trivially different snippets share one variant row', () => {
  const groups = {
    'output-single-value': ['output-value', 'output-text'],
    'string-to-number': ['conversion-int', 'conversion-float'],
    'string-char-kind': [
      'string-isdigit', 'string-isalpha', 'string-isalnum',
      'string-islower', 'string-isupper', 'string-isspace'
    ],
    'deque-create': ['queue-deque-empty', 'queue-deque'],
    'isinstance-type': ['debug-isinstance-int', 'debug-isinstance-str']
  };
  for (const [group, ids] of Object.entries(groups)) {
    assert.deepEqual(
      INPUT_SNIPPETS.filter((snippet) => snippet.selectorGroup === group).map((snippet) => snippet.id),
      ids,
      group
    );
    const labels = new Set(ids.map((id) => getInputSnippet(id).selectorGroupLabel));
    assert.equal(labels.size, 1, group);
    ids.forEach((id) => assert.ok(getInputSnippet(id).choiceLabel, id));
  }
});

test('merged snippet ids point to an existing survivor', () => {
  assert.deepEqual(SNIPPET_ID_ALIASES, {
    'string-first': 'list-access',
    'string-last': 'list-access-from-end',
    'string-slice': 'list-slice',
    'dict-contains': 'set-contains'
  });
  for (const [removedId, survivorId] of Object.entries(SNIPPET_ID_ALIASES)) {
    assert.equal(getInputSnippet(removedId), undefined, removedId);
    assert.ok(getInputSnippet(survivorId), survivorId);
  }
  assert.match(getInputSnippet('list-access').description, /s\[0\]/);
  assert.match(getInputSnippet('list-access-from-end').description, /s\[-1\]/);
  assert.match(getInputSnippet('set-contains').description, /辞書d/);
});

test('row titles mention the editable names used in the code', () => {
  // Defaults that are example values rather than names.
  const valueDefaults = new Set(['True', 'None', 'x > 0', 'Yes']);
  const titles = new Map();
  for (const snippet of INPUT_SNIPPETS) {
    titles.set(`${snippet.id} summary`, [snippet.summary, snippet.body]);
    if (snippet.selectorGroup && !titles.has(snippet.selectorGroup)) {
      titles.set(snippet.selectorGroup, [snippet.selectorGroupLabel, snippet.body]);
    }
  }
  for (const [key, [title, body]] of titles) {
    for (const { defaultValue } of getSnippetPlaceholders(body)) {
      if (!valueDefaults.has(defaultValue)) {
        assert.ok(title.includes(defaultValue), `${key}: "${title}" should mention ${defaultValue}`);
      }
    }
  }
  assert.equal(getInputSnippet('math-gcd').summary, '整数aとbの最大公約数');
  assert.equal(getInputSnippet('number-max-two').summary, 'aとbの大きい方');
  assert.equal(getInputSnippet('conversion-int').summary, '文字列sを整数に変換');
  assert.equal(getInputSnippet('string-hamming-distance').summary, '同じ長さの文字列sとtのハミング距離');
});

test('retained original bodies and imports remain unchanged', () => {
  assert.equal(Object.keys(EXISTING_SNIPPET_BODIES_AND_IMPORTS).length, 24);

  for (const [id, [body, imports]] of Object.entries(EXISTING_SNIPPET_BODIES_AND_IMPORTS)) {
    const snippet = getInputSnippet(id);
    assert.ok(snippet, `${id} should remain available`);
    assert.equal(snippet.body, body);
    assert.deepEqual(snippet.imports, imports);
  }
});

test('the 69 catalog additions have descriptions and are all present', () => {
  assert.equal(ADDED_SNIPPET_IDS.length, 69);

  ADDED_SNIPPET_IDS.forEach((id) => {
    const snippet = getInputSnippet(id);
    assert.ok(snippet, `${id} should be included`);
    assert.ok(snippet.description.length > 0);
    assert.ok(snippet.input.length > 0);
    assert.ok(snippet.returns.length > 0);
  });
});

test('new snippets preserve the proposed bodies, imports, and key explanations', () => {
  const interval = getInputSnippet('binary-count-closed-interval');
  assert.equal(interval.category, 'binary-search');
  assert.equal(interval.body, 'bisect_right(${1:a}, ${2:A}) - bisect_left(${1:a}, ${3:B})');
  assert.deepEqual(interval.imports, ['from bisect import bisect_left, bisect_right']);
  assert.match(interval.description, /閉区間/);
  assert.match(interval.input, /上限A、下限B/);
  assert.match(interval.returns, /B <= x <= A/);

  assert.deepEqual(
    [
      getInputSnippet('math-lcm').body,
      getInputSnippet('math-lcm').imports,
      getInputSnippet('prefix-sum-range').body,
      getInputSnippet('brute-combinations').imports,
      getInputSnippet('queue-popleft').imports
    ],
    [
      'lcm(${1:a}, ${2:b})',
      ['from math import lcm'],
      '${1:cum}[${3:r}] - ${1:cum}[${2:l}]',
      ['from itertools import combinations'],
      ['from collections import deque']
    ]
  );
  assert.match(getInputSnippet('number-floor-division').precondition, /負数/);
  assert.match(getInputSnippet('string-isdigit').precondition, /-12/);
  assert.match(getInputSnippet('debug-isinstance-int').precondition, /bool/);
});

test('deque and tuple additions preserve runnable bodies and educational caveats', () => {
  assert.deepEqual(
    [
      getInputSnippet('queue-appendleft').body,
      getInputSnippet('queue-pop').body,
      getInputSnippet('queue-index').body,
      getInputSnippet('tuple-unpack-coordinate').body
    ],
    [
      '${1:q}.appendleft(${2:x})',
      '${1:q}.pop()',
      '${1:q}[${2:i}]',
      '${1:x}, ${2:y} = ${3:point}'
    ]
  );
  assert.match(getInputSnippet('queue-pop').description, /削除/);
  assert.match(getInputSnippet('queue-pop').precondition, /空でない/);
  assert.match(getInputSnippet('queue-index').precondition, /i=0.*i=-1.*O\(1\).*中央付近.*O\(n\)/);
  assert.match(getInputSnippet('tuple-coordinate').precondition, /全ての要素もハッシュ可能/);
});

test('queue summaries name the deque and values used in the code', () => {
  const correctedSummaries = {
    'queue-deque-empty': '空のキューを作る',
    'queue-append': 'キューqの右端にxを追加',
    'queue-popleft': 'キューqの左端から取り出す',
    'queue-appendleft': 'deque qの左端にxを追加',
    'queue-pop': 'deque qの右端から取り出す',
    'queue-index': 'deque qの添字iの要素を見る（i+1番目）'
  };

  for (const [id, summary] of Object.entries(correctedSummaries)) {
    assert.equal(getInputSnippet(id).summary, summary, `${id} summary`);
  }
});

test('creation and group labels do not claim an absent variable is created', () => {
  const emptyQueue = getInputSnippet('queue-deque-empty');
  assert.equal(emptyQueue.summary, '空のキューを作る');
  assert.equal(emptyQueue.body, 'deque()');
  assert.doesNotMatch(emptyQueue.summary, /キュー[A-Za-z_][A-Za-z0-9_]*を作る/);

  for (const snippet of INPUT_SNIPPETS) {
    const userFacingLabels = `${snippet.summary} ${snippet.selectorGroupLabel}`;
    assert.doesNotMatch(userFacingLabels, /空のキューqを作る/, `${snippet.id} queue creation label`);
  }
});

test('atomic operations state the target, result, and relevant cost caveat', () => {
  const find = getInputSnippet('string-find');
  assert.equal(find.body, '${1:s}.find(${2:t})');
  assert.match(find.description, /文字列s.*最初.*位置.*-1/);
  assert.equal(find.complexity.time, 'O(n + m)');

  const first = getInputSnippet('list-pop-first');
  assert.equal(first.body, '${1:A}.pop(0)');
  assert.equal(first.description, 'リストAの先頭の要素を削除し、その要素を返します。');
  assert.equal(first.complexity.time, 'O(n)');
  assert.equal(getInputSnippet('list-append').complexity.qualifier, '償却');
  assert.equal(getInputSnippet('set-contains').complexity.qualifier, '平均');
  assert.match(getInputSnippet('set-contains').complexity.detail, /最悪 O\(n\)/);
  assert.match(getInputSnippet('dict-lookup').precondition, /KeyError/);
  assert.equal(getInputSnippet('brute-combinations').complexity.time, 'O(r × C(n,r))');
  assert.equal(getInputSnippet('brute-permutations').complexity.time, 'O(n × n!)');
});

test('permutations and combinations create lists of tuples', () => {
  const permutations = getInputSnippet('brute-permutations');
  assert.equal(permutations.body, 'list(permutations(${1:A}))');
  assert.equal(permutations.summary, 'リストAの全ての並び順が入ったリストを作る');
  assert.match(permutations.returns, /タプルにしたリスト/);
  assert.match(permutations.complexity.detail, /リストに作る/);

  const combinations = getInputSnippet('brute-combinations');
  assert.equal(combinations.body, 'list(combinations(${1:A}, ${2:r}))');
  assert.match(combinations.returns, /タプルにしたリスト/);
});

test('index and slice examples explain selected positions and returned values', () => {
  const examples = {
    'list-access': '${1:A}[${2:i}]',
    'list-access-from-end': '${1:A}[-${2:i}]',
    'list-slice': '${1:A}[${2:start}:${3:end}]'
  };
  for (const [id, body] of Object.entries(examples)) {
    const snippet = getInputSnippet(id);
    assert.equal(snippet.category, 'list');
    assert.equal(snippet.body, body);
  }
  assert.equal(getInputSnippet('list-access').summary, 'リストAの先頭からi+1番目の要素を見る');
  assert.match(getInputSnippet('list-access').description, /添字は0から始まります.*i\+1番目/);
  assert.match(getInputSnippet('list-access').complexity.detail, /i\+1 番目/);
  assert.match(getInputSnippet('list-access-from-end').description, /iは1から数えます.*1なら末尾/);
  assert.match(getInputSnippet('list-slice').returns, /添字startを含み、添字endを含まない/);
  assert.match(getInputSnippet('list-slice').description, /start\+1番目からend番目/);
  assert.match(getInputSnippet('list-slice').description, /文字列でも同じ書き方/);
  assert.equal(getInputSnippet('list-slice').complexity.time, 'O(k)');
  assert.equal(getInputSnippet('queue-index').complexity.time, 'O(n)');
  assert.match(getInputSnippet('queue-index').complexity.detail, /i=0.*i=-1.*O\(1\).*O\(n\)/);
  assert.match(getInputSnippet('queue-index').description, /i\+1番目.*i=-1なら末尾/);
  assert.equal(getInputSnippet('queue-peek-left'), undefined);
  assert.equal(getInputSnippet('queue-peek-right'), undefined);
});

test('string-set-char builds a new string and explains immutability', () => {
  const snippet = getInputSnippet('string-set-char');
  assert.equal(snippet.category, 'string');
  assert.equal(snippet.body, '${1:s}[:${2:i}] + "${3:a}" + ${1:s}[${2:i} + 1:]');
  assert.deepEqual(getSnippetPlaceholders(snippet.body), [
    { index: 1, defaultValue: 's' },
    { index: 2, defaultValue: 'i' },
    { index: 3, defaultValue: 'a' }
  ]);
  assert.match(snippet.description, /immutable/);
  assert.match(snippet.precondition, /0 <= i < len\(s\)/);
  assert.match(snippet.precondition, /list\(s\).*join/);
  assert.equal(snippet.complexity.time, 'O(n)');
});

test('position-returning snippets distinguish zero-based indices from ordinal positions', () => {
  for (const id of ['binary-bisect-left', 'binary-bisect-right', 'string-find', 'list-index']) {
    assert.match(getInputSnippet(id).returns, /添字i.*i\+1番目/, id);
  }
  assert.match(getInputSnippet('prefix-sum-range').returns, /添字lからrの直前.*l\+1番目からr番目/);
});

test('filtered comprehension edits expression, loop, iterable, and condition independently', () => {
  const snippet = getInputSnippet('comprehension-even-filter');
  assert.equal(snippet.label, '[要素 for x in A if 条件]');
  assert.equal(snippet.body, '[${1:x} for ${2:x} in ${3:A} if ${4:True}]');
  assert.deepEqual(getSnippetPlaceholders(snippet.body), [
    { index: 1, defaultValue: 'x' },
    { index: 2, defaultValue: 'x' },
    { index: 3, defaultValue: 'A' },
    { index: 4, defaultValue: 'True' }
  ]);
  assert.equal(
    applySnippetPlaceholderValues(snippet.body, { 1: 'x * x', 4: 'x > 0' }),
    '[${1:x * x} for ${2:x} in ${3:A} if ${4:x > 0}]'
  );
  assert.match(snippet.complexity.detail, /追加する値を作る処理と条件判定が O\(1\) の場合/);
});

test('conditional-expression comprehension chooses a value for every element', () => {
  const snippet = getInputSnippet('comprehension-conditional-expression');
  assert.equal(snippet.label, '[要素1 if 条件 else 要素2 for x in A]');
  assert.equal(snippet.body, '[${1:x} if ${2:x > 0} else ${3:None} for ${4:x} in ${5:A}]');
  assert.deepEqual(getSnippetPlaceholders(snippet.body), [
    { index: 1, defaultValue: 'x' },
    { index: 2, defaultValue: 'x > 0' },
    { index: 3, defaultValue: 'None' },
    { index: 4, defaultValue: 'x' },
    { index: 5, defaultValue: 'A' }
  ]);
  assert.match(snippet.description, /真なら要素1、偽なら要素2/);
  assert.match(snippet.description, /元の要素は除外しません/);
  assert.match(snippet.returns, /長さはAと同じ/);
  assert.equal(snippet.complexity.time, 'O(n)');
  assert.match(snippet.complexity.detail, /条件判定と追加する値を決める処理が O\(1\) の場合/);
});

test('unknown or non-string snippet IDs are rejected', () => {
  assert.equal(getInputSnippet('missing'), undefined);
  assert.equal(getInputSnippet(undefined), undefined);
  assert.equal(getInputSnippet({}), undefined);
});

test('extracts unique placeholder fields and safely applies custom defaults', () => {
  assert.deepEqual(
    getSnippetPlaceholders('f(${2:x}, ${1:A}, ${2:x})'),
    [
      { index: 2, defaultValue: 'x' },
      { index: 1, defaultValue: 'A' }
    ]
  );
  assert.equal(
    applySnippetPlaceholderValues(
      'f(${1:A}, ${2:B}, ${1:A})',
      { 1: 'values', 2: 'a$b}' }
    ),
    'f(${1:values}, ${2:a\\$b\\}}, ${1:values})'
  );
  assert.equal(
    applySnippetPlaceholderValues('f(${1:A})', { 1: 'line\nnext' }),
    'f(${1:line next})'
  );
});
