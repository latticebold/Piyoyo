const test = require('node:test');
const assert = require('node:assert/strict');

const { pickPythonEditor, resolveFocusTarget } = require('../src/inputFocus');

function editor(languageId, isClosed = false) {
  return { document: { languageId, isClosed }, viewColumn: 1 };
}

test('resolveFocusTarget follows the keybinding target and toggles without one', () => {
  assert.equal(resolveFocusTarget({ target: 'input' }, true), 'input');
  assert.equal(resolveFocusTarget({ target: 'editor' }, false), 'editor');
  assert.equal(resolveFocusTarget(undefined, true), 'editor');
  assert.equal(resolveFocusTarget(undefined, false), 'input');
  assert.equal(resolveFocusTarget({ target: 'other' }, false), 'input');
});

test('pickPythonEditor prefers the last Python editor and skips closed ones', () => {
  const last = editor('python');
  const visible = editor('python');
  assert.equal(pickPythonEditor(last, [visible]), last);
  assert.equal(pickPythonEditor(editor('python', true), [editor('markdown'), visible]), visible);
  assert.equal(pickPythonEditor(undefined, [editor('markdown')]), undefined);
  assert.equal(pickPythonEditor(undefined, undefined), undefined);
});
