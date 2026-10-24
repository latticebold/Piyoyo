const test = require('node:test');
const assert = require('node:assert/strict');
const { Script } = require('node:vm');

const { getComplexityShortForm, getWebviewHtml } = require('../src/webviewHtml');
const { INPUT_SNIPPETS } = require('../src/snippetLibrary');

test('webview keeps the document title without a visible brand heading', () => {
  const html = getWebviewHtml();

  assert.match(html, /<title>Piyoyo<\/title>/);
  assert.match(html, /aria-label="Piyoyoの機能"/);
  assert.doesNotMatch(html, /<div class="topbar">/);
  assert.doesNotMatch(html, /<strong>.*Piyoyo.*<\/strong>/s);
});

test('webview output and input controls do not inherit uppercase text transform', () => {
  const html = getWebviewHtml();

  assert.match(html, /textarea,\s*pre\s*\{[^}]*text-transform:\s*none;/s);
});

test('webview uses white input and yellow output surfaces with dark text', () => {
  const html = getWebviewHtml();

  assert.match(html, /id="stdin"[^>]*class="stdinBox"/);
  assert.match(html, /id="stdout"[^>]*class="outputBox stdoutBox"/);
  assert.match(html, /id="errorExplanation"[^>]*class="outputBox stderrBox"/);
  assert.match(html, /id="stderr"[^>]*class="outputBox stderrBox"/);
  assert.match(html, /\.stdinBox\s*\{(?=[^}]*color:\s*var\(--piyoyo-bg\))(?=[^}]*background:\s*var\(--piyoyo-text\))(?=[^}]*border-color:\s*var\(--piyoyo-text\))[^}]*\}/s);
  assert.match(html, /\.stdoutBox\s*\{(?=[^}]*color:\s*var\(--piyoyo-bg\))(?=[^}]*background:\s*var\(--piyoyo-yellow\))(?=[^}]*border-color:\s*var\(--piyoyo-yellow\))[^}]*\}/s);
  assert.match(html, /\.stderrBox\s*\{[^}]*color:\s*var\(--piyoyo-red\)/s);
  assert.match(html, /\.stderrBox\s*\{[^}]*background:\s*#251112/s);
});

test('webview separates execution, snippet insertion and verification into three workspaces', () => {
  const html = getWebviewHtml({
    brandName: 'Piyoyo'
  });
  const tabsIndex = html.indexOf('class="workspaceTabs"');
  const runWorkspaceIndex = html.indexOf('id="runWorkspace"');
  const snippetWorkspaceIndex = html.indexOf('id="snippetWorkspace"');
  const verifyWorkspaceIndex = html.indexOf('id="verifyWorkspace"');
  const runIndex = html.indexOf('id="runButton"');
  const stdinIndex = html.indexOf('id="stdin"');
  const stdoutIndex = html.indexOf('id="stdout"');
  const detailsIndex = html.indexOf('id="runDetails"');
  const launcherIndex = html.indexOf('class="launcher runSection"');

  assert.ok(tabsIndex > -1);
  assert.ok(runWorkspaceIndex > tabsIndex);
  assert.ok(snippetWorkspaceIndex > runWorkspaceIndex);
  assert.ok(verifyWorkspaceIndex > snippetWorkspaceIndex);
  assert.ok(runIndex < stdinIndex);
  assert.ok(stdinIndex < stdoutIndex);
  assert.ok(stdoutIndex < detailsIndex);
  assert.ok(detailsIndex < launcherIndex);
  assert.deepEqual(
    Array.from(html.matchAll(/<button\b[^>]*role="tab"[^>]*data-workspace="([^"]+)"/g), (match) => match[1]),
    ['run', 'snippets', 'verify']
  );
  assert.match(html, /data-workspace="run"[^>]*>実行</);
  assert.match(html, /data-workspace="snippets"[^>]*>コード挿入</);
  assert.match(html, /data-workspace="verify"[^>]*>検証</);
  assert.match(html, /id="snippetWorkspace"[^>]*hidden/);
  assert.match(html, /<section id="verifyWorkspace"[^>]*role="tabpanel"[^>]*aria-labelledby="verifyWorkspaceTab"[^>]*data-workspace-panel="verify"[^>]*hidden>/);
  assert.match(html, /\.workspaceTabs\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/s);
  assert.doesNotMatch(html, /id="targetFile"/);
  assert.doesNotMatch(html, /id="activeFile"/);
  assert.doesNotMatch(html, /id="useActiveButton"/);
  assert.doesNotMatch(html, /現在のファイルを使用/);
  assert.doesNotMatch(html, /現在のエディタ/);
});

test('webview uses headed run sections below the result', () => {
  const html = getWebviewHtml();
  const outputIndex = html.indexOf('class="outputSection"');
  const detailsIndex = html.indexOf('id="runDetails"');
  const launcherIndex = html.indexOf('class="launcher runSection"');

  assert.ok(outputIndex > -1);
  assert.ok(detailsIndex > outputIndex);
  assert.ok(launcherIndex > detailsIndex);
  assert.match(html, /<section id="runDetails" class="runDetails runSection"[^>]*>/);
  assert.match(html, /<section class="launcher runSection"[^>]*>/);
  assert.doesNotMatch(html, /<details[^>]*(?:runDetails|launcher)/);
  assert.doesNotMatch(html, /<summary[^>]*(?:実行詳細|実行環境)/);
  assert.doesNotMatch(html, /runDetails\.open/);
  assert.match(html, /<h[1-6][^>]*>実行環境<\/h[1-6]>/);
  assert.match(html, /<h[1-6][^>]*>実行詳細<\/h[1-6]>/);
  assert.match(html, /実行環境/);
  assert.match(html, /実行詳細/);
  assert.match(html, /id="elapsed"/);
  assert.match(html, /formatElapsed/);
  assert.match(html, /時間/);
  assert.match(html, /id="runtimeImplementation"/);
  assert.match(html, /id="runtimeVersion"/);
  assert.match(html, /id="runtimeExecutable"/);
  assert.match(html, /id="runtimeLauncher"/);
});

test('webview uses compact colored detail values', () => {
  const html = getWebviewHtml();

  assert.match(html, /class="detailGrid"/);
  assert.match(html, /class="detailItem"/);
  assert.match(html, /id="status" class="summaryValue toneState"/);
  assert.match(html, /id="exitCode" class="detailValue toneExit"/);
  assert.match(html, /id="elapsed" class="detailValue toneTime"/);
  assert.match(html, /id="runtimeImplementation" class="detailValue tonePython"/);
  assert.match(html, /id="runtimeVersion" class="detailValue toneVersion"/);
  assert.match(html, /id="runtimeExecutable" class="detailValue tonePath"/);
  assert.match(html, /id="runtimeLauncher" class="detailValue toneLauncher"/);
  assert.match(html, /\.toneState\s*\{[^}]*color:\s*var\(--vscode-charts-green/s);
  assert.match(html, /\.toneExit\s*\{[^}]*color:\s*var\(--vscode-charts-yellow/s);
  assert.match(html, /\.toneTime\s*\{[^}]*color:\s*var\(--vscode-charts-blue/s);
  assert.match(html, /\.tonePython\s*\{[^}]*color:\s*var\(--vscode-charts-purple/s);
});

test('webview includes Python launcher selection controls', () => {
  const html = getWebviewHtml();

  assert.match(html, /id="pythonLauncherSelect"/);
  assert.match(html, /id="customPythonPath"/);
  assert.match(html, /id="launcherProbeStatus"/);
  assert.match(html, /value="python"/);
  assert.match(html, /value="py"/);
  assert.match(html, /value="pypy"/);
  assert.match(html, /value="pypy3"/);
  assert.match(html, /pythonPath: getSelectedPythonPath\(\)/);
  assert.match(html, /launcherAvailability/);
  assert.match(html, /未検出/);
  assert.doesNotMatch(html, /refreshLaunchersButton/);
  assert.doesNotMatch(html, /refreshLaunchers/);
  assert.doesNotMatch(html, /再判定/);
});

test('webview restores and saves the selected Python launcher', () => {
  const html = getWebviewHtml({ savedPythonPath: 'pypy3' });

  assert.match(html, /const initialPythonPath = "pypy3";/);
  assert.match(html, /applySavedPythonPath\(initialPythonPath\)/);
  assert.match(html, /type:\s*'savePythonPath'/);
  assert.match(html, /pythonLauncherSelect\.addEventListener\('change'/);
  assert.match(html, /customPythonPath\.addEventListener\('input'/);
});

test('webview escapes saved Python launcher before embedding it in script', () => {
  const html = getWebviewHtml({ savedPythonPath: '</script><script>alert(1)</script>' });

  assert.doesNotMatch(html, /<\/script><script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script\\u003e/);
});

test('webview makes run the primary large action', () => {
  const html = getWebviewHtml();

  assert.match(html, /id="runButton"/);
  assert.match(html, /class="primaryRun"/);
  assert.match(html, /\.primaryRun\s*\{[^}]*min-height:\s*28px;/s);
  assert.match(html, /\.primaryRun\s*\{[^}]*width:\s*100%;/s);
  assert.match(html, /\.primaryRun\s*\{(?=[^}]*background:\s*var\(--piyoyo-action-red\))(?=[^}]*color:\s*var\(--piyoyo-text\))[^}]*\}/s);
  assert.match(html, /--piyoyo-action-red:\s*#c43b32;/);
});

test('webview renders every snippet row in the intended category order', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.match(html, /class="snippetCategoryList" aria-label="入力コードのジャンル"/);
  const categoryIds = [
    'input', 'number-conversion', 'string', 'list', 'tuple', 'aggregation',
    'queue', 'brute-force', 'prefix-sum', 'binary-search', 'graph', 'output'
  ];
  const categoryLabels = [
    '入力', '数値・型変換', '文字列', 'リスト', 'タプル・座標', '集合・辞書・数え上げ',
    'キュー・deque', '全探索', '累積和', '二分探索', 'グラフ・木', '出力・デバッグ'
  ];
  let previousIndex = html.indexOf('class="snippetCategoryList"');
  categoryIds.forEach((categoryId, index) => {
    const panelIndex = html.indexOf(`data-snippet-category-panel="${categoryId}"`);
    assert.ok(panelIndex > previousIndex, `${categoryId} should follow the previous category`);
    previousIndex = panelIndex;
    assert.match(html, new RegExp(`data-snippet-category-panel="${categoryId}"`));
    assert.match(html, new RegExp(`<span class="snippetCategorySummaryLabel">${categoryLabels[index]}</span>`));
  });
  assert.match(html, /<details[^>]*data-snippet-category-panel="input"[^>]* open>/);
  categoryIds.slice(1).forEach((categoryId) => {
    assert.doesNotMatch(
      html,
      new RegExp(`<details[^>]*data-snippet-category-panel="${categoryId}"[^>]* open>`)
    );
  });
  assert.match(html, /<summary>\s*<span[^>]*>入力<\/span>/s);
  assert.equal((html.match(/class="snippetCategoryDropdown"/g) || []).length, categoryIds.length);
  assert.equal((html.match(/data-snippet-variants=/g) || []).length, 17);
  assert.ok((html.match(/data-snippet-entry=/g) || []).length > 60);
  assert.doesNotMatch(html, /data-snippet-select=/);
  assert.doesNotMatch(html, /class="snippetVariantSelect"/);
  assert.match(html, /data-snippet-group="input-single-line-type"/);
  assert.match(html, /&quot;id&quot;:&quot;basic-int&quot;[^>]*&quot;choiceLabel&quot;:&quot;整数&quot;/);
  assert.match(html, /&quot;id&quot;:&quot;basic-float&quot;[^>]*&quot;choiceLabel&quot;:&quot;小数&quot;/);
  assert.match(html, /data-snippet-group="input-number-line-type"/);
  assert.match(html, /&quot;id&quot;:&quot;split-int-list&quot;[^>]*&quot;choiceLabel&quot;:&quot;整数（list）&quot;/);
  assert.match(html, /&quot;id&quot;:&quot;split-float-list&quot;[^>]*&quot;choiceLabel&quot;:&quot;小数（list）&quot;/);
  assert.match(html, /data-snippet-group="input-multiline-list-type"/);
  assert.match(html, /&quot;id&quot;:&quot;multiline-ints&quot;[^>]*&quot;choiceLabel&quot;:&quot;整数&quot;/);
  assert.match(html, /data-snippet-entry="basic-chars"[^>]*data-snippet-label="list\(input\(\)\)"/);
  assert.match(html, /data-snippet-group="list-list-min-max"/);
  assert.match(html, /&quot;id&quot;:&quot;list-max&quot;[^>]*&quot;choiceLabel&quot;:&quot;最大値&quot;/);
  assert.match(html, /&quot;id&quot;:&quot;list-min&quot;[^>]*&quot;choiceLabel&quot;:&quot;最小値&quot;/);
  assert.match(html, /data-snippet-entry="binary-count-closed-interval"[^>]*data-snippet-label="bisect_right\(a, A\) - bisect_left\(a, B\)"/);
  assert.match(html, /data-snippet-entry="debug-type"[^>]*data-snippet-label="type\(x\)"/);
  assert.match(html, /data-snippet-entry="list-slice"[^>]*data-snippet-label="A\[start:end\]"/);
  assert.match(html, /data-snippet-entry="queue-index"[^>]*data-snippet-label="q\[i\]"/);
  assert.doesNotMatch(html, /data-snippet-entry="queue-peek-(?:left|right)"/);
  assert.match(html, /data-snippet-placeholders="\[\{&quot;index/);
  assert.equal((html.match(/data-snippet-label=/g) || []).length, (html.match(/data-snippet-entry=/g) || []).length);
  assert.doesNotMatch(html, /data-snippet-selection=/);
  assert.doesNotMatch(html, /data-snippet-mode=/);
  assert.doesNotMatch(html, /assign-/);
  assert.doesNotMatch(html, /spllit/);
});

test('webview uses compact clickable rows, search, and bottom variant choice', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.match(html, /\.snippetCategoryDropdown\s*\{[^}]*border:/s);
  assert.match(html, /\.snippetCategoryDropdown\[open\] > summary \.snippetCategoryChevron/);
  assert.match(html, /\.runner\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\);/s);
  assert.match(html, /\.snippetLibrary\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s);
  assert.match(html, /\.snippetBrowsePanel,\s*\.snippetPreferencesPanel\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s);
  assert.match(html, /\.snippetChoice\s*\{[^}]*grid-template-columns:/s);
  assert.match(html, /\.snippetRowPreview\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(html, /\.snippetCategoryList\s*\{[^}]*grid-auto-rows:\s*max-content;/s);
  assert.match(html, /\.snippetCategoryList\s*\{[^}]*align-content:\s*start;/s);
  assert.match(html, /\.snippetCategoryList\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(html, /\.snippetComplexity\s*\{[^}]*font-size:\s*var\(--piyoyo-font-small\)/s);
  assert.match(html, /id="snippetSearchInput"[^>]*placeholder="操作を検索 \(\/\)"/);
  assert.match(html, /id="snippetVariantField"[^>]*hidden/);
  assert.match(html, /button\.className = 'snippetVariantButton'/);
  assert.match(html, /id="snippetImportHint"[^>]*hidden/);
  assert.match(html, /id="snippetDetails"[^>]*hidden/);
  assert.match(html, /自動追加: ' \+ autoAdded\.join/);
  assert.match(html, /snippetDetailsText\.textContent = source\.dataset\.snippetTooltip/);
  assert.match(html, /\.snippetInsertFooter\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s);
  assert.match(html, /\.snippetInsertButton\s*\{[^}]*width:\s*100%;/s);
  assert.match(html, /id="snippetInsertButton"[^>]*disabled/);
  assert.doesNotMatch(html, /data-snippet-editor-expression/);
  assert.match(html, /function selectSnippet\(control\)/);
  assert.match(html, /snippetEntries\.forEach\(\(entry\)/);
  assert.match(html, /selectSnippet\(entry\)/);
  assert.match(html, /function renderSnippetVariants\(control, source\)/);
  assert.doesNotMatch(html, /function renderSelectedSnippetEditor\(control\)/);
  assert.doesNotMatch(html, /data-snippet-placeholder-index/);
  assert.match(html, /function confirmSnippet\(control(?:\s*=\s*selectedSnippetControl)?\)/);
  assert.doesNotMatch(html, /getSnippetPlaceholderValues/);
  assert.match(html, /snippetInsertButton\.addEventListener\('click'/);
  assert.match(html, /confirmSnippet\(\);/);
  assert.doesNotMatch(html, /data-snippet-expression/);
  assert.doesNotMatch(html, /snippetInlineInput/);
  assert.doesNotMatch(html, /renderInlineExpression/);
  assert.match(html, /function filterSnippetRows\(\)/);
  assert.match(html, /row\.hidden = !isMatch/);
  assert.doesNotMatch(html, /snippetSelectors/);
  assert.doesNotMatch(html, /<select[^>]*data-snippet/);
  assert.doesNotMatch(html, /data-snippet-confirm=/);
  assert.doesNotMatch(html, /snippetConfirmButtons/);
  assert.doesNotMatch(html, /class="snippetInlineConfirm"/);
  assert.doesNotMatch(html, /class="snippetSelection"/);
  assert.doesNotMatch(html, /class="snippetPlaceholderLabel"/);
  assert.doesNotMatch(html, /値1/);
  assert.doesNotMatch(html, /class="snippetButton"/);
  assert.doesNotMatch(html, /class="snippetMeta"/);
});

test('webview styles IO labels and compact high-contrast snippets', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.match(html, /\.ioLabel\s*\{(?=[^}]*font-size:\s*16px)(?=[^}]*color:\s*var\(--piyoyo-text\))[^}]*\}/s);
  assert.match(html, /\.snippetInsertButton\s*\{(?=[^}]*background:\s*var\(--vscode-button-background,\s*#0e639c\))(?=[^}]*color:\s*var\(--vscode-button-foreground,\s*#ffffff\))[^}]*\}/s);
  assert.match(html, /\.snippetInsertButton:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--vscode-button-hoverBackground,\s*#1177bb\)/s);
  assert.match(html, /\.snippetChoice:hover\s*\{[^}]*background:\s*#373000/s);
  assert.match(html, /\.snippetRow\.isSelected \.snippetChoice\s*\{[^}]*background:\s*#3a230e/s);
  assert.match(html, /\.snippetRowSummary\s*\{[^}]*color:\s*var\(--piyoyo-text\)/s);
  assert.match(html, /\.snippetRowPreview\s*\{[^}]*color:\s*var\(--piyoyo-text\)/s);
  assert.match(html, /\.snippetParameter\s*\{[^}]*color:\s*var\(--piyoyo-orange\)/s);
  assert.match(html, /--piyoyo-muted:\s*#c5c5c5/);
  assert.match(html, /\.snippetChoice\s*\{[^}]*min-height:\s*30px/s);
  assert.match(html, /\.snippetRowSummary\s*\{(?=[^}]*white-space:\s*normal)(?![^}]*text-overflow)[^}]*\}/s);
  assert.match(html, /\.snippetComplexity\s*\{[^}]*color:\s*var\(--piyoyo-text\)/s);
  assert.match(html, /\.snippetDetailsText\s*\{(?=[^}]*color:\s*var\(--piyoyo-text\))(?=[^}]*font-size:\s*14px)(?=[^}]*line-height:\s*1\.8)[^}]*\}/s);
  assert.match(html, /\.snippetDetails\s*>\s*summary\s*\{(?=[^}]*color:\s*var\(--piyoyo-text\))(?=[^}]*font-size:\s*14px)[^}]*\}/s);
  assert.doesNotMatch(html, /\.snippetRow\.isSelected\s+\.snippetRowSummary\s*,\s*\.snippetRow\.isSelected\s+\.snippetRowPreview\s*\{[^}]*color:\s*var\(--piyoyo-orange\)/s);
});

