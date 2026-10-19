'use strict';

const LOWER_CHARS = 'abcdefghijklmnopqrstuvwxyz';
const UPPER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT_CHARS = '0123456789';

const SIZE_DEFAULTS = { min: '1', max: '10^5' };
const VALUE_DEFAULTS = { min: '1', max: '10^9' };
const LENGTH_DEFAULTS = { min: '1', max: '10^5' };
// Literal sizes are not reduced by sizeCap, so keep the fallback small.
const DEFAULT_COUNT = '10';
const STRING_DEFAULT_CHARSET = { charset: 'lower', chars: '', label: '英小文字' };
const GRID_DEFAULT_CHARSET = { charset: 'custom', chars: '.#', label: '「.」と「#」' };

const MAX_EXPONENT = 1000;
const MAX_FOLLOW_DEPTH = 5;

const JAPANESE_RE = /[、-〿぀-ヿ㐀-鿿豈-﫿]/;
const RELATION_RE = /[≤≥<>=≠]/;
const SUM_RE = /∑|総和|合計|\bsum\b/i;
const GRAPH_RE = /グラフ|木|頂点|辺|連結|自己ループ|多重辺|\bgraph\b|\btree\b|\bvert(?:ex|ices)\b|\bedges?\b/i;
const DISTINCT_RE = /相異なる|すべて異なる|全て異なる|互いに異なる|どの\s*2\s*つも異なる|pairwise distinct|\bare distinct\b|\ball different\b/i;
const ENGLISH_PROSE_RE = /(?:^|\s)(?:the|is|are|given|following|format|from|each|in|with|of)(?=\s|[.,:]|$)/i;
const QUERY_NAME_RE = /^(?:query|queries)$/i;
const CASE_NAME_RE = /^(?:case|cases|testcase|test)$/i;
const VDOTS_LINE_RE = /^[⋮:\s]+$/;

const FORMAT_VAR_RE = /([A-Za-z][A-Za-z0-9]*)(?:_(?:\{([^{}]*)\}|(\d+|[A-Za-z])))?/y;
const TERM_VAR_RE = /^([A-Za-z][A-Za-z0-9]*)(?:_(?:\{([^{}]*)\}|(\d+|[A-Za-z])))?(?:([+-])(\d+))?$/;
const VAR_SCAN_RE = /(?<![A-Za-z0-9_\\])([A-Za-z][A-Za-z0-9]*)(?:_(?:\{([^{}]*)\}|(\d+|[A-Za-z])))?/g;
const SAME_BASE_NEQ_RE = /([A-Za-z][A-Za-z0-9]*)_(\{[^{}]*\}|[A-Za-z0-9]+)\s*≠\s*\1_(\{[^{}]*\}|[A-Za-z0-9]+)/;

const LENGTH_TERM = '([-A-Za-z0-9^×+_{}.]+)';
const LENGTH_PATTERNS = [
  { kind: 'range', re: new RegExp(`長さ(?:が|は)?\\s*${LENGTH_TERM}\\s*以上\\s*${LENGTH_TERM}\\s*(以下|未満)`) },
  { kind: 'range', re: new RegExp(`${LENGTH_TERM}\\s*文字以上\\s*${LENGTH_TERM}\\s*文字(以下|未満)`) },
  { kind: 'upper', re: new RegExp(`長さ(?:が|は)?\\s*${LENGTH_TERM}\\s*(以下|未満)`) },
  { kind: 'upper', re: new RegExp(`${LENGTH_TERM}\\s*文字(以下|未満)`) },
  { kind: 'lower', re: new RegExp(`長さ(?:が|は)?\\s*${LENGTH_TERM}\\s*以上`) },
  { kind: 'fixed', re: new RegExp(`長さ(?:が|は)?\\s*${LENGTH_TERM}(?=\\s*(?:の|で|$))`) },
  { kind: 'fixed', re: new RegExp(`(?<=^|[\\sはがの])${LENGTH_TERM}\\s*文字(?!列|目|以上|以下|未満)`) },
  { kind: 'range', re: /\blength\s+between\s+(\S+)\s+and\s+(\S+)/i },
  { kind: 'upper', re: /\blength\s+at\s+most\s+(\S+)/i },
  { kind: 'lower', re: /\blength\s+at\s+least\s+(\S+)/i },
  { kind: 'fixed', re: /\bof\s+length\s+(\S+)/i }
];

const CHAR_ITEM = '[`\'"「『]?[!-~][`\'"」』]?';
const CHAR_SEP = '\\s*(?:と|または|もしくは|あるいは|か|、|,|および|及び|\\bor\\b|\\band\\b)\\s*';
const CHAR_RUN_RE = new RegExp(
  `(?<=^|[\\sはがの:(])(${CHAR_ITEM}(?:${CHAR_SEP}${CHAR_ITEM})+)\\s*(?:のみ|だけ)?\\s*`
  + '(?=から|のいずれか|のどちらか|のうち|である|です|で構成|[.。]?$)'
);
const CHAR_SEP_SPLIT_RE = new RegExp(CHAR_SEP);

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ',
  times: '×', le: '≤', ge: '≥', ne: '≠', hellip: '…', minus: '-'
};

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

const REASONS = {
  unreadable: (line) => `この行は読み取れませんでした（${line}）。`,
  graph: 'グラフ・木の入力には最初の版では対応していません。',
  pairs: '複数の値が並ぶ行のくり返しには最初の版では対応していません。',
  query: 'クエリの入力には最初の版では対応していません。',
  testcase: 'テストケースが複数ある入力には最初の版では対応していません。',
  mixedList: '数と数列が同じ行に並ぶ形には最初の版では対応していません。',
  stringList: '空白区切りの文字列の並びには最初の版では対応していません。',
  sum: '合計についての制約（∑）は反映していません。',
  stringInInts: (name) => `${name} は文字列のようですが、数と同じ行の文字列には対応していないため外しました。`,
  missingRange: (name, lo, hi) => `${name} の範囲の制約が見つからなかったため、仮に ${lo} 以上 ${hi} 以下にしました。`,
  missingLower: (name, lo) => `${name} の下限の制約が見つからなかったため、仮に ${lo} にしました。`,
  missingUpper: (name, hi) => `${name} の上限の制約が見つからなかったため、仮に ${hi} にしました。`,
  missingLength: (name, lo, hi) => `${name} の長さの制約が見つからなかったため、仮に ${lo} 以上 ${hi} 以下にしました。`,
  missingLengthLower: (name, lo) => `${name} の長さの下限が見つからなかったため、仮に ${lo} にしました。`,
  missingLengthUpper: (name, hi) => `${name} の長さの上限が見つからなかったため、仮に ${hi} にしました。`,
  missingCharset: (name, label) => `${name} に使う文字の制約が見つからなかったため、仮に${label}にしました。`,
  missingCols: (name, cols) => `${name} の各行の長さの制約が見つからなかったため、仮に ${cols} にしました。`,
  variableLength: (name) => `${name} の長さがそろっていない形には対応していないため、すべて最大の長さにしました。`,
  spacedChars: (name) => `${name} の文字が空白区切りで並ぶ形には対応していません。`,
  sizeUnknown: (text, fallback) => `個数 ${text} を式として使えないため、仮に ${fallback} にしました。`,
  relationIgnored: (raw) => `「${raw}」の関係は反映していません。`,
  boundIgnored: (raw) => `「${raw}」は反映していません。`,
  multipleBounds: (name, side, options, chosen) => `${name} の${side === 'lower' ? '下限' : '上限'}の候補が複数あります（${options.join('、')}）。${chosen} にしました。`,
  specific: (raw) => `「${raw}」のような一部の要素だけの制約は反映していません。`,
  duplicateName: (oldName, newName) => `名前 ${oldName} が重なっていたため ${newName} にしました。`
};

function fail(message) {
  return { ok: false, message };
}

// ---------- URL ----------

function parseTaskUrl(url) {
  if (typeof url !== 'string') {
    return null;
  }
  const text = url.trim();
  if (!text) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'atcoder.jp'
    || parsed.username || parsed.password || parsed.port) {
    return null;
  }

  const match = /^\/contests\/([A-Za-z0-9_-]+)\/tasks\/([A-Za-z0-9_-]+)\/?$/.exec(parsed.pathname);
  return match ? { contest: match[1], task: match[2] } : null;
}

function isAtCoderTaskUrl(url) {
  try {
    return parseTaskUrl(url) !== null;
  } catch {
    return false;
  }
}

function toJapaneseTaskUrl(url) {
  try {
    const task = parseTaskUrl(url);
    return task ? `https://atcoder.jp/contests/${task.contest}/tasks/${task.task}?lang=ja` : '';
  } catch {
    return '';
  }
}

// ---------- HTML ----------

function decodeEntities(text) {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

function htmlFragmentToLines(fragment, keepNewlines) {
  let text = fragment;
  if (!keepNewlines) {
    text = text.replace(/\s+/g, ' ');
  }
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|li|div|pre|h[1-6]|tr|ul|ol|section|dd|dt)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean);
}

function extractLangJa(html) {
  const open = /<span\b[^>]*\bclass\s*=\s*["'][^"']*\blang-ja\b[^"']*["'][^>]*>/i.exec(html);
  if (!open) {
    return null;
  }

  const start = open.index + open[0].length;
  const tagRe = /<(\/?)span\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, match.index);
      }
    } else if (!/\/>$/.test(match[0])) {
      depth += 1;
    }
  }
  return html.slice(start);
}

function classifyHeading(raw) {
  const text = toHalfWidth(String(raw)).replace(/\s+/g, ' ').trim().replace(/\s*:$/, '');
  if (!text) {
    return null;
  }
  if (text === '制約') {
    return { section: 'constraints', lang: 'ja' };
  }
  if (text === '入力') {
    return { section: 'input', lang: 'ja' };
  }
  if (/^constraints$/i.test(text)) {
    return { section: 'constraints', lang: 'en' };
  }
  if (/^input$/i.test(text)) {
    return { section: 'input', lang: 'en' };
  }
  if (/^(?:問題文|入力例|出力例|出力|注記|注意|配点|部分点|problem statement|sample input|sample output|output|notes?|score)(?:\s*\d+)?(?:\s*copy)?$/i.test(text)) {
    return { section: 'other', lang: '' };
  }
  return null;
}

function pickSections(region) {
  const found = { input: null, constraints: null };
  const sectionRe = /<section\b[^>]*>([\s\S]*?)<\/section\s*>/gi;
  let match;
  while ((match = sectionRe.exec(region)) !== null) {
    const body = match[1];
    const heading = /<h3\b[^>]*>([\s\S]*?)<\/h3\s*>/i.exec(body);
    if (!heading) {
      continue;
    }
    const kind = classifyHeading(htmlFragmentToLines(heading[1], false).join(' '));
    if (!kind || (kind.section !== 'input' && kind.section !== 'constraints') || found[kind.section]) {
      continue;
    }
    const content = body.slice(heading.index + heading[0].length);
    if (kind.section === 'input') {
      const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/i.exec(content);
      found.input = pre ? htmlFragmentToLines(pre[1], true) : htmlFragmentToLines(content, false);
    } else {
      found.constraints = htmlFragmentToLines(content, false);
    }
  }
  return found;
}

function extractProblemSectionsFromHtml(html) {
  try {
    if (typeof html !== 'string' || !html.trim()) {
      return fail('ページの内容が空です。');
    }

    const cleaned = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const ja = extractLangJa(cleaned);
    let found = ja === null ? null : pickSections(ja);
    if (!found || !found.input) {
      found = pickSections(cleaned);
    }
    if (!found.input || !found.input.length) {
      return fail('ページの中に「入力」の部分が見つかりませんでした。');
    }

    return {
      ok: true,
      inputText: found.input.join('\n'),
      constraintsText: found.constraints ? found.constraints.join('\n') : ''
    };
  } catch {
    return fail('ページの読み取り中にエラーが起きました。');
  }
}

// ---------- Text normalization ----------

