const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getImportInsertion,
  getMissingImports,
  getPythonHeaderInsertionLine
} = require('../src/pythonImportInsertion');

test('recognizes named imports in a single or multiple-name from import', () => {
  assert.deepEqual(
    getMissingImports(
      'from math import gcd, isqrt\n',
      ['from math import gcd', 'from math import isqrt']
    ),
    []
  );
  assert.deepEqual(
    getMissingImports(
      'from math import gcd\n',
      ['from math import gcd', 'from math import isqrt']
    ),
    ['from math import isqrt']
  );
  assert.deepEqual(
    getMissingImports(
      'from math import (gcd, isqrt)\n',
      ['from math import isqrt']
    ),
    []
  );
});

test('does not treat an aliased or nested import as an unaliased requirement', () => {
  assert.deepEqual(
    getMissingImports(
      [
        'from math import gcd as g',
        'def solve():',
        '    from math import isqrt'
      ].join('\n'),
      ['from math import gcd', 'from math import isqrt']
    ),
    ['from math import gcd', 'from math import isqrt']
  );
});

test('keeps missing requirements unique and preserves their requested order', () => {
  assert.deepEqual(
    getMissingImports('', [
      'from math import gcd',
      'from math import gcd',
      'from bisect import bisect_left'
    ]),
    ['from math import gcd', 'from bisect import bisect_left']
  );
});

test('places imports after the Python header and before executable code', () => {
  const source = [
    '#!/usr/bin/env python3',
    '# coding: utf-8',
    '"""A module."""',
    '',
    'from __future__ import annotations',
    '',
    'print(1)',
    ''
  ].join('\n');

  assert.equal(getPythonHeaderInsertionLine(source), 6);
  assert.deepEqual(
    getImportInsertion(source, ['from bisect import bisect_left']),
    {
      imports: ['from bisect import bisect_left'],
      line: 6,
      text: 'from bisect import bisect_left\n\n'
    }
  );
});

test('adds imports after an existing import block without rewriting it', () => {
  const source = 'from math import gcd\n\nprint(gcd(6, 9))\n';

  assert.deepEqual(
    getImportInsertion(source, ['from bisect import bisect_left']),
    {
      imports: ['from bisect import bisect_left'],
      line: 1,
      text: 'from bisect import bisect_left\n'
    }
  );
});

test('uses CRLF when the document uses CRLF', () => {
  const source = 'print(1)\r\n';

  assert.deepEqual(
    getImportInsertion(source, ['from math import gcd']),
    {
      imports: ['from math import gcd'],
      line: 0,
      text: 'from math import gcd\r\n\r\n'
    }
  );
});

test('returns no edit when every required import is already present', () => {
  assert.deepEqual(
    getImportInsertion('from collections import Counter, deque\n', [
      'from collections import Counter',
      'from collections import deque'
    ]),
    {
      imports: [],
      line: null,
      text: ''
    }
  );
});