test('webview escapes snippet metadata in compact labels and hover details', () => {
  const html = getWebviewHtml({
    snippets: [{
      id: 'custom-preview',
      category: 'custom',
      categoryLabel: '自作',
      description: '<説明>',
      input: '<入力>',
      returns: '&結果',
      precondition: '"前提"',
      label: 'value',
      body: 'value'
    }]
  });

  const rowIndex = html.indexOf('<div class="snippetRow" data-snippet-row="custom-preview"');

  assert.ok(rowIndex > -1);
  assert.match(html, /&lt;説明&gt;/);
  assert.match(html, /&lt;入力&gt;/);
  assert.match(html, /&amp;結果/);
  assert.match(html, /&quot;前提&quot;/);
  assert.match(html, /<button[^>]*data-snippet-entry="custom-preview"[^>]*data-snippet-id="custom-preview"/);
  assert.match(html, /data-snippet-tooltip="説明: &lt;説明&gt;\n入力: &lt;入力&gt;\n返り値: &amp;結果\n前提: &quot;前提&quot;"/);
  assert.match(html, /<span class="snippetRowSummary">[\s\S]*?&lt;説明&gt;[\s\S]*?<\/span>/);
  assert.doesNotMatch(html, /class="snippetSelection"/);
});

test('webview shows complexity in each row and updates grouped variants', () => {
  const html = getWebviewHtml({ snippets: [{
    id: 'complexity-example', category: 'custom', categoryLabel: 'テスト',
    summary: 'リストの先頭を削除して返す', label: 'A.pop(0)', body: 'A.pop(0)',
    complexity: { qualifier: '最悪', time: 'O(n)', detail: 'リストAの要素数をnとする。' }
  }] });
  const chip = html.match(/<button type="button" class="snippetComplexity"[^>]*>[^<]*<\/button>/)[0];
  assert.match(chip, />O\(n\)<\/button>$/);
  assert.match(chip, /data-complexity-full="最悪 O\(n\)"/);
  assert.match(chip, /data-complexity-detail="リストAの要素数をnとする。"/);
  assert.match(chip, /aria-expanded="false"/);
  assert.match(chip, /aria-controls="snippetComplexityPopover"/);
  // The chip is a sibling of the row button, never nested inside it.
  assert.match(html, /<\/code>\s*<\/button>\s*<button type="button" class="snippetComplexity"/);
  assert.match(html, /id="snippetComplexityPopover"[^>]*role="dialog"[^>]*hidden/);
  assert.match(html, /complexityChip\.textContent = complexity \? complexity\.short : ''/);
  assert.match(html, /complexityChip\.dataset\.complexityDetail = /);
  assert.match(html, /event\.key === 'Escape' && openComplexityChip/);
  assert.match(html, /function openComplexityPopover\(chip\)/);
  assert.doesNotMatch(html, /snippetEditorExpression/);

  const noComplexity = getWebviewHtml({ snippets: [{
    id: 'no-complexity', category: 'custom', categoryLabel: 'テスト', summary: '値', label: 'x', body: 'x'
  }] });
  assert.match(noComplexity, /class="snippetComplexity"[^>]*hidden><\/button>/);
});

test('complexity short form keeps compact notation and falls back to 詳細', () => {
  const cases = [
    ['O(1)', 'O(1)'],
    ['O(n)', 'O(n)'],
    ['O(log n)', 'O(log n)'],
    ['O(n log n)', 'O(n log n)'],
    ['O(n + k)', 'O(n + k)'],
    ['O(n × m)', 'O(mn)'],
    ['O(m*n)', 'O(mn)'],
    ['O(h × w)', 'O(hw)'],
    ['O(n × n!)', '詳細'],
    ['O(r × C(n,r))', '詳細'],
    ['O(log min(a, b))', '詳細'],
    ['入力長に依存', '詳細'],
    ['', ''],
    [undefined, '']
  ];
  for (const [time, expected] of cases) {
    assert.equal(getComplexityShortForm(time), expected, String(time));
  }

  for (const snippet of INPUT_SNIPPETS) {
    const short = getComplexityShortForm(snippet.complexity?.time);
    assert.ok(short === '詳細' || /^O\(.{1,8}\)$/.test(short), `${snippet.id}: ${short}`);
    assert.doesNotMatch(short, /最悪|平均|償却/);
  }
});

test('grouped rows carry short complexity and badges for every variant', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });
  const unescape = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const variants = Array.from(html.matchAll(/data-snippet-variants="([^"]*)"/g))
    .flatMap((match) => JSON.parse(unescape(match[1])));
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  for (const snippet of INPUT_SNIPPETS.filter((item) => item.selectorGroup)) {
    const variant = byId.get(snippet.id);
    assert.ok(variant, snippet.id);
    assert.equal(variant.complexity.short, getComplexityShortForm(snippet.complexity.time), snippet.id);
    assert.equal(variant.complexity.full, `${snippet.complexity.qualifier} ${snippet.complexity.time}`, snippet.id);
    assert.deepEqual(variant.badges.map((badge) => badge.type), [
      ...(snippet.helpers.length ? ['helper'] : []),
      ...(snippet.imports.length ? ['import'] : []),
      ...(snippet.externalPackages.length ? ['external'] : [])
    ], snippet.id);
    variant.badges.forEach((badge) => assert.equal(badge.shortText.length, 1));
  }
  assert.match(html, /element\.textContent = split \? badge\.shortText : badge\.text/);
  assert.match(html, /badgeCell\.classList\.toggle\('isSplit', split\)/);
});

function errorField(html) {
  return html.match(/<div id="stderrField".*$/m)[0];
}

test('webview friendly mode shows Japanese errors and folds the original behind 原文を見る', () => {
  for (const html of [getWebviewHtml(), getWebviewHtml({ errorDisplayMode: 'friendly' })]) {
    const field = errorField(html);
    assert.match(field, /id="stderrField"[^>]*data-error-display-mode="friendly"[^>]*hidden/);
    assert.match(field, /エラーの説明<\/span><pre id="errorExplanation"/);
    assert.match(field, /<details id="originalErrorDetails"[^>]*><summary>原文を見る<\/summary><pre id="stderr"/);
    assert.doesNotMatch(field, /<details[^>]*open/);
    assert.doesNotMatch(field, /originalErrorSection|errorExplanationDetails/);
  }
});

test('webview both mode shows the Japanese explanation and the original side by side', () => {
  const field = errorField(getWebviewHtml({ errorDisplayMode: 'both' }));
  assert.match(field, /data-error-display-mode="both"/);
  assert.ok(field.indexOf('id="errorExplanation"') < field.indexOf('id="stderr"'));
  assert.match(field, /<div id="originalErrorSection"[^>]*>.*<pre id="stderr"/);
  assert.doesNotMatch(field, /<details/);
});

test('webview original mode shows the original first and folds the explanation', () => {
  const field = errorField(getWebviewHtml({ errorDisplayMode: 'original' }));
  assert.match(field, /data-error-display-mode="original"/);
  assert.ok(field.indexOf('id="stderr"') < field.indexOf('id="errorExplanation"'));
  assert.match(field, /<details id="errorExplanationDetails"[^>]*><summary>日本語の説明を見る<\/summary><pre id="errorExplanation"/);
  assert.doesNotMatch(field, /originalErrorDetails/);
});

test('webview falls back to friendly mode for unknown display modes', () => {
  assert.match(getWebviewHtml({ errorDisplayMode: '<bad>' }), /data-error-display-mode="friendly"/);
});

