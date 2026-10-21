# 「検証」タブの設計（開発者向け）

Issue #8（「検証」タブとストレステスト）の内部設計です。
画面と切り離したモジュールは `src/verify/` に置き、`node --test` でテストします。
外部の依存ライブラリは使いません。

## モジュールの分担

| ファイル | 役割 |
| --- | --- |
| `src/verify/expression.js` | 数値（`2×10^5` など）と式（`N`、`N-1`）の読み取りと計算 |
| `src/verify/inputFormat.js` | 入力形式の初期値、正規化、誤りの検出 |
| `src/verify/inputGenerator.js` | 乱数（シード付き）と、入力形式からの入力の生成 |
| `src/verify/outputCompare.js` | 出力の比べ方（3種類） |
| `src/verify/verifyFile.js` | `a.piyoyo.json` の場所、読み書き、反例の追加と削除 |
| `src/verify/stressRunner.js` | ストレステストの進め方（回ごとのサイズ、止める条件） |
| `src/verify/problemParser.js` | 問題文（貼り付け・atcoder.jp の HTML）から入力形式を読み取る |

画面（`src/webviewHtml.js` と `src/verify/verifyWebview.js`）と VS Code とのやり取り（`extension.js`）は、これらを呼ぶだけにします。

## 共通の約束

- 失敗は例外を投げずに `{ ok: false, message }` で返します。`message` は日本語です。
- 整数の値は内部では `BigInt` で扱います（`10^18` を正確に扱うため）。
  JSON に書く値と、画面とのやり取りの値は**必ず文字列**にします（`JSON.stringify` は `BigInt` を扱えないため）。
- 個数・長さ（サイズ）は JavaScript の `Number` に直して使います。

## 式（Expr）

入力形式の範囲・個数・長さは、すべて文字列の式で持ちます。前後と途中の空白は無視します。

- **整数の数値**：先頭に `-` を付けられます。
  - `200000`
  - `2×10^5`、`2*10^5`、`2 \times 10^5`（`×` の前は小数でもよい。例：`1.5×10^5`）
  - `10^9`
  - `2e5`、`1.5e5`
  - 計算した結果が整数にならないもの（`1.5`、`1e-3`）は誤りです。
- **変数**：`[A-Za-z][A-Za-z0-9_]*`。後ろに `+整数` か `-整数` を1つだけ付けられます（`N-1`、`N+1`）。
- それ以外（`2N`、`N*M`、`N(N-1)/2`）は最初の版では誤りです。

## 入力形式（InputFormat）

```js
InputFormat = { rows: Row[] }
```

すべての行に共通の項目：

| 項目 | 型 | 内容 |
| --- | --- | --- |
| `kind` | `'ints' \| 'intList' \| 'matrix' \| 'string' \| 'grid'` | 行の種類 |
| `needsReview` | boolean（省略時 `false`） | 問題文からの読み取りに自信がない行 |
| `reviewReason` | string（省略時 `''`） | 要確認の理由（日本語） |

種類ごとの項目：

| kind | 項目 | 出力の形 |
| --- | --- | --- |
| `ints` | `vars: [{ name, min, max }]` | 1行に空白区切りで並べる |
| `intList` | `name`, `length`, `min`, `max`, `layout: 'row' \| 'column'`, `distinct: boolean`, `order` | `row` は1行に空白区切り、`column` は1行に1個 |
| `matrix` | `name`, `rows`, `cols`, `min`, `max` | `rows` 行、各行に `cols` 個を空白区切り |
| `string` | `name`, `minLength`, `maxLength`, `charset`, `chars` | 1行 |
| `grid` | `name`, `rows`, `minCols`, `cols`, `charset`, `chars`, `distinct` | `rows` 行の文字列。各行の長さは `minCols`〜`cols` から行ごとに選ぶ |

- `name`・`min`・`max`・`length`・`rows`・`cols`・`minLength`・`maxLength` は文字列の式です。
- `order`：`'none' | 'asc' | 'desc' | 'strictAsc' | 'strictDesc'`。`strictAsc` と `strictDesc` は、すべて異なることも意味します。
- `charset`：`'lower' | 'upper' | 'digit' | 'custom'`。`custom` のときだけ `chars`（使う文字。例 `.#`）を使います。
- `string` の `minLength` が空文字列のときは `maxLength` と同じ（長さが固定）とみなします。
- `grid`（画面の名前は「H 行の文字列」）の `minCols` が空文字列のとき、または項目がないとき（前の版のファイル）は `cols` と同じで、すべての行が同じ長さ（グリッド）になります。`minCols` があれば、行ごとに `minCols`〜`cols` の長さをランダムに選びます（`mode: 'max'` ではすべて `cols`）。
- `grid` の `distinct` が `true` なら、すべての行が異なる文字列になります。省略時は `false` です。作れる文字列の種類（長さの範囲と文字の種類から数える）が行数より少ないときは、`sizeCap` で縮めた長さの範囲を元の範囲の中で広げ、それでも足りなければ `{ ok: false }` です。

