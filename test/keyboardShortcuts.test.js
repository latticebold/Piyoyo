const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getNextIndex,
  getRunShortcutLabel,
  isEditableTarget,
  isImeComposing,
  isRunShortcut,
  isSearchShortcut
} = require('../src/keyboardShortcuts');

test('isRunShortcut accepts Ctrl+Enter and Cmd+Enter only', () => {
  assert.equal(isRunShortcut({ key: 'Enter', ctrlKey: true }), true);
  assert.equal(isRunShortcut({ key: 'Enter', metaKey: true }), true);
  assert.equal(isRunShortcut({ key: 'Enter' }), false);
  assert.equal(isRunShortcut({ key: 'Enter', ctrlKey: true, shiftKey: true }), false);
  assert.equal(isRunShortcut({ key: 'Enter', ctrlKey: true, altKey: true }), false);
  assert.equal(isRunShortcut({ key: 'a', ctrlKey: true }), false);
  assert.equal(isRunShortcut(undefined), false);
});

test('isRunShortcut ignores Enter while the IME is composing', () => {
  assert.equal(isRunShortcut({ key: 'Enter', ctrlKey: true, isComposing: true }), false);
  assert.equal(isRunShortcut({ key: 'Enter', ctrlKey: true, keyCode: 229 }), false);
  assert.equal(isImeComposing({ isComposing: true }), true);
  assert.equal(isImeComposing({ keyCode: 229 }), true);
  assert.equal(isImeComposing({ key: 'Enter', keyCode: 13 }), false);
});

test('isSearchShortcut uses / outside text fields and Ctrl+F anywhere', () => {
  assert.equal(isSearchShortcut({ key: '/' }, false), true);
  assert.equal(isSearchShortcut({ key: '/' }, true), false);
  assert.equal(isSearchShortcut({ key: 'f', ctrlKey: true }, true), true);
  assert.equal(isSearchShortcut({ key: 'F', metaKey: true }, false), true);
  assert.equal(isSearchShortcut({ key: 'f', ctrlKey: true, shiftKey: true }, false), false);
  assert.equal(isSearchShortcut({ key: '/', ctrlKey: true }, false), false);
  assert.equal(isSearchShortcut({ key: 'f' }, false), false);
  assert.equal(isSearchShortcut({ key: '/', isComposing: true }, false), false);
});

test('isEditableTarget detects text fields, selects and contenteditable', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditableTarget({ tagName: 'SELECT' }), true);
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isEditableTarget(null), false);
});

test('getNextIndex moves vertically without wrapping and supports Home/End', () => {
  assert.equal(getNextIndex(0, 3, 'ArrowDown', 'vertical'), 1);
  assert.equal(getNextIndex(2, 3, 'ArrowDown', 'vertical'), 2);
  assert.equal(getNextIndex(1, 3, 'ArrowUp', 'vertical'), 0);
  assert.equal(getNextIndex(0, 3, 'ArrowUp', 'vertical'), 0);
  assert.equal(getNextIndex(1, 3, 'Home', 'vertical'), 0);
  assert.equal(getNextIndex(1, 3, 'End', 'vertical'), 2);
  assert.equal(getNextIndex(1, 3, 'ArrowRight', 'vertical'), -1);
});

test('getNextIndex moves horizontally for tabs', () => {
  assert.equal(getNextIndex(0, 2, 'ArrowRight', 'horizontal'), 1);
  assert.equal(getNextIndex(1, 2, 'ArrowLeft', 'horizontal'), 0);
  assert.equal(getNextIndex(0, 2, 'ArrowDown', 'horizontal'), -1);
});

test('getNextIndex starts from an edge when nothing is current', () => {
  assert.equal(getNextIndex(-1, 4, 'ArrowDown', 'vertical'), 0);
  assert.equal(getNextIndex(-1, 4, 'ArrowUp', 'vertical'), 3);
  assert.equal(getNextIndex(0, 0, 'ArrowDown', 'vertical'), -1);
});

test('getRunShortcutLabel shows Cmd on macOS and Ctrl elsewhere', () => {
  assert.equal(getRunShortcutLabel('darwin'), 'Cmd+Enter');
  assert.equal(getRunShortcutLabel('win32'), 'Ctrl+Enter');
  assert.equal(getRunShortcutLabel('linux'), 'Ctrl+Enter');
});
