const test = require('node:test');
const assert = require('node:assert/strict');

const { COMPARE_MODES, COMPARE_MODE_LABELS, compareOutputs } = require('../src/verify/outputCompare');

function assertEqualOutputs(expected, actual, mode) {
  assert.deepEqual(compareOutputs(expected, actual, mode), {
    equal: true,
    expectedDiffLines: [],
    actualDiffLines: []
  });
}

function assertDifferentOutputs(expected, actual, mode, expectedDiffLines, actualDiffLines) {
  const result = compareOutputs(expected, actual, mode);
  assert.equal(result.equal, false);
  assert.ok(result.expectedDiffLines.length + result.actualDiffLines.length > 0, 'a difference must be reported');
  if (expectedDiffLines) {
    assert.deepEqual(result.expectedDiffLines, expectedDiffLines);
  }
  if (actualDiffLines) {
    assert.deepEqual(result.actualDiffLines, actualDiffLines);
  }
  return result;
}

test('compare modes and labels are listed in order', () => {
  assert.deepEqual(COMPARE_MODES, ['tokens', 'exact', 'float']);
  assert.deepEqual(COMPARE_MODE_LABELS, {
    tokens: '空白区切り',
    exact: '完全一致',
    float: '小数の誤差を許す'
  });
});

test('tokens mode ignores spaces, newlines and line breaks between words', () => {
  assertEqualOutputs('1 2\n3\n', '1\n2   3', 'tokens');
  assertEqualOutputs('Yes\n', '  Yes  \n\n\n', 'tokens');
  assertEqualOutputs('a\tb\n', 'a b', 'tokens');
  assertEqualOutputs('', '\n', 'tokens');
});

test('tokens mode normalizes CRLF and trailing newlines', () => {
  assertEqualOutputs('1\r\n2\r\n', '1\n2', 'tokens');
  assertEqualOutputs('1\n2\n', '1\r\n2\r\n\r\n', 'tokens');
});

test('tokens mode compares words as plain strings', () => {
  assertDifferentOutputs('1.0\n', '1\n', 'tokens', [0], [0]);
  assertDifferentOutputs('Yes\n', 'yes\n', 'tokens', [0], [0]);
  assertDifferentOutputs('1 2\n', '1 2 3\n', 'tokens', [0], [0]);
});

test('tokens mode does not treat a full-width space as a separator', () => {
  assertDifferentOutputs('1 2\n', '1　2\n', 'tokens', [0], [0]);
});

test('tokens mode reports differing line indices', () => {
  assertDifferentOutputs('1\n2\n3\n', '1\n5\n3\n', 'tokens', [1], [1]);
  assertDifferentOutputs('1\n2\n3\n', '1\n5\n', 'tokens', [1, 2], [1]);
});

test('tokens mode reports missing and extra trailing lines on one side only', () => {
  assertDifferentOutputs('1\n2\n', '1\n', 'tokens', [1], []);
  assertDifferentOutputs('1\n', '1\n2\n', 'tokens', [], [1]);
  assertDifferentOutputs('', '0\n', 'tokens', [], [0]);
});

test('tokens mode ignores trailing blank lines in the line diff', () => {
  assertDifferentOutputs('1\n2\n', '1\n3\n\n\n', 'tokens', [1], [1]);
});

test('exact mode ignores only trailing newlines', () => {
  assertEqualOutputs('1\n2\n', '1\n2', 'exact');
  assertEqualOutputs('1\n2', '1\n2\n\n', 'exact');
  assertEqualOutputs('', '\n', 'exact');
});

test('exact mode normalizes CRLF', () => {
  assertEqualOutputs('a b\r\nc\r\n', 'a b\nc\n', 'exact');
});

test('exact mode treats trailing and extra spaces as different', () => {
  assertDifferentOutputs('1\n', '1 \n', 'exact', [0], [0]);
  assertDifferentOutputs('1 2\n', '1  2\n', 'exact', [0], [0]);
  assertDifferentOutputs('1\n2\n', ' 1\n2\n', 'exact', [0], [0]);
});

test('exact mode treats line breaks and inner blank lines as different', () => {
  assertDifferentOutputs('1 2\n', '1\n2\n', 'exact', [0], [0, 1]);
  assertDifferentOutputs('1\n2\n', '1\n\n2\n', 'exact', [1], [1, 2]);
  assertDifferentOutputs('1\n', '1\n \n', 'exact', [], [1]);
});

test('float mode accepts absolute error up to 1e-6', () => {
  assertEqualOutputs('0\n', '0.000001\n', 'float');
  assertEqualOutputs('0.5\n', '0.4999990\n', 'float');
  assertEqualOutputs('1\n', '1.000001\n', 'float');
  assertDifferentOutputs('0\n', '0.0000011\n', 'float', [0], [0]);
  assertDifferentOutputs('1\n', '1.0000011\n', 'float', [0], [0]);
});

test('float mode accepts relative error up to 1e-6 of the expected value', () => {
  assertEqualOutputs('100\n', '100.0001\n', 'float');
  assertEqualOutputs('1000000.0\n', '1000001.0\n', 'float');
  assertEqualOutputs('-5.5\n', '-5.5000055\n', 'float');
  assertEqualOutputs('1e18\n', '1000000000001000000\n', 'float');
  assertDifferentOutputs('100\n', '100.00011\n', 'float', [0], [0]);
  assertDifferentOutputs('1000000.0\n', '1000001.1\n', 'float', [0], [0]);
  assertDifferentOutputs('-5.5\n', '-5.5000056\n', 'float', [0], [0]);
});

test('float mode compares integer-form tokens exactly as integers', () => {
  assertEqualOutputs('7\n', '007\n', 'float');
  assertEqualOutputs('0\n', '-0\n', 'float');
  assertDifferentOutputs('1000000\n', '1000001\n', 'float', [0], [0]);
  assertDifferentOutputs('3\n', '4\n', 'float', [0], [0]);
});

test('float mode compares huge integers without losing digits', () => {
  assertEqualOutputs('123456789012345678901234567890\n', '123456789012345678901234567890\n', 'float');
  assertDifferentOutputs(
    '123456789012345678901234567890\n',
    '123456789012345678901234567891\n',
    'float',
    [0],
    [0]
  );
  assertDifferentOutputs('9007199254740993\n', '9007199254740992\n', 'float', [0], [0]);
});

test('float mode uses tolerance when either side is a decimal', () => {
  assertEqualOutputs('3\n', '3.0\n', 'float');
  assertEqualOutputs('3.0000001\n', '3\n', 'float');
  assertEqualOutputs('2.5e-1\n', '0.25\n', 'float');
  assertDifferentOutputs('3\n', '3.01\n', 'float', [0], [0]);
});

test('float mode compares non-numeric tokens as strings', () => {
  assertEqualOutputs('Yes 1.5\n', 'Yes 1.5000001\n', 'float');
  assertDifferentOutputs('Yes\n', 'No\n', 'float', [0], [0]);
  assertDifferentOutputs('abc\n', '1\n', 'float', [0], [0]);
  assertDifferentOutputs('inf\n', '1e400\n', 'float', [0], [0]);
  assertEqualOutputs('nan\n', 'nan\n', 'float');
});

test('float mode handles whitespace, CRLF and line diffs like tokens mode', () => {
  assertEqualOutputs('1.0 2.0\r\n', '1.0000001\n2', 'float');
  assertDifferentOutputs('1.5\n2.5\n3.5\n', '1.5\n2.6\n', 'float', [1, 2], [1]);
  assertDifferentOutputs('1.5\n', '1.5\n2\n', 'float', [], [1]);
});

test('unknown modes fall back to tokens', () => {
  assertEqualOutputs('1 2\n', '1\n2\n', 'something');
  assertEqualOutputs('1 2\n', '1\n2\n', undefined);
});

test('non-string outputs are treated as text', () => {
  assertEqualOutputs(null, '', 'tokens');
  assertEqualOutputs(undefined, '\n', 'exact');
  assertDifferentOutputs(null, '1\n', 'tokens', [], [0]);
});
