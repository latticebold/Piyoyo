const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WORKSPACE_SHORTCUT_COMMAND,
  getDisclosureArrowAction,
  getNextIndex,
  getRunShortcutLabel,
  getTextFieldEdgeWorkspaceTarget,
  getWorkspaceShortcutLabels,
  getWorkspaceShortcutTarget,
  isEditableTarget,
  isImeComposing,
  isRunShortcut,
  isSearchShortcut,
  isTextEntryTarget
} = require('../src/keyboardShortcuts');

test('getWorkspaceShortcutTarget maps Alt+1 / Alt+2 / Alt+3 by physical key', () => {
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit1', key: '1' }), 'run');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit2', key: '2' }), 'snippets');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit3', key: '3' }), 'verify');
  // macOS Option+digit types a symbol and AZERTY puts &, é, " on the digit keys.
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit1', key: '¡' }), 'run');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit2', key: 'é' }), 'snippets');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit3', key: '£' }), 'verify');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit3', key: '"' }), 'verify');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit1', key: '1', repeat: true }), 'run');
});

test('getWorkspaceShortcutTarget digit aliases jump to the same tab from any tab', () => {
  for (const currentWorkspace of ['run', 'snippets', 'verify']) {
    assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit1', key: '1' }, { currentWorkspace }), 'run', currentWorkspace);
    assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit2', key: '2' }, { currentWorkspace }), 'snippets', currentWorkspace);
    assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit3', key: '3' }, { currentWorkspace }), 'verify', currentWorkspace);
  }
});

test('getWorkspaceShortcutTarget ignores other keys, modifiers, numpad and IME', () => {
  assert.equal(getWorkspaceShortcutTarget({ code: 'Digit1', key: '1' }), '');
  assert.equal(getWorkspaceShortcutTarget({ code: 'Digit3', key: '3' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit4', key: '4' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit0', key: '0' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Numpad1', key: '1' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Numpad3', key: '3' }), '');
  // AltGr reports Ctrl+Alt on Windows.
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, ctrlKey: true, code: 'Digit2', key: '@' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, ctrlKey: true, code: 'Digit3', key: '#' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, shiftKey: true, code: 'Digit1', key: '!' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, shiftKey: true, code: 'Digit3', key: '#' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, metaKey: true, code: 'Digit3', key: '3' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit3', key: '3', isComposing: true }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit3', key: 'Process', keyCode: 229 }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, metaKey: true, code: 'Digit1', key: '1' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit1', key: '1', isComposing: true }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit1', key: 'Process', keyCode: 229 }), '');
  assert.equal(getWorkspaceShortcutTarget(undefined), '');
});

test('getWorkspaceShortcutTarget maps Shift+Left / Shift+Right to the left and right tab', () => {
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowLeft', key: 'ArrowLeft' }), 'run');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowRight', key: 'ArrowRight' }), 'snippets');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowRight', key: 'ArrowRight', repeat: true }), 'snippets');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'Numpad4', key: 'ArrowLeft' }), '');
  assert.equal(getWorkspaceShortcutTarget({ code: 'ArrowLeft', key: 'ArrowLeft' }), '');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowUp', key: 'ArrowUp' }), '');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, ctrlKey: true, code: 'ArrowRight', key: 'ArrowRight' }), '');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, metaKey: true, code: 'ArrowRight', key: 'ArrowRight' }), '');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, altKey: true, code: 'ArrowLeft', key: 'ArrowLeft' }), '');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowLeft', key: 'ArrowLeft', isComposing: true }), '');
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowLeft', key: 'Process', keyCode: 229 }), '');
});