test('webview always keeps the original stderr and applies the shared presentation rule', () => {
  const html = getWebviewHtml();
  assert.match(html, /stderrField\.hidden = true/);
  assert.match(html, /errorExplanation\.textContent = message\.errorExplanation/);
  assert.match(html, /stderr\.textContent = \[message\.errorMessage, message\.stderr\]\.filter\(Boolean\)\.join/);
  assert.match(html, /function getErrorPresentation\(/);
  assert.match(html, /stderrField\.hidden = !errorPresentation\.showField/);
  assert.match(html, /originalErrorContainer\.hidden = !errorPresentation\.showOriginal/);
  assert.match(html, /stdout\.textContent = message\.stdout \|\| ''/);
});

test('webview clears stale runtime details when a result has no runtime', () => {
  const html = getWebviewHtml();

  assert.match(html, /const safeRuntime = runtime \|\| \{\};/);
  assert.match(html, /runtimeVersion\.textContent = safeRuntime\.version \|\| \(safeRuntime\.errorMessage \? '取得できません' : ''\);/);
  assert.match(html, /runtimeExecutable\.textContent = safeRuntime\.executable \|\| '';/);
  assert.match(html, /runtimeLauncher\.textContent = safeRuntime\.launcher \|\| '';/);
  assert.doesNotMatch(html, /if \(!runtime\) \{\s*return;/s);
});

test('webview marks non-zero exit codes as abnormal completion', () => {
  const html = getWebviewHtml();

  assert.match(html, /else if \(message\.exitCode !== 0\) \{\s*status\.textContent = '異常終了';/s);
  assert.match(html, /status\.textContent = '異常終了';\s*status\.className = 'summaryValue toneError';/s);
  assert.match(html, /status\.textContent = '完了';\s*status\.className = 'summaryValue toneState';/s);
  assert.doesNotMatch(html, /runDetails\.open/);
});

test('webview restores the selected workspace and snippet category', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.match(html, /const viewState = vscode\.getState\(\) \|\| \{\}/);
  assert.match(html, /vscode\.setState\(viewState\)/);
  assert.match(html, /setWorkspace\(\['snippets', 'verify'\]\.includes\(viewState\.workspace\) \? viewState\.workspace : 'run'\);/);
  assert.match(html, /const defaultSnippetCategory = snippetCategoryPanels\[0\]\?\.dataset\.snippetCategoryPanel \|\| ''/);
  assert.match(html, /panel\.dataset\.snippetCategoryPanel === viewState\.snippetCategory/);
  assert.match(html, /setSnippetCategory\(storedSnippetCategory\)/);
  assert.match(html, /saveViewState\(\{ snippetCategory: panel\.dataset\.snippetCategoryPanel \}\)/);
  assert.match(html, /panel\.open = panel\.dataset\.snippetCategoryPanel === selectedCategory/);
  assert.doesNotMatch(html, /otherPanel\.open = false/);
  assert.match(html, /overflow-anchor:\s*none/);
  assert.match(html, /function rememberSnippetCategoryScrollPosition\(\)/);
  assert.match(html, /function restoreSnippetCategoryScrollPosition\(scrollTop\)/);
  assert.match(html, /snippetCategoryList\.scrollTop = scrollTop/);
  assert.match(html, /requestAnimationFrame\(restore\)/);
  assert.doesNotMatch(html, /setSnippetCategory\(panel\.dataset\.snippetCategoryPanel\)/);
  assert.doesNotMatch(html, /snippetMode/);
});

test('webview manages each code visibility and order inside Piyoyo', () => {
  const visibleSnippets = INPUT_SNIPPETS.filter((snippet) => snippet.id !== 'basic-int');
  const html = getWebviewHtml({
    snippets: visibleSnippets,
    preferenceSnippets: INPUT_SNIPPETS,
    snippetPreferences: {
      hiddenSnippetIds: ['basic-int'],
      order: INPUT_SNIPPETS.map((snippet) => snippet.id)
    },
    defaultSnippetOrder: INPUT_SNIPPETS.map((snippet) => snippet.id)
  });

  assert.match(html, /id="snippetPreferencesButton"[^>]*>コード整理<\/button>/);
  assert.match(html, /id="snippetPreferencesPanel"[^>]*hidden/);
  assert.match(html, /表示するコードと順番/);
  assert.equal((html.match(/data-snippet-preference-row=/g) || []).length, INPUT_SNIPPETS.length);
  assert.match(html, /data-snippet-preference-row="basic-int"[\s\S]*?data-snippet-preference-visible\b/);
  assert.match(html, /data-snippet-preference-row="basic-float"/);
  assert.doesNotMatch(html, /data-snippet-entry="basic-int"/);
  assert.match(html, /data-snippet-move="up"/);
  assert.match(html, /data-snippet-move="down"/);
  assert.match(html, /function setSnippetPreferencesOpen\(open\)/);
  assert.match(html, /function resetSnippetPreferencesToDefault\(\)/);
  assert.match(html, /type:\s*'saveSnippetPreferences'/);
  assert.match(html, /hiddenSnippetIds,/);
  assert.match(html, /order:\s*getSnippetPreferenceOrder\(\)/);
  assert.doesNotMatch(html, /openSnippetCategorySettings/);
  assert.doesNotMatch(html, /snippetCategoryVisibility/);
});

test('webview sends the selected snippet id for VS Code placeholder editing', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.match(html, /type:\s*'insertSnippet'/);
  assert.match(html, /snippetId,/);
  assert.doesNotMatch(html, /placeholderValues:/);
  assert.doesNotMatch(html, /snippetBody:/);
  assert.match(html, /id="snippetInsertButton"/);
  assert.match(html, /message\.type === 'snippetResult'/);
  assert.match(html, /id="snippetStatus"/);
  assert.match(html, /snippetStatus error/);
});

test('webview CSP blocks external and inline-unsafe capabilities', () => {
  const html = getWebviewHtml();

  assert.match(html, /default-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /frame-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /img-src 'none'/);
  assert.doesNotMatch(html, /unsafe-inline/);
  assert.doesNotMatch(html, /unsafe-eval/);
  assert.doesNotMatch(html, /https?:/);
});

function decodeAttribute(text) {
  return text.replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

test('every snippet has full-body preview tokens, including grouped alternatives', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });
  const metadata = new Map();
  for (const match of html.matchAll(/<button\b[^>]*data-snippet-entry=[^>]*>/g)) {
    const button = match[0];
    const variants = button.match(/data-snippet-variants="([^"]*)"/);
    if (variants) {
      for (const variant of JSON.parse(decodeAttribute(variants[1]))) {
        metadata.set(variant.id, JSON.parse(variant.codeParts));
      }
    } else {
      const id = decodeAttribute(button.match(/data-snippet-id="([^"]*)"/)[1]);
      const parts = JSON.parse(decodeAttribute(button.match(/data-snippet-code-parts="([^"]*)"/)[1]));
      metadata.set(id, parts);
    }
  }
  assert.equal(metadata.size, INPUT_SNIPPETS.length);
  for (const snippet of INPUT_SNIPPETS) {
    const preview = metadata.get(snippet.id)
      .map(part => Object.hasOwn(part, 'text') ? part.text : part.defaultValue).join('');
    const expected = snippet.body.replace(/\$\{\d+(?::([^}]*))?\}/g, (_, value = '') => value);
    assert.equal(preview, expected, snippet.id);
  }
});

test('preview tokens do not confuse equal defaults or replace unmarked literals', () => {
  const html = getWebviewHtml({ snippets: [{
    id: 'repeated-fields', category: 'custom', categoryLabel: 'テスト',
    label: '短い説明', body: 'f(${1:x}, ${2:x}, x, ${1:x})\nprint("<tag>")',
    precondition: '<script>unsafe</script>'
  }] });
  const encoded = html.match(/data-snippet-code-parts="([^"]*)"/)[1];
  assert.deepEqual(JSON.parse(decodeAttribute(encoded)), [
    { text: 'f(' }, { index: 1, defaultValue: 'x' }, { text: ', ' },
    { index: 2, defaultValue: 'x' }, { text: ', x, ' },
    { index: 1, defaultValue: 'x' }, { text: ')\nprint("<tag>")' }
  ]);
  assert.match(html, /data-snippet-precondition="&lt;script&gt;unsafe&lt;\/script&gt;"/);
  assert.match(html, /snippetWarning\.textContent/);
  assert.doesNotMatch(html, /getPlaceholderMatches/);
});

test('local black theme has semantic yellow, orange and red accents', () => {
  const html = getWebviewHtml();
  for (const [token, color] of [
    ['bg', '#090909'], ['text', '#f7f7f5'], ['yellow', '#ffd84d'],
    ['orange', '#ff9d45'], ['red', '#ff6b6b'], ['action-red', '#c43b32']
  ]) {
    assert.ok(html.includes(`--piyoyo-${token}: ${color};`));
  }
  assert.match(html, /body\s*\{[^}]*--vscode-editor-background:\s*var\(--piyoyo-bg\)/s);
  assert.match(html, /\.snippetWarning\s*\{[^}]*color:\s*var\(--piyoyo-red\)/s);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /forced-colors:\s*active/);
  assert.match(html, /snippetInsertionPending/);
  assert.doesNotMatch(html, /snippetEditorInput/);
});

test('generated webview script remains valid JavaScript', () => {
  for (const errorDisplayMode of ['friendly', 'both', 'original']) {
    const html = getWebviewHtml({ snippets: INPUT_SNIPPETS, errorDisplayMode });
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new Script(script));
  }
});

test('editable tokens stay distinct from fixed code and longer identifiers in prose', () => {
  const html = getWebviewHtml({ snippets: [{
    id: 'token-color-fixture', category: 'custom', categoryLabel: 'テスト',
    summary: 'リストxとfixed_xを見る',
    label: 'f(x, fixed_x, x, "<tag>")',
    body: 'f(${1:x}, fixed_x, x, "${2:<tag>}")'
  }] });
  const summary = html.match(/<span class="snippetRowSummary">([\s\S]*?)<\/span>\s*<code/)[1];
  assert.equal(summary, 'リスト<span class="snippetParameter">x</span>とfixed_xを見る');
  const preview = html.match(/<code[^>]*data-snippet-row-preview>([\s\S]*?)<\/code>/)[1];
  assert.equal(preview, 'f(<span class="snippetParameter">x</span>, fixed_x, x, &quot;<span class="snippetParameter">&lt;tag&gt;</span>&quot;)');
  assert.doesNotMatch(preview, /<tag>/);
});

test('variant switching carries annotated preview data for every alternative', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });
  for (const match of html.matchAll(/data-snippet-variants="([^"]*)"/g)) {
    for (const variant of JSON.parse(decodeAttribute(match[1]))) {
      assert.ok(Array.isArray(variant.previewParts), variant.id);
      assert.equal(variant.previewParts.map(part => part.text ?? part.defaultValue).join(''), variant.label);
    }
  }
  assert.match(html, /snippetPreviewParts: JSON\.stringify\(selectedVariant\.previewParts/);
  assert.match(html, /parameter\.className = 'snippetParameter'/);
  assert.doesNotMatch(html, /rowPreview\.textContent = source\.dataset\.snippetLabel/);
});

test('webview header has a gear button outside the tab list that opens settings', () => {
  const html = getWebviewHtml();
  const tablistEnd = html.indexOf('</nav>');
  const gearIndex = html.indexOf('id="openSettingsButton"');

  assert.ok(gearIndex > tablistEnd);
  assert.ok(gearIndex < html.indexOf('id="runWorkspace"'));
  assert.match(html, /id="openSettingsButton"[^>]*data-open-settings[^>]*aria-label="Piyoyoの設定を開く"/);
  assert.doesNotMatch(html, /id="openSettingsButton"[^>]*(?:role="tab"|data-workspace)/);
  assert.match(html, /querySelectorAll\('\[data-open-settings\]'\)/);
  assert.match(html, /vscode\.postMessage\(\{ type: 'openSettings' \}\)/);
});

test('webview links the error display and launcher settings to the settings page', () => {
  for (const mode of ['friendly', 'both', 'original']) {
    const html = getWebviewHtml({ errorDisplayMode: mode });
    const field = html.slice(html.indexOf('id="stderrField"'), html.indexOf('id="runDetails"'));
    assert.match(field, /<button[^>]*data-open-settings[^>]*>エラーの表示方法を設定で変える<\/button>/, mode);
  }
  const html = getWebviewHtml();
  const launcher = html.slice(html.indexOf('class="launcher runSection"'));
  assert.match(launcher, /<button[^>]*data-open-settings[^>]*>「設定値」と制限時間を設定で変える<\/button>/);
});

function rowHtml(html, id) {
  const start = html.indexOf(`data-snippet-row="${id}"`);
  assert.ok(start > -1, id);
  return html.slice(start, html.indexOf('</div>', start));
}

