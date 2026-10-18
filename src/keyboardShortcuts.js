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

module.exports = {
  getNextIndex,
  getRunShortcutLabel,
  isEditableTarget,
  isImeComposing,
  isRunShortcut,
  isSearchShortcut
};