function toHalfWidth(text) {
  return text
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

function normalizeMathLine(line) {
  let s = toHalfWidth(String(line)).replace(/[ \t]/g, ' ');
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => `^${[...m].map((c) => SUPERSCRIPT_DIGITS.indexOf(c)).join('')}`);
  for (let i = 0; i < 3; i += 1) {
    s = s.replace(/\\(?:mathrm|textrm|text|mathtt|texttt|mathbf|textbf|mathit|mathsf|operatorname|rm)\s*\{([^{}]*)\}/g, '$1');
  }
  s = s.replace(/\\verb(.)(.*?)\1/g, '$2');
  s = s.replace(/\\[()[\]]/g, ' ').replace(/\$/g, ' ');
  s = s.replace(/\\(?:left|right|[bB]igg?[lr]?)(?![A-Za-z])/g, '');
  s = s.replace(/\\[lr]?vert(?![A-Za-z])/g, '|');
  s = s.replace(/\\le(?:qq|q|qslant)?(?![A-Za-z])|[≦≤⩽]/g, '≤');
  s = s.replace(/\\ge(?:qq|q|qslant)?(?![A-Za-z])|[≧≥⩾]/g, '≥');
  s = s.replace(/\\neq?(?![A-Za-z])|≠/g, '≠');
  s = s.replace(/\\lt(?![A-Za-z])/g, '<').replace(/\\gt(?![A-Za-z])/g, '>');
  s = s.replace(/\\vdots(?![A-Za-z])|[⋮︙]/g, '⋮');
  s = s.replace(/\\(?:ldots|cdots|dots[bcmio]?)(?![A-Za-z])|[…⋯‥]|\.{3,}/g, '…');
  s = s.replace(/\\(?:times|cdot)(?![A-Za-z])|✕/g, '×');
  s = s.replace(/\\in(?![A-Za-z])/g, '∈');
  s = s.replace(/\\sum(?![A-Za-z])|Σ/g, '∑');
  s = s.replace(/\\(?:displaystyle|limits)(?![A-Za-z])/g, ' ');
  s = s.replace(/\\([#%&_{}])/g, '$1');
  s = s.replace(/\\(?:quad|qquad)(?![A-Za-z])|\\[,;: ]|~/g, ' ').replace(/\\!/g, '');
  s = s.replace(/\^\s*\{\s*([^{}]*?)\s*\}/g, '^$1');
  s = s.replace(/[−‐‑–]/g, '-');
  s = s.replace(/\|\s*([^|]*?)\s*\|/g, '|$1|');
  return s.replace(/ {2,}/g, ' ').trim();
}

function isProse(line) {
  if (JAPANESE_RE.test(line)) {
    return true;
  }
  return line.split(' ').length >= 3 && ENGLISH_PROSE_RE.test(line);
}

function stripLeadingProse(text) {
  let last = -1;
  for (let i = 0; i < text.length; i += 1) {
    if (JAPANESE_RE.test(text[i])) {
      last = i;
    }
  }
  return last >= 0 ? text.slice(last + 1) : text;
}

function stripTrailingProse(text) {
  for (let i = 0; i < text.length; i += 1) {
    if (JAPANESE_RE.test(text[i])) {
      return text.slice(0, i);
    }
  }
  return text;
}

function splitTopLevel(text, separators) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '{' || ch === '(' || ch === '[') {
      depth += 1;
    } else if (ch === '}' || ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && separators.includes(ch)) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function splitSubs(braced, plain) {
  if (braced !== undefined) {
    return braced.split(',').map((part) => part.replace(/\s+/g, ''));
  }
  return plain !== undefined ? [plain] : [];
}

// ---------- Numbers and terms ----------

function makeNum(value, text) {
  return { type: 'num', value, text };
}

function scaleDecimal(mantissa, exponent) {
  const [whole, frac = ''] = mantissa.split('.');
  const digits = BigInt(whole + frac);
  const shift = exponent - frac.length;
  if (shift >= 0) {
    return digits * 10n ** BigInt(shift);
  }
  const divisor = 10n ** BigInt(-shift);
  return digits % divisor === 0n ? digits / divisor : null;
}

function signed(sign, value) {
  return sign ? -value : value;
}

function parseNumberText(text) {
  let t = String(text).replace(/\s+/g, '').replace(/\\times|\*/g, '×');
  if (/^-?\d{1,3}(?:,\d{3})+$/.test(t)) {
    t = t.replace(/,/g, '');
  }

  let m = /^(-?)(\d+)$/.exec(t);
  if (m) {
    return makeNum(BigInt(m[1] + m[2]), t);
  }
  m = /^(-?)(\d+(?:\.\d+)?)×10\^(\d+)$/.exec(t);
  if (m && Number(m[3]) <= MAX_EXPONENT) {
    const value = scaleDecimal(m[2], Number(m[3]));
    return value === null ? null : makeNum(signed(m[1], value), `${m[1]}${m[2]}×10^${m[3]}`);
  }
  m = /^(-?)10\^(\d+)$/.exec(t);
  if (m && Number(m[2]) <= MAX_EXPONENT) {
    return makeNum(signed(m[1], 10n ** BigInt(m[2])), `${m[1]}10^${m[2]}`);
  }
  m = /^(-?)(\d{1,6})\^(\d+)$/.exec(t);
  if (m && Number(m[3]) <= MAX_EXPONENT) {
    const value = signed(m[1], BigInt(m[2]) ** BigInt(m[3]));
    return makeNum(value, value.toString());
  }
  m = /^(-?)(\d+(?:\.\d+)?)e(\d+)$/i.exec(t);
  if (m && Number(m[3]) <= MAX_EXPONENT) {
    const value = scaleDecimal(m[2], Number(m[3]));
    return value === null ? null : makeNum(signed(m[1], value), `${m[1]}${m[2]}e${m[3]}`);
  }
  m = /^(.+?\d)([+-])(\d+)$/.exec(t);
  if (m && /[\^×e]/i.test(m[1])) {
    const base = parseNumberText(m[1]);
    if (base) {
      const value = m[2] === '+' ? base.value + BigInt(m[3]) : base.value - BigInt(m[3]);
      return makeNum(value, value.toString());
    }
  }
  return null;
}

function parseVarTerm(compact) {
  const m = TERM_VAR_RE.exec(compact);
  if (!m) {
    return null;
  }
  const subs = splitSubs(m[2], m[3]);
  if (subs.some((part) => part === '')) {
    return null;
  }
  return {
    type: 'var',
    base: m[1],
    subs,
    offset: m[4] ? BigInt(m[4] + m[5]) : 0n,
    raw: compact
  };
}

function parseTerm(text) {
  const t = String(text).trim().replace(/[.,、。;:]+$/, '').trim();
  if (!t) {
    return { type: 'other', text: t };
  }
  if (t === '…') {
    return { type: 'ellipsis' };
  }

  const number = parseNumberText(t);
  if (number) {
    return number;
  }

  const compact = t.replace(/\s+/g, '');
  const len = /^\|([^|]+)\|$/.exec(compact);
  if (len) {
    const inner = parseVarTerm(len[1]);
    return inner && inner.offset === 0n
      ? { type: 'len', base: inner.base, subs: inner.subs, raw: t }
      : { type: 'other', text: t };
  }

  const variable = parseVarTerm(compact);
  if (variable) {
    return { ...variable, raw: t };
  }

  const pieces = splitTopLevel(compact, ',、');
  if (pieces.length > 1) {
    const items = pieces.map(parseTerm);
    if (items.every((item) => item.type === 'var' || item.type === 'len')) {
      return { type: 'list', items, raw: t };
    }
  }
  return { type: 'other', text: t };
}

function parseSimpleExpr(text) {
  const t = String(text).replace(/\s+/g, '');
  let m = /^(\d+)$/.exec(t);
  if (m) {
    return { type: 'num', value: BigInt(m[1]) };
  }
  m = /^([A-Za-z][A-Za-z0-9_]*)(?:([+-])(\d+))?$/.exec(t);
  if (m) {
    return { type: 'var', name: m[1], offset: m[2] ? BigInt(m[2] + m[3]) : 0n };
  }
  return null;
}

function formatVar(name, offset) {
  if (offset === 0n) {
    return name;
  }
  return offset > 0n ? `${name}+${offset}` : `${name}${offset}`;
}

function literalValue(expr) {
  const number = typeof expr === 'string' ? parseNumberText(expr) : null;
  return number ? number.value : null;
}

function isGenericSubs(subs) {
  return subs.length > 0 && subs.every((part) => /^[a-z](?:[+-]\d+)?$/.test(part));
}

function isIndexedVar(term) {
  return Boolean(term) && term.type === 'var' && term.subs.length > 0;
}

function specificKey(term) {
  return `${term.base}_${term.subs.join('_')}`;
}

function findVarTerms(text) {
  const terms = [];
  for (const m of text.matchAll(VAR_SCAN_RE)) {
    const subs = splitSubs(m[2], m[3]);
    if (!subs.length && /^[ijkl]$/.test(m[1])) {
      continue;
    }
    terms.push({ type: 'var', base: m[1], subs, offset: 0n, raw: m[0] });
  }
  return terms;
}

// ---------- Constraints ----------

function createFacts() {
  return {
    lower: new Map(),
    upper: new Map(),
    lengthLower: new Map(),
    lengthUpper: new Map(),
    strings: new Set(),
    charsets: new Map(),
    distinct: new Set(),
    order: new Map(),
    specific: new Map(),
    sumBases: new Set(),
    sumLines: [],
    graphHint: false
  };
}

function sameCandidate(a, b) {
  if (a.type !== b.type) {
    return false;
  }
  if (a.type === 'num') {
    return a.value === b.value;
  }
  if (a.type === 'ref') {
    return a.key === b.key && a.offset === b.offset && a.element === b.element;
  }
  return a.text === b.text;
}

function pushCandidate(map, key, candidate) {
  const list = map.get(key) || [];
  if (!list.some((item) => sameCandidate(item, candidate))) {
    list.push(candidate);
  }
  map.set(key, list);
}

function makeCandidate(value, adjust, raw) {
  if (value.type === 'num') {
    const result = value.value + adjust;
    return { type: 'num', value: result, text: adjust === 0n ? value.text : result.toString() };
  }
  if (value.type === 'var') {
    const element = isGenericSubs(value.subs);
    return {
      type: 'ref',
      key: value.subs.length === 0 || element ? value.base : specificKey(value),
      element,
      offset: value.offset + adjust,
      raw
    };
  }
  return { type: 'other', text: value.text || value.raw || '', raw };
}

function addBound(facts, target, side, value, adjust, info, equality) {
  if (!target || (target.type !== 'var' && target.type !== 'len')) {
    return;
  }
  if (!value || value.type === 'ellipsis' || value.type === 'list') {
    return;
  }
  // "|S| = N" defines a length, and "A = (A_1, ..., A_N)" is a definition, not a bound.
  if (equality && (value.type === 'len' || value.type === 'other')) {
    return;
  }

  const candidate = makeCandidate(value, adjust - (target.offset || 0n), info.raw);
  if (target.type === 'len') {
    pushCandidate(side === 'lower' ? facts.lengthLower : facts.lengthUpper, target.base, candidate);
    if (!info.fromPhrase) {
      facts.strings.add(target.base);
    }
    return;
  }

  const map = side === 'lower' ? facts.lower : facts.upper;
  if (target.subs.length === 0 || isGenericSubs(target.subs)) {
    pushCandidate(map, target.base, candidate);
    return;
  }
  pushCandidate(map, specificKey(target), candidate);
  if (info.orderChain) {
    pushCandidate(map, target.base, candidate);
  } else {
    const list = facts.specific.get(target.base) || [];
    list.push(info.raw);
    facts.specific.set(target.base, list);
  }
}

function recordOrder(facts, base, op) {
  const order = { '<': 'strictAsc', '≤': 'asc', '>': 'strictDesc', '≥': 'desc' }[op];
  if (order) {
    facts.order.set(base, order);
  }
}

function areDifferentIndexes(a, b) {
  return a.length === b.length
    && a.join(',') !== b.join(',')
    && a.concat(b).every((part) => /^[a-z]$/.test(part));
}

function itemsOf(term) {
  return term.type === 'list' ? term.items : [term];
}

function applyRelation(facts, left, op, right, info) {
  if (!left || !right) {
    return;
  }
  if (left.type === 'ellipsis' || right.type === 'ellipsis') {
    const a = left.type === 'ellipsis' ? info.prev : left;
    const b = right.type === 'ellipsis' ? info.next : right;
    if (isIndexedVar(a) && isIndexedVar(b) && a.base === b.base) {
      recordOrder(facts, a.base, op);
    }
    return;
  }
  if (op === '≠') {
    if (isIndexedVar(left) && isIndexedVar(right) && left.base === right.base
      && areDifferentIndexes(left.subs, right.subs)) {
      facts.distinct.add(left.base);
    }
    return;
  }
  if (isIndexedVar(left) && isIndexedVar(right) && left.base === right.base) {
    recordOrder(facts, left.base, op);
    return;
  }

  const lefts = itemsOf(left);
  const rights = itemsOf(right);
  if (op === '=') {
    for (const a of lefts) {
      for (const b of rights) {
        addBound(facts, a, 'lower', b, 0n, info, true);
        addBound(facts, a, 'upper', b, 0n, info, true);
        addBound(facts, b, 'lower', a, 0n, info, true);
        addBound(facts, b, 'upper', a, 0n, info, true);
      }
    }
    return;
  }

  const flipped = op === '≥' || op === '>';
  const strict = op === '<' || op === '>';
  const smalls = flipped ? rights : lefts;
  const bigs = flipped ? lefts : rights;
  for (const a of smalls) {
    for (const b of bigs) {
      addBound(facts, a, 'upper', b, strict ? -1n : 0n, info, false);
      addBound(facts, b, 'lower', a, strict ? 1n : 0n, info, false);
    }
  }
}

function hasSameBasePair(terms) {
  for (let k = 0; k + 1 < terms.length; k += 1) {
    const a = terms[k].type === 'ellipsis' ? terms[k - 1] : terms[k];
    const b = terms[k + 1].type === 'ellipsis' ? terms[k + 2] : terms[k + 1];
    if (isIndexedVar(a) && isIndexedVar(b) && a.base === b.base) {
      return true;
    }
  }
  return false;
}

function parseChain(line, facts) {
  const parts = line.split(/(≤|≥|<|>|≠|=)/);
  const texts = parts.filter((_, i) => i % 2 === 0);
  const ops = parts.filter((_, i) => i % 2 === 1);
  if (!ops.length) {
    return;
  }
  texts[0] = stripLeadingProse(texts[0]);
  texts[texts.length - 1] = stripTrailingProse(texts[texts.length - 1]);

  const terms = texts.map(parseTerm);
  const orderChain = hasSameBasePair(terms);
  for (let k = 0; k < ops.length; k += 1) {
    applyRelation(facts, terms[k], ops[k], terms[k + 1], {
      prev: terms[k - 1],
      next: terms[k + 2],
      orderChain,
      raw: `${texts[k].trim()} ${ops[k]} ${texts[k + 1].trim()}`
    });
  }
}

// Removes conditions such as "(1 ≤ i ≤ N)" or "(i ≠ j)" at the end.
function stripTrailingConditions(line) {
  let s = line.trim();
  for (let guard = 0; guard < 3; guard += 1) {
    s = s.replace(/[,、.。;]+$/, '').trim();
    if (!s.endsWith(')')) {
      break;
    }
    let depth = 0;
    let open = -1;
    for (let i = s.length - 1; i >= 0; i -= 1) {
      if (s[i] === ')') {
        depth += 1;
      } else if (s[i] === '(') {
        depth -= 1;
        if (depth === 0) {
          open = i;
          break;
        }
      }
    }
    if (open <= 0 || /[A-Za-z0-9_\\}]/.test(s[open - 1])) {
      break;
    }
    s = s.slice(0, open).trim();
  }
  return s;
}

// Splits "1 ≤ N ≤ 10, 1 ≤ M ≤ 10" but keeps "1 ≤ H, W ≤ 500" together.
function splitStatements(line) {
  const pieces = splitTopLevel(line, ',、');
  const statements = [];
  let current = pieces[0];
  for (let i = 1; i < pieces.length; i += 1) {
    const next = pieces[i];
    if (/[\d)]\s*$/.test(current) && RELATION_RE.test(current) && RELATION_RE.test(next)) {
      statements.push(current);
      current = next;
    } else {
      current = `${current},${next}`;
    }
  }
  statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
}

