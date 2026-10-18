const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = require('../package.json');

test('manifest identifies the extension as Piyoyo', () => {
  assert.equal(manifest.name, 'piyoyo');
  assert.equal(manifest.displayName, 'Piyoyo');
  assert.equal(manifest.icon, 'resources/piyoyo-128.png');
});

test('manifest contributes Piyoyo to the editor title for Python files', () => {
  const command = manifest.contributes.commands.find((item) => item.command === 'piyoyo.open');
  assert.ok(command);
  assert.deepEqual(command.icon, {
    light: 'resources/piyoyo.png',
    dark: 'resources/piyoyo.png'
  });

  const editorTitleMenus = manifest.contributes.menus['editor/title'];
  assert.ok(Array.isArray(editorTitleMenus));
  assert.deepEqual(editorTitleMenus, [
    {
      command: 'piyoyo.open',
      when: 'resourceLangId == python',
      group: 'navigation@1'
    }
  ]);
});

test('manifest contributes a gear command to the Piyoyo view title', () => {
  const command = manifest.contributes.commands.find((item) => item.command === 'piyoyo.openSettings');
  assert.ok(command);
  assert.equal(command.icon, '$(gear)');
  assert.match(command.title, /設定/);
  assert.deepEqual(manifest.contributes.menus['view/title'], [
    {
      command: 'piyoyo.openSettings',
      when: 'view == piyoyo.runnerView',
      group: 'navigation'
    }
  ]);
});

test('manifest contributes a save-and-run command bound to Ctrl+Enter in Python editors', () => {
  const command = manifest.contributes.commands.find((item) => item.command === 'piyoyo.saveAndRun');
  assert.ok(command);
  assert.equal(command.title, 'Piyoyo: 保存して実行');
  assert.ok(manifest.activationEvents.includes('onCommand:piyoyo.saveAndRun'));

  const keybinding = manifest.contributes.keybindings.find((item) => item.command === 'piyoyo.saveAndRun');
  assert.ok(keybinding);
  assert.equal(keybinding.key, 'ctrl+enter');
  assert.equal(keybinding.mac, 'cmd+enter');
  const conditions = keybinding.when.split('&&').map((part) => part.trim());
  assert.ok(conditions.includes('editorTextFocus'));
  assert.ok(conditions.includes('editorLangId == python'));
  // Notebook cells keep their own Ctrl+Enter (run cell).
  assert.ok(conditions.includes('!notebookEditorFocused'));
});

test('manifest describes every setting in Japanese', () => {
  const properties = manifest.contributes.configuration.properties;
  for (const [key, setting] of Object.entries(properties)) {
    assert.match(setting.description, /[぀-ヿ一-鿿]/, key);
    assert.doesNotMatch(setting.description, /\b(?:Maximum|executable|When empty)\b/, key);
  }
});

test('manifest keeps the former open command as a hidden activation compatibility alias', () => {
  assert.ok(manifest.activationEvents.includes('onCommand:ioSprint.open'));
  assert.equal(
    manifest.contributes.commands.some((item) => item.command === 'ioSprint.open'),
    false
  );
});

test('manifest uses PNG icons for VSIX packaging and installation', () => {
  const packageIconPath = path.join(__dirname, '..', manifest.icon);
  const commandIconPath = path.join(__dirname, '..', manifest.contributes.commands[0].icon.light);
  const activityIconPath = path.join(__dirname, '..', manifest.contributes.viewsContainers.activitybar[0].icon);

  assert.ok(fs.existsSync(packageIconPath));
  assert.ok(fs.existsSync(commandIconPath));
  assert.ok(fs.existsSync(activityIconPath));
  assert.equal(path.extname(packageIconPath), '.png');
  assert.equal(path.extname(commandIconPath), '.png');
  assert.equal(path.extname(activityIconPath), '.png');
  assert.equal(commandIconPath, activityIconPath);
});

test('manifest identifies the Piyoyo release as version 0.2.0', () => {
  assert.equal(manifest.version, '0.2.0');
});

test('manifest keeps code visibility preferences inside Piyoyo instead of VS Code settings', () => {
  assert.equal(
    Object.hasOwn(
      manifest.contributes.configuration.properties,
      'piyoyo.hiddenSnippetCategories'
    ),
    false
  );
});

test('manifest keeps the legacy original-error setting as a deprecated fallback', () => {
  const setting = manifest.contributes.configuration.properties['piyoyo.advanced.showOriginalErrors'];
  assert.equal(setting.type, 'boolean');
  assert.equal(setting.default, false);
  assert.match(setting.deprecationMessage, /piyoyo\.errorDisplayMode/);
});

