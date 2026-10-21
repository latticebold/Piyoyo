const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractProblemSectionsFromHtml,
  isAtCoderTaskUrl,
  parseProblemHtml,
  parseProblemText,
  toJapaneseTaskUrl
} = require('../src/verify/problemParser');

// ---------- Schema checker (follows docs/verify-design.md) ----------

const ROW_KEYS = {
  ints: ['kind', 'vars', 'needsReview', 'reviewReason'],
  intList: ['kind', 'name', 'length', 'min', 'max', 'layout', 'distinct', 'order', 'needsReview', 'reviewReason'],
  matrix: ['kind', 'name', 'rows', 'cols', 'min', 'max', 'needsReview', 'reviewReason'],
  string: ['kind', 'name', 'minLength', 'maxLength', 'charset', 'chars', 'needsReview', 'reviewReason'],
  grid: ['kind', 'name', 'rows', 'minCols', 'cols', 'charset', 'chars', 'distinct', 'needsReview', 'reviewReason']
};
const EXPR_FIELDS = {
  ints: [],
  intList: ['length', 'min', 'max'],
  matrix: ['rows', 'cols', 'min', 'max'],
  string: ['minLength', 'maxLength'],
  grid: ['rows', 'minCols', 'cols']
};
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function isIntegerNumberExpr(compact) {
  const sign = compact.startsWith('-') ? 1 : 0;
  const body = compact.slice(sign);
  if (/^\d+$/.test(body) || /^10\^\d+$/.test(body)) {
    return true;
  }
  const m = /^(\d+)(?:\.(\d+))?(?:(?:×|\*|\\times)10\^|e)(\d+)$/.exec(body);
  if (!m) {
    return false;
  }
  const frac = (m[2] || '').replace(/0+$/, '');
  return frac.length <= Number(m[3]);
}

function checkExpr(value, available, where) {
  assert.equal(typeof value, 'string', `${where} must be a string`);
  const compact = value.replace(/\s+/g, '');
  assert.notEqual(compact, '', `${where} must not be empty`);
  if (/^-?[\d.]/.test(compact)) {
    assert.ok(isIntegerNumberExpr(compact), `${where}: "${value}" is not a valid integer expression`);
    return;
  }
  const m = /^([A-Za-z][A-Za-z0-9_]*)(?:([+-])(\d+))?$/.exec(compact);
  assert.ok(m, `${where}: "${value}" is not a valid expression`);
  assert.ok(!m[3] || /[1-9]/.test(m[3]), `${where}: "${value}" has a zero offset`);
  assert.ok(available.has(m[1]), `${where}: "${m[1]}" is not defined before this place`);
}

function assertSchema(result) {
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(Object.keys(result).sort(), ['format', 'ok', 'warnings']);
  assert.deepEqual(Object.keys(result.format), ['rows']);
  assert.ok(Array.isArray(result.format.rows));
  assert.ok(Array.isArray(result.warnings));
  result.warnings.forEach((w) => assert.equal(typeof w, 'string'));
  assert.doesNotThrow(() => JSON.stringify(result));

  const available = new Set();
  const names = new Set();
  const claim = (name, where) => {
    assert.equal(typeof name, 'string', `${where} name`);
    assert.match(name, NAME_RE, `${where} name "${name}"`);
    assert.ok(!names.has(name), `${where}: duplicate name ${name}`);
    names.add(name);
  };

  result.format.rows.forEach((row, index) => {
    const where = `rows[${index}]`;
    assert.ok(ROW_KEYS[row.kind], `${where}: unknown kind ${row.kind}`);
    assert.deepEqual(Object.keys(row).sort(), [...ROW_KEYS[row.kind]].sort(), `${where} keys`);
    assert.equal(typeof row.needsReview, 'boolean', `${where}.needsReview`);
    assert.equal(typeof row.reviewReason, 'string', `${where}.reviewReason`);
    assert.equal(row.needsReview, row.reviewReason !== '', `${where}: needsReview must match reviewReason`);

    if (row.kind === 'ints') {
      assert.ok(Array.isArray(row.vars), `${where}.vars`);
      row.vars.forEach((v, i) => {
        assert.deepEqual(Object.keys(v).sort(), ['max', 'min', 'name'], `${where}.vars.${i} keys`);
        checkExpr(v.min, available, `${where}.vars.${i}.min`);
        checkExpr(v.max, available, `${where}.vars.${i}.max`);
        claim(v.name, `${where}.vars.${i}`);
        available.add(v.name);
      });
      if (row.vars.length === 0) {
        assert.equal(row.needsReview, true, `${where}: an empty ints row must need review`);
      }
      return;
    }

    claim(row.name, where);
    for (const field of EXPR_FIELDS[row.kind]) {
      if ((field === 'minLength' || field === 'minCols') && row[field] === '') {
        continue;
      }
      checkExpr(row[field], available, `${where}.${field}`);
    }
    if (row.kind === 'intList') {
      assert.ok(['row', 'column'].includes(row.layout), `${where}.layout`);
      assert.ok(['none', 'asc', 'desc', 'strictAsc', 'strictDesc'].includes(row.order), `${where}.order`);
    }
    if (row.kind === 'intList' || row.kind === 'grid') {
      assert.equal(typeof row.distinct, 'boolean', `${where}.distinct`);
    }
    if (row.kind === 'string' || row.kind === 'grid') {
      assert.ok(['lower', 'upper', 'digit', 'custom'].includes(row.charset), `${where}.charset`);
      assert.equal(typeof row.chars, 'string', `${where}.chars`);
      assert.equal(row.chars !== '', row.charset === 'custom', `${where}: chars must be set only for custom`);
    }
  });

  const reviewCount = result.format.rows.filter((row) => row.needsReview).length;
  assert.ok(result.warnings.length >= reviewCount, 'every row that needs review must have a warning');
  return result.format.rows;
}

function parseText(lines) {
  return assertSchema(parseProblemText(lines.join('\n')));
}

function ok(row) {
  return { ...row, needsReview: false, reviewReason: '' };
}

// ---------- Fixtures (made-up problems) ----------

