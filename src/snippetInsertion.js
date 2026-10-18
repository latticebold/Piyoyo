'use strict';

const { getHelperInsertion } = require('./pythonHelperInsertion');
const { getImportInsertion } = require('./pythonImportInsertion');
const { organizeImportsWithRuff } = require('./ruffImportOrganizer');
const { applySnippetPlaceholderValues } = require('./snippetLibrary');

async function insertInputSnippet({ vscodeApi, editor, snippet, placeholderValues }) {
  if (!editor) {
    return failure('挿入先のPythonファイルを開いてください。');
  }

  if (!editor.document || editor.document.languageId !== 'python') {
    return failure('Pythonファイルを開いているときだけ挿入できます。');
  }

  if (!snippet || typeof snippet.body !== 'string') {
    return failure('選択されたスニペットが見つかりません。');
  }

  const requiredImports = Array.isArray(snippet.imports) ? snippet.imports : [];
  const importInsertion = getImportInsertion(readText(editor.document), requiredImports);
  let addedImports = [];

  if (importInsertion.imports.length > 0) {
    if (typeof editor.edit !== 'function' || typeof vscodeApi.Position !== 'function') {
      return failure('必要なimportを追加できませんでした。', addedImports);
    }

    try {
      const importsInserted = await insertText(vscodeApi, editor, importInsertion);
      if (!importsInserted) {
        return failure('必要なimportを追加できませんでした。', addedImports);
      }

      addedImports = importInsertion.imports;
    } catch (error) {
      return failure(
        `必要なimportを追加できませんでした: ${error.message || String(error)}`,
        addedImports
      );
    }

    // Before insertSnippet so a whole-document edit cannot break tab stops.
    await organizeImportsWithRuff(createRuffDependencies(vscodeApi, editor.document));
  }

  // Computed after Ruff, so organizing imports never sees or moves the helper.
  const requiredHelpers = Array.isArray(snippet.helpers) ? snippet.helpers : [];
  const helperInsertion = getHelperInsertion(readText(editor.document), requiredHelpers);
  let addedHelpers = [];

  if (helperInsertion.helpers.length > 0) {
    const helperFailure = (detail = '') => failure(
      (addedImports.length > 0
        ? 'importは追加しましたが、関数の定義を追加できませんでした'
        : '関数の定義を追加できませんでした') + (detail ? `: ${detail}` : '。'),
      addedImports
    );
    if (typeof editor.edit !== 'function' || typeof vscodeApi.Position !== 'function') {
      return helperFailure();
    }

    try {
      const helpersInserted = await insertText(vscodeApi, editor, helperInsertion);
      if (!helpersInserted) {
        return helperFailure();
      }

      addedHelpers = helperInsertion.helpers;
    } catch (error) {
      return helperFailure(error.message || String(error));
    }
  }

  const addedSomething = addedImports.length > 0 || addedHelpers.length > 0;
  const partialPrefix = addedHelpers.length > 0
    ? '関数の定義などは追加しましたが、'
    : 'importは追加しましたが、';

  try {
    // Earlier edits can shift every cursor down. Use the tracked selections
    // after the edits rather than inserting at their former document positions.
    const locations = Array.isArray(editor.selections) && editor.selections.length > 0
      ? editor.selections
      : editor.selection;
    const inserted = await editor.insertSnippet(
      new vscodeApi.SnippetString(
        applySnippetPlaceholderValues(snippet.body, placeholderValues)
      ),
      locations
    );

    if (!inserted) {
      return failure(
        addedSomething
          ? `${partialPrefix}スニペットを挿入できませんでした。`
          : 'スニペットを挿入できませんでした。',
        addedImports,
        addedHelpers
      );
    }

    await vscodeApi.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    return {
      ok: true,
      message: createSuccessMessage(addedImports, addedHelpers),
      addedImports,
      addedHelpers
    };
  } catch (error) {
    return failure(
      addedSomething
        ? `${partialPrefix}スニペットを挿入できませんでした: ${error.message || String(error)}`
        : `スニペットを挿入できませんでした: ${error.message || String(error)}`,
      addedImports,
      addedHelpers
    );
  }
}

function readText(document) {
  return document && typeof document.getText === 'function' ? document.getText() : '';
}

function insertText(vscodeApi, editor, insertion) {
  return editor.edit((editBuilder) => {
    editBuilder.insert(
      new vscodeApi.Position(insertion.line, insertion.character || 0),
      insertion.text
    );
  });
}

function createRuffDependencies(vscodeApi, document) {
  const extensions = vscodeApi && vscodeApi.extensions;
  const commands = vscodeApi && vscodeApi.commands;
  const workspace = vscodeApi && vscodeApi.workspace;
  const lineCount = document && Number.isInteger(document.lineCount) ? document.lineCount : 0;
  return {
    getExtension: extensions && typeof extensions.getExtension === 'function'
      ? (id) => extensions.getExtension(id)
      : undefined,
    executeCommand: commands && typeof commands.executeCommand === 'function'
      ? (...args) => commands.executeCommand(...args)
      : undefined,
    applyEdit: workspace && typeof workspace.applyEdit === 'function'
      ? (edit) => workspace.applyEdit(edit)
      : undefined,
    document,
    range: vscodeApi && typeof vscodeApi.Range === 'function'
      ? validateRange(document, new vscodeApi.Range(0, 0, lineCount, 0))
      : undefined
  };
}

function validateRange(document, range) {
  return document && typeof document.validateRange === 'function'
    ? document.validateRange(range)
    : range;
}

function createSuccessMessage(addedImports, addedHelpers) {
  const notes = [];
  if (addedImports.length > 0) {
    notes.push(`importを追加しました: ${addedImports.join('、')}`);
  }
  if (addedHelpers.length > 0) {
    notes.push(`関数の定義を追加しました: ${addedHelpers.join('、')}`);
  }
  return ['スニペットを挿入しました。', notes.join('。')].join('');
}

function failure(message, addedImports = [], addedHelpers = []) {
  return {
    ok: false,
    message,
    addedImports,
    addedHelpers
  };
}

module.exports = {
  insertInputSnippet
};
