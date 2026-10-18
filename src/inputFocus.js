'use strict';

const TOGGLE_INPUT_FOCUS_COMMAND = 'piyoyo.toggleInputFocus';
const RUNNER_FOCUSED_CONTEXT = 'piyoyo.runnerFocused';

// Keybindings pass an explicit target so a duplicate trigger cannot bounce focus back.
function resolveFocusTarget(args, runnerFocused) {
  const target = args && args.target;
  if (target === 'input' || target === 'editor') {
    return target;
  }
  return runnerFocused ? 'editor' : 'input';
}

function isOpenPythonEditor(editor) {
  return Boolean(editor && editor.document
    && editor.document.languageId === 'python'
    && !editor.document.isClosed);
}

function pickPythonEditor(lastEditor, visibleEditors) {
  if (isOpenPythonEditor(lastEditor)) {
    return lastEditor;
  }
  return (visibleEditors || []).find(isOpenPythonEditor);
}

module.exports = {
  RUNNER_FOCUSED_CONTEXT,
  TOGGLE_INPUT_FOCUS_COMMAND,
  isOpenPythonEditor,
  pickPythonEditor,
  resolveFocusTarget
};
