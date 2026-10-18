'use strict';

const path = require('node:path');
const vscode = require('vscode');

const { resolveErrorDisplayMode } = require('./src/errorDisplayMode');
const { OPEN_SETTINGS_COMMAND, openPiyoyoSettings } = require('./src/piyoyoSettings');
const { createLauncherAvailabilityCache } = require('./src/pythonLauncherAvailabilityCache');
const {
  getSavedPythonPathPreference,
  savePythonPathPreference
} = require('./src/pythonPathPreference');
const { resolvePythonPath } = require('./src/pythonPathSelection');
const { runPythonFile } = require('./src/runners/pythonRunner');
const { insertInputSnippet } = require('./src/snippetInsertion');
const { INPUT_SNIPPETS, getInputSnippet } = require('./src/snippetLibrary');
const {
  applySnippetPreferences,
  getSnippetPreferences,
  orderSnippetsByPreferences,
  saveSnippetPreferences
} = require('./src/snippetPreferences');
const {
  RUNNER_FOCUSED_CONTEXT,
  TOGGLE_INPUT_FOCUS_COMMAND,
  isOpenPythonEditor,
  pickPythonEditor,
  resolveFocusTarget
} = require('./src/inputFocus');
const {
  getInputFocusShortcutLabel,
  getRunShortcutLabel,
  normalizeInputFocusShortcut
} = require('./src/keyboardShortcuts');
const { getRunnablePythonFileFromDocument, saveDocumentBeforeRun } = require('./src/targetSelection');
const { getWebviewHtml } = require('./src/webviewHtml');

const VIEW_CONTAINER_ID = 'piyoyo';
const VIEW_TYPE = 'piyoyo.runnerView';
const BRAND_NAME = 'Piyoyo';
const OPEN_COMMAND = 'piyoyo.open';
const LEGACY_OPEN_COMMAND = 'ioSprint.open';
const SAVE_AND_RUN_COMMAND = 'piyoyo.saveAndRun';

function activate(context) {
  const provider = new RunnerViewProvider(context.extensionUri, context.globalState);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(
    VIEW_TYPE,
    provider,
    {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }
  ));

  const openRunner = async () => {
    await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
    await vscode.commands.executeCommand(`${VIEW_TYPE}.focus`);
  };

  context.subscriptions.push(vscode.commands.registerCommand(OPEN_COMMAND, openRunner));
  // Keep old keybindings working after the namespace rename without exposing the old label.
  context.subscriptions.push(vscode.commands.registerCommand(LEGACY_OPEN_COMMAND, openRunner));
  context.subscriptions.push(vscode.commands.registerCommand(
    SAVE_AND_RUN_COMMAND,
    () => provider.saveAndRun(openRunner)
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    TOGGLE_INPUT_FOCUS_COMMAND,
    (args) => provider.toggleInputFocus(openRunner, args)
  ));
  context.subscriptions.push(vscode.commands.registerCommand(
    OPEN_SETTINGS_COMMAND,
    () => openPiyoyoSettings(vscode.commands, context.extension && context.extension.id)
  ));

  provider.handleActiveEditorChange(vscode.window.activeTextEditor);
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    provider.handleActiveEditorChange(editor);
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('piyoyo.errorDisplayMode')
      || event.affectsConfiguration('piyoyo.advanced.showOriginalErrors')) {
      provider.renderWebview();
    }
    // Posted instead of re-rendering so the stdin text is kept.
    if (event.affectsConfiguration('piyoyo.inputFocusShortcut')) {
      provider.postInputFocusShortcut();
    }
  }));

}

function getConfiguredInputFocusShortcut() {
  const mode = normalizeInputFocusShortcut(
    vscode.workspace.getConfiguration('piyoyo').get('inputFocusShortcut')
  );
  return { mode, label: getInputFocusShortcutLabel(mode, process.platform) };
}

function deactivate() {}

function getConfiguredErrorDisplayMode() {
  const config = vscode.workspace.getConfiguration('piyoyo');
  return resolveErrorDisplayMode({
    inspected: config.inspect('errorDisplayMode'),
    configuredMode: config.get('errorDisplayMode'),
    legacyShowOriginalErrors: config.get('advanced.showOriginalErrors', false)
  });
}

