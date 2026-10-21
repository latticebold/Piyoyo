# 計算量推定の設計（開発者向け）

Issue #9（計算量推定）の内部設計です。
画面と切り離したモジュールは `src/complexity/` に置き、`node --test` でテストします。
外部の依存ライブラリは使いません。

## モジュールの分担

| ファイル | 役割 |
| --- | --- |
| `src/complexity/ast_dump.py` | 標準入力の Python コードを `ast` で読み、木を JSON で出す（拡張機能に同梱） |
| `src/complexity/complexityExpr.js` | 計算量の式（`N² log N` など）の作成・掛け算・足し算・表示・値の計算 |
| `src/complexity/analyzer.js` | AST の JSON から、時間・領域の計算量、行ごとの内訳、警告、入力の読み取りを出す |
| `src/complexity/inputBinding.js` | コードの変数（`n`、`|a|`）と「検証」タブの入力形式の変数（`N`）を対応付け、上限の値を出す |
| `src/complexity/judge.js` | 演算回数と時間制限から判定（余裕 / 厳しい / TLE の恐れ）を出す |
| `src/complexity/measure.js` | 実測のサイズの計画、時間の増え方の当てはめ、静的解析との食い違いの判定 |

VS Code とのやり取り（`src/complexity/complexityController.js`、エディタの装飾、`extension.js`）と画面（`src/verify/verifyWebview.js` の「計算量」欄）は、これらを呼ぶだけにします。

## 共通の約束

- 失敗は例外を投げずに `{ ok: false, message }` で返します。`message` は日本語です。
- 画面とやり取りする値と JSON にする値は、すべて `JSON.stringify` できる形にします（`BigInt` は使わない）。
- 行番号は 1 始まり（Python の `lineno` と同じ）です。

## `ast_dump.py` の出力

標準入力からコードを読み、標準出力に 1 つの JSON を書きます。

```json
{ "ok": true, "tree": { "_type": "Module", "body": [ ... ] } }
{ "ok": false, "line": 3, "col": 7, "message": "invalid syntax" }
```

- 各ノードは `{"_type": "<ast のクラス名>", ...}` です。`lineno`、`col_offset`、`end_lineno`、`end_col_offset` があれば付きます。
- フィールドは `ast.iter_fields` のものをそのまま入れます（`ctx`、`type_comment`、`type_ignores`、`kind` は除く）。
- `2^53` を超える整数は文字列、無限大・NaN は文字列、100 文字を超える文字列は先頭 100 文字です。
- テストでは、`test/pythonRunner.test.js` の `findPython()` と同じく `uv` で Python を探して、このスクリプトを動かします。

## 計算量の式（Complexity）

```js
Complexity = { terms: Term[] }          // 項の和。terms が空なら O(1)
Term = {
  factors: { [symbol]: { pow: number, log: number } },   // 例: n² log n → { n: { pow: 2, log: 1 } }
  exp: string[]                                           // 2^symbol の symbol。ふつうは []
}
```

- `pow` は 0.5（√N）や 1、2、3 など。`log` は 0 以上の整数。`pow: 0, log: 1` は log N です。
- 記号（symbol）はコードの言葉で持ちます。
  - 変数名：`n`、`m`、`k`
  - 集まりの長さ：`|a|`（`len(a)` や `for x in a`）
- 係数は持ちません（計算量の推定なので）。

### `complexityExpr.js` の関数

```js
constant()                       // O(1)
symbolComplexity(symbol, { pow = 1, log = 0 } = {})
logOf(symbol)                    // O(log symbol)
exponential(symbol)              // O(2^symbol)
multiply(a, b)
add(a, b)                        // 支配される項は消す（同じ記号どうしで pow → log の順に比べ、すべての記号で以下なら消す）
substitute(c, symbol, replacement)  // 記号を別の計算量に置き換える（例: 内側の range(i) の i を外側の上限に）
isConstant(c)
formatComplexity(c, { rename = {} } = {})
// => 'O(N² log N)'。rename で記号の表示名を変える（例: { n: 'N', '|a|': 'N' }）。
//    rename に無い記号は、ただの変数名なら大文字（n → N）、|a| はそのまま
formatCount(c, options)          // ループ回数の表示用。'N'、'N log N'、'√N'（O( ) を付けない）
evaluateComplexity(c, values)    // values: { [symbol]: number }。log は 2 を底、最小 1。足りない記号があれば null
classifyGrowth(c, symbol)
// => 'O(1)' | 'O(log N)' | 'O(N)' | 'O(N log N)' | 'O(N²)' | 'O(N³)' | 'other'
//    symbol だけを変数とみなし、ほかの記号は定数として最大の項で分類する（実測との比較用）
```

## `analyzer.js`