const ANCHOR_ROWS = [
  ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '2×10^5' }, { name: 'M', min: '1', max: 'N' }] }),
  ok({ kind: 'intList', name: 'A', length: 'N', min: '1', max: '10^9', layout: 'row', distinct: false, order: 'none' }),
  ok({ kind: 'string', name: 'S', minLength: '', maxLength: 'M', charset: 'lower', chars: '' })
];

const ANCHOR_TEXT = [
  '問題文',
  '長さ N の数列 A と文字列 S が与えられます。答えを求めてください。',
  '',
  '制約',
  '1 \\leq N \\leq 2 \\times 10^5',
  '1 \\leq M \\leq N',
  '1 \\leq A_i \\leq 10^9',
  'S は英小文字からなる長さ M の文字列',
  '入力はすべて整数である',
  '',
  '入力',
  '入力は以下の形式で標準入力から与えられる。',
  'N M',
  'A_1 A_2 \\ldots A_N',
  'S',
  '',
  '出力',
  '答えを出力せよ。',
  '',
  '入力例 1',
  '3 2',
  '5 1 4',
  'ab'
];

function atcoderPage({ jaConstraints, jaInput, enConstraints = '', enInput = '', extraJa = '' }) {
  return `<!DOCTYPE html>
<html><head><title>Made-up task</title>
<script>var fake = "<section><h3>入力</h3><pre>X Y Z</pre></section>";</script>
</head><body>
<div id="task-statement">
<span class="lang">
<span class="lang-ja">
<p>配点 : <var>200</var> 点</p>
<div class="part"><section><h3>問題文</h3><p>作り物の問題です。<var>N</var> 個の値があります。</p></section></div>
<div class="part"><section><h3>制約</h3><ul>
${jaConstraints}
</ul></section></div>
<hr>
<div class="io-style">
<div class="part"><section><h3>入力</h3><p>入力は以下の形式で標準入力から与えられる。</p>
${jaInput}
</section></div>
<div class="part"><section><h3>出力</h3><p>答えを出力せよ。</p><pre><var>Z</var></pre></section></div>
</div>
${extraJa}
<hr>
<div class="part"><section><h3>入力例 1 <span class="btn-copy" data-target="pre-sample0">Copy</span></h3><pre id="pre-sample0">3 2
5 1 4
ab
</pre></section></div>
<div class="part"><section><h3>出力例 1 <span class="btn-copy">Copy</span></h3><pre>7
</pre></section></div>
</span>
<span class="lang-en">
<div class="part"><section><h3>Constraints</h3><ul>
${enConstraints}
</ul></section></div>
<div class="io-style"><div class="part"><section><h3>Input</h3><p>Input is given from Standard Input in the following format:</p>
${enInput}
</section></div></div>
</span>
</span>
</div>
</body></html>`;
}

const ANCHOR_HTML = atcoderPage({
  jaConstraints: [
    '<li>\\(1 \\leq N \\leq 2 \\times 10^5\\)</li>',
    '<li>\\(1 \\leq M \\leq N\\)</li>',
    '<li>\\(1 \\leq A_i \\leq 10^9\\)</li>',
    '<li>\\(S\\) は英小文字からなる長さ \\(M\\) の文字列</li>',
    '<li>入力はすべて整数である</li>'
  ].join('\n'),
  jaInput: '<pre><var>N</var> <var>M</var>\n<var>A_1</var> <var>A_2</var> \\ldots <var>A_N</var>\n<var>S</var>\n</pre>',
  enConstraints: [
    '<li>\\(1 \\leq N \\leq 100\\)</li>',
    '<li>\\(1 \\leq M \\leq 50\\)</li>',
    '<li>\\(1 \\leq A_i \\leq 7\\)</li>',
    '<li>\\(S\\) is a string of length \\(M\\) consisting of uppercase English letters.</li>'
  ].join('\n'),
  enInput: '<pre><var>N</var> <var>M</var>\n<var>A_1</var> <var>A_2</var> \\ldots <var>A_N</var>\n<var>S</var>\n</pre>'
});

// ---------- URL helpers ----------

test('isAtCoderTaskUrl accepts only https task pages on atcoder.jp', () => {
  const accepted = [
    'https://atcoder.jp/contests/abc300/tasks/abc300_a',
    'https://atcoder.jp/contests/abc300/tasks/abc300_a/',
    'https://atcoder.jp/contests/abc300/tasks/abc300_a?lang=en',
    'https://atcoder.jp/contests/abc300/tasks/abc300_a#sample',
    '  https://atcoder.jp/contests/arc-test_1/tasks/arc_test_1_b  '
  ];
  for (const url of accepted) {
    assert.equal(isAtCoderTaskUrl(url), true, url);
  }

  const rejected = [
    'http://atcoder.jp/contests/abc300/tasks/abc300_a',
    'https://example.com/contests/abc300/tasks/abc300_a',
    'https://atcoder.jp.example.com/contests/abc300/tasks/abc300_a',
    'https://user:pass@atcoder.jp/contests/abc300/tasks/abc300_a',
    'https://atcoder.jp:8443/contests/abc300/tasks/abc300_a',
    'https://atcoder.jp/contests/abc300',
    'https://atcoder.jp/contests/abc300/tasks',
    'https://atcoder.jp/contests/abc300/tasks/abc300_a/editorial',
    'https://atcoder.jp/contests/abc300/submissions/12345',
    'https://example.com/?u=https://atcoder.jp/contests/abc300/tasks/abc300_a',
    'atcoder.jp/contests/abc300/tasks/abc300_a',
    '',
    '   ',
    null,
    undefined,
    42,
    {}
  ];
  for (const url of rejected) {
    assert.equal(isAtCoderTaskUrl(url), false, String(url));
  }
});

