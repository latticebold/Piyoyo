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
const { isPyPyFallback, resolvePythonPath } = require('./src/pythonPathSelection');
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
  WORKSPACE_SHORTCUT_COMMAND,
  getInputFocusShortcutLabel,
  getRunShortcutLabel,
  getWorkspaceShortcutLabels,
  normalizeInputFocusShortcut
} = require('./src/keyboardShortcuts');
const { getRunnablePythonFileFromDocument, saveDocumentBeforeRun } = require('./src/targetSelection');
const { getWebviewHtml } = require('./src/webviewHtml');
const { VerifyController } = require('./src/verify/verifyController');
const { ComplexityController } = require('./src/complexity/complexityController');

const VIEW_CONTAINER_ID = 'piyoyo';
const VIEW_TYPE = 'piyoyo.runnerView';
const BRAND_NAME = 'Piyoyo';
const OPEN_COMMAND = 'piyoyo.open';
const LEGACY_OPEN_COMMAND = 'ioSprint.open';
const SAVE_AND_RUN_COMMAND = 'piyoyo.saveAndRun';
const DEFAULT_TIMEOUT_MS = 2000;
const PYPY_DOWNLOAD_URL = 'https://pypy.org/download.html';

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
  context.subscriptions.push(vscode.commands.registerCommand(WORKSPACE_SHORTCUT_COMMAND, () => {}));
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
    if (event.affectsConfiguration('piyoyo.complexity.showInlineHints')) {
      provider.complexityController.refreshDecorations();
    }
  }));

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
    provider.complexityController.handleDocumentSaved(document);
  }));
  context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(() => {
    provider.complexityController.refreshDecorations();
  }));
  context.subscriptions.push({ dispose: () => provider.complexityController.dispose() });
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
    this.pyPyHintShown = false;
    // The 検証 tab has no launcher picker; it follows the choice saved by the 実行 tab.
    const getVerifyRunSettings = () => this.getRunSettings(getSavedPythonPathPreference(this.globalState));
    this.complexityController = new ComplexityController({
      vscodeApi: vscode,
      postMessage: (message) => this.postMessage(message),
      getRunSettings: getVerifyRunSettings,
      runPythonFile,
      getVerifyState: () => ({
        target: this.verifyController.target,
        format: this.verifyController.data.format
      }),
      extensionPath: extensionUri.fsPath
    });
    this.verifyController = new VerifyController({
      vscodeApi: vscode,
      postMessage: (message) => this.postMessage(message),
      getRunSettings: getVerifyRunSettings,
      runPythonFile,
      onTargetChanged: (target) => this.complexityController.handleTargetChanged(target),
      onFormatChanged: () => this.complexityController.handleFormatChanged()
    });
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
        this.verifyController.postLoaded();
        this.complexityController.publish();
        return;
      }

      if (message.type.startsWith('verify')) {
        await this.verifyController.handleMessage(message);
        return;
      }

      if (message.type.startsWith('complexity')) {
        await this.complexityController.handleMessage(message);
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
      inputFocusShortcut: getConfiguredInputFocusShortcut(),
      platform: process.platform,
      workspaceShortcutLabels: getWorkspaceShortcutLabels(process.platform)
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
    // Other editors (settings, output) keep the last Python file as the 検証 target.
    if (this.activeFile.filePath) {
      this.verifyController.setTargetFile(this.activeFile.filePath);
    }
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

  showPyPyInstallHint() {
    const config = vscode.workspace.getConfiguration('piyoyo');
    // Once per session so repeated runs do not stack the same notice.
    if (this.pyPyHintShown || !config.get('showPyPyInstallHint', true)) {
      return;
    }
    this.pyPyHintShown = true;

    const installAction = 'PyPy の入れ方を見る';
    const hideAction = '今後表示しない';
    // Not awaited: the run must not wait for the user to close the notice.
    vscode.window.showInformationMessage(
      'PyPy が見つからないので Python で実行しました。PyPy を入れると、AtCoder の提出に近い速さで試せます。',
      installAction,
      hideAction
    ).then(async (choice) => {
      if (choice === installAction) {
        await vscode.env.openExternal(vscode.Uri.parse(PYPY_DOWNLOAD_URL));
      } else if (choice === hideAction) {
        await config.update('showPyPyInstallHint', false, vscode.ConfigurationTarget.Global);
      }
    });
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

    const { pythonPath, timeoutMs, workspaceFolders } = await this.getRunSettings(selectedPythonPath);
    const cwd = path.dirname(activeFile.filePath);

    return runPythonFile({
      filePath: activeFile.filePath,
      cwd,
      input,
      pythonPath,
      timeoutMs,
      workspaceFolders
    });
  }

  // Shared by the 実行 and 検証 tabs so both pick the same interpreter and time limit.
  async getRunSettings(selectedPythonPath = '') {
    const config = vscode.workspace.getConfiguration('piyoyo');
    const legacyConfig = vscode.workspace.getConfiguration('ioSprint');
    const olderLegacyConfig = vscode.workspace.getConfiguration('stdioRunner');
    const pythonConfig = vscode.workspace.getConfiguration('python');
    const launchers = await this.launcherAvailabilityCache.get();
    const pathOptions = {
      selectedPythonPath,
      configPythonPath: config.get('pythonPath'),
      legacyPythonPath: legacyConfig.get('pythonPath'),
      olderLegacyPythonPath: olderLegacyConfig.get('pythonPath'),
      availableLaunchers: launchers
        .filter((launcher) => launcher.available)
        .map((launcher) => launcher.launcher),
      defaultInterpreterPath: pythonConfig.get('defaultInterpreterPath'),
      platform: process.platform
    };
    const pythonPath = resolvePythonPath(pathOptions);
    if (isPyPyFallback(pathOptions)) {
      this.showPyPyInstallHint();
    }
    const timeoutMs = config.get('timeoutMs')
      || legacyConfig.get('timeoutMs')
      || olderLegacyConfig.get('timeoutMs')
      || DEFAULT_TIMEOUT_MS;
    const workspaceFolders = (vscode.workspace.workspaceFolders || [])
      .map((folder) => folder && folder.uri && folder.uri.fsPath)
      .filter((folderPath) => typeof folderPath === 'string' && folderPath.length > 0);

    return { pythonPath, timeoutMs, workspaceFolders };
  }
}

module.exports = {
  activate,
  deactivate
};
