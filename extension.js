'use strict';

const path = require('node:path');
const vscode = require('vscode');

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
const { getRunnablePythonFileFromDocument } = require('./src/targetSelection');
const { getWebviewHtml } = require('./src/webviewHtml');

const VIEW_CONTAINER_ID = 'piyoyo';
const VIEW_TYPE = 'piyoyo.runnerView';
const BRAND_NAME = 'Piyoyo';
const OPEN_COMMAND = 'piyoyo.open';
const LEGACY_OPEN_COMMAND = 'ioSprint.open';

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

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
    provider.handleActiveEditorChange(editor);
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('piyoyo.advanced.showOriginalErrors')) {
      provider.renderWebview();
    }
  }));

}

function deactivate() {}

class RunnerViewProvider {
  constructor(extensionUri, globalState) {
    this.extensionUri = extensionUri;
    this.globalState = globalState;
    this.view = undefined;
    this.activeFile = getRunnablePythonFileFromDocument(undefined);
    this.launcherAvailabilityCache = createLauncherAvailabilityCache();
  }

  resolveWebviewView(webviewView) {
    this.view = webviewView;
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
    this.refreshActiveFile(editor);
  }

  renderWebview() {
    if (!this.view) {
      return;
    }
    const snippetPreferences = getSnippetPreferences(this.globalState, INPUT_SNIPPETS);
    this.view.webview.html = getWebviewHtml({
      brandName: BRAND_NAME,
      savedPythonPath: getSavedPythonPathPreference(this.globalState),
      snippets: applySnippetPreferences(INPUT_SNIPPETS, snippetPreferences),
      preferenceSnippets: orderSnippetsByPreferences(INPUT_SNIPPETS, snippetPreferences),
      snippetPreferences,
      defaultSnippetOrder: INPUT_SNIPPETS.map((snippet) => snippet.id),
      showOriginalErrors: vscode.workspace.getConfiguration('piyoyo').get('advanced.showOriginalErrors', false)
    });
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