test('toJapaneseTaskUrl normalizes to ?lang=ja without a trailing slash', () => {
  assert.equal(
    toJapaneseTaskUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a/?lang=en#sample'),
    'https://atcoder.jp/contests/abc300/tasks/abc300_a?lang=ja'
  );
  assert.equal(
    toJapaneseTaskUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a'),
    'https://atcoder.jp/contests/abc300/tasks/abc300_a?lang=ja'
  );
  assert.equal(toJapaneseTaskUrl('https://atcoder.jp/contests/abc300/submissions/1'), '');
  assert.equal(toJapaneseTaskUrl('http://atcoder.jp/contests/abc300/tasks/abc300_a'), '');
  assert.equal(toJapaneseTaskUrl(null), '');
});

// ---------- Bad input never throws ----------

test('every export returns a failure instead of throwing for empty or wrong input', () => {
  for (const bad of [null, undefined, 42, '', '   \n  ', {}, []]) {
    for (const fn of [extractProblemSectionsFromHtml, parseProblemText, parseProblemHtml]) {
      const result = fn(bad);
      assert.equal(result.ok, false, `${fn.name}(${String(bad)})`);
      assert.equal(typeof result.message, 'string');
      assert.notEqual(result.message, '');
    }
  }
});

test('text without any format line fails with a message', () => {
  const result = parseProblemText('制約\n1 \\leq N \\leq 10\n');
  assert.equal(result.ok, false);
  assert.match(result.message, /入力/);
});

// ---------- Anchor: the example from the design doc ----------

test('parseProblemText reads the design doc example exactly', () => {
  const result = parseProblemText(ANCHOR_TEXT.join('\n'));
  const rows = assertSchema(result);
  assert.deepEqual(rows, ANCHOR_ROWS);
  assert.deepEqual(result.warnings, []);
});

test('parseProblemHtml reads the Japanese statement and ignores samples and scripts', () => {
  const result = parseProblemHtml(ANCHOR_HTML);
  const rows = assertSchema(result);
  assert.deepEqual(rows, ANCHOR_ROWS);
  assert.deepEqual(result.warnings, []);
});

test('parseProblemHtml falls back to the whole page when there is no lang-ja span', () => {
  const html = `<div class="part"><section><h3>Constraints</h3><ul>
<li>\\(1 \\leq N \\leq 100\\)</li><li>\\(0 \\leq A_i \\leq 9\\)</li></ul></section></div>
<div class="part"><section><h3>Input</h3><p>Input is given from Standard Input in the following format:</p>
<pre><var>N</var>
<var>A_1</var> <var>A_2</var> <var>\\ldots</var> <var>A_N</var>
</pre></section></div>
<div class="part"><section><h3>Sample Input 1</h3><pre>3
1 2 3</pre></section></div>`;
  const rows = assertSchema(parseProblemHtml(html));
  assert.deepEqual(rows, [
    ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '100' }] }),
    ok({ kind: 'intList', name: 'A', length: 'N', min: '0', max: '9', layout: 'row', distinct: false, order: 'none' })
  ]);
});

// ---------- HTML extraction ----------

test('extractProblemSectionsFromHtml returns the first <pre> of 入力 and the 制約 list', () => {
  const result = extractProblemSectionsFromHtml(ANCHOR_HTML);
  assert.equal(result.ok, true);
  assert.equal(result.inputText, 'N M\nA_1 A_2 \\ldots A_N\nS');
  assert.equal(result.constraintsText, [
    '\\(1 \\leq N \\leq 2 \\times 10^5\\)',
    '\\(1 \\leq M \\leq N\\)',
    '\\(1 \\leq A_i \\leq 10^9\\)',
    '\\(S\\) は英小文字からなる長さ \\(M\\) の文字列',
    '入力はすべて整数である'
  ].join('\n'));
});

test('extractProblemSectionsFromHtml decodes entities once', () => {
  const html = `<span class="lang-ja">
<div class="part"><section><h3>制約</h3><ul>
<li>\\(0 \\leq A_i &lt; 2^{30}\\)</li>
<li>&amp;lt; &quot;q&quot; &#39;s&#39; &#8804; &#x2264; &amp;</li>
</ul></section></div>
<div class="part"><section><h3>入力</h3><pre><var>N</var>&nbsp;<var>K</var></pre></section></div>
</span>`;
  const result = extractProblemSectionsFromHtml(html);
  assert.equal(result.ok, true);
  assert.equal(result.inputText, 'N K');
  assert.deepEqual(result.constraintsText.split('\n'), [
    '\\(0 \\leq A_i < 2^{30}\\)',
    '&lt; "q" \'s\' ≤ ≤ &'
  ]);
});

test('extractProblemSectionsFromHtml fails when there is no 入力 section', () => {
  const html = '<span class="lang-ja"><section><h3>制約</h3><ul><li>N = 1</li></ul></section>'
    + '<section><h3>入力例 1</h3><pre>1</pre></section></span>';
  const result = extractProblemSectionsFromHtml(html);
  assert.equal(result.ok, false);
  assert.match(result.message, /入力/);
  assert.equal(parseProblemHtml(html).ok, false);
});

test('parseProblemHtml warns when the 制約 section is missing', () => {
  const html = '<span class="lang-ja"><section><h3>入力</h3><pre><var>N</var>\n</pre></section></span>';
  const result = parseProblemHtml(html);
  const rows = assertSchema(result);
  assert.deepEqual(rows[0].vars, [{ name: 'N', min: '1', max: '10^9' }]);
  assert.equal(rows[0].needsReview, true);
  assert.ok(result.warnings.some((w) => w.includes('「制約」の部分が見つからなかった')));
});

test('parseProblemHtml handles a strict bound written with &lt; and uses only the first <pre>', () => {
  const html = atcoderPage({
    jaConstraints: [
      '<li>\\(1 \\leq N, Q \\leq 10^5\\)</li>',
      '<li>\\(0 \\leq A_i &lt; 2^{30}\\)</li>'
    ].join('\n'),
    jaInput: [
      '<pre><var>N</var> <var>Q</var>',
      '<var>A_1</var> <var>A_2</var> <var>\\ldots</var> <var>A_N</var>',
      '<var>\\mathrm{query}_1</var>',
      '<var>\\mathrm{query}_2</var>',
      '<var>\\vdots</var>',
      '<var>\\mathrm{query}_Q</var>',
      '</pre>',
      '<p>各クエリは以下のいずれかの形式で与えられる。</p>',
      '<pre>1 <var>x</var></pre>',
      '<pre>2 <var>x</var> <var>y</var></pre>'
    ].join('\n')
  });
  const rows = assertSchema(parseProblemHtml(html));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '10^5' }, { name: 'Q', min: '1', max: '10^5' }] }));
  assert.deepEqual(rows[1], ok({
    kind: 'intList', name: 'A', length: 'N', min: '0', max: '1073741823', layout: 'row', distinct: false, order: 'none'
  }));
  assert.deepEqual(rows[2], {
    kind: 'ints', vars: [], needsReview: true, reviewReason: 'クエリの入力には最初の版では対応していません。'
  });
});

