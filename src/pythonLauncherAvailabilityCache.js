'use strict';

const { inspectPythonLaunchers } = require('./pythonLauncherAvailability');

function createLauncherAvailabilityCache({
  inspectLaunchers = inspectPythonLaunchers
} = {}) {
  const promise = Promise.resolve(inspectLaunchers());

  return {
    get() {
      return promise;
    }
  };
}

module.exports = {
  createLauncherAvailabilityCache
};
