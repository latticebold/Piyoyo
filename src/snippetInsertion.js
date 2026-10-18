'use strict';

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
  const source = typeof editor.document.getText === 'function'
    ? editor.document.getText()
    : '';
  const importInsertion = getImportInsertion(source, requiredImports);
  let addedImports = [];

  if (importInsertion.imports.length > 0) {
    if (typeof editor.edit !== 'function' || typeof vscodeApi.Position !== 'function') {
      return failure('必要なimportを追加できませんでした。', addedImports);
    }

    try {
      const importsInserted = await editor.edit((editBuilder) => {
        editBuilder.insert(
          new vscodeApi.Position(importInsertion.line, importInsertion.character || 0),
          importInsertion.text
        );
      });

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

  try {
    // Adding imports can shift every cursor down. Use the tracked selections
    // after the edit rather than inserting at their former document positions.
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
        addedImports.length > 0
          ? 'importは追加しましたが、スニペットを挿入できませんでした。'
          : 'スニペットを挿入できませんでした。',
        addedImports
      );
    }

    await vscodeApi.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    return {
      ok: true,
      message: createSuccessMessage(addedImports),
      addedImports
    };
  } catch (error) {
    return failure(
      addedImports.length > 0
        ? `importは追加しましたが、スニペットを挿入できませんでした: ${error.message || String(error)}`
        : `スニペットを挿入できませんでした: ${error.message || String(error)}`,
      addedImports
    );
  }
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

function createSuccessMessage(addedImports) {
  if (addedImports.length === 0) {
    return 'スニペットを挿入しました。';
  }

  return `スニペットを挿入しました。importを追加しました: ${addedImports.join('、')}`;
}

function failure(message, addedImports = []) {
  return {
    ok: false,
    message,
    addedImports
  };
}

module.exports = {
  insertInputSnippet
};