// ---------- Lists ----------

test('vertical A_1 / A_2 / vdots / A_N becomes a column list, with distinct from ≠', () => {
  const rows = parseText([
    '制約',
    '$1 \\le N \\le 10^5$',
    '$1 \\le A_i \\le 10^9$',
    '$A_i \\neq A_j\\ (i \\neq j)$',
    '入力',
    'N',
    'A_1',
    'A_2',
    '\\vdots',
    'A_N'
  ]);
  assert.deepEqual(rows[1], ok({
    kind: 'intList', name: 'A', length: 'N', min: '1', max: '10^9', layout: 'column', distinct: true, order: 'none'
  }));
});

test('distinct is also read from 相異なる and すべて異なる', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 100',
    '1 \\leq A_i \\leq 1000',
    'A_1, A_2, \\ldots, A_N は相異なる',
    '1 \\leq B_i \\leq 1000',
    'B_i はすべて異なる',
    '入力',
    'N',
    'A_1 A_2 \\dots A_N',
    'B_1 B_2 \\cdots B_N'
  ]);
  assert.equal(rows[1].distinct, true);
  assert.equal(rows[2].distinct, true);
  assert.equal(rows[1].needsReview, false);
  assert.equal(rows[2].needsReview, false);
});

test('ordered lists become strictAsc / asc / strictDesc / desc', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 50',
    '1 \\leq A_1 < A_2 < \\ldots < A_N \\leq 10^9',
    '0 \\leq B_1 \\leq B_2 \\leq \\cdots \\leq B_N \\leq 100',
    '1 \\leq C_i \\leq 100',
    'C_1 > C_2 > … > C_N',
    '1 \\leq D_i \\leq 100',
    'D_i \\geq D_{i+1} (1 \\leq i \\leq N-1)',
    '入力',
    'N',
    'A_1 A_2 \\ldots A_N',
    'B_1 B_2 \\ldots B_N',
    'C_1 C_2 \\ldots C_N',
    'D_1 D_2 \\ldots D_N'
  ]);
  assert.deepEqual(rows.slice(1).map((r) => [r.order, r.min, r.max, r.needsReview]), [
    ['strictAsc', '1', '10^9', false],
    ['asc', '0', '100', false],
    ['strictDesc', '1', '100', false],
    ['desc', '1', '100', false]
  ]);
  assert.equal(rows[1].distinct, false);
});

test('a list bounded by an earlier variable refers to it, and that variable is not marked', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 2 \\times 10^5',
    '1 \\leq A_i \\leq N',
    '1 \\leq i \\leq N',
    '入力',
    'N',
    'A_1 A_2 \\ldots A_N'
  ]);
  assert.deepEqual(rows, [
    ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '2×10^5' }] }),
    ok({ kind: 'intList', name: 'A', length: 'N', min: '1', max: 'N', layout: 'row', distinct: false, order: 'none' })
  ]);
});

test('a relation to an earlier list marks the later variable', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 100',
    '1 \\leq A_i \\leq K \\leq 10^9',
    '入力',
    'N',
    'A_1 \\ldots A_N',
    'K'
  ]);
  assert.equal(rows[1].max, '10^9');
  assert.equal(rows[1].needsReview, true);
  assert.deepEqual(rows[2].vars, [{ name: 'K', min: '1', max: '10^9' }]);
  assert.equal(rows[2].needsReview, true);
  assert.match(rows[2].reviewReason, /A_i ≤ K/);
});

test('a 長さ phrase about a sequence keeps the list numeric', () => {
  const listRow = ok({ kind: 'intList', name: 'A', length: 'N', min: '1', max: '10^9', layout: 'row', distinct: false, order: 'none' });
  const headed = parseText([
    '制約',
    '1 \\leq N \\leq 100',
    'A は長さ N の数列',
    '1 \\leq A_i \\leq 10^9',
    '入力',
    'N',
    'A_1 \\ldots A_N'
  ]);
  assert.deepEqual(headed[1], listRow);

  const loose = parseText([
    '長さ N の数列 A = (A_1, \\ldots, A_N) が与えられます。',
    'N',
    'A_1 \\ldots A_N',
    '1 \\leq N \\leq 100',
    '1 \\leq A_i \\leq 10^9'
  ]);
  assert.deepEqual(loose[1], listRow);

  const strings = parseText([
    '制約',
    '1 \\leq N \\leq 100',
    'S の長さは N',
    'S は英小文字からなる',
    'T は長さ N の文字列',
    'T は英大文字からなる',
    '入力',
    'N',
    'S',
    'T'
  ]);
  assert.deepEqual(strings.slice(1), [
    ok({ kind: 'string', name: 'S', minLength: '', maxLength: 'N', charset: 'lower', chars: '' }),
    ok({ kind: 'string', name: 'T', minLength: '', maxLength: 'N', charset: 'upper', chars: '' })
  ]);
});

