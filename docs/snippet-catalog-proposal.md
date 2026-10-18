# Piyoyo スニペットカタログ再設計案

> この文書は初期カタログの設計記録です。現在の収録内容は `src/snippetLibrary.js` を参照してください。BFS・ヒープや長い処理のテンプレートは、短い操作を中心にする方針で収録対象から外しました。

## 1. 目的と前提

この案は作者が手元で使っている競技プログラミング用のメモ（`カンペ.py`）を実際に読み、そこに書かれた操作を漏れなく棚卸ししたうえで、Piyoyo の既存29件を残しながら初心者向けに整理し直す提案である。

- この文書ではカタログと表示方法だけを提案し、JS実装は変更しない。
- 既存29件のIDは維持する。
- 同じ式が複数の節に登場する場合は、スニペットを重複登録せず、1件へ統合する。
- 一覧には短い `summary` とコードだけを表示する。
- `description`、`input`、`returns`、`precondition` はカードのホバー時とキーボードフォーカス時に表示する。
- import は初心者が短く使える `from ... import ...` を優先する。
- カテゴリは `<select>` で1つを選ぶ形式ではなく、カテゴリごとの `<details><summary>` で開閉する。

## 2. 表示UI案

難易度順にカテゴリを縦に並べ、各カテゴリを独立したドロップダウン（折りたたみ）として表示する。

```text
▼ 1. 入力（15）
  1行を整数で読む               int(input())
  1行の整数列をリストにする     list(map(int, input().split()))

▶ 2. 出力（4）
▶ 3. 数値・型変換（15）
▶ 4. 文字列（9）
...
```

提案する挙動は次のとおり。

- 初回表示では「入力」だけを開き、ほかは閉じる。
- 複数カテゴリを同時に開けるようにする。別カテゴリを開いたとき、既に開いているカテゴリは閉じない。
- カテゴリ見出しに件数を表示する。
- 各行は `summary` とコードプレビューだけにして高さを抑える。
- 詳細はホバーだけでなく、Tabキーで行へフォーカスした場合にも表示する。
- スニペットをクリックしたときだけ挿入する。カテゴリ見出しのクリックでは挿入しない。

## 3. 難易度順のカテゴリ案

| category | 表示名 | 順位 | 内容 |
|---|---|---:|---|
| `input` | 入力 | 1 | 1行、空白区切り、複数行、入力時の整形 |
| `output` | 出力 | 2 | 1値、固定文字列、複数値、リストの出力 |
| `number-conversion` | 数値・型変換 | 3 | 四則的な操作、最大・最小、GCD/LCM、型変換 |
| `string` | 文字列 | 4 | 文字の取得、検索、反転、大文字小文字、置換 |
| `list-comprehension` | リスト・内包表記 | 5 | リストの検索・整列、内包表記、二次元配列 |
| `condition-check` | 条件分岐・文字判定 | 6 | if/else、範囲判定、文字種判定 |
| `aggregation` | 集計・辞書 | 7 | Counter、defaultdict、個数の更新 |
| `prefix-sum` | 累積和 | 8 | 累積和の作成、半開区間の合計 |
| `brute-force` | 全探索 | 9 | 組み合わせ、順列 |
| `binary-search` | 二分探索 | 10 | bisect、区間個数、学習用 lower_bound |
| `queue-heap` | キュー・ヒープ | 11 | deque、最小ヒープ |
| `bfs-graph` | BFS・グラフ | 12 | BFSによる最短距離 |
| `debug` | デバッグ・型確認 | 13 | type、isinstance |

## 4. `カンペ.py` の漏れなし棚卸し

「扱い」は、`既存` が既存29件で収録済み、`追加` が新しい候補、`統合` が別の行と同じ候補へまとめる、`説明へ統合` が独立カードを増やさず既存項目の詳細へ含める、を表す。