class RunnerViewProvider {
  constructor(extensionUri, globalState) {
    this.extensionUri = extensionUri;
    this.globalState = globalState;
    this.view = undefined;
    this.webviewReady = false;
    this.pendingRunRequest = false;
    this.pendingFocusInputRequest = false;
    this.runnerFocused = false;
    this.lastPythonEditor = undefined;
    this.activeFile = getRunnablePythonFileFromDocument(undefined);
    this.launcherAvailabilityCache = createLauncherAvailabilityCache();
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
    this.webviewReady = false;
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = undefined;
        this.webviewReady = false;
        this.setRunnerFocused(false);
      }
    });
    webviewView.onDidChangeVisibility(() => {
      if (this.view === webviewView && !webviewView.visible) {
        this.setRunnerFocused(false);
      }
    });
    this.refreshActiveFile(vscode.window.activeTextEditor);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    this.renderWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message.type !== 'string') {
        return;
      }

      if (message.type === 'ready') {
        this.webviewReady = true;
        this.flushPendingRunRequest();
        this.flushPendingFocusInputRequest();
        return;
      }

      if (message.type === 'focusState') {
        this.setRunnerFocused(Boolean(message.focused));
        return;
      }

      if (message.type === 'focusEditor') {
        await this.focusPythonEditor();
        return;
      }

      if (message.type === 'openSettings') {
        await vscode.commands.executeCommand(OPEN_SETTINGS_COMMAND);
        return;
      }

      if (message.type === 'savePythonPath') {
        await this.saveSelectedPythonPath(String(message.pythonPath || ''));
        return;
      }

      if (message.type === 'saveSnippetPreferences') {
        try {
          await saveSnippetPreferences(this.globalState, {
            hiddenSnippetIds: message.hiddenSnippetIds,
            order: message.order
          }, INPUT_SNIPPETS);
          this.renderWebview();
        } catch (error) {
          this.postMessage({
            type: 'snippetPreferencesResult',
            ok: false,
            message: `コード整理の保存に失敗しました: ${error.message}`
          });
        }
        return;
      }

      if (message.type === 'insertSnippet') {
        const snippet = getInputSnippet(message.snippetId);
        const result = await insertInputSnippet({
          vscodeApi: vscode,
          editor: vscode.window.activeTextEditor,
          snippet,
          placeholderValues: message.placeholderValues
        });
        this.postMessage({
          type: 'snippetResult',
          ...result
        });
        return;
      }

      if (message.type === 'run') {
        const selectedPythonPath = String(message.pythonPath || '');
        await this.saveSelectedPythonPath(selectedPythonPath);
        if (message.saveFirst) {
          await this.saveActivePythonDocument();
        }
        const result = await this.runSelectedPythonFile(
          String(message.input || ''),
          selectedPythonPath
        );
        this.postMessage({
          type: 'result',
          ...result
        });
      }
    });

    this.postLauncherAvailability();
  }

  handleActiveEditorChange(editor) {
    if (isOpenPythonEditor(editor)) {
      this.lastPythonEditor = editor;
    }
    this.refreshActiveFile(editor);
  }

  renderWebview() {
    if (!this.view) {
      return;
    }
    const snippetPreferences = getSnippetPreferences(this.globalState, INPUT_SNIPPETS);
    this.webviewReady = false;
    this.view.webview.html = getWebviewHtml({
      brandName: BRAND_NAME,
      runShortcutLabel: getRunShortcutLabel(process.platform),
      savedPythonPath: getSavedPythonPathPreference(this.globalState),
      snippets: applySnippetPreferences(INPUT_SNIPPETS, snippetPreferences),
      preferenceSnippets: orderSnippetsByPreferences(INPUT_SNIPPETS, snippetPreferences),
      snippetPreferences,
      defaultSnippetOrder: INPUT_SNIPPETS.map((snippet) => snippet.id),
      errorDisplayMode: getConfiguredErrorDisplayMode(),
      inputFocusShortcut: getConfiguredInputFocusShortcut()
    });
  }

  postInputFocusShortcut() {
    this.postMessage({ type: 'inputFocusShortcut', ...getConfiguredInputFocusShortcut() });
  }

  setRunnerFocused(focused) {
    if (this.runnerFocused === focused) {
      return;
    }
    this.runnerFocused = focused;
    vscode.commands.executeCommand('setContext', RUNNER_FOCUSED_CONTEXT, focused);
  }

  async toggleInputFocus(openRunner, args) {
    if (resolveFocusTarget(args, this.runnerFocused) === 'editor') {
      await this.focusPythonEditor();
      return;
    }
    await this.focusStdin(openRunner);
  }

  async focusStdin(openRunner) {
    this.pendingFocusInputRequest = true;
    if (this.view) {
      this.view.show(false);
      this.flushPendingFocusInputRequest();
      return;
    }
    try {
      await openRunner();
    } catch (error) {
      this.pendingFocusInputRequest = false;
      throw error;
    }
    this.flushPendingFocusInputRequest();
  }

  flushPendingFocusInputRequest() {
    if (!this.pendingFocusInputRequest || !this.view || !this.webviewReady) {
      return;
    }
    this.pendingFocusInputRequest = false;
    this.postMessage({ type: 'focusStdin' });
  }

  async focusPythonEditor() {
    const editor = pickPythonEditor(this.lastPythonEditor, vscode.window.visibleTextEditors);
    if (!editor) {
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      return;
    }
    await vscode.window.showTextDocument(editor.document, {
      viewColumn: editor.viewColumn,
      preserveFocus: false
    });
  }

  async saveAndRun(openRunner) {
    const editor = vscode.window.activeTextEditor;
    await this.saveActivePythonDocument();
    this.pendingRunRequest = true;

    if (this.view) {
      if (!this.view.visible) {
        this.view.show(true);
      }
      this.flushPendingRunRequest();
      return;
    }

    try {
      await openRunner();
    } catch (error) {
      this.pendingRunRequest = false;
      throw error;
    }
    if (editor) {
      // Opening the view moves focus into it; return to the editor so typing can continue.
      await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    }
    this.flushPendingRunRequest();
  }

  flushPendingRunRequest() {
    if (!this.pendingRunRequest || !this.view || !this.webviewReady) {
      return;
    }
    this.pendingRunRequest = false;
    this.postMessage({ type: 'requestRun' });
  }

  async saveActivePythonDocument() {
    const editor = vscode.window.activeTextEditor;
    try {
      await saveDocumentBeforeRun(editor && editor.document);
    } catch (error) {
      vscode.window.showWarningMessage(`ファイルを保存できませんでした: ${error.message}`);
    }
  }

  refreshActiveFile(editor) {
    this.activeFile = getRunnablePythonFileFromDocument(editor && editor.document);
  }

  async postLauncherAvailability() {
    this.postMessage({
      type: 'launcherProbeStatus',
      message: 'Python起動設定を判定中...'
    });

    const launchers = await this.launcherAvailabilityCache.get();
    this.postMessage({
      type: 'launcherAvailability',
      launchers
    });
  }

  postMessage(message) {
    if (!this.view) {
      return;
    }

    this.view.webview.postMessage(message);
  }

  saveSelectedPythonPath(selectedPythonPath) {
    return savePythonPathPreference(this.globalState, selectedPythonPath);
  }

  async runSelectedPythonFile(input, selectedPythonPath = '') {
    this.refreshActiveFile(vscode.window.activeTextEditor);
    const activeFile = this.activeFile;

    if (!activeFile.filePath) {
      return {
        stdout: '',
        stderr: '',
        exitCode: null,
        signal: null,
        timedOut: false,
        elapsedMs: 0,
        errorMessage: activeFile.errorMessage,
        errorExplanation: activeFile.errorMessage
      };
    }

    const config = vscode.workspace.getConfiguration('piyoyo');
    const legacyConfig = vscode.workspace.getConfiguration('ioSprint');
    const olderLegacyConfig = vscode.workspace.getConfiguration('stdioRunner');
    const pythonConfig = vscode.workspace.getConfiguration('python');
    const pythonPath = resolvePythonPath({
      selectedPythonPath,
      configPythonPath: config.get('pythonPath'),
      legacyPythonPath: legacyConfig.get('pythonPath'),
      olderLegacyPythonPath: olderLegacyConfig.get('pythonPath'),
      defaultInterpreterPath: pythonConfig.get('defaultInterpreterPath'),
      platform: process.platform
    });
    const timeoutMs = config.get('timeoutMs')
      || legacyConfig.get('timeoutMs')
      || olderLegacyConfig.get('timeoutMs')
      || 5000;
    const cwd = path.dirname(activeFile.filePath);
    const workspaceFolders = (vscode.workspace.workspaceFolders || [])
      .map((folder) => folder && folder.uri && folder.uri.fsPath)
      .filter((folderPath) => typeof folderPath === 'string' && folderPath.length > 0);

    return runPythonFile({
      filePath: activeFile.filePath,
      cwd,
      input,
      pythonPath,
      timeoutMs,
      workspaceFolders
    });
  }
}

module.exports = {
  activate,
  deactivate
};
