const test = require('node:test');
const assert = require('node:assert/strict');
const { Script } = require('node:vm');

const { getWebviewHtml } = require('../src/webviewHtml');
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

test('webview separates execution and snippet insertion into two workspaces', () => {
  const html = getWebviewHtml({
    brandName: 'Piyoyo'
  });
  const tabsIndex = html.indexOf('class="workspaceTabs"');
  const runWorkspaceIndex = html.indexOf('id="runWorkspace"');
  const snippetWorkspaceIndex = html.indexOf('id="snippetWorkspace"');
  const runIndex = html.indexOf('id="runButton"');
  const stdinIndex = html.indexOf('id="stdin"');
  const stdoutIndex = html.indexOf('id="stdout"');
  const detailsIndex = html.indexOf('id="runDetails"');
  const launcherIndex = html.indexOf('class="launcher runSection"');

  assert.ok(tabsIndex > -1);
  assert.ok(runWorkspaceIndex > tabsIndex);
  assert.ok(snippetWorkspaceIndex > runWorkspaceIndex);
  assert.ok(runIndex < stdinIndex);
  assert.ok(stdinIndex < stdoutIndex);
  assert.ok(stdoutIndex < detailsIndex);
  assert.ok(detailsIndex < launcherIndex);
  assert.match(html, /data-workspace="run">実行/);
  assert.match(html, /data-workspace="snippets">コード挿入/);
  assert.match(html, /id="snippetWorkspace"[^>]*hidden/);
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
    'input', 'output', 'number-conversion', 'list-comprehension', 'index-slice', 'string',
    'condition-check', 'aggregation', 'prefix-sum', 'brute-force',
    'binary-search', 'queue', 'tuple', 'debug'
  ];
  const categoryLabels = [
    '入力', '出力', '数値・型変換', 'リスト・内包表記', '添字・スライス', '文字列',
    '条件分岐・文字判定', '集計・辞書', '累積和', '全探索', '二分探索',
    'キュー・deque', 'タプル・座標', 'デバッグ・型確認'
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
  assert.equal((html.match(/data-snippet-variants=/g) || []).length, 11);
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
  assert.match(html, /data-snippet-group="list-comprehension-list-min-max"/);
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
  assert.match(html, /\.runner\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s);
  assert.match(html, /\.snippetLibrary\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s);
  assert.match(html, /\.snippetBrowsePanel,\s*\.snippetPreferencesPanel\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s);
  assert.match(html, /\.snippetChoice\s*\{[^}]*grid-template-columns:/s);
  assert.match(html, /\.snippetRowPreview\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(html, /\.snippetCategoryList\s*\{[^}]*grid-auto-rows:\s*max-content;/s);
  assert.match(html, /\.snippetCategoryList\s*\{[^}]*align-content:\s*start;/s);
  assert.match(html, /\.snippetCategoryList\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(html, /\.snippetComplexity\s*\{[^}]*font-size:\s*10px/s);
  assert.match(html, /id="snippetSearchInput"[^>]*placeholder="操作を検索"/);
  assert.match(html, /id="snippetVariantField"[^>]*hidden/);
  assert.match(html, /button\.className = 'snippetVariantButton'/);
  assert.match(html, /id="snippetImportHint"[^>]*hidden/);
  assert.match(html, /id="snippetDetails"[^>]*hidden/);
  assert.match(html, /自動追加: ' \+ imports\.join/);
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
  assert.match(html, /\.snippetRowSummary\s*\{[^}]*white-space:\s*nowrap/s);
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
  assert.match(html, /class="snippetComplexity"[^>]*>最悪 O\(n\)<\/span>/);
  assert.match(html, /title="リストAの要素数をnとする。"/);
  assert.match(html, /complexityBadge\.textContent = complexity\.qualifier \+ ' ' \+ complexity\.time/);
  assert.doesNotMatch(html, /snippetEditorExpression/);
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
  assert.match(html, /setWorkspace\(viewState\.workspace === 'snippets'/);
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