### 変数の決まり

- 変数を定義できるのは `ints` 行の `vars` だけです。ほかの行の `name` は表示用の名前で、式からは参照できません。
- 式から参照できるのは、**それより前の行**か、**同じ `ints` 行の左側**で定義した変数だけです。
- 名前は、すべての行（`vars` の名前と各行の `name`）を通して重複できません。
- **サイズ変数**：`length`・`rows`・`minCols`・`cols`・`minLength`・`maxLength` の式から参照される変数です。生成のときのサイズの上限（`sizeCap`）は、サイズ変数と文字列の長さにだけかかります。

### 例

```json
{
  "rows": [
    { "kind": "ints", "vars": [
      { "name": "N", "min": "1", "max": "2×10^5" },
      { "name": "M", "min": "1", "max": "N" }
    ] },
    { "kind": "intList", "name": "A", "length": "N", "min": "1", "max": "10^9",
      "layout": "row", "distinct": false, "order": "none" },
    { "kind": "string", "name": "S", "minLength": "", "maxLength": "M",
      "charset": "lower", "chars": "" }
  ]
}
```

この形式から作る入力の例：

```text
3 2
5 1 4
ab
```

## 保存ファイル（`a.piyoyo.json`）

本番のファイル `a.py` の隣に置きます。部員どうしで共有できるよう、PC 内の絶対パスは書きません。

```json
{
  "version": 1,
  "format": { "rows": [] },
  "naivePath": "a_naive.py",
  "useNaive": true,
  "compareMode": "tokens",
  "iterations": 100,
  "counterexamples": [
    {
      "id": "ce-1760000000000-1",
      "kind": "mismatch",
      "input": "3 2\n5 1 4\nab\n",
      "expected": "10\n",
      "seed": 12345,
      "createdAt": "2026-10-19T12:00:00.000Z"
    }
  ]
}
```

- `naivePath`：本番のファイルのフォルダから見た相対パス（区切りは `/`）。空なら `<名前>_naive.py` です。
- `useNaive`：愚直解のファイルがあるときに、それと出力を比べるかどうか（省略時 `true`）。`false` なら愚直解があっても本番の解だけを動かします。
- `compareMode`：`'tokens'`（空白区切り、既定）、`'exact'`（完全一致）、`'float'`（小数の誤差を許す）。
- `counterexamples[].kind`：`'mismatch'`（出力が違う）、`'mainError'`（本番の実行時エラー）、`'mainTimeout'`（本番の時間切れ）。
- `counterexamples[].expected`：愚直解の出力。愚直解がまだないときに見つけた実行時エラー・時間切れの反例では `null` です。「期待する出力を作り直す」で後から入ります。
- 反例として保存するのは、愚直解と比べる回（小さい入力）で見つけたものだけです。最大サイズの回の失敗は、シード値を画面に出すだけにします（入力が大きく、ファイルが膨らむため）。

## 関数の約束

### `expression.js`

```js
parseIntegerLiteral(text) // => BigInt | null
parseExpr(text)
// => { ok: true, expr: { type: 'literal', value: BigInt } }
//  | { ok: true, expr: { type: 'var', name: string, offset: BigInt } }
//  | { ok: false, message }
evaluateExpr(text, env) // env: { [name]: BigInt }
// => { ok: true, value: BigInt } | { ok: false, message }
```

### `inputFormat.js`

```js
ROW_KINDS        // ['ints', 'intList', 'matrix', 'string', 'grid']
createRow(kind, existingNames = [])
// => 初期値の行。名前は existingNames と重ならないものを選ぶ（N, M, K, ... / A, B, ... / S, T, ...）
normalizeFormat(raw)
// => { format, warnings: string[] }  読み込んだ JSON を安全な形に直す（知らない kind の行は捨てて warning）
validateFormat(format)
// => { ok: boolean, errors: [{ rowIndex, path, message }] }
//    path は行の中の場所。例: 'length', 'max', 'vars.1.max', 'chars'
getSizeVariables(format) // => Set<string>
```

### `inputGenerator.js`

```js
createRng(seed) // seed: 0〜2^32-1 の整数。同じ seed なら同じ並び
// rng.nextUint32() => number
// rng.int(lo, hi)  => BigInt（lo, hi は BigInt、両端を含む）
// rng.chance(p)    => boolean
generateInput(format, {
  seed,                 // 必須
  mode = 'random',      // 'random' | 'max'
  sizeCap = null,       // number | null
  valueCap = null,      // number | null
  boundaryRate = 0      // 0〜1
})
// => { ok: true, input: string, values: { [varName]: string } }
//  | { ok: false, message }
generateExample(format) // 画面の「入力の例」用。決まったシードで小さめに作る
```

