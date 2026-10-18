const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PREFERENCES_KEY,
  applySnippetPreferences,
  getSnippetPreferences,
  normalizeSnippetPreferences,
  orderSnippetsByPreferences,
  saveSnippetPreferences
} = require('../src/snippetPreferences');

const SNIPPETS = [
  { id: 'input-a', category: 'input' },
  { id: 'input-b', category: 'input' },
  { id: 'heap-a', category: 'heap' }
];

test('normalizes hidden ids and appends newly added snippets to the order', () => {
  assert.deepEqual(
    normalizeSnippetPreferences({
      hiddenSnippetIds: ['input-b', 'unknown', 'input-b'],
      order: ['heap-a', 'input-b', 'unknown']
    }, SNIPPETS),
    {
      hiddenSnippetIds: ['input-b'],
      order: ['heap-a', 'input-b', 'input-a']
    }
  );
});

test('applies visibility and custom order only within the fixed category order', () => {
  const visible = applySnippetPreferences(SNIPPETS, {
    hiddenSnippetIds: ['heap-a'],
    order: ['heap-a', 'input-b', 'input-a']
  });

  assert.deepEqual(visible.map((snippet) => snippet.id), ['input-b', 'input-a']);
});

test('orders all snippets for the in-panel preference editor without hiding them', () => {
  const ordered = orderSnippetsByPreferences(SNIPPETS, {
    hiddenSnippetIds: ['input-a'],
    order: ['input-b', 'input-a', 'heap-a']
  });

  assert.deepEqual(ordered.map((snippet) => snippet.id), ['input-b', 'input-a', 'heap-a']);
});

test('loads and saves normalized preferences in global state', async () => {
  const writes = [];
  const globalState = {
    get(key) {
      assert.equal(key, PREFERENCES_KEY);
      return { hiddenSnippetIds: ['input-b'], order: ['input-b'] };
    },
    async update(key, value) {
      writes.push([key, value]);
    }
  };

  assert.deepEqual(getSnippetPreferences(globalState, SNIPPETS), {
    hiddenSnippetIds: ['input-b'],
    order: ['input-b', 'input-a', 'heap-a']
  });
  const saved = await saveSnippetPreferences(globalState, {
    hiddenSnippetIds: ['heap-a', 'unknown'],
    order: ['input-b', 'input-a']
  }, SNIPPETS);
  assert.deepEqual(saved, {
    hiddenSnippetIds: ['heap-a'],
    order: ['input-b', 'input-a', 'heap-a']
  });
  assert.deepEqual(writes, [[PREFERENCES_KEY, saved]]);
});
