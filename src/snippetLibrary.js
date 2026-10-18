'use strict';

const SNIPPET_CATEGORY_ORDER = Object.freeze([
  'input',
  'number-conversion',
  'string',
  'list',
  'tuple',
  'aggregation',
  'queue',
  'brute-force',
  'prefix-sum',
  'binary-search',
  'output'
]);

const CATEGORY_LABELS = Object.freeze({
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
  output: '出力・デバッグ'
});

// Row order inside each category: built-ins first, then imports, then helpers (自作).
const SNIPPET_DISPLAY_ORDER = Object.freeze([
  'basic-string', 'basic-int', 'basic-float', 'basic-chars',
  'split-strings', 'split-map-int', 'split-int-list', 'split-float-list',
  'multiline-strings', 'multiline-ints', 'multiline-int-matrix', 'multiline-char-grid',
  'convenient-sorted-ints', 'convenient-int-set', 'convenient-indexed-ints',

  'conversion-int', 'conversion-float', 'conversion-str', 'conversion-digit-list',
  'number-floor-division', 'number-remainder', 'number-abs',
  'number-max-two', 'number-min-two',
  'math-gcd', 'math-lcm', 'math-isqrt',

  'string-contains', 'string-find', 'string-count', 'string-replace', 'string-set-char',
  'string-reverse', 'string-lower', 'string-upper',
  'string-isdigit', 'string-isalpha', 'string-isalnum',
  'string-islower', 'string-isupper', 'string-isspace',
  'string-find-all', 'string-z-algorithm',
  'string-hamming-distance', 'string-levenshtein-distance',

  'sequence-length', 'list-access', 'list-access-from-end', 'list-slice',
  'list-append', 'list-pop', 'list-pop-first',
  'list-contains', 'list-count', 'list-index',
  'list-sum', 'list-max', 'list-min',
  'list-sort-ascending', 'list-sort-descending',
  'comprehension-range', 'comprehension-squares', 'comprehension-zero-matrix',
  'comprehension-even-filter', 'comprehension-conditional-expression',

  'tuple-coordinate', 'tuple-single-item', 'tuple-unpack-coordinate',

  'set-add', 'set-contains', 'dict-lookup',
  'aggregation-counter', 'aggregation-counter-value',
  'aggregation-defaultdict-int', 'aggregation-increment', 'aggregation-defaultdict-list',

  'queue-deque-empty', 'queue-deque',
  'queue-append', 'queue-popleft', 'queue-appendleft', 'queue-pop', 'queue-index',

  'brute-combinations', 'brute-permutations',

  'aggregation-accumulate', 'prefix-sum-range',

  'binary-bisect-left', 'binary-bisect-right', 'binary-count-closed-interval',

  'output-value', 'output-text', 'output-two-values', 'output-unpack-list',
  'debug-type', 'debug-isinstance-int', 'debug-isinstance-str'
]);

const SNIPPET_USAGE_ORDER = new Map(
  SNIPPET_DISPLAY_ORDER.map((snippetId, index) => [snippetId, index])
);

// n は対象の要素数・文字数、m は検索する文字列の長さ。入力・出力では総文字数を使う。
// Python の整数は任意精度なので、整数演算には固定桁数の仮定を明示する。
const COMPLEXITY_BY_ID = Object.freeze({
  'basic-string': ['O(n)', '最悪', 'n=入力行の文字数'],
  'basic-int': ['入力長に依存', '最悪', '読み取りと整数変換。n=入力行の文字数'],
  'basic-float': ['入力長に依存', '最悪', '読み取りと小数変換。n=入力行の文字数'],
  'basic-chars': ['O(n)', '最悪', 'n=入力行の文字数'],
  'split-strings': ['O(n)', '最悪', 'n=入力行の文字数'],
  'split-map-int': ['O(n)', '最悪', 'n=入力行の文字数。整数変換は取り出すときに行う'],
  'split-int-list': ['入力長に依存', '最悪', 'n=入力行の文字数。各整数を変換する'],
  'split-float-list': ['入力長に依存', '最悪', 'n=入力行の文字数。各小数を変換する'],
  'multiline-strings': ['O(n + k)', '最悪', 'n=行数、k=全行の文字数'],
  'multiline-ints': ['入力長に依存', '最悪', 'n=行数。各行の整数変換を含む'],
  'multiline-int-matrix': ['入力長に依存', '最悪', '全行の分割と整数変換を含む'],
  'multiline-char-grid': ['O(n + k)', '最悪', 'n=行数、k=全行の文字数'],
  'convenient-sorted-ints': ['O(n log n)', '最悪', 'n=整数の個数。整数変換の費用は別'],
  'convenient-int-set': ['O(n)', '平均', 'n=整数の個数。衝突が集中すると最悪 O(n²)'],
  'convenient-indexed-ints': ['O(n)', '最悪', 'n=整数の個数。整数変換の費用は別'],
  'output-value': ['入力長に依存', '最悪', '出力する文字数と値の文字列変換に依存'],
  'output-text': ['O(n)', '最悪', 'n=出力する文字数'],
  'output-two-values': ['入力長に依存', '最悪', '値の文字列変換と出力文字数に依存'],
  'output-unpack-list': ['入力長に依存', '最悪', 'n=リストの要素数。各要素の変換と出力を含む'],
  'math-gcd': ['O(log min(a, b))', '最悪', '固定桁数の整数を仮定。大きな整数は桁数にも依存'],
  'math-isqrt': ['入力長に依存', '最悪', '整数 n の桁数に依存'],
  'number-abs': ['入力長に依存', '最悪', '整数 x の桁数に依存。固定桁数なら O(1)'],
  'number-max-two': ['O(1)', '最悪', '数値2個を固定時間で比較できる場合'],
  'number-min-two': ['O(1)', '最悪', '数値2個を固定時間で比較できる場合'],
  'number-floor-division': ['入力長に依存', '最悪', '整数 a、b の桁数に依存'],
  'number-remainder': ['入力長に依存', '最悪', '整数 a、b の桁数に依存'],
  'math-lcm': ['入力長に依存', '最悪', '整数 a、b の桁数に依存'],
  'conversion-int': ['入力長に依存', '最悪', 'n=文字列 s の長さ。整数の桁数にも依存'],
  'conversion-float': ['入力長に依存', '最悪', 'n=文字列 s の長さ'],
  'conversion-str': ['入力長に依存', '最悪', '生成する文字列の長さと値の型に依存'],
  'conversion-digit-list': ['O(n)', '最悪', 'n=数字文字列 s の長さ'],
  'list-max': ['O(n)', '最悪', 'n=リスト A の要素数。比較の費用は別'],
  'list-min': ['O(n)', '最悪', 'n=リスト A の要素数。比較の費用は別'],
  'list-sum': ['O(n)', '最悪', 'n=リスト A の要素数。加算の費用は別'],
  'list-contains': ['O(n)', '最悪', 'n=リスト A の要素数。比較の費用は別'],
  'list-count': ['O(n)', '最悪', 'n=リスト A の要素数。比較の費用は別'],
  'list-sort-ascending': ['O(n log n)', '最悪', 'n=リスト A の要素数。比較の費用は別'],
  'list-sort-descending': ['O(n log n)', '最悪', 'n=リスト A の要素数。比較の費用は別'],
  'list-append': ['O(1)', '償却', 'リスト A の末尾に要素を追加'],
  'list-pop': ['O(1)', '償却', 'リスト A の末尾の要素を削除して返す'],
  'list-pop-first': ['O(n)', '最悪', 'n=リスト A の要素数。先頭の要素を削除して返す'],
  'list-index': ['O(n)', '最悪', 'n=リスト A の要素数。比較の費用は別'],
  'comprehension-range': ['O(n)', '最悪', 'n=生成する要素数'],
  'comprehension-squares': ['O(n)', '最悪', 'n=生成する要素数。整数乗算の費用は別'],
  'comprehension-even-filter': ['O(n)', '最悪', 'n=反復対象の要素数。追加する値を作る処理と条件判定が O(1) の場合'],
  'comprehension-conditional-expression': ['O(n)', '最悪', 'n=反復対象の要素数。条件判定と追加する値を決める処理が O(1) の場合'],
  'comprehension-zero-matrix': ['O(h × w)', '最悪', 'h=行数、w=列数'],
  'sequence-length': ['O(1)', '最悪', '長さを保持する文字列・リストの場合'],
  'list-access': ['O(1)', '最悪', 'リスト A の先頭から i+1 番目の要素を取得'],
  'list-access-from-end': ['O(1)', '最悪', 'i は1以上。リスト A の末尾から i 番目の要素を取得'],
  'list-slice': ['O(k)', '最悪', 'k=作成するリストの要素数'],
  'string-count': ['O(n + m)', '最悪', 'CPython。n=文字列 s、m=探す文字列の長さ'],
  'string-find': ['O(n + m)', '最悪', 'CPython。n=文字列 s、m=探す文字列の長さ'],
  'string-contains': ['O(n + m)', '最悪', 'CPython。n=文字列 s、m=探す文字列の長さ'],
  'string-reverse': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-lower': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-upper': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-replace': ['入力長に依存', '最悪', '検索対象・置換前後の文字列の長さと置換回数に依存'],
  'string-set-char': ['O(n)', '最悪', 'n=文字列 s の長さ。新しい文字列を作る'],
  'string-isdigit': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-isalpha': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-isalnum': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-islower': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-isupper': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-isspace': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'string-hamming-distance': ['O(n)', '最悪', 'n=文字列 s、t の長さ'],
  'string-levenshtein-distance': ['O(n × m)', '最悪', 'n=文字列 s、m=文字列 t の長さ'],
  'string-find-all': ['O(n × m)', '最悪', 'CPython。n=文字列 s、m=探す文字列 t の長さ。重なる一致が多いと最悪になる'],
  'string-z-algorithm': ['O(n)', '最悪', 'n=文字列 s の長さ'],
  'aggregation-counter': ['O(n)', '平均', 'n=入力 a の要素数。ハッシュ衝突が集中すると最悪 O(n²)'],
  'aggregation-defaultdict-int': ['O(1)', '最悪', '空の辞書を作成。キーの検索は含まない'],
  'aggregation-defaultdict-list': ['O(1)', '最悪', '空の辞書を作成。キーの検索は含まない'],
  'aggregation-counter-value': ['O(1)', '平均', 'キー検索。ハッシュ衝突が集中すると最悪 O(n)'],
  'aggregation-increment': ['O(1)', '平均', 'キー検索と更新。ハッシュ衝突が集中すると最悪 O(n)'],
  'set-add': ['O(1)', '平均', '集合 S に要素を追加。衝突が集中すると最悪 O(n)'],
  'set-contains': ['O(1)', '平均', '集合 S の要素を検索。衝突が集中すると最悪 O(n)'],
  'dict-lookup': ['O(1)', '平均', '辞書 d のキーを検索。衝突が集中すると最悪 O(n)'],
  'aggregation-accumulate': ['O(n)', '最悪', 'n=入力 a の要素数。加算の費用は別'],
  'prefix-sum-range': ['O(1)', '最悪', '添字2か所の参照と減算。大きな整数の費用は別'],
  'brute-combinations': ['O(r × C(n,r))', '最悪', 'n=リスト A の要素数。全ての組み合わせをリストに作る'],
  'brute-permutations': ['O(n × n!)', '最悪', 'n=リスト A の要素数。全ての並び順をリストに作る'],
  'binary-bisect-left': ['O(log n)', '最悪', 'n=昇順リスト a の要素数。比較の費用は別'],
  'binary-bisect-right': ['O(log n)', '最悪', 'n=昇順リスト a の要素数。比較の費用は別'],
  'binary-count-closed-interval': ['O(log n)', '最悪', 'n=昇順リスト a の要素数。二分探索を2回行う'],
  'queue-deque-empty': ['O(1)', '最悪', '空の deque を作成'],
  'queue-deque': ['O(1)', '最悪', '要素1個の deque を作成'],
  'queue-append': ['O(1)', '償却', 'deque の右端に要素を追加'],
  'queue-popleft': ['O(1)', '償却', 'deque の左端から要素を削除して返す'],
  'queue-appendleft': ['O(1)', '償却', 'deque の左端に要素を追加'],
  'queue-pop': ['O(1)', '償却', 'deque の右端から要素を削除して返す'],
  'queue-index': ['O(n)', '最悪', 'n=deque の要素数。i=0やi=-1の両端は O(1)、中央付近は O(n)'],
  'tuple-coordinate': ['O(1)', '最悪', '2要素のタプルを作成'],
  'tuple-single-item': ['O(1)', '最悪', '1要素のタプルを作成'],
  'tuple-unpack-coordinate': ['O(1)', '最悪', '2要素のタプルを分解'],
  'debug-type': ['O(1)', '最悪', '値 x の型を取得'],
  'debug-isinstance-int': ['O(1)', '最悪', '通常の組み込み型に対する判定'],
  'debug-isinstance-str': ['O(1)', '最悪', '通常の組み込み型に対する判定']
});

