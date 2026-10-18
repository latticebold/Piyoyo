'use strict';

const OPEN_SETTINGS_COMMAND = 'piyoyo.openSettings';
const DEFAULT_EXTENSION_ID = 'local.piyoyo';

function getSettingsQuery(extensionId) {
  return `@ext:${extensionId || DEFAULT_EXTENSION_ID}`;
}

function openPiyoyoSettings(commands, extensionId) {
  return commands.executeCommand('workbench.action.openSettings', getSettingsQuery(extensionId));
}

module.exports = {
  DEFAULT_EXTENSION_ID,
  OPEN_SETTINGS_COMMAND,
  getSettingsQuery,
  openPiyoyoSettings
};