- `mode: 'max'`：サイズ変数と文字列の長さを最大にします。ほかの値は範囲全体から選びます。
- `sizeCap`：サイズ変数と文字列の長さの上限を `min(元の上限, max(元の下限, sizeCap))` にします。
- `valueCap`：要素の値とサイズ変数以外の変数を、小さい窓に絞ります。
  - 範囲が 0 を含むなら `[max(lo, -valueCap), min(hi, valueCap)]`
  - `lo > 0` なら `[lo, min(hi, lo + valueCap)]`
  - `hi < 0` なら `[max(lo, hi - valueCap), hi]`
  - すべて異なる値が必要で窓が狭すぎるときは、元の範囲の中で窓を広げます。元の範囲でも足りなければ `{ ok: false }` です。
- `boundaryRate`：その割合で、境界の値（最小値・最大値・すべて同じ値）を使います。
- 作った入力は最後が改行で終わります。2,000 万文字を超えそうなら `{ ok: false }` を返します。

### `outputCompare.js`

```js
COMPARE_MODES // ['tokens', 'exact', 'float']
compareOutputs(expected, actual, mode)
// => { equal: boolean, expectedDiffLines: number[], actualDiffLines: number[] }
//    DiffLines は 0 始まりの行番号。equal が true なら両方とも空配列
```

- 改行コードは比べる前に `\n` にそろえます。
- `tokens`：空白・改行で区切った単語の並びが同じなら一致。
- `exact`：末尾の改行を除いて、文字列が完全に同じなら一致。
- `float`：単語ごとに比べ、両方が整数の形なら整数として同じか、どちらかが小数なら絶対誤差か相対誤差が `1e-6` 以下なら一致。数値でない単語は文字列として比べます。

### `verifyFile.js`

```js
VERIFY_FILE_VERSION // 1
getVerifyFilePath(pyFilePath)              // 'dir/a.py' => 'dir/a.piyoyo.json'
getDefaultNaivePath(pyFilePath)            // => 'dir/a_naive.py'
resolveNaivePath(pyFilePath, naivePath)    // 相対パスを絶対パスに。空なら既定
toRelativeNaivePath(pyFilePath, absPath)   // 区切りは '/'
createEmptyVerifyData()
parseVerifyFile(text)
// => { ok: true, data, warnings } | { ok: false, message }
//    format は形（rows が配列か）だけ確かめ、中身の正規化は normalizeFormat に任せる
serializeVerifyFile(data)                  // 2 スペース字下げの JSON + '\n'
addCounterexample(data, counterexample)    // 新しい data を返す。同じ input は重ねない。最大 50 件
removeCounterexample(data, id)
```

### `stressRunner.js`

```js
deriveCaseSeed(seed, iteration)            // => 0〜2^32-1
getStressPlan(iteration, totalIterations)
// => { mode: 'compare' | 'max', sizeCap, valueCap, boundaryRate }
runStressTest({
  format, iterations, seed, compareMode,
  runMain, runNaive,                       // (input) => Promise<RunResult>
  generate = generateInput,
  compare = compareOutputs,
  isCancelled = () => false,
  onProgress = () => {}
}) // => Promise<StressResult>
```

- `runNaive` は省略できます（`null`）。そのときはすべての回で本番の解だけを動かし、`'mainError'` と `'mainTimeout'` だけで止まります。愚直解をすぐに書けないときでも、まず本番の解のエラーと時間切れを確かめられるようにするためです。
- `RunResult` は `runPythonFile` の結果の一部です：`{ stdout, stderr, exitCode, timedOut, outputLimitExceeded, errorMessage, elapsedMs }`。
- 回ごとの計画：
  - 10 回に 1 回（`iteration % 10 === 9`）は `max`。本番の解だけを動かします。
  - 愚直解がないとき（`runNaive` なし）は、比べる相手がいないので、5 回に 1 回（`iteration % 5 === 4`）を `max` にして時間切れを見つけやすくします。`getStressPlan(iteration, total, { maxEvery = 10 } = {})` の `maxEvery` で切り替えます。
  - それ以外は `compare`。最初の 30% の回は `sizeCap ≤ 8`、`valueCap ≤ 10` にし、回が進むほど大きくします（`sizeCap` は最大 20、終盤の `valueCap` は `null`）。愚直解は全探索などで遅いことが多く、サイズを大きくしすぎると愚直解の時間切れで止まってしまうためです。
  - `boundaryRate` は 0.2 です。
- 止める条件と `status`：
  - `'mainTimeout'`：本番の時間切れ
  - `'mainError'`：本番の実行時エラー（終了コードが 0 以外、出力の上限、起動の失敗）
  - `'naiveError'`：愚直解のエラーか時間切れ（`compare` の回だけ）
  - `'mismatch'`：出力が違う
  - `'generatorError'`：入力を作れない
  - `'cancelled'`：中止された
  - `'passed'`：すべて通った
- `compare` の回で本番がエラーになったときも、愚直解を動かして期待する出力を残します。
- `StressResult`：`{ status, iteration, iterationsRun, seed, caseSeed, mode, input, mainResult, naiveResult, comparison, message }`