| 元の節 | 記載内容 | 扱い | 対応IDまたは理由 |
|---|---|---|---|
| 入力 | `int(input())` | 既存 | `basic-int` |
| 入力 | `map(int, input().split())` | 既存 | `split-map-int` |
| 入力 | `list(map(int, input().split()))` | 既存 | `split-int-list` |
| 入力 | `input()` | 既存 | `basic-string` |
| 入力 | `input().split()` | 既存 | `split-strings` |
| 数の操作 | `abs(x)` | 追加 | `number-abs` |
| 数の操作 | `max(a, b)` | 追加 | `number-max-two` |
| 数の操作 | `min(a, b)` | 追加 | `number-min-two` |
| 数の操作 | `sum(A)` | 追加 | `list-sum`。リスト節の同じ行もここへ統合 |
| 数の操作 | `len(A)` | 追加 | `sequence-length`。文字列節・リスト節の `len` もここへ統合 |
| 数の操作 | `a // b` | 追加 | `number-floor-division`。負数では0方向ではなく負の無限大方向へ丸める点を説明する |
| 数の操作 | `a % b` | 追加 | `number-remainder` |
| 数の操作 | `gcd(a, b)` | 既存 | `math-gcd` |
| 数の操作 | `lcm(a, b)` | 追加 | `math-lcm` |
| 文字列 | `s[0]` / `s[-1]` | 追加 | `string-first` / `string-last` |
| 文字列 | `s.count("a")` | 追加 | `string-count` |
| 文字列 | `"a" in s` | 追加 | `string-contains` |
| 文字列 | `s[::-1]` | 追加 | `string-reverse` |
| 文字列 | `s.lower()` / `s.upper()` | 追加 | `string-lower` / `string-upper` |
| 文字列 | `s.replace("a", "b")` | 追加 | `string-replace` |
| リスト | `max(A)` / `min(A)` | 追加 | `list-max` / `list-min` |
| リスト | `x in A` / `A.count(x)` | 追加 | `list-contains` / `list-count` |
| リスト | `A.sort()` / `A.sort(reverse=True)` | 追加 | `list-sort-ascending` / `list-sort-descending` |
| リスト | `Counter(A)` | 既存 | `aggregation-counter` |
| リスト | `cnt[x]` | 追加 | `aggregation-counter-value` |
| リスト | `defaultdict(int)` | 既存 | `aggregation-defaultdict-int` |
| リスト | `d[x] += 1` | 追加 | `aggregation-increment` |
| リスト | `deque()` | 追加 | `queue-deque-empty`。始点入りの `queue-deque` も残す |
| リスト | `q.append(x)` / `q.popleft()` | 追加 | `queue-append` / `queue-popleft` |
| 累積和 | `[0] + list(accumulate(A))` | 既存へ統合 | `aggregation-accumulate` を `prefix-sum-build` 相当として累積和カテゴリへ移す。既存IDは変えない |
| 累積和 | `cum[r] - cum[l]` | 追加 | `prefix-sum-range` |
| 全探索 | `combinations(A, r)` | 追加 | `brute-combinations` |
| 全探索 | `permutations(A)` | 追加 | `brute-permutations` |
| 優先度付きキュー | `heapq.heappush(q, x)` / `heapq.heappop(q)` | 既存 | `heap-heappush` / `heap-heappop`。importだけ `from heapq import ...` を維持 |
| 内包表記 | `[i for i in range(n)]` | 追加 | `comprehension-range` |
| 内包表記 | `[i * i for i in range(n)]` | 追加 | `comprehension-squares` |
| 内包表記 | `[x for x in A if x % 2 == 0]` | 追加 | `comprehension-even-filter` |
| 内包表記 | `[[0] * w for _ in range(h)]` | 追加 | `comprehension-zero-matrix` |
| 二分探索 | `bisect_left(A, x)` / `bisect_right(A, x)` | 既存 | `binary-bisect-left` / `binary-bisect-right` |
| 二分探索 | 自作 `lower_bound` | 追加 | `binary-lower-bound-function`。標準ライブラリ版との重複を明示し、学習用として下へ置く |
| 二分探索 | `bisect_right(a, A) - bisect_left(a, B)` | 追加 | `binary-count-closed-interval`。`B <= 値 <= A` の個数 |
| 出力 | `print(x)` / `print("Yes")` / `print(a, b)` / `print(*A)` | 追加 | 出力4件 |
| 条件分岐 | 偶数ならEven、そうでなければOdd | 追加 | `condition-even-odd` |
| 条件分岐 | `a <= x <= b` ならYes | 追加 | `condition-inclusive-range` |
| 文字種判定 | `isdigit` / `isalpha` / `isalnum` / `islower` / `isupper` / `isspace` | 追加 | 文字判定6件。`isdigit` の負数・小数の注意も保持 |
| 型変換 | `int(s)` / `float(s)` / `str(x)` | 追加 | 型変換3件 |
| 型変換 | `list(map(int, s))` | 追加 | `conversion-digit-list` |
| 型確認 | `type(x)` / `isinstance(x, int)` / `isinstance(s, str)` | 追加 | デバッグ3件 |

