'use strict';

// The functions below are injected into the webview script via toString(),
// so each one must stay self-contained.

function isImeComposing(event) {
  return Boolean(event && (event.isComposing || event.keyCode === 229));
}

function isRunShortcut(event) {
  if (!event || event.key !== 'Enter' || event.altKey || event.shiftKey) {
    return false;
  }
  if (event.isComposing || event.keyCode === 229) {
    return false;
  }
  return Boolean(event.ctrlKey || event.metaKey);
}

function isInputFocusShortcut(event) {
  if (!event || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  if (event.isComposing || event.keyCode === 229) {
    return false;
  }
  // event.code stays KeyI even when macOS Option+I produces a dead key.
  return event.code === 'KeyI';
}

// Returns 'run', 'snippets', 'verify', or '' for Shift+Left / Shift+Right (the neighbouring tab
// of currentWorkspace) and the Alt+1 / Alt+2 / Alt+3 aliases (macOS Option). allowArrows is
// false in text fields, where Shift+Arrow selects text (see getTextFieldEdgeWorkspaceTarget).
// Repeats are allowed: the arrows stop at the first and last tab, so holding one is harmless.
function getWorkspaceShortcutTarget(event, { allowArrows = true, currentWorkspace = 'run' } = {}) {
  const workspaces = ['run', 'snippets', 'verify'];
  if (!event || event.ctrlKey || event.metaKey) {
    return '';
  }
  if (event.isComposing || event.keyCode === 229) {
    return '';
  }
  if (event.shiftKey && !event.altKey) {
    if (!allowArrows) {
      return '';
    }
    const index = Math.max(0, workspaces.indexOf(currentWorkspace));
    if (event.code === 'ArrowLeft') {
      return workspaces[Math.max(index - 1, 0)];
    }
    return event.code === 'ArrowRight' ? workspaces[Math.min(index + 1, workspaces.length - 1)] : '';
  }
  if (!event.altKey || event.shiftKey) {
    return '';
  }
  // event.code keeps the physical key on macOS and AZERTY; numpad stays free for Alt codes.
  const digitTargets = { Digit1: 'run', Digit2: 'snippets', Digit3: 'verify' };
  return digitTargets[event.code] || '';
}

// Shift+Left / Shift+Right inside a text field: switches only when nothing is selected and the
// caret is at the edge the arrow points to, so selecting text is never interrupted.
// field is { value, selectionStart, selectionEnd }; returns the neighbouring tab or ''.
// anywhere skips the caret and selection checks (the stdin box, where Shift+Up/Down/Home/End
// still select text).
function getTextFieldEdgeWorkspaceTarget(event, field, currentWorkspace, { anywhere = false } = {}) {
  const workspaces = ['run', 'snippets', 'verify'];
  if (!event || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
    return '';
  }
  if (event.isComposing || event.keyCode === 229 || !field) {
    return '';
  }
  const { value, selectionStart, selectionEnd } = field;
  if (!anywhere && (typeof value !== 'string' || !Number.isInteger(selectionStart)
    || selectionStart !== selectionEnd)) {
    return '';
  }
  const index = workspaces.indexOf(currentWorkspace);
  if (index < 0) {
    return '';
  }
  if (event.code === 'ArrowLeft') {
    return index > 0 && (anywhere || selectionStart === 0) ? workspaces[index - 1] : '';
  }
  if (event.code === 'ArrowRight') {
    return index < workspaces.length - 1 && (anywhere || selectionEnd === value.length)
      ? workspaces[index + 1]
      : '';
  }
  return '';
}

function isTextEntryTarget(element) {
  if (!element) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  const tagName = String(element.tagName || '').toLowerCase();
  if (tagName === 'textarea') {
    return true;
  }
  if (tagName !== 'input') {
    return false;
  }
  const type = String(element.type || 'text').toLowerCase();
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
}

// Detects two clean Shift taps (no other key in between) within intervalMs.
function createShiftDoubleTapDetector(intervalMs) {
  let shiftDown = false;
  let cleanTap = false;
  let lastTapAt = -Infinity;
  const reset = () => {
    shiftDown = false;
    cleanTap = false;
    lastTapAt = -Infinity;
  };
  return {
    handleKeyDown(event) {
      if (!event || event.isComposing || event.keyCode === 229 || event.key !== 'Shift') {
        reset();
        return;
      }
      if (event.repeat) {
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey) {
        reset();
        return;
      }
      shiftDown = true;
      cleanTap = true;
    },
    handleKeyUp(event, now) {
      if (!event || event.key !== 'Shift') {
        return false;
      }
      const wasCleanTap = shiftDown && cleanTap && !event.isComposing;
      shiftDown = false;
      cleanTap = false;
      if (!wasCleanTap) {
        lastTapAt = -Infinity;
        return false;
      }
      if (now - lastTapAt <= intervalMs) {
        lastTapAt = -Infinity;
        return true;
      }
      lastTapAt = now;
      return false;
    }
  };
}

function isSearchShortcut(event, targetIsEditable) {
  if (!event || event.altKey || event.isComposing || event.keyCode === 229) {
    return false;
  }
  const modifier = Boolean(event.ctrlKey || event.metaKey);
  if (modifier && !event.shiftKey && String(event.key).toLowerCase() === 'f') {
    return true;
  }
  return !modifier && event.key === '/' && !targetIsEditable;
}

function isEditableTarget(element) {
  if (!element) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  const tagName = String(element.tagName || '').toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

// Returns the index to move to, or -1 when the key is not a navigation key.
function getNextIndex(currentIndex, length, key, orientation) {
  if (!Number.isInteger(length) || length <= 0) {
    return -1;
  }
  const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < length
    ? currentIndex
    : -1;
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return length - 1;
  }
  if (key === nextKey) {
    return current < 0 ? 0 : Math.min(current + 1, length - 1);
  }
  if (key === previousKey) {
    return current < 0 ? length - 1 : Math.max(current - 1, 0);
  }
  return -1;
}

// Plain Left / Right on a collapsible category header: 'close', 'open', or '' (nothing to do).
function getDisclosureArrowAction(event, isOpen) {
  if (!event || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return '';
  }
  if (event.isComposing || event.keyCode === 229) {
    return '';
  }
  if (event.key === 'ArrowLeft') {
    return isOpen ? 'close' : '';
  }
  if (event.key === 'ArrowRight') {
    return isOpen ? '' : 'open';
  }
  return '';
}

function getRunShortcutLabel(platform) {
  return platform === 'darwin' ? 'Cmd+Enter' : 'Ctrl+Enter';
}

const INPUT_FOCUS_SHORTCUTS = Object.freeze(['altI', 'shiftShift', 'both']);
const DEFAULT_INPUT_FOCUS_SHORTCUT = 'altI';
const SHIFT_DOUBLE_TAP_INTERVAL_MS = 400;

function normalizeInputFocusShortcut(value) {
  return INPUT_FOCUS_SHORTCUTS.includes(value) ? value : DEFAULT_INPUT_FOCUS_SHORTCUT;
}

function getInputFocusShortcutLabel(mode, platform) {
  const altLabel = platform === 'darwin' ? 'Option+I' : 'Alt+I';
  const normalized = normalizeInputFocusShortcut(mode);
  if (normalized === 'shiftShift') {
    return 'Shift 2回';
  }
  if (normalized === 'both') {
    return `${altLabel} / Shift 2回`;
  }
  return altLabel;
}

// The webview handles Alt+1 / Alt+2 / Alt+3 itself; this command only keeps the forwarded key
// away from VS Code's openEditorAtIndex binding.
const WORKSPACE_SHORTCUT_COMMAND = 'piyoyo.workspaceShortcut';

function getWorkspaceShortcutLabels(platform) {
  const modifier = platform === 'darwin' ? 'Option' : 'Alt';
  return {
    run: 'Shift+←',
    snippets: 'Shift+→',
    switch: 'Shift+←→',
    runAlias: `${modifier}+1`,
    snippetsAlias: `${modifier}+2`,
    verifyAlias: `${modifier}+3`
  };
}

module.exports = {
  DEFAULT_INPUT_FOCUS_SHORTCUT,
  INPUT_FOCUS_SHORTCUTS,
  SHIFT_DOUBLE_TAP_INTERVAL_MS,
  WORKSPACE_SHORTCUT_COMMAND,
  createShiftDoubleTapDetector,
  getDisclosureArrowAction,
  getInputFocusShortcutLabel,
  getNextIndex,
  getRunShortcutLabel,
  getTextFieldEdgeWorkspaceTarget,
  getWorkspaceShortcutLabels,
  getWorkspaceShortcutTarget,
  isEditableTarget,
  isImeComposing,
  isInputFocusShortcut,
  isRunShortcut,
  isSearchShortcut,
  isTextEntryTarget,
  normalizeInputFocusShortcut
};