```js
analyzeAst(astResult)   // ast_dump.py の出力（パース済みのオブジェクト）
// => {
//   ok: true,
//   time: Complexity,
//   space: Complexity,
//   confidence: 'high' | 'medium' | 'low',
//   lines: [{ line, kind: 'loop' | 'function' | 'recursion' | 'call', label, complexity, note }],
//   warnings: [{ line, message }],
//   inputs: [{ line, targets: string[], kind: 'ints' | 'intList' | 'string' | 'lines' | 'unknown', count: Complexity | null }],
//   symbols: string[]
// }
// | { ok: false, line, message }   // 構文エラーなど
```

- `lines`：画面の内訳とエディタの行の表示に使います。
  - ループの行：`label` は回数（例 `× N`、`× log N`）、`complexity` はその行で1回だけ数える回数です。
  - 関数の行：`label` はその関数1回の計算量（例 `O(N²)`）です。
  - 処理の行（`kind: 'call'`）：ユーザーの関数の呼び出しと、1回で O(1) でない処理（リストへの `in`、`.index()`、`sorted`、スライスなど）がある行です。`complexity` はその行を1回実行したときの計算量（外側のループは掛けない）、`note` は処理の名前です。同じ行の内包表記はループとして別に出し、二重に数えません。
  - エディタの行の表示には `loop`・`function`・`call` を使い、同じ行のものは1つにまとめます。
  - 表示名の変換は画面側で `formatComplexity` / `formatCount` に `rename` を渡して行うので、`label` は対応付けの前の表示で構いません。
- `symbols`：時間・領域の式に出てくる記号の一覧（対応付けに使う）。
- `inputs`：入力を読む文を、読む順に並べたものです。
  - `n = int(input())` → `{ targets: ['n'], kind: 'ints' }`
  - `n, m = map(int, input().split())` → `{ targets: ['n', 'm'], kind: 'ints' }`
  - `a = list(map(int, input().split()))` → `{ targets: ['a'], kind: 'intList' }`
  - `s = input()`、`input().strip()` → `{ targets: ['s'], kind: 'string' }`
  - `g = [input() for _ in range(h)]` → `{ targets: ['g'], kind: 'lines', count: h }`
  - `a = [int(input()) for _ in range(n)]` → `{ targets: ['a'], kind: 'intList', count: n }`
  - `input = sys.stdin.readline` などの別名と `sys.stdin.readline()` も入力として扱います。

### 推定の規則（最初の版）

- **ループの回数**
  - `range(n)` / `range(a, n)` / `range(a, n, k)`（k は定数）→ n。`range(n - 1)`、`range(2 * n)` → n（定数は無視）。`range(n * m)` → n·m。`range(10)` → 定数。
  - `for x in a` → |a|。`range(len(a))` → |a|。
  - 内側のループの上限が外側のループ変数（`range(i)`、`range(i, n)`）→ 外側の上限で置き換える。
  - `i *= 2` / `n //= 2` / `i <<= 1` / `n >>= 1` で進む while → log N。
  - `i * i <= n` の while → √N。
  - 二分探索の形（`while hi - lo > 1` / `while lo < hi` / `while lo <= hi` と `mid`）→ log（範囲の幅）。範囲の幅が分からなければ log N とみなして警告。
  - `while q:` と `popleft()` / `pop()`（BFS・DFS）→ 頂点数。隣接リスト `g` の内側のループはならし計算で辺の数として数え、全体を O(V + E) にします。頂点数・辺の数が分かるとき（`g = [[] for _ in range(n)]` → V = n、辺を足す `for _ in range(m)` → E = m）はその記号を使います。
  - 調和級数（`range(i, n, i)`、`range(j, n + 1, i)` が外側の `i` のループの中）→ 全体で N log N。
  - 上のどれにも当たらない while → N 回とみなし、警告と確からしさ「低」。
- **入れ子**は掛け算、**順に並んだ処理**は足し算として扱い、最後に大きい項だけを残します。`if` / `else` は大きいほうを取ります。
- **関数**：定義した関数を呼ぶと、その関数の計算量を足します（呼び出しがループの中なら掛け算）。
- **再帰**
  - `@lru_cache` / `@cache` 付き → 状態数 × 1回あたりの処理。状態数は引数の範囲の積（分からなければ N）。
  - 引数が半分になる（`n // 2`）→ log N。
  - 引数が 1 減る（`n - 1`）→ N。
  - 1回の中で自分を2回以上呼ぶ（メモ化なし）→ 指数時間（`2^N`）と警告。
- **組み込み関数と標準ライブラリ**

  | 処理 | 計算量 |
  | --- | --- |
  | `sorted` / `.sort()` | N log N |
  | リストへの `in` / `.index()` / `.count()` / `.remove()` / `.insert()` / `.pop(0)` | N |
  | `dict` / `set` の操作、`deque` の両端の操作 | O(1) |
  | `heapq.heappush` / `heappop` | log N |
  | `heapq.heapify` | N |
  | `bisect.*` | log N |
  | `sum` / `max` / `min` / `list(...)` / `sorted` 以外のコピー / スライス / `''.join` / `len` 以外の走査 | N |
  | `len` | O(1) |

  - 引数の集まりが分かればその長さ（`sorted(a)` → |a| log |a|）、分からなければ N とみなして警告します。
  - ループの中で文字列に `+=` すると O(N) になりうるので、警告を出します。
- **領域**：`[0] * n`、内包表記、`list(range(n))` などで作る大きさ、ループの中の `append` の回数、再帰の深さを合計します。入力で読んだリストも数えます。
- **入力の読み取り**（`input().split()`、`map(int, ...)`、`int(...)`）そのものは時間に数えません。
- **確からしさ**：すべてのループを規則で読めれば「高」、N とみなした箇所が1つでもあれば「中」、規則に当たらない while・再帰の推定・分からない集まりがあれば「低」。
- 最初の版でやらないこと：篩の N log log N、部分集合の列挙の 3^N（上界で出して注記）、変数のスコープの区別、クラスのメソッドの型の追跡。

## `inputBinding.js`

```js
bindSymbols({ symbols, inputs }, format, { manual = {} } = {})
// format: 「検証」タブの InputFormat（docs/verify-design.md）。null なら形式なし
// manual: { [symbol]: { formatVar: 'N' } | { value: number } }  画面で選び直した対応
// => {
//   values: { [symbol]: number },            // 上限の値。決まらない記号は入らない
//   bindings: [{ symbol, source: 'name' | 'order' | 'manual', formatVar, value }],
//   unbound: string[],                       // 値が決まらなかった記号
//   rename: { [symbol]: string }             // 表示名（対応した形式の変数名。|a| は長さの式）
// }
formatVariableMaxima(format)
// => { ok: true, values: { [varName]: number } } | { ok: false, message }
//    各変数の上限を、前の変数の上限を使って計算する（src/verify/expression.js を使う）
```

- 対応付けの順番：
  1. `manual` にあるもの
  2. 名前（大文字・小文字を区別しない。`n` ↔ `N`）
  3. 読む順番：`inputs[i]` と、入力形式の `rows[i]` を順に合わせる
     - `ints` の読み取り ↔ `ints` 行：変数を左から対応させる
     - `intList` の読み取り（`a`）↔ `intList` 行：`|a|` を行の `length` に対応させる
     - `string` の読み取り（`s`）↔ `string` 行：`|s|` を `maxLength` に対応させる
     - `lines` の読み取り（`g`）↔ `grid` 行：`|g|` を `rows` に対応させる
- `|a|` の値は、対応した式（`N` など）の上限です。

## `judge.js`

```js
DEFAULT_OPS_PER_SECOND   // { pypy: 3e7, cpython: 1e7 }
detectImplementation(pythonPath, runtimeImplementation = '')   // => 'pypy' | 'cpython'
judgeOperations({ operations, timeoutMs, opsPerSecond })
// => { ratio, verdict: 'safe' | 'tight' | 'tle', label: '余裕' | '厳しい' | 'TLE の恐れ' }
//    ratio = operations / (opsPerSecond * timeoutMs / 1000)。0.3 以下 safe、1.0 以下 tight、それより大きい tle
formatOperations(operations)   // => '4×10^10'（有効数字1桁）、1000 未満はそのまま
opsPerSecondFromMeasurement(points, operationsAt)
// points: 実測の [{ n, seconds }]、operationsAt(point) => その入力の推定演算回数
// => number | null  いちばん大きいサイズの点から「1秒あたりの演算回数」を出す（時間が短すぎる点は使わない）
```

## `measure.js`

```js
MEASURE_SCALES   // [1 / 64, 1 / 16, 1 / 4, 1]
planMeasurement(format)
// => { ok: true, primaryVar, primaryMax, steps: [{ scale, sizeCap }] } | { ok: false, message }
//    サイズ変数（inputFormat.getSizeVariables）の上限の最大値を primaryMax とし、
//    sizeCap = max(1, floor(primaryMax * scale)) で inputGenerator の mode: 'max' に渡す
fitGrowth(points)
// points: [{ n, seconds }]（起動時間を引いた後の時間）
// => { model: 'O(1)' | 'O(log N)' | 'O(N)' | 'O(N log N)' | 'O(N²)' | 'O(N³)', confidence: 'high' | 'low' }
//    点が2つ未満、または時間がすべて短すぎて差が分からないときは confidence 'low'
compareModels(measuredModel, staticModel)
// => { mismatch: boolean, message }  staticModel は classifyGrowth の結果。'other' は比べない
runMeasurement({ format, runMain, runBaseline, generate, timeoutMs, isCancelled, onProgress })
// runMain(input) / runBaseline() => Promise<RunResult>（runPythonFile の結果の一部）
// 各サイズで3回動かして最小の時間を使い、何もしないプログラムの時間（runBaseline、3回の最小）を引く。
// 時間切れになったサイズより大きいサイズは測らない。
// => { ok: true, points: [{ scale, n, seconds, timedOut }], baselineSeconds, fit, stoppedAtScale } | { ok: false, message }
```