## 5. 既存29件の維持・再配置案

ID、body、imports、詳細メタデータは原則そのまま維持し、カテゴリと表示順だけを次のように整理する。`summary` は一覧で一読できる現在の短文を維持する。

| 表示順 | id | 新category | summary | 備考 |
|---:|---|---|---|---|
| 100 | `basic-string` | `input` | 1行を文字列で読む | 既存維持 |
| 110 | `basic-int` | `input` | 1行を整数で読む | 既存維持 |
| 120 | `basic-float` | `input` | 1行を小数で読む | 既存維持 |
| 130 | `basic-chars` | `input` | 文字列を1文字ずつに分ける | 既存維持 |
| 140 | `split-strings` | `input` | 1行の文字列を空白で分ける | 既存維持 |
| 150 | `split-map-int` | `input` | 1行の整数列をmapにする | 既存維持 |
| 160 | `split-int-list` | `input` | 1行の整数列をリストにする | 既存維持 |
| 170 | `split-float-list` | `input` | 1行の小数列をリストにする | 既存維持 |
| 180 | `multiline-strings` | `input` | n行の文字列をリストにする | 既存維持 |
| 190 | `multiline-ints` | `input` | n行の整数をリストにする | 既存維持 |
| 200 | `multiline-int-matrix` | `input` | n行の整数列を二次元リストにする | 既存維持 |
| 210 | `multiline-char-grid` | `input` | n行の文字列を文字グリッドにする | 既存維持 |
| 220 | `convenient-sorted-ints` | `input` | 整数列を昇順に並べて読む | 既存維持 |
| 230 | `convenient-int-set` | `input` | 整数列を重複のない集合で読む | 既存維持 |
| 240 | `convenient-indexed-ints` | `input` | 整数列の先頭に0を加えて読む | 既存維持 |
| 450 | `math-gcd` | `number-conversion` | a（整数）とb（整数）の最大公約数 | 既存維持。変数表記を小文字に統一 |
| 470 | `math-isqrt` | `number-conversion` | n（0以上の整数）の平方根の整数部分 | 既存維持 |
| 480 | `math-prime` | `number-conversion` | n（整数）が素数か判定 | 既存維持 |
| 900 | `aggregation-counter` | `aggregation` | リストAの要素の出現回数を数える | 既存維持 |
| 920 | `aggregation-defaultdict-int` | `aggregation` | 未登録キーを0とする辞書を作る | 既存維持 |
| 940 | `aggregation-defaultdict-list` | `aggregation` | 未登録キーを空リストとする辞書を作る | 既存維持 |
| 1000 | `aggregation-accumulate` | `prefix-sum` | リストAの累積和を作る | 既存IDを維持しカテゴリだけ移動 |
| 1200 | `binary-bisect-left` | `binary-search` | 昇順リストAでx以上の左端を探す | 既存維持 |
| 1210 | `binary-bisect-right` | `binary-search` | 昇順リストAでxより大きい左端を探す | 既存維持 |
| 1300 | `queue-deque` | `queue-heap` | startを入れたキューを作る | 既存維持 |
| 1340 | `heap-heapify` | `queue-heap` | リストhを最小ヒープにする | 既存維持 |
| 1350 | `heap-heappush` | `queue-heap` | ヒープhにxを追加する | 既存維持 |
| 1360 | `heap-heappop` | `queue-heap` | ヒープhから最小要素を取り出す | 既存維持 |
| 1400 | `bfs-graph-distance` | `bfs-graph` | startから各頂点までの距離を求める | 既存維持 |

## 6. `カンペ.py` 由来の追加候補

以下は追加候補55件である。すべて共通メタデータ `id`、`category`、`summary`、`description`、`input`、`returns`、`precondition`、`body`、`imports`、`order` を持つ。`precondition: なし` と `imports: なし` も明示する。

