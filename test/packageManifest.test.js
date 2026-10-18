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

test('manifest keeps original Python tracebacks behind an advanced setting', () => {
  const setting = manifest.contributes.configuration.properties['piyoyo.advanced.showOriginalErrors'];
  assert.equal(setting.type, 'boolean');
  assert.equal(setting.default, false);
});
