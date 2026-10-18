'use strict';

const crypto = require('node:crypto');
const {
  SNIPPET_CATEGORY_ORDER,
  getSnippetPlaceholders
} = require('./snippetLibrary');
const {
  DEFAULT_ERROR_DISPLAY_MODE,
  getErrorPresentation,
  normalizeErrorDisplayMode
} = require('./errorDisplayMode');
const {
  DEFAULT_INPUT_FOCUS_SHORTCUT,
  SHIFT_DOUBLE_TAP_INTERVAL_MS,
  createShiftDoubleTapDetector,
  getDisclosureArrowAction,
  getNextIndex,
  getTextFieldEdgeWorkspaceTarget,
  getWorkspaceShortcutLabels,
  getWorkspaceShortcutTarget,
  isEditableTarget,
  isImeComposing,
  isInputFocusShortcut,
  isRunShortcut,
  isSearchShortcut,
  isTextEntryTarget,
  normalizeInputFocusShortcut
} = require('./keyboardShortcuts');

function getStdinPlaceholder(shortcutLabel) {
  return `ここに複数行の入力を貼り付け（${shortcutLabel} でエディタと行き来）`;
}

function getStdinTitle(shortcutLabel) {
  return `${shortcutLabel} でPythonのエディタと行き来できます`;
}

const EMPTY_SELECTION_HELP = '一覧から使いたいコードを選んでください（↑↓ で移動、Enter で挿入）。';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function scriptJson(value) {
  return JSON.stringify(String(value))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function scriptJsonData(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Order is display order. Each type differs in text and shape, not only color.
const SNIPPET_BADGE_TYPES = Object.freeze([
  Object.freeze({
    type: 'helper',
    text: '自作',
    shortText: '自',
    label: '自作関数: Pythonの組み込み関数ではありません。挿入すると、Piyoyoが関数の定義（def）をファイルの上の方に1回だけ追加します。',
    applies: (snippet) => Array.isArray(snippet.helpers) && snippet.helpers.length > 0
  }),
  Object.freeze({
    type: 'import',
    text: '輸入',
    shortText: '輸',
    label: '輸入（importが必要）: Pythonに付属する標準ライブラリを使います。足りないimportは、挿入するときにファイルの先頭へ自動で追加します。',
    applies: (snippet) => Array.isArray(snippet.imports) && snippet.imports.length > 0
  }),
  Object.freeze({
    type: 'external',
    text: '外部',
    shortText: '外',
    label: '外部ライブラリが必要: Pythonに付属しないパッケージを使います。別にインストールしないと動きません。',
    applies: (snippet) => Array.isArray(snippet.externalPackages) && snippet.externalPackages.length > 0
  })
]);

function getSnippetBadges(snippet) {
  return SNIPPET_BADGE_TYPES
    .filter((badge) => badge.applies(snippet))
    .map(({ type, text, shortText, label }) => ({ type, text, shortText, label }));
}

function renderSnippetBadge(badge, { decorative = false, split = false } = {}) {
  const className = `snippetBadge snippetBadge-${escapeHtml(badge.type)}`;
  const text = escapeHtml(split ? badge.shortText : badge.text);
  if (decorative) {
    return `<span class="${className}" aria-hidden="true">${text}</span>`;
  }
  return `<span class="${className}" role="img" aria-label="${escapeHtml(badge.label)}" title="${escapeHtml(badge.label)}">${text}</span>`;
}

// Two or more types share the cell, one kanji each (top / bottom).
function renderSnippetBadgeCell(badges, { decorative = false, rowCell = true } = {}) {
  const split = badges.length > 1;
  const className = `snippetBadgeCell${split ? ' isSplit' : ''}`;
  const attributes = rowCell ? ' data-snippet-badges' : ' aria-hidden="true"';
  return `<span class="${className}"${attributes}>${badges
    .map((badge) => renderSnippetBadge(badge, { decorative, split }))
    .join('')}</span>`;
}

const COMPLEXITY_SHORT_MAX_LENGTH = 10;
const COMPLEXITY_DETAIL_TEXT = '詳細';

// Display-only short notation, e.g. "O(n × m)" -> "O(mn)". Falls back to 詳細.
function getComplexityShortForm(time) {
  const source = String(time ?? '').trim();
  if (!source) {
    return '';
  }
  const match = /^O\((.+)\)$/.exec(source);
  if (!match) {
    return COMPLEXITY_DETAIL_TEXT;
  }
  const inner = match[1].trim().replace(/\s+/g, ' ')
    .split(/\s*\+\s*/)
    .map((term) => {
      const factors = term.split(/\s*[×*]\s*/);
      return factors.length > 1 && factors.every((factor) => /^[A-Za-z]$/.test(factor))
        ? factors.sort().join('')
        : term;
    })
    .join(' + ');
  const short = `O(${inner})`;
  return short.length <= COMPLEXITY_SHORT_MAX_LENGTH && !/[×*]/.test(short)
    ? short
    : COMPLEXITY_DETAIL_TEXT;
}

function getComplexityPresentation(complexity) {
  if (!complexity || !complexity.time) {
    return null;
  }
  const full = [complexity.qualifier, complexity.time].filter(Boolean).join(' ');
  return {
    short: getComplexityShortForm(complexity.time),
    full,
    detail: complexity.detail || '',
    label: `計算量: ${full}（押すと説明を表示）`
  };
}

function renderComplexityChip(complexity) {
  const presentation = getComplexityPresentation(complexity);
  const hidden = presentation ? '' : ' hidden';
  const view = presentation || { short: '', full: '', detail: '', label: '' };
  return `<button type="button" class="snippetComplexity" tabindex="-1" data-snippet-complexity aria-haspopup="dialog" aria-expanded="false" aria-controls="snippetComplexityPopover" data-complexity-full="${escapeHtml(view.full)}" data-complexity-detail="${escapeHtml(view.detail)}" aria-label="${escapeHtml(view.label)}" title="${escapeHtml(view.label)}"${hidden}>${escapeHtml(view.short)}</button>`;
}

function renderSnippetBadgeLegend(snippets) {
  const usedBadges = SNIPPET_BADGE_TYPES
    .filter((badge) => snippets.some((snippet) => badge.applies(snippet)));
  if (usedBadges.length === 0) {
    return '';
  }
  const items = usedBadges.map((badge) => `
          <li class="snippetBadgeLegendItem">${renderSnippetBadgeCell([badge], { decorative: true, rowCell: false })}<span>${escapeHtml(badge.label)}</span></li>`).join('');
  const splitBadges = usedBadges.slice(0, 2);
  const splitItem = splitBadges.length > 1 ? `
          <li class="snippetBadgeLegendItem">${renderSnippetBadgeCell(splitBadges, { decorative: true, rowCell: false })}<span>2種類に当てはまる項目は、上下に1文字ずつ表示します（${splitBadges.map((badge) => `${escapeHtml(badge.shortText)}＝${escapeHtml(badge.text)}`).join('、')}）。</span></li>` : '';
  return `
      <details id="snippetBadgeLegend" class="snippetBadgeLegend">
        <summary>アイコンの見方</summary>
        <ul class="snippetBadgeLegendList">${items}${splitItem}
        </ul>
        <p class="snippetBadgeLegendNote">右下の計算量（O(n) など）を押すと、最悪・平均・償却の区別と詳しい説明が出ます。短く書けない計算量は「詳細」と表示します。</p>
      </details>`;
}

function getSnippetCategories(snippets) {
  const categories = new Map();

  snippets.forEach((snippet) => {
    if (!categories.has(snippet.category)) {
      categories.set(snippet.category, {
        id: snippet.category,
        label: snippet.categoryLabel,
        count: 0
      });
    }
    categories.get(snippet.category).count += 1;
  });

  const categoryList = Array.from(categories.values());
  const categoryById = new Map(categoryList.map((category) => [category.id, category]));
  const orderedCategories = SNIPPET_CATEGORY_ORDER
    .map((categoryId) => categoryById.get(categoryId))
    .filter(Boolean);
  const orderedIds = new Set(orderedCategories.map((category) => category.id));
  return orderedCategories.concat(
    categoryList.filter((category) => !orderedIds.has(category.id))
  );
}

function getSnippetTooltip(snippet) {
  return [
    snippet.description ? `説明: ${snippet.description}` : '',
    snippet.input ? `入力: ${snippet.input}` : '',
    snippet.returns ? `返り値: ${snippet.returns}` : '',
    snippet.precondition ? `前提: ${snippet.precondition}` : '',
    snippet.complexity?.detail ? `計算量: ${snippet.complexity.qualifier} ${snippet.complexity.time}。${snippet.complexity.detail}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function getAnnotatedTextParts(text, placeholders) {
  const source = String(text || '');
  const fields = placeholders.filter((field) => field.defaultValue)
    .sort((left, right) => right.defaultValue.length - left.defaultValue.length);
  const parts = [];
  let cursor = 0;
  let plainStart = 0;
  while (cursor < source.length) {
    const field = fields.find(({ defaultValue }) => {
      if (!source.startsWith(defaultValue, cursor)) {
        return false;
      }
      // Japanese prose may touch a variable (リストA); ASCII identifiers may not.
      const before = source[cursor - 1] || '';
      const after = source[cursor + defaultValue.length] || '';
      return !(/[A-Za-z0-9_]/.test(defaultValue[0]) && /[A-Za-z0-9_]/.test(before))
        && !(/[A-Za-z0-9_]/.test(defaultValue.at(-1)) && /[A-Za-z0-9_]/.test(after));
    });
    if (!field) {
      cursor += 1;
      continue;
    }
    if (cursor > plainStart) {
      parts.push({ text: source.slice(plainStart, cursor) });
    }
    parts.push({ index: field.index, defaultValue: field.defaultValue });
    cursor += field.defaultValue.length;
    plainStart = cursor;
  }
  if (plainStart < source.length) {
    parts.push({ text: source.slice(plainStart) });
  }
  return parts;
}

function renderAnnotatedParts(parts) {
  return parts.map((part) => Object.prototype.hasOwnProperty.call(part, 'text')
    ? escapeHtml(part.text)
    : `<span class="snippetParameter">${escapeHtml(part.defaultValue)}</span>`).join('');
}

function getSnippetPresentation(snippet) {
  // Render the actual insertion body, not its sometimes abbreviated list label.
  // Token offsets keep identical default names in different fields independent.
  const body = String(snippet.body || snippet.label || '');
  const codeParts = [];
  let cursor = 0;
  for (const match of body.matchAll(/\$\{(\d+)(?::([^}]*))?\}/g)) {
    if (match.index > cursor) {
      codeParts.push({ text: body.slice(cursor, match.index) });
    }
    codeParts.push({ index: Number(match[1]), defaultValue: match[2] || '' });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) {
    codeParts.push({ text: body.slice(cursor) });
  }
  const placeholders = getSnippetPlaceholders(snippet.body);
  const defaultCode = codeParts.map((part) => part.text ?? part.defaultValue).join('');
  return {
    summary: snippet.summary || snippet.description || snippet.label || '',
    tooltip: getSnippetTooltip(snippet),
    placeholders: JSON.stringify(placeholders),
    codeParts: JSON.stringify(codeParts),
    // For code labels use body tokens, so uneditable literals stay white.
    previewParts: defaultCode === snippet.label
      ? codeParts
      : getAnnotatedTextParts(snippet.label, placeholders)
  };
}

function getSnippetRows(snippets, category) {
  const rows = [];
  const groupedRows = new Map();

  snippets
    .filter((snippet) => snippet.category === category)
    .forEach((snippet) => {
      if (!snippet.selectorGroup) {
        rows.push({ snippets: [snippet], grouped: false });
        return;
      }

      let row = groupedRows.get(snippet.selectorGroup);
      if (!row) {
        row = { snippets: [], grouped: true, groupId: snippet.selectorGroup };
        groupedRows.set(snippet.selectorGroup, row);
        rows.push(row);
      }
      row.snippets.push(snippet);
    });

  return rows;
}

function getSnippetVariantData(snippet) {
  const presentation = getSnippetPresentation(snippet);
  return {
    id: snippet.id,
    choiceLabel: snippet.choiceLabel || presentation.summary,
    label: snippet.label,
    description: snippet.description || presentation.summary,
    tooltip: presentation.tooltip,
    placeholders: presentation.placeholders,
    codeParts: presentation.codeParts,
    previewParts: presentation.previewParts,
    precondition: snippet.precondition || '',
    imports: snippet.imports || [],
    helpers: getHelperNames(snippet),
    badges: getSnippetBadges(snippet),
    complexity: getComplexityPresentation(snippet.complexity)
  };
}

function getHelperNames(snippet) {
  return Array.isArray(snippet.helpers) ? snippet.helpers.map((helper) => helper.name) : [];
}

function getSnippetSearchText(snippets, groupLabel = '') {
  return [
    groupLabel,
    ...snippets.flatMap((snippet) => [
      snippet.summary,
      snippet.description,
      snippet.input,
      snippet.returns,
      snippet.precondition,
      snippet.label,
      snippet.body,
      snippet.choiceLabel,
      snippet.complexity?.time,
      snippet.complexity?.detail
    ])
  ]
    .filter(Boolean)
    .join(' ');
}

function renderSnippetRow(row, category) {
  if (row.grouped) {
    const groupId = `${category}-${row.groupId}`;
    const groupLabel = row.snippets[0].selectorGroupLabel
      || row.snippets.map((snippet) => snippet.summary || snippet.label).join(' / ');
    const tooltip = row.snippets.map(getSnippetTooltip).filter(Boolean).join('\n\n');
    const firstSnippet = row.snippets[0];
    const firstPresentation = getSnippetPresentation(firstSnippet);
    const variants = JSON.stringify(row.snippets.map(getSnippetVariantData));
    const searchText = getSnippetSearchText(row.snippets, groupLabel);

    return `
          <div class="snippetRow snippetVariantRow" data-snippet-row="${escapeHtml(groupId)}" data-snippet-search="${escapeHtml(searchText)}">
            <button type="button" class="snippetChoice" aria-pressed="false" data-snippet-entry="${escapeHtml(firstSnippet.id)}" data-snippet-group="${escapeHtml(groupId)}" data-snippet-variants="${escapeHtml(variants)}" data-snippet-id="${escapeHtml(firstSnippet.id)}" data-snippet-label="${escapeHtml(firstSnippet.label)}" data-snippet-description="${escapeHtml(firstSnippet.description || firstPresentation.summary)}" data-snippet-tooltip="${escapeHtml(tooltip)}" data-snippet-placeholders="${escapeHtml(firstPresentation.placeholders)}" data-snippet-imports="${escapeHtml(JSON.stringify(firstSnippet.imports || []))}" data-snippet-helpers="${escapeHtml(JSON.stringify(getHelperNames(firstSnippet)))}" title="${escapeHtml(tooltip)}">
              ${renderSnippetBadgeCell(getSnippetBadges(firstSnippet))}
              <span class="snippetRowSummary">${renderAnnotatedParts(getAnnotatedTextParts(groupLabel, getSnippetPlaceholders(firstSnippet.body)))}</span>
              <code class="snippetRowPreview" data-snippet-row-preview>${renderAnnotatedParts(firstPresentation.previewParts)}</code>
            </button>
            ${renderComplexityChip(firstSnippet.complexity)}
          </div>`;
  }

  const snippet = row.snippets[0];
  const presentation = getSnippetPresentation(snippet);
  const searchText = getSnippetSearchText([snippet]);
  return `
          <div class="snippetRow" data-snippet-row="${escapeHtml(snippet.id)}" data-snippet-search="${escapeHtml(searchText)}">
            <button type="button" class="snippetChoice" aria-pressed="false" data-snippet-entry="${escapeHtml(snippet.id)}" data-snippet-id="${escapeHtml(snippet.id)}" data-snippet-label="${escapeHtml(snippet.label)}" data-snippet-description="${escapeHtml(snippet.description || presentation.summary)}" data-snippet-tooltip="${escapeHtml(presentation.tooltip)}" data-snippet-placeholders="${escapeHtml(presentation.placeholders)}" data-snippet-code-parts="${escapeHtml(presentation.codeParts)}" data-snippet-preview-parts="${escapeHtml(JSON.stringify(presentation.previewParts))}" data-snippet-precondition="${escapeHtml(snippet.precondition || '')}" data-snippet-imports="${escapeHtml(JSON.stringify(snippet.imports || []))}" data-snippet-helpers="${escapeHtml(JSON.stringify(getHelperNames(snippet)))}" title="${escapeHtml(presentation.tooltip)}">
              ${renderSnippetBadgeCell(getSnippetBadges(snippet))}
              <span class="snippetRowSummary">${renderAnnotatedParts(getAnnotatedTextParts(presentation.summary, getSnippetPlaceholders(snippet.body)))}</span>
              <code class="snippetRowPreview" data-snippet-row-preview>${renderAnnotatedParts(presentation.previewParts)}</code>
            </button>
            ${renderComplexityChip(snippet.complexity)}
          </div>`;
}

function renderSnippetPicker(snippets, category) {
  return `<div class="snippetRows">${getSnippetRows(snippets, category)
    .map((row) => renderSnippetRow(row, category))
    .join('')}</div>`;
}

function renderSnippetLibrary(snippets) {
  const categories = getSnippetCategories(snippets);
  const panels = categories
    .map((category, index) => `
      <details id="snippetCategoryPanel-${escapeHtml(category.id)}" class="snippetCategoryDropdown" data-snippet-category-panel="${escapeHtml(category.id)}"${index === 0 ? ' open' : ''}>
        <summary>
          <span class="snippetCategorySummaryLabel">${escapeHtml(category.label)}</span>
          <svg class="snippetCategoryChevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span class="snippetCategoryCount" data-snippet-category-count data-total-count="${category.count}">${category.count}件</span>
        </summary>
        <div class="snippetCategoryBody">
          ${renderSnippetPicker(snippets, category.id)}
        </div>
      </details>`)
    .join('');

  return { panels, categoryCount: categories.length, legend: renderSnippetBadgeLegend(snippets) };
}

function renderSnippetPreferences(snippets, preferences, defaultSnippetOrder) {
  const hiddenSnippetIds = new Set(preferences.hiddenSnippetIds || []);
  const defaultOrderIndex = new Map(
    defaultSnippetOrder.map((snippetId, index) => [snippetId, index])
  );
  const categories = getSnippetCategories(snippets);
  const categoryPanels = categories.map((category, categoryIndex) => {
    const rows = snippets
      .filter((snippet) => snippet.category === category.id)
      .map((snippet) => {
        const isVisible = !hiddenSnippetIds.has(snippet.id);
        const searchText = getSnippetSearchText([snippet], category.label);
        return `
          <div class="snippetPreferenceRow${isVisible ? '' : ' isPreferenceHidden'}" data-snippet-preference-row="${escapeHtml(snippet.id)}" data-snippet-preference-category="${escapeHtml(category.id)}" data-snippet-preference-search="${escapeHtml(searchText)}" data-default-index="${defaultOrderIndex.get(snippet.id) ?? Number.MAX_SAFE_INTEGER}">
            <label class="snippetPreferenceToggle" title="${escapeHtml(snippet.summary)}を表示する">
              <input type="checkbox" data-snippet-preference-visible aria-label="${escapeHtml(snippet.summary)}を表示"${isVisible ? ' checked' : ''}>
              <span class="snippetPreferenceSwitch" aria-hidden="true"></span>
              <span class="snippetPreferenceToggleText">${isVisible ? '表示' : '非表示'}</span>
            </label>
            <span class="snippetPreferenceCopy">
              <span class="snippetPreferenceSummary">${escapeHtml(snippet.summary)}</span>
              <code class="snippetPreferencePreview">${escapeHtml(snippet.label)}</code>
            </span>
            <span class="snippetPreferenceMoves">
              <button type="button" class="snippetPreferenceMove" data-snippet-move="up" aria-label="${escapeHtml(snippet.summary)}を上へ移動" title="上へ移動">↑</button>
              <button type="button" class="snippetPreferenceMove" data-snippet-move="down" aria-label="${escapeHtml(snippet.summary)}を下へ移動" title="下へ移動">↓</button>
            </span>
          </div>`;
      })
      .join('');
    return `
      <details class="snippetPreferenceCategory" data-snippet-preference-category-panel="${escapeHtml(category.id)}"${categoryIndex === 0 ? ' open' : ''}>
        <summary>
          <span>${escapeHtml(category.label)}</span>
          <span class="snippetPreferenceCategoryCount" data-snippet-preference-category-count>${category.count}件</span>
        </summary>
        <div class="snippetPreferenceRows">${rows}</div>
      </details>`;
  }).join('');

  return { categoryPanels };
}

function renderErrorField(mode) {
  const explanationLabel = '<span class="fileLabel toneError">エラーの説明</span>';
  const explanationBox = '<pre id="errorExplanation" class="outputBox stderrBox"></pre>';
  const originalBox = '<pre id="stderr" class="outputBox stderrBox"></pre>';
  const originalSection = '<div id="originalErrorSection" class="outputField">'
    + '<span class="fileLabel toneError">Pythonの原文（エラーとトレースバック）</span>'
    + originalBox
    + '</div>';

  let body;
  if (mode === 'original') {
    body = originalSection
      + '<details id="errorExplanationDetails" class="errorDetails"><summary>日本語の説明を見る</summary>'
      + explanationBox
      + '</details>';
  } else if (mode === 'both') {
    body = explanationLabel + explanationBox + originalSection;
  } else {
    body = explanationLabel + explanationBox
      + '<details id="originalErrorDetails" class="errorDetails"><summary>原文を見る</summary>'
      + originalBox
      + '</details>';
  }
  body += '<button type="button" class="settingsLink" data-open-settings title="Piyoyoの設定を開く">エラーの表示方法を設定で変える</button>';
  return `<div id="stderrField" class="outputField" data-error-display-mode="${escapeHtml(mode)}" hidden>${body}</div>`;
}

function getWebviewHtml({
  brandName = 'Piyoyo',
  savedPythonPath = '',
  snippets = [],
  preferenceSnippets = snippets,
  snippetPreferences = { hiddenSnippetIds: [], order: [] },
  defaultSnippetOrder = preferenceSnippets.map((snippet) => snippet.id),
  errorDisplayMode = DEFAULT_ERROR_DISPLAY_MODE,
  runShortcutLabel = 'Ctrl+Enter',
  inputFocusShortcut = { mode: DEFAULT_INPUT_FOCUS_SHORTCUT, label: 'Alt+I' },
  platform = '',
  workspaceShortcutLabels = getWorkspaceShortcutLabels(platform)
} = {}) {
  const nonce = getNonce();
  const runTabShortcut = escapeHtml(`${workspaceShortcutLabels.run} / ${workspaceShortcutLabels.runAlias}`);
  const snippetTabShortcut = escapeHtml(`${workspaceShortcutLabels.snippets} / ${workspaceShortcutLabels.snippetsAlias}`);
  const tabSwitchLabel = escapeHtml(workspaceShortcutLabels.switch);
  // Inside text fields Shift+Arrow only switches at the caret edge (getTextFieldEdgeWorkspaceTarget).
  const tabTitleSuffix = '。文字の入力欄の中では、文字を選んでおらずカーソルが端にあるときに切り替わります';
  const tabSwitchHelp = 'Shift+←→でタブを切り替えます。文字の入力欄の中では、文字を選んでいないときに、'
    + 'カーソルが左端ならShift+←、右端ならShift+→で切り替わります。それ以外は文字の選択になります。'
    + '標準入力の欄ではEscでタブへ移動できます';
  const inputFocusMode = normalizeInputFocusShortcut(inputFocusShortcut && inputFocusShortcut.mode);
  const inputFocusLabel = String((inputFocusShortcut && inputFocusShortcut.label) || 'Alt+I');
  const escapedRunShortcutLabel = escapeHtml(runShortcutLabel);
  const isMacShortcut = runShortcutLabel.startsWith('Cmd');
  const modifierLabel = isMacShortcut ? 'Cmd' : 'Ctrl';
  const modifierAria = isMacShortcut ? 'Meta' : 'Control';
  const runShortcutAria = `${modifierAria}+Enter`;
  const resolvedErrorDisplayMode = normalizeErrorDisplayMode(errorDisplayMode);
  const escapedBrandName = escapeHtml(brandName);
  const initialPythonPathJson = scriptJson(savedPythonPath);
  const initialSnippetPreferencesJson = scriptJsonData(snippetPreferences);
  const snippetLibrary = renderSnippetLibrary(snippets);
  const snippetPreferenceLibrary = renderSnippetPreferences(
    preferenceSnippets,
    snippetPreferences,
    defaultSnippetOrder
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; img-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>${escapedBrandName}</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: dark;
      --piyoyo-bg: #090909;
      --piyoyo-surface: #141414;
      --piyoyo-raised: #1c1c1c;
      --piyoyo-text: #f7f7f5;
      --piyoyo-muted: #c5c5c5;
      --piyoyo-line: #333333;
      --piyoyo-yellow: #ffd84d;
      --piyoyo-orange: #ff9d45;
      --piyoyo-red: #ff6b6b;
      --piyoyo-action-red: #c43b32;
    }

    html,
    body {
      height: 100%;
    }

    body {
      /* Local theme adapter: never changes the user's workbench theme.
         Body scope takes precedence over VS Code's inherited theme variables. */
      --vscode-foreground: var(--piyoyo-text);
      --vscode-editor-foreground: var(--piyoyo-text);
      --vscode-editor-background: var(--piyoyo-bg);
      --vscode-sideBar-background: var(--piyoyo-bg);
      --vscode-editorWidget-background: var(--piyoyo-surface);
      --vscode-descriptionForeground: var(--piyoyo-muted);
      --vscode-panel-border: var(--piyoyo-line);
      --vscode-input-border: var(--piyoyo-line);
      --vscode-input-foreground: var(--piyoyo-text);
      --vscode-input-background: var(--piyoyo-bg);
      --vscode-focusBorder: var(--piyoyo-orange);
      --vscode-list-hoverBackground: var(--piyoyo-raised);
      --vscode-list-activeSelectionBackground: #261b10;
      --vscode-toolbar-hoverBackground: var(--piyoyo-raised);
      --vscode-errorForeground: var(--piyoyo-red);
      --vscode-disabledForeground: var(--piyoyo-muted);
      --vscode-charts-green: var(--piyoyo-yellow);
      --vscode-charts-yellow: var(--piyoyo-yellow);
      --vscode-charts-blue: var(--piyoyo-orange);
      --vscode-charts-purple: var(--piyoyo-text);
      --vscode-symbolIcon-fileForeground: var(--piyoyo-muted);
      --vscode-symbolIcon-keywordForeground: var(--piyoyo-orange);
      box-sizing: border-box;
      margin: 0;
      padding: 10px;
      overflow: hidden;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family, "Segoe UI", "Yu Gothic UI", sans-serif);
      --piyoyo-font-base: max(13px, var(--vscode-font-size, 13px));
      --piyoyo-font-small: max(12px, calc(var(--piyoyo-font-base) - 1px));
      font-size: var(--piyoyo-font-base);
      line-height: 1.5;
      --vscode-editor-font-family: "Cascadia Code", Consolas, monospace;
      --vscode-editor-font-size: 13px;
      scrollbar-color: var(--piyoyo-line) transparent;
    }

    .runner {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 8px;
      height: 100%;
      max-width: 720px;
    }

    .shortcutHintBar {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
      margin: 0 0 -4px;
      padding: 0 2px;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      line-height: 1.4;
    }

    .shortcutHintItem {
      white-space: nowrap;
    }

    .shortcutHintItem kbd {
      color: var(--piyoyo-text);
      font: inherit;
      font-weight: 600;
    }

    .workspaceHeader {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 4px;
      border-bottom: 1px solid var(--piyoyo-line);
    }

    .workspaceTabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .settingsButton {
      display: inline-grid;
      place-items: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border-color: transparent;
      color: var(--piyoyo-muted);
      background: transparent;
    }

    .settingsButton:hover {
      color: var(--piyoyo-text);
      background: var(--vscode-toolbar-hoverBackground);
    }

    .settingsButton svg {
      width: 16px;
      height: 16px;
    }

    .settingsLink {
      justify-self: start;
      padding: 0;
      border: 0;
      color: var(--piyoyo-orange);
      background: transparent;
      font-size: var(--piyoyo-font-small);
      text-decoration: underline;
    }

    .settingsLink:hover {
      color: var(--piyoyo-yellow);
      background: transparent;
    }

    .workspaceTab {
      min-width: 0;
      min-height: 38px;
      position: relative;
      border-color: transparent;
      color: var(--piyoyo-muted);
      background: transparent;
      font-size: 13px;
      font-weight: 600;
    }

    .workspaceTab:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .workspaceTab[aria-selected="true"] {
      color: var(--piyoyo-yellow);
      background: transparent;
    }

    .workspaceTab[aria-selected="true"]::after {
      content: '';
      position: absolute;
      inset: auto 8px -1px;
      height: 3px;
      border-radius: 3px 3px 0 0;
      background: var(--piyoyo-yellow);
    }

    .workspacePanel {
      display: grid;
      gap: 10px;
      min-height: 0;
      overflow-y: auto;
    }

    #runWorkspace {
      align-content: start;
      grid-auto-rows: max-content;
    }

    [hidden] {
      display: none !important;
    }

    .fileLabel {
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      letter-spacing: 0;
    }

    .ioLabel {
      color: var(--piyoyo-text);
      font-size: 16px;
      font-weight: 650;
    }

    .sectionIntro {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }

    .sectionIntroCopy {
      display: grid;
      gap: 2px;
    }

    .sectionIntro strong {
      font-size: 15px;
    }

    .sectionIntroCopy > span {
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      text-align: left;
    }

    .snippetPreferencesButton {
      min-height: 28px;
      padding: 4px 9px;
      border-color: var(--vscode-panel-border);
      color: var(--vscode-foreground);
      background: var(--vscode-toolbar-hoverBackground);
      font-size: var(--piyoyo-font-small);
      white-space: nowrap;
    }

    .snippetPreferencesButton[aria-pressed="true"] {
      color: var(--piyoyo-bg);
      background: var(--piyoyo-yellow);
    }

    .runSection {
      display: grid;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--piyoyo-line);
    }

    .runSectionHeader {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }

    .runSectionHeader h2 {
      margin: 0;
      color: var(--piyoyo-text);
      font-size: 14px;
      font-weight: 650;
    }

    .runSectionBody {
      display: grid;
      gap: 6px;
      padding: 0 2px 10px;
    }

    .summaryValue {
      min-width: 0;
      max-width: 65%;
      overflow: hidden;
      color: var(--vscode-foreground);
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    .detailGrid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
      gap: 8px 12px;
    }

    .detailItem {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: baseline;
      gap: 4px;
      min-width: 0;
    }

    .detailKey {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .detailValue {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      overflow-wrap: anywhere;
      font-size: 12px;
      font-weight: 600;
    }

    .toneState {
      color: var(--vscode-charts-green, #89d185);
    }

    .toneExit {
      color: var(--vscode-charts-yellow, #cca700);
    }

    .toneTime {
      color: var(--vscode-charts-blue, #3794ff);
    }

    .tonePython {
      color: var(--vscode-charts-purple, #b180d7);
    }

    .toneVersion {
      color: var(--piyoyo-orange);
    }

    .tonePath {
      color: var(--vscode-symbolIcon-fileForeground, var(--vscode-foreground));
    }

    .toneLauncher {
      color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-foreground));
    }

    .toneMuted {
      color: var(--vscode-descriptionForeground);
    }

    .toneError {
      color: var(--vscode-errorForeground);
    }

    button {
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-radius: 7px;
      padding: 8px 12px;
      font: inherit;
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      cursor: default;
      opacity: 0.65;
    }

    button:focus-visible,
    summary:focus-visible,
    select:focus-visible,
    input:focus-visible,
    textarea:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    .primaryRun {
      width: 100%;
      min-height: 28px;
      padding: 3px 12px;
      color: var(--piyoyo-text);
      background: var(--piyoyo-action-red);
      font-size: 13px;
      font-weight: 600;
    }

    .shortcutHint {
      margin-left: 6px;
      font-weight: 400;
      opacity: 0.75;
    }

    .snippetLibrary {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 6px;
      overflow: hidden;
    }

    .snippetBrowsePanel,
    .snippetPreferencesPanel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 6px;
      min-height: 0;
      overflow: hidden;
    }

    .snippetSearch {
      position: relative;
      display: block;
    }

    .snippetSearchIcon {
      position: absolute;
      top: 50%;
      left: 9px;
      width: 14px;
      height: 14px;
      color: var(--vscode-descriptionForeground);
      pointer-events: none;
      transform: translateY(-50%);
    }

    #snippetSearchInput {
      min-height: 30px;
      padding-left: 32px;
      font-size: var(--piyoyo-font-base);
    }

    .snippetCategoryList {
      display: grid;
      grid-auto-rows: max-content;
      align-content: start;
      gap: 0;
      min-height: 0;
      overflow-y: auto;
      overflow-anchor: none;
      padding-right: 2px;
      border-top: 1px solid var(--piyoyo-line);
      scrollbar-gutter: stable;
    }

    .snippetCategoryDropdown {
      overflow: hidden;
      border: 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      border-radius: 0;
      background: transparent;
    }

    .snippetCategoryDropdown > summary {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 30px;
      padding: 6px 8px;
      color: var(--vscode-foreground);
      font-size: var(--piyoyo-font-base);
      font-weight: 600;
      cursor: pointer;
      list-style: none;
    }

    .snippetCategoryDropdown > summary::-webkit-details-marker {
      display: none;
    }

    .snippetCategoryChevron {
      order: -1;
      width: 12px;
      height: 12px;
      flex: 0 0 12px;
      transition: transform 120ms ease;
    }

    .snippetCategoryDropdown[open] > summary .snippetCategoryChevron {
      transform: rotate(90deg);
    }

    .snippetCategoryDropdown[open] > summary {
      color: var(--piyoyo-orange);
    }

    .snippetCategoryDropdown > summary:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .snippetCategorySummaryLabel {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .snippetCategoryCount {
      margin-left: auto;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      font-weight: 400;
    }

    .snippetCategoryBody {
      display: grid;
      padding: 0 0 5px;
    }

    .snippetRows {
      display: grid;
      gap: 1px;
    }

    .snippetRow {
      --snippet-badge-width: calc(var(--piyoyo-font-small) + 8px);
      --snippet-complexity-width: calc(10ch + 10px);
      position: relative;
      min-width: 0;
      border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent);
    }

    /* Two-line card: badge cell | summary / code | complexity chip (sibling). */
    .snippetChoice {
      display: grid;
      grid-template-columns: var(--snippet-badge-width) minmax(0, 1fr) var(--snippet-complexity-width);
      grid-template-rows: auto auto;
      align-items: center;
      gap: 2px 6px;
      width: 100%;
      min-width: 0;
      min-height: 30px;
      padding: 4px 8px 4px 8px;
      border: 0;
      border-radius: 0;
      color: var(--vscode-foreground);
      background: transparent;
      text-align: left;
    }

    /* The list scrolls, so draw the focus ring inside the row to avoid clipping. */
    .snippetCategoryDropdown > summary:focus-visible,
    .snippetChoice:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -2px;
    }

    .snippetChoice:hover {
      background: #373000;
      box-shadow: inset 3px 0 var(--piyoyo-yellow);
    }

    .snippetRow.isSelected .snippetChoice {
      background: #3a230e;
      box-shadow: inset 3px 0 var(--piyoyo-orange);
    }

    .snippetParameter {
      color: var(--piyoyo-orange);
    }

    .snippetRow:first-child {
      border-top: 0;
    }

    .snippetRowSummary {
      grid-column: 2 / 4;
      grid-row: 1;
      min-width: 0;
      color: var(--piyoyo-text);
      font-size: var(--piyoyo-font-base);
      font-weight: 500;
      line-height: 1.4;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .snippetRowPreview {
      display: block;
      grid-column: 2;
      grid-row: 2;
      min-width: 0;
      overflow: hidden;
      color: var(--piyoyo-text);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--piyoyo-font-small);
      font-weight: 400;
      line-height: 1.5;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .snippetComplexity {
      position: absolute;
      right: 8px;
      bottom: 4px;
      box-sizing: border-box;
      width: var(--snippet-complexity-width);
      overflow: hidden;
      padding: 1px 4px;
      border: 1px solid #6c6c6c;
      border-radius: 3px;
      color: var(--piyoyo-text);
      background: var(--piyoyo-raised);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--piyoyo-font-small);
      line-height: 1.3;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    .snippetComplexity:hover,
    .snippetComplexity[aria-expanded="true"] {
      border-color: var(--piyoyo-yellow);
    }

    .snippetComplexity:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    .snippetComplexityPopover {
      position: fixed;
      z-index: 20;
      box-sizing: border-box;
      width: min(260px, calc(100vw - 16px));
      padding: 8px 10px;
      border: 1px solid var(--piyoyo-yellow);
      border-radius: 4px;
      color: var(--piyoyo-text);
      background: var(--piyoyo-raised);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      font-size: var(--piyoyo-font-small);
      line-height: 1.6;
    }

    .snippetComplexityPopover[hidden] {
      display: none;
    }

    .snippetComplexityPopoverTitle {
      display: block;
      font-family: var(--vscode-editor-font-family);
      font-weight: 700;
    }

    .snippetComplexityPopoverDetail {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
    }

    .snippetComplexityPopoverDetail:empty {
      display: none;
    }

    /* Always present so text and code start at the same x in every row. */
    .snippetBadgeCell {
      display: flex;
      flex-direction: column;
      gap: 2px;
      grid-column: 1;
      grid-row: 1 / span 2;
      align-self: stretch;
      min-height: calc(var(--piyoyo-font-small) * 2.6);
    }

    .snippetBadge {
      display: flex;
      flex: 1 1 0;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-height: 0;
      border: 1px solid transparent;
      font-size: var(--piyoyo-font-small);
      font-weight: 700;
      line-height: 1;
      writing-mode: vertical-rl;
      text-orientation: upright;
      white-space: nowrap;
      cursor: help;
    }

    /* Filled: code that Piyoyo adds itself. */
    .snippetBadge-helper {
      border-color: var(--vscode-charts-yellow);
      border-radius: 2px;
      color: var(--vscode-editor-background);
      background: var(--vscode-charts-yellow);
    }

    /* Solid outline: standard-library import. */
    .snippetBadge-import {
      border: 1px solid var(--piyoyo-orange);
      border-radius: 2px;
      color: var(--piyoyo-orange);
      background: transparent;
    }

    /* Dashed outline: third-party package. */
    .snippetBadge-external {
      border: 1px dashed var(--vscode-errorForeground);
      border-radius: 2px;
      color: var(--vscode-errorForeground);
      background: transparent;
    }

    .snippetBadgeLegend {
      grid-column: 1 / -1;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }

    .snippetBadgeLegend > summary {
      width: max-content;
      cursor: pointer;
    }

    .snippetBadgeLegendList {
      display: grid;
      gap: 6px;
      margin: 6px 0 2px;
      padding: 0;
      list-style: none;
    }

    .snippetBadgeLegendItem {
      display: grid;
      grid-template-columns: calc(var(--piyoyo-font-small) + 8px) minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      color: var(--vscode-foreground);
      line-height: 1.5;
    }

    .snippetBadgeLegendItem .snippetBadgeCell {
      height: calc(var(--piyoyo-font-small) * 2.6);
    }

    .snippetBadgeLegendItem .snippetBadge {
      cursor: default;
    }

    .snippetBadgeLegendNote {
      margin: 6px 0 2px;
      color: var(--vscode-foreground);
      line-height: 1.5;
    }

    .snippetNoResults {
      padding: 18px 8px;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      text-align: center;
    }

    .snippetPreferencesIntro {
      display: grid;
      gap: 3px;
      color: var(--vscode-foreground);
      font-size: var(--piyoyo-font-base);
      line-height: 1.6;
    }

    .snippetPreferencesIntro strong {
      color: var(--piyoyo-yellow);
      font-size: 14px;
    }

    .snippetPreferencesList {
      min-height: 0;
      overflow-y: auto;
      overflow-anchor: none;
      border-top: 1px solid var(--piyoyo-line);
      scrollbar-gutter: stable;
    }

    .snippetPreferenceCategory {
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .snippetPreferenceCategory > summary {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 6px 8px;
      color: var(--vscode-foreground);
      font-size: var(--piyoyo-font-base);
      font-weight: 650;
      cursor: pointer;
      list-style: none;
    }

    .snippetPreferenceCategory > summary::-webkit-details-marker {
      display: none;
    }

    .snippetPreferenceCategory > summary::before {
      content: '›';
      color: var(--piyoyo-orange);
      font-size: 18px;
      line-height: 1;
      transform: rotate(0deg);
      transition: transform 120ms ease;
    }

    .snippetPreferenceCategory[open] > summary::before {
      transform: rotate(90deg);
    }

    .snippetPreferenceCategoryCount {
      margin-left: auto;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      font-weight: 400;
    }

    .snippetPreferenceRows {
      display: grid;
    }

    .snippetPreferenceRow {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 9px;
      min-width: 0;
      min-height: 48px;
      padding: 6px 8px;
      border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent);
      background: transparent;
    }

    .snippetPreferenceRow.isPreferenceHidden {
      opacity: 0.58;
    }

    .snippetPreferenceToggle {
      display: grid;
      justify-items: center;
      gap: 2px;
      min-width: 46px;
      cursor: pointer;
    }

    .snippetPreferenceToggle input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .snippetPreferenceSwitch {
      position: relative;
      width: 34px;
      height: 18px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 999px;
      background: var(--piyoyo-raised);
      transition: background 120ms ease, border-color 120ms ease;
    }

    .snippetPreferenceSwitch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--piyoyo-muted);
      transition: transform 120ms ease, background 120ms ease;
    }

    .snippetPreferenceToggle input:checked + .snippetPreferenceSwitch {
      border-color: var(--vscode-button-background, #0e639c);
      background: var(--vscode-button-background, #0e639c);
    }

    .snippetPreferenceToggle input:checked + .snippetPreferenceSwitch::after {
      background: var(--vscode-button-foreground, #ffffff);
      transform: translateX(16px);
    }

    .snippetPreferenceToggle input:focus-visible + .snippetPreferenceSwitch {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .snippetPreferenceToggleText {
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }

    .snippetPreferenceCopy {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .snippetPreferenceSummary,
    .snippetPreferencePreview {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .snippetPreferenceSummary {
      color: var(--vscode-foreground);
      font-size: var(--piyoyo-font-base);
      font-weight: 550;
    }

    .snippetPreferencePreview {
      color: var(--piyoyo-orange);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--piyoyo-font-small);
    }

    .snippetPreferenceMoves {
      display: grid;
      grid-template-columns: 28px 28px;
      gap: 4px;
    }

    .snippetPreferenceMove {
      min-width: 0;
      min-height: 28px;
      padding: 2px;
      border-color: var(--vscode-panel-border);
      color: var(--vscode-foreground);
      background: var(--piyoyo-raised);
      font-size: 14px;
    }

    .snippetPreferencesActions {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid var(--piyoyo-line);
    }

    .snippetPreferencesReset {
      min-height: 34px;
      padding: 5px 10px;
      border-color: var(--vscode-panel-border);
      color: var(--vscode-foreground);
      background: var(--piyoyo-raised);
      font-size: var(--piyoyo-font-small);
    }

    .snippetPreferencesSave {
      min-height: 36px;
      color: var(--vscode-button-foreground, #ffffff);
      background: var(--vscode-button-background, #0e639c);
      font-size: var(--piyoyo-font-base);
      font-weight: 650;
    }

    .snippetPreferencesSave:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }

    .snippetPreferencesHint {
      grid-column: 1 / -1;
      min-height: 1.4em;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }

    .snippetPreferencesHint.error {
      color: var(--vscode-errorForeground);
    }

    .snippetInsertFooter {
      box-sizing: border-box;
      z-index: 2;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 5px;
      min-width: 0;
      min-height: 0;
      /* Grow with the explanation, but leave a usable slice of the catalogue. */
      max-height: min(45vh, max(30vh, 100vh - 300px));
      overflow-y: auto;
      padding: 0 9px 7px;
      border: 1px solid var(--piyoyo-line);
      border-radius: 5px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    }

    .snippetInsertSelection {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    #snippetSelectedSummary {
      min-width: 0;
      overflow: hidden;
      color: var(--vscode-foreground);
      font-size: var(--piyoyo-font-base);
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow-wrap: anywhere;
    }

    .snippetVariantField {
      display: grid;
      gap: 4px;
    }

    .snippetVariantField[hidden] {
      display: none;
    }

    .snippetVariantOptions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
      gap: 1px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-panel-border);
    }

    .snippetVariantButton {
      min-width: 0;
      border: 0;
      border-radius: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-input-background);
      padding: 7px;
      font-size: 12px;
    }

    .snippetVariantButton[aria-pressed="true"] {
      color: var(--piyoyo-orange);
      background: #261b10;
      box-shadow: inset 0 0 0 1px var(--piyoyo-orange);
    }

    .snippetVariantButton:hover {
      background: var(--piyoyo-raised);
    }

    .snippetSelectedHelp {
      color: var(--piyoyo-text);
      font-size: var(--piyoyo-font-small);
      line-height: 1.4;
    }

    .snippetWarning {
      color: var(--piyoyo-red);
      font-size: 12px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .snippetImportHint {
      color: var(--piyoyo-text);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .snippetDetails {
      border-top: 1px solid var(--vscode-panel-border);
    }

    .snippetDetails > summary {
      padding: 8px 0 2px;
      color: var(--piyoyo-text);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .snippetDetailsText {
      padding: 10px 0 4px;
      color: var(--piyoyo-text);
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }

    .snippetInsertActions {
      position: sticky;
      top: 0;
      z-index: 1;
      display: grid;
      gap: 3px;
      margin: 0 -9px;
      padding: 7px 9px 2px;
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    }

    .snippetInsertButton {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 30px;
      padding: 6px 10px;
      font-size: var(--piyoyo-font-base);
      font-weight: 600;
      color: var(--vscode-button-foreground, #ffffff);
      background: var(--vscode-button-background, #0e639c);
    }

    .snippetInsertKey {
      padding: 0 5px;
      border: 1px solid currentColor;
      border-radius: 3px;
      font: inherit;
      font-size: var(--piyoyo-font-small);
      font-weight: 600;
      line-height: 1.4;
      opacity: 0.85;
    }

    .primaryRun:hover {
      background: #b6352d;
    }

    .snippetInsertButton:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }

    @media (max-width: 420px) {
      .snippetChoice {
        column-gap: 5px;
      }

      .snippetPreferenceRow {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .snippetPreferenceToggle {
        grid-row: 1 / span 2;
      }

      .snippetPreferenceMoves {
        grid-column: 2;
      }

      .snippetPreferencesActions {
        grid-template-columns: 1fr;
      }
    }

    .snippetStatus {
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      overflow-wrap: anywhere;
    }

    .snippetStatus:empty {
      display: none;
    }

    .snippetStatus.error {
      color: var(--vscode-errorForeground);
    }

    select,
    input {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 6px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      padding: 5px 8px;
      font: inherit;
      text-transform: none;
    }

    option:disabled {
      color: var(--vscode-disabledForeground);
    }

    input:disabled {
      display: none;
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      font-weight: 600;
      letter-spacing: 0;
    }

    textarea,
    pre {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
      text-transform: none;
    }

    textarea {
      min-height: 112px;
      resize: vertical;
      padding: 8px;
    }

    .outputSection,
    .outputField {
      display: grid;
      gap: 6px;
    }

    pre {
      min-height: 96px;
      max-height: 320px;
      margin: 0;
      overflow: auto;
      padding: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    pre:empty::before {
      color: var(--vscode-descriptionForeground);
      content: attr(data-placeholder);
    }

    .stdinBox {
      color: var(--piyoyo-bg);
      background: var(--piyoyo-text);
      border-color: var(--piyoyo-text);
      caret-color: var(--piyoyo-bg);
    }

    .stdinBox::placeholder {
      color: #505050;
      opacity: 1;
    }

    .outputBox {
      color: var(--vscode-editor-foreground);
    }

    .stdoutBox {
      color: var(--piyoyo-bg);
      background: var(--piyoyo-yellow);
      border-color: var(--piyoyo-yellow);
    }

    .stdoutBox:empty::before {
      color: #514516;
    }

    .stderrBox {
      color: var(--piyoyo-red);
      background: #251112;
      border-color: #994547;
    }

    .errorDetails {
      display: grid;
      gap: 6px;
    }

    .errorDetails > summary {
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      cursor: pointer;
    }

    @media (max-height: 560px) {
      body { padding: 10px; }
      .runner { gap: 8px; }
      .snippetInsertSelection { gap: 6px; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; }
    }

    @media (forced-colors: active) {
      .workspaceTab[aria-selected="true"],
      .snippetRow.isSelected .snippetChoice,
      .snippetVariantButton[aria-pressed="true"] {
        outline: 2px solid Highlight;
        outline-offset: -2px;
      }

      .snippetBadge {
        border-color: CanvasText;
        color: CanvasText;
        background: Canvas;
        forced-color-adjust: none;
      }

      /* Keep the filled look so 自作 stays distinct from the 輸入 outline. */
      .snippetBadge-helper {
        color: Canvas;
        background: CanvasText;
      }
    }

  </style>
</head>
<body>
  <main class="runner">
    <div class="shortcutHintBar" aria-label="主なショートカット">
      <span class="shortcutHintItem"><kbd id="inputFocusHintKey">${escapeHtml(inputFocusLabel)}</kbd>: エディタ⇄パネル</span>
      <span class="shortcutHintItem" title="${tabSwitchHelp}"><kbd>${tabSwitchLabel}</kbd>: タブ切替</span>
      <span class="shortcutHintItem"><kbd>${escapedRunShortcutLabel}</kbd>: 保存して実行</span>
    </div>
    <div class="workspaceHeader">
      <nav class="workspaceTabs" role="tablist" aria-label="Piyoyoの機能">
        <button id="runWorkspaceTab" class="workspaceTab" type="button" role="tab" aria-selected="true" aria-controls="runWorkspace" tabindex="0" data-workspace="run" title="実行 (${runTabShortcut})${tabTitleSuffix}" aria-keyshortcuts="Shift+ArrowLeft Alt+1">実行</button>
        <button id="snippetWorkspaceTab" class="workspaceTab" type="button" role="tab" aria-selected="false" aria-controls="snippetWorkspace" tabindex="-1" data-workspace="snippets" title="コード挿入 (${snippetTabShortcut})${tabTitleSuffix}" aria-keyshortcuts="Shift+ArrowRight Alt+2">コード挿入</button>
      </nav>
      <button id="openSettingsButton" class="settingsButton" type="button" data-open-settings aria-label="Piyoyoの設定を開く" title="Piyoyoの設定を開く"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
    </div>

    <section id="runWorkspace" class="workspacePanel" role="tabpanel" aria-labelledby="runWorkspaceTab" data-workspace-panel="run">
      <button id="runButton" class="primaryRun" type="button" title="実行 (${escapedRunShortcutLabel} で保存して実行)" aria-keyshortcuts="${runShortcutAria}">実行<span class="shortcutHint">(${escapedRunShortcutLabel})</span></button>

      <label class="ioLabel">
        標準入力
        <textarea id="stdin" class="stdinBox" spellcheck="false" placeholder="${escapeHtml(getStdinPlaceholder(inputFocusLabel))}" title="${escapeHtml(getStdinTitle(inputFocusLabel))}"></textarea>
      </label>

      <section class="outputSection" aria-label="実行結果">
        <span class="ioLabel">標準出力</span>
        <pre id="stdout" class="outputBox stdoutBox" data-placeholder="実行結果がここに表示されます"></pre>
        ${renderErrorField(resolvedErrorDisplayMode)}
      </section>

      <section id="runDetails" class="runDetails runSection" aria-labelledby="runDetailsHeading">
        <div class="runSectionHeader">
          <h2 id="runDetailsHeading">実行詳細</h2>
          <span id="status" class="summaryValue toneState" role="status">待機</span>
        </div>
        <div class="runSectionBody">
          <div class="detailGrid">
            <div class="detailItem">
              <span class="detailKey">終了</span>
              <span id="exitCode" class="detailValue toneExit"></span>
            </div>
            <div class="detailItem">
              <span class="detailKey">時間</span>
              <span id="elapsed" class="detailValue toneTime"></span>
            </div>
            <div class="detailItem">
              <span class="detailKey">実装</span>
              <span id="runtimeImplementation" class="detailValue tonePython">未実行</span>
            </div>
            <div class="detailItem">
              <span class="detailKey">版</span>
              <span id="runtimeVersion" class="detailValue toneVersion"></span>
            </div>
            <div class="detailItem">
              <span class="detailKey">exe</span>
              <span id="runtimeExecutable" class="detailValue tonePath"></span>
            </div>
            <div class="detailItem">
              <span class="detailKey">起動</span>
              <span id="runtimeLauncher" class="detailValue toneLauncher"></span>
            </div>
          </div>
        </div>
      </section>

      <section class="launcher runSection" aria-labelledby="launcherHeading">
        <div class="runSectionHeader">
          <h2 id="launcherHeading">実行環境</h2>
          <span id="launcherSummary" class="summaryValue">設定値</span>
        </div>
        <div class="runSectionBody">
          <select id="pythonLauncherSelect" aria-label="Python実行環境" title="この実行だけに使う Python 起動設定">
            <option value="">設定値を使う</option>
            <option value="python">python</option>
            <option value="py">py</option>
            <option value="python3">python3</option>
            <option value="pypy">pypy</option>
            <option value="pypy3">pypy3</option>
            <option value="__custom__">カスタム...</option>
          </select>
          <input id="customPythonPath" type="text" aria-label="カスタムPythonパス" placeholder="例: C:\\Python\\python.exe" disabled>
          <span class="fileLabel" id="launcherProbeStatus">起動時に Python 候補を判定中...</span>
          <button type="button" class="settingsLink" data-open-settings title="Piyoyoの設定を開く">「設定値」と制限時間を設定で変える</button>
        </div>
      </section>
    </section>

    <section id="snippetWorkspace" class="workspacePanel snippetLibrary" role="tabpanel" aria-labelledby="snippetWorkspaceTab" data-workspace-panel="snippets" hidden>
      <div class="sectionIntro">
        <div class="sectionIntroCopy">
          <strong>操作を探す</strong>
        </div>
        <button id="snippetPreferencesButton" class="snippetPreferencesButton" type="button" aria-pressed="false" title="コードごとの表示と順番を整理する">コード整理</button>${snippetLibrary.legend}
      </div>
      <div id="snippetBrowsePanel" class="snippetBrowsePanel">
        <label class="snippetSearch">
          <svg class="snippetSearchIcon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input id="snippetSearchInput" type="search" placeholder="操作を検索 (/)" title="/ または ${modifierLabel}+F で検索欄へ移動、↓ で一覧へ" autocomplete="off" spellcheck="false" aria-label="操作を検索" aria-keyshortcuts="/ ${modifierAria}+F">
        </label>
        <div class="snippetCategoryList" aria-label="入力コードのジャンル">
          ${snippetLibrary.panels}
          <div id="snippetNoResults" class="snippetNoResults"${snippetLibrary.categoryCount > 0 ? ' hidden' : ''}>表示するコードがありません。「コード整理」から表示できます。</div>
        </div>
        <div class="snippetInsertFooter">
          <div class="snippetInsertActions">
            <button id="snippetInsertButton" class="snippetInsertButton" type="button" aria-label="コードを挿入 (Enter)" disabled><span>コードを挿入</span><kbd class="snippetInsertKey" aria-hidden="true">Enter</kbd></button>
            <span id="snippetStatus" class="snippetStatus" aria-live="polite"></span>
          </div>
          <div id="snippetInsertSelection" class="snippetInsertSelection" aria-live="polite">
            <span id="snippetSelectedSummary">スニペットを選択してください</span>
            <div id="snippetVariantField" class="snippetVariantField" hidden>
              <div id="snippetVariantOptions" class="snippetVariantOptions" role="group" aria-label="形式を選ぶ"></div>
            </div>
            <span id="snippetSelectedHelp" class="snippetSelectedHelp">${escapeHtml(EMPTY_SELECTION_HELP)}</span>
            <span id="snippetWarning" class="snippetWarning" hidden></span>
            <span id="snippetImportHint" class="snippetImportHint" hidden></span>
            <details id="snippetDetails" class="snippetDetails" hidden>
              <summary>詳細</summary>
              <div id="snippetDetailsText" class="snippetDetailsText"></div>
            </details>
          </div>
        </div>
        <div id="snippetComplexityPopover" class="snippetComplexityPopover" role="dialog" aria-label="計算量の説明" hidden>
          <span id="snippetComplexityPopoverTitle" class="snippetComplexityPopoverTitle"></span>
          <p id="snippetComplexityPopoverDetail" class="snippetComplexityPopoverDetail"></p>
        </div>
      </div>
      <div id="snippetPreferencesPanel" class="snippetPreferencesPanel" hidden>
        <div class="snippetPreferencesIntro">
          <strong>表示するコードと順番</strong>
          <span>スイッチで表示を切り替え、矢印で同じジャンル内の順番を動かせます。</span>
          <label class="snippetSearch">
            <svg class="snippetSearchIcon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m10.5 10.5 3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input id="snippetPreferencesSearchInput" type="search" placeholder="整理するコードを検索" autocomplete="off" spellcheck="false" aria-label="整理するコードを検索">
          </label>
        </div>
        <div id="snippetPreferencesList" class="snippetPreferencesList" aria-label="コードごとの表示と順番">
          ${snippetPreferenceLibrary.categoryPanels}
          <div id="snippetPreferencesNoResults" class="snippetNoResults" hidden>一致するコードがありません</div>
        </div>
        <div class="snippetPreferencesActions">
          <button id="snippetPreferencesResetButton" class="snippetPreferencesReset" type="button">初期状態に戻す</button>
          <button id="snippetPreferencesSaveButton" class="snippetPreferencesSave" type="button">保存して戻る</button>
          <span id="snippetPreferencesHint" class="snippetPreferencesHint" aria-live="polite"></span>
        </div>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const viewState = vscode.getState() || {};
    const initialPythonPath = ${initialPythonPathJson};
    const initialSnippetPreferences = ${initialSnippetPreferencesJson};
    const runButton = document.getElementById('runButton');
    const stdin = document.getElementById('stdin');
    const status = document.getElementById('status');
    const exitCode = document.getElementById('exitCode');
    const elapsed = document.getElementById('elapsed');
    const stdout = document.getElementById('stdout');
    const stderr = document.getElementById('stderr');
    const errorExplanation = document.getElementById('errorExplanation');
    const stderrField = document.getElementById('stderrField');
    const errorDisplayMode = stderrField.dataset.errorDisplayMode;
    const originalErrorDetails = document.getElementById('originalErrorDetails');
    const originalErrorContainer = originalErrorDetails || document.getElementById('originalErrorSection');
    const errorExplanationDetails = document.getElementById('errorExplanationDetails');
    ${getErrorPresentation.toString()}
    ${isImeComposing.toString()}
    ${isRunShortcut.toString()}
    ${isSearchShortcut.toString()}
    ${isEditableTarget.toString()}
    ${getNextIndex.toString()}
    ${getDisclosureArrowAction.toString()}
    ${isInputFocusShortcut.toString()}
    ${getWorkspaceShortcutTarget.toString()}
    ${getTextFieldEdgeWorkspaceTarget.toString()}
    ${isTextEntryTarget.toString()}
    ${createShiftDoubleTapDetector.toString()}
    ${getStdinPlaceholder.toString()}
    ${getStdinTitle.toString()}
    let inputFocusMode = ${scriptJson(inputFocusMode)};
    const inputFocusHintKey = document.getElementById('inputFocusHintKey');
    const shiftDoubleTap = createShiftDoubleTapDetector(${SHIFT_DOUBLE_TAP_INTERVAL_MS});
    const emptySelectionHelp = ${scriptJson(EMPTY_SELECTION_HELP)};
    const runtimeImplementation = document.getElementById('runtimeImplementation');
    const runtimeVersion = document.getElementById('runtimeVersion');
    const runtimeExecutable = document.getElementById('runtimeExecutable');
    const runtimeLauncher = document.getElementById('runtimeLauncher');
    const pythonLauncherSelect = document.getElementById('pythonLauncherSelect');
    const customPythonPath = document.getElementById('customPythonPath');
    const launcherProbeStatus = document.getElementById('launcherProbeStatus');
    const launcherSummary = document.getElementById('launcherSummary');
    const snippetStatus = document.getElementById('snippetStatus');
    const snippetRows = document.querySelectorAll('[data-snippet-row]');
    const snippetEntries = document.querySelectorAll('[data-snippet-entry]');
    const snippetSearchInput = document.getElementById('snippetSearchInput');
    const snippetNoResults = document.getElementById('snippetNoResults');
    const snippetCategoryList = document.querySelector('.snippetCategoryList');
    const snippetCategorySummaries = document.querySelectorAll('[data-snippet-category-panel] > summary');
    const snippetBrowsePanel = document.getElementById('snippetBrowsePanel');
    const snippetPreferencesButton = document.getElementById('snippetPreferencesButton');
    const snippetPreferencesPanel = document.getElementById('snippetPreferencesPanel');
    const snippetPreferencesSearchInput = document.getElementById('snippetPreferencesSearchInput');
    const snippetPreferencesList = document.getElementById('snippetPreferencesList');
    const snippetPreferenceRows = document.querySelectorAll('[data-snippet-preference-row]');
    const snippetPreferenceCategoryPanels = document.querySelectorAll('[data-snippet-preference-category-panel]');
    const snippetPreferencesNoResults = document.getElementById('snippetPreferencesNoResults');
    const snippetPreferencesResetButton = document.getElementById('snippetPreferencesResetButton');
    const snippetPreferencesSaveButton = document.getElementById('snippetPreferencesSaveButton');
    const snippetPreferencesHint = document.getElementById('snippetPreferencesHint');
    const snippetInsertButton = document.getElementById('snippetInsertButton');
    const snippetSelectedSummary = document.getElementById('snippetSelectedSummary');
    const snippetSelectedHelp = document.getElementById('snippetSelectedHelp');
    const snippetWarning = document.getElementById('snippetWarning');
    const snippetImportHint = document.getElementById('snippetImportHint');
    const snippetDetails = document.getElementById('snippetDetails');
    const snippetDetailsText = document.getElementById('snippetDetailsText');
    const snippetVariantField = document.getElementById('snippetVariantField');
    const snippetVariantOptions = document.getElementById('snippetVariantOptions');
    const snippetComplexityChips = document.querySelectorAll('[data-snippet-complexity]');
    const snippetComplexityPopover = document.getElementById('snippetComplexityPopover');
    const snippetComplexityPopoverTitle = document.getElementById('snippetComplexityPopoverTitle');
    const snippetComplexityPopoverDetail = document.getElementById('snippetComplexityPopoverDetail');
    let openComplexityChip = null;
    let selectedSnippetControl = null;
    let snippetInsertionPending = false;
    let snippetPreferencesOpen = false;
    const workspaceTabs = document.querySelectorAll('[data-workspace]');
    const workspacePanels = document.querySelectorAll('[data-workspace-panel]');
    const snippetCategoryPanels = document.querySelectorAll('[data-snippet-category-panel]');
    let pendingSnippetCategoryScrollTop = null;

    function saveViewState(values) {
      Object.assign(viewState, values);
      vscode.setState(viewState);
    }

    const lastFocusedInWorkspace = {};
    workspacePanels.forEach((panel) => {
      panel.addEventListener('focusin', (event) => {
        lastFocusedInWorkspace[panel.dataset.workspacePanel] = event.target;
      });
    });

    function canRestoreFocus(element) {
      return Boolean(element && element.isConnected && !element.disabled
        && element.getClientRects().length > 0);
    }

    function getDefaultWorkspaceFocusTarget(workspace) {
      if (workspace === 'snippets') {
        return snippetPreferencesOpen ? snippetPreferencesSearchInput : snippetSearchInput;
      }
      return stdin;
    }

    // avoidTextEntry falls back to the workspace's tab instead of a text field.
    function getWorkspaceFocusTarget(workspace, { avoidTextEntry = false } = {}) {
      const remembered = lastFocusedInWorkspace[workspace];
      const target = canRestoreFocus(remembered) ? remembered : getDefaultWorkspaceFocusTarget(workspace);
      if (avoidTextEntry && isTextEntryTarget(target)) {
        return Array.from(workspaceTabs).find((tab) => tab.dataset.workspace === workspace) || target;
      }
      return target;
    }

    // focusPanel moves focus into the shown panel. Otherwise focus only moves when it
    // would be lost inside the panel being hidden.
    function setWorkspace(workspace, { focusPanel = false, avoidTextEntry = false } = {}) {
      closeComplexityPopover();
      const activeElement = document.activeElement;
      // An unfocused webview still reports its last activeElement; never steal focus then.
      const focusWillBeHidden = document.hasFocus() && Array.from(workspacePanels).some(
        (panel) => panel.dataset.workspacePanel !== workspace && panel.contains(activeElement)
      );
      workspaceTabs.forEach((tab) => {
        const isSelected = tab.dataset.workspace === workspace;
        tab.setAttribute('aria-selected', String(isSelected));
        tab.tabIndex = isSelected ? 0 : -1;
      });
      workspacePanels.forEach((panel) => {
        panel.hidden = panel.dataset.workspacePanel !== workspace;
      });
      saveViewState({ workspace });
      if (focusPanel || focusWillBeHidden) {
        getWorkspaceFocusTarget(workspace, { avoidTextEntry }).focus();
      }
    }

    function setSnippetCategory(snippetCategory) {
      const hasCategory = Array.from(snippetCategoryPanels).some(
        (panel) => panel.dataset.snippetCategoryPanel === snippetCategory
      );
      const selectedCategory = hasCategory
        ? snippetCategory
        : snippetCategoryPanels[0]?.dataset.snippetCategoryPanel || '';
      snippetCategoryPanels.forEach((panel) => {
        panel.hidden = false;
        panel.open = panel.dataset.snippetCategoryPanel === selectedCategory;
      });
      saveViewState({ snippetCategory: selectedCategory });
    }

    function rememberSnippetCategoryScrollPosition() {
      if (!snippetSearchInput.value.trim()) {
        pendingSnippetCategoryScrollTop = snippetCategoryList.scrollTop;
      }
    }

    function restoreSnippetCategoryScrollPosition(scrollTop) {
      const restore = () => {
        snippetCategoryList.scrollTop = scrollTop;
      };
      restore();
      requestAnimationFrame(restore);
    }

    function getSnippetPreferenceOrder() {
      return Array.from(
        snippetPreferencesList.querySelectorAll('[data-snippet-preference-row]')
      ).map((row) => row.dataset.snippetPreferenceRow);
    }

    function updateSnippetPreferenceRow(row) {
      const checkbox = row.querySelector('[data-snippet-preference-visible]');
      const isVisible = Boolean(checkbox?.checked);
      row.classList.toggle('isPreferenceHidden', !isVisible);
      const label = row.querySelector('.snippetPreferenceToggleText');
      if (label) {
        label.textContent = isVisible ? '表示' : '非表示';
      }
    }

    function updateSnippetPreferenceControls() {
      const hasQuery = Boolean(snippetPreferencesSearchInput.value.trim());
      snippetPreferenceCategoryPanels.forEach((panel) => {
        const rows = Array.from(panel.querySelectorAll('[data-snippet-preference-row]'));
        const visibleCount = rows.filter(
          (row) => row.querySelector('[data-snippet-preference-visible]')?.checked
        ).length;
        const count = panel.querySelector('[data-snippet-preference-category-count]');
        if (count) {
          count.textContent = visibleCount + '/' + rows.length + '表示';
        }
        rows.forEach((row, index) => {
          const up = row.querySelector('[data-snippet-move="up"]');
          const down = row.querySelector('[data-snippet-move="down"]');
          if (up) {
            up.disabled = hasQuery || index === 0;
          }
          if (down) {
            down.disabled = hasQuery || index === rows.length - 1;
          }
        });
      });
      snippetPreferencesHint.textContent = hasQuery
        ? '検索中は順番を変更できません。検索を消すと矢印を使えます。'
        : '';
    }

    function restoreSnippetPreferenceDraft({
      hiddenSnippetIds = initialSnippetPreferences.hiddenSnippetIds || [],
      order = initialSnippetPreferences.order || []
    } = {}) {
      const hiddenIds = new Set(hiddenSnippetIds);
      const orderIndex = new Map(order.map((snippetId, index) => [snippetId, index]));
      snippetPreferenceCategoryPanels.forEach((panel) => {
        const rowsContainer = panel.querySelector('.snippetPreferenceRows');
        const rows = Array.from(rowsContainer.querySelectorAll('[data-snippet-preference-row]'));
        rows.sort((left, right) => {
          const leftIndex = orderIndex.get(left.dataset.snippetPreferenceRow) ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = orderIndex.get(right.dataset.snippetPreferenceRow) ?? Number.MAX_SAFE_INTEGER;
          return leftIndex - rightIndex;
        });
        rows.forEach((row) => {
          rowsContainer.append(row);
          const checkbox = row.querySelector('[data-snippet-preference-visible]');
          checkbox.checked = !hiddenIds.has(row.dataset.snippetPreferenceRow);
          updateSnippetPreferenceRow(row);
        });
      });
      snippetPreferencesSearchInput.value = '';
      filterSnippetPreferenceRows();
    }

    function filterSnippetPreferenceRows() {
      const query = snippetPreferencesSearchInput.value.trim().toLocaleLowerCase('ja');
      let totalMatches = 0;
      snippetPreferenceCategoryPanels.forEach((panel) => {
        let categoryMatches = 0;
        panel.querySelectorAll('[data-snippet-preference-row]').forEach((row) => {
          const searchText = (row.dataset.snippetPreferenceSearch || '').toLocaleLowerCase('ja');
          const isMatch = !query || searchText.includes(query);
          row.hidden = !isMatch;
          if (isMatch) {
            categoryMatches += 1;
          }
        });
        panel.hidden = Boolean(query) && categoryMatches === 0;
        if (query) {
          panel.open = categoryMatches > 0;
        }
        totalMatches += categoryMatches;
      });
      snippetPreferencesNoResults.hidden = totalMatches > 0;
      updateSnippetPreferenceControls();
    }

    function setSnippetPreferencesOpen(open) {
      closeComplexityPopover();
      snippetPreferencesOpen = Boolean(open);
      snippetBrowsePanel.hidden = snippetPreferencesOpen;
      snippetPreferencesPanel.hidden = !snippetPreferencesOpen;
      snippetPreferencesButton.setAttribute('aria-pressed', String(snippetPreferencesOpen));
      snippetPreferencesButton.textContent = snippetPreferencesOpen ? '戻る' : 'コード整理';
      if (snippetPreferencesOpen) {
        snippetPreferencesSaveButton.disabled = false;
        snippetPreferencesHint.className = 'snippetPreferencesHint';
        restoreSnippetPreferenceDraft();
        snippetPreferencesSearchInput.focus();
      }
    }

    function resetSnippetPreferencesToDefault() {
      snippetPreferenceCategoryPanels.forEach((panel) => {
        const rowsContainer = panel.querySelector('.snippetPreferenceRows');
        const rows = Array.from(rowsContainer.querySelectorAll('[data-snippet-preference-row]'));
        rows.sort((left, right) => Number(left.dataset.defaultIndex) - Number(right.dataset.defaultIndex));
        rows.forEach((row) => {
          rowsContainer.append(row);
          const checkbox = row.querySelector('[data-snippet-preference-visible]');
          checkbox.checked = true;
          updateSnippetPreferenceRow(row);
        });
      });
      snippetPreferencesSearchInput.value = '';
      filterSnippetPreferenceRows();
      snippetPreferencesHint.textContent = '全コードを表示し、初期順へ戻しました。保存すると反映されます。';
    }

    function saveSnippetPreferenceDraft() {
      const hiddenSnippetIds = Array.from(snippetPreferenceRows)
        .filter((row) => !row.querySelector('[data-snippet-preference-visible]')?.checked)
        .map((row) => row.dataset.snippetPreferenceRow);
      snippetPreferencesSaveButton.disabled = true;
      snippetPreferencesHint.textContent = '保存中...';
      vscode.postMessage({
        type: 'saveSnippetPreferences',
        hiddenSnippetIds,
        order: getSnippetPreferenceOrder()
      });
    }

    function readSnippetVariants(control) {
      try {
        const variants = JSON.parse(control?.dataset?.snippetVariants || '[]');
        return Array.isArray(variants) ? variants : [];
      } catch (error) {
        return [];
      }
    }

    function getSnippetSource(control) {
      if (!control) {
        return null;
      }

      const variants = readSnippetVariants(control);
      if (variants.length > 0) {
        const selectedId = control.dataset.selectedSnippetId || variants[0].id;
        const selectedVariant = variants.find((variant) => variant.id === selectedId)
          || variants[0];
        return {
          value: selectedVariant.id,
          textContent: selectedVariant.choiceLabel,
          dataset: {
            snippetId: selectedVariant.id,
            snippetLabel: selectedVariant.label,
            snippetDescription: selectedVariant.description,
            snippetTooltip: selectedVariant.tooltip,
            snippetPlaceholders: selectedVariant.placeholders,
            snippetCodeParts: selectedVariant.codeParts,
            snippetPreviewParts: JSON.stringify(selectedVariant.previewParts || []),
            snippetPrecondition: selectedVariant.precondition,
            snippetImports: JSON.stringify(selectedVariant.imports || []),
            snippetHelpers: JSON.stringify(selectedVariant.helpers || []),
            snippetBadges: selectedVariant.badges || [],
            snippetChoiceLabel: selectedVariant.choiceLabel,
            snippetComplexity: selectedVariant.complexity
          }
        };
      }

      return control;
    }

    function getSnippetId(source) {
      return source?.value || source?.dataset?.snippetId || '';
    }

    function renderSnippetVariants(control, source) {
      const variants = readSnippetVariants(control);
      snippetVariantOptions.replaceChildren();
      snippetVariantField.hidden = variants.length < 2;
      if (variants.length < 2) {
        return;
      }

      const selectedId = getSnippetId(source);
      variants.forEach((variant) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'snippetVariantButton';
        button.textContent = variant.choiceLabel;
        button.setAttribute('aria-pressed', String(variant.id === selectedId));
        button.addEventListener('click', () => {
          control.dataset.selectedSnippetId = variant.id;
          selectSnippet(control);
          // Re-render replaces the button. Keep keyboard focus on its replacement.
          const selectedButton = snippetVariantOptions.querySelector('[aria-pressed="true"]');
          selectedButton?.focus();
        });
        snippetVariantOptions.append(button);
      });
    }

    function updateSnippetInsertFooter() {
      const row = selectedSnippetControl?.closest('[data-snippet-row]');
      const source = getSnippetSource(selectedSnippetControl);
      if (!row || !source || !getSnippetId(source)) {
        snippetSelectedSummary.textContent = 'スニペットを選択してください';
        snippetSelectedSummary.title = '';
        snippetSelectedHelp.textContent = emptySelectionHelp;
        snippetWarning.hidden = true;
        snippetWarning.textContent = '';
        snippetImportHint.hidden = true;
        snippetImportHint.textContent = '';
        snippetDetails.hidden = true;
        snippetDetails.open = false;
        snippetDetailsText.textContent = '';
        snippetVariantField.hidden = true;
        snippetVariantOptions.replaceChildren();
        snippetInsertButton.disabled = true;
        return;
      }

      const rowSummary = row.querySelector('.snippetRowSummary');
      snippetSelectedSummary.replaceChildren(...Array.from(rowSummary.childNodes, (node) => node.cloneNode(true)));
      snippetSelectedSummary.title = source.dataset.snippetTooltip || '';
      snippetSelectedHelp.textContent = source.dataset.snippetDescription || '';
      snippetWarning.hidden = !source.dataset.snippetPrecondition;
      snippetWarning.textContent = source.dataset.snippetPrecondition
        ? '注意: ' + source.dataset.snippetPrecondition
        : '';
      const imports = JSON.parse(source.dataset.snippetImports || '[]');
      const helpers = JSON.parse(source.dataset.snippetHelpers || '[]');
      const autoAdded = imports.concat(helpers.map((name) => 'def ' + name + '(...)'));
      snippetImportHint.hidden = autoAdded.length === 0;
      snippetImportHint.textContent = autoAdded.length > 0
        ? '自動追加: ' + autoAdded.join(' / ')
        : '';
      snippetDetails.hidden = !source.dataset.snippetTooltip;
      snippetDetails.open = false;
      snippetDetailsText.textContent = source.dataset.snippetTooltip || '';
      renderSnippetVariants(selectedSnippetControl, source);
      const rowPreview = row.querySelector('[data-snippet-row-preview]');
      if (rowPreview) {
        rowPreview.replaceChildren();
        JSON.parse(source.dataset.snippetPreviewParts || '[]').forEach((part) => {
          if (Object.prototype.hasOwnProperty.call(part, 'text')) {
            rowPreview.append(document.createTextNode(part.text));
          } else {
            const parameter = document.createElement('span');
            parameter.className = 'snippetParameter';
            parameter.textContent = part.defaultValue;
            rowPreview.append(parameter);
          }
        });
      }
      const complexityChip = row.querySelector('[data-snippet-complexity]');
      if (complexityChip && Object.prototype.hasOwnProperty.call(source.dataset, 'snippetComplexity')) {
        const complexity = source.dataset.snippetComplexity;
        if (complexityChip === openComplexityChip) {
          closeComplexityPopover();
        }
        complexityChip.hidden = !complexity;
        complexityChip.textContent = complexity ? complexity.short : '';
        complexityChip.dataset.complexityFull = complexity ? complexity.full : '';
        complexityChip.dataset.complexityDetail = complexity ? complexity.detail : '';
        complexityChip.setAttribute('aria-label', complexity ? complexity.label : '');
        complexityChip.title = complexity ? complexity.label : '';
      }
      const badgeCell = row.querySelector('[data-snippet-badges]');
      if (badgeCell && Array.isArray(source.dataset.snippetBadges)) {
        const badges = source.dataset.snippetBadges;
        const split = badges.length > 1;
        badgeCell.classList.toggle('isSplit', split);
        badgeCell.replaceChildren(...badges.map((badge) => {
          const element = document.createElement('span');
          element.className = 'snippetBadge snippetBadge-' + badge.type;
          element.setAttribute('role', 'img');
          element.setAttribute('aria-label', badge.label);
          element.title = badge.label;
          element.textContent = split ? badge.shortText : badge.text;
          return element;
        }));
      }
      snippetInsertButton.disabled = snippetInsertionPending;
    }

    function closeComplexityPopover({ restoreFocus = false } = {}) {
      if (!openComplexityChip) {
        return;
      }
      const chip = openComplexityChip;
      openComplexityChip = null;
      chip.setAttribute('aria-expanded', 'false');
      snippetComplexityPopover.hidden = true;
      if (restoreFocus) {
        chip.focus();
      }
    }

    function openComplexityPopover(chip) {
      closeComplexityPopover();
      openComplexityChip = chip;
      chip.setAttribute('aria-expanded', 'true');
      snippetComplexityPopoverTitle.textContent = '計算量: ' + (chip.dataset.complexityFull || '');
      snippetComplexityPopoverDetail.textContent = chip.dataset.complexityDetail || '';
      snippetComplexityPopover.hidden = false;
      const margin = 8;
      const chipRect = chip.getBoundingClientRect();
      const popoverRect = snippetComplexityPopover.getBoundingClientRect();
      const left = Math.max(margin, Math.min(chipRect.right - popoverRect.width, window.innerWidth - popoverRect.width - margin));
      const below = chipRect.bottom + 4;
      const top = below + popoverRect.height > window.innerHeight - margin
        ? Math.max(margin, chipRect.top - popoverRect.height - 4)
        : below;
      snippetComplexityPopover.style.left = left + 'px';
      snippetComplexityPopover.style.top = top + 'px';
    }

    function selectSnippet(control) {
      const row = control?.closest('[data-snippet-row]');
      if (!row) {
        return;
      }

      selectedSnippetControl = control;
      snippetStatus.textContent = '';
      snippetRows.forEach((item) => {
        item.classList.toggle('isSelected', item === row);
        item.querySelector('[data-snippet-entry]')?.setAttribute('aria-pressed', String(item === row));
      });
      updateSnippetInsertFooter();
      updateSnippetRovingTabStop(control);
      row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function getNavigableSnippetEntries() {
      return Array.from(snippetEntries).filter((entry) => {
        const row = entry.closest('[data-snippet-row]');
        const panel = entry.closest('[data-snippet-category-panel]');
        return Boolean(row && !row.hidden && panel && panel.open && !panel.hidden);
      });
    }

    // Category headers plus the rows of open categories, in display order.
    function getNavigableSnippetItems() {
      const entries = getNavigableSnippetEntries();
      return Array.from(snippetCategoryList.querySelectorAll(
        '[data-snippet-category-panel] > summary, [data-snippet-entry]'
      )).filter((item) => (item.matches('summary') ? !item.parentElement.hidden : entries.includes(item)));
    }

    // Roving tabindex: the list is a single Tab stop and arrow keys move inside it.
    function updateSnippetRovingTabStop(preferredItem) {
      const items = getNavigableSnippetItems();
      const tabStop = [preferredItem, document.activeElement, selectedSnippetControl]
        .find((item) => item && items.includes(item))
        || items.find((item) => item.matches('[data-snippet-entry]')) || items[0] || null;
      snippetCategorySummaries.forEach((summary) => {
        summary.tabIndex = summary === tabStop ? 0 : -1;
      });
      snippetEntries.forEach((entry) => {
        const isTabStop = entry === tabStop;
        entry.tabIndex = isTabStop ? 0 : -1;
        const chip = entry.closest('[data-snippet-row]')?.querySelector('[data-snippet-complexity]');
        if (chip) {
          chip.tabIndex = isTabStop ? 0 : -1;
        }
      });
      return tabStop;
    }

    function focusSnippetEntry(entry) {
      if (!entry) {
        return;
      }
      updateSnippetRovingTabStop(entry);
      entry.focus();
      selectSnippet(entry);
    }

    // Headers only take focus; rows are also selected, as before.
    function focusSnippetItem(item) {
      if (item.matches('summary')) {
        updateSnippetRovingTabStop(item);
        item.focus();
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
      }
      focusSnippetEntry(item);
    }

    function moveSnippetFocus(fromItem, key) {
      const items = getNavigableSnippetItems();
      const nextIndex = getNextIndex(items.indexOf(fromItem), items.length, key, 'vertical');
      if (nextIndex < 0) {
        return false;
      }
      closeComplexityPopover();
      focusSnippetItem(items[nextIndex]);
      return true;
    }

    function focusSnippetSearch() {
      setWorkspace('snippets');
      const input = snippetPreferencesOpen ? snippetPreferencesSearchInput : snippetSearchInput;
      input.focus();
      input.select();
    }

    function clearSnippetSearch() {
      snippetSearchInput.value = '';
      filterSnippetRows();
    }

    function filterSnippetRows() {
      closeComplexityPopover();
      const query = snippetSearchInput.value.trim().toLocaleLowerCase('ja');
      let totalMatches = 0;

      snippetCategoryPanels.forEach((panel) => {
        const rows = Array.from(panel.querySelectorAll('[data-snippet-row]'));
        let categoryMatches = 0;
        rows.forEach((row) => {
          const searchText = (row.dataset.snippetSearch || '').toLocaleLowerCase('ja');
          const isMatch = !query || searchText.includes(query);
          row.hidden = !isMatch;
          if (isMatch) {
            categoryMatches += 1;
          }
        });

        const count = panel.querySelector('[data-snippet-category-count]');
        if (count) {
          count.textContent = query
            ? categoryMatches + '件'
            : count.dataset.totalCount + '件';
        }

        panel.hidden = Boolean(query) && categoryMatches === 0;
        if (query) {
          panel.open = categoryMatches > 0;
        }
        totalMatches += categoryMatches;
      });

      snippetNoResults.textContent = '一致するスニペットがありません';
      snippetNoResults.hidden = totalMatches > 0;
      if (!query) {
        setSnippetCategory(viewState.snippetCategory);
      }
      updateSnippetRovingTabStop();
    }

    function confirmSnippet(control = selectedSnippetControl) {
      const source = getSnippetSource(control);
      const snippetId = getSnippetId(source);
      const row = control?.closest('[data-snippet-row]');
      if (!source || !snippetId || !row || snippetInsertionPending) {
        return;
      }

      snippetInsertionPending = true;
      snippetInsertButton.disabled = true;
      snippetStatus.textContent = '';
      snippetStatus.className = 'snippetStatus';
      vscode.postMessage({
        type: 'insertSnippet',
        snippetId
      });
    }

    function formatElapsed(value) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return '';
      }

      if (value < 1000) {
        return value.toFixed(1) + ' ms';
      }

      return (value / 1000).toFixed(3) + ' s';
    }

    function updateRuntime(runtime) {
      const safeRuntime = runtime || {};

      runtimeImplementation.textContent = safeRuntime.implementation || '不明';
      runtimeVersion.textContent = safeRuntime.version || (safeRuntime.errorMessage ? '取得できません' : '');
      runtimeExecutable.textContent = safeRuntime.executable || '';
      runtimeExecutable.title = safeRuntime.executable || '';
      runtimeLauncher.textContent = safeRuntime.launcher || '';
      runtimeLauncher.title = safeRuntime.launcher || '';
    }

    function updateCustomPythonPathState() {
      customPythonPath.disabled = pythonLauncherSelect.value !== '__custom__';
      const selectedPythonPath = getSelectedPythonPath();
      launcherSummary.textContent = selectedPythonPath
        || (pythonLauncherSelect.value === '__custom__' ? 'カスタム' : '設定値');
      launcherSummary.title = selectedPythonPath;
    }

    function applySavedPythonPath(value) {
      const pythonPath = typeof value === 'string' ? value.trim() : '';
      const option = Array.from(pythonLauncherSelect.options).find((item) => item.value === pythonPath);

      if (!pythonPath) {
        pythonLauncherSelect.value = '';
        customPythonPath.value = '';
      } else if (option && pythonPath !== '__custom__') {
        pythonLauncherSelect.value = pythonPath;
        customPythonPath.value = '';
      } else {
        pythonLauncherSelect.value = '__custom__';
        customPythonPath.value = pythonPath;
      }

      updateCustomPythonPathState();
    }

    function getSelectedPythonPath() {
      if (pythonLauncherSelect.value === '__custom__') {
        return customPythonPath.value.trim();
      }

      return pythonLauncherSelect.value;
    }

    function savePythonPathPreference() {
      vscode.postMessage({
        type: 'savePythonPath',
        pythonPath: getSelectedPythonPath()
      });
    }

    function updateLauncherAvailability(launchers) {
      const availabilityByLauncher = new Map(
        (Array.isArray(launchers) ? launchers : []).map((launcher) => [launcher.launcher, launcher])
      );
      let availableCount = 0;

      Array.from(pythonLauncherSelect.options).forEach((option) => {
        if (!option.value || option.value === '__custom__') {
          return;
        }

        const info = availabilityByLauncher.get(option.value);
        option.textContent = option.value;
        option.title = '';

        if (!info) {
          option.disabled = false;
          return;
        }

        option.disabled = !info.available;
        if (info.available) {
          availableCount += 1;
          option.title = info.version || option.value;
          return;
        }

        option.textContent = option.value + ' (未検出)';
        option.title = info.errorMessage || '見つかりませんでした';
      });

      if (pythonLauncherSelect.selectedOptions[0]?.disabled) {
        pythonLauncherSelect.value = '';
      }

      launcherProbeStatus.textContent = '起動時に判定: 利用可能 ' + availableCount + ' / ' + availabilityByLauncher.size;
      updateCustomPythonPathState();
    }

    pythonLauncherSelect.addEventListener('change', () => {
      updateCustomPythonPathState();
      savePythonPathPreference();
    });
    customPythonPath.addEventListener('input', () => {
      updateCustomPythonPathState();
      savePythonPathPreference();
    });
    applySavedPythonPath(initialPythonPath);

    workspaceTabs.forEach((tab) => {
      tab.addEventListener('click', () => setWorkspace(tab.dataset.workspace));
      tab.addEventListener('keydown', (event) => {
        const tabs = Array.from(workspaceTabs);
        const nextIndex = getNextIndex(tabs.indexOf(tab), tabs.length, event.key, 'horizontal');
        if (nextIndex < 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        event.preventDefault();
        setWorkspace(tabs[nextIndex].dataset.workspace);
        tabs[nextIndex].focus();
      });
    });
    document.querySelectorAll('[data-open-settings]').forEach((button) => {
      button.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
    });
    snippetCategorySummaries.forEach((summary) => {
      const panel = summary.parentElement;
      summary.addEventListener('click', rememberSnippetCategoryScrollPosition);
      summary.addEventListener('focus', () => updateSnippetRovingTabStop(summary));
      summary.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          rememberSnippetCategoryScrollPosition();
          return;
        }
        if (isImeComposing(event) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        const disclosure = getDisclosureArrowAction(event, panel.open);
        if (disclosure) {
          event.preventDefault();
          rememberSnippetCategoryScrollPosition();
          panel.open = disclosure === 'open';
          return;
        }
        if (event.key === 'Escape' && snippetSearchInput.value) {
          event.preventDefault();
          clearSnippetSearch();
          snippetSearchInput.focus();
          return;
        }
        if (moveSnippetFocus(summary, event.key)) {
          event.preventDefault();
        }
      });
    });
    snippetCategoryPanels.forEach((panel) => {
      panel.addEventListener('toggle', () => {
        const scrollTop = pendingSnippetCategoryScrollTop;
        pendingSnippetCategoryScrollTop = null;
        if (panel.open && !snippetSearchInput.value.trim()) {
          saveViewState({ snippetCategory: panel.dataset.snippetCategoryPanel });
        }
        if (scrollTop !== null) {
          restoreSnippetCategoryScrollPosition(scrollTop);
        }
        updateSnippetRovingTabStop();
      });
    });
    setWorkspace(viewState.workspace === 'snippets' ? 'snippets' : 'run');
    const defaultSnippetCategory = snippetCategoryPanels[0]?.dataset.snippetCategoryPanel || '';
    const storedSnippetCategory = Array.from(snippetCategoryPanels).some(
      (panel) => panel.dataset.snippetCategoryPanel === viewState.snippetCategory
    )
      ? viewState.snippetCategory
      : defaultSnippetCategory;
    setSnippetCategory(storedSnippetCategory);

    snippetEntries.forEach((entry) => {
      entry.addEventListener('click', () => {
        selectSnippet(entry);
      });
      entry.addEventListener('keydown', (event) => {
        if (isImeComposing(event) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        if (event.key === 'Enter') {
          // Space keeps the native click (select only); Enter selects and inserts.
          event.preventDefault();
          selectSnippet(entry);
          confirmSnippet(entry);
          return;
        }
        if (event.key === 'ArrowRight') {
          const chip = entry.closest('[data-snippet-row]')?.querySelector('[data-snippet-complexity]');
          if (chip && !chip.hidden) {
            event.preventDefault();
            chip.focus();
          }
          return;
        }
        if (event.key === 'Escape' && snippetSearchInput.value) {
          event.preventDefault();
          clearSnippetSearch();
          snippetSearchInput.focus();
          return;
        }
        if (moveSnippetFocus(entry, event.key)) {
          event.preventDefault();
        }
      });
    });

    snippetComplexityChips.forEach((chip) => {
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        if (openComplexityChip === chip) {
          closeComplexityPopover();
        } else {
          openComplexityPopover(chip);
        }
      });
      chip.addEventListener('keydown', (event) => {
        if (isImeComposing(event) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }
        const entry = chip.closest('[data-snippet-row]')?.querySelector('[data-snippet-entry]');
        if (!entry) {
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          closeComplexityPopover();
          entry.focus();
          return;
        }
        if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && moveSnippetFocus(entry, event.key)) {
          event.preventDefault();
        }
      });
    });
    document.addEventListener('click', (event) => {
      if (openComplexityChip && !snippetComplexityPopover.contains(event.target)) {
        closeComplexityPopover();
      }
    });
    // Capture phase: an Escape that closes the popover must not also clear the search.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && openComplexityChip) {
        event.preventDefault();
        event.stopPropagation();
        closeComplexityPopover({ restoreFocus: true });
      }
    }, true);
    snippetCategoryList.addEventListener('scroll', () => {
      closeComplexityPopover();
    });
    window.addEventListener('resize', () => {
      closeComplexityPopover();
    });

    snippetSearchInput.addEventListener('input', () => {
      filterSnippetRows();
    });
    snippetSearchInput.addEventListener('keydown', (event) => {
      if (isImeComposing(event)) {
        return;
      }
      if (event.key === 'Escape' && snippetSearchInput.value) {
        clearSnippetSearch();
        return;
      }
      const isPlainKey = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (isPlainKey && (event.key === 'ArrowDown' || event.key === 'Enter')) {
        // Skip headers so a filtered search lands on the first match.
        const firstItem = getNavigableSnippetEntries()[0] || getNavigableSnippetItems()[0];
        if (firstItem) {
          event.preventDefault();
          focusSnippetItem(firstItem);
        }
      }
    });

    snippetInsertButton.addEventListener('click', () => {
      confirmSnippet();
    });
    snippetPreferencesButton.addEventListener('click', () => {
      setSnippetPreferencesOpen(!snippetPreferencesOpen);
    });
    snippetPreferencesSearchInput.addEventListener('input', () => {
      filterSnippetPreferenceRows();
    });
    snippetPreferencesSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && snippetPreferencesSearchInput.value) {
        snippetPreferencesSearchInput.value = '';
        filterSnippetPreferenceRows();
      }
    });
    snippetPreferenceRows.forEach((row) => {
      const checkbox = row.querySelector('[data-snippet-preference-visible]');
      checkbox.addEventListener('change', () => {
        updateSnippetPreferenceRow(row);
        updateSnippetPreferenceControls();
      });
      row.querySelectorAll('[data-snippet-move]').forEach((button) => {
        button.addEventListener('click', () => {
          const rowsContainer = row.parentElement;
          if (button.dataset.snippetMove === 'up') {
            const previous = row.previousElementSibling;
            if (previous) {
              rowsContainer.insertBefore(row, previous);
            }
          } else {
            const next = row.nextElementSibling;
            if (next) {
              rowsContainer.insertBefore(next, row);
            }
          }
          updateSnippetPreferenceControls();
          button.focus();
        });
      });
    });
    // Up/Down walk headers and visibility switches; Tab still reaches the move buttons.
    function getNavigablePreferenceItems() {
      return Array.from(snippetPreferencesList.querySelectorAll(
        '[data-snippet-preference-category-panel] > summary, [data-snippet-preference-visible]'
      )).filter((item) => {
        const panel = item.closest('[data-snippet-preference-category-panel]');
        if (!panel || panel.hidden) {
          return false;
        }
        return item.matches('summary') || (panel.open && !item.closest('[data-snippet-preference-row]').hidden);
      });
    }
    function movePreferenceFocus(fromItem, event) {
      if (isImeComposing(event) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const items = getNavigablePreferenceItems();
      const nextIndex = getNextIndex(items.indexOf(fromItem), items.length, event.key, 'vertical');
      if (nextIndex >= 0) {
        event.preventDefault();
        items[nextIndex].focus();
        items[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    snippetPreferenceCategoryPanels.forEach((panel) => {
      const summary = panel.querySelector(':scope > summary');
      summary.addEventListener('keydown', (event) => {
        const disclosure = getDisclosureArrowAction(event, panel.open);
        if (disclosure) {
          event.preventDefault();
          panel.open = disclosure === 'open';
          return;
        }
        movePreferenceFocus(summary, event);
      });
    });
    snippetPreferenceRows.forEach((row) => {
      const checkbox = row.querySelector('[data-snippet-preference-visible]');
      checkbox.addEventListener('keydown', (event) => movePreferenceFocus(checkbox, event));
    });
    snippetPreferencesResetButton.addEventListener('click', resetSnippetPreferencesToDefault);
    snippetPreferencesSaveButton.addEventListener('click', saveSnippetPreferenceDraft);
    restoreSnippetPreferenceDraft();
    setSnippetPreferencesOpen(false);
    updateSnippetInsertFooter();
    updateSnippetRovingTabStop();

    // saveFirst asks the extension to save the active Python file before running.
    function startRun({ saveFirst = false } = {}) {
      if (runButton.disabled) {
        return;
      }
      setWorkspace('run');
      const selectedPythonPath = getSelectedPythonPath();
      runButton.disabled = true;
      status.textContent = '実行中';
      status.className = 'summaryValue toneState';
      exitCode.textContent = '';
      exitCode.className = 'detailValue toneExit';
      elapsed.textContent = '';
      stdout.textContent = '';
      errorExplanation.textContent = '';
      stderr.textContent = '';
      stderrField.hidden = true;
      savePythonPathPreference();
      vscode.postMessage({
        type: 'run',
        input: stdin.value,
        pythonPath: selectedPythonPath,
        saveFirst
      });
    }

    runButton.addEventListener('click', () => startRun());
    // Esc leaves the stdin box for the run tab, where Shift+Right switches tabs again.
    stdin.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || isImeComposing(event)
        || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      document.getElementById('runWorkspaceTab').focus();
    });

    function allowsAltI() {
      return inputFocusMode !== 'shiftShift';
    }
    function allowsShiftShift() {
      return inputFocusMode !== 'altI';
    }
    // Returns to the tab that was last open; the run tab always lands on stdin.
    function focusLastWorkspace() {
      if (viewState.workspace === 'snippets') {
        setWorkspace('snippets', { focusPanel: true });
        return;
      }
      setWorkspace('run');
      stdin.focus();
    }
    function postFocusState() {
      vscode.postMessage({ type: 'focusState', focused: document.hasFocus() });
    }
    window.addEventListener('focus', postFocusState);
    window.addEventListener('blur', postFocusState);
    // Capture phase so keys stopped by inner handlers still break a Shift double tap.
    document.addEventListener('keydown', (event) => {
      shiftDoubleTap.handleKeyDown(event);
    }, true);
    document.addEventListener('keyup', (event) => {
      if (shiftDoubleTap.handleKeyUp(event, event.timeStamp) && allowsShiftShift()) {
        vscode.postMessage({ type: 'focusEditor' });
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (allowsAltI() && isInputFocusShortcut(event)) {
        // The key is still forwarded to VS Code; both paths only ever target the editor.
        event.preventDefault();
        vscode.postMessage({ type: 'focusEditor' });
        return;
      }
      const inTextField = isTextEntryTarget(event.target);
      const shortcutWorkspace = getWorkspaceShortcutTarget(event, { allowArrows: !inTextField })
        || (inTextField ? getTextFieldEdgeWorkspaceTarget(event, event.target, viewState.workspace) : '');
      if (shortcutWorkspace) {
        // Let it bubble: VS Code must still see the Alt key combo (see Alt+I).
        event.preventDefault();
        // Shift+Arrow must stay usable after the switch, so it never lands in a text field.
        setWorkspace(shortcutWorkspace, { focusPanel: true, avoidTextEntry: event.shiftKey });
        return;
      }
      if (isRunShortcut(event)) {
        event.preventDefault();
        startRun({ saveFirst: true });
        return;
      }
      if (isSearchShortcut(event, isEditableTarget(event.target))) {
        event.preventDefault();
        focusSnippetSearch();
      }
    });
    window.addEventListener('message', (event) => {
      const message = event.data;

      if (message.type === 'snippetResult') {
        snippetInsertionPending = false;
        updateSnippetInsertFooter();
        snippetStatus.textContent = message.message || '';
        snippetStatus.className = message.ok
          ? 'snippetStatus'
          : 'snippetStatus error';
        return;
      }

      if (message.type === 'snippetPreferencesResult') {
        snippetPreferencesSaveButton.disabled = false;
        snippetPreferencesHint.textContent = message.message || 'コード整理の保存に失敗しました。';
        snippetPreferencesHint.className = 'snippetPreferencesHint error';
        return;
      }

      if (message.type === 'launcherProbeStatus') {
        launcherProbeStatus.textContent = message.message;
        return;
      }

      if (message.type === 'launcherAvailability') {
        updateLauncherAvailability(message.launchers);
        return;
      }

      if (message.type === 'requestRun') {
        startRun();
        return;
      }

      if (message.type === 'focusStdin') {
        focusLastWorkspace();
        return;
      }

      if (message.type === 'inputFocusShortcut') {
        inputFocusMode = message.mode;
        stdin.placeholder = getStdinPlaceholder(message.label);
        stdin.title = getStdinTitle(message.label);
        inputFocusHintKey.textContent = message.label;
        return;
      }

      if (message.type === 'notice') {
        status.textContent = message.message;
        status.className = 'summaryValue toneError';
        return;
      }

      if (message.type !== 'result') {
        return;
      }

      runButton.disabled = false;
      stdout.textContent = message.stdout || '';
      const failed = Boolean(message.errorMessage || message.timedOut
        || (typeof message.exitCode === 'number' && message.exitCode !== 0));
      errorExplanation.textContent = message.errorExplanation
        || (failed ? '実行中にエラーが発生しました。コードと入力を確認してください。'
          : message.stderr ? '実行は完了しましたが、Pythonが注意事項を出力しました。' : '');
      stderr.textContent = [message.errorMessage, message.stderr].filter(Boolean).join('\\n');
      const errorPresentation = getErrorPresentation({
        mode: errorDisplayMode,
        explanation: errorExplanation.textContent,
        originalText: stderr.textContent
      });
      stderrField.hidden = !errorPresentation.showField;
      originalErrorContainer.hidden = !errorPresentation.showOriginal;
      if (originalErrorDetails) originalErrorDetails.open = errorPresentation.originalExpanded;
      if (errorExplanationDetails) {
        errorExplanationDetails.hidden = !errorPresentation.showExplanation;
        errorExplanationDetails.open = errorPresentation.explanationExpanded;
      }
      if (message.exitCode === null || message.exitCode === undefined) {
        exitCode.textContent = 'n/a';
        exitCode.className = 'detailValue toneMuted';
      } else {
        exitCode.textContent = String(message.exitCode);
        exitCode.className = message.exitCode === 0
          ? 'detailValue toneState'
          : 'detailValue toneError';
      }
      elapsed.textContent = formatElapsed(message.elapsedMs);
      updateRuntime(message.pythonRuntime);

      if (message.timedOut) {
        status.textContent = 'タイムアウト';
        status.className = 'summaryValue toneError';
      } else if (message.errorMessage) {
        status.textContent = '実行できませんでした';
        status.className = 'summaryValue toneError';
      } else if (message.exitCode !== 0) {
        status.textContent = '異常終了';
        status.className = 'summaryValue toneError';
      } else {
        status.textContent = '完了';
        status.className = 'summaryValue toneState';
      }
    });

    postFocusState();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

module.exports = {
  getComplexityShortForm,
  getWebviewHtml
};