test('snippet rows show a left badge cell for helpers and imports, but not for built-ins', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });
  const single = INPUT_SNIPPETS.filter((snippet) => !snippet.selectorGroup);

  const helperSnippet = single.find((snippet) => snippet.helpers.length > 0 && snippet.imports.length === 0);
  assert.ok(helperSnippet);
  const helperRow = rowHtml(html, helperSnippet.id);
  assert.match(helperRow, /<span class="snippetBadgeCell" data-snippet-badges><span class="snippetBadge snippetBadge-helper" role="img" aria-label="自作関数: [^"]+" title="自作関数: [^"]+">自作<\/span><\/span>/);
  assert.doesNotMatch(helperRow, /snippetBadge-import/);

  const importSnippet = single.find((snippet) => snippet.imports.length > 0 && snippet.helpers.length === 0);
  assert.ok(importSnippet);
  const importRow = rowHtml(html, importSnippet.id);
  assert.match(importRow, /<span class="snippetBadge snippetBadge-import" role="img" aria-label="輸入（importが必要）: [^"]+"[^>]*>輸入<\/span>/);
  assert.doesNotMatch(importRow, /snippetBadge-helper/);
  assert.doesNotMatch(importRow, />import<\/span>/);

  // Badge cell comes first, then summary and code; the empty cell keeps alignment.
  const builtInSnippet = single.find((snippet) => snippet.imports.length === 0 && snippet.helpers.length === 0);
  assert.ok(builtInSnippet);
  const builtInRow = rowHtml(html, builtInSnippet.id);
  assert.match(builtInRow, /<button[^>]*>\s*<span class="snippetBadgeCell" data-snippet-badges><\/span>\s*<span class="snippetRowSummary">[\s\S]*<\/span>\s*<code class="snippetRowPreview"/);

  assert.doesNotMatch(html, /class="snippetBadge snippetBadge-external"/);
  assert.doesNotMatch(html, /badgeList/);
  assert.match(html, /badgeCell\.replaceChildren\(/);
  const helperEntries = getWebviewHtml({ snippets: single });
  assert.equal(
    (helperEntries.match(/role="img" aria-label="自作関数/g) || []).length,
    single.filter((snippet) => snippet.helpers.length > 0).length
  );
});

test('a snippet with two badge types splits the cell into one kanji each', () => {
  const html = getWebviewHtml({ snippets: [{
    id: 'both-example', category: 'custom', categoryLabel: 'テスト', summary: '両方', label: 'f(A)', body: 'f(${1:A})',
    imports: ['from math import gcd'], helpers: [{ name: 'f', code: 'def f(A):\n    return A' }]
  }] });
  const row = rowHtml(html, 'both-example');
  assert.match(row, /<span class="snippetBadgeCell isSplit" data-snippet-badges><span class="snippetBadge snippetBadge-helper" role="img" aria-label="自作関数: [^"]+"[^>]*>自<\/span><span class="snippetBadge snippetBadge-import" role="img" aria-label="輸入（importが必要）: [^"]+"[^>]*>輸<\/span><\/span>/);
});

test('badge legend explains only the badge types in use and is not a snippet entry', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });
  const legend = html.slice(html.indexOf('<details id="snippetBadgeLegend"'), html.indexOf('</details>', html.indexOf('id="snippetBadgeLegend"')));

  assert.match(legend, /<summary>アイコンの見方<\/summary>/);
  assert.match(legend, /snippetBadge-helper" aria-hidden="true">自作<\/span><\/span><span>自作関数: /);
  assert.match(legend, /snippetBadge-import" aria-hidden="true">輸入<\/span><\/span><span>輸入（importが必要）: /);
  assert.match(legend, /class="snippetBadgeCell isSplit" aria-hidden="true">[^]*?>自<\/span>[^]*?>輸<\/span><\/span><span>2種類に当てはまる項目は/);
  assert.match(legend, /class="snippetBadgeLegendNote">[^<]*「詳細」/);
  assert.doesNotMatch(legend, />import<\/span>/);
  assert.doesNotMatch(legend, /snippetBadge-external/);
  assert.doesNotMatch(legend, /data-snippet/);
  assert.ok(html.indexOf('id="snippetBadgeLegend"') < html.indexOf('id="snippetBrowsePanel"'));

  const withExternal = getWebviewHtml({ snippets: [{
    id: 'external-example', category: 'custom', categoryLabel: 'テスト', summary: 'np配列', label: 'np.array(A)',
    body: 'np.array(${1:A})', externalPackages: ['numpy']
  }] });
  assert.match(withExternal, /class="snippetBadge snippetBadge-external" role="img" aria-label="外部ライブラリが必要: [^"]+"[^>]*>外部<\/span>/);
  assert.doesNotMatch(withExternal, /class="snippetBadgeCell isSplit"/);

  assert.doesNotMatch(getWebviewHtml({ snippets: [] }), /id="snippetBadgeLegend"/);
});

test('badges differ by color, border style and text, are vertical, and survive forced colors', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.match(html, /\.snippetBadge\s*\{(?=[^}]*writing-mode:\s*vertical-rl)(?=[^}]*text-orientation:\s*upright)[^}]*\}/s);
  assert.match(html, /\.snippetBadgeCell\s*\{(?=[^}]*grid-row:\s*1 \/ span 2)(?=[^}]*flex-direction:\s*column)[^}]*\}/s);
  assert.match(html, /\.snippetBadge-helper\s*\{(?=[^}]*background:\s*var\(--vscode-charts-yellow\))[^}]*\}/s);
  assert.match(html, /\.snippetBadge-import\s*\{(?=[^}]*border:\s*1px solid var\(--piyoyo-orange\))(?=[^}]*background:\s*transparent)(?=[^}]*color:\s*var\(--piyoyo-orange\))[^}]*\}/s);
  assert.match(html, /\.snippetBadge-external\s*\{[^}]*border:\s*1px dashed var\(--vscode-errorForeground\)/s);
  assert.match(html, /@media \(forced-colors: active\)[\s\S]*\.snippetBadge\s*\{[^}]*border-color:\s*CanvasText/);
  assert.match(html, /@media \(forced-colors: active\)[\s\S]*\.snippetBadge-helper\s*\{[^}]*background:\s*CanvasText/);
});

test('snippet row is a two-line card with a fixed complexity column', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.match(html, /\.snippetChoice\s*\{[^}]*grid-template-columns:\s*var\(--snippet-badge-width\) minmax\(0, 1fr\) var\(--snippet-complexity-width\)/s);
  assert.match(html, /\.snippetRowSummary\s*\{[^}]*grid-column:\s*2 \/ 4/s);
  assert.match(html, /\.snippetRowPreview\s*\{(?=[^}]*grid-row:\s*2)(?=[^}]*text-align:\s*left)[^}]*\}/s);
  assert.match(html, /\.snippetComplexity\s*\{(?=[^}]*position:\s*absolute)(?=[^}]*width:\s*var\(--snippet-complexity-width\))[^}]*\}/s);
  assert.match(html, /\.snippetComplexityPopover\s*\{[^}]*width:\s*min\(260px, calc\(100vw - 16px\)\)/s);
  assert.doesNotMatch(html, /snippetRowMeta/);
});

test('webview text is never smaller than 12px and scales with the VS Code font size', () => {
  const html = getWebviewHtml({ snippets: INPUT_SNIPPETS });

  assert.doesNotMatch(html, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/);
  assert.match(html, /--piyoyo-font-base:\s*max\(13px, var\(--vscode-font-size, 13px\)\)/);
  assert.match(html, /--piyoyo-font-small:\s*max\(12px, calc\(var\(--piyoyo-font-base\) - 1px\)\)/);
  assert.match(html, /\.snippetRowSummary\s*\{[^}]*font-size:\s*var\(--piyoyo-font-base\)/s);
  assert.match(html, /\.snippetRowPreview\s*\{[^}]*font-size:\s*var\(--piyoyo-font-small\)/s);
  assert.match(html, /\.snippetBadge\s*\{[^}]*font-size:\s*var\(--piyoyo-font-small\)/s);
  assert.match(html, /\.snippetComplexityPopover\s*\{[^}]*font-size:\s*var\(--piyoyo-font-small\)/s);
});

const KEYBOARD_TEST_SNIPPETS = [
  {
    id: 'keyboard-a', category: 'custom', categoryLabel: 'テスト', summary: '先頭', label: 'A[0]', body: 'A[0]',
    complexity: { time: 'O(1)', detail: '' }
  },
  { id: 'keyboard-b', category: 'custom', categoryLabel: 'テスト', summary: '末尾', label: 'A[-1]', body: 'A[-1]' }
];

test('run button shows the save-and-run shortcut for each platform', () => {
  const html = getWebviewHtml();
  assert.match(html, /id="runButton"[^>]*title="実行 \(Ctrl\+Enter で保存して実行\)"/);
  assert.match(html, /id="runButton"[^>]*aria-keyshortcuts="Control\+Enter"/);
  assert.match(html, /id="runButton"[^>]*>実行<span class="shortcutHint">\(Ctrl\+Enter\)<\/span><\/button>/);

  const mac = getWebviewHtml({ runShortcutLabel: 'Cmd+Enter' });
  assert.match(mac, /id="runButton"[^>]*aria-keyshortcuts="Meta\+Enter"/);
  assert.match(mac, /class="shortcutHint">\(Cmd\+Enter\)</);
  assert.match(mac, /id="snippetSearchInput"[^>]*aria-keyshortcuts="\/ Meta\+F"/);
});

test('webview runs with Ctrl+Enter anywhere and asks the extension to save first', () => {
  const html = getWebviewHtml();
  assert.match(html, /function isRunShortcut\(event\)/);
  assert.match(html, /function startRun\(\{ saveFirst = false \} = \{\}\)/);
  assert.match(html, /if \(runButton\.disabled\) \{\s*return;\s*\}/);
  assert.match(html, /runButton\.addEventListener\('click', \(\) => startRun\(\)\)/);
  assert.match(html, /if \(isRunShortcut\(event\)\) \{\s*event\.preventDefault\(\);\s*startRun\(\{ saveFirst: true \}\);/);
  assert.match(html, /pythonPath: selectedPythonPath,\s*saveFirst\s*\}/);
  assert.match(html, /message\.type === 'requestRun'\) \{\s*startRun\(\);/);
  assert.match(html, /vscode\.postMessage\(\{ type: 'ready' \}\);\s*<\/script>/);
});

test('workspace tabs follow the tablist pattern with arrow keys', () => {
  const html = getWebviewHtml();
  assert.match(html, /id="runWorkspaceTab"[^>]*role="tab"[^>]*tabindex="0"/);
  assert.match(html, /id="snippetWorkspaceTab"[^>]*role="tab"[^>]*tabindex="-1"/);
  assert.match(html, /id="verifyWorkspaceTab"[^>]*role="tab"[^>]*aria-selected="false"[^>]*aria-controls="verifyWorkspace"[^>]*tabindex="-1"/);
  assert.match(html, /tab\.tabIndex = isSelected \? 0 : -1;/);
  assert.match(html, /getNextIndex\(tabs\.indexOf\(tab\), tabs\.length, event\.key, 'horizontal'\)/);
  assert.match(html, /setWorkspace\(tabs\[nextIndex\]\.dataset\.workspace\);\s*tabs\[nextIndex\]\.focus\(\);/);
});

test('workspace tabs advertise their digit alias, and the titles explain the relative Shift+←→ switch', () => {
  const tabs = [
    ['runWorkspaceTab', '実行', '1'],
    ['snippetWorkspaceTab', 'コード挿入', '2'],
    ['verifyWorkspaceTab', '検証', '3']
  ];
  const html = getWebviewHtml();
  const mac = getWebviewHtml({ platform: 'darwin' });
  for (const [id, label, digit] of tabs) {
    assert.match(
      html,
      new RegExp(`id="${id}"[^>]*title="${label} \\(Alt\\+${digit}\\)。Shift\\+←→で隣のタブへ移ります。文字の入力欄の中では、文字を選んでおらずカーソルが端にあるときに切り替わります（標準入力の欄ではいつでも切り替わります）"[^>]*aria-keyshortcuts="Alt\\+${digit}"`),
      id
    );
    // macOS shows Option in the title; aria-keyshortcuts keeps the DOM key name Alt.
    assert.match(
      mac,
      new RegExp(`id="${id}"[^>]*title="${label} \\(Option\\+${digit}\\)。Shift\\+←→で隣のタブへ移ります。[^"]*"[^>]*aria-keyshortcuts="Alt\\+${digit}"`),
      id
    );
  }
  // Shift+Arrow depends on the current tab, so no tab advertises it as its own shortcut.
  assert.doesNotMatch(html, /aria-keyshortcuts="[^"]*Shift/);
  assert.doesNotMatch(html, /Alt\+Arrow|Alt\+←|isMacPlatform/);
});

