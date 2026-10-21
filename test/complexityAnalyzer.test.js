const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const { analyzeAst } = require('../src/complexity/analyzer');
const {
  formatComplexity,
  logOf,
  multiply,
  symbolComplexity
} = require('../src/complexity/complexityExpr');

const AST_DUMP = path.join(__dirname, '..', 'src', 'complexity', 'ast_dump.py');

function findPython() {
  const result = spawnSync(
    'uv',
    ['--no-cache', 'run', '--no-project', 'python', '-c', 'import sys; print(sys.executable)'],
    { encoding: 'utf8' }
  );
  if (!result.error && result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  throw new Error(`Could not resolve Python through uv: ${result.error?.message || result.stderr || result.status}`);
}

const PYTHON = findPython();

function parse(source) {
  const result = spawnSync(PYTHON, [AST_DUMP], {
    input: source,
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  if (result.error || result.status !== 0) {
    throw new Error(`ast_dump.py failed: ${result.error?.message || result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function analyze(lines) {
  return analyzeAst(parse(`${lines.join('\n')}\n`));
}

const n = symbolComplexity('n');
const m = symbolComplexity('m');
const h = symbolComplexity('h');

// Each case: real code, the expected time (and space), confidence, and warning patterns.
const CASES = [
  {
    name: 'double loop',
    code: [
      'n = int(input())',
      'for i in range(n):',
      '    for j in range(n):',
      '        print(i + j)'
    ],
    time: 'O(N²)',
    space: 'O(1)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'triangular loop with range(i)',
    code: [
      'n = int(input())',
      'for i in range(n):',
      '    for j in range(i):',
      '        pass'
    ],
    time: 'O(N²)',
    confidence: 'high'
  },
  {
    name: 'triangular loop with range(i + 1, n)',
    code: [
      'n = int(input())',
      'for i in range(n):',
      '    for j in range(i + 1, n):',
      '        pass'
    ],
    time: 'O(N²)',
    confidence: 'high'
  },
  {
    name: 'range(n * m)',
    code: [
      'n, m = map(int, input().split())',
      'for i in range(n * m):',
      '    pass'
    ],
    time: 'O(N·M)',
    confidence: 'high'
  },
  {
    name: 'sequential loops keep the larger term',
    code: [
      'n = int(input())',
      'for i in range(n):',
      '    pass',
      'for i in range(n):',
      '    for j in range(n):',
      '        pass'
    ],
    time: 'O(N²)',
    confidence: 'high'
  },
  {
    name: 'sequential loops over different sizes keep both terms',
    code: [
      'n, m = map(int, input().split())',
      'for i in range(n):',
      '    pass',
      'for i in range(m):',
      '    for j in range(m):',
      '        pass'
    ],
    time: 'O(M² + N)',
    confidence: 'high'
  },
  {
    name: 'constant loop',
    code: [
      'for i in range(10):',
      '    print(i)'
    ],
    time: 'O(1)',
    confidence: 'high'
  },
  {
    name: 'range(n - 1) and range(2 * n) ignore constants',
    code: [
      'n = int(input())',
      'for i in range(n - 1):',
      '    pass',
      'for i in range(1, 2 * n + 1, 2):',
      '    pass'
    ],
    time: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'loop over a list and over range(len(a))',
    code: [
      'a = list(map(int, input().split()))',
      'for x in a:',
      '    pass',
      'for i in range(len(a)):',
      '    for j in range(len(a)):',
      '        pass'
    ],
    time: 'O(|a|²)',
    space: 'O(|a|)',
    confidence: 'high'
  },
  {
    name: 'a.sort() after reading a',
    code: [
      'n = int(input())',
      'a = list(map(int, input().split()))',
      'a.sort()',
      'print(a[0])'
    ],
    time: 'O(|a| log |a|)',
    space: 'O(|a|)',
    confidence: 'high'
  },
  {
    name: 'sorted(a) after reading a',
    code: [
      'a = list(map(int, input().split()))',
      'b = sorted(a)',
      'print(b[-1])'
    ],
    time: 'O(|a| log |a|)',
    space: 'O(|a|)',
    confidence: 'high'
  },
  {
    name: 'sort inside a loop',
    code: [
      'n = int(input())',
      'a = list(map(int, input().split()))',
      'for i in range(n):',
      '    b = sorted(a)'
    ],
    time: 'O(N·|a| log |a|)',
    renamedTime: 'O(N² log N)',
    confidence: 'high'
  },
  {
    name: 'binary search with hi - lo > 1',
    code: [
      'n = int(input())',
      'a = list(map(int, input().split()))',
      'x = int(input())',
      'lo, hi = -1, n',
      'while hi - lo > 1:',
      '    mid = (lo + hi) // 2',
      '    if a[mid] < x:',
      '        lo = mid',
      '    else:',
      '        hi = mid',
      'print(hi)'
    ],
    time: 'O(log N)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'binary search with lo < hi inside a loop',
    code: [
      'n = int(input())',
      'a = list(map(int, input().split()))',
      'for x in range(n):',
      '    lo, hi = 0, n',
      '    while lo < hi:',
      '        mid = (lo + hi) // 2',
      '        if a[mid] < x:',
      '            lo = mid + 1',
      '        else:',
      '            hi = mid'
    ],
    time: 'O(N log N)',
    confidence: 'high'
  },
  {
    name: 'binary search with an unknown range assumes log N',
    code: [
      'n = int(input())',
      'a = list(map(int, input().split()))',
      'lo, hi = 0, max(a)',
      'while lo < hi:',
      '    mid = (lo + hi) // 2',
      '    if mid * mid < n:',
      '        lo = mid + 1',
      '    else:',
      '        hi = mid'
    ],
    time: 'O(|a| + log N)',
    confidence: 'medium',
    warnings: [/二分探索/]
  },
  {
    name: 'bisect on a list read with a known length',
    code: [
      'from bisect import bisect_left',
      'n = int(input())',
      'a = [int(input()) for _ in range(n)]',
      'x = int(input())',
      'print(bisect_left(a, x))'
    ],
    time: 'O(log N)',
    space: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'bisect inside a loop',
    code: [
      'import bisect',
      'n = int(input())',
      'a = [int(input()) for _ in range(n)]',
      'for i in range(n):',
      '    print(bisect.bisect_right(a, i))'
    ],
    time: 'O(N log N)',
    confidence: 'high'
  },
  {
    name: 'BFS with deque on an adjacency list',
    code: [
      'from collections import deque',
      'n, m = map(int, input().split())',
      'g = [[] for _ in range(n)]',
      'for _ in range(m):',
      '    a, b = map(int, input().split())',
      '    g[a - 1].append(b - 1)',
      '    g[b - 1].append(a - 1)',
      'dist = [-1] * n',
      'dist[0] = 0',
      'q = deque([0])',
      'while q:',
      '    v = q.popleft()',
      '    for u in g[v]:',
      '        if dist[u] == -1:',
      '            dist[u] = dist[v] + 1',
      '            q.append(u)',
      'print(*dist)'
    ],
    time: 'O(N + M)',
    space: 'O(N + M)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'DFS with a stack and a defaultdict graph',
    code: [
      'from collections import defaultdict',
      'n, m = map(int, input().split())',
      'g = defaultdict(list)',
      'for _ in range(m):',
      '    a, b = map(int, input().split())',
      '    g[a].append(b)',
      'seen = [False] * (n + 1)',
      'stack = [1]',
      'while stack:',
      '    v = stack.pop()',
      '    for u in g[v]:',
      '        if not seen[u]:',
      '            seen[u] = True',
      '            stack.append(u)'
    ],
    time: 'O(N + M)',
    confidence: 'high'
  },
  {
    name: 'recursive DFS on an adjacency list',
    code: [
      'import sys',
      'sys.setrecursionlimit(10 ** 6)',
      'n, m = map(int, input().split())',
      'g = [[] for _ in range(n)]',
      'for _ in range(m):',
      '    a, b = map(int, input().split())',
      '    g[a].append(b)',
      'seen = [False] * n',
      'def dfs(v):',
      '    seen[v] = True',
      '    for u in g[v]:',
      '        if not seen[u]:',
      '            dfs(u)',
      'dfs(0)'
    ],
    time: 'O(N + M)',
    confidence: 'low'
  },
  {
    name: 'memoized recursion with @lru_cache(maxsize=None)',
    code: [
      'import sys',
      'from functools import lru_cache',
      'sys.setrecursionlimit(10 ** 6)',
      'n = int(input())',
      '',
      '@lru_cache(maxsize=None)',
      'def fib(k):',
      '    if k < 2:',
      '        return k',
      '    return fib(k - 1) + fib(k - 2)',
      '',
      'print(fib(n))'
    ],
    time: 'O(N)',
    space: 'O(N)',
    confidence: 'low',
    warnings: []
  },
  {
    name: 'memoized recursion with @cache',
    code: [
      'import functools',
      'n = int(input())',
      '',
      '@functools.cache',
      'def ways(k):',
      '    if k <= 1:',
      '        return 1',
      '    return ways(k - 1) + ways(k - 2)',
      '',
      'print(ways(n))'
    ],
    time: 'O(N)',
    confidence: 'low',
    warnings: []
  },
  {
    name: 'memoized recursion over two arguments uses the bounds in comparisons',
    code: [
      'from functools import cache',
      'n, m = map(int, input().split())',
      '',
      '@cache',
      'def paths(i, j):',
      '    if i == n or j == m:',
      '        return 1',
      '    return paths(i + 1, j) + paths(i, j + 1)',
      '',
      'print(paths(0, 0))'
    ],
    time: 'O(N·M)',
    confidence: 'low'
  },
  {
    name: 'double recursion without memoization is exponential',
    code: [
      'n = int(input())',
      '',
      'def fib(k):',
      '    if k < 2:',
      '        return k',
      '    return fib(k - 1) + fib(k - 2)',
      '',
      'print(fib(n))'
    ],
    time: 'O(2^N)',
    confidence: 'low',
    warnings: [/指数時間/]
  },
  {
    name: 'recursion that subtracts 1 is linear',
    code: [
      'n = int(input())',
      'def total(k):',
      '    if k == 0:',
      '        return 0',
      '    return k + total(k - 1)',
      'print(total(n))'
    ],
    time: 'O(N)',
    confidence: 'low'
  },
  {
    name: 'recursion that halves is logarithmic',
    code: [
      'n = int(input())',
      'def power(k):',
      '    if k == 0:',
      '        return 1',
      '    half = power(k // 2)',
      '    return half * half',
      'print(power(n))'
    ],
    time: 'O(log N)',
    confidence: 'low'
  },
  {
    name: 'harmonic loop',
    code: [
      'n = int(input())',
      'cnt = [0] * (n + 1)',
      'for i in range(1, n + 1):',
      '    for j in range(i, n + 1, i):',
      '        cnt[j] += 1'
    ],
    time: 'O(N log N)',
    space: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'harmonic loop written with while and j += i',
    code: [
      'n = int(input())',
      'total = 0',
      'for i in range(1, n + 1):',
      '    j = i',
      '    while j <= n:',
      '        total += 1',
      '        j += i'
    ],
    time: 'O(N log N)',
    confidence: 'high'
  },
  {
    name: 'sieve is shown with the N log N upper bound',
    code: [
      'n = int(input())',
      'is_prime = [True] * (n + 1)',
      'is_prime[0] = is_prime[1] = False',
      'for i in range(2, int(n ** 0.5) + 1):',
      '    if is_prime[i]:',
      '        for j in range(i * i, n + 1, i):',
      '            is_prime[j] = False',
      'print(sum(is_prime))'
    ],
    time: 'O(N log N)',
    space: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'square root loop with i * i <= n',
    code: [
      'n = int(input())',
      'i = 1',
      'while i * i <= n:',
      '    i += 1'
    ],
    time: 'O(√N)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'halving loop with x //= 2',
    code: [
      'n = int(input())',
      'x = n',
      'cnt = 0',
      'while x > 0:',
      '    x //= 2',
      '    cnt += 1'
    ],
    time: 'O(log N)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'doubling loop with i *= 2',
    code: [
      'n = int(input())',
      'i = 1',
      'while i < n:',
      '    i *= 2'
    ],
    time: 'O(log N)',
    confidence: 'high'
  },
  {
    name: 'set membership inside a loop',
    code: [
      'n = int(input())',
      'a = [int(input()) for _ in range(n)]',
      's = set(a)',
      'cnt = 0',
      'for i in range(n):',
      '    if i in s:',
      '        cnt += 1'
    ],
    time: 'O(N)',
    space: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'dict counting and membership inside loops',
    code: [
      'n = int(input())',
      'a = [int(input()) for _ in range(n)]',
      'd = {}',
      'for x in a:',
      '    d[x] = d.get(x, 0) + 1',
      'for i in range(n):',
      '    if i in d:',
      '        print(d[i])'
    ],
    time: 'O(N)',
    space: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'list membership inside a loop',
    code: [
      'n = int(input())',
      'a = [int(input()) for _ in range(n)]',
      'for i in range(n):',
      '    if i in a:',
      '        print(i)'
    ],
    time: 'O(N²)',
    confidence: 'high'
  },
  {
    name: 'heapq push and pop inside loops',
    code: [
      'import heapq',
      'n = int(input())',
      'h = []',
      'for i in range(n):',
      '    heapq.heappush(h, i)',
      'for i in range(n):',
      '    heapq.heappop(h)'
    ],
    time: 'O(N log N)',
    space: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'heap emptied with while h',
    code: [
      'from heapq import heappush, heappop',
      'n = int(input())',
      'h = []',
      'for i in range(n):',
      '    heappush(h, -i)',
      'while h:',
      '    print(heappop(h))'
    ],
    time: 'O(N log N)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'queue simulation that grows inside its own loop',
    code: [
      'from collections import deque',
      'n = int(input())',
      'q = deque()',
      'for i in range(n):',
      '    q.append(i)',
      'while q:',
      '    x = q.popleft()',
      '    if x % 2 == 0 and x > 0:',
      '        q.append(x // 2)'
    ],
    time: 'O(N)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'list.pop(0) inside a queue loop is linear each time',
    code: [
      'n = int(input())',
      'q = list(range(n))',
      'while q:',
      '    x = q.pop(0)'
    ],
    time: 'O(N²)',
    confidence: 'high'
  },
  {
    name: 'heapify, slicing and join are linear while len is constant',
    code: [
      'import heapq',
      'a = list(map(int, input().split()))',
      'heapq.heapify(a)',
      'b = a[1:]',
      'for i in range(len(b)):',
      '    k = len(a)',
      'print(" ".join(map(str, b)))'
    ],
    time: 'O(|a|)',
    space: 'O(|a|)',
    confidence: 'high'
  },
  {
    name: 'if / else keeps the larger branch',
    code: [
      'n = int(input())',
      'if n % 2 == 0:',
      '    for i in range(n):',
      '        for j in range(n):',
      '            pass',
      'else:',
      '    for i in range(n):',
      '        pass'
    ],
    time: 'O(N²)',
    confidence: 'high'
  },
  {
    name: 'a list that keeps growing while it is looped over is marked low',
    code: [
      'a = list(map(int, input().split()))',
      'for x in a:',
      '    for y in a:',
      '        a.append(x + y)'
    ],
    confidence: 'low',
    warnings: [/目安/]
  },
  {
    name: 'a read inside bisect keeps the bisect cost',
    code: [
      'from bisect import bisect_left',
      'n, q = map(int, input().split())',
      'a = list(map(int, input().split()))',
      'for _ in range(q):',
      '    print(bisect_left(a, int(input())))'
    ],
    time: 'O(Q log |a|)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'a read inside list.count keeps the count cost',
    code: [
      'q = int(input())',
      'a = list(map(int, input().split()))',
      'for _ in range(q):',
      '    print(a.count(int(input())))'
    ],
    time: 'O(Q·|a|)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'summing a line that is read is not counted',
    code: [
      'a = list(map(int, input().split()))[1:]',
      'print(sum(map(int, input().split())))',
      'for x in a:',
      '    pass'
    ],
    time: 'O(|a|)',
    confidence: 'high',
    warnings: []
  },
  {
    name: 'looping over a line that is read assumes N items',
    code: [
      'for x in map(int, input().split()):',
      '    print(x)'
    ],
    time: 'O(N)',
    confidence: 'medium',
    warnings: [/N 回とみなしました/]
  },
  {
    name: 'string += inside a loop warns',
    code: [
      'n = int(input())',
      's = ""',
      'for i in range(n):',
      '    s += "a"',
      'print(s)'
    ],
    time: 'O(N)',
    confidence: 'high',
    warnings: [/文字列に \+=/]
  },
  {
    name: 'two pointers when the counter is only moved by the while',
    code: [
      'n = int(input())',
      'a = [int(input()) for _ in range(n)]',
      'r = 0',
      'for l in range(n):',
      '    while r < n and a[r] - a[l] < 10:',
      '        r += 1',
      '    print(r - l)'
    ],
    time: 'O(N)',
    confidence: 'high'
  },
  {
    name: 'unknown while loop is assumed to run N times',
    code: [
      'n = int(input())',
      'x = n',
      'steps = 0',
      'while x != 1:',
      '    if x % 2 == 0:',
      '        x //= 2',
      '    else:',
      '        x = 3 * x + 1',
      '    steps += 1'
    ],
    time: 'O(N)',
    confidence: 'low',
    warnings: [/while ループ/]
  },
  {
    name: 'while True with break is assumed to run N times',
    code: [
      'n = int(input())',
      'while True:',
      '    n -= 1',
      '    if n < 0:',
      '        break'
    ],
    time: 'O(N)',
    confidence: 'low',
    warnings: [/while ループ/]
  },
  {
    name: 'a loop bounded by an element value is assumed to run N times',
    code: [
      'n = int(input())',
      'a = list(map(int, input().split()))',
      'for i in range(a[0]):',
      '    pass'
    ],
    time: 'O(N)',
    confidence: 'medium',
    warnings: [/N 回とみなしました/]
  },
  {
    name: 'a 2D table built with a comprehension',
    code: [
      'n, m = map(int, input().split())',
      'dp = [[0] * m for _ in range(n)]',
      'for i in range(n):',
      '    for j in range(m):',
      '        dp[i][j] = i + j'
    ],
    time: 'O(N·M)',
    space: 'O(N·M)',
    confidence: 'high'
  },
  {
    name: 'list(range(n)) and an append loop count toward space',
    code: [
      'n, m = map(int, input().split())',
      'a = list(range(n))',
      'b = []',
      'for i in range(m):',
      '    b.append(i)',
      'for x in b:',
      '    pass'
    ],
    time: 'O(N + M)',
    space: 'O(N + M)',
    confidence: 'high'
  },
  {
    name: 'calls to a user function inside a loop multiply',
    code: [
      'n = int(input())',
      'def work(k):',
      '    s = 0',
      '    for i in range(k):',
      '        s += i',
      '    return s',
      'for i in range(n):',
      '    work(n)'
    ],
    time: 'O(N²)',
    confidence: 'high'
  },
  {
    name: 'main function pattern with nested DFS',
    code: [
      'def main():',
      '    n = int(input())',
      '    g = [[] for _ in range(n)]',
      '    for _ in range(n - 1):',
      '        a, b = map(int, input().split())',
      '        g[a].append(b)',
      '        g[b].append(a)',
      '    order = []',
      '    def dfs(v, parent):',
      '        order.append(v)',
      '        for u in g[v]:',
      '            if u != parent:',
      '                dfs(u, v)',
      '    dfs(0, -1)',
      '    print(len(order))',
      '',
      'if __name__ == "__main__":',
      '    main()'
    ],
    time: 'O(N)',
    confidence: 'low'
  }
];

for (const testCase of CASES) {
  test(`correct answer: ${testCase.name}`, () => {
    const result = analyze(testCase.code);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (testCase.time) {
      assert.equal(formatComplexity(result.time), testCase.time);
    }
    if (testCase.space) {
      assert.equal(formatComplexity(result.space), testCase.space);
    }
    if (testCase.renamedTime) {
      assert.equal(formatComplexity(result.time, { rename: { n: 'N', '|a|': 'N' } }), testCase.renamedTime);
    }
    if (testCase.confidence) {
      assert.equal(result.confidence, testCase.confidence);
    }
    if (testCase.warnings) {
      assert.equal(result.warnings.length, testCase.warnings.length, JSON.stringify(result.warnings));
      testCase.warnings.forEach((pattern, index) => assert.match(result.warnings[index].message, pattern));
    }
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  });
}

test('a syntax error returns ok: false with the line and a Japanese message', () => {
  const result = analyze(['n = int(input())', 'for i in range(n)', '    pass']);
  assert.equal(result.ok, false);
  assert.equal(result.line, 2);
  assert.match(result.message, /2 行目に文法の誤り/);
});

test('broken analyzer input returns ok: false instead of throwing', () => {
  assert.equal(analyzeAst(null).ok, false);
  assert.equal(analyzeAst({ ok: true, tree: { _type: 'Expr' } }).ok, false);
  const noLine = analyzeAst({ ok: false, line: null, col: null, message: 'source code cannot contain null bytes' });
  assert.equal(noLine.ok, false);
  assert.equal(noLine.line, null);
  assert.match(noLine.message, /文法の誤り/);
});

test('inputs lists every read pattern in reading order', () => {
  const result = analyze([
    'n = int(input())',
    'h, w = map(int, input().split())',
    'a = list(map(int, input().split()))',
    's = input()',
    't = input().strip()',
    'g = [input() for _ in range(h)]',
    'b = [int(input()) for _ in range(n)]',
    'print(n, h, w, a, s, t, g, b)'
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.inputs, [
    { line: 1, targets: ['n'], kind: 'ints', count: null },
    { line: 2, targets: ['h', 'w'], kind: 'ints', count: null },
    { line: 3, targets: ['a'], kind: 'intList', count: null },
    { line: 4, targets: ['s'], kind: 'string', count: null },
    { line: 5, targets: ['t'], kind: 'string', count: null },
    { line: 6, targets: ['g'], kind: 'lines', count: h },
    { line: 7, targets: ['b'], kind: 'intList', count: n }
  ]);
});

test('inputs treats sys.stdin.readline and its aliases as reads', () => {
  const result = analyze([
    'import sys',
    'input = sys.stdin.readline',
    'readline = sys.stdin.buffer.readline',
    'n = int(input())',
    'm = int(sys.stdin.readline())',
    'a = list(map(int, readline().split()))',
    's = sys.stdin.readline().rstrip()',
    'print(n, m, a, s)'
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.inputs, [
    { line: 4, targets: ['n'], kind: 'ints', count: null },
    { line: 5, targets: ['m'], kind: 'ints', count: null },
    { line: 6, targets: ['a'], kind: 'intList', count: null },
    { line: 7, targets: ['s'], kind: 'string', count: null }
  ]);
});

test('inputs follows helper functions, call order and reads inside loops', () => {
  const result = analyze([
    'import sys',
    'def input():',
    '    return sys.stdin.readline().rstrip()',
    'LI = lambda: list(map(int, input().split()))',
    'def solve():',
    '    a = LI()',
    '    return sum(a)',
    'n, m = map(int, input().split())',
    'for _ in range(m):',
    '    u, v = map(int, input().split())',
    'print(solve())'
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.inputs, [
    { line: 8, targets: ['n', 'm'], kind: 'ints', count: null },
    { line: 10, targets: ['u', 'v'], kind: 'ints', count: m },
    { line: 6, targets: ['a'], kind: 'intList', count: null }
  ]);
  assert.equal(formatComplexity(result.time), 'O(M + |a|)');
});

test('lines shows every loop and function with its label', () => {
  const result = analyze([
    'n = int(input())',
    'a = list(map(int, input().split()))',
    '',
    'def solve(k):',
    '    total = 0',
    '    for i in range(k):',
    '        for j in range(k):',
    '            total += i * j',
    '    return total',
    '',
    'def unused(x):',
    '    while x > 0:',
    '        x //= 2',
    '',
    'for v in a:',
    '    pass',
    'for _ in range(3):',
    '    pass',
    'print(solve(n))'
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.lines, [
    { line: 4, kind: 'function', label: 'O(N²)', complexity: multiply(n, n), note: '' },
    { line: 6, kind: 'loop', label: '× N', complexity: n, note: '' },
    { line: 7, kind: 'loop', label: '× N', complexity: n, note: '' },
    { line: 11, kind: 'function', label: 'O(log X)', complexity: logOf('x'), note: '' },
    { line: 12, kind: 'loop', label: '× log X', complexity: logOf('x'), note: '毎回半分（または2倍）' },
    { line: 15, kind: 'loop', label: '× |a|', complexity: symbolComplexity('|a|'), note: '' },
    { line: 17, kind: 'loop', label: '× 3', complexity: { terms: [] }, note: '' },
    { line: 19, kind: 'call', label: 'O(N²)', complexity: multiply(n, n), note: 'solve()' }
  ]);
  assert.equal(formatComplexity(result.time), 'O(N² + |a|)');
  assert.deepEqual(result.symbols, ['n', '|a|']);
});

test('a read mixed into another expression is listed without a target', () => {
  const result = analyze([
    'n = int(input())',
    'ans = 0',
    'for _ in range(n):',
    '    ans = max(ans, int(input()))',
    'a = list(map(int, input().split()))[1:]',
    'print(ans, a)'
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.inputs, [
    { line: 1, targets: ['n'], kind: 'ints', count: null },
    { line: 4, targets: [], kind: 'ints', count: n },
    { line: 5, targets: ['a'], kind: 'intList', count: null }
  ]);
  assert.equal(formatComplexity(result.time), 'O(N)');
  assert.deepEqual(result.symbols, ['n', '|a|']);
});

test('lines includes comprehension loops that are not on a for line', () => {
  const result = analyze([
    'n, m = map(int, input().split())',
    'dp = [[0] * m for _ in range(n)]',
    'total = sum(x for x in range(m))',
    'for row in [r for r in dp]:',
    '    pass'
  ]);
  assert.equal(result.ok, true);
  const loops = result.lines.filter((entry) => entry.kind === 'loop');
  assert.deepEqual(loops, [
    { line: 2, kind: 'loop', label: '× N', complexity: n, note: '内包表記' },
    { line: 3, kind: 'loop', label: '× M', complexity: m, note: '内包表記' },
    { line: 4, kind: 'loop', label: '× N', complexity: n, note: '' }
  ]);
});

test('the warning for a list that never stops growing points at its loop', () => {
  const result = analyze([
    'a = list(map(int, input().split()))',
    'b = []',
    'for x in a:',
    '    for y in a:',
    '        a.append(x + y)'
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.warnings.map((warning) => warning.line), [3]);
});

test('lines marks recursion and amortized loops', () => {
  const result = analyze([
    'from functools import lru_cache',
    'n = int(input())',
    '@lru_cache(maxsize=None)',
    'def f(k):',
    '    if k == 0:',
    '        return 0',
    '    return f(k - 1) + 1',
    'print(f(n))'
  ]);
  assert.equal(result.ok, true);
  const recursion = result.lines.find((entry) => entry.kind === 'recursion');
  assert.deepEqual(recursion, {
    line: 7,
    kind: 'recursion',
    label: '× N',
    complexity: n,
    note: 'メモ化再帰（状態の数だけ呼ばれる）'
  });
  assert.equal(result.lines.find((entry) => entry.kind === 'function').label, 'O(N)');
});