test('\\ne, a bare ≠, &gt; and a full-width space are understood', () => {
  const text = parseText([
    '制約',
    '1　≦　N　≦　10',
    '1 \\leq A_i \\leq 10',
    'A_i \\ne A_j (i \\ne j)',
    '1 \\leq B_i \\leq 10',
    'B_i ≠ B_j (i ≠ j)',
    '入力',
    'N',
    'A_1　A_2　\\ldots　A_N',
    'B_1 B_2 \\ldots B_N'
  ]);
  assert.deepEqual(text[0], ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '10' }] }));
  assert.equal(text[1].distinct, true);
  assert.equal(text[2].distinct, true);

  const html = parseProblemHtml(`<span class="lang-ja">
<section><h3>制約</h3><ul>
<li>\\(N &gt; 0\\)</li><li>\\(N &lt; 100\\)</li>
<li>\\(10^9 \\geq C_1 &gt; C_2 &gt; \\ldots &gt; C_N \\geq 1\\)</li>
</ul></section>
<section><h3>入力</h3><pre><var>N</var>
<var>C_1</var> <var>C_2</var> <var>\\ldots</var> <var>C_N</var>
</pre></section></span>`);
  const rows = assertSchema(html);
  assert.deepEqual(rows, [
    ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '99' }] }),
    ok({ kind: 'intList', name: 'C', length: 'N', min: '1', max: '10^9', layout: 'row', distinct: false, order: 'strictDesc' })
  ]);
});

test('list length is computed from the first and last index', () => {
  const rows = parseText([
    '制約',
    '2 \\leq N \\leq 100',
    '0 \\leq X_i \\leq 9',
    '1 \\leq Y_i \\leq 9',
    '入力',
    'N',
    'X_0 X_1 \\ldots X_{N-1}',
    'Y_{1} Y_{2} … Y_{N-1}',
    'Y_1 Y_2 Y_3'
  ]);
  assert.equal(rows[1].length, 'N');
  assert.equal(rows[2].length, 'N-1');
  assert.equal(rows[3].name, 'Y2');
  assert.equal(rows[3].length, '3');
  assert.equal(rows[3].needsReview, true);
});

// ---------- Matrix and grid ----------

test('A_{1,1} ... A_{H,W} becomes a matrix', () => {
  const rows = parseText([
    '制約',
    '1 \\leq H, W \\leq 500',
    '0 \\leq A_{i,j} \\leq 100',
    '入力',
    'H W',
    'A_{1,1} A_{1,2} \\ldots A_{1,W}',
    '\\vdots',
    'A_{H,1} A_{H,2} \\ldots A_{H,W}'
  ]);
  assert.deepEqual(rows, [
    ok({ kind: 'ints', vars: [{ name: 'H', min: '1', max: '500' }, { name: 'W', min: '1', max: '500' }] }),
    ok({ kind: 'matrix', name: 'A', rows: 'H', cols: 'W', min: '0', max: '100' })
  ]);
});

test('a 0/1 matrix takes its range from 0 または 1', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 10',
    'A_{i, j} は 0 または 1',
    '入力',
    'N',
    'A_{1, 1} \\ldots A_{1, N}',
    ':',
    'A_{N, 1} \\ldots A_{N, N}'
  ]);
  assert.deepEqual(rows[1], ok({ kind: 'matrix', name: 'A', rows: 'N', cols: 'N', min: '0', max: '1' }));
});

test('S_1 / vdots / S_H with length W strings becomes a grid', () => {
  const rows = parseText([
    '制約',
    '1 \\leq H, W \\leq 1000',
    'S_i は `.` と `#` からなる長さ W の文字列',
    '入力',
    'H W',
    'S_1',
    'S_2',
    '⋮',
    'S_H'
  ]);
  assert.deepEqual(rows[1], ok({
    kind: 'grid', name: 'S', rows: 'H', minCols: '', cols: 'W', charset: 'custom', chars: '.#', distinct: false
  }));

  const fixedByBars = parseText([
    '制約',
    '1 \\leq H, W \\leq 1000',
    '|S_i| = W',
    'S_i は英小文字からなる',
    '入力',
    'H W',
    'S_1',
    '⋮',
    'S_H'
  ]);
  assert.deepEqual(fixedByBars[1], ok({
    kind: 'grid', name: 'S', rows: 'H', minCols: '', cols: 'W', charset: 'lower', chars: '', distinct: false
  }));
});

test('S_{1,1}S_{1,2}...S_{1,W} rows become a grid', () => {
  const rows = parseText([
    '制約',
    '1 \\leq H \\leq 100',
    '1 \\leq W \\leq 100',
    'S_{i,j} は . または #',
    '入力',
    'H W',
    'S_{1,1}S_{1,2}\\ldots S_{1,W}',
    '\\vdots',
    'S_{H,1}S_{H,2}\\ldots S_{H,W}'
  ]);
  assert.deepEqual(rows[1], ok({
    kind: 'grid', name: 'S', rows: 'H', minCols: '', cols: 'W', charset: 'custom', chars: '.#', distinct: false
  }));
});

test('a grid without a width constraint needs review', () => {
  const rows = parseText([
    '制約',
    '1 \\leq H, W \\leq 10',
    'S_i は英大文字からなる文字列',
    '入力',
    'H W',
    'S_1',
    '\\vdots',
    'S_H'
  ]);
  assert.equal(rows[1].kind, 'grid');
  assert.equal(rows[1].minCols, '');
  assert.equal(rows[1].cols, 'W');
  assert.equal(rows[1].charset, 'upper');
  assert.equal(rows[1].distinct, false);
  assert.equal(rows[1].needsReview, true);
  assert.match(rows[1].reviewReason, /長さ/);
});

// Two lists of words with different lengths; only S must be distinct.
const WORD_LISTS_ROWS = [
  ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '100' }, { name: 'M', min: '1', max: '100' }] }),
  ok({ kind: 'grid', name: 'S', rows: 'N', minCols: '1', cols: '10', charset: 'lower', chars: '', distinct: true }),
  ok({ kind: 'grid', name: 'T', rows: 'M', minCols: '1', cols: '10', charset: 'lower', chars: '', distinct: false })
];

test('vertical word lists read |S_i| ranges into minCols / cols and distinct only for S', () => {
  const result = parseProblemText([
    '問題文',
    '高橋君は単語帳 S と、確かめたい単語 T を持っています。',
    '制約',
    '1 \\leq N \\leq 100',
    '1 \\leq M \\leq 100',
    '1 \\leq |S_i| \\leq 10',
    'i \\neq j ならば S_i \\neq S_j',
    '1 \\leq |T_j| \\leq 10',
    'S_i, T_j は英小文字からなる文字列',
    '入力',
    '入力は以下の形式で標準入力から与えられる。',
    'N M',
    'S_1',
    'S_2',
    '\\vdots',
    'S_N',
    'T_1',
    'T_2',
    '\\vdots',
    'T_M',
    '出力',
    '答えを出力せよ。'
  ].join('\n'));
  assert.deepEqual(assertSchema(result), WORD_LISTS_ROWS);
  assert.deepEqual(result.warnings, []);
});