test('Shift+Left / Shift+Right switch to the neighbouring workspace and Alt+1 / Alt+2 / Alt+3 jump from anywhere', () => {
  const html = getWebviewHtml();
  assert.match(html, /function getWorkspaceShortcutTarget\(event, \{ allowArrows = true, currentWorkspace = 'run' \} = \{\}\)/);
  assert.match(html, /function isTextEntryTarget\(element\)/);
  // Inside text fields Shift+Arrow only switches at the caret edge; otherwise it selects text.
  // The stdin box switches from any caret position.
  assert.match(html, /function getTextFieldEdgeWorkspaceTarget\(event, field, currentWorkspace, \{ anywhere = false \} = \{\}\)/);
  assert.match(html, /const inTextField = isTextEntryTarget\(event\.target\);\s*const shortcutWorkspace = getWorkspaceShortcutTarget\(event, \{\s*allowArrows: !inTextField,\s*currentWorkspace: viewState\.workspace\s*\}\)\s*\|\| \(inTextField\s*\? getTextFieldEdgeWorkspaceTarget\(event, event\.target, viewState\.workspace, \{ anywhere: event\.target === stdin \}\)\s*: ''\);\s*if \(shortcutWorkspace\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?setWorkspace\(shortcutWorkspace, \{ focusPanel: true, avoidTextEntry: event\.shiftKey \}\);/);
  // Esc in stdin moves to the run tab without stopping the event for VS Code.
  assert.match(html, /stdin\.addEventListener\('keydown', \(event\) => \{\s*if \(event\.key !== 'Escape' \|\| isImeComposing\(event\)[\s\S]*?event\.preventDefault\(\);\s*document\.getElementById\('runWorkspaceTab'\)\.focus\(\);\s*\}\);/);
  assert.doesNotMatch(html, /stdin\.addEventListener\('keydown'[^}]*stopPropagation/);
  // After a Shift+Arrow switch focus lands on the tab instead of a text field.
  assert.match(html, /if \(avoidTextEntry && isTextEntryTarget\(target\)\) \{\s*return Array\.from\(workspaceTabs\)\.find\(\(tab\) => tab\.dataset\.workspace === workspace\) \|\| target;/);
  // Tab buttons leave Shift+Arrow to the global handler.
  assert.match(html, /if \(nextIndex < 0 \|\| event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey \|\| event\.shiftKey\) \{/);
  // Same as Alt+I: stopping the event would leave VS Code with a lone Alt press.
  assert.doesNotMatch(html, /if \(shortcutWorkspace\) \{[^}]*stopPropagation/);
  // Mouse clicks keep focus on the tab.
  assert.match(html, /tab\.addEventListener\('click', \(\) => setWorkspace\(tab\.dataset\.workspace\)\);/);
});

test('shortcut hint bar sits above the tabs and follows the platform and input focus setting', () => {
  const html = getWebviewHtml();
  assert.match(html, /<main class="runner">\s*<div class="shortcutHintBar"[\s\S]*?<\/div>\s*<div class="workspaceHeader">/);
  assert.match(html, /<kbd id="inputFocusHintKey">Alt\+I<\/kbd>: エディタ⇄パネル/);
  assert.match(html, /<span class="shortcutHintItem" title="Shift\+←→でタブを切り替えます。文字の入力欄の中では[^"]*カーソルが左端ならShift\+←、右端ならShift\+→で切り替わります。[^"]*標準入力の欄では、カーソルの位置にかかわらずShift\+←→で切り替わります。Escでタブへ移動することもできます"><kbd>Shift\+←→<\/kbd>: タブ切替<\/span>/);
  assert.match(html, /<kbd>Ctrl\+Enter<\/kbd>: 保存して実行/);
  assert.match(html, /\.shortcutHintBar\s*\{(?=[^}]*flex-wrap:\s*wrap;)(?=[^}]*font-size:\s*var\(--piyoyo-font-small\);)[^}]*\}/s);
  assert.match(html, /\.shortcutHintItem\s*\{[^}]*white-space:\s*nowrap;/s);

  const mac = getWebviewHtml({
    platform: 'darwin',
    runShortcutLabel: 'Cmd+Enter',
    inputFocusShortcut: { mode: 'both', label: 'Option+I / Shift 2回' }
  });
  assert.match(mac, /<kbd id="inputFocusHintKey">Option\+I \/ Shift 2回<\/kbd>/);
  assert.match(mac, /<kbd>Shift\+←→<\/kbd>: タブ切替/);
  assert.match(mac, /<kbd>Cmd\+Enter<\/kbd>: 保存して実行/);

  const shift = getWebviewHtml({ inputFocusShortcut: { mode: 'shiftShift', label: 'Shift 2回' } });
  assert.match(shift, /<kbd id="inputFocusHintKey">Shift 2回<\/kbd>/);
  assert.match(html, /stdin\.title = getStdinTitle\(message\.label\);\s*inputFocusHintKey\.textContent = message\.label;/);
});

test('snippet detail area puts the insert button first and grows before scrolling', () => {
  const html = getWebviewHtml();
  assert.match(html, /<div class="snippetInsertFooter">\s*<div class="snippetInsertActions">\s*<button id="snippetInsertButton"[^>]*aria-label="コードを挿入 \(Enter\)"[^>]*><span>コードを挿入<\/span><kbd class="snippetInsertKey" aria-hidden="true">Enter<\/kbd><\/button>\s*<span id="snippetStatus"/);
  assert.match(html, /\.snippetInsertKey\s*\{[^}]*font-size:\s*var\(--piyoyo-font-small\);/s);
  assert.match(html, /\.snippetInsertFooter\s*\{[^}]*max-height:\s*min\(45vh, max\(30vh, 100vh - 300px\)\);/s);
  assert.match(html, /\.snippetInsertActions\s*\{(?=[^}]*position:\s*sticky;)(?=[^}]*top:\s*0;)[^}]*\}/s);
  assert.doesNotMatch(html, /min\(30vh, 170px\)/);
});

test('hiding a workspace that holds focus moves focus into the shown panel', () => {
  const html = getWebviewHtml();
  assert.match(html, /panel\.addEventListener\('focusin', \(event\) => \{\s*lastFocusedInWorkspace\[panel\.dataset\.workspacePanel\] = event\.target;/);
  assert.match(html, /element\.isConnected && !element\.disabled\s*&& element\.getClientRects\(\)\.length > 0/);
  assert.match(html, /return snippetPreferencesOpen \? snippetPreferencesSearchInput : snippetSearchInput;\s*\}\s*if \(workspace === 'verify'\) \{\s*return document\.getElementById\('verifyProblemUrl'\);\s*\}\s*return stdin;/);
  assert.match(html, /const target = canRestoreFocus\(remembered\) \? remembered : getDefaultWorkspaceFocusTarget\(workspace\);/);
  // Focus is checked before the panel is hidden, and only while the webview itself has focus.
  assert.match(html, /const focusWillBeHidden = document\.hasFocus\(\) && Array\.from\(workspacePanels\)\.some\(\s*\(panel\) => panel\.dataset\.workspacePanel !== workspace && panel\.contains\(activeElement\)\s*\);[\s\S]*?panel\.hidden = panel\.dataset\.workspacePanel !== workspace;[\s\S]*?if \(focusPanel \|\| focusWillBeHidden\) \{\s*getWorkspaceFocusTarget\(workspace, \{ avoidTextEntry \}\)\.focus\(\);/);
});

test('snippet list uses roving focus, Enter inserts, and chips are reached with arrows', () => {
  const html = getWebviewHtml({ snippets: KEYBOARD_TEST_SNIPPETS });
  assert.match(html, /function getNavigableSnippetEntries\(\)/);
  assert.match(html, /function updateSnippetRovingTabStop\(preferredItem\)/);
  assert.match(html, /entry\.tabIndex = isTabStop \? 0 : -1;/);
  assert.match(html, /chip\.tabIndex = isTabStop \? 0 : -1;/);
  assert.match(html, /class="snippetComplexity" tabindex="-1"/);
  assert.match(html, /getNextIndex\(items\.indexOf\(fromItem\), items\.length, key, 'vertical'\)/);
  assert.match(html, /event\.key === 'Enter'\) \{[^}]*event\.preventDefault\(\);\s*selectSnippet\(entry\);\s*confirmSnippet\(entry\);/);
  assert.match(html, /event\.key === 'ArrowRight'\)[\s\S]*?chip\.focus\(\);/);
  assert.match(html, /event\.key === 'ArrowLeft'\)[\s\S]*?entry\.focus\(\);/);
  // Roving updates are wired to filtering, category toggles, selection and startup.
  assert.ok((html.match(/updateSnippetRovingTabStop\(/g) || []).length >= 5);
});

test('snippet category headers join the arrow-key sequence and the single Tab stop', () => {
  const html = getWebviewHtml({ snippets: KEYBOARD_TEST_SNIPPETS });
  assert.match(html, /function getDisclosureArrowAction\(event, isOpen\)/);
  // Headers of shown categories plus rows of open categories, in document order.
  assert.match(html, /function getNavigableSnippetItems\(\) \{[\s\S]*?'\[data-snippet-category-panel\] > summary, \[data-snippet-entry\]'[\s\S]*?item\.matches\('summary'\) \? !item\.parentElement\.hidden : entries\.includes\(item\)/);
  assert.match(html, /summary\.tabIndex = summary === tabStop \? 0 : -1;/);
  assert.match(html, /summary\.addEventListener\('focus', \(\) => updateSnippetRovingTabStop\(summary\)\);/);
  // Enter / Space keep the native toggle; Left / Right collapse / expand; Up / Down move.
  assert.match(html, /if \(event\.key === 'Enter' \|\| event\.key === ' '\) \{\s*rememberSnippetCategoryScrollPosition\(\);\s*return;\s*\}/);
  assert.match(html, /const disclosure = getDisclosureArrowAction\(event, panel\.open\);\s*if \(disclosure\) \{\s*event\.preventDefault\(\);\s*rememberSnippetCategoryScrollPosition\(\);\s*panel\.open = disclosure === 'open';/);
  assert.match(html, /if \(moveSnippetFocus\(summary, event\.key\)\) \{\s*event\.preventDefault\(\);/);
  // Moving onto a header does not change the selected snippet.
  assert.match(html, /function focusSnippetItem\(item\) \{\s*if \(item\.matches\('summary'\)\) \{\s*updateSnippetRovingTabStop\(item\);\s*item\.focus\(\);/);
});

test('organize mode moves between category headers and visibility switches with arrows', () => {
  const html = getWebviewHtml({ snippets: KEYBOARD_TEST_SNIPPETS });
  assert.match(html, /function getNavigablePreferenceItems\(\) \{[\s\S]*?'\[data-snippet-preference-category-panel\] > summary, \[data-snippet-preference-visible\]'/);
  assert.match(html, /getNextIndex\(items\.indexOf\(fromItem\), items\.length, event\.key, 'vertical'\)/);
  assert.match(html, /checkbox\.addEventListener\('keydown', \(event\) => movePreferenceFocus\(checkbox, event\)\);/);
  assert.match(html, /movePreferenceFocus\(summary, event\);/);
});

test('snippet search is reachable with / or Ctrl+F and Escape stays consistent', () => {
  const html = getWebviewHtml({ snippets: KEYBOARD_TEST_SNIPPETS });
  assert.match(html, /function isSearchShortcut\(event, targetIsEditable\)/);
  assert.match(html, /isSearchShortcut\(event, isEditableTarget\(event\.target\)\)/);
  assert.match(html, /function focusSnippetSearch\(\) \{\s*setWorkspace\('snippets'\);/);
  assert.match(html, /id="snippetSearchInput"[^>]*aria-keyshortcuts="\/ Control\+F"/);
  // ArrowDown or Enter in the search box jumps to the first match without inserting.
  assert.match(html, /event\.key === 'ArrowDown' \|\| event\.key === 'Enter'\)\) \{[\s\S]*?const firstItem = getNavigableSnippetEntries\(\)\[0\] \|\| getNavigableSnippetItems\(\)\[0\];[\s\S]*?focusSnippetItem\(firstItem\);/);
  assert.match(html, /event\.key === 'Escape' && snippetSearchInput\.value\) \{\s*event\.preventDefault\(\);\s*clearSnippetSearch\(\);\s*snippetSearchInput\.focus\(\);/);
  // The popover handler still runs first, in the capture phase.
  assert.match(html, /event\.key === 'Escape' && openComplexityChip[\s\S]*?\}, true\);/);
  assert.match(html, /一覧から使いたいコードを選んでください（↑↓ で移動、Enter で挿入）。/);
});

test('webview Enter handlers ignore IME composition', () => {
  const html = getWebviewHtml({ snippets: KEYBOARD_TEST_SNIPPETS });
  assert.match(html, /function isImeComposing\(event\)/);
  assert.ok((html.match(/if \(isImeComposing\(event\)/g) || []).length >= 3);
});

test('snippet rows and category headers keep a visible focus ring inside the scroll area', () => {
  const html = getWebviewHtml({ snippets: KEYBOARD_TEST_SNIPPETS });
  assert.match(html, /\.snippetCategoryDropdown > summary:focus-visible,\s*\.snippetChoice:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--vscode-focusBorder\);[^}]*outline-offset:\s*-2px;/s);
  assert.match(html, /button:focus-visible,\s*summary:focus-visible,\s*select:focus-visible,\s*input:focus-visible,\s*textarea:focus-visible\s*\{/);
});

test('stdin hints at the input focus shortcut and follows setting updates', () => {
  const html = getWebviewHtml();
  assert.match(html, /id="stdin"[^>]*placeholder="ここに複数行の入力を貼り付け（Alt\+I でエディタと行き来）"/);
  assert.match(html, /id="stdin"[^>]*title="Alt\+I でPythonのエディタと行き来できます"/);
  assert.match(html, /let inputFocusMode = "altI";/);

  const shift = getWebviewHtml({ inputFocusShortcut: { mode: 'shiftShift', label: 'Shift 2回' } });
  assert.match(shift, /placeholder="ここに複数行の入力を貼り付け（Shift 2回 でエディタと行き来）"/);
  assert.match(shift, /let inputFocusMode = "shiftShift";/);

  const unknown = getWebviewHtml({ inputFocusShortcut: { mode: 'bogus', label: 'Alt+I' } });
  assert.match(unknown, /let inputFocusMode = "altI";/);

  assert.match(html, /message\.type === 'inputFocusShortcut'\) \{\s*inputFocusMode = message\.mode;\s*stdin\.placeholder = getStdinPlaceholder\(message\.label\);/);
});

test('webview restores the last open tab on request and returns to the editor with Alt+I or Shift twice', () => {
  const html = getWebviewHtml();
  assert.match(html, /function isInputFocusShortcut\(event\)/);
  assert.match(html, /function createShiftDoubleTapDetector\(intervalMs\)/);
  assert.match(html, /const shiftDoubleTap = createShiftDoubleTapDetector\(400\);/);
  assert.match(html, /function focusLastWorkspace\(\) \{\s*if \(viewState\.workspace === 'snippets' \|\| viewState\.workspace === 'verify'\) \{\s*setWorkspace\(viewState\.workspace, \{ focusPanel: true \}\);\s*return;\s*\}\s*setWorkspace\('run'\);\s*stdin\.focus\(\);/);
  assert.match(html, /message\.type === 'focusStdin'\) \{\s*focusLastWorkspace\(\);/);
  // Save-and-run still switches to the run tab.
  assert.match(html, /function startRun\(\{ saveFirst = false \} = \{\}\) \{[\s\S]*?setWorkspace\('run'\);/);
  assert.match(html, /allowsAltI\(\) && isInputFocusShortcut\(event\)\) \{[\s\S]*?event\.preventDefault\(\);\s*vscode\.postMessage\(\{ type: 'focusEditor' \}\);/);
  // The key must reach VS Code so Alt is not seen as a lone press (menu bar focus).
  assert.doesNotMatch(html, /isInputFocusShortcut\(event\)\) \{[^}]*stopPropagation/);
  assert.match(html, /shiftDoubleTap\.handleKeyDown\(event\);\s*\}, true\);/);
  assert.match(html, /shiftDoubleTap\.handleKeyUp\(event, event\.timeStamp\) && allowsShiftShift\(\)\) \{\s*vscode\.postMessage\(\{ type: 'focusEditor' \}\);\s*\}\s*\}, true\);/);
  assert.match(html, /return inputFocusMode !== 'shiftShift';/);
  assert.match(html, /return inputFocusMode !== 'altI';/);
  assert.match(html, /window\.addEventListener\('focus', postFocusState\);\s*window\.addEventListener\('blur', postFocusState\);/);
  assert.match(html, /vscode\.postMessage\(\{ type: 'focusState', focused: document\.hasFocus\(\) \}\);/);
});

