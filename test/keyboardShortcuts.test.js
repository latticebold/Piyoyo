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

const {
  createShiftDoubleTapDetector,
  getInputFocusShortcutLabel,
  isInputFocusShortcut,
  normalizeInputFocusShortcut
} = require('../src/keyboardShortcuts');

function tapShift(detector, at, extra = {}) {
  detector.handleKeyDown({ key: 'Shift', shiftKey: true, ...extra });
  return detector.handleKeyUp({ key: 'Shift' }, at);
}

test('isInputFocusShortcut matches Alt+I by physical key, also for the macOS dead key', () => {
  assert.equal(isInputFocusShortcut({ code: 'KeyI', key: 'i', altKey: true }), true);
  assert.equal(isInputFocusShortcut({ code: 'KeyI', key: 'Dead', altKey: true }), true);
  assert.equal(isInputFocusShortcut({ code: 'KeyI', key: 'i' }), false);
  assert.equal(isInputFocusShortcut({ code: 'KeyI', altKey: true, ctrlKey: true }), false);
  assert.equal(isInputFocusShortcut({ code: 'KeyI', altKey: true, shiftKey: true }), false);
  assert.equal(isInputFocusShortcut({ code: 'KeyI', altKey: true, metaKey: true }), false);
  assert.equal(isInputFocusShortcut({ code: 'KeyI', altKey: true, isComposing: true }), false);
  assert.equal(isInputFocusShortcut({ code: 'KeyJ', altKey: true }), false);
  assert.equal(isInputFocusShortcut(undefined), false);
});

test('shift double tap fires once for two quick clean taps', () => {
  const detector = createShiftDoubleTapDetector(400);
  assert.equal(tapShift(detector, 1000), false);
  assert.equal(tapShift(detector, 1300), true);
  // A third tap starts over instead of firing again.
  assert.equal(tapShift(detector, 1500), false);
});

test('shift double tap ignores slow taps', () => {
  const detector = createShiftDoubleTapDetector(400);
  assert.equal(tapShift(detector, 1000), false);
  assert.equal(tapShift(detector, 1500), false);
  assert.equal(tapShift(detector, 1700), true);
});

test('shift double tap ignores Shift used to type a capital letter', () => {
  const detector = createShiftDoubleTapDetector(400);
  detector.handleKeyDown({ key: 'Shift', shiftKey: true });
  detector.handleKeyDown({ key: 'A', shiftKey: true });
  assert.equal(detector.handleKeyUp({ key: 'Shift' }, 1000), false);
  assert.equal(tapShift(detector, 1100), false);
});

test('shift double tap is reset by another key between the taps', () => {
  const detector = createShiftDoubleTapDetector(400);
  assert.equal(tapShift(detector, 1000), false);
  detector.handleKeyDown({ key: 'a' });
  assert.equal(tapShift(detector, 1100), false);
});

test('shift double tap ignores key repeat, other modifiers and IME composition', () => {
  const repeat = createShiftDoubleTapDetector(400);
  repeat.handleKeyDown({ key: 'Shift' });
  repeat.handleKeyDown({ key: 'Shift', repeat: true });
  assert.equal(repeat.handleKeyUp({ key: 'Shift' }, 1000), false);
  assert.equal(tapShift(repeat, 1100), true);

  const withCtrl = createShiftDoubleTapDetector(400);
  assert.equal(tapShift(withCtrl, 1000), false);
  assert.equal(tapShift(withCtrl, 1100, { ctrlKey: true }), false);

  const composing = createShiftDoubleTapDetector(400);
  assert.equal(tapShift(composing, 1000), false);
  composing.handleKeyDown({ key: 'Shift', isComposing: true });
  assert.equal(composing.handleKeyUp({ key: 'Shift', isComposing: true }, 1100), false);
  assert.equal(tapShift(composing, 1200), false);
});

test('shift double tap needs a keydown before the keyup', () => {
  const detector = createShiftDoubleTapDetector(400);
  assert.equal(detector.handleKeyUp({ key: 'Shift' }, 1000), false);
  assert.equal(detector.handleKeyUp({ key: 'Shift' }, 1100), false);
  assert.equal(detector.handleKeyUp({ key: 'a' }, 1200), false);
});

test('input focus shortcut setting falls back to Alt+I and labels each option', () => {
  assert.equal(normalizeInputFocusShortcut('shiftShift'), 'shiftShift');
  assert.equal(normalizeInputFocusShortcut('both'), 'both');
  assert.equal(normalizeInputFocusShortcut('unknown'), 'altI');
  assert.equal(normalizeInputFocusShortcut(undefined), 'altI');
  assert.equal(getInputFocusShortcutLabel('altI', 'win32'), 'Alt+I');
  assert.equal(getInputFocusShortcutLabel('altI', 'darwin'), 'Option+I');
  assert.equal(getInputFocusShortcutLabel('shiftShift', 'win32'), 'Shift 2回');
  assert.equal(getInputFocusShortcutLabel('both', 'linux'), 'Alt+I / Shift 2回');
});