test('getWorkspaceShortcutTarget moves Shift+Arrow to the neighbour of the current tab and stops at both ends', () => {
  const left = { shiftKey: true, code: 'ArrowLeft', key: 'ArrowLeft' };
  const right = { shiftKey: true, code: 'ArrowRight', key: 'ArrowRight' };
  const cases = [
    ['run', 'run', 'snippets'],
    ['snippets', 'run', 'verify'],
    ['verify', 'snippets', 'verify']
  ];
  for (const [currentWorkspace, expectedLeft, expectedRight] of cases) {
    assert.equal(getWorkspaceShortcutTarget(left, { currentWorkspace }), expectedLeft, currentWorkspace);
    assert.equal(getWorkspaceShortcutTarget(right, { currentWorkspace }), expectedRight, currentWorkspace);
    assert.equal(getWorkspaceShortcutTarget({ ...right, repeat: true }, { currentWorkspace }), expectedRight, currentWorkspace);
  }
  // Unknown or missing current tab behaves like the run tab.
  for (const options of [{ currentWorkspace: 'bogus' }, { currentWorkspace: undefined }, {}, undefined]) {
    assert.equal(getWorkspaceShortcutTarget(left, options), 'run');
    assert.equal(getWorkspaceShortcutTarget(right, options), 'snippets');
  }
  assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowUp', key: 'ArrowUp' }, { currentWorkspace: 'snippets' }), '');
  assert.equal(getWorkspaceShortcutTarget({ ...right, ctrlKey: true }, { currentWorkspace: 'snippets' }), '');
  assert.equal(getWorkspaceShortcutTarget({ ...left, altKey: true }, { currentWorkspace: 'verify' }), '');
  assert.equal(getWorkspaceShortcutTarget({ ...left, isComposing: true }, { currentWorkspace: 'verify' }), '');
});

test('getWorkspaceShortcutTarget no longer uses Alt+Left / Alt+Right', () => {
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'ArrowLeft', key: 'ArrowLeft' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'ArrowRight', key: 'ArrowRight' }), '');
  assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'ArrowLeft', key: 'ArrowLeft' }, { currentWorkspace: 'verify' }), '');
});

test('getWorkspaceShortcutTarget leaves Shift+Arrow to text fields while keeping the digit aliases', () => {
  for (const options of [{ allowArrows: false }, { allowArrows: false, currentWorkspace: 'snippets' }]) {
    assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowLeft', key: 'ArrowLeft' }, options), '');
    assert.equal(getWorkspaceShortcutTarget({ shiftKey: true, code: 'ArrowRight', key: 'ArrowRight' }, options), '');
    assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit1', key: '¡' }, options), 'run');
    assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit2', key: '™' }, options), 'snippets');
    assert.equal(getWorkspaceShortcutTarget({ altKey: true, code: 'Digit3', key: '£' }, options), 'verify');
  }
});

test('isTextEntryTarget only matches fields where arrows move the caret', () => {
  assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'search' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'SELECT' }), false);
  assert.equal(isTextEntryTarget({ tagName: 'BUTTON' }), false);
  assert.equal(isTextEntryTarget(null), false);
});

test('workspace shortcut labels use Shift arrows and platform digit aliases', () => {
  const alt = {
    run: 'Shift+←',
    snippets: 'Shift+→',
    switch: 'Shift+←→',
    runAlias: 'Alt+1',
    snippetsAlias: 'Alt+2',
    verifyAlias: 'Alt+3'
  };
  assert.deepEqual(getWorkspaceShortcutLabels('win32'), alt);
  assert.deepEqual(getWorkspaceShortcutLabels('linux'), alt);
  assert.deepEqual(getWorkspaceShortcutLabels(), alt);
  assert.deepEqual(getWorkspaceShortcutLabels('darwin'), {
    run: 'Shift+←',
    snippets: 'Shift+→',
    switch: 'Shift+←→',
    runAlias: 'Option+1',
    snippetsAlias: 'Option+2',
    verifyAlias: 'Option+3'
  });
  assert.equal(WORKSPACE_SHORTCUT_COMMAND, 'piyoyo.workspaceShortcut');
});

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

const SHIFT_LEFT = { shiftKey: true, code: 'ArrowLeft', key: 'ArrowLeft' };
const SHIFT_RIGHT = { shiftKey: true, code: 'ArrowRight', key: 'ArrowRight' };
const caret = (value, start, end = start) => ({ value, selectionStart: start, selectionEnd: end });

test('getTextFieldEdgeWorkspaceTarget switches right only from the end with nothing selected', () => {
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('1 2\n3', 5), 'run'), 'snippets');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('1 2\n3', 2), 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('1 2\n3', 0), 'run'), '');
  // A selection that already reaches the end keeps normal selection behavior.
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('1 2\n3', 2, 5), 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('abc', 3), 'snippets'), 'verify');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('abc', 2), 'snippets'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('abc', 1, 3), 'snippets'), '');
  // No tab to the right of the verify tab.
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('abc', 3), 'verify'), '');
});