const { initVerifyWorkspace } = require('../src/verify/verifyWebview');

// The element with the id, up to its matching closing tag (same-name tags may nest).
function elementHtml(html, id) {
  const open = html.match(new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\sid="${id}"[^>]*>`));
  assert.ok(open, id);
  const pattern = new RegExp(`<(/?)${open[1]}\\b[^>]*>`, 'g');
  pattern.lastIndex = open.index;
  let depth = 0;
  let match;
  while ((match = pattern.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      return html.slice(open.index, match.index + match[0].length);
    }
  }
  return assert.fail(`${id} is not closed`);
}

function verifyPanelHtml(html) {
  assert.ok(html.includes('<section id="verifyWorkspace"'));
  // The panel contains the nested 計算量 <section>, so cut at its own closing tag.
  return elementHtml(html, 'verifyWorkspace');
}

function openingTag(html, id) {
  const match = html.match(new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(match, id);
  return match[0];
}

test('webview has no inline style attributes, which the CSP would block', () => {
  for (const errorDisplayMode of ['friendly', 'both', 'original']) {
    const html = getWebviewHtml({ snippets: INPUT_SNIPPETS, errorDisplayMode });
    assert.doesNotMatch(html, /\sstyle\s*=/i, errorDisplayMode);
  }
});

test('verify workspace controls exist with accessible names', () => {
  const panel = verifyPanelHtml(getWebviewHtml());

  for (const id of ['verifyProblemUrl', 'verifyIterations', 'verifyCompareMode', 'verifySeed']) {
    openingTag(panel, id);
    assert.match(panel, new RegExp(`<label for="${id}"(?: title="[^"]+")?>[^<]+</label>`), id);
  }
  assert.match(openingTag(panel, 'verifyProblemUrl'), /<input\b[^>]*type="url"/);
  // Short label with the explanation in its title; the URL and the fetch button share one line.
  assert.match(panel, /<label for="verifyProblemUrl" title="[^"]+">問題の URL<\/label>/);
  assert.match(panel, /<div class="verifyInline">\s*<input id="verifyProblemUrl"[^>]*>\s*<button id="verifyFetchProblem" class="verifySmallButton" type="button">読み取る<\/button>\s*<\/div>/);
  assert.match(panel, /<div class="verifyButtons">\s*<button id="verifyUndoImport"[^>]*hidden>[^<]+<\/button>\s*<\/div>/);
  assert.match(openingTag(panel, 'verifyProblemText'), /<textarea\b[^>]*aria-label="[^"]+"/);
  assert.match(openingTag(panel, 'verifyAddRowKind'), /<select\b[^>]*aria-label="[^"]+"/);
  for (const id of ['verifyFetchProblem', 'verifyAddRow', 'verifyStart', 'verifyCancel', 'verifyRecheck', 'verifyRegenerate']) {
    assert.match(panel, new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*type="button"[^>]*>[^<]*\\S[^<]*</button>`), id);
  }

  const compareMode = panel.match(/<select id="verifyCompareMode"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual(
    Array.from(compareMode.matchAll(/<option value="([^"]+)">[^<]+<\/option>/g), (match) => match[1]),
    ['tokens', 'exact', 'float']
  );

  const sections = panel.match(/<(?:details|section)\b[^>]*class="verifySection(?: [^"]*)?"[^>]*>/g) || [];
  const idOf = (tag) => tag.match(/id="([^"]+)"/)[1];
  assert.deepEqual(
    sections.map(idOf),
    ['verifyFormatSection', 'complexitySection', 'verifyStressSection', 'verifyCounterSection']
  );
  // 計算量 is a plain section; the other three stay open collapsible sections.
  assert.match(sections[1], /^<section\b/);
  const collapsible = sections.filter((tag) => tag.startsWith('<details'));
  assert.deepEqual(collapsible.map(idOf), ['verifyFormatSection', 'verifyStressSection', 'verifyCounterSection']);
  collapsible.forEach((tag) => assert.match(tag, / open>$/, tag));
});

test('verify workspace is initialised in the webview and can send an input to the run tab', () => {
  const html = getWebviewHtml();
  assert.ok(html.includes(initVerifyWorkspace.toString()));
  assert.match(html, /function initVerifyWorkspace\(\{ vscode, sendInputToRun \}\)/);
  assert.match(html, /initVerifyWorkspace\(\{\s*vscode,\s*sendInputToRun\(input\) \{\s*stdin\.value = input;\s*setWorkspace\('run'\);\s*stdin\.focus\(\);\s*\}\s*\}\);/);
});

test('generated webview inline script parses as a function body', () => {
  for (const errorDisplayMode of ['friendly', 'both', 'original']) {
    const html = getWebviewHtml({ snippets: INPUT_SNIPPETS, errorDisplayMode });
    // A single script tag, so the non-greedy capture covers the whole script.
    assert.equal((html.match(/<script\b/g) || []).length, 1);
    const source = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new Function(source), errorDisplayMode);
  }
});

test('initVerifyWorkspace is self-contained so it can be injected with toString()', () => {
  const source = initVerifyWorkspace.toString();
  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /\bVERIFY_MARKUP\b/);
  assert.doesNotMatch(source, /\bVERIFY_STYLES\b/);
  assert.doesNotMatch(source, /\brequire\(/);
  // option() is a module-level markup helper, not available in the webview.
  assert.doesNotMatch(source, /\boption\(/);
});

const {
  COMPLEXITY_MARKUP,
  COMPLEXITY_STYLES,
  initComplexitySection
} = require('../src/complexity/complexityWebview');

test('verify workspace has the 計算量 section between 入力形式 and ストレステスト', () => {
  const html = getWebviewHtml();
  const panel = verifyPanelHtml(html);
  const formatIndex = panel.indexOf('id="verifyFormatSection"');
  const complexityIndex = panel.indexOf('id="complexitySection"');
  const stressIndex = panel.indexOf('id="verifyStressSection"');
  const counterIndex = panel.indexOf('id="verifyCounterSection"');
  assert.ok(formatIndex > -1);
  assert.ok(complexityIndex > formatIndex);
  assert.ok(stressIndex > complexityIndex);
  assert.ok(counterIndex > stressIndex);
  assert.equal((panel.match(/id="complexitySection"/g) || []).length, 1);

  // A plain titled section, not a collapsible <details>.
  const section = elementHtml(panel, 'complexitySection');
  assert.match(section, /^<section id="complexitySection" class="verifySection complexitySection" aria-labelledby="complexityHeading">\s*<h2 id="complexityHeading" class="complexitySectionTitle">計算量<\/h2>/);
  assert.doesNotMatch(panel, /<details\b[^>]*\sid="complexitySection"/);
  assert.ok(stressIndex > complexityIndex + section.length - 1, 'ストレステスト starts after the 計算量 section ends');
  for (const removed of ['complexitySummary', 'complexityMeasureHint', 'complexityConfidence']) {
    assert.doesNotMatch(html, new RegExp(`\\sid="${removed}"`), removed);
  }

  for (const [id, label] of [['complexityAnalyze', '解析'], ['complexityMeasure', '実測'], ['complexityCancel', '中止']]) {
    assert.match(section, new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*type="button"[^>]*>${label}</button>`), id);
  }
  assert.match(openingTag(section, 'complexityCancel'), /\shidden>$/);
  for (const id of ['complexityAnalyze', 'complexityMeasure']) {
    assert.doesNotMatch(openingTag(section, id), /\s(?:hidden|disabled)\b/, id);
  }

  // 時間 / 空間 shown big.
  const bigItems = Array.from(
    section.matchAll(/<div class="complexityBigItem">\s*<span class="complexityBigLabel">([^<]+)<\/span>\s*<span id="([^"]+)" class="complexityBigValue"><\/span>\s*<\/div>/g),
    (match) => [match[1], match[2]]
  );
  assert.deepEqual(bigItems, [['時間', 'complexityTime'], ['空間', 'complexitySpace']]);
  assert.match(section, /<div class="complexityBig">\s*<div class="complexityBigItem">/);

  // The operation count is a third, full-width big item after 時間 / 空間.
  const big = elementHtml(section.replace('<div class="complexityBig">', '<div id="complexityBigProbe" class="complexityBig">'), 'complexityBigProbe');
  const opsItem = elementHtml(big, 'complexityOpsItem');
  assert.ok(big.indexOf('id="complexityOpsItem"') > big.indexOf('id="complexitySpace"'));
  assert.match(opsItem, /^<div id="complexityOpsItem" class="complexityBigItem">/);
  assert.match(opsItem, /<span class="complexityBigLabel">計算回数<\/span>/);
  assert.match(openingTag(opsItem, 'complexityVerdictLabel'), /^<span id="complexityVerdictLabel" class="complexityVerdictLabel" hidden>$/);
  assert.match(opsItem, /<span id="complexityOps" class="complexityBigValue">\?<\/span>/);
  assert.ok(opsItem.indexOf('計算回数') < opsItem.indexOf('id="complexityVerdictLabel"'));
  assert.ok(opsItem.indexOf('id="complexityVerdictLabel"') < opsItem.indexOf('id="complexityOps"'));
  assert.match(COMPLEXITY_STYLES, /\.complexityBig\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.match(COMPLEXITY_STYLES, /#complexityOpsItem\s*\{[^}]*grid-column:\s*1 \/ -1;/);

  const result = elementHtml(section, 'complexityResult');
  assert.match(openingTag(section, 'complexityResult'), /\shidden>$/);
  for (const id of ['complexityTime', 'complexitySpace', 'complexityVerdict', 'complexityBreakdown', 'complexityWarnings', 'complexityAssumptions']) {
    assert.match(result, new RegExp(`\\sid="${id}"`), id);
  }
  assert.doesNotMatch(result, /\sid="complexityMeasureDetails"/, 'the measurement lives outside the result');
  assert.ok(section.indexOf('id="complexityMeasureDetails"') > section.indexOf('id="complexityResult"') + result.length - 1);

  // Closed or hidden until there is something to show.
  assert.doesNotMatch(openingTag(section, 'complexityBreakdown'), /\s(?:open|hidden)\b/);
  // Shown by the script only when there is a bound to decide.
  assert.match(openingTag(section, 'complexityAssumptions'), /^<details id="complexityAssumptions" hidden>$/);
  assert.match(openingTag(section, 'complexityWarnings'), /^<details\b[^>]*\shidden>$/);
  assert.match(openingTag(section, 'complexityMeasureDetails'), /^<details\b[^>]*\shidden>$/);

  const assumptions = elementHtml(section, 'complexityAssumptions');
  assert.match(assumptions, /<summary>計算の前提（変数の上限・速さ）<\/summary>/);
  assert.match(assumptions, /\sid="complexityBindings"/);
  assert.match(assumptions, /\sid="complexitySpeed"/);

  assert.doesNotMatch(COMPLEXITY_MARKUP, /\sstyle\s*=/i);
  assert.doesNotMatch(section, /\sstyle\s*=/i);
});

// A minimal DOM for running initComplexitySection outside a browser.
function runComplexityScript() {
  class FakeElement {
    constructor(tag, { hidden = false, open = false } = {}) {
      this.tagName = tag;
      this.hidden = hidden;
      this.open = open;
      this.disabled = false;
      this.title = '';
      this.value = '';
      this.className = '';
      this.textContent = '';
      this.children = [];
      this.attributes = {};
      this.listeners = {};
    }

    setAttribute(name, value) {
      this.attributes[name] = value;
    }

    append(...nodes) {
      this.children.push(...nodes);
    }

    replaceChildren(...nodes) {
      this.children = nodes;
    }

    addEventListener(type, listener) {
      (this.listeners[type] = this.listeners[type] || []).push(listener);
    }

    focus() {}

    click() {
      (this.listeners.click || []).forEach((listener) => listener());
    }
  }

  const elements = new Map();
  for (const match of COMPLEXITY_MARKUP.matchAll(/<([a-z0-9]+)\b([^>]*)\sid="([^"]+)"([^>]*)>/g)) {
    const attributes = `${match[2]} ${match[4]}`;
    elements.set(match[3], new FakeElement(match[1], {
      hidden: /\shidden\b/.test(attributes),
      open: /\sopen\b/.test(attributes)
    }));
  }
  const posted = [];
  let onMessage = null;
  const fakeDocument = {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => ({ textContent: text })
  };
  const fakeWindow = {
    addEventListener(type, listener) {
      if (type === 'message') {
        onMessage = listener;
      }
    }
  };
  const vscode = { postMessage: (message) => posted.push(message) };
  new Function('document', 'window', 'vscode', `${initComplexitySection.toString()}\ninitComplexitySection({ vscode });`)(
    fakeDocument,
    fakeWindow,
    vscode
  );
  assert.equal(typeof onMessage, 'function');
  return { el: (id) => elements.get(id), posted, send: (data) => onMessage({ data }) };
}

function complexityResultMessage(overrides = {}) {
  return {
    type: 'complexityResult',
    ok: true,
    fileName: 'a.py',
    time: 'O(N²)',
    space: 'O(N)',
    confidence: 'high',
    confidenceLabel: '高',
    verdict: {
      text: 'N = 2×10^5 → 4×10^10 回',
      operationsText: '4×10^10 回',
      sizesText: 'N = 2×10^5',
      label: 'TLE の恐れ',
      verdict: 'tle'
    },
    verdictNote: '',
    speedText: '1 秒あたり 3×10^7 回として計算（PyPy・目安の値）、制限時間 2 秒',
    bindings: [{ symbol: 'n', display: 'N', source: 'name', formatVar: 'N', value: 200000, valueText: '2×10^5' }],
    unbound: [],
    formatVars: ['N'],
    lines: [{ line: 2, kind: 'loop', label: '× N', note: '' }],
    warnings: [],
    ...overrides
  };
}

test('the 計算量 script shows time and space big and opens details only when needed', () => {
  const page = runComplexityScript();
  const measure = page.el('complexityMeasure');
  assert.equal(measure.disabled, false);
  assert.equal(page.el('complexityCancel').hidden, true);

  // Missing format: the button stays usable and explains why in its title.
  page.send({ type: 'complexityState', canMeasure: false, measureReason: '入力形式がないため実測できません。' });
  assert.equal(measure.disabled, false);
  assert.equal(measure.title, '入力形式がないため実測できません。');

  const verdictLine = () => page.el('complexityVerdict').children.map((child) => child.textContent);
  const verdictLabel = page.el('complexityVerdictLabel');
  const assumptions = page.el('complexityAssumptions');
  assert.equal(verdictLabel.hidden, true, 'no verdict label before a verdict exists');
  assert.equal(assumptions.hidden, true);

  const message = complexityResultMessage();
  page.send(message);
  assert.equal(page.el('complexityResult').hidden, false);
  assert.equal(page.el('complexityTime').textContent, 'O(N²)');
  assert.equal(page.el('complexitySpace').textContent, 'O(N)');
  // The big count shows the operations; the label carries the verdict.
  assert.equal(page.el('complexityOps').textContent, '4×10^10 回');
  assert.equal(verdictLabel.hidden, false);
  assert.equal(verdictLabel.textContent, 'TLE の恐れ');
  assert.equal(verdictLabel.className, 'complexityVerdictLabel tle');
  assert.equal(page.el('complexityOpsItem').title, message.speedText);
  assert.equal(page.el('complexitySpeed').textContent, message.speedText);
  // The small line below: the sizes and the confidence.
  assert.deepEqual(verdictLine(), ['N = 2×10^5', '推定: 高']);
  assert.equal(page.el('complexityStatus').textContent, '', 'no status text after a successful analysis');
  assert.equal(page.el('complexityWarnings').hidden, true);
  assert.equal(page.el('complexityBreakdown').open, false);
  assert.equal(assumptions.hidden, true, 'nothing to decide: the assumptions stay hidden');
  assert.equal(assumptions.open, false);

  page.send(complexityResultMessage({
    time: 'O(1)',
    verdict: { text: '1 回', operationsText: '1 回', sizesText: '', label: '余裕', verdict: 'safe' },
    bindings: []
  }));
  assert.equal(page.el('complexityOps').textContent, '1 回');
  assert.equal(verdictLabel.className, 'complexityVerdictLabel safe');
  assert.deepEqual(verdictLine(), ['推定: 高'], 'no sizes for O(1)');

  const unboundNote = '上限が決まっていない変数があります（n）。「計算の前提」で上限を選んでください。';
  page.send(complexityResultMessage({ verdict: null, verdictNote: unboundNote, bindings: [], unbound: ['n'], formatVars: [] }));
  assert.equal(page.el('complexityOps').textContent, '?');
  assert.equal(verdictLabel.hidden, true);
  assert.deepEqual(verdictLine(), [unboundNote, '推定: 高']);
  assert.equal(page.el('complexityVerdict').children[0].className, 'error');
  assert.equal(assumptions.hidden, false, 'a missing limit shows the assumptions');
  assert.equal(assumptions.open, true, 'and opens them');

  assumptions.open = false;
  page.send(complexityResultMessage({
    bindings: [{ symbol: 'n', display: 'N', source: 'manual', formatVar: '', value: 2000, valueText: '2×10^3' }]
  }));
  assert.equal(assumptions.hidden, false, 'a hand-set limit keeps the assumptions visible');
  assert.equal(assumptions.open, false, 'without opening them');

  page.send(complexityResultMessage());
  assert.equal(assumptions.hidden, true, 'hidden again when there is nothing to decide');

  page.send(complexityResultMessage({ warnings: [{ line: 3, message: 'N 回とみなしました。' }] }));
  assert.equal(page.el('complexityWarnings').hidden, false);
  assert.equal(page.el('complexityWarningCount').textContent, '1');
  page.send(complexityResultMessage());
  assert.equal(page.el('complexityWarnings').hidden, true);

  measure.click();
  assert.deepEqual(page.posted.at(-1), { type: 'complexityMeasure' });
  assert.equal(measure.disabled, true, 'disabled only while measuring');
  assert.equal(page.el('complexityCancel').hidden, false);
  assert.equal(page.el('complexityMeasureDetails').hidden, false);
  page.send({ type: 'complexityMeasureResult', ok: false, message: '入力形式がないため実測できません。' });
  assert.equal(measure.disabled, false);
  assert.equal(page.el('complexityCancel').hidden, true);
  assert.equal(page.el('complexityMeasureResult').textContent, '入力形式がないため実測できません。');

  page.send({ type: 'complexityResult', ok: false, message: '2 行目に文法の誤りがあるため、計算量を推定できませんでした。' });
  assert.equal(page.el('complexityResult').hidden, true);
  assert.equal(page.el('complexityStatus').textContent, '2 行目に文法の誤りがあるため、計算量を推定できませんでした。');
  assert.equal(page.el('complexityStatus').className, 'verifyStatus error');
});

test('complexity section styles and script are injected, and the script starts before ready', () => {
  const html = getWebviewHtml();
  assert.ok(html.includes(COMPLEXITY_STYLES));
  assert.ok(html.includes(initComplexitySection.toString()));
  assert.match(html, /function initComplexitySection\(\{ vscode \}\)/);

  const call = 'initComplexitySection({ vscode });';
  const callIndex = html.indexOf(call);
  assert.ok(callIndex > -1);
  assert.equal(html.indexOf(call, callIndex + 1), -1);
  // The extension publishes the complexity state when the webview says ready.
  assert.ok(callIndex < html.indexOf("vscode.postMessage({ type: 'ready' });"));
});

test('initComplexitySection is self-contained so it can be injected with toString()', () => {
  const source = initComplexitySection.toString();
  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /\bCOMPLEXITY_MARKUP\b/);
  assert.doesNotMatch(source, /\bCOMPLEXITY_STYLES\b/);
  assert.doesNotMatch(source, /\brequire\(/);
});

test('every element initComplexitySection looks up exists exactly once in the page', () => {
  const html = getWebviewHtml();
  const ids = [...new Set(Array.from(initComplexitySection.toString().matchAll(/\$\('([^']+)'\)/g), (match) => match[1]))];
  assert.ok(ids.length >= 10, ids.join(', '));
  for (const id of ids) {
    assert.equal((html.match(new RegExp(`\\sid="${id}"`, 'g')) || []).length, 1, id);
  }
});

// ---------- 検証 tab: naive settings, counterexamples, grid rows ----------

const { VERIFY_MARKUP } = require('../src/verify/verifyWebview');

test('the stress section shows only the basic settings and keeps the naive settings in a closed section', () => {
  const panel = verifyPanelHtml(getWebviewHtml());
  const stress = elementHtml(panel, 'verifyStressSection');
  const naive = elementHtml(stress, 'verifyNaiveSection');
  const outside = stress.replace(naive, '');

  assert.match(openingTag(stress, 'verifyNaiveSection'), /^<details id="verifyNaiveSection">$/, 'closed by default');
  assert.match(naive, /^<details id="verifyNaiveSection">\s*<summary[^>]*>愚直解と比べる（任意）<\/summary>/);
  for (const id of ['verifyIterations', 'verifySeed', 'verifyStart', 'verifyCancel', 'verifyMode']) {
    assert.match(outside, new RegExp(`\\sid="${id}"`), id);
    assert.doesNotMatch(openingTag(outside, id), /\shidden\b/, id);
  }
  assert.match(outside, /<label for="verifyIterations">回数<\/label>/);
  assert.match(outside, /<label for="verifySeed" title="[^"]+">シード値<\/label>/);
  assert.match(openingTag(outside, 'verifySeed'), /\splaceholder="空なら毎回変わる"/);
  for (const id of ['verifyNaiveIntro', 'verifyUseNaiveLabel', 'verifyUseNaive', 'verifyNaiveFile', 'verifyCreateNaive', 'verifyChooseNaive', 'verifyCompareMode']) {
    assert.match(naive, new RegExp(`\\sid="${id}"`), id);
    assert.doesNotMatch(outside, new RegExp(`\\sid="${id}"`), `${id} stays inside the naive section`);
  }

  assert.doesNotMatch(openingTag(naive, 'verifyNaiveIntro'), /\shidden\b/);
  assert.match(openingTag(naive, 'verifyUseNaiveLabel'), /\shidden>$/);
  assert.match(openingTag(naive, 'verifyCreateNaive'), /\shidden>$/);
  assert.match(openingTag(naive, 'verifyUseNaive'), /^<input id="verifyUseNaive" type="checkbox" checked>$/);
  const useNaiveLabel = elementHtml(naive, 'verifyUseNaiveLabel');
  assert.match(useNaiveLabel, /^<label\b[^>]*\sfor="verifyUseNaive"/);
  assert.match(useNaiveLabel, /\sid="verifyNaiveFile"/);
  assert.match(naive, /<button id="verifyChooseNaive"[^>]*type="button">ファイルを選ぶ<\/button>/);
  assert.match(naive, /<label for="verifyCompareMode">[^<]+<\/label>/);

  assert.doesNotMatch(stress, /\sstyle\s*=/i);
});

test('the counterexample section shows a note and hides its buttons while it is empty', () => {
  const counter = elementHtml(verifyPanelHtml(getWebviewHtml()), 'verifyCounterSection');
  assert.match(counter, /<span id="verifyCounterEmpty" class="verifyStatus">[^<]+<\/span>/);
  assert.doesNotMatch(openingTag(counter, 'verifyCounterEmpty'), /\shidden\b/);
  assert.match(openingTag(counter, 'verifyCounterActions'), /\shidden>$/);
  const actions = elementHtml(counter, 'verifyCounterActions');
  assert.match(actions, /\sid="verifyRecheck"/);
  assert.match(actions, /\sid="verifyRegenerate"/);
  assert.match(openingTag(actions, 'verifyRegenerate'), /\shidden>$/);
  assert.doesNotMatch(counter, /\sstyle\s*=/i);
});

test('the 検証 tab heads the input rows with 入力の行 and makes 開始 the main button', () => {
  const html = getWebviewHtml();
  const format = elementHtml(verifyPanelHtml(html), 'verifyFormatSection');
  assert.match(format, /<span class="verifyRowsHeading"[^>]*>入力の行<\/span>\s*<div id="verifyRows" class="verifyRows"><\/div>/);
  assert.equal((html.match(/>入力の行</g) || []).length, 1);
  assert.ok(format.indexOf('入力の行') > format.indexOf('id="verifyImportStatus"'), 'below the import controls');

  const stress = elementHtml(verifyPanelHtml(html), 'verifyStressSection');
  assert.match(openingTag(stress, 'verifyStart'), /^<button id="verifyStart" class="verifyPrimary" type="button">$/);
  assert.doesNotMatch(openingTag(stress, 'verifyCancel'), /verifyPrimary/);
  const style = html.match(/<style nonce="[^"]+">([\s\S]*?)<\/style>/)[1];
  assert.match(style, /\.verifyPrimary,\s*\.verifyButtons \.verifyPrimary\s*\{[^}]*min-height:/);
  assert.match(style, /\.verifyRowsHeading\s*\{/);
});

test('検証 inputs are light boxes with size classes in the page styles', () => {
  const html = getWebviewHtml();
  const style = html.match(/<style nonce="[^"]+">([\s\S]*?)<\/style>/)[1];
  assert.match(
    style,
    /\.verifyWorkspace input\[type="text"\],\s*\.verifyWorkspace input\[type="url"\],\s*\.verifyWorkspace input\[type="number"\],\s*\.verifyWorkspace select,\s*\.verifyWorkspace textarea\s*\{(?=[^}]*color-scheme:\s*light;)(?=[^}]*\scolor:\s*#141414;)(?=[^}]*background:\s*#f4f4f1;)[^}]*\}/
  );
  assert.match(style, /\.verifyInput-name\s*\{[^}]*width:/);
  assert.match(style, /\.verifyInput-expr\s*\{[^}]*width:/);
  assert.match(style, /\.verifyFields\s*\{(?=[^}]*display:\s*flex;)(?=[^}]*flex-wrap:\s*wrap;)[^}]*\}/);
  assert.match(style, /\.verifyOptions\s*\{(?=[^}]*display:\s*flex;)(?=[^}]*flex-wrap:\s*wrap;)[^}]*\}/);
});

function parseAttributes(text) {
  const attributes = {};
  for (const match of text.matchAll(/([a-zA-Z][\w-]*)(?:="([^"]*)")?/g)) {
    attributes[match[1]] = match[2] === undefined ? '' : match[2];
  }
  return attributes;
}

// Matches compound selectors such as 'datalist[data-row]' or '[data-row="1"][data-path$=".name"]'.
function selectorMatcher(selector) {
  const parts = /^([a-z]*)((?:\[[^\]]+\])*)$/.exec(selector);
  assert.ok(parts, `unsupported selector ${selector}`);
  const checks = Array.from(parts[2].matchAll(/\[([\w-]+)(?:(\$?=)"([^"]*)")?\]/g), (match) => ({
    name: match[1],
    operator: match[2],
    value: match[3]
  }));
  return (node) => {
    if (parts[1] && node.tagName !== parts[1]) {
      return false;
    }
    return checks.every(({ name, operator, value }) => {
      const actual = node.getAttribute(name);
      if (actual === null) {
        return false;
      }
      if (operator === '=') {
        return actual === value;
      }
      if (operator === '$=') {
        return actual.endsWith(value);
      }
      return true;
    });
  };
}

class FakeNode {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName;
    this.attributes = { ...attributes };
    this.children = [];
    this.listeners = {};
    this.id = attributes.id || '';
    this.className = attributes.class || '';
    this.hidden = 'hidden' in attributes;
    this.open = 'open' in attributes;
    this.disabled = 'disabled' in attributes;
    this.checked = 'checked' in attributes;
    this.value = attributes.value || '';
    this.textContent = '';
  }

  get dataset() {
    const data = {};
    for (const [name, value] of Object.entries(this.attributes)) {
      if (name.startsWith('data-')) {
        data[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      }
    }
    return data;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') {
      this.id = String(value);
    } else if (name === 'value') {
      this.value = String(value);
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = nodes;
  }

  addEventListener(type, listener) {
    (this.listeners[type] = this.listeners[type] || []).push(listener);
  }

  dispatch(type) {
    (this.listeners[type] || []).forEach((listener) => listener({ type, target: this }));
  }

  focus() {}

  descendants() {
    const found = [];
    const walk = (node) => node.children.forEach((child) => {
      if (child instanceof FakeNode) {
        found.push(child);
        walk(child);
      }
    });
    walk(this);
    return found;
  }

  querySelectorAll(selector) {
    return this.descendants().filter(selectorMatcher(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  findText(text) {
    return this.descendants().find((node) => node.textContent === text) || null;
  }
}

function runVerifyScript() {
  const elements = new Map();
  for (const match of VERIFY_MARKUP.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const attributes = parseAttributes(match[2]);
    if (attributes.id) {
      elements.set(attributes.id, new FakeNode(match[1], attributes));
    }
  }
  const posted = [];
  const timers = [];
  let onMessage = null;
  const fakeDocument = {
    getElementById(id) {
      if (elements.has(id)) {
        return elements.get(id);
      }
      for (const node of elements.values()) {
        const found = node.descendants().find((child) => child.id === id);
        if (found) {
          return found;
        }
      }
      return null;
    },
    createElement: (tagName) => new FakeNode(tagName),
    createTextNode: (text) => ({ textContent: text })
  };
  const fakeWindow = {
    addEventListener(type, listener) {
      if (type === 'message') {
        onMessage = listener;
      }
    }
  };
  const vscode = { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) };
  const fakeSetTimeout = (callback) => {
    timers.push(callback);
    return timers.length;
  };
  const fakeClearTimeout = (handle) => {
    if (handle) {
      timers[handle - 1] = null;
    }
  };
  new Function(
    'document', 'window', 'vscode', 'setTimeout', 'clearTimeout',
    `${initVerifyWorkspace.toString()}\ninitVerifyWorkspace({ vscode, sendInputToRun() {} });`
  )(fakeDocument, fakeWindow, vscode, fakeSetTimeout, fakeClearTimeout);
  assert.equal(typeof onMessage, 'function');
  return {
    el: (id) => fakeDocument.getElementById(id),
    posted,
    send: (data) => onMessage({ data }),
    flushTimers() {
      timers.splice(0).forEach((callback) => callback && callback());
    },
    lastPosted(type) {
      const found = posted.filter((message) => message.type === type);
      assert.ok(found.length > 0, `no ${type} was posted`);
      return found[found.length - 1];
    }
  };
}

function verifyLoaded({ target = null, naiveExists = false, data = {} } = {}) {
  return {
    type: 'verifyLoaded',
    target: target ? { mainFile: 'a.py', naiveFile: 'a_naive.py', naiveExists } : null,
    data: { format: { rows: [] }, compareMode: 'tokens', iterations: 100, counterexamples: [], ...data },
    warnings: []
  };
}

test('the 検証 script shows the naive mode in one line and naive settings only when they apply', () => {
  const page = runVerifyScript();
  const mode = page.el('verifyMode');
  const useNaive = page.el('verifyUseNaive');
  const state = () => ({
    mode: mode.textContent,
    useNaiveLabelHidden: page.el('verifyUseNaiveLabel').hidden,
    introHidden: page.el('verifyNaiveIntro').hidden,
    createHidden: page.el('verifyCreateNaive').hidden,
    choose: page.el('verifyChooseNaive').textContent,
    chooseDisabled: page.el('verifyChooseNaive').disabled,
    compareDisabled: page.el('verifyCompareMode').disabled,
    regenerateHidden: page.el('verifyRegenerate').hidden
  });

  page.send(verifyLoaded());
  assert.deepEqual(state(), {
    mode: '',
    useNaiveLabelHidden: true,
    introHidden: false,
    createHidden: true,
    choose: 'ファイルを選ぶ',
    chooseDisabled: true,
    compareDisabled: true,
    regenerateHidden: true
  });

  page.send(verifyLoaded({ target: true, naiveExists: true }));
  assert.equal(useNaive.checked, true, 'useNaive defaults to true');
  assert.equal(page.el('verifyNaiveFile').textContent, 'a_naive.py');
  assert.deepEqual(state(), {
    mode: '愚直解 a_naive.py と出力を比べます',
    useNaiveLabelHidden: false,
    introHidden: true,
    createHidden: true,
    choose: '別のファイルにする',
    chooseDisabled: false,
    compareDisabled: false,
    regenerateHidden: false
  });

  useNaive.checked = false;
  useNaive.dispatch('change');
  assert.equal(mode.textContent, '愚直解は使わず、エラーと時間切れを確かめます');
  assert.equal(page.el('verifyCompareMode').disabled, true);
  assert.deepEqual(page.lastPosted('verifySettingsChanged'), {
    type: 'verifySettingsChanged', compareMode: 'tokens', iterations: 100, useNaive: false
  });
  useNaive.checked = true;
  useNaive.dispatch('change');
  assert.equal(mode.textContent, '愚直解 a_naive.py と出力を比べます');
  assert.equal(page.lastPosted('verifySettingsChanged').useNaive, true);

  page.send(verifyLoaded({ target: true, naiveExists: true, data: { useNaive: false } }));
  assert.equal(useNaive.checked, false);
  assert.equal(mode.textContent, '愚直解は使わず、エラーと時間切れを確かめます');
  assert.equal(page.el('verifyRegenerate').hidden, false, 'regenerating needs only the naive file');

  page.send(verifyLoaded({ target: true, naiveExists: false }));
  assert.deepEqual(state(), {
    mode: '愚直解なし：エラーと時間切れを確かめます',
    useNaiveLabelHidden: true,
    introHidden: false,
    createHidden: false,
    choose: 'ファイルを選ぶ',
    chooseDisabled: false,
    compareDisabled: true,
    regenerateHidden: true
  });

  const naiveSection = page.el('verifyNaiveSection');
  assert.equal(naiveSection.open, false);
  page.send({ type: 'verifyStressStopped', message: '先に「入力形式」を作ってください。' });
  assert.equal(naiveSection.open, false);
  page.send({ type: 'verifyStressStopped', message: '愚直解 a_naive.py が見つかりません。', showCreateNaive: true });
  assert.equal(naiveSection.open, true);
});

test('the 検証 script shows counterexample buttons only when there are counterexamples', () => {
  const page = runVerifyScript();
  page.send(verifyLoaded({ target: true, naiveExists: true }));
  assert.equal(page.el('verifyCounterEmpty').hidden, false);
  assert.equal(page.el('verifyCounterActions').hidden, true);
  assert.equal(page.el('verifyCounterCount').textContent, '0');

  const saved = { id: 'ce-1', kind: 'mismatch', input: '1\n', expected: '1\n', seed: 1, createdAt: '2026-10-19T12:00:00.000Z' };
  page.send({ type: 'verifyCounterexamples', counterexamples: [saved] });
  assert.equal(page.el('verifyCounterEmpty').hidden, true);
  assert.equal(page.el('verifyCounterActions').hidden, false);
  assert.equal(page.el('verifyCounterCount').textContent, '1');
  assert.equal(page.el('verifyCounterList').children.length, 1);
  assert.equal(page.el('verifyRecheck').disabled, false);

  page.send({ type: 'verifyCounterexamples', counterexamples: [] });
  assert.equal(page.el('verifyCounterEmpty').hidden, false);
  assert.equal(page.el('verifyCounterActions').hidden, true);
});

test('a grid row edits 行数, the 長さ range, the characters and すべて異なる with short labels', () => {
  const page = runVerifyScript();
  const format = {
    rows: [
      { kind: 'ints', vars: [{ name: 'H', min: '1', max: '50' }, { name: 'W', min: '1', max: '80' }], needsReview: false, reviewReason: '' },
      { kind: 'grid', name: 'S', rows: 'H', minCols: '', cols: 'W', charset: 'custom', chars: '.#', distinct: false, needsReview: false, reviewReason: '' },
      { kind: 'intList', name: 'A', length: 'H', min: '1', max: '9', layout: 'row', distinct: false, order: 'none', needsReview: false, reviewReason: '' }
    ]
  };
  page.send(verifyLoaded({ target: true, data: { format } }));
  const rows = page.el('verifyRows');
  const input = (rowIndex, path) => rows.querySelector(`[data-row="${rowIndex}"][data-path="${path}"]`);
  const labelFor = (control) => rows.descendants().find((node) => node.tagName === 'label' && node.getAttribute('for') === control.id);
  // The .verifyField wrapper of a control, which carries the long explanation as its title.
  const wrapperOf = (control) => rows.descendants()
    .find((node) => node.className === 'verifyField' && node.descendants().includes(control));

  // The ints row has no long label; its explanation is the title of the variable list.
  assert.equal(rows.findText('変数（名前・下限〜上限）。1行に空白区切りで並べます'), null);
  const varList = rows.descendants().find((node) => node.className === 'verifyVarList');
  assert.ok(varList.title);
  assert.equal(input(0, 'vars.0.name').className, 'verifyInput-name');
  assert.equal(input(0, 'vars.0.max').className, 'verifyInput-expr');

  const rowCount = input(1, 'rows');
  assert.equal(rowCount.value, 'H');
  assert.equal(labelFor(rowCount).textContent, '行数');

  const minCols = input(1, 'minCols');
  const cols = input(1, 'cols');
  const lengthField = wrapperOf(minCols);
  assert.ok(lengthField.descendants().some((node) => node.className === 'verifyBlockLabel' && node.textContent === '長さ'));
  assert.ok(lengthField.descendants().includes(cols));
  assert.match(lengthField.getAttribute('title'), /下限を空にすると/);
  assert.equal(minCols.value, '');
  assert.equal(cols.value, 'W');
  assert.ok(!minCols.getAttribute('placeholder'), 'no example value in the lower length');
  assert.equal(cols.getAttribute('placeholder'), '2×10^5');
  assert.equal(minCols.getAttribute('aria-label'), '2行目の長さの下限');
  assert.equal(cols.getAttribute('aria-label'), '2行目の長さの上限');
  assert.equal(minCols.className, 'verifyInput-expr');
  assert.equal(cols.className, 'verifyInput-expr');

  const valueMin = input(2, 'min');
  assert.equal(valueMin.getAttribute('placeholder'), '1', 'value ranges still show 1');
  const valueField = wrapperOf(valueMin);
  assert.ok(valueField.descendants().some((node) => node.className === 'verifyBlockLabel' && node.textContent === '範囲'));
  assert.equal(valueField.getAttribute('title'), '値の下限〜上限');
  assert.equal(valueMin.getAttribute('aria-label'), '3行目の範囲の下限');

  const charsetSelect = input(1, 'charset');
  assert.equal(labelFor(charsetSelect).textContent, '文字');
  assert.equal(charsetSelect.getAttribute('aria-label'), '2行目の文字の種類');
  assert.equal(charsetSelect.value, 'custom');
  assert.equal(input(1, 'chars').value, '.#');
  assert.equal(input(1, 'chars').className, 'verifyInput-name');
  assert.equal(input(1, 'name').className, 'verifyInput-name');

  // すべて異なる comes last in a grid row.
  assert.deepEqual(
    rows.querySelectorAll('[data-row="1"][data-path]').map((node) => node.getAttribute('data-path')),
    ['name', 'rows', 'minCols', 'cols', 'charset', 'chars', 'distinct']
  );
  const distinct = input(1, 'distinct');
  assert.equal(distinct.getAttribute('type'), 'checkbox');
  assert.equal(distinct.checked, false);
  assert.ok(rows.findText('すべて異なる'));

  minCols.value = '1';
  minCols.dispatch('input');
  distinct.checked = true;
  distinct.dispatch('change');
  page.flushTimers();
  let posted = page.lastPosted('verifyFormatChanged').format.rows[1];
  assert.equal(posted.minCols, '1');
  assert.equal(posted.cols, 'W');
  assert.equal(posted.distinct, true);

  const charset = input(1, 'charset');
  charset.value = 'lower';
  charset.dispatch('change');
  page.flushTimers();
  assert.equal(input(1, 'chars'), null, '使う文字 is only for custom characters');
  posted = page.lastPosted('verifyFormatChanged').format.rows[1];
  assert.equal(posted.charset, 'lower');
  assert.equal(posted.distinct, true);
});
