'use strict';

const { SNIPPET_CATEGORY_ORDER, SNIPPET_ID_ALIASES } = require('./snippetLibrary');

const PREFERENCES_KEY = 'piyoyo.snippetPreferences.v1';

function normalizeSnippetPreferences(value, snippets, aliases = SNIPPET_ID_ALIASES) {
  const snippetIds = snippets.map((snippet) => snippet.id);
  const knownIds = new Set(snippetIds);
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const isAlias = (snippetId) => !knownIds.has(snippetId) && Object.hasOwn(aliases, snippetId);
  // Hiding a removed duplicate must not hide the snippet that replaced it.
  const hiddenSnippetIds = [...new Set(
    (Array.isArray(source.hiddenSnippetIds) ? source.hiddenSnippetIds : [])
      .filter((snippetId) => typeof snippetId === 'string' && knownIds.has(snippetId))
  )];
  const configuredOrder = [...new Set(
    (Array.isArray(source.order) ? source.order : [])
      .filter((snippetId) => typeof snippetId === 'string')
      .map((snippetId) => (isAlias(snippetId) ? aliases[snippetId] : snippetId))
      .filter((snippetId) => knownIds.has(snippetId))
  )];
  const configuredIds = new Set(configuredOrder);

  return {
    hiddenSnippetIds,
    order: configuredOrder.concat(snippetIds.filter((snippetId) => !configuredIds.has(snippetId)))
  };
}

function orderSnippetsByPreferences(snippets, preferences) {
  const normalized = normalizeSnippetPreferences(preferences, snippets);
  const orderIndex = new Map(normalized.order.map((snippetId, index) => [snippetId, index]));
  const categoryIndex = new Map(
    SNIPPET_CATEGORY_ORDER.map((categoryId, index) => [categoryId, index])
  );

  return [...snippets]
    .sort((left, right) => {
      const categoryDifference = (categoryIndex.get(left.category) ?? Number.MAX_SAFE_INTEGER)
        - (categoryIndex.get(right.category) ?? Number.MAX_SAFE_INTEGER);
      if (categoryDifference !== 0) {
        return categoryDifference;
      }
      return orderIndex.get(left.id) - orderIndex.get(right.id);
    });
}

function applySnippetPreferences(snippets, preferences) {
  const normalized = normalizeSnippetPreferences(preferences, snippets);
  const hiddenSnippetIds = new Set(normalized.hiddenSnippetIds);
  return orderSnippetsByPreferences(snippets, normalized)
    .filter((snippet) => !hiddenSnippetIds.has(snippet.id));
}

function getSnippetPreferences(globalState, snippets) {
  return normalizeSnippetPreferences(globalState.get(PREFERENCES_KEY), snippets);
}

async function saveSnippetPreferences(globalState, value, snippets) {
  const preferences = normalizeSnippetPreferences(value, snippets);
  await globalState.update(PREFERENCES_KEY, preferences);
  return preferences;
}

module.exports = {
  PREFERENCES_KEY,
  applySnippetPreferences,
  getSnippetPreferences,
  normalizeSnippetPreferences,
  orderSnippetsByPreferences,
  saveSnippetPreferences
};
