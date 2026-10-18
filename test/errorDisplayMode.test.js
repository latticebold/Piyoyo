const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getErrorPresentation,
  normalizeErrorDisplayMode,
  resolveErrorDisplayMode
} = require('../src/errorDisplayMode');

const NOT_SET = { key: 'piyoyo.errorDisplayMode', defaultValue: 'friendly' };

test('normalizes unknown display modes to friendly', () => {
  assert.equal(normalizeErrorDisplayMode('friendly'), 'friendly');
  assert.equal(normalizeErrorDisplayMode('both'), 'both');
  assert.equal(normalizeErrorDisplayMode('original'), 'original');
  for (const value of [undefined, null, '', 'Both', 'raw', true, 1]) {
    assert.equal(normalizeErrorDisplayMode(value), 'friendly');
  }
});

test('uses friendly mode when nothing is configured', () => {
  assert.equal(resolveErrorDisplayMode(), 'friendly');
  assert.equal(resolveErrorDisplayMode({ inspected: NOT_SET, configuredMode: 'friendly' }), 'friendly');
});

test('treats the legacy boolean as both mode only while the new setting is unset', () => {
  assert.equal(resolveErrorDisplayMode({
    inspected: NOT_SET, configuredMode: 'friendly', legacyShowOriginalErrors: true
  }), 'both');
  assert.equal(resolveErrorDisplayMode({
    inspected: NOT_SET, configuredMode: 'friendly', legacyShowOriginalErrors: false
  }), 'friendly');
});

test('an explicitly configured mode wins over the legacy boolean at any scope', () => {
  for (const scope of ['globalValue', 'workspaceValue', 'workspaceFolderValue', 'workspaceLanguageValue']) {
    assert.equal(resolveErrorDisplayMode({
      inspected: { ...NOT_SET, [scope]: 'friendly' },
      configuredMode: 'friendly',
      legacyShowOriginalErrors: true
    }), 'friendly', scope);
    assert.equal(resolveErrorDisplayMode({
      inspected: { ...NOT_SET, [scope]: 'original' },
      configuredMode: 'original',
      legacyShowOriginalErrors: true
    }), 'original', scope);
  }
  assert.equal(resolveErrorDisplayMode({
    inspected: { ...NOT_SET, globalValue: 'bogus' },
    configuredMode: 'bogus'
  }), 'friendly');
});

test('friendly mode keeps the original collapsed', () => {
  assert.deepEqual(getErrorPresentation({
    mode: 'friendly', explanation: '0で割ろうとしています。', originalText: 'Traceback ...'
  }), {
    showField: true,
    showExplanation: true,
    showOriginal: true,
    originalExpanded: false,
    explanationExpanded: true
  });
});

test('both mode shows the explanation and the original', () => {
  const presentation = getErrorPresentation({
    mode: 'both', explanation: '説明', originalText: 'Traceback ...'
  });
  assert.equal(presentation.showExplanation, true);
  assert.equal(presentation.showOriginal, true);
  assert.equal(presentation.originalExpanded, true);
  assert.equal(presentation.explanationExpanded, true);
});

test('original mode puts the original first and folds the explanation', () => {
  const presentation = getErrorPresentation({
    mode: 'original', explanation: '説明', originalText: 'Traceback ...'
  });
  assert.equal(presentation.showOriginal, true);
  assert.equal(presentation.originalExpanded, true);
  assert.equal(presentation.explanationExpanded, false);
});

test('original mode opens the explanation when there is no original text', () => {
  const presentation = getErrorPresentation({
    mode: 'original', explanation: '実行が 100 ms を超えたため停止しました。', originalText: ''
  });
  assert.equal(presentation.showField, true);
  assert.equal(presentation.showOriginal, false);
  assert.equal(presentation.explanationExpanded, true);
});

test('nothing is shown after a clean successful run in every mode', () => {
  for (const mode of ['friendly', 'both', 'original']) {
    const presentation = getErrorPresentation({ mode, explanation: '', originalText: '' });
    assert.equal(presentation.showField, false, mode);
    assert.equal(presentation.showOriginal, false, mode);
  }
});
