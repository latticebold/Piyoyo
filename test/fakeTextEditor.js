'use strict';

// A small in-memory editor: edits really change the text and move the cursor
// like VS Code does for an insertion at or before it.
class FakeSnippetString {
  constructor(value) {
    this.value = value;
  }
}

class FakePosition {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

function toOffset(text, line, character) {
  const lines = text.split('\n');
  let offset = 0;
  for (let index = 0; index < line; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset + character;
}

function toPosition(text, offset) {
  const before = text.slice(0, offset).split('\n');
  return { line: before.length - 1, character: before.at(-1).length };
}

function createFakeTextEditor(initialText, cursor = null) {
  const state = {
    text: initialText,
    order: [],
    type(value) {
      insertAt(cursorOffset, value);
    }
  };
  let cursorOffset = cursor === null
    ? initialText.length
    : toOffset(initialText, cursor.line, cursor.character);

  function insertAt(offset, value) {
    state.text = state.text.slice(0, offset) + value + state.text.slice(offset);
    if (offset <= cursorOffset) {
      cursorOffset += value.length;
    }
  }

  const editor = {
    document: {
      languageId: 'python',
      uri: { path: '/work/main.py' },
      getText: () => state.text,
      get lineCount() {
        return state.text.split('\n').length;
      }
    },
    get selections() {
      return [toPosition(state.text, cursorOffset)];
    },
    get selection() {
      return toPosition(state.text, cursorOffset);
    },
    async edit(callback) {
      const inserts = [];
      callback({ insert: (position, value) => inserts.push({ position, value }) });
      state.order.push('edit');
      for (const { position, value } of inserts) {
        insertAt(toOffset(state.text, position.line, position.character), value);
      }
      return true;
    },
    async insertSnippet(snippet) {
      state.order.push('snippet');
      const value = snippet.value.replace(/\$\{\d+:([^}]*)\}/g, '$1');
      state.text = state.text.slice(0, cursorOffset) + value + state.text.slice(cursorOffset);
      cursorOffset += value.length;
      return true;
    }
  };

  return { editor, state };
}

function createFakeVscodeApi() {
  return {
    SnippetString: FakeSnippetString,
    Position: FakePosition,
    commands: { async executeCommand() {} }
  };
}

module.exports = {
  createFakeTextEditor,
  createFakeVscodeApi
};