test('the word lists also parse from AtCoder-like HTML', () => {
  const html = atcoderPage({
    jaConstraints: [
      '<li>\\(1 \\leq N \\leq 100\\)</li>',
      '<li>\\(1 \\leq M \\leq 100\\)</li>',
      '<li>\\(1 \\leq \\lvert S_i \\rvert \\leq 10\\)</li>',
      '<li>\\(i \\neq j\\) ならば \\(S_i \\neq S_j\\)</li>',
      '<li>\\(1 \\leq |T_j| \\leq 10\\)</li>',
      '<li>\\(S_i, T_j\\) は英小文字からなる文字列</li>'
    ].join('\n'),
    jaInput: [
      '<pre><var>N</var> <var>M</var>',
      '<var>S_1</var>',
      '<var>S_2</var>',
      '<var>\\vdots</var>',
      '<var>S_N</var>',
      '<var>T_1</var>',
      '<var>T_2</var>',
      '<var>\\vdots</var>',
      '<var>T_M</var>',
      '</pre>'
    ].join('\n'),
    enConstraints: '<li>\\(1 \\leq |S_i| \\leq 3\\)</li><li>\\(S_i\\) consists of uppercase English letters.</li>',
    enInput: '<pre><var>N</var> <var>M</var>\n<var>S_1</var>\n<var>\\vdots</var>\n<var>S_N</var>\n</pre>'
  });
  const result = parseProblemHtml(html);
  assert.deepEqual(assertSchema(result), WORD_LISTS_ROWS);
  assert.deepEqual(result.warnings, []);
});

test('other ways to say the strings are distinct mark only that grid', () => {
  const cases = [
    'S_i \\neq S_j (i \\neq j)',
    'S_1, S_2, \\ldots, S_N は相異なる',
    'S_i はすべて異なる'
  ];
  for (const distinctLine of cases) {
    const rows = parseText([
      '制約',
      '1 \\leq N, M \\leq 50',
      'S_i, T_i は英小文字からなる長さ 1 以上 M 以下の文字列',
      distinctLine,
      '入力',
      'N M',
      'S_1',
      '\\vdots',
      'S_N',
      'T_1',
      '\\vdots',
      'T_N'
    ]);
    assert.deepEqual(rows.slice(1).map((r) => [r.name, r.minCols, r.cols, r.distinct, r.needsReview]), [
      ['S', '1', 'M', true, false],
      ['T', '1', 'M', false, false]
    ], distinctLine);
  }
});

test('a grid row with only an upper length gets minCols 1 and needs review', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 10',
    '|S_i| \\leq 20',
    'S_i は英小文字からなる',
    '入力',
    'N',
    'S_1',
    '\\vdots',
    'S_N'
  ]);
  assert.equal(rows[1].minCols, '1');
  assert.equal(rows[1].cols, '20');
  assert.equal(rows[1].needsReview, true);
  assert.match(rows[1].reviewReason, /長さの下限/);
});

// ---------- Strings ----------

test('strings read length ranges and charsets', () => {
  const rows = parseText([
    '制約',
    '$1 \\leq |S| \\leq 2 \\times 10^5$',
    '$S$ は英大文字からなる',
    '$\\lvert T \\rvert = 8$',
    '$T$ は数字からなる文字列',
    'U は `a`, `b`, `c` のいずれかからなる長さ 1 以上 10 以下の文字列',
    'V は英小文字と数字からなる長さ 5 の文字列',
    '入力',
    'S',
    'T',
    'U',
    'V'
  ]);
  assert.deepEqual(rows, [
    ok({ kind: 'string', name: 'S', minLength: '1', maxLength: '2×10^5', charset: 'upper', chars: '' }),
    ok({ kind: 'string', name: 'T', minLength: '', maxLength: '8', charset: 'digit', chars: '' }),
    ok({ kind: 'string', name: 'U', minLength: '1', maxLength: '10', charset: 'custom', chars: 'abc' }),
    ok({ kind: 'string', name: 'V', minLength: '', maxLength: '5', charset: 'custom', chars: 'abcdefghijklmnopqrstuvwxyz0123456789' })
  ]);
});

test('|S| = N makes a fixed-length string without marking N', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 100',
    '|S| = N',
    'S は `o` と `x` からなる',
    '入力',
    'N',
    'S'
  ]);
  assert.deepEqual(rows, [
    ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '100' }] }),
    ok({ kind: 'string', name: 'S', minLength: '', maxLength: 'N', charset: 'custom', chars: 'ox' })
  ]);
});

test('a string without constraints gets defaults and needs review', () => {
  const rows = parseText([
    '制約',
    'S は文字列',
    '入力',
    'S'
  ]);
  assert.equal(rows[0].kind, 'string');
  assert.equal(rows[0].minLength, '1');
  assert.equal(rows[0].maxLength, '10^5');
  assert.equal(rows[0].charset, 'lower');
  assert.equal(rows[0].needsReview, true);
});

// ---------- Integers and normalization ----------

test('chained bounds work in both orders without review', () => {
  const nm = parseText(['制約', '1 \\leq M \\leq N \\leq 10^5', '入力', 'N M']);
  assert.deepEqual(nm, [ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '10^5' }, { name: 'M', min: '1', max: 'N' }] })]);

  const mn = parseText(['制約', '1 \\leq M \\leq N \\leq 10^5', '入力', 'M N']);
  assert.deepEqual(mn, [ok({ kind: 'ints', vars: [{ name: 'M', min: '1', max: '10^5' }, { name: 'N', min: 'M', max: '10^5' }] })]);
});