### 6.1 出力

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 300 | `output-value` | xを1行で出力 | 1つの値を標準出力へ表示します。 | 出力したい値x | 戻り値はNone。xと改行を出力 | なし | `print(${1:x})` | なし |
| 310 | `output-text` | 固定文字列を1行で出力 | Yesなどの決まった文字列を表示します。 | 出力したい文字列 | 戻り値はNone。文字列と改行を出力 | なし | `print("${1:Yes}")` | なし |
| 320 | `output-two-values` | aとbを空白区切りで出力 | 2つの値を空白で区切って表示します。 | 値a、値b | 戻り値はNone。aとbと改行を出力 | なし | `print(${1:a}, ${2:b})` | なし |
| 330 | `output-unpack-list` | リストAを空白区切りで出力 | リストの要素を展開して空白区切りで表示します。 | リストA | 戻り値はNone。各要素と改行を出力 | Aが展開可能であること | `print(*${1:A})` | なし |

### 6.2 数値・型変換

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 400 | `number-abs` | x（数）の絶対値 | 0からの距離にあたる絶対値を求めます。 | 数x | xの絶対値 | なし | `abs(${1:x})` | なし |
| 410 | `number-max-two` | aとbの大きい方 | 2つの値を比較して大きい方を求めます。 | 比較可能な値a、b | aとbの大きい方 | aとbを比較できること | `max(${1:a}, ${2:b})` | なし |
| 420 | `number-min-two` | aとbの小さい方 | 2つの値を比較して小さい方を求めます。 | 比較可能な値a、b | aとbの小さい方 | aとbを比較できること | `min(${1:a}, ${2:b})` | なし |
| 430 | `number-floor-division` | a÷bの整数商 | aをbで割り、負の無限大方向へ丸めた商を求めます。 | 数a、0でない数b | `a // b` の商 | bは0以外。負数では単純な0方向切り捨てではない | `${1:a} // ${2:b}` | なし |
| 440 | `number-remainder` | a÷bの余り | aをbで割った余りを求めます。 | 数a、0でない数b | `a % b` の余り | bは0以外 | `${1:a} % ${2:b}` | なし |
| 460 | `math-lcm` | a（整数）とb（整数）の最小公倍数 | 2つの整数の最小公倍数を求めます。 | 整数a、整数b | aとbの最小公倍数 | なし | `lcm(${1:a}, ${2:b})` | `from math import lcm` |
| 500 | `conversion-int` | 文字列sを整数へ変換 | 整数を表す文字列をint型へ変換します。 | 文字列s | int型の整数 | sが整数として解釈できること | `int(${1:s})` | なし |
| 510 | `conversion-float` | 文字列sを小数へ変換 | 数を表す文字列をfloat型へ変換します。 | 文字列s | float型の数 | sがfloatとして解釈できること | `float(${1:s})` | なし |
| 520 | `conversion-str` | 値xを文字列へ変換 | 数値などの値を表示用の文字列へ変換します。 | 値x | str型の文字列 | なし | `str(${1:x})` | なし |
| 530 | `conversion-digit-list` | 数字文字列sを各桁の整数リストへ変換 | 例として314を `[3, 1, 4]` に分けます。 | 数字だけからなる文字列s | 各文字を整数にしたリスト | 符号、小数点、空白を含まない数字文字列であること | `list(map(int, ${1:s}))` | なし |

### 6.3 文字列

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 600 | `sequence-length` | 文字列またはリストaの長さ | 要素数や文字数を求めます。 | 長さを持つ値a | aの要素数 | aがlenに対応していること | `len(${1:a})` | なし |
| 610 | `string-first` | 文字列sの先頭文字 | 文字列の先頭1文字を取り出します。 | 文字列s | 先頭の1文字 | sが空文字列でないこと | `${1:s}[0]` | なし |
| 620 | `string-last` | 文字列sの末尾文字 | 文字列の末尾1文字を取り出します。 | 文字列s | 末尾の1文字 | sが空文字列でないこと | `${1:s}[-1]` | なし |
| 630 | `string-count` | 文字列sに含まれる文字tの個数 | 指定した文字列が何回現れるか数えます。 | 文字列s、数えたい文字列t | 重ならない出現回数 | なし | `${1:s}.count("${2:a}")` | なし |
| 640 | `string-contains` | 文字列sに文字列tが含まれるか判定 | 部分文字列が含まれるか調べます。 | 文字列s、探す文字列t | 含まれればTrue、なければFalse | なし | `"${2:a}" in ${1:s}` | なし |
| 650 | `string-reverse` | 文字列sを逆順にする | スライスを使って文字列の順番を逆にします。 | 文字列s | 逆順の新しい文字列 | なし | `${1:s}[::-1]` | なし |
| 660 | `string-lower` | 文字列sの英字を小文字にする | 英字の大文字を小文字へ変換します。 | 文字列s | 変換後の新しい文字列 | なし | `${1:s}.lower()` | なし |
| 670 | `string-upper` | 文字列sの英字を大文字にする | 英字の小文字を大文字へ変換します。 | 文字列s | 変換後の新しい文字列 | なし | `${1:s}.upper()` | なし |
| 680 | `string-replace` | 文字列sのoldをnewへ置換 | 一致する部分文字列をすべて置き換えます。 | 文字列s、置換前old、置換後new | 置換後の新しい文字列 | 元のs自体は変更されない | `${1:s}.replace("${2:a}", "${3:b}")` | なし |