test('manifest offers three error display modes with Japanese labels', () => {
  const { ERROR_DISPLAY_MODES, DEFAULT_ERROR_DISPLAY_MODE } = require('../src/errorDisplayMode');
  const setting = manifest.contributes.configuration.properties['piyoyo.errorDisplayMode'];
  assert.equal(setting.type, 'string');
  assert.deepEqual(setting.enum, [...ERROR_DISPLAY_MODES]);
  assert.equal(setting.default, DEFAULT_ERROR_DISPLAY_MODE);
  assert.deepEqual(setting.enumItemLabels, ['やさしい表示', '両方表示', '原文表示']);
  assert.equal(setting.enumDescriptions.length, setting.enum.length);
});

test('manifest contributes the input focus toggle with Alt+I and Shift double-tap bindings', () => {
  const command = manifest.contributes.commands.find((item) => item.command === 'piyoyo.toggleInputFocus');
  assert.ok(command);
  assert.equal(command.title, 'Piyoyo: パネルとエディタを切り替え');
  assert.ok(manifest.activationEvents.includes('onCommand:piyoyo.toggleInputFocus'));

  const bindings = manifest.contributes.keybindings.filter((item) => item.command === 'piyoyo.toggleInputFocus');
  const editorWhen = 'editorTextFocus && editorLangId == python && !notebookEditorFocused';
  const simplified = bindings.map((item) => ({
    key: item.key,
    mac: item.mac,
    target: item.args && item.args.target,
    when: item.when
  }));
  assert.deepEqual(simplified, [
    { key: 'alt+i', mac: 'alt+i', target: 'input', when: `${editorWhen} && config.piyoyo.inputFocusShortcut != shiftShift` },
    { key: 'alt+i', mac: 'alt+i', target: 'editor', when: 'piyoyo.runnerFocused && !editorTextFocus && config.piyoyo.inputFocusShortcut != shiftShift' },
    { key: 'shift shift', mac: undefined, target: 'input', when: `${editorWhen} && config.piyoyo.inputFocusShortcut != altI` },
    { key: 'shift shift', mac: undefined, target: 'editor', when: 'piyoyo.runnerFocused && !editorTextFocus && config.piyoyo.inputFocusShortcut != altI' }
  ]);
  for (const binding of bindings) {
    assert.doesNotMatch(binding.when, /\|\||\(/);
  }

  const { RUNNER_FOCUSED_CONTEXT, TOGGLE_INPUT_FOCUS_COMMAND } = require('../src/inputFocus');
  assert.equal(TOGGLE_INPUT_FOCUS_COMMAND, 'piyoyo.toggleInputFocus');
  assert.equal(RUNNER_FOCUSED_CONTEXT, 'piyoyo.runnerFocused');
});

test('manifest keeps the tab keys inside the Piyoyo panel away from openEditorAtIndex and Go Back', () => {
  const { WORKSPACE_SHORTCUT_COMMAND } = require('../src/keyboardShortcuts');
  const command = manifest.contributes.commands.find((item) => item.command === WORKSPACE_SHORTCUT_COMMAND);
  assert.ok(command);
  assert.deepEqual(manifest.contributes.menus.commandPalette, [
    { command: WORKSPACE_SHORTCUT_COMMAND, when: 'false' }
  ]);
  const bindings = manifest.contributes.keybindings
    .filter((item) => item.command === WORKSPACE_SHORTCUT_COMMAND)
    .map((item) => ({ key: item.key, mac: item.mac, args: item.args, when: item.when }));
  assert.deepEqual(bindings, [
    { key: 'alt+1', mac: 'alt+1', args: undefined, when: 'piyoyo.runnerFocused && !editorTextFocus' },
    { key: 'alt+2', mac: 'alt+2', args: undefined, when: 'piyoyo.runnerFocused && !editorTextFocus' },
    { key: 'alt+left', mac: 'alt+left', args: undefined, when: 'piyoyo.runnerFocused && !editorTextFocus' },
    { key: 'alt+right', mac: 'alt+right', args: undefined, when: 'piyoyo.runnerFocused && !editorTextFocus' }
  ]);
});

test('manifest offers the input focus shortcut setting with Japanese choices', () => {
  const { INPUT_FOCUS_SHORTCUTS, DEFAULT_INPUT_FOCUS_SHORTCUT } = require('../src/keyboardShortcuts');
  const setting = manifest.contributes.configuration.properties['piyoyo.inputFocusShortcut'];
  assert.equal(setting.type, 'string');
  assert.deepEqual(setting.enum, [...INPUT_FOCUS_SHORTCUTS]);
  assert.equal(setting.default, DEFAULT_INPUT_FOCUS_SHORTCUT);
  assert.equal(setting.enumItemLabels.length, setting.enum.length);
  assert.equal(setting.enumDescriptions.length, setting.enum.length);
  for (const description of setting.enumDescriptions) {
    assert.match(description, /[぀-ヿ一-鿿]/);
  }
  assert.match(setting.enumDescriptions[1], /IME/);
});

test('manifest syntax-checks every source file', () => {
  for (const file of ['src/keyboardShortcuts.js', 'src/inputFocus.js']) {
    assert.ok(manifest.scripts.check.includes(`node --check ${file}`), file);
  }
});