test('fixed values, full-width text and other relation symbols are normalized', () => {
  const rows = parseText([
    '制約',
    'N = 3',
    '１ ≦ Ｋ ≦ １００',
    '$0 \\lt X$',
    '$X \\le 10^{18}$',
    '\\(Y \\ge -10^9\\)',
    '\\(Y \\leqq 10^9\\)',
    '0 < Z < N',
    '1 ≤ W ≤ 1.5 × 10^5',
    '入力',
    'N K X Y Z W'
  ]);
  assert.deepEqual(rows, [ok({
    kind: 'ints',
    vars: [
      { name: 'N', min: '3', max: '3' },
      { name: 'K', min: '1', max: '100' },
      { name: 'X', min: '1', max: '10^18' },
      { name: 'Y', min: '-10^9', max: '10^9' },
      { name: 'Z', min: '1', max: 'N-1' },
      { name: 'W', min: '1', max: '1.5×10^5' }
    ]
  })]);
});

test('separate statements on one line and Japanese bounds are read', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 10, 1 \\leq M \\leq 20',
    'K は 1 以上 N 以下の整数',
    '入力',
    'N M K'
  ]);
  assert.deepEqual(rows[0].vars, [
    { name: 'N', min: '1', max: '10' },
    { name: 'M', min: '1', max: '20' },
    { name: 'K', min: '1', max: 'N' }
  ]);
  assert.equal(rows[0].needsReview, false);
});

test('fixed coordinates like x_1 y_1 become ints variables', () => {
  const rows = parseText([
    '制約',
    '0 \\leq x_i, y_i \\leq 100',
    '入力',
    'x_1 y_1',
    'x_2 y_2'
  ]);
  assert.deepEqual(rows, [
    ok({ kind: 'ints', vars: [{ name: 'x_1', min: '0', max: '100' }, { name: 'y_1', min: '0', max: '100' }] }),
    ok({ kind: 'ints', vars: [{ name: 'x_2', min: '0', max: '100' }, { name: 'y_2', min: '0', max: '100' }] })
  ]);
});

test('\\mathrm, \\text and $ delimiters are removed', () => {
  const rows = parseText([
    '制約',
    '$1 \\leq \\mathrm{N} \\leq 10$',
    '$1 \\leq \\text{A}_i \\leq 10$',
    '入力',
    '$\\mathrm{N}$',
    '$\\text{A}_1 \\ \\text{A}_2 \\ \\ldots \\ \\text{A}_{\\mathrm{N}}$'
  ]);
  assert.deepEqual(rows[1], ok({
    kind: 'intList', name: 'A', length: 'N', min: '1', max: '10', layout: 'row', distinct: false, order: 'none'
  }));
});

// ---------- Defaults and review ----------

test('missing constraints use defaults and need review', () => {
  const result = parseProblemText(['入力', 'N K', 'A_1 A_2 \\ldots A_N', 'B_1 \\ldots B_K'].join('\n'));
  const rows = assertSchema(result);
  assert.deepEqual(rows[0].vars, [
    { name: 'N', min: '1', max: '10^5' },
    { name: 'K', min: '1', max: '10^5' }
  ]);
  assert.equal(rows[1].min, '1');
  assert.equal(rows[1].max, '10^9');
  assert.ok(rows.every((row) => row.needsReview));
  assert.match(rows[0].reviewReason, /N の範囲の制約が見つからなかった/);
  assert.ok(result.warnings.some((w) => w.includes('「制約」の部分が見つからなかった')));
});

test('a value that is not a size defaults to 10^9 and a missing side is filled in', () => {
  const rows = parseText(['制約', '2 \\leq N', 'X \\leq 50', '入力', 'N X']);
  assert.deepEqual(rows[0].vars, [
    { name: 'N', min: '2', max: '10^9' },
    { name: 'X', min: '1', max: '50' }
  ]);
  assert.match(rows[0].reviewReason, /N の上限/);
  assert.match(rows[0].reviewReason, /X の下限/);
});

test('relations between list elements are not applied and need review', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 100',
    '1 \\leq A_i \\leq B_i \\leq 10^9',
    '入力',
    'N',
    'A_1 \\ldots A_N',
    'B_1 \\ldots B_N'
  ]);
  assert.equal(rows[1].max, '10^9');
  assert.equal(rows[2].min, '1');
  assert.equal(rows[1].needsReview, true);
  assert.equal(rows[2].needsReview, true);
  assert.match(rows[1].reviewReason, /関係は反映していません/);
});

test('a parent list P_2 ... P_N uses N-1 and flags P_i < i', () => {
  const rows = parseText([
    '制約',
    '2 \\leq N \\leq 2 \\times 10^5',
    '1 \\leq P_i < i',
    '入力',
    'N',
    'P_2 P_3 \\ldots P_N'
  ]);
  assert.equal(rows[1].length, 'N-1');
  assert.equal(rows[1].min, '1');
  assert.equal(rows[1].max, '10^9');
  assert.equal(rows[1].needsReview, true);
});

test('an upper bound that is not a simple expression needs review', () => {
  const rows = parseText(['制約', '2 \\leq N \\leq 100', '0 \\leq M \\leq N(N-1)/2', '入力', 'N M']);
  assert.deepEqual(rows[0].vars[1], { name: 'M', min: '0', max: '10^9' });
  assert.equal(rows[0].needsReview, true);
  assert.match(rows[0].reviewReason, /N\(N-1\)\/2/);
});

// ---------- Unsupported structures ----------

test('edge lists become a review row with the graph reason', () => {
  const result = parseProblemText([
    '制約',
    '2 \\leq N \\leq 10^5',
    'N-1 \\leq M \\leq 10^5',
    '1 \\leq u_i < v_i \\leq N',
    '与えられるグラフは連結',
    '入力',
    'N M',
    'u_1 v_1',
    'u_2 v_2',
    '\\vdots',
    'u_M v_M'
  ].join('\n'));
  const rows = assertSchema(result);
  assert.deepEqual(rows[0], ok({ kind: 'ints', vars: [{ name: 'N', min: '2', max: '10^5' }, { name: 'M', min: 'N-1', max: '10^5' }] }));
  assert.deepEqual(rows[1], {
    kind: 'ints', vars: [], needsReview: true, reviewReason: 'グラフ・木の入力には最初の版では対応していません。'
  });
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /^2 番目の行：/);
});