test('getTextFieldEdgeWorkspaceTarget switches left only from the start with nothing selected', () => {
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 0), 'snippets'), 'run');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 1), 'snippets'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 0, 2), 'snippets'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 0), 'verify'), 'snippets');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 2), 'verify'), '');
  // No tab to the left of the run tab.
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 0), 'run'), '');
});

test('getTextFieldEdgeWorkspaceTarget treats an empty field as both edges', () => {
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('', 0), 'run'), 'snippets');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('', 0), 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('', 0), 'snippets'), 'run');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('', 0), 'snippets'), 'verify');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('', 0), 'verify'), 'snippets');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('', 0), 'verify'), '');
});

test('getTextFieldEdgeWorkspaceTarget does nothing for an unknown current tab', () => {
  for (const currentWorkspace of ['bogus', undefined, '']) {
    assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('', 0), currentWorkspace), '', String(currentWorkspace));
    assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('', 0), currentWorkspace), '', String(currentWorkspace));
  }
});

test('getTextFieldEdgeWorkspaceTarget ignores other keys, modifiers, IME and fields without a caret', () => {
  const end = caret('abc', 3);
  assert.equal(getTextFieldEdgeWorkspaceTarget({ code: 'ArrowRight', key: 'ArrowRight' }, end, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ ...SHIFT_RIGHT, altKey: true }, end, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ ...SHIFT_RIGHT, ctrlKey: true }, end, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ ...SHIFT_RIGHT, metaKey: true }, end, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ ...SHIFT_RIGHT, isComposing: true }, end, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ ...SHIFT_RIGHT, keyCode: 229 }, end, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ shiftKey: true, code: 'ArrowUp', key: 'ArrowUp' }, end, 'run'), '');
  // Inputs such as type=number report a null selection; contenteditable has no value.
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, { value: '12', selectionStart: null, selectionEnd: null }, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, { selectionStart: 0, selectionEnd: 0 }, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, null, 'run'), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(undefined, end, 'run'), '');
});

test('getTextFieldEdgeWorkspaceTarget with anywhere switches from any caret or selection', () => {
  const anywhere = { anywhere: true };
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('1 2\n3', 0), 'run', anywhere), 'snippets');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('1 2\n3', 2), 'run', anywhere), 'snippets');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('1 2\n3', 1, 4), 'run', anywhere), 'snippets');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 2), 'snippets', anywhere), 'run');
  // No neighbour: leave the key to the text field instead of moving focus.
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_LEFT, caret('abc', 2), 'run', anywhere), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget(SHIFT_RIGHT, caret('abc', 2), 'verify', anywhere), '');
  // Other keys and modifiers still do nothing.
  assert.equal(getTextFieldEdgeWorkspaceTarget({ shiftKey: true, code: 'ArrowUp', key: 'ArrowUp' }, caret('abc', 2), 'run', anywhere), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ ...SHIFT_RIGHT, ctrlKey: true }, caret('abc', 2), 'run', anywhere), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ ...SHIFT_RIGHT, isComposing: true }, caret('abc', 2), 'run', anywhere), '');
  assert.equal(getTextFieldEdgeWorkspaceTarget({ code: 'ArrowRight', key: 'ArrowRight' }, caret('abc', 2), 'run', anywhere), '');
});

test('getDisclosureArrowAction collapses with Left and expands with Right', () => {
  assert.equal(getDisclosureArrowAction({ key: 'ArrowLeft' }, true), 'close');
  assert.equal(getDisclosureArrowAction({ key: 'ArrowLeft' }, false), '');
  assert.equal(getDisclosureArrowAction({ key: 'ArrowRight' }, false), 'open');
  assert.equal(getDisclosureArrowAction({ key: 'ArrowRight' }, true), '');
  assert.equal(getDisclosureArrowAction({ key: 'ArrowDown' }, true), '');
  assert.equal(getDisclosureArrowAction({ key: 'ArrowRight', shiftKey: true }, false), '');
  assert.equal(getDisclosureArrowAction({ key: 'ArrowRight', altKey: true }, false), '');
  assert.equal(getDisclosureArrowAction({ key: 'ArrowRight', isComposing: true }, false), '');
  assert.equal(getDisclosureArrowAction(undefined, false), '');
});