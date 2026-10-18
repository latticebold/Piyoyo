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

module.exports = {
  DEFAULT_INPUT_FOCUS_SHORTCUT,
  INPUT_FOCUS_SHORTCUTS,
  SHIFT_DOUBLE_TAP_INTERVAL_MS,
  createShiftDoubleTapDetector,
  getInputFocusShortcutLabel,
  getNextIndex,
  getRunShortcutLabel,
  isEditableTarget,
  isImeComposing,
  isInputFocusShortcut,
  isRunShortcut,
  isSearchShortcut,
  normalizeInputFocusShortcut
};