function extractExplicitChars(text) {
  const m = CHAR_RUN_RE.exec(text);
  if (!m) {
    return '';
  }
  const chars = [];
  for (const piece of m[1].split(CHAR_SEP_SPLIT_RE)) {
    const ch = piece.trim().replace(/^[`'"「『](.)[`'"」』]$/, '$1');
    if (ch.length === 1 && !chars.includes(ch)) {
      chars.push(ch);
    }
  }
  return chars.length >= 2 ? chars.join('') : '';
}

function findSubjects(text) {
  let index = text.indexOf('は');
  if (index < 0) {
    const english = /\s(?:is|are|consists?|has)\s/i.exec(text);
    index = english ? english.index : -1;
  }
  const explicit = index >= 0;
  return {
    terms: findVarTerms(explicit ? text.slice(0, index) : text),
    explicit,
    after: explicit ? text.slice(index + 1) : ''
  };
}

function mergeCharset(facts, base, info) {
  const current = facts.charsets.get(base) || { lower: false, upper: false, digit: false, chars: '' };
  let chars = current.chars;
  for (const ch of info.chars) {
    if (!chars.includes(ch)) {
      chars += ch;
    }
  }
  facts.charsets.set(base, {
    lower: current.lower || info.lower,
    upper: current.upper || info.upper,
    digit: current.digit || info.digit,
    chars
  });
}

function addLengthFacts(facts, base, match, raw) {
  const target = { type: 'len', base };
  const info = { raw, orderChain: false, fromPhrase: true };
  const groups = match.groups;
  if (match.kind === 'fixed') {
    const term = parseTerm(groups[0]);
    addBound(facts, target, 'lower', term, 0n, info, false);
    addBound(facts, target, 'upper', term, 0n, info, false);
  } else if (match.kind === 'range') {
    addBound(facts, target, 'lower', parseTerm(groups[0]), 0n, info, false);
    addBound(facts, target, 'upper', parseTerm(groups[1]), groups[2] === '未満' ? -1n : 0n, info, false);
  } else if (match.kind === 'upper') {
    addBound(facts, target, 'upper', parseTerm(groups[0]), groups[1] === '未満' ? -1n : 0n, info, false);
  } else {
    addBound(facts, target, 'lower', parseTerm(groups[0]), 0n, info, false);
  }
}

// Handles "N は 1 以上 100 以下" style sentences.
function applyJapaneseBounds(after, subjects, facts, raw) {
  const info = { raw, orderChain: false };
  let lower = null;
  let upper = null;
  let strict = false;
  const range = /(\S+?)\s*以上\s*(\S+?)\s*(以下|未満)/.exec(after);
  if (range) {
    lower = parseTerm(stripLeadingProse(range[1]));
    upper = parseTerm(stripTrailingProse(range[2]));
    strict = range[3] === '未満';
  } else {
    const up = /(\S+?)\s*(以下|未満)/.exec(after);
    const low = /(\S+?)\s*以上/.exec(after);
    if (up) {
      upper = parseTerm(stripLeadingProse(up[1]));
      strict = up[2] === '未満';
    }
    if (low) {
      lower = parseTerm(stripLeadingProse(low[1]));
    }
  }
  for (const subject of subjects) {
    if (lower && lower.type !== 'other') {
      addBound(facts, subject, 'lower', lower, 0n, info, false);
    }
    if (upper && upper.type !== 'other') {
      addBound(facts, subject, 'upper', upper, strict ? -1n : 0n, info, false);
    }
  }
}

function applyTextFacts(line, facts) {
  let rest = line;
  let lengthMatch = null;
  for (const pattern of LENGTH_PATTERNS) {
    const m = pattern.re.exec(rest);
    if (m) {
      lengthMatch = { kind: pattern.kind, groups: m.slice(1) };
      rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
      break;
    }
  }

  const lower = /英小文字|小文字|lowercase/i.test(rest);
  const upper = /英大文字|大文字|uppercase/i.test(rest);
  const digit = /数字|\bdigits?\b/i.test(rest);
  const letters = !lower && !upper && /英字|英文字|アルファベット|\bletters\b/i.test(rest);
  const chars = extractExplicitChars(rest);
  const stringWord = /文字列|\bstrings?\b/i.test(rest);
  const distinctWord = DISTINCT_RE.test(rest);
  const japaneseBound = !RELATION_RE.test(rest) && /以上|以下|未満/.test(rest);
  if (!lengthMatch && !lower && !upper && !digit && !letters && !chars
    && !stringWord && !distinctWord && !japaneseBound) {
    return;
  }

  const subjects = findSubjects(rest);
  if (!subjects.terms.length) {
    return;
  }
  const sequenceWord = /数列|整数列|順列|\bsequence\b|\barray\b|\bpermutation\b/i.test(line);
  const isStringLine = stringWord || lower || upper || letters
    || (digit && /から(?:なる|成る)|consist/i.test(rest))
    || (Boolean(lengthMatch) && !sequenceWord);
  for (const subject of subjects.terms) {
    if (isStringLine) {
      facts.strings.add(subject.base);
    }
    if (lower || upper || digit || letters || chars) {
      mergeCharset(facts, subject.base, {
        lower: lower || letters,
        upper: upper || letters,
        digit,
        chars
      });
    }
    if (distinctWord) {
      facts.distinct.add(subject.base);
    }
    if (lengthMatch) {
      addLengthFacts(facts, subject.base, lengthMatch, line);
    }
  }
  if (japaneseBound && subjects.explicit) {
    applyJapaneseBounds(subjects.after, subjects.terms, facts, line);
  }
}

function recordSum(line, facts) {
  facts.sumLines.push(line);
  const body = line.replace(/∑\s*(?:_\{[^{}]*\}|_\S)?\s*(?:\^\{[^{}]*\}|\^\S+)?/g, '∑ ');
  for (const term of findVarTerms(body)) {
    facts.sumBases.add(term.base);
  }
}

function parseConstraintStatement(line, facts) {
  const neq = SAME_BASE_NEQ_RE.exec(line);
  if (neq) {
    const a = neq[2].replace(/[{}]/g, '');
    const b = neq[3].replace(/[{}]/g, '');
    if (/^[a-z]$/.test(a) && /^[a-z]$/.test(b) && a !== b) {
      facts.distinct.add(neq[1]);
    }
  }
  applyTextFacts(line, facts);
  const core = stripTrailingConditions(line);
  if (RELATION_RE.test(core)) {
    parseChain(core, facts);
  }
}

function parseConstraints(lines) {
  const facts = createFacts();
  for (const raw of lines) {
    const line = normalizeMathLine(raw);
    if (!line) {
      continue;
    }
    if (GRAPH_RE.test(line)) {
      facts.graphHint = true;
    }
    if (SUM_RE.test(line)) {
      recordSum(line, facts);
      continue;
    }
    for (const statement of splitStatements(line)) {
      parseConstraintStatement(statement, facts);
    }
  }
  return facts;
}

function isStringLike(facts, base) {
  if (facts.strings.has(base)) {
    return true;
  }
  const charset = facts.charsets.get(base);
  return Boolean(charset && (charset.lower || charset.upper || /[^0-9]/.test(charset.chars)));
}

// ---------- Format lines ----------

function tokenizeFormatLine(line) {
  const tokens = [];
  let pos = 0;
  while (pos < line.length) {
    let space = false;
    while (pos < line.length && line[pos] === ' ') {
      pos += 1;
      space = true;
    }
    if (pos >= line.length) {
      break;
    }
    if (line[pos] === '…') {
      tokens.push({ type: 'ellipsis', spaceBefore: space });
      pos += 1;
      continue;
    }
    FORMAT_VAR_RE.lastIndex = pos;
    const m = FORMAT_VAR_RE.exec(line);
    if (!m) {
      return null;
    }
    const subs = splitSubs(m[2], m[3]);
    if (subs.some((part) => part === '')) {
      return null;
    }
    tokens.push({ type: 'var', base: m[1], subs, spaceBefore: space });
    pos += m[0].length;
  }
  return tokens.length ? tokens : null;
}

function describeFormatLine(raw) {
  const line = normalizeMathLine(raw);
  if (!line) {
    return null;
  }
  if (VDOTS_LINE_RE.test(line)) {
    return { kind: 'vdots', text: line };
  }
  const tokens = tokenizeFormatLine(line);
  return tokens ? { kind: 'tokens', tokens, text: line } : { kind: 'unreadable', text: line };
}

function shapeOf(tokens) {
  return tokens.map((t) => (t.type === 'var' ? `v:${t.base}:${t.subs.length}` : 'e')).join(' ');
}

function isLiteralIndex(text) {
  return /^\d+$/.test(text);
}

function unsupported(reason, extra = {}) {
  return { type: 'unsupported', reason, notes: [], ...extra };
}

function findVerticalBlock(descs, index) {
  const first = descs[index];
  if (!first.tokens.some((t) => t.type === 'var' && t.subs.length > 0)) {
    return null;
  }
  const shape = shapeOf(first.tokens);
  let k = index + 1;
  while (k < descs.length && k - index <= 3 && descs[k].kind === 'tokens' && shapeOf(descs[k].tokens) === shape) {
    k += 1;
  }
  if (k >= descs.length || descs[k].kind !== 'vdots') {
    return null;
  }
  const last = descs[k + 1];
  if (!last || last.kind !== 'tokens' || shapeOf(last.tokens) !== shape) {
    return null;
  }
  return { first, last, next: k + 2 };
}

function classifyVertical(first, last, facts) {
  const tokens = first.tokens;
  const vars = tokens.filter((t) => t.type === 'var');
  const lastVars = last.tokens.filter((t) => t.type === 'var');
  const hasEllipsis = tokens.some((t) => t.type === 'ellipsis');
  const blockText = `${first.text} ⋮ ${last.text}`;

  if (tokens.length === 1 && vars.length === 1 && vars[0].subs.length === 1) {
    const base = vars[0].base;
    const range = { start: vars[0].subs[0], end: lastVars[0].subs[0] };
    if (!isLiteralIndex(range.start)) {
      return unsupported(REASONS.unreadable(blockText));
    }
    if (QUERY_NAME_RE.test(base)) {
      return unsupported(REASONS.query);
    }
    if (CASE_NAME_RE.test(base)) {
      return unsupported(REASONS.testcase, { countEnd: range.end });
    }
    if (isStringLike(facts, base)) {
      return { type: 'grid', key: base, name: base, rowsRange: range, colsRange: null, spaced: false, notes: [] };
    }
    return { type: 'intList', key: base, name: base, layout: 'column', range, notes: [] };
  }

  const sameBase = vars.length > 0 && vars.every((t) => t.base === vars[0].base);
  if (sameBase && hasEllipsis && vars.length >= 2 && vars.every((t) => t.subs.length === 2)
    && tokens[0].type === 'var' && tokens[tokens.length - 1].type === 'var') {
    const base = vars[0].base;
    const rowStart = vars[0].subs[0];
    const colStart = vars[0].subs[1];
    const colEnd = vars[vars.length - 1].subs[1];
    const rowEnd = lastVars[0].subs[0];
    const rectangular = vars.every((t) => t.subs[0] === rowStart)
      && lastVars.every((t) => t.subs[0] === rowEnd)
      && lastVars[0].subs[1] === colStart
      && lastVars[lastVars.length - 1].subs[1] === colEnd;
    if (!rectangular || !isLiteralIndex(rowStart) || !isLiteralIndex(colStart)) {
      return unsupported(REASONS.unreadable(blockText));
    }
    const rowsRange = { start: rowStart, end: rowEnd };
    const colsRange = { start: colStart, end: colEnd };
    const concatenated = tokens[1].spaceBefore === false;
    if (concatenated || isStringLike(facts, base)) {
      return { type: 'grid', key: base, name: base, rowsRange, colsRange, spaced: !concatenated, notes: [] };
    }
    return { type: 'matrix', key: base, name: base, rowsRange, colsRange, notes: [] };
  }

  if (!hasEllipsis && vars.length >= 2 && vars.every((t) => t.subs.length === 1)) {
    const graphNames = vars[0].base.toLowerCase() === 'u' && vars[1].base.toLowerCase() === 'v';
    return unsupported(facts.graphHint || graphNames ? REASONS.graph : REASONS.pairs);
  }
  return unsupported(REASONS.unreadable(blockText));
}

function intsVarName(token) {
  return token.subs.length ? `${token.base}_${token.subs.join('_')}` : token.base;
}

function classifyHorizontal(desc, facts) {
  const tokens = desc.tokens;
  const vars = tokens.filter((t) => t.type === 'var');
  const ellipses = tokens.length - vars.length;

  if (ellipses === 0) {
    if (!vars.every((t) => t.subs.every(isLiteralIndex))) {
      return unsupported(REASONS.unreadable(desc.text));
    }
    const base = vars[0].base;
    const fixedList = vars.length >= 2 && vars.every((t, i) => t.base === base && t.subs.length === 1
      && Number(t.subs[0]) === Number(vars[0].subs[0]) + i);
    if (fixedList && !isStringLike(facts, base)) {
      return {
        type: 'intList',
        key: base,
        name: base,
        layout: 'row',
        range: { start: vars[0].subs[0], end: vars[vars.length - 1].subs[0] },
        notes: []
      };
    }
    if (vars.length === 1 && vars[0].subs.length === 0 && isStringLike(facts, base)) {
      return { type: 'string', key: base, name: base, lengthRange: null, notes: [] };
    }
    const spec = { type: 'ints', vars: [], notes: [] };
    for (const token of vars) {
      const name = intsVarName(token);
      if (token.subs.length === 0 && isStringLike(facts, token.base)) {
        spec.notes.push(REASONS.stringInInts(name));
        continue;
      }
      spec.vars.push({ name, keys: name === token.base ? [name] : [name, token.base] });
    }
    return spec;
  }

  const listShape = ellipses === 1 && vars.length >= 2
    && tokens[0].type === 'var' && tokens[tokens.length - 1].type === 'var'
    && vars.every((t) => t.base === vars[0].base && t.subs.length === 1);
  if (listShape) {
    const base = vars[0].base;
    const range = { start: vars[0].subs[0], end: vars[vars.length - 1].subs[0] };
    if (!isLiteralIndex(range.start)) {
      return unsupported(REASONS.unreadable(desc.text));
    }
    if (QUERY_NAME_RE.test(base)) {
      return unsupported(REASONS.query);
    }
    if (CASE_NAME_RE.test(base)) {
      return unsupported(REASONS.testcase, { countEnd: range.end });
    }
    const concatenated = tokens[1].spaceBefore === false;
    if (concatenated) {
      return { type: 'string', key: base, name: base, lengthRange: range, notes: [] };
    }
    if (isStringLike(facts, base)) {
      return unsupported(REASONS.stringList);
    }
    return { type: 'intList', key: base, name: base, layout: 'row', range, notes: [] };
  }

  const listBase = vars.length ? vars[vars.length - 1].base : '';
  if (ellipses === 1 && vars.length >= 3 && vars.some((t) => t.base !== listBase)) {
    return unsupported(REASONS.mixedList);
  }
  return unsupported(REASONS.unreadable(desc.text));
}

function groupFormatLines(descs, facts) {
  const specs = [];
  let i = 0;
  while (i < descs.length) {
    const desc = descs[i];
    if (desc.kind !== 'tokens') {
      specs.push(unsupported(REASONS.unreadable(desc.text)));
      i += 1;
      continue;
    }
    const block = findVerticalBlock(descs, i);
    if (block) {
      specs.push(classifyVertical(block.first, block.last, facts));
      i = block.next;
      continue;
    }
    specs.push(classifyHorizontal(desc, facts));
    i += 1;
  }
  return specs;
}

// ---------- Resolution ----------

function sideMap(facts, side) {
  return side === 'lower' ? facts.lower : facts.upper;
}

function candidatesFor(map, keys) {
  for (const key of keys) {
    const list = map.get(key);
    if (list && list.length) {
      return list;
    }
  }
  return [];
}

function tightest(nums, side) {
  return nums.reduce((best, c) => {
    if (side === 'lower') {
      return c.value > best.value ? c : best;
    }
    return c.value < best.value ? c : best;
  });
}

function followNumeric(ctx, key, side, depth) {
  if (depth > MAX_FOLLOW_DEPTH) {
    return null;
  }
  const list = candidatesFor(sideMap(ctx.facts, side), [key]);
  const nums = list.filter((c) => c.type === 'num');
  if (nums.length) {
    return tightest(nums, side).value;
  }
  for (const c of list) {
    if (c.type === 'ref') {
      const value = followNumeric(ctx, c.key, side, depth + 1);
      if (value !== null) {
        return value + c.offset;
      }
    }
  }
  return null;
}

function followBound(ctx, cand, side, threshold, depth) {
  if (depth > MAX_FOLLOW_DEPTH) {
    return null;
  }
  const list = candidatesFor(sideMap(ctx.facts, side), [cand.key]);
  for (const c of list) {
    if (c.type === 'ref' && !c.element && ctx.isAvailable(c.key, threshold)) {
      return formatVar(c.key, c.offset + cand.offset);
    }
  }
  const nums = list.filter((c) => c.type === 'num');
  if (nums.length) {
    const best = tightest(nums, side);
    return cand.offset === 0n ? best.text : (best.value + cand.offset).toString();
  }
  for (const c of list) {
    if (c.type === 'ref') {
      const result = followBound(ctx, { key: c.key, offset: c.offset + cand.offset }, side, threshold, depth + 1);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

// For a scalar, a relation to a later variable or a later list is encoded on that side.
// Relations to names that are not generated (index letters, unsupported rows) are ignored.
function isHandledElsewhere(cand, ctx, threshold) {
  if (cand.element) {
    return ctx.isLaterRow(cand.key, threshold) || !ctx.isKnown(cand.key);
  }
  return ctx.isLaterVar(cand.key, threshold) || !ctx.isKnown(cand.key);
}

function chooseBound(map, keys, side, ctx, target) {
  const notes = [];
  const usable = [];
  const nums = [];
  const refs = [];
  for (const c of candidatesFor(map, keys)) {
    if (c.type === 'num') {
      nums.push(c);
    } else if (c.type === 'ref') {
      if (!c.element && ctx.isAvailable(c.key, target.threshold)) {
        usable.push(c);
      } else {
        refs.push(c);
        if (!target.isScalar || !isHandledElsewhere(c, ctx, target.threshold)) {
          notes.push(REASONS.relationIgnored(c.raw));
        }
      }
    } else {
      notes.push(REASONS.boundIgnored(c.raw || c.text));
    }
  }

  if (usable.length) {
    const chosen = usable[0];
    const expr = formatVar(chosen.key, chosen.offset);
    const options = [...new Set(usable.map((c) => formatVar(c.key, c.offset)))];
    const reach = followNumeric(ctx, chosen.key, side, 0);
    for (const n of nums) {
      const implied = reach !== null
        && (side === 'lower' ? reach + chosen.offset >= n.value : reach + chosen.offset <= n.value);
      if (!implied) {
        options.push(n.text);
      }
    }
    if (options.length > 1) {
      notes.push(REASONS.multipleBounds(target.label, side, options, expr));
    }
    return { expr, notes };
  }
  if (nums.length) {
    return { expr: tightest(nums, side).text, notes };
  }
  for (const c of refs) {
    const expr = followBound(ctx, c, side, target.threshold, 0);
    if (expr) {
      return { expr, notes };
    }
  }
  return { expr: null, notes };
}

function pickDefaultLower(maxExpr, fallback) {
  const max = literalValue(maxExpr);
  return max !== null && max < literalValue(fallback) ? maxExpr : fallback;
}

function pickDefaultUpper(minExpr, fallback) {
  const min = literalValue(minExpr);
  return min !== null && min > literalValue(fallback) ? minExpr : fallback;
}

function digitRange(facts, keys) {
  for (const key of keys) {
    const charset = facts.charsets.get(key);
    if (charset && charset.chars && /^[0-9]+$/.test(charset.chars) && !charset.lower && !charset.upper) {
      const digits = [...charset.chars].map(Number);
      return { min: String(Math.min(...digits)), max: String(Math.max(...digits)) };
    }
  }
  return null;
}

function resolveIntRange(keys, label, ctx, threshold, isScalar, defaults) {
  const target = { label, threshold, isScalar };
  const lower = chooseBound(ctx.facts.lower, keys, 'lower', ctx, target);
  const upper = chooseBound(ctx.facts.upper, keys, 'upper', ctx, target);
  const notes = [...lower.notes, ...upper.notes];
  let min = lower.expr;
  let max = upper.expr;
  if (min === null && max === null) {
    const digits = digitRange(ctx.facts, keys);
    if (digits) {
      min = digits.min;
      max = digits.max;
    } else {
      min = defaults.min;
      max = defaults.max;
      notes.push(REASONS.missingRange(label, min, max));
    }
  } else if (min === null) {
    min = pickDefaultLower(max, defaults.min);
    notes.push(REASONS.missingLower(label, min));
  } else if (max === null) {
    max = pickDefaultUpper(min, defaults.max);
    notes.push(REASONS.missingUpper(label, max));
  }
  return { min, max, notes };
}

function resolveLengthRange(key, label, ctx, threshold) {
  const target = { label: `${label} の長さ`, threshold, isScalar: false };
  const lower = chooseBound(ctx.facts.lengthLower, [key], 'lower', ctx, target);
  const upper = chooseBound(ctx.facts.lengthUpper, [key], 'upper', ctx, target);
  return { min: lower.expr, max: upper.expr, notes: [...lower.notes, ...upper.notes] };
}

function countFromRange(range) {
  const end = parseSimpleExpr(range.end);
  if (!end || !isLiteralIndex(range.start)) {
    return null;
  }
  const start = BigInt(range.start);
  if (end.type === 'num') {
    const value = end.value - start + 1n;
    return value >= 0n ? { text: value.toString(), ref: null } : null;
  }
  return { text: formatVar(end.name, end.offset - start + 1n), ref: end.name };
}

function resolveCount(range, ctx, threshold, notes) {
  const count = countFromRange(range);
  if (count && (!count.ref || ctx.isAvailable(count.ref, threshold))) {
    return count.text;
  }
  notes.push(REASONS.sizeUnknown(range.end, DEFAULT_COUNT));
  return DEFAULT_COUNT;
}

function resolveCharset(facts, key, fallback) {
  const info = facts.charsets.get(key);
  if (!info || (!info.lower && !info.upper && !info.digit && !info.chars)) {
    return { charset: fallback.charset, chars: fallback.chars, missing: true };
  }
  const named = ['lower', 'upper', 'digit'].filter((name) => info[name]);
  if (named.length === 1 && !info.chars) {
    return { charset: named[0], chars: '', missing: false };
  }
  let chars = '';
  const pool = (info.lower ? LOWER_CHARS : '') + (info.upper ? UPPER_CHARS : '')
    + (info.digit ? DIGIT_CHARS : '') + info.chars;
  for (const ch of pool) {
    if (!chars.includes(ch)) {
      chars += ch;
    }
  }
  return { charset: 'custom', chars, missing: false };
}

function finishRow(row, notes) {
  const unique = [...new Set(notes.filter(Boolean))];
  row.needsReview = unique.length > 0;
  row.reviewReason = unique.join(' ');
  return row;
}

function resolveListSpec(spec, ctx, threshold) {
  const notes = [...spec.notes];
  const length = resolveCount(spec.range, ctx, threshold, notes);
  const values = resolveIntRange([spec.key], spec.name, ctx, threshold, false, VALUE_DEFAULTS);
  notes.push(...values.notes);
  for (const raw of ctx.facts.specific.get(spec.key) || []) {
    notes.push(REASONS.specific(raw));
  }
  return finishRow({
    kind: 'intList',
    name: spec.name,
    length,
    min: values.min,
    max: values.max,
    layout: spec.layout,
    distinct: ctx.facts.distinct.has(spec.key),
    order: ctx.facts.order.get(spec.key) || 'none'
  }, notes);
}

function resolveMatrixSpec(spec, ctx, threshold) {
  const notes = [...spec.notes];
  const rows = resolveCount(spec.rowsRange, ctx, threshold, notes);
  const cols = resolveCount(spec.colsRange, ctx, threshold, notes);
  const values = resolveIntRange([spec.key], spec.name, ctx, threshold, false, VALUE_DEFAULTS);
  notes.push(...values.notes);
  return finishRow({ kind: 'matrix', name: spec.name, rows, cols, min: values.min, max: values.max }, notes);
}

function resolveStringSpec(spec, ctx, threshold) {
  const notes = [...spec.notes];
  let minLength;
  let maxLength;
  if (spec.lengthRange) {
    minLength = '';
    maxLength = resolveCount(spec.lengthRange, ctx, threshold, notes);
  } else {
    const len = resolveLengthRange(spec.key, spec.name, ctx, threshold);
    notes.push(...len.notes);
    if (len.min === null && len.max === null) {
      minLength = LENGTH_DEFAULTS.min;
      maxLength = LENGTH_DEFAULTS.max;
      notes.push(REASONS.missingLength(spec.name, minLength, maxLength));
    } else if (len.max === null) {
      minLength = len.min;
      maxLength = pickDefaultUpper(len.min, LENGTH_DEFAULTS.max);
      notes.push(REASONS.missingLengthUpper(spec.name, maxLength));
    } else if (len.min === null) {
      minLength = pickDefaultLower(len.max, LENGTH_DEFAULTS.min);
      maxLength = len.max;
      notes.push(REASONS.missingLengthLower(spec.name, minLength));
    } else {
      minLength = len.min === len.max ? '' : len.min;
      maxLength = len.max;
    }
  }
  const charset = resolveCharset(ctx.facts, spec.key, STRING_DEFAULT_CHARSET);
  if (charset.missing) {
    notes.push(REASONS.missingCharset(spec.name, STRING_DEFAULT_CHARSET.label));
  }
  return finishRow({
    kind: 'string',
    name: spec.name,
    minLength,
    maxLength,
    charset: charset.charset,
    chars: charset.chars
  }, notes);
}

function resolveGridSpec(spec, ctx, threshold) {
  const notes = [...spec.notes];
  const rows = resolveCount(spec.rowsRange, ctx, threshold, notes);
  let cols;
  if (spec.colsRange) {
    cols = resolveCount(spec.colsRange, ctx, threshold, notes);
  } else {
    const len = resolveLengthRange(spec.key, spec.name, ctx, threshold);
    notes.push(...len.notes);
    if (len.max !== null) {
      cols = len.max;
      if (len.min !== len.max) {
        notes.push(REASONS.variableLength(spec.name));
      }
    } else {
      cols = ctx.isAvailable('W', threshold) ? 'W' : DEFAULT_COUNT;
      notes.push(REASONS.missingCols(spec.name, cols));
    }
  }
  const charset = resolveCharset(ctx.facts, spec.key, GRID_DEFAULT_CHARSET);
  if (charset.missing) {
    notes.push(REASONS.missingCharset(spec.name, GRID_DEFAULT_CHARSET.label));
  }
  if (spec.spaced) {
    notes.push(REASONS.spacedChars(spec.name));
  }
  return finishRow({
    kind: 'grid',
    name: spec.name,
    rows,
    cols,
    charset: charset.charset,
    chars: charset.chars
  }, notes);
}

function resolveNonIntsSpec(spec, ctx, threshold) {
  switch (spec.type) {
    case 'intList':
      return resolveListSpec(spec, ctx, threshold);
    case 'matrix':
      return resolveMatrixSpec(spec, ctx, threshold);
    case 'string':
      return resolveStringSpec(spec, ctx, threshold);
    case 'grid':
      return resolveGridSpec(spec, ctx, threshold);
    default:
      return finishRow({ kind: 'ints', vars: [] }, [spec.reason, ...spec.notes]);
  }
}

function resolveIntsSpec(spec, ctx, sizeVars) {
  const notes = [...spec.notes];
  const vars = spec.vars.map((v) => {
    const defaults = sizeVars.has(v.name) ? SIZE_DEFAULTS : VALUE_DEFAULTS;
    const range = resolveIntRange(v.keys, v.name, ctx, v.seq, true, defaults);
    notes.push(...range.notes);
    return { name: v.name, min: range.min, max: range.max };
  });
  return finishRow({ kind: 'ints', vars }, notes);
}

function claimName(name, used, notes) {
  let result = name;
  for (let n = 2; used.has(result); n += 1) {
    result = `${name}${n}`;
  }
  if (result !== name) {
    notes.push(REASONS.duplicateName(name, result));
  }
  used.add(result);
  return result;
}

function collectSizeRefs(row, sizeVars) {
  for (const field of ['length', 'rows', 'cols', 'minLength', 'maxLength']) {
    if (typeof row[field] === 'string') {
      const expr = parseSimpleExpr(row[field]);
      if (expr && expr.type === 'var') {
        sizeVars.add(expr.name);
      }
    }
  }
}

function markRelatedRows(specs, facts) {
  for (const spec of specs) {
    if (spec.type !== 'unsupported' || !spec.countEnd) {
      continue;
    }
    const expr = parseSimpleExpr(spec.countEnd);
    const name = expr && expr.type === 'var' ? expr.name : null;
    for (const other of specs) {
      if (other.type === 'ints' && other.vars.some((v) => v.name === name)) {
        other.notes.push(REASONS.testcase);
      }
    }
  }
  for (const spec of specs) {
    const keys = spec.type === 'ints' ? spec.vars.flatMap((v) => v.keys) : [spec.key];
    if (keys.some((key) => key && facts.sumBases.has(key))) {
      spec.notes.push(REASONS.sum);
    }
  }
}

function resolveSpecs(specs, facts) {
  const order = new Map();
  const rowBases = new Map();
  const ctx = {
    facts,
    isAvailable: (name, threshold) => order.has(name) && order.get(name) < threshold,
    isLaterVar: (name, threshold) => order.has(name) && order.get(name) > threshold,
    isLaterRow: (base, threshold) => rowBases.has(base) && rowBases.get(base) > threshold,
    isKnown: (name) => order.has(name) || rowBases.has(name)
  };
  const used = new Set();
  const thresholds = [];
  let seq = 0;
  specs.forEach((spec, index) => {
    thresholds[index] = seq;
    if (spec.type === 'ints') {
      for (const v of spec.vars) {
        v.name = claimName(v.name, used, spec.notes);
        v.seq = seq;
        order.set(v.name, seq);
        seq += 1;
      }
    } else if (spec.name) {
      spec.name = claimName(spec.name, used, spec.notes);
      if (!rowBases.has(spec.key)) {
        rowBases.set(spec.key, seq);
      }
    }
  });
  markRelatedRows(specs, facts);

  const rows = new Array(specs.length);
  const sizeVars = new Set();
  specs.forEach((spec, index) => {
    if (spec.type !== 'ints') {
      rows[index] = resolveNonIntsSpec(spec, ctx, thresholds[index]);
      collectSizeRefs(rows[index], sizeVars);
    }
  });
  specs.forEach((spec, index) => {
    if (spec.type === 'ints') {
      rows[index] = resolveIntsSpec(spec, ctx, sizeVars);
    }
  });
  return rows;
}

function rowLabel(row) {
  if (row.kind === 'ints') {
    return row.vars.length ? `（${row.vars.map((v) => v.name).join('、')}）` : '';
  }
  return `（${row.name}）`;
}

function buildFormat(formatLines, constraintLines) {
  const facts = parseConstraints(constraintLines);
  const descs = formatLines.map(describeFormatLine).filter(Boolean);
  if (!descs.length) {
    return fail('入力の形式が見つかりませんでした。問題文の「入力」の部分を含めてください。');
  }

  const rows = resolveSpecs(groupFormatLines(descs, facts), facts);
  const warnings = [];
  if (!constraintLines.some((line) => String(line).trim())) {
    warnings.push('「制約」の部分が見つからなかったため、値の範囲は仮の値です。');
  }
  for (const line of facts.sumLines) {
    warnings.push(`合計についての制約は反映していません（${line}）。`);
  }
  rows.forEach((row, index) => {
    if (row.needsReview) {
      warnings.push(`${index + 1} 番目の行${rowLabel(row)}：${row.reviewReason}`);
    }
  });
  return { ok: true, format: { rows }, warnings };
}

// ---------- Pasted text ----------

function selectFormatBlock(lines) {
  const block = [];
  let started = false;
  for (const raw of lines) {
    const line = normalizeMathLine(raw);
    if (!line) {
      continue;
    }
    if (isProse(line)) {
      if (started) {
        break;
      }
      continue;
    }
    started = true;
    block.push(raw);
  }
  return block;
}

function classifyLooseLines(lines) {
  const format = [];
  const constraints = [];
  let state = 'before';
  for (const raw of lines) {
    const line = normalizeMathLine(raw);
    if (!line) {
      continue;
    }
    const looksLikeFormat = !isProse(line) && (VDOTS_LINE_RE.test(line) || tokenizeFormatLine(line) !== null);
    if (looksLikeFormat) {
      if (state !== 'after') {
        format.push(raw);
        state = 'in';
      }
      continue;
    }
    if (state === 'in') {
      state = 'after';
    }
    constraints.push(raw);
  }
  return { format, constraints };
}

function splitPastedText(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const headings = lines.map(classifyHeading);
  const hasJapanese = headings.some((h) => h && h.lang === 'ja');
  const buckets = { input: [], constraints: [], unknown: [] };
  const seen = new Set();
  let section = 'unknown';
  lines.forEach((line, index) => {
    const heading = headings[index];
    if (heading) {
      const main = heading.section === 'input' || heading.section === 'constraints';
      if (main && !(hasJapanese && heading.lang === 'en') && !seen.has(heading.section)) {
        seen.add(heading.section);
        section = heading.section;
      } else {
        section = 'other';
      }
      return;
    }
    if (section !== 'other') {
      buckets[section].push(line);
    }
  });

  const loose = classifyLooseLines(buckets.unknown);
  const formatLines = selectFormatBlock(buckets.input);
  return {
    formatLines: formatLines.length ? formatLines : loose.format,
    constraintLines: seen.has('constraints') ? buckets.constraints : loose.constraints
  };
}

function parseProblemText(text) {
  try {
    if (typeof text !== 'string' || !text.trim()) {
      return fail('問題文が空です。「入力」と「制約」の部分を貼り付けてください。');
    }
    const parts = splitPastedText(text);
    return buildFormat(parts.formatLines, parts.constraintLines);
  } catch {
    return fail('問題文の読み取り中にエラーが起きました。');
  }
}

function parseProblemHtml(html) {
  try {
    const sections = extractProblemSectionsFromHtml(html);
    if (!sections.ok) {
      return sections;
    }
    const formatLines = selectFormatBlock(sections.inputText.split('\n'));
    const constraintLines = sections.constraintsText ? sections.constraintsText.split('\n') : [];
    return buildFormat(formatLines, constraintLines);
  } catch {
    return fail('問題文の読み取り中にエラーが起きました。');
  }
}

module.exports = {
  extractProblemSectionsFromHtml,
  isAtCoderTaskUrl,
  parseProblemHtml,
  parseProblemText,
  toJapaneseTaskUrl
};
