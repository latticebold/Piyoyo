'use strict';

const VAR_PATTERN = /^([A-Za-z][A-Za-z0-9_]*)(?:([+-])(.+))?$/;
const POWER_PATTERN = /^(\d+)\^(?:\{([+-]?\d+)\}|([+-]?\d+))$/;
const TERM_PATTERN = /^(\d+(?:\.\d+)?)(?:[eE]([+-]?\d+)|×(\d+)\^(?:\{([+-]?\d+)\}|([+-]?\d+)))?$/;
// Keeps BigInt work bounded when a file contains something like 10^99999999.
const MAX_RESULT_DIGITS = 4000;

const INVALID = { status: 'invalid' };
const TOO_LARGE = { status: 'tooLarge' };

function normalizeText(text) {
  return text
    .replace(/\s+/g, '')
    .replace(/\\times|\\cdot|[*·]/g, '×')
    .replace(/[−－]/g, '-');
}

function fraction(num, den) {
  return { status: 'ok', num, den };
}

function scale(num, den, base, exponentText) {
  const exponent = Number(exponentText);
  const digits = Math.max(base.toString().length, 1) * Math.abs(exponent);
  if (!Number.isFinite(exponent) || digits > MAX_RESULT_DIGITS) {
    return TOO_LARGE;
  }

  if (exponent >= 0) {
    return fraction(num * base ** BigInt(exponent), den);
  }

  if (base === 0n) {
    return INVALID;
  }

  return fraction(num, den * base ** BigInt(-exponent));
}

// Parses one unsigned number such as 200000, 1.5×10^5, 2e5 or 10^9.
function parseTerm(text) {
  if (text.length > MAX_RESULT_DIGITS) {
    return TOO_LARGE;
  }

  const power = POWER_PATTERN.exec(text);
  if (power) {
    return scale(1n, 1n, BigInt(power[1]), power[2] !== undefined ? power[2] : power[3]);
  }

  const match = TERM_PATTERN.exec(text);
  if (!match) {
    return INVALID;
  }

  const [intPart, fracPart = ''] = match[1].split('.');
  const num = BigInt(intPart + fracPart);
  const den = 10n ** BigInt(fracPart.length);
  if (match[2] !== undefined) {
    return scale(num, den, 10n, match[2]);
  }

  if (match[3] !== undefined) {
    return scale(num, den, BigInt(match[3]), match[4] !== undefined ? match[4] : match[5]);
  }

  return fraction(num, den);
}

function parseSignedTerm(text) {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const term = parseTerm(body);
  if (term.status !== 'ok' || !negative) {
    return term;
  }

  return fraction(-term.num, term.den);
}

function toInteger(term) {
  if (term.status !== 'ok') {
    return term;
  }

  if (term.num % term.den !== 0n) {
    return { status: 'notInteger' };
  }

  return { status: 'ok', value: term.num / term.den };
}

// Accepts one number, optionally followed by a single "+number" or "-number" (e.g. 10^9+7).
function classifyLiteral(text) {
  const whole = parseSignedTerm(text);
  if (whole.status !== 'invalid') {
    return toInteger(whole);
  }

  for (let index = 1; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '+' && char !== '-') {
      continue;
    }

    const left = parseSignedTerm(text.slice(0, index));
    const right = parseTerm(text.slice(index + 1));
    if (left.status === 'invalid' || right.status === 'invalid') {
      continue;
    }

    if (left.status !== 'ok' || right.status !== 'ok') {
      return TOO_LARGE;
    }

    const sign = char === '-' ? -1n : 1n;
    return toInteger(fraction(left.num * right.den + sign * right.num * left.den, left.den * right.den));
  }

  return INVALID;
}

function parseIntegerLiteral(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const result = classifyLiteral(normalizeText(text));
  return result.status === 'ok' ? result.value : null;
}

function describe(text) {
  const trimmed = text.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

function fail(message) {
  return { ok: false, message };
}

function parseExpr(text) {
  if (typeof text !== 'string') {
    return fail('式が文字列ではありません。');
  }

  const normalized = normalizeText(text);
  if (normalized === '') {
    return fail('式が空です。');
  }

  const literal = classifyLiteral(normalized);
  if (literal.status === 'ok') {
    return { ok: true, expr: { type: 'literal', value: literal.value } };
  }

  if (literal.status === 'notInteger') {
    return fail(`「${describe(text)}」は整数になりません。`);
  }

  if (literal.status === 'tooLarge') {
    return fail(`「${describe(text)}」は大きすぎて扱えません。`);
  }

  const variable = VAR_PATTERN.exec(normalized);
  if (variable) {
    const [, name, sign, rest] = variable;
    if (sign === undefined) {
      return { ok: true, expr: { type: 'var', name, offset: 0n } };
    }

    const offset = toInteger(parseTerm(rest));
    if (offset.status === 'ok') {
      return { ok: true, expr: { type: 'var', name, offset: sign === '-' ? -offset.value : offset.value } };
    }

    if (offset.status === 'notInteger') {
      return fail(`「${describe(text)}」の足す数・引く数が整数ではありません。`);
    }

    if (offset.status === 'tooLarge') {
      return fail(`「${describe(text)}」は大きすぎて扱えません。`);
    }
  }

  return fail(`「${describe(text)}」は読めません。数（例: 2×10^5）か、変数（例: N、N-1）を書いてください。`);
}

function evaluateExpr(text, env) {
  const parsed = parseExpr(text);
  if (!parsed.ok) {
    return parsed;
  }

  const { expr } = parsed;
  if (expr.type === 'literal') {
    return { ok: true, value: expr.value };
  }

  const hasValue = env !== null && typeof env === 'object'
    && Object.prototype.hasOwnProperty.call(env, expr.name);
  const value = hasValue ? env[expr.name] : undefined;
  if (typeof value === 'bigint') {
    return { ok: true, value: value + expr.offset };
  }

  if (Number.isSafeInteger(value)) {
    return { ok: true, value: BigInt(value) + expr.offset };
  }

  return fail(`変数「${expr.name}」が定義されていません。`);
}

module.exports = {
  evaluateExpr,
  parseExpr,
  parseIntegerLiteral
};