test('pairs per line become a review row', () => {
  const rows = parseText([
    '制約', '1 \\leq N \\leq 100', '1 \\leq L_i \\leq R_i \\leq 10^9',
    '入力', 'N', 'L_1 R_1', '\\vdots', 'L_N R_N'
  ]);
  assert.equal(rows[1].needsReview, true);
  assert.equal(rows[1].reviewReason, '複数の値が並ぶ行のくり返しには最初の版では対応していません。');
});

test('a leading test-case count and per-case sums need review', () => {
  const result = parseProblemText([
    '制約',
    '1 \\leq T \\leq 10^4',
    '1 \\leq N \\leq 2 \\times 10^5',
    '\\sum N \\leq 2 \\times 10^5',
    '入力',
    '入力は以下の形式で標準入力から与えられる。',
    'T',
    '\\mathrm{case}_1',
    '\\mathrm{case}_2',
    '\\vdots',
    '\\mathrm{case}_T',
    '各テストケースは以下の形式で与えられる。',
    'N',
    'A_1 A_2 \\ldots A_N'
  ].join('\n'));
  const rows = assertSchema(result);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].vars, [{ name: 'T', min: '1', max: '10^4' }]);
  assert.equal(rows[0].needsReview, true);
  assert.match(rows[0].reviewReason, /テストケース/);
  assert.deepEqual(rows[1], {
    kind: 'ints', vars: [], needsReview: true, reviewReason: 'テストケースが複数ある入力には最初の版では対応していません。'
  });
  assert.ok(result.warnings.some((w) => w.includes('合計についての制約')));
});

test('a sum constraint on a list marks that row', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 10^5',
    '1 \\leq A_i \\leq 10^9',
    '\\displaystyle\\sum_{i=1}^{N} A_i \\leq 10^{18}',
    '入力',
    'N',
    'A_1 \\ldots A_N'
  ]);
  assert.equal(rows[0].needsReview, false);
  assert.equal(rows[1].needsReview, true);
  assert.match(rows[1].reviewReason, /合計/);
});

test('unreadable lines become empty ints rows that need review', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 10',
    '1 \\leq K_i \\leq N',
    '入力',
    'N',
    '1 x',
    'N A_1 A_2 \\ldots A_N',
    'S T',
    '⋮'
  ]);
  assert.deepEqual(rows[0], ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '10' }] }));
  assert.deepEqual(rows[1], {
    kind: 'ints', vars: [], needsReview: true, reviewReason: 'この行は読み取れませんでした（1 x）。'
  });
  assert.deepEqual(rows[2], {
    kind: 'ints', vars: [], needsReview: true, reviewReason: '数と数列が同じ行に並ぶ形には最初の版では対応していません。'
  });
  assert.equal(rows[3].kind, 'ints');
  assert.equal(rows[3].needsReview, true);
  assert.deepEqual(rows[4], {
    kind: 'ints', vars: [], needsReview: true, reviewReason: 'この行は読み取れませんでした（⋮）。'
  });
});

test('triangular and variable-length rows are unreadable and need review', () => {
  const rows = parseText([
    '制約',
    '2 \\leq N \\leq 10',
    '入力',
    'N',
    'D_{1,2} D_{1,3} \\ldots D_{1,N}',
    '\\vdots',
    'D_{N-1,N}',
    'K_1 A_{1,1} \\ldots A_{1,K_1}',
    '\\vdots',
    'K_N A_{N,1} \\ldots A_{N,K_N}'
  ]);
  assert.equal(rows[0].needsReview, false);
  assert.ok(rows.slice(1).every((row) => row.kind === 'ints' && row.vars.length === 0 && row.needsReview));
  assert.match(rows[1].reviewReason, /読み取れませんでした/);
});

test('a string on the same line as numbers is left out with a reason', () => {
  const rows = parseText(['制約', '1 \\leq N \\leq 10', 'S は英小文字からなる長さ N の文字列', '入力', 'N S']);
  assert.deepEqual(rows[0].vars, [{ name: 'N', min: '1', max: '10' }]);
  assert.equal(rows[0].needsReview, true);
  assert.match(rows[0].reviewReason, /S は文字列のよう/);
});

// ---------- Pasted text variations ----------

test('pasted text without headings is split into format and constraints', () => {
  const rows = parseText([
    'N M',
    'A_1 A_2 \\ldots A_N',
    'S',
    '1 \\leq N \\leq 2 \\times 10^5',
    '1 \\leq M \\leq N',
    '1 \\leq A_i \\leq 10^9',
    'S は英小文字からなる長さ M の文字列'
  ]);
  assert.deepEqual(rows, ANCHOR_ROWS);
});

test('pasted text with both Japanese and English parts uses the Japanese part', () => {
  const rows = parseText([
    '制約',
    '1 \\leq N \\leq 300',
    '1 \\leq A_i \\leq 5',
    '入力',
    'N',
    'A_1 \\ldots A_N',
    'Constraints',
    '1 \\leq N \\leq 7',
    '1 \\leq A_i \\leq 9',
    'Input',
    'Input is given from Standard Input in the following format:',
    'N',
    'B_1 \\ldots B_N'
  ]);
  assert.deepEqual(rows, [
    ok({ kind: 'ints', vars: [{ name: 'N', min: '1', max: '300' }] }),
    ok({ kind: 'intList', name: 'A', length: 'N', min: '1', max: '5', layout: 'row', distinct: false, order: 'none' })
  ]);
});

test('English-only pasted text is read too', () => {
  const rows = parseText([
    'Constraints',
    '1 \\le N \\le 100',
    'S is a string of length N consisting of lowercase English letters.',
    'Input',
    'Input is given from Standard Input in the following format:',
    'N',
    'S'
  ]);
  assert.deepEqual(rows[1], ok({ kind: 'string', name: 'S', minLength: '', maxLength: 'N', charset: 'lower', chars: '' }));
});