const SNIPPET_DEFINITIONS = [
  createSnippet({
    id: 'basic-string',
    category: 'input',
    selectorGroup: 'single-line-type',
    selectorGroupLabel: '1行を読む',
    choiceLabel: '文字列',
    summary: '1行を文字列で読む',
    description: '1行を文字列として読み取ります。',
    input: '標準入力から1行を受け取ります。',
    returns: '読み取った文字列を返します。',
    label: 'input()'
  }),
  createSnippet({
    id: 'basic-int',
    category: 'input',
    selectorGroup: 'single-line-type',
    selectorGroupLabel: '1行を読む',
    choiceLabel: '整数',
    summary: '1行を整数で読む',
    description: '1行を整数として読み取ります。',
    input: '整数が書かれた1行を受け取ります。',
    returns: 'int型の整数を返します。',
    precondition: '入力行が整数として読める必要があります。',
    label: 'int(input())'
  }),
  createSnippet({
    id: 'basic-float',
    category: 'input',
    selectorGroup: 'single-line-type',
    selectorGroupLabel: '1行を読む',
    choiceLabel: '小数',
    summary: '1行を小数で読む',
    description: '1行を小数として読み取ります。',
    input: '小数が書かれた1行を受け取ります。',
    returns: 'float型の小数を返します。',
    precondition: '入力行が小数として読める必要があります。',
    label: 'float(input())'
  }),
  createSnippet({
    id: 'basic-chars',
    category: 'input',
    summary: '1行の文字列を1文字ずつのリストにする',
    description: '文字列を1文字ずつのリストに分けます。',
    input: '標準入力から1行の文字列を受け取ります。',
    returns: '各文字を要素に持つlist[str]を返します。',
    label: 'list(input())'
  }),

  createSnippet({
    id: 'split-strings',
    category: 'input',
    summary: '1行の文字列を空白で分ける',
    description: '空白で区切られた文字列を受け取ります。',
    input: '空白で区切られた文字列が並ぶ1行を受け取ります。',
    returns: '文字列のリストを返します。',
    label: 'input().split()'
  }),
  createSnippet({
    id: 'split-map-int',
    category: 'input',
    selectorGroup: 'number-line-type',
    selectorGroupLabel: '1行の数列を読む',
    choiceLabel: '整数（map）',
    summary: '1行の整数列をmapにする',
    description: '空白で区切られた複数の整数を受け取ります。',
    input: '空白で区切られた整数が並ぶ1行を受け取ります。',
    returns: '整数を順番に取り出せるmapオブジェクトを返します。',
    precondition: '入力された各要素が整数として読める必要があります。',
    label: 'map(int, input().split())'
  }),
  createSnippet({
    id: 'split-int-list',
    category: 'input',
    selectorGroup: 'number-line-type',
    selectorGroupLabel: '1行の数列を読む',
    choiceLabel: '整数（list）',
    summary: '1行の整数列をリストにする',
    description: '空白区切りの整数をリストにします。',
    input: '空白で区切られた整数が並ぶ1行を受け取ります。',
    returns: '整数のリストを返します。',
    precondition: '入力された各要素が整数として読める必要があります。',
    label: 'list(map(int, input().split()))'
  }),
  createSnippet({
    id: 'split-float-list',
    category: 'input',
    selectorGroup: 'number-line-type',
    selectorGroupLabel: '1行の数列を読む',
    choiceLabel: '小数（list）',
    summary: '1行の小数列をリストにする',
    description: '空白区切りの小数をリストにします。',
    input: '空白で区切られた小数が並ぶ1行を受け取ります。',
    returns: '小数のリストを返します。',
    precondition: '入力された各要素が小数として読める必要があります。',
    label: 'list(map(float, input().split()))'
  }),

  createSnippet({
    id: 'multiline-strings',
    category: 'input',
    selectorGroup: 'multiline-list-type',
    selectorGroupLabel: 'n行をリストにする',
    choiceLabel: '文字列',
    summary: 'n行の文字列をリストにする',
    description: 'n行の文字列をリストにします。',
    input: 'n行の文字列を標準入力から受け取ります。',
    returns: '入力したn行の文字列リストを返します。',
    label: '[input() for _ in range(n)]',
    body: '[input() for _ in range(${1:n})]'
  }),
  createSnippet({
    id: 'multiline-ints',
    category: 'input',
    selectorGroup: 'multiline-list-type',
    selectorGroupLabel: 'n行をリストにする',
    choiceLabel: '整数',
    summary: 'n行の整数をリストにする',
    description: 'n行の整数をリストにします。',
    input: '整数が1行ずつ書かれたn行を受け取ります。',
    returns: '入力したn個の整数リストを返します。',
    precondition: '各入力行が整数として読める必要があります。',
    label: '[int(input()) for _ in range(n)]',
    body: '[int(input()) for _ in range(${1:n})]'
  }),
  createSnippet({
    id: 'multiline-int-matrix',
    category: 'input',
    selectorGroup: 'multiline-grid-type',
    selectorGroupLabel: 'n行を二次元リストにする',
    choiceLabel: '整数列',
    summary: 'n行の整数列を二次元リストにする',
    description: 'n行の整数列を二次元リストにします。',
    input: '整数列が空白区切りで書かれたn行を受け取ります。',
    returns: '各行を整数リストにした二次元リストを返します。',
    precondition: '各入力要素が整数として読める必要があります。',
    label: '[list(map(int, input().split())) for _ in range(n)]',
    body: '[list(map(int, input().split())) for _ in range(${1:n})]'
  }),
  createSnippet({
    id: 'multiline-char-grid',
    category: 'input',
    selectorGroup: 'multiline-grid-type',
    selectorGroupLabel: 'n行を二次元リストにする',
    choiceLabel: '文字グリッド',
    summary: 'n行の文字列を文字グリッドにする',
    description: '文字グリッドを二次元リストにします。',
    input: '文字列が1行ずつ書かれたn行を受け取ります。',
    returns: '各行を文字リストにした二次元リストを返します。',
    label: '[list(input()) for _ in range(n)]',
    body: '[list(input()) for _ in range(${1:n})]'
  }),

  createSnippet({
    id: 'convenient-sorted-ints',
    category: 'input',
    summary: '整数列を昇順に並べる',
    description: '整数列を昇順に並べます。',
    input: '空白で区切られた整数が並ぶ1行を受け取ります。',
    returns: '昇順に並んだ整数リストを返します。',
    precondition: '入力された各要素が整数として読める必要があります。',
    label: 'sorted(map(int, input().split()))'
  }),
  createSnippet({
    id: 'convenient-int-set',
    category: 'input',
    summary: '整数列を重複のない集合にする',
    description: '整数列を重複のない集合にします。',
    input: '空白で区切られた整数が並ぶ1行を受け取ります。',
    returns: '重複を取り除いたset[int]を返します。',
    precondition: '入力された各要素が整数として読める必要があります。',
    label: 'set(map(int, input().split()))'
  }),
  createSnippet({
    id: 'convenient-indexed-ints',
    category: 'input',
    summary: '整数列の先頭に0を加える',
    description: '1-indexedで使えるよう先頭に0を加えます。',
    input: '空白で区切られた整数が並ぶ1行を受け取ります。',
    returns: '先頭が0になった整数リストを返します。',
    precondition: '入力された各要素が整数として読める必要があります。',
    label: '[0] + list(map(int, input().split()))'
  }),

  createSnippet({
    id: 'math-gcd',
    category: 'number-conversion',
    summary: '整数aとbの最大公約数',
    description: '整数aとbの最大公約数を求めます。',
    input: '整数aと整数bを受け取ります。',
    returns: 'aとbの最大公約数を返します。',
    label: 'gcd(a, b)',
    body: 'gcd(${1:a}, ${2:b})',
    imports: ['from math import gcd']
  }),
  createSnippet({
    id: 'math-isqrt',
    category: 'number-conversion',
    summary: '0以上の整数nの平方根（切り捨て）',
    description: '整数の平方根を小数点以下切り捨てで求めます。',
    input: '0以上の整数nを受け取ります。',
    returns: '√n以下で最大の整数を返します。例えばisqrt(10)は3です。',
    precondition: 'nは0以上の整数である必要があります。',
    label: 'isqrt(n)',
    body: 'isqrt(${1:n})',
    imports: ['from math import isqrt']
  }),

  createSnippet({
    id: 'binary-bisect-left',
    category: 'binary-search',
    selectorGroup: 'bisect-bound',
    selectorGroupLabel: '昇順リストaでxの境界を二分探索',
    choiceLabel: '左端（以上）',
    summary: '昇順リストaでx以上の左端を探す',
    description: '昇順リストから、x以上になる最初の位置を探します。',
    input: 'aは昇順リスト、xは探す値です。',
    returns: 'x以上の要素が最初にある添字iを返します。見つかれば先頭からi+1番目の要素です。なければ挿入位置len(a)を返します。',
    precondition: 'aは昇順に並んでいる必要があります。',
    label: 'bisect_left(a, x)',
    body: 'bisect_left(${1:a}, ${2:x})',
    imports: ['from bisect import bisect_left']
  }),
  createSnippet({
    id: 'binary-bisect-right',
    category: 'binary-search',
    selectorGroup: 'bisect-bound',
    selectorGroupLabel: '昇順リストaでxの境界を二分探索',
    choiceLabel: '右端（超過）',
    summary: '昇順リストaでxより大きい位置を探す',
    description: '昇順リストから、xより大きくなる最初の位置を探します。',
    input: 'aは昇順リスト、xは探す値です。',
    returns: 'xより大きい要素が最初にある添字iを返します。見つかれば先頭からi+1番目の要素です。なければ挿入位置len(a)を返します。',
    precondition: 'aは昇順に並んでいる必要があります。',
    label: 'bisect_right(a, x)',
    body: 'bisect_right(${1:a}, ${2:x})',
    imports: ['from bisect import bisect_right']
  }),

  createSnippet({
    id: 'aggregation-counter',
    category: 'aggregation',
    summary: 'リストaの要素の出現回数を数える',
    description: 'リストの各要素が何回現れるかを数えます。',
    input: '数えたい要素を含むリストaを受け取ります。',
    returns: '要素をキー、出現回数を値とするCounterを返します。',
    label: 'Counter(a)',
    body: 'Counter(${1:a})',
    imports: ['from collections import Counter']
  }),
  createSnippet({
    id: 'aggregation-defaultdict-int',
    category: 'aggregation',
    summary: '数え上げ用の辞書を作る（初期値0）',
    description: '存在しないキーを0として扱う辞書を作ります。',
    input: '追加の入力はありません。',
    returns: '未登録キーを参照すると0になるdefaultdictを返します。',
    label: 'defaultdict(int)',
    imports: ['from collections import defaultdict']
  }),
  createSnippet({
    id: 'aggregation-defaultdict-list',
    category: 'aggregation',
    summary: 'キーごとにリストを持つ辞書を作る（初期値は空リスト）',
    description: '存在しないキーを空リストとして扱う辞書を作ります。',
    input: '追加の入力はありません。',
    returns: '未登録キーを参照すると空リストになるdefaultdictを返します。',
    label: 'defaultdict(list)',
    imports: ['from collections import defaultdict']
  }),
  createSnippet({
    id: 'aggregation-accumulate',
    category: 'prefix-sum',
    summary: 'リストaの累積和を作る',
    description: 'リストの累積和を作ります。',
    input: '数値リストaを受け取ります。',
    returns: '先頭に0を置いた累積和のリストを返します。',
    label: 'list(accumulate(a, initial=0))',
    body: 'list(accumulate(${1:a}, initial=0))',
    imports: ['from itertools import accumulate']
  }),

  createSnippet({
    id: 'queue-deque',
    category: 'queue',
    selectorGroup: 'deque-create',
    selectorGroupLabel: 'キューを作る',
    choiceLabel: 'startを入れる',
    summary: 'startを入れたキューを作る',
    description: '先頭から取り出すキューを作ります。',
    input: '最初に入れておきたい要素startを受け取ります。',
    returns: 'startを入れたdequeを返します。左端からpopleft()で取り出せます。',
    label: 'deque([start])',
    body: 'deque([${1:start}])',
    imports: ['from collections import deque']
  }),

  ...createAdditionalSnippets()
];

function createSnippet({
  id,
  category,
  categoryLabel = CATEGORY_LABELS[category],
  selectorGroup = '',
  selectorGroupLabel = '',
  choiceLabel = '',
  summary = '',
  description,
  input,
  returns,
  precondition = '',
  label,
  body = label,
  imports = [],
  helpers = [],
  externalPackages = []
}) {
  const complexityValues = COMPLEXITY_BY_ID[id];
  if (!complexityValues) {
    throw new Error(`計算量の定義がありません: ${id}`);
  }
  return Object.freeze({
    id,
    category,
    categoryLabel,
    selectorGroup,
    selectorGroupLabel,
    choiceLabel,
    summary: summary || description,
    description,
    input,
    returns,
    precondition,
    label,
    body,
    imports: Object.freeze([...imports]),
    helpers: Object.freeze(helpers.map((helper) => Object.freeze({ ...helper }))),
    externalPackages: Object.freeze([...externalPackages]),
    complexity: Object.freeze({
      time: complexityValues[0],
      qualifier: complexityValues[1],
      detail: complexityValues[2]
    })
  });
}

function createAdditionalSnippets() {
  return [
    createSnippet({
      id: 'output-value',
      category: 'output',
      selectorGroup: 'output-single-value',
      selectorGroupLabel: '値xや文字列を出力',
      choiceLabel: '値x',
      summary: '値xを出力',
      description: '1つの値を標準出力へ表示します。',
      input: '出力したい値xを受け取ります。',
      returns: '戻り値はNone。xと改行を出力します。',
      label: 'print(x)',
      body: 'print(${1:x})'
    }),
    createSnippet({
      id: 'output-text',
      category: 'output',
      selectorGroup: 'output-single-value',
      selectorGroupLabel: '値xや文字列を出力',
      choiceLabel: '文字列',
      summary: '文字列"Yes"を出力',
      description: 'Yesなどの決まった文字列を表示します。',
      input: '出力したい文字列を受け取ります。',
      returns: '戻り値はNone。文字列と改行を出力します。',
      label: 'print("Yes")',
      body: 'print("${1:Yes}")'
    }),
    createSnippet({
      id: 'output-two-values',
      category: 'output',
      summary: 'aとbを空白区切りで出力',
      description: '2つの値を空白で区切って表示します。',
      input: '値a、値bを受け取ります。',
      returns: '戻り値はNone。aとbと改行を出力します。',
      label: 'print(a, b)',
      body: 'print(${1:a}, ${2:b})'
    }),
    createSnippet({
      id: 'output-unpack-list',
      category: 'output',
      summary: 'リストAを空白区切りで出力',
      description: 'リストの要素を展開して空白区切りで表示します。',
      input: 'リストAを受け取ります。',
      returns: '戻り値はNone。各要素と改行を出力します。',
      precondition: 'Aが展開可能である必要があります。',
      label: 'print(*A)',
      body: 'print(*${1:A})'
    }),

    createSnippet({
      id: 'number-abs',
      category: 'number-conversion',
      summary: '数xの絶対値',
      description: '数xの絶対値を返します。',
      input: '数xを受け取ります。',
      returns: 'xの絶対値を返します。',
      label: 'abs(x)',
      body: 'abs(${1:x})'
    }),
    createSnippet({
    id: 'number-max-two',
    category: 'number-conversion',
    selectorGroup: 'number-min-max',
    selectorGroupLabel: 'aとbの最大・最小',
    choiceLabel: '最大',
      summary: 'aとbの大きい方',
      description: '2つの値を比較して大きい方を求めます。',
      input: '比較可能な値a、bを受け取ります。',
      returns: 'aとbの大きい方を返します。',
      precondition: 'aとbを比較できる必要があります。',
      label: 'max(a, b)',
      body: 'max(${1:a}, ${2:b})'
    }),
    createSnippet({
    id: 'number-min-two',
    category: 'number-conversion',
    selectorGroup: 'number-min-max',
    selectorGroupLabel: 'aとbの最大・最小',
    choiceLabel: '最小',
      summary: 'aとbの小さい方',
      description: '2つの値を比較して小さい方を求めます。',
      input: '比較可能な値a、bを受け取ります。',
      returns: 'aとbの小さい方を返します。',
      precondition: 'aとbを比較できる必要があります。',
      label: 'min(a, b)',
      body: 'min(${1:a}, ${2:b})'
    }),
    createSnippet({
      id: 'number-floor-division',
      category: 'number-conversion',
      summary: 'aをbで割った商（切り捨て）',
      description: 'aをbで割り、負の無限大方向へ丸めた商を求めます。',
      input: '数a、0でない数bを受け取ります。',
      returns: 'a // bの商を返します。',
      precondition: 'bは0以外。負数では単純な0方向切り捨てではありません。',
      label: 'a // b',
      body: '${1:a} // ${2:b}'
    }),
    createSnippet({
      id: 'number-remainder',
      category: 'number-conversion',
      summary: 'aをbで割った余り',
      description: 'aをbで割った余りを求めます。',
      input: '数a、0でない数bを受け取ります。',
      returns: 'a % bの余りを返します。',
      precondition: 'bは0以外である必要があります。',
      label: 'a % b',
      body: '${1:a} % ${2:b}'
    }),
    createSnippet({
      id: 'math-lcm',
      category: 'number-conversion',
      summary: '整数aとbの最小公倍数',
      description: '整数aとbの最小公倍数を求めます。',
      input: '整数a、整数bを受け取ります。',
      returns: 'aとbの最小公倍数を返します。',
      label: 'lcm(a, b)',
      body: 'lcm(${1:a}, ${2:b})',
      imports: ['from math import lcm']
    }),
    createSnippet({
      id: 'conversion-int',
      category: 'number-conversion',
      selectorGroup: 'string-to-number',
      selectorGroupLabel: '文字列sを数に変換',
      choiceLabel: '整数',
      summary: '文字列sを整数に変換',
      description: '整数を表す文字列をint型へ変換します。',
      input: '文字列sを受け取ります。',
      returns: 'int型の整数を返します。',
      precondition: 'sが整数として解釈できる必要があります。',
      label: 'int(s)',
      body: 'int(${1:s})'
    }),
    createSnippet({
      id: 'conversion-float',
      category: 'number-conversion',
      selectorGroup: 'string-to-number',
      selectorGroupLabel: '文字列sを数に変換',
      choiceLabel: '小数',
      summary: '文字列sを小数に変換',
      description: '数を表す文字列をfloat型へ変換します。',
      input: '文字列sを受け取ります。',
      returns: 'float型の数を返します。',
      precondition: 'sがfloatとして解釈できる必要があります。',
      label: 'float(s)',
      body: 'float(${1:s})'
    }),
    createSnippet({
      id: 'conversion-str',
      category: 'number-conversion',
      summary: '値xを文字列に変換',
      description: '数値などの値を表示用の文字列へ変換します。',
      input: '値xを受け取ります。',
      returns: 'str型の文字列を返します。',
      label: 'str(x)',
      body: 'str(${1:x})'
    }),
    createSnippet({
      id: 'conversion-digit-list',
      category: 'number-conversion',
      summary: '数字の文字列sを1桁ずつの整数リストにする',
      description: '数字文字列sの各文字を整数に変換し、リストを返します。',
      input: '数字だけからなる文字列sを受け取ります。',
      returns: '各文字を整数にしたリストを返します。',
      precondition: '符号、小数点、空白を含まない数字文字列である必要があります。',
      label: 'list(map(int, s))',
      body: 'list(map(int, ${1:s}))'
    }),

    createSnippet({
      id: 'sequence-length',
      category: 'list',
      summary: '文字列やリストaの長さ',
      description: '値aの要素数または文字数を返します。',
      input: '長さを持つ値aを受け取ります。',
      returns: 'aの要素数を返します。',
      precondition: 'aがlenに対応している必要があります。',
      label: 'len(a)',
      body: 'len(${1:a})'
    }),
    createSnippet({
      id: 'list-access',
      category: 'list',
      summary: 'リストAの先頭からi+1番目の要素を見る',
      description: '添字は0から始まります。A[i]は先頭からi+1番目の要素です。文字列でもs[0]で先頭の1文字を取り出せます。',
      input: 'リストAと添字iを受け取ります。',
      returns: 'Aの先頭からi+1番目の要素を返します。',
      precondition: '0 <= i < len(A)である必要があります。',
      label: 'A[i]',
      body: '${1:A}[${2:i}]'
    }),
    createSnippet({
      id: 'list-access-from-end',
      category: 'list',
      summary: 'リストAの末尾からi番目の要素を見る',
      description: 'iは1から数えます。iが1なら末尾、2なら末尾から2番目の要素を返します。文字列でもs[-1]で末尾の1文字を取り出せます。',
      input: 'リストAと、末尾から数えた順番i（1が末尾）を受け取ります。',
      returns: 'Aの末尾からi番目の要素を返します。',
      precondition: '1 <= i <= len(A)である必要があります。',
      label: 'A[-i]',
      body: '${1:A}[-${2:i}]'
    }),
    createSnippet({
      id: 'list-slice',
      category: 'list',
      summary: 'リストAを添字startからendの直前まで取り出す',
      description: '0 <= start < end <= len(A)なら、先頭からstart+1番目からend番目までを取り出します。文字列でも同じ書き方で部分文字列を取り出せます。',
      input: 'リストA（文字列も可）、開始位置start、終了位置endを受け取ります。',
      returns: '添字startを含み、添字endを含まない新しいリストを返します。Aが文字列なら新しい文字列を返します。',
      precondition: '添字は0から始まります。負の添字は末尾から数えます。範囲外の添字は端に合わせられます。範囲に要素がなければ空リスト（文字列なら空文字列）です。',
      label: 'A[start:end]',
      body: '${1:A}[${2:start}:${3:end}]'
    }),
    createSnippet({
      id: 'string-count',
      category: 'string',
      summary: '文字列sに"a"が何回現れるか数える',
      description: '文字列sで文字列"a"が重ならずに現れる回数を返します。"a"は2文字以上の文字列にもできます。',
      input: '文字列s、数えたい文字列"a"を受け取ります。',
      returns: '重ならない出現回数を返します。',
      label: 's.count("a")',
      body: '${1:s}.count("${2:a}")'
    }),
    createSnippet({
      id: 'string-find',
      category: 'string',
      summary: '文字列sで文字列tが最初に現れる位置',
      description: '文字列sで文字列tが最初に現れる位置を返します。見つからない場合は-1を返します。',
      input: '文字列s、探す文字列tを受け取ります。',
      returns: '最初に現れる添字iを返します。見つかれば先頭からi+1番目の位置です。見つからなければ-1を返します。',
      label: 's.find(t)',
      body: '${1:s}.find(${2:t})'
    }),
    createSnippet({
      id: 'string-contains',
      category: 'string',
      summary: '文字列sに"a"が含まれるか判定',
      description: '文字列sに文字列"a"が含まれるかを返します。',
      input: '文字列s、探す文字列"a"を受け取ります。',
      returns: '含まれればTrue、なければFalseを返します。',
      label: '"a" in s',
      body: '"${2:a}" in ${1:s}'
    }),
    createSnippet({
      id: 'string-reverse',
      category: 'string',
      summary: '文字列sを逆順にする',
      description: '文字列sの文字を逆順にした新しい文字列を返します。',
      input: '文字列sを受け取ります。',
      returns: '逆順の新しい文字列を返します。',
      label: 's[::-1]',
      body: '${1:s}[::-1]'
    }),
    createSnippet({
      id: 'string-lower',
      category: 'string',
      selectorGroup: 'string-case',
      selectorGroupLabel: '文字列sを大文字・小文字にする',
      choiceLabel: '小文字',
      summary: '文字列sの英字を小文字にする',
      description: '英字の大文字を小文字へ変換します。',
      input: '文字列sを受け取ります。',
      returns: '変換後の新しい文字列を返します。',
      label: 's.lower()',
      body: '${1:s}.lower()'
    }),
    createSnippet({
      id: 'string-upper',
      category: 'string',
      selectorGroup: 'string-case',
      selectorGroupLabel: '文字列sを大文字・小文字にする',
      choiceLabel: '大文字',
      summary: '文字列sの英字を大文字にする',
      description: '英字の小文字を大文字へ変換します。',
      input: '文字列sを受け取ります。',
      returns: '変換後の新しい文字列を返します。',
      label: 's.upper()',
      body: '${1:s}.upper()'
    }),
    createSnippet({
      id: 'string-replace',
      category: 'string',
      summary: '文字列sの"a"をすべて"b"に置き換える',
      description: '一致する部分文字列をすべて置き換えます。',
      input: '文字列s、置換前の文字列"a"、置換後の文字列"b"を受け取ります。',
      returns: '置換後の新しい文字列を返します。',
      precondition: '元のs自体は変更されません。',
      label: 's.replace("a", "b")',
      body: '${1:s}.replace("${2:a}", "${3:b}")'
    }),
    createSnippet({
      id: 'string-set-char',
      category: 'string',
      summary: '文字列sの添字iの文字（i+1番目）を"a"に置き換える',
      description: '文字列（str）は一部だけを書き換えられない（immutable）ため、s[i] = "a"とは書けません。添字iの前後をつないで新しい文字列を作ります。',
      input: '文字列s、添字i、置き換える1文字"a"を受け取ります。',
      returns: '先頭からi+1番目だけを置き換えた新しい文字列を返します。元のs自体は変更されません。',
      precondition: '0 <= i < len(s)である必要があります。負の添字や範囲外の添字では正しく置き換わりません。置き換える文字は1文字にします。何度も書き換えるなら、t = list(s)でリストにしてt[i] = "a"で更新し、最後に"".join(t)で文字列に戻す方が速いです。',
      label: 's[:i] + "a" + s[i + 1:]',
      body: '${1:s}[:${2:i}] + "${3:a}" + ${1:s}[${2:i} + 1:]'
    }),
    createSnippet({
      id: 'list-max',
      category: 'list',
      selectorGroup: 'list-min-max',
      selectorGroupLabel: 'リストAの最大・最小',
      choiceLabel: '最大値',
      summary: 'リストAの最大値',
      description: 'リストAの最大の要素を返します。',
      input: '比較可能な要素を持つリストAを受け取ります。',
      returns: 'Aの最大要素を返します。',
      precondition: 'Aが空でなく、要素同士を比較できる必要があります。',
      label: 'max(A)',
      body: 'max(${1:A})'
    }),
    createSnippet({
      id: 'list-min',
      category: 'list',
      selectorGroup: 'list-min-max',
      selectorGroupLabel: 'リストAの最大・最小',
      choiceLabel: '最小値',
      summary: 'リストAの最小値',
      description: 'リストAの最小の要素を返します。',
      input: '比較可能な要素を持つリストAを受け取ります。',
      returns: 'Aの最小要素を返します。',
      precondition: 'Aが空でなく、要素同士を比較できる必要があります。',
      label: 'min(A)',
      body: 'min(${1:A})'
    }),
    createSnippet({
      id: 'list-sum',
      category: 'list',
      summary: '数値リストAの合計',
      description: 'リスト内の数をすべて足します。',
      input: '数値リストAを受け取ります。',
      returns: '全要素の合計。空なら0を返します。',
      precondition: '要素を加算できる必要があります。',
      label: 'sum(A)',
      body: 'sum(${1:A})'
    }),
    createSnippet({
      id: 'list-contains',
      category: 'list',
      summary: 'リストAにxが含まれるか判定',
      description: '指定した値がリストにあるか調べます。',
      input: 'リストA、探す値xを受け取ります。',
      returns: '含まれればTrue、なければFalseを返します。',
      label: 'x in A',
      body: '${2:x} in ${1:A}'
    }),
    createSnippet({
      id: 'list-count',
      category: 'list',
      summary: 'リストAにxが何個あるか数える',
      description: '指定した値と等しい要素を数えます。',
      input: 'リストA、数える値xを受け取ります。',
      returns: 'xの出現回数を返します。',
      label: 'A.count(x)',
      body: '${1:A}.count(${2:x})'
    }),
    createSnippet({
      id: 'list-sort-ascending',
      category: 'list',
      selectorGroup: 'list-sort-order',
      selectorGroupLabel: 'リストAの並び替え',
      choiceLabel: '昇順',
      summary: 'リストAを昇順に並べ替える',
      description: 'A自身を小さい順に変更します。',
      input: 'リストAを受け取ります。',
      returns: '戻り値はNone。A自身を変更します。',
      precondition: '要素同士を比較できる必要があります。',
      label: 'A.sort()',
      body: '${1:A}.sort()'
    }),
    createSnippet({
      id: 'list-sort-descending',
      category: 'list',
      selectorGroup: 'list-sort-order',
      selectorGroupLabel: 'リストAの並び替え',
      choiceLabel: '降順',
      summary: 'リストAを降順に並べ替える',
      description: 'A自身を大きい順に変更します。',
      input: 'リストAを受け取ります。',
      returns: '戻り値はNone。A自身を変更します。',
      precondition: '要素同士を比較できる必要があります。',
      label: 'A.sort(reverse=True)',
      body: '${1:A}.sort(reverse=True)'
    }),
    createSnippet({
      id: 'comprehension-range',
      category: 'list',
      summary: '0以上n未満の整数を並べたリスト',
      description: 'rangeの各整数をリストにします。',
      input: '0以上の整数nを受け取ります。',
      returns: '[0, 1, ..., n-1]を返します。',
      precondition: 'nは整数である必要があります。',
      label: '[i for i in range(n)]',
      body: '[i for i in range(${1:n})]'
    }),
    createSnippet({
      id: 'comprehension-squares',
      category: 'list',
      summary: '0以上n未満の整数iの二乗を並べたリスト',
      description: '0からn-1までをそれぞれ二乗します。',
      input: '0以上の整数nを受け取ります。',
      returns: '各iのi * iを持つリストを返します。',
      precondition: 'nは整数である必要があります。',
      label: '[i * i for i in range(n)]',
      body: '[i * i for i in range(${1:n})]'
    }),
    createSnippet({
      id: 'comprehension-even-filter',
      category: 'list',
      summary: 'Aの要素xのうち条件を満たすものでリストを作る',
      description: '反復対象の各要素について条件を調べ、条件を満たすときだけリストに加える要素を作ります。',
      input: '反復対象A、ループ変数x、リストに加える要素、条件を指定します。',
      returns: '条件を満たす要素から作った値を、順番どおり持つリストを返します。',
      precondition: 'リストに加える要素と条件を目的に合わせて編集します。条件がTrueのままなら全要素を使います。',
      label: '[要素 for x in A if 条件]',
      body: '[${1:x} for ${2:x} in ${3:A} if ${4:True}]'
    }),
    createSnippet({
      id: 'comprehension-conditional-expression',
      category: 'list',
      summary: 'Aの各要素xについて条件で値を選んだリストを作る',
      description: '反復対象の各要素で条件を調べ、真なら要素1、偽なら要素2をリストに加えます。元の要素は除外しません。',
      input: '反復対象A、ループ変数x、条件、真の場合に加える要素1、偽の場合に加える要素2を指定します。',
      returns: 'Aの各要素に対応する値を順番どおり持つリストを返します。結果の長さはAと同じです。',
      precondition: '条件と、真偽それぞれの場合に加える要素を目的に合わせて編集します。',
      label: '[要素1 if 条件 else 要素2 for x in A]',
      body: '[${1:x} if ${2:x > 0} else ${3:None} for ${4:x} in ${5:A}]'
    }),
    createSnippet({
      id: 'comprehension-zero-matrix',
      category: 'list',
      summary: 'h行w列の0で埋めた二次元リスト',
      description: '各行が独立した二次元リストを作ります。',
      input: '行数h、列数wを受け取ります。',
      returns: 'h行w列の0のリストを返します。',
      precondition: 'hとwは0以上の整数である必要があります。',
      label: '[[0] * w for _ in range(h)]',
      body: '[[0] * ${2:w} for _ in range(${1:h})]'
    }),

    createSnippet({
      id: 'string-isdigit',
      category: 'string',
      selectorGroup: 'string-char-kind',
      selectorGroupLabel: '文字列sの文字の種類を判定',
      choiceLabel: '数字',
      summary: '文字列sが数字だけか判定',
      description: 'すべての文字が数字か調べます。',
      input: '文字列sを受け取ります。',
      returns: '数字だけで空でなければTrueを返します。',
      precondition: '-12と12.5は符号や小数点を含むためFalseになります。',
      label: 's.isdigit()',
      body: '${1:s}.isdigit()'
    }),
    createSnippet({
      id: 'string-isalpha',
      category: 'string',
      selectorGroup: 'string-char-kind',
      selectorGroupLabel: '文字列sの文字の種類を判定',
      choiceLabel: '英字など',
      summary: '文字列sが英字などの文字だけか判定',
      description: 'すべての文字がアルファベットなどの文字か調べます。',
      input: '文字列sを受け取ります。',
      returns: '文字だけで空でなければTrueを返します。',
      label: 's.isalpha()',
      body: '${1:s}.isalpha()'
    }),
    createSnippet({
      id: 'string-isalnum',
      category: 'string',
      selectorGroup: 'string-char-kind',
      selectorGroupLabel: '文字列sの文字の種類を判定',
      choiceLabel: '英数字',
      summary: '文字列sが文字か数字だけか判定',
      description: 'すべての文字が英数字などか調べます。',
      input: '文字列sを受け取ります。',
      returns: '文字または数字だけで空でなければTrueを返します。',
      label: 's.isalnum()',
      body: '${1:s}.isalnum()'
    }),
    createSnippet({
      id: 'string-islower',
      category: 'string',
      selectorGroup: 'string-char-kind',
      selectorGroupLabel: '文字列sの文字の種類を判定',
      choiceLabel: '小文字',
      summary: '文字列sの英字がすべて小文字か判定',
      description: '大文字小文字を持つ文字がすべて小文字か調べます。',
      input: '文字列sを受け取ります。',
      returns: '条件を満たし、英字が1文字以上あればTrueを返します。',
      label: 's.islower()',
      body: '${1:s}.islower()'
    }),
    createSnippet({
      id: 'string-isupper',
      category: 'string',
      selectorGroup: 'string-char-kind',
      selectorGroupLabel: '文字列sの文字の種類を判定',
      choiceLabel: '大文字',
      summary: '文字列sの英字がすべて大文字か判定',
      description: '大文字小文字を持つ文字がすべて大文字か調べます。',
      input: '文字列sを受け取ります。',
      returns: '条件を満たし、英字が1文字以上あればTrueを返します。',
      label: 's.isupper()',
      body: '${1:s}.isupper()'
    }),
    createSnippet({
      id: 'string-isspace',
      category: 'string',
      selectorGroup: 'string-char-kind',
      selectorGroupLabel: '文字列sの文字の種類を判定',
      choiceLabel: '空白',
      summary: '文字列sが空白文字だけか判定',
      description: '半角空白や改行などの空白文字だけか調べます。',
      input: '文字列sを受け取ります。',
      returns: '空白文字だけで空でなければTrueを返します。',
      label: 's.isspace()',
      body: '${1:s}.isspace()'
    }),
    createSnippet({
      id: 'string-hamming-distance',
      category: 'string',
      summary: '同じ長さの文字列sとtのハミング距離',
      description: '同じ長さの文字列sとtで、同じ位置の文字が異なる箇所の数を数えます。',
      input: '同じ長さの文字列sとtを受け取ります。',
      returns: '文字が異なる位置の数を返します。sとtが両方とも空文字列なら0です。',
      precondition: 'sとtの長さが違うとValueErrorが発生します。',
      label: 'hamming_distance(s, t)',
      body: 'hamming_distance(${1:s}, ${2:t})',
      helpers: [{
        name: 'hamming_distance',
        code: [
          'def hamming_distance(s, t):',
          '    if len(s) != len(t):',
          '        raise ValueError("sとtの長さが違います")',
          '    return sum(a != b for a, b in zip(s, t))'
        ].join('\n')
      }]
    }),
    createSnippet({
      id: 'string-levenshtein-distance',
      category: 'string',
      summary: '文字列sとtの編集距離（レーベンシュタイン距離）',
      description: '1文字の挿入・削除・置換を何回行えばsをtに変えられるか、その最小回数を求めます。',
      input: '文字列sとtを受け取ります。長さは違っても構いません。',
      returns: '最小の操作回数を返します。片方が空文字列なら、もう片方の長さです。',
      precondition: '動的計画法（DP）で、直前の行だけを残して計算します。',
      label: 'levenshtein_distance(s, t)',
      body: 'levenshtein_distance(${1:s}, ${2:t})',
      helpers: [{
        name: 'levenshtein_distance',
        code: [
          'def levenshtein_distance(s, t):',
          '    prev = list(range(len(t) + 1))',
          '    for i, a in enumerate(s, 1):',
          '        cur = [i] + [0] * len(t)',
          '        for j, b in enumerate(t, 1):',
          '            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a != b))',
          '        prev = cur',
          '    return prev[-1]'
        ].join('\n')
      }]
    }),
    createSnippet({
      id: 'string-find-all',
      category: 'string',
      summary: '文字列sで文字列tが現れる位置をすべて探す',
      description: '文字列sで文字列tが現れる添字を、重なる一致も含めてすべて集めます。',
      input: '文字列sと探す文字列tを受け取ります。',
      returns: '一致が始まる添字iを小さい順に並べたリストを返します。添字iは先頭からi+1番目の位置です。見つからなければ空リストです。',
      precondition: 'tが空文字列だとValueErrorが発生します。"aaa"から"aa"を探すと[0, 1]のように重なる一致も数えます。',
      label: 'find_all(s, t)',
      body: 'find_all(${1:s}, ${2:t})',
      helpers: [{
        name: 'find_all',
        code: [
          'def find_all(s, t):',
          '    if t == "":',
          '        raise ValueError("tが空文字列です")',
          '    result = []',
          '    i = s.find(t)',
          '    while i != -1:',
          '        result.append(i)',
          '        i = s.find(t, i + 1)',
          '    return result'
        ].join('\n')
      }]
    }),
    createSnippet({
      id: 'string-z-algorithm',
      category: 'string',
      summary: '文字列sの各位置から先頭と一致する長さ（Z algorithm）',
      description: '各添字iについて、sとs[i:]の先頭が何文字一致するかをまとめて求めます。',
      input: '文字列sを受け取ります。',
      returns: '長さlen(s)のリストzを返します。z[i]はsとs[i:]の共通する先頭部分の長さで、z[0]はlen(s)です。sが空文字列なら空リストです。',
      precondition: 't + "#" + sのように区切り文字でつなぐと、z[i]がlen(t)になる位置iでsの中のtが見つかります。sでの添字はi - len(t) - 1です。区切り文字はsとtに含まれない文字にします。',
      label: 'z_algorithm(s)',
      body: 'z_algorithm(${1:s})',
      helpers: [{
        name: 'z_algorithm',
        code: [
          'def z_algorithm(s):',
          '    n = len(s)',
          '    z = [0] * n',
          '    if n == 0:',
          '        return z',
          '    z[0] = n',
          '    left = right = 0',
          '    for i in range(1, n):',
          '        if i < right:',
          '            z[i] = min(right - i, z[i - left])',
          '        while i + z[i] < n and s[z[i]] == s[i + z[i]]:',
          '            z[i] += 1',
          '        if i + z[i] > right:',
          '            left, right = i, i + z[i]',
          '    return z'
        ].join('\n')
      }]
    }),
    createSnippet({
      id: 'aggregation-counter-value',
      category: 'aggregation',
      summary: 'Counter cntからxの個数を取り出す',
      description: 'Counterから指定要素の出現回数を取り出します。',
      input: 'Counter cnt、調べる値xを受け取ります。',
      returns: 'xの個数。未登録なら0を返します。',
      precondition: 'cntをCounterとして作成済みである必要があります。',
      label: 'cnt[x]',
      body: '${1:cnt}[${2:x}]',
      imports: ['from collections import Counter']
    }),
    createSnippet({
      id: 'aggregation-increment',
      category: 'aggregation',
      summary: '辞書dのキーxの個数を1増やす',
      description: 'defaultdict(int)のカウンタを更新します。',
      input: 'defaultdict d、数える値xを受け取ります。',
      returns: '戻り値はNone。d[x]を1増やします。',
      precondition: 'dをdefaultdict(int)として作成済みである必要があります。',
      label: 'd[x] += 1',
      body: '${1:d}[${2:x}] += 1',
      imports: ['from collections import defaultdict']
    }),

    createSnippet({
      id: 'prefix-sum-range',
      category: 'prefix-sum',
      summary: '累積和cumで添字lからrの直前までの合計',
      description: '2つの累積値の差から半開区間の合計を求めます。',
      input: '先頭0付き累積和cum、左端l、右端の1つ外側rを受け取ります。',
      returns: '元のAの添字lからrの直前までの合計を返します。0 <= l < rなら先頭からl+1番目からr番目までです。',
      precondition: 'cum[0] == 0で、cumがAの累積和である必要があります。',
      label: 'cum[r] - cum[l]',
      body: '${1:cum}[${3:r}] - ${1:cum}[${2:l}]'
    }),

    createSnippet({
      id: 'brute-combinations',
      category: 'brute-force',
      summary: 'リストAからr個選ぶ全ての組み合わせが入ったリストを作る',
      description: 'Aから順番を区別せずにr個選ぶ全ての組み合わせをリストにします。',
      input: 'リストAと、選ぶ個数rを受け取ります。',
      returns: '各組み合わせをr要素のタプルにしたリストを返します。',
      precondition: 'rは0以上の整数です。組み合わせの数だけタプルを作ってメモリに保持します。',
      label: 'list(combinations(A, r))',
      body: 'list(combinations(${1:A}, ${2:r}))',
      imports: ['from itertools import combinations']
    }),
    createSnippet({
      id: 'brute-permutations',
      category: 'brute-force',
      summary: 'リストAの全ての並び順が入ったリストを作る',
      description: 'Aの要素を並べ替えた全ての順番をリストにします。',
      input: 'リストAを受け取ります。',
      returns: '各並び順をタプルにしたリストを返します。',
      precondition: '件数は要素数の階乗で増え、全件をメモリに保持します。同じ値が複数あると、同じ値の並び順も複数回入ります。',
      label: 'list(permutations(A))',
      body: 'list(permutations(${1:A}))',
      imports: ['from itertools import permutations']
    }),

    createSnippet({
      id: 'binary-count-closed-interval',
      category: 'binary-search',
      summary: '昇順リストaでB以上A以下の個数',
      description: '左端と右端の挿入位置の差から、閉区間[B, A]に入る要素数を求めます。',
      input: '昇順リストa、上限A、下限Bを受け取ります。',
      returns: 'B <= x <= Aを満たすa内の要素数を返します。',
      precondition: 'aが昇順で、BがA以下である必要があります。',
      label: 'bisect_right(a, A) - bisect_left(a, B)',
      body: 'bisect_right(${1:a}, ${2:A}) - bisect_left(${1:a}, ${3:B})',
      imports: ['from bisect import bisect_left, bisect_right']
    }),

    createSnippet({
      id: 'queue-deque-empty',
      category: 'queue',
      selectorGroup: 'deque-create',
      selectorGroupLabel: 'キューを作る',
      choiceLabel: '空',
      summary: '空のキューを作る',
      description: '左から高速に取り出せる空のdequeを作ります。',
      input: '追加の入力はありません。',
      returns: '空のdequeを返します。',
      label: 'deque()',
      body: 'deque()',
      imports: ['from collections import deque']
    }),
    createSnippet({
      id: 'queue-append',
      category: 'queue',
      selectorGroup: 'deque-add-end',
      selectorGroupLabel: 'deque qの端にxを追加',
      choiceLabel: '右端に追加',
      summary: 'キューqの右端にxを追加',
      description: 'dequeの末尾へ要素を追加します。',
      input: 'deque q、追加する値xを受け取ります。',
      returns: '戻り値はNone。qを変更します。',
      precondition: 'qがappendに対応している必要があります。',
      label: 'q.append(x)',
      body: '${1:q}.append(${2:x})',
      imports: ['from collections import deque']
    }),
    createSnippet({
      id: 'queue-popleft',
      category: 'queue',
      selectorGroup: 'deque-remove-end',
      selectorGroupLabel: 'deque qの端から取り出す',
      choiceLabel: '左端から取り出す',
      summary: 'キューqの左端から取り出す',
      description: 'dequeの先頭要素を削除して取得します。',
      input: 'deque qを受け取ります。',
      returns: '削除した左端要素を返します。',
      precondition: 'qが空でない必要があります。',
      label: 'q.popleft()',
      body: '${1:q}.popleft()',
      imports: ['from collections import deque']
    }),
    createSnippet({
      id: 'queue-appendleft',
      category: 'queue',
      selectorGroup: 'deque-add-end',
      selectorGroupLabel: 'deque qの端にxを追加',
      choiceLabel: '左端に追加',
      summary: 'deque qの左端にxを追加',
      description: 'dequeの左端へ要素を追加します。',
      input: 'deque q、追加する値xを受け取ります。',
      returns: '戻り値はNone。qを変更します。',
      precondition: 'qがappendleftに対応している必要があります。',
      label: 'q.appendleft(x)',
      body: '${1:q}.appendleft(${2:x})',
      imports: ['from collections import deque']
    }),
    createSnippet({
      id: 'queue-pop',
      category: 'queue',
      selectorGroup: 'deque-remove-end',
      selectorGroupLabel: 'deque qの端から取り出す',
      choiceLabel: '右端から取り出す',
      summary: 'deque qの右端から取り出す',
      description: 'dequeの右端要素を削除して取得します。見るだけではなく、取り出した要素はqから消えます。',
      input: 'deque qを受け取ります。',
      returns: '削除した右端要素を返します。',
      precondition: 'qが空でない必要があります。',
      label: 'q.pop()',
      body: '${1:q}.pop()',
      imports: ['from collections import deque']
    }),
    createSnippet({
      id: 'queue-index',
      category: 'queue',
      summary: 'deque qの添字iの要素を見る（i+1番目）',
      description: 'deque qの要素を削除せずに返します。iが0以上なら先頭からi+1番目、i=-1なら末尾です。',
      input: 'deque qと添字iを受け取ります。',
      returns: 'qの添字iにある要素を返します。負のiは末尾から数えます。',
      precondition: 'iは有効な添字である必要があります。i=0やi=-1など両端の参照はO(1)、中央付近はO(n)です。',
      label: 'q[i]',
      body: '${1:q}[${2:i}]',
      imports: ['from collections import deque']
    }),

    createSnippet({
      id: 'tuple-coordinate',
      category: 'tuple',
      summary: '座標xとyをタプルにまとめる',
      description: '変更しないひとまとまりの座標を(x, y)のタプルとして作ります。',
      input: '座標のx、yを受け取ります。',
      returns: '2要素のtupleを返します。',
      precondition: 'タプル自体は変更できません。setやdictのキーにするには、全ての要素もハッシュ可能である必要があります。',
      label: '(x, y)',
      body: '(${1:x}, ${2:y})'
    }),
    createSnippet({
      id: 'tuple-single-item',
      category: 'tuple',
      summary: '値xを1要素のタプルにする',
      description: '末尾のカンマを付けて、値xを1要素のタプルとして作ります。',
      input: '値xを受け取ります。',
      returns: 'xだけを要素に持つtupleを返します。',
      precondition: '(x)はタプルではなくxそのものです。1要素タプルには末尾のカンマが必要です。',
      label: '(x,)',
      body: '(${1:x},)'
    }),
    createSnippet({
      id: 'tuple-unpack-coordinate',
      category: 'tuple',
      summary: '座標タプルpointをxとyに分ける',
      description: '2要素のタプルを、xとyの2つの変数へ一度に代入します。',
      input: '2要素のタプルpointを受け取ります。',
      returns: 'pointの1番目をx、2番目をyへ代入します。',
      precondition: 'pointの要素数が代入先の変数数と一致する必要があります。',
      label: 'x, y = point',
      body: '${1:x}, ${2:y} = ${3:point}'
    }),


    createSnippet({
      id: 'list-append',
      category: 'list',
      summary: 'リストAの末尾にxを追加',
      description: 'リストAの末尾に要素xを追加します。',
      input: 'リストAと追加する要素xを受け取ります。',
      returns: '戻り値はNone。リストAを変更します。',
      label: 'A.append(x)',
      body: '${1:A}.append(${2:x})'
    }),
    createSnippet({
      id: 'list-pop',
      category: 'list',
      summary: 'リストAの末尾の要素を取り出す',
      description: 'リストAの末尾の要素を削除し、その要素を返します。',
      input: 'リストAを受け取ります。',
      returns: '削除した末尾の要素を返します。',
      precondition: 'リストAが空でない必要があります。',
      label: 'A.pop()',
      body: '${1:A}.pop()'
    }),
    createSnippet({
      id: 'list-pop-first',
      category: 'list',
      summary: 'リストAの先頭の要素を取り出す',
      description: 'リストAの先頭の要素を削除し、その要素を返します。',
      input: 'リストAを受け取ります。',
      returns: '削除した先頭の要素を返します。',
      precondition: 'リストAが空でない必要があります。',
      label: 'A.pop(0)',
      body: '${1:A}.pop(0)'
    }),
    createSnippet({
      id: 'list-index',
      category: 'list',
      summary: 'リストAでxが最初に現れる位置',
      description: 'リストAで要素xが最初に現れる位置を返します。',
      input: 'リストAと探す要素xを受け取ります。',
      returns: '最初に現れる添字iを返します。先頭からi+1番目の位置です。',
      precondition: 'xがない場合はValueErrorが発生します。',
      label: 'A.index(x)',
      body: '${1:A}.index(${2:x})'
    }),
    createSnippet({
      id: 'set-add',
      category: 'aggregation',
      summary: '集合Sにxを追加',
      description: '集合Sに要素xを追加します。',
      input: '集合Sと追加する要素xを受け取ります。',
      returns: '戻り値はNone。集合Sを変更します。',
      precondition: 'xはハッシュ可能である必要があります。',
      label: 'S.add(x)',
      body: '${1:S}.add(${2:x})'
    }),
    createSnippet({
      id: 'set-contains',
      category: 'aggregation',
      summary: '集合Sにxがあるか判定',
      description: '集合Sに要素xが含まれるかを調べます。辞書dでもx in dでキーxがあるかを同じ速さで調べられます。',
      input: '集合S（辞書も可）と探す要素xを受け取ります。',
      returns: '含まれればTrue、なければFalseを返します。',
      precondition: 'xはハッシュ可能である必要があります。',
      label: 'x in S',
      body: '${2:x} in ${1:S}'
    }),
    createSnippet({
      id: 'dict-lookup',
      category: 'aggregation',
      summary: '辞書dからキーxの値を取得',
      description: '辞書dでキーxに対応する値を返します。',
      input: '辞書dとキーxを受け取ります。',
      returns: 'キーxに対応する値を返します。',
      precondition: 'キーxがない場合はKeyErrorが発生します。',
      label: 'd[x]',
      body: '${1:d}[${2:x}]'
    }),
    createSnippet({
      id: 'debug-type',
      category: 'output',
      summary: '値xの型を確認',
      description: 'デバッグ時に値の実際の型を調べます。',
      input: '値xを受け取ります。',
      returns: 'xの型オブジェクトを返します。',
      label: 'type(x)',
      body: 'type(${1:x})'
    }),
    createSnippet({
      id: 'debug-isinstance-int',
      category: 'output',
      selectorGroup: 'isinstance-type',
      selectorGroupLabel: '値xの型を判定',
      choiceLabel: 'int',
      summary: '値xがint型か判定',
      description: '継承関係も含めてint型か調べます。',
      input: '値xを受け取ります。',
      returns: 'int型ならTrue、それ以外はFalseを返します。',
      precondition: 'boolはintのサブクラスなのでTrueになります。',
      label: 'isinstance(x, int)',
      body: 'isinstance(${1:x}, int)'
    }),
    createSnippet({
      id: 'debug-isinstance-str',
      category: 'output',
      selectorGroup: 'isinstance-type',
      selectorGroupLabel: '値xの型を判定',
      choiceLabel: 'str',
      summary: '値sがstr型か判定',
      description: '値が文字列型か調べます。',
      input: '値sを受け取ります。',
      returns: 'str型ならTrue、それ以外はFalseを返します。',
      label: 'isinstance(s, str)',
      body: 'isinstance(${1:s}, str)'
    })
  ];
}

const SNIPPET_INDEX = new Map(
  SNIPPET_CATEGORY_ORDER.map((category, index) => [category, index])
);

const INPUT_SNIPPETS = Object.freeze(
  [...SNIPPET_DEFINITIONS].sort(
    (left, right) => {
      const categoryDifference = SNIPPET_INDEX.get(left.category) - SNIPPET_INDEX.get(right.category);
      if (categoryDifference !== 0) {
        return categoryDifference;
      }
      return (SNIPPET_USAGE_ORDER.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (SNIPPET_USAGE_ORDER.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    }
  )
);

function getInputSnippet(snippetId) {
  if (typeof snippetId !== 'string') {
    return undefined;
  }

  return INPUT_SNIPPETS.find((snippet) => snippet.id === snippetId);
}

// Removed snippet ids mapped to the snippet that replaced them.
const SNIPPET_ID_ALIASES = Object.freeze({
  'string-first': 'list-access',
  'string-last': 'list-access-from-end',
  'string-slice': 'list-slice',
  'dict-contains': 'set-contains'
});

const SNIPPET_PLACEHOLDER_PATTERN =/\$\{(\d+)(?::([^}]*))?\}/g;

function getSnippetPlaceholders(body) {
  const placeholders = [];
  const seenIndexes = new Set();

  String(body || '').replace(SNIPPET_PLACEHOLDER_PATTERN, (match, index, defaultValue = '') => {
    if (!seenIndexes.has(index)) {
      seenIndexes.add(index);
      placeholders.push({
        index: Number(index),
        defaultValue
      });
    }
    return match;
  });

  return placeholders;
}

function applySnippetPlaceholderValues(body, values) {
  const source = String(body || '');
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return source;
  }

  return source.replace(SNIPPET_PLACEHOLDER_PATTERN, (placeholder, index) => {
    if (!Object.prototype.hasOwnProperty.call(values, index) || typeof values[index] !== 'string') {
      return placeholder;
    }

    const safeValue = values[index]
      .replace(/[\r\n]+/g, ' ')
      .replace(/[\\$}]/g, '\\$&');
    return '${' + index + ':' + safeValue + '}';
  });
}

module.exports = {
  INPUT_SNIPPETS,
  SNIPPET_CATEGORY_ORDER,
  SNIPPET_DISPLAY_ORDER,
  SNIPPET_ID_ALIASES,
  getInputSnippet,
  getSnippetPlaceholders,
  applySnippetPlaceholderValues
};