### 6.4 リスト・内包表記

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 700 | `list-max` | リストAの最大値 | リストで最も大きい要素を求めます。 | 比較可能な要素を持つリストA | Aの最大要素 | Aが空でなく、要素同士を比較できること | `max(${1:A})` | なし |
| 710 | `list-min` | リストAの最小値 | リストで最も小さい要素を求めます。 | 比較可能な要素を持つリストA | Aの最小要素 | Aが空でなく、要素同士を比較できること | `min(${1:A})` | なし |
| 720 | `list-sum` | 数値リストAの合計 | リスト内の数をすべて足します。 | 数値リストA | 全要素の合計。空なら0 | 要素を加算できること | `sum(${1:A})` | なし |
| 730 | `list-contains` | リストAにxが含まれるか判定 | 指定した値がリストにあるか調べます。 | リストA、探す値x | 含まれればTrue、なければFalse | なし | `${2:x} in ${1:A}` | なし |
| 740 | `list-count` | リストAにあるxの個数 | 指定した値と等しい要素を数えます。 | リストA、数える値x | xの出現回数 | なし | `${1:A}.count(${2:x})` | なし |
| 750 | `list-sort-ascending` | リストAを昇順に並べ替える | A自身を小さい順に変更します。 | リストA | 戻り値はNone。A自身を変更 | 要素同士を比較できること | `${1:A}.sort()` | なし |
| 760 | `list-sort-descending` | リストAを降順に並べ替える | A自身を大きい順に変更します。 | リストA | 戻り値はNone。A自身を変更 | 要素同士を比較できること | `${1:A}.sort(reverse=True)` | なし |
| 770 | `comprehension-range` | 0以上n未満の整数リスト | rangeの各整数をリストにします。 | 0以上の整数n | `[0, 1, ..., n-1]` | nは整数 | `[i for i in range(${1:n})]` | なし |
| 780 | `comprehension-squares` | 0以上n未満の整数の二乗リスト | 0からn-1までをそれぞれ二乗します。 | 0以上の整数n | 各iの `i * i` を持つリスト | nは整数 | `[i * i for i in range(${1:n})]` | なし |
| 790 | `comprehension-even-filter` | リストAから偶数だけ取り出す | 条件を満たす要素だけで新しいリストを作ります。 | 整数リストA | A内の偶数だけを順番どおり持つリスト | 各要素で `% 2` を計算できること | `[x for x in ${1:A} if x % 2 == 0]` | なし |
| 800 | `comprehension-zero-matrix` | h行w列の0の二次元リスト | 各行が独立した二次元リストを作ります。 | 行数h、列数w | h行w列の0のリスト | hとwは0以上の整数 | `[[0] * ${2:w} for _ in range(${1:h})]` | なし |

### 6.5 条件分岐・文字判定

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 810 | `condition-even-odd` | xが偶数か奇数かで分岐 | 2で割った余りを使ってEvenまたはOddを出力します。 | 整数x | 戻り値はNone。EvenまたはOddを出力 | xが整数であること | `if ${1:x} % 2 == 0:\n    print("Even")\nelse:\n    print("Odd")` | なし |
| 820 | `condition-inclusive-range` | xがa以上b以下か判定 | Pythonの連鎖比較で閉区間内か調べます。 | 下限a、値x、上限b | 戻り値はNone。範囲内ならYes、外ならNoを出力 | a、x、bを比較できること | `if ${1:a} <= ${2:x} <= ${3:b}:\n    print("Yes")\nelse:\n    print("No")` | なし |
| 830 | `string-isdigit` | 文字列sが数字だけか判定 | すべての文字が数字か調べます。 | 文字列s | 数字だけで空でなければTrue | `-12` と `12.5` は符号や小数点を含むためFalse | `${1:s}.isdigit()` | なし |
| 840 | `string-isalpha` | 文字列sが文字だけか判定 | すべての文字がアルファベットなどの文字か調べます。 | 文字列s | 文字だけで空でなければTrue | なし | `${1:s}.isalpha()` | なし |
| 850 | `string-isalnum` | 文字列sが文字か数字だけか判定 | すべての文字が英数字などか調べます。 | 文字列s | 文字または数字だけで空でなければTrue | なし | `${1:s}.isalnum()` | なし |
| 860 | `string-islower` | 文字列sの英字がすべて小文字か判定 | 大文字小文字を持つ文字がすべて小文字か調べます。 | 文字列s | 条件を満たし、英字が1文字以上あればTrue | なし | `${1:s}.islower()` | なし |
| 870 | `string-isupper` | 文字列sの英字がすべて大文字か判定 | 大文字小文字を持つ文字がすべて大文字か調べます。 | 文字列s | 条件を満たし、英字が1文字以上あればTrue | なし | `${1:s}.isupper()` | なし |
| 880 | `string-isspace` | 文字列sが空白文字だけか判定 | 半角空白や改行などの空白文字だけか調べます。 | 文字列s | 空白文字だけで空でなければTrue | なし | `${1:s}.isspace()` | なし |

### 6.6 集計・辞書

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 910 | `aggregation-counter-value` | Counter cntでxの個数を取得 | Counterから指定要素の出現回数を取り出します。 | Counter cnt、調べる値x | xの個数。未登録なら0 | cntをCounterとして作成済みであること | `${1:cnt}[${2:x}]` | `from collections import Counter` |
| 930 | `aggregation-increment` | 辞書dでxの個数を1増やす | defaultdict(int)のカウンタを更新します。 | defaultdict d、数える値x | 戻り値なし。d[x]を1増やす | dをdefaultdict(int)として作成済みであること | `${1:d}[${2:x}] += 1` | `from collections import defaultdict` |

`aggregation-counter-value` と `aggregation-increment` の import は本体だけなら不要だが、前提となる型を初心者へ示し、自動importの一貫性を保つため候補に含める。実装時に「使用していないimportを増やしたくない」と判断する場合は空配列にしてもよい。

### 6.7 累積和

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 1010 | `prefix-sum-range` | 累積和cumでA[l:r]の合計 | 2つの累積値の差から半開区間の合計を求めます。 | 先頭0付き累積和cum、左端l、右端の1つ外側r | 元のAのl番目からr-1番目までの合計 | `cum[0] == 0` で、cumがAの累積和であること | `${1:cum}[${3:r}] - ${1:cum}[${2:l}]` | なし |

### 6.8 全探索

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 1100 | `brute-combinations` | Aからr個選ぶ全組み合わせ | 順番を区別せずにr個選ぶ候補を列挙します。 | iterable A、選ぶ個数r | r要素のタプルを順に返すiterator | 0以上の整数r | `combinations(${1:A}, ${2:r})` | `from itertools import combinations` |
| 1110 | `brute-permutations` | Aの全ての並び順 | 要素の順番を区別した全排列を列挙します。 | iterable A | Aの長さのタプルを順に返すiterator | 要素数に対して件数が階乗で増える | `permutations(${1:A})` | `from itertools import permutations` |

### 6.9 二分探索

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 1220 | `binary-count-closed-interval` | 昇順リストaでB以上A以下の個数 | 左端と右端の挿入位置の差から、閉区間 `[B, A]` に入る要素数を求めます。 | 昇順リストa、上限A、下限B | `B <= x <= A` を満たすa内の要素数 | aが昇順で、BがA以下であること | `bisect_right(${1:a}, ${2:A}) - bisect_left(${1:a}, ${3:B})` | `from bisect import bisect_left, bisect_right` |
| 1230 | `binary-lower-bound-function` | 二分探索を自分で書いてx以上の左端を探す | bisect_leftと同じ処理を学習用の関数として実装します。 | 昇順リストA、探す値x | `A[i] >= x` となる最初のi。なければlen(A) | Aが昇順であること | 下記コード | なし |

`binary-lower-bound-function` の body:

```python
def lower_bound(A, x):
    left = 0
    right = len(A)

    while left < right:
        mid = (left + right) // 2
        if A[mid] < x:
            left = mid + 1
        else:
            right = mid

    return left
```

区間個数の変数名はユーザー指定の式をそのまま採用している。一般的な表記へ読み替えるなら、下限を `L`、上限を `R` として `bisect_right(a, R) - bisect_left(a, L)` になる。今回の `A` は上限、`B` は下限であることをsummaryと詳細の両方で明示する。

### 6.10 キュー・ヒープ

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 1310 | `queue-deque-empty` | 空のキューqを作る | 左から高速に取り出せる空のdequeを作ります。 | なし | 空のdeque | なし | `deque()` | `from collections import deque` |
| 1320 | `queue-append` | キューqの右端へxを追加 | dequeの末尾へ要素を追加します。 | deque q、追加する値x | 戻り値はNone。qを変更 | qがappendに対応していること | `${1:q}.append(${2:x})` | `from collections import deque` |
| 1330 | `queue-popleft` | キューqの左端から取り出す | dequeの先頭要素を削除して取得します。 | deque q | 削除した左端要素 | qが空でないこと | `${1:q}.popleft()` | `from collections import deque` |

### 6.11 デバッグ・型確認

| order | id | summary | description | input | returns | precondition | body | imports |
|---:|---|---|---|---|---|---|---|---|
| 1500 | `debug-type` | xの型を確認 | デバッグ時に値の実際の型を調べます。 | 値x | xの型オブジェクト | なし | `type(${1:x})` | なし |
| 1510 | `debug-isinstance-int` | xがint型か判定 | 継承関係も含めてint型か調べます。 | 値x | int型ならTrue、それ以外はFalse | boolはintのサブクラスなのでTrueになる | `isinstance(${1:x}, int)` | なし |
| 1520 | `debug-isinstance-str` | sがstr型か判定 | 値が文字列型か調べます。 | 値s | str型ならTrue、それ以外はFalse | なし | `isinstance(${1:s}, str)` | なし |

## 7. 重複を増やさないための整理ルール

1. `sum(A)` と `len(A)` は「数の操作」「リストの操作」の両方にあっても1件だけ収録する。
2. `len(s)` と `len(A)` は型ごとにカードを分けず、`sequence-length` へ統合する。
3. `Counter(A)`、`defaultdict(int)`、`deque([start])`、`heappush`、`heappop`、`bisect_left`、`bisect_right` は既存IDを使い、新IDを作らない。
4. 累積和の作成は既存 `aggregation-accumulate` を再利用し、カテゴリだけ `prefix-sum` へ移す。
5. カンペの `import heapq` は既存方針に合わせ、`from heapq import heappush, heappop` を使う。
6. 自作 `lower_bound` は `bisect_left` と機能が重なるため、「二分探索」カテゴリの最後に学習用として置く。
7. `isdigit()` の注意書き、`sort()` が元リストを書き換えること、`//` の負数での丸め方など、初心者が誤解しやすい事項は `precondition` または詳細表示へ残す。

## 8. 採用優先度

全55件を一度に追加してもカテゴリが折りたたまれていれば閲覧性は保てる。ただし実装とテストを段階化する場合は、次の順を推奨する。

1. 最優先: 出力、数値、文字列、リスト、累積和の区間合計、二分探索の区間個数。
2. 次点: 条件分岐、文字種判定、型変換、内包表記。
3. 発展: 全探索、自作lower_bound、dequeの個別操作、デバッグ型確認。

最終的な想定件数は、既存29件を維持し、追加候補55件をすべて採用した場合で84件になる。カテゴリを閉じた状態では13行の見出しだけになるため、現在の一覧よりも全体を見渡しやすい。

## 9. 実装時の受け入れ条件案

- 既存29件のIDが変わらず、追加55件と重複しない。
- カテゴリは難易度順の13個で表示され、各カテゴリを独立して開閉できる。
- 一覧行にはsummaryとコードだけが表示される。
- 詳細情報はホバーとキーボードフォーカスの両方で確認できる。
- `binary-count-closed-interval` が `bisect_right(a, A) - bisect_left(a, B)` を挿入し、2つのbisect importを重複なく追加する。
- `from bisect import bisect_left` が既にある場合は不足する `bisect_right` だけを追加する。
- `sort()`、`append()` などNoneを返す処理は、returnsに「対象を変更する」と明示される。
- 全summary、詳細項目、コードプレビューがHTMLエスケープされる。
- カテゴリを閉じても、選択中やホバー中の詳細表示が画面に残らない。
