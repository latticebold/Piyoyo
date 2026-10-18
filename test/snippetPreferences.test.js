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

test('maps merged ids in the saved order to their survivor and drops unknown ids', () => {
  const aliases = { 'input-old': 'input-b', 'input-missing-target': 'gone' };
  assert.deepEqual(
    normalizeSnippetPreferences({
      hiddenSnippetIds: ['input-old', 'unknown', 'input-missing-target'],
      order: ['input-old', 'heap-a', 'input-missing-target', 'unknown', 'input-a']
    }, SNIPPETS, aliases),
    {
      hiddenSnippetIds: [],
      order: ['input-b', 'heap-a', 'input-a']
    }
  );
});

test('keeps the first position when both a merged id and its survivor are saved', () => {
  const aliases = { 'input-old': 'input-b' };
  assert.deepEqual(
    normalizeSnippetPreferences({
      hiddenSnippetIds: ['input-old', 'input-b'],
      order: ['input-a', 'input-b', 'input-old']
    }, SNIPPETS, aliases),
    {
      hiddenSnippetIds: ['input-b'],
      order: ['input-a', 'input-b', 'heap-a']
    }
  );
});

test('real merged snippet ids from older versions keep working', () => {
  const { INPUT_SNIPPETS } = require('../src/snippetLibrary');
  const normalized = normalizeSnippetPreferences({
    hiddenSnippetIds: ['string-first', 'dict-contains'],
    order: ['string-slice', 'list-access']
  }, INPUT_SNIPPETS);
  assert.deepEqual(normalized.hiddenSnippetIds, []);
  assert.deepEqual(normalized.order.slice(0, 2), ['list-slice', 'list-access']);
  assert.equal(normalized.order.length, INPUT_SNIPPETS.length);
  assert.equal(applySnippetPreferences(INPUT_SNIPPETS, normalized).length, INPUT_SNIPPETS.length);
});

test('an order saved before categories were merged groups moved snippets under their new category', () => {
  const { INPUT_SNIPPETS, SNIPPET_CATEGORY_ORDER } = require('../src/snippetLibrary');
  // Old layout: input, output, ..., index-slice, string, condition-check, ..., string-algorithm, ..., debug.
  const oldOrder = [
    'output-value', 'list-max', 'list-access', 'string-count', 'string-isdigit',
    'aggregation-counter', 'string-z-algorithm', 'queue-pop', 'debug-type'
  ];
  const visible = applySnippetPreferences(INPUT_SNIPPETS, {
    hiddenSnippetIds: ['string-isdigit'],
    order: oldOrder
  });
  const categories = visible.map((snippet) => snippet.category);

  assert.equal(visible.length, INPUT_SNIPPETS.length - 1);
  assert.deepEqual([...new Set(categories)], SNIPPET_CATEGORY_ORDER);
  const ids = visible.map((snippet) => snippet.id);
  const stringIds = visible.filter((snippet) => snippet.category === 'string').map((snippet) => snippet.id);
  assert.deepEqual(stringIds.slice(0, 2), ['string-count', 'string-z-algorithm']);
  assert.ok(ids.indexOf('debug-type') > ids.indexOf('binary-bisect-left'));
  assert.equal(ids.indexOf('output-value') + 1, ids.indexOf('debug-type'));
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
