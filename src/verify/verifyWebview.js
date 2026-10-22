'use strict';

// Markup, styles, and the browser-side script of the 検証 tab.
// initVerifyWorkspace is injected into the webview via toString(), so it must stay
// self-contained (no closures over this module).

const { COMPLEXITY_MARKUP } = require('../complexity/complexityWebview');

const VERIFY_STYLES = `
    .verifyWorkspace {
      align-content: start;
      grid-auto-rows: max-content;
    }

    .verifyTarget {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }

    .verifyTarget strong {
      color: var(--piyoyo-text);
      font-weight: 600;
    }

    .verifySection {
      border-top: 1px solid var(--piyoyo-line);
      padding-top: 8px;
    }

    .verifySection > summary {
      display: flex;
      align-items: baseline;
      gap: 8px;
      cursor: pointer;
      color: var(--piyoyo-text);
      font-size: 14px;
      font-weight: 650;
    }

    .verifySection > summary .summaryValue {
      margin-left: auto;
      font-size: var(--piyoyo-font-small);
    }

    .verifySectionBody {
      display: grid;
      gap: 8px;
      padding: 8px 2px 10px;
    }

    .verifyButtons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }

    .verifyButtons button,
    .verifySmallButton {
      min-height: 28px;
      padding: 3px 10px;
      font-size: var(--piyoyo-font-small);
    }

    .verifySecondary {
      border-color: var(--vscode-panel-border);
      color: var(--vscode-foreground);
      background: var(--vscode-toolbar-hoverBackground);
    }

    .verifyAutoWidth {
      width: auto;
    }

    .verifyIconButton {
      min-width: 28px;
      min-height: 26px;
      padding: 1px 6px;
      border-color: var(--vscode-panel-border);
      color: var(--vscode-foreground);
      background: transparent;
      font-size: var(--piyoyo-font-small);
    }

    .verifyRows {
      display: grid;
      gap: 8px;
    }

    .verifyRow {
      display: grid;
      gap: 6px;
      padding: 8px;
      border: 1px solid var(--piyoyo-line);
      border-radius: 6px;
      background: var(--piyoyo-surface);
    }

    .verifyRow.needsReview {
      border-color: var(--piyoyo-orange);
    }

    .verifyRowHeader {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .verifyRowHeader select {
      width: auto;
    }

    /* Push the move/remove buttons to the right edge. */
    .verifyRowHeader .verifyIconButton:first-of-type {
      margin-left: auto;
    }

    .verifyRowNumber {
      color: var(--piyoyo-muted);
      font-size: var(--piyoyo-font-small);
      font-weight: 600;
      white-space: nowrap;
    }

    .verifyReview {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      align-items: center;
      color: var(--piyoyo-orange);
      font-size: var(--piyoyo-font-small);
    }

    .verifyReviewBadge {
      padding: 0 6px;
      border: 1px solid var(--piyoyo-orange);
      border-radius: 4px;
      font-weight: 700;
    }

    .verifyFields {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      align-items: flex-end;
    }

    .verifyField {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .verifyFields .verifyField label,
    .verifyFields .verifyBlockLabel {
      gap: 0;
      font-size: var(--piyoyo-font-small);
    }

    .verifyFields select {
      width: auto;
    }

    .verifyRange,
    .verifyVar,
    .verifyInline {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .verifyInline > input {
      flex: 1;
      min-width: 0;
    }

    .verifyInput-name {
      width: 4.5em;
    }

    .verifyInput-expr {
      width: 7em;
    }

    /* Light input boxes stand out from the dark panel, so it is obvious where to type. */
    .verifyWorkspace input[type="text"],
    .verifyWorkspace input[type="url"],
    .verifyWorkspace input[type="number"],
    .verifyWorkspace select,
    .verifyWorkspace textarea {
      color-scheme: light;
      padding: 3px 6px;
      border-color: #8c8c8c;
      border-radius: 4px;
      color: #141414;
      background: #f4f4f1;
    }

    .verifyWorkspace option {
      color: #141414;
      background: #f4f4f1;
    }

    .verifyWorkspace input::placeholder,
    .verifyWorkspace textarea::placeholder {
      color: #8a8a8a;
    }

    .verifyWorkspace select:disabled {
      color: #6f6f6f;
      background: #cfcfcb;
    }

    .verifyWorkspace input[type="checkbox"] {
      accent-color: var(--piyoyo-orange);
    }

    .verifyVarList {
      display: grid;
      gap: 4px;
    }

    .verifyCheck {
      display: flex;
      gap: 6px;
      align-items: center;
      color: var(--vscode-foreground);
      font-weight: 500;
    }

    .verifyCheck input {
      width: auto;
      margin: 0;
    }

    .verifyFieldError,
    .verifyRowError {
      color: var(--vscode-errorForeground);
      font-size: var(--piyoyo-font-small);
      font-weight: 500;
    }

    .verifyFieldError:empty,
    .verifyRowError:empty,
    .verifyStatus:empty {
      display: none;
    }

    .verifyWorkspace input[aria-invalid="true"] {
      border-color: var(--piyoyo-action-red);
      box-shadow: 0 0 0 1px var(--piyoyo-action-red);
    }

    .verifyStatus {
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }

    .verifyStatus.error {
      color: var(--vscode-errorForeground);
    }

    .verifyStatus.ok {
      color: var(--piyoyo-yellow);
    }

    .verifyWorkspace pre {
      min-height: 0;
      max-height: 220px;
    }

    .verifyWorkspace textarea {
      min-height: 80px;
    }

    .verifyOptions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      align-items: flex-end;
    }

    .verifyOptions input {
      width: 7em;
    }

    .verifyProgress {
      display: grid;
      gap: 4px;
    }

    .verifyProgress progress {
      width: 100%;
      accent-color: var(--piyoyo-yellow);
    }

    .verifyResult {
      display: grid;
      gap: 6px;
      padding: 8px;
      border: 1px solid var(--piyoyo-line);
      border-radius: 6px;
    }

    .verifyResult.failed {
      border-color: var(--vscode-errorForeground);
    }

    .verifyResultTitle {
      font-weight: 650;
    }

    .verifyResultTitle.failed {
      color: var(--vscode-errorForeground);
    }

    .verifyResultTitle.passed {
      color: var(--piyoyo-yellow);
    }

    .verifyCompare {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 6px;
    }

    .verifyBlock {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .verifyBlockLabel {
      display: flex;
      gap: 6px;
      align-items: center;
      justify-content: space-between;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      font-weight: 600;
    }

    .verifyDiffLine {
      display: block;
      background: rgba(255, 107, 107, 0.18);
      box-shadow: inset 3px 0 0 var(--piyoyo-red);
    }

    .verifyCounterList {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .verifyCounter {
      display: grid;
      gap: 6px;
      padding: 8px;
      border: 1px solid var(--piyoyo-line);
      border-radius: 6px;
    }

    .verifyCounterHeader {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      align-items: baseline;
      font-size: var(--piyoyo-font-small);
      font-weight: 600;
    }

    .verifyCounterMark.ok {
      color: var(--piyoyo-yellow);
    }

    .verifyCounterMark.failed {
      color: var(--vscode-errorForeground);
    }

    .verifyCounter details > summary {
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }

    @media (forced-colors: active) {
      .verifyDiffLine {
        outline: 1px solid Highlight;
        forced-color-adjust: none;
      }
    }
`;

function option(value, label) {
  return `<option value="${value}">${label}</option>`;
}

const VERIFY_MARKUP = `
      <div class="verifyTarget" aria-live="polite">
        <span>本番の解: <strong id="verifyMainFile">Python ファイルを開いてください</strong></span>
        <span id="verifySaveStatus" class="verifyStatus"></span>
      </div>

      <details id="verifyFormatSection" class="verifySection" open>
        <summary>入力形式<span id="verifyFormatSummary" class="summaryValue"></span></summary>
        <div class="verifySectionBody">
          <div class="verifyField">
            <label for="verifyProblemUrl" title="終わったコンテストの atcoder.jp の問題ページ（ログインしなくても見られるもの）">問題の URL</label>
            <div class="verifyInline">
              <input id="verifyProblemUrl" type="url" autocomplete="off" spellcheck="false" placeholder="atcoder.jp の問題ページ">
              <button id="verifyFetchProblem" class="verifySmallButton" type="button">読み取る</button>
            </div>
          </div>
          <div class="verifyButtons">
            <button id="verifyUndoImport" class="verifySecondary" type="button" hidden>読み取る前に戻す</button>
          </div>
          <details id="verifyPasteSection">
            <summary class="verifyStatus">問題文を貼り付けて読み取る</summary>
            <div class="verifySectionBody">
              <textarea id="verifyProblemText" spellcheck="false" aria-label="問題文の「入力」と「制約」" placeholder="問題文の「入力」と「制約」の部分をそのまま貼り付けます"></textarea>
              <div class="verifyButtons">
                <button id="verifyParseText" type="button">貼り付けた文から読み取る</button>
              </div>
            </div>
          </details>
          <span id="verifyImportStatus" class="verifyStatus" aria-live="polite"></span>

          <div id="verifyRows" class="verifyRows"></div>
          <span id="verifyRowsEmpty" class="verifyStatus">まだ行がありません。問題から読み取るか、「行を足す」で作ります。</span>
          <div class="verifyButtons">
            <select id="verifyAddRowKind" class="verifyAutoWidth" aria-label="足す行の種類">
              ${option('ints', '整数')}
              ${option('intList', '整数の列')}
              ${option('matrix', '行列（H×W）')}
              ${option('string', '文字列')}
              ${option('grid', 'H 行の文字列')}
            </select>
            <button id="verifyAddRow" type="button">+ 行を足す</button>
          </div>
          <div class="verifyBlock">
            <span class="verifyBlockLabel">入力の例</span>
            <pre id="verifyExample" data-placeholder="行を足すと、ここに入力の例が出ます"></pre>
          </div>
        </div>
      </details>
${COMPLEXITY_MARKUP}

      <details id="verifyStressSection" class="verifySection" open>
        <summary>ストレステスト<span id="verifyStressSummary" class="summaryValue"></span></summary>
        <div class="verifySectionBody">
          <div class="verifyOptions">
            <div class="verifyField">
              <label for="verifyIterations">回数</label>
              <input id="verifyIterations" type="number" min="1" max="10000" step="1" value="100">
            </div>
            <div class="verifyField">
              <label for="verifySeed" title="同じシード値と回数なら、同じ入力を作り直せます">シード値</label>
              <input id="verifySeed" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="空なら毎回変わる">
            </div>
          </div>
          <div class="verifyButtons">
            <button id="verifyStart" type="button">開始</button>
            <button id="verifyCancel" class="verifySecondary" type="button" disabled>中止</button>
            <span id="verifyMode" class="verifyStatus"></span>
          </div>
          <details id="verifyNaiveSection">
            <summary class="verifyStatus">愚直解と比べる（任意）</summary>
            <div class="verifySectionBody">
              <span id="verifyNaiveIntro" class="verifyStatus">愚直解（遅くてもよいので確実に正しい解）を用意すると、出力が正しいかも確かめられます。</span>
              <label id="verifyUseNaiveLabel" class="verifyCheck" for="verifyUseNaive" hidden>
                <input id="verifyUseNaive" type="checkbox" checked>
                <span>愚直解 <strong id="verifyNaiveFile">-</strong> と出力を比べる</span>
              </label>
              <div class="verifyButtons">
                <button id="verifyCreateNaive" class="verifySecondary" type="button" hidden>愚直解の雛形を作る</button>
                <button id="verifyChooseNaive" class="verifySecondary" type="button">ファイルを選ぶ</button>
              </div>
              <div class="verifyField">
                <label for="verifyCompareMode">出力の比べ方</label>
                <select id="verifyCompareMode">
                  ${option('tokens', '空白区切り')}
                  ${option('exact', '完全一致')}
                  ${option('float', '小数の誤差を許す')}
                </select>
              </div>
            </div>
          </details>
          <div id="verifyProgressBox" class="verifyProgress" hidden>
            <progress id="verifyProgress" max="100" value="0"></progress>
            <span id="verifyProgressText" class="verifyStatus" aria-live="polite"></span>
          </div>
          <span id="verifyStressStatus" class="verifyStatus" aria-live="polite"></span>
          <div id="verifyResult" class="verifyResult" hidden></div>
        </div>
      </details>

      <details id="verifyCounterSection" class="verifySection" open>
        <summary>反例 (<span id="verifyCounterCount">0</span>)</summary>
        <div class="verifySectionBody">
          <span id="verifyCounterEmpty" class="verifyStatus">まだありません。ストレステストで見つかると、ここに残ります。</span>
          <div id="verifyCounterActions" class="verifyButtons" hidden>
            <button id="verifyRecheck" type="button">反例で確かめる</button>
            <button id="verifyRegenerate" class="verifySecondary" type="button" hidden>期待する出力を作り直す</button>
          </div>
          <span id="verifyCounterStatus" class="verifyStatus" aria-live="polite"></span>
          <ol id="verifyCounterList" class="verifyCounterList"></ol>
        </div>
      </details>
`;

function initVerifyWorkspace({ vscode, sendInputToRun }) {
  const KIND_LABELS = {
    ints: '整数',
    intList: '整数の列',
    matrix: '行列（H×W）',
    string: '文字列',
    grid: 'H 行の文字列'
  };
  const ORDER_LABELS = {
    none: '並びなし',
    asc: '昇順',
    desc: '降順',
    strictAsc: '狭義の昇順',
    strictDesc: '狭義の降順'
  };
  const LAYOUT_LABELS = { row: '横1行', column: '縦に1個ずつ' };
  const CHARSET_LABELS = { lower: '英小文字', upper: '英大文字', digit: '数字', custom: '使う文字を指定' };
  const COUNTER_KIND_LABELS = { mismatch: '出力が違う', mainError: '実行時エラー', mainTimeout: '時間切れ' };
  const PREVIEW_LIMIT = 20000;

  const $ = (id) => document.getElementById(id);
  const rowsContainer = $('verifyRows');
  const rowsEmpty = $('verifyRowsEmpty');
  const example = $('verifyExample');
  const mainFileLabel = $('verifyMainFile');
  const naiveFileLabel = $('verifyNaiveFile');
  const saveStatus = $('verifySaveStatus');
  const formatSummary = $('verifyFormatSummary');
  const importStatus = $('verifyImportStatus');
  const undoImportButton = $('verifyUndoImport');
  const iterationsInput = $('verifyIterations');
  const compareModeSelect = $('verifyCompareMode');
  const seedInput = $('verifySeed');
  const startButton = $('verifyStart');
  const cancelButton = $('verifyCancel');
  const progressBox = $('verifyProgressBox');
  const progress = $('verifyProgress');
  const progressText = $('verifyProgressText');
  const stressStatus = $('verifyStressStatus');
  const stressSummary = $('verifyStressSummary');
  const resultBox = $('verifyResult');
  const createNaiveButton = $('verifyCreateNaive');
  const counterCount = $('verifyCounterCount');
  const counterList = $('verifyCounterList');
  const counterStatus = $('verifyCounterStatus');
  const recheckButton = $('verifyRecheck');
  const regenerateButton = $('verifyRegenerate');
  const modeLabel = $('verifyMode');
  const useNaiveCheckbox = $('verifyUseNaive');
  const useNaiveLabel = $('verifyUseNaiveLabel');
  const naiveIntro = $('verifyNaiveIntro');
  const chooseNaiveButton = $('verifyChooseNaive');
  const counterEmpty = $('verifyCounterEmpty');
  const counterActions = $('verifyCounterActions');

  let format = { rows: [] };
  let errors = [];
  let hasTarget = false;
  let naive = { file: '', exists: false };
  let busy = false;
  let formatTimer = null;
  let formatBeforeImport = null;
  let counterexamples = [];
  let recheckResults = {};
  let requestCounter = 0;
  const pendingRowRequests = {};

  function el(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) {
        return;
      }
      if (key === 'text') {
        node.textContent = value;
      } else if (key === 'className') {
        node.className = value;
      } else {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    });
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child) {
        node.append(child);
      }
    });
    return node;
  }

  function setStatus(node, message, tone = '') {
    node.textContent = message || '';
    node.className = tone ? 'verifyStatus ' + tone : 'verifyStatus';
  }

  function previewText(text) {
    const value = String(text || '');
    return value.length > PREVIEW_LIMIT
      ? value.slice(0, PREVIEW_LIMIT) + '\n…（長いので途中まで表示しています）'
      : value;
  }

  // Renders text into a pre, marking the given 0-based lines.
  function fillMarkedPre(pre, text, markedLines = []) {
    const marked = new Set(markedLines);
    pre.replaceChildren();
    const lines = previewText(text).split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.forEach((line, index) => {
      const span = el('span', { className: marked.has(index) ? 'verifyDiffLine' : '' });
      span.textContent = line + '\n';
      pre.append(span);
    });
  }

  function existingNames() {
    const names = [];
    format.rows.forEach((row) => {
      if (row.kind === 'ints') {
        (row.vars || []).forEach((variable) => names.push(variable.name));
      } else {
        names.push(row.name);
      }
    });
    return names.filter(Boolean);
  }

  // Variables a field may reference: earlier rows, plus vars to the left in the same ints row.
  function variablesBefore(rowIndex, varIndex = 0) {
    const names = [];
    format.rows.slice(0, rowIndex).forEach((row) => {
      if (row.kind === 'ints') {
        (row.vars || []).forEach((variable) => names.push(variable.name));
      }
    });
    const row = format.rows[rowIndex];
    if (row && row.kind === 'ints') {
      (row.vars || []).slice(0, varIndex).forEach((variable) => names.push(variable.name));
    }
    return names.filter(Boolean);
  }

  function refreshDatalists() {
    rowsContainer.querySelectorAll('datalist[data-row]').forEach((list) => {
      const names = variablesBefore(Number(list.dataset.row), Number(list.dataset.var || 0));
      list.replaceChildren(...names.map((name) => el('option', { value: name })));
    });
  }

  function scheduleFormatChange() {
    clearTimeout(formatTimer);
    formatTimer = setTimeout(postFormat, 200);
  }

  function postFormat() {
    clearTimeout(formatTimer);
    formatTimer = null;
    vscode.postMessage({ type: 'verifyFormatChanged', format });
  }

  function fieldId(rowIndex, path) {
    return 'verifyField-' + rowIndex + '-' + path.replace(/\./g, '-');
  }

  function errorSpan(rowIndex, path) {
    return el('span', { className: 'verifyFieldError', 'data-error-for': rowIndex + ':' + path, 'aria-live': 'polite' });
  }

  // size: 'name' for short names (N, A, S), 'expr' for numbers and expressions (2×10^5, N-1).
  function textInput(row, key, rowIndex, path, { label, listId, placeholder, onChange, size = 'expr' } = {}) {
    const input = el('input', {
      id: fieldId(rowIndex, path),
      className: 'verifyInput-' + size,
      type: 'text',
      value: row[key] === undefined ? '' : row[key],
      list: listId,
      placeholder,
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': label,
      'data-row': rowIndex,
      'data-path': path
    });
    input.addEventListener('input', () => {
      row[key] = input.value;
      if (onChange) {
        onChange();
      }
      scheduleFormatChange();
    });
    return input;
  }

  function selectInput(row, key, rowIndex, path, labels, { label, onChange } = {}) {
    const select = el('select', { id: fieldId(rowIndex, path), 'aria-label': label, 'data-row': rowIndex, 'data-path': path });
    Object.entries(labels).forEach(([value, text]) => {
      select.append(el('option', { value, text }));
    });
    select.value = row[key];
    select.addEventListener('change', () => {
      row[key] = select.value;
      if (onChange) {
        onChange();
      }
      scheduleFormatChange();
    });
    return select;
  }

  // Labels stay short; longer explanations go to the tooltip (title).
  function field(labelText, control, rowIndex, path, title) {
    return el('div', { className: 'verifyField', title }, [
      el('label', { for: control.id, text: labelText }),
      control,
      errorSpan(rowIndex, path)
    ]);
  }

  function rangeField(labelText, row, rowIndex, listId, title, minKey = 'min', maxKey = 'max') {
    const rowLabel = (rowIndex + 1) + '行目の' + labelText;
    // An empty lower bound of a length means "fixed length", so no example value is shown there.
    const minPlaceholder = minKey === 'min' ? '1' : '';
    const minInput = textInput(row, minKey, rowIndex, minKey, { label: rowLabel + 'の下限', listId, placeholder: minPlaceholder });
    const maxInput = textInput(row, maxKey, rowIndex, maxKey, { label: rowLabel + 'の上限', listId, placeholder: '2×10^5' });
    return el('div', { className: 'verifyField', title }, [
      el('span', { className: 'verifyBlockLabel', text: labelText }),
      el('div', { className: 'verifyRange' }, [minInput, el('span', { text: '〜' }), maxInput]),
      errorSpan(rowIndex, minKey),
      errorSpan(rowIndex, maxKey)
    ]);
  }

  function datalist(rowIndex, varIndex = 0) {
    const id = 'verifyVars-' + rowIndex + '-' + varIndex;
    const list = el('datalist', { id, 'data-row': rowIndex, 'data-var': varIndex });
    return { id, list };
  }

  function renderIntsFields(row, rowIndex) {
    const container = el('div', { className: 'verifyVarList' });
    (row.vars || []).forEach((variable, varIndex) => {
      const { id: listId, list } = datalist(rowIndex, varIndex);
      const base = 'vars.' + varIndex + '.';
      const label = (rowIndex + 1) + '行目の' + (varIndex + 1) + '番目の変数';
      const nameInput = textInput(variable, 'name', rowIndex, base + 'name', {
        label: label + 'の名前', placeholder: 'N', onChange: refreshDatalists, size: 'name'
      });
      const minInput = textInput(variable, 'min', rowIndex, base + 'min', { label: label + 'の下限', listId, placeholder: '1' });
      const maxInput = textInput(variable, 'max', rowIndex, base + 'max', { label: label + 'の上限', listId, placeholder: '2×10^5' });
      const removeButton = el('button', {
        type: 'button', className: 'verifyIconButton', 'aria-label': label + 'を消す', title: '変数を消す', text: '×'
      });
      removeButton.addEventListener('click', () => {
        row.vars.splice(varIndex, 1);
        renderRows();
        postFormat();
      });
      container.append(
        el('div', { className: 'verifyVar' }, [nameInput, minInput, el('span', { text: '〜' }), maxInput, removeButton]),
        errorSpan(rowIndex, base + 'name'),
        errorSpan(rowIndex, base + 'min'),
        errorSpan(rowIndex, base + 'max'),
        list
      );
    });
    const addButton = el('button', { type: 'button', className: 'verifySmallButton verifySecondary', text: '+ 変数' });
    addButton.addEventListener('click', () => requestRow('ints', (newRow) => {
      row.vars = row.vars || [];
      row.vars.push(newRow.vars[0]);
      renderRows();
      postFormat();
      const inputs = rowsContainer.querySelectorAll('[data-row="' + rowIndex + '"][data-path$=".name"]');
      if (inputs.length) {
        inputs[inputs.length - 1].focus();
      }
    }));
    container.title = '1行に空白区切りで並べる整数です（名前・下限〜上限）';
    return [
      container,
      errorSpan(rowIndex, 'vars'),
      el('div', { className: 'verifyButtons' }, addButton)
    ];
  }

  function distinctField(row, rowIndex) {
    const checkbox = el('input', { type: 'checkbox', id: fieldId(rowIndex, 'distinct'), 'data-row': rowIndex, 'data-path': 'distinct' });
    checkbox.checked = Boolean(row.distinct);
    checkbox.addEventListener('change', () => {
      row.distinct = checkbox.checked;
      scheduleFormatChange();
    });
    return el('div', { className: 'verifyField' }, [
      el('label', { className: 'verifyCheck', for: checkbox.id }, [checkbox, el('span', { text: 'すべて異なる' })]),
      errorSpan(rowIndex, 'distinct')
    ]);
  }

  function renderRowFields(row, rowIndex) {
    if (row.kind === 'ints') {
      return renderIntsFields(row, rowIndex);
    }
    const { id: listId, list } = datalist(rowIndex);
    const label = (text) => (rowIndex + 1) + '行目の' + text;
    const fields = [field('名前', textInput(row, 'name', rowIndex, 'name', { label: label('名前'), size: 'name' }), rowIndex, 'name')];
    if (row.kind === 'intList') {
      fields.push(
        field('個数', textInput(row, 'length', rowIndex, 'length', { label: label('個数'), listId, placeholder: 'N' }), rowIndex, 'length'),
        rangeField('範囲', row, rowIndex, listId, '値の下限〜上限'),
        field('並べ方', selectInput(row, 'layout', rowIndex, 'layout', LAYOUT_LABELS, { label: label('並べ方') }), rowIndex, 'layout'),
        field('並び', selectInput(row, 'order', rowIndex, 'order', ORDER_LABELS, { label: label('並び') }), rowIndex, 'order'),
        distinctField(row, rowIndex)
      );
    } else if (row.kind === 'matrix') {
      fields.push(
        field('行数', textInput(row, 'rows', rowIndex, 'rows', { label: label('行数'), listId, placeholder: 'H' }), rowIndex, 'rows'),
        field('列数', textInput(row, 'cols', rowIndex, 'cols', { label: label('列数'), listId, placeholder: 'W' }), rowIndex, 'cols'),
        rangeField('範囲', row, rowIndex, listId, '値の下限〜上限')
      );
    } else if (row.kind === 'string' || row.kind === 'grid') {
      if (row.kind === 'string') {
        fields.push(rangeField('長さ', row, rowIndex, listId, '文字列の長さ。下限を空にすると、長さは上限で固定です', 'minLength', 'maxLength'));
      } else {
        fields.push(
          field('行数', textInput(row, 'rows', rowIndex, 'rows', { label: label('行数'), listId, placeholder: 'H' }), rowIndex, 'rows'),
          rangeField('長さ', row, rowIndex, listId, '1行の長さ。下限を空にすると、すべての行が上限の長さ（グリッド）になります', 'minCols', 'cols')
        );
      }
      fields.push(field('文字', selectInput(row, 'charset', rowIndex, 'charset', CHARSET_LABELS, {
        label: label('文字の種類'),
        onChange: () => {
          renderRows();
          if (row.charset === 'custom') {
            const charsInput = $(fieldId(rowIndex, 'chars'));
            if (charsInput) {
              charsInput.focus();
            }
          }
        }
      }), rowIndex, 'charset'));
      if (row.charset === 'custom') {
        fields.push(field('使う文字', textInput(row, 'chars', rowIndex, 'chars', { label: label('使う文字'), placeholder: '.#', size: 'name' }), rowIndex, 'chars'));
      }
      if (row.kind === 'grid') {
        fields.push(distinctField(row, rowIndex));
      }
    }
    return [el('div', { className: 'verifyFields' }, fields), list];
  }

  function moveRow(rowIndex, delta) {
    const target = rowIndex + delta;
    if (target < 0 || target >= format.rows.length) {
      return;
    }
    const [row] = format.rows.splice(rowIndex, 1);
    format.rows.splice(target, 0, row);
    renderRows();
    postFormat();
    const button = rowsContainer.querySelector('[data-row-index="' + target + '"] [data-action="' + (delta < 0 ? 'up' : 'down') + '"]');
    if (button && !button.disabled) {
      button.focus();
    } else {
      const select = $(fieldId(target, 'kind'));
      if (select) {
        select.focus();
      }
    }
  }

  function renderRow(row, rowIndex) {
    const card = el('div', {
      className: row.needsReview ? 'verifyRow needsReview' : 'verifyRow',
      role: 'group',
      'aria-label': (rowIndex + 1) + '行目',
      'data-row-index': rowIndex
    });
    const kindSelect = el('select', { id: fieldId(rowIndex, 'kind'), 'aria-label': (rowIndex + 1) + '行目の種類' });
    Object.entries(KIND_LABELS).forEach(([value, text]) => kindSelect.append(el('option', { value, text })));
    kindSelect.value = row.kind;
    kindSelect.addEventListener('change', () => {
      const names = existingNames().filter((name) => name !== row.name);
      requestRow(kindSelect.value, (newRow) => {
        format.rows[rowIndex] = newRow;
        renderRows();
        postFormat();
        const select = $(fieldId(rowIndex, 'kind'));
        if (select) {
          select.focus();
        }
      }, names);
    });
    const upButton = el('button', { type: 'button', className: 'verifyIconButton', 'data-action': 'up', 'aria-label': (rowIndex + 1) + '行目を上へ', title: '上へ', text: '↑' });
    const downButton = el('button', { type: 'button', className: 'verifyIconButton', 'data-action': 'down', 'aria-label': (rowIndex + 1) + '行目を下へ', title: '下へ', text: '↓' });
    const removeButton = el('button', { type: 'button', className: 'verifyIconButton', 'aria-label': (rowIndex + 1) + '行目を消す', title: 'この行を消す', text: '×' });
    upButton.disabled = rowIndex === 0;
    downButton.disabled = rowIndex === format.rows.length - 1;
    upButton.addEventListener('click', () => moveRow(rowIndex, -1));
    downButton.addEventListener('click', () => moveRow(rowIndex, 1));
    removeButton.addEventListener('click', () => {
      format.rows.splice(rowIndex, 1);
      renderRows();
      postFormat();
      const next = $(fieldId(Math.min(rowIndex, format.rows.length - 1), 'kind'));
      (next || $('verifyAddRow')).focus();
    });
    card.append(el('div', { className: 'verifyRowHeader' }, [
      el('span', { className: 'verifyRowNumber', text: (rowIndex + 1) + '行目' }),
      kindSelect,
      upButton,
      downButton,
      removeButton
    ]));
    if (row.needsReview) {
      const confirmButton = el('button', { type: 'button', className: 'verifySmallButton verifySecondary', text: '確認した' });
      confirmButton.addEventListener('click', () => {
        row.needsReview = false;
        row.reviewReason = '';
        renderRows();
        postFormat();
        const select = $(fieldId(rowIndex, 'kind'));
        if (select) {
          select.focus();
        }
      });
      card.append(el('div', { className: 'verifyReview' }, [
        el('span', { className: 'verifyReviewBadge', text: '要確認' }),
        el('span', { text: row.reviewReason || '読み取った内容を確かめてください。' }),
        confirmButton
      ]));
    }
    card.append(...renderRowFields(row, rowIndex));
    card.append(el('span', { className: 'verifyRowError', 'data-error-for': rowIndex + ':', 'aria-live': 'polite' }));
    return card;
  }

  function renderRows() {
    rowsContainer.replaceChildren(...format.rows.map((row, rowIndex) => renderRow(row, rowIndex)));
    rowsEmpty.hidden = format.rows.length > 0;
    refreshDatalists();
    applyErrors();
  }

  function applyErrors() {
    rowsContainer.querySelectorAll('[data-error-for]').forEach((span) => {
      span.textContent = '';
    });
    rowsContainer.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
    errors.forEach((error) => {
      const key = error.rowIndex + ':' + (error.path || '');
      const span = rowsContainer.querySelector('[data-error-for="' + key + '"]')
        || rowsContainer.querySelector('[data-error-for="' + error.rowIndex + ':"]');
      if (span) {
        span.textContent = span.textContent ? span.textContent + ' / ' + error.message : error.message;
      }
      const input = rowsContainer.querySelector('[data-row="' + error.rowIndex + '"][data-path="' + error.path + '"]');
      if (input) {
        input.setAttribute('aria-invalid', 'true');
      }
    });
    const reviewCount = format.rows.filter((row) => row.needsReview).length;
    const parts = [];
    if (format.rows.length) {
      parts.push(format.rows.length + '行');
    }
    if (errors.length) {
      parts.push('誤り ' + errors.length);
    }
    if (reviewCount) {
      parts.push('要確認 ' + reviewCount);
    }
    formatSummary.textContent = parts.join('・');
  }

  function requestRow(kind, callback, names = existingNames()) {
    requestCounter += 1;
    const requestId = 'row-' + requestCounter;
    pendingRowRequests[requestId] = callback;
    vscode.postMessage({ type: 'verifyRequestRow', requestId, kind, existingNames: names });
  }

  function setBusy(value) {
    busy = value;
    startButton.disabled = value || !hasTarget;
    cancelButton.disabled = !value;
    recheckButton.disabled = value || !hasTarget || counterexamples.length === 0;
    regenerateButton.disabled = value || !hasTarget || counterexamples.length === 0;
    counterList.querySelectorAll('[data-delete-counterexample]').forEach((button) => {
      button.disabled = value;
    });
  }

  // Shows the naive solution state in one place: the mode line next to 開始 and the
  // (normally closed) 愚直解と比べる section.
  function renderNaiveState() {
    const comparing = naive.exists && useNaiveCheckbox.checked;
    if (!hasTarget) {
      modeLabel.textContent = '';
    } else if (comparing) {
      modeLabel.textContent = '愚直解 ' + naive.file + ' と出力を比べます';
    } else if (naive.exists) {
      modeLabel.textContent = '愚直解は使わず、エラーと時間切れを確かめます';
    } else {
      modeLabel.textContent = '愚直解なし：エラーと時間切れを確かめます';
    }
    naiveFileLabel.textContent = naive.file || '-';
    useNaiveLabel.hidden = !naive.exists;
    naiveIntro.hidden = naive.exists;
    createNaiveButton.hidden = !hasTarget || naive.exists;
    chooseNaiveButton.textContent = naive.exists ? '別のファイルにする' : 'ファイルを選ぶ';
    chooseNaiveButton.disabled = !hasTarget;
    compareModeSelect.disabled = !comparing;
    regenerateButton.hidden = !naive.exists;
  }

  function readIterations() {
    const value = Math.floor(Number(iterationsInput.value));
    return Number.isFinite(value) ? Math.min(Math.max(value, 1), 10000) : 100;
  }

  function postSettings() {
    vscode.postMessage({
      type: 'verifySettingsChanged',
      compareMode: compareModeSelect.value,
      iterations: readIterations(),
      useNaive: useNaiveCheckbox.checked
    });
  }

  function sendToRun(input) {
    sendInputToRun(String(input || ''));
  }

  function block(labelText, text, { markedLines = [], action } = {}) {
    const pre = el('pre');
    fillMarkedPre(pre, text, markedLines);
    return el('div', { className: 'verifyBlock' }, [
      el('span', { className: 'verifyBlockLabel' }, [el('span', { text: labelText }), action]),
      pre
    ]);
  }

  function sendToRunButton(input) {
    const button = el('button', { type: 'button', className: 'verifySmallButton', text: '実行タブに送る' });
    button.addEventListener('click', () => sendToRun(input));
    return button;
  }

  function renderStressResult(result) {
    const failed = result.status !== 'passed' && result.status !== 'cancelled';
    resultBox.hidden = false;
    resultBox.className = failed ? 'verifyResult failed' : 'verifyResult';
    const children = [
      el('span', { className: 'verifyResultTitle ' + (failed ? 'failed' : 'passed'), text: result.message || '' })
    ];
    const meta = [];
    if (result.seed !== undefined && result.seed !== null) {
      meta.push('シード値 ' + result.seed);
    }
    if (failed && Number.isInteger(result.iteration)) {
      meta.push((result.iteration + 1) + ' 回目');
    }
    if (failed && result.mode) {
      meta.push(result.mode === 'max' ? '最大サイズの入力' : '小さい入力');
    }
    if (meta.length) {
      children.push(el('span', { className: 'verifyStatus', text: meta.join('・') }));
    }
    if (typeof result.input === 'string' && result.input) {
      children.push(block('入力', result.input, { action: sendToRunButton(result.input) }));
    } else if (result.inputTooLarge) {
      children.push(el('span', { className: 'verifyStatus', text: '入力が大きすぎるため表示しません。同じシード値で作り直せます。' }));
    }
    const comparison = result.comparison || {};
    if (result.mainResult || result.naiveResult) {
      const outputs = [];
      if (result.mainResult) {
        outputs.push(block('本番の出力', result.mainResult.stdout, { markedLines: comparison.actualDiffLines || [] }));
      }
      if (result.naiveResult) {
        outputs.push(block('愚直解の出力', result.naiveResult.stdout, { markedLines: comparison.expectedDiffLines || [] }));
      }
      children.push(el('div', { className: 'verifyCompare' }, outputs));
    }
    if (result.errorText) {
      children.push(block('エラーの内容', result.errorText));
    }
    resultBox.replaceChildren(...children);
  }

  function renderCounterexamples() {
    counterCount.textContent = String(counterexamples.length);
    counterEmpty.hidden = counterexamples.length > 0;
    counterActions.hidden = counterexamples.length === 0;
    counterList.replaceChildren(...counterexamples.map((counterexample, index) => {
      const recheck = recheckResults[counterexample.id];
      const header = el('div', { className: 'verifyCounterHeader' }, [
        el('span', { text: '#' + (index + 1) + ' ' + (COUNTER_KIND_LABELS[counterexample.kind] || '反例') })
      ]);
      if (recheck) {
        header.append(el('span', {
          className: 'verifyCounterMark ' + (recheck.status === 'ok' ? 'ok' : 'failed'),
          text: recheck.message
        }));
      }
      const deleteButton = el('button', {
        type: 'button',
        className: 'verifySmallButton verifySecondary',
        'aria-label': '#' + (index + 1) + ' の反例を消す',
        'data-delete-counterexample': counterexample.id,
        text: '消す'
      });
      deleteButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'verifyDeleteCounterexample', id: counterexample.id });
      });
      const details = el('details', {}, [
        el('summary', { text: '入力と出力を見る' }),
        block('入力', counterexample.input),
        block('期待する出力（愚直解）', counterexample.expected === null
          ? '（まだありません。愚直解を用意して「期待する出力を作り直す」を押すと入ります）'
          : counterexample.expected, {
          markedLines: recheck && recheck.comparison ? recheck.comparison.expectedDiffLines : []
        })
      ]);
      if (recheck && recheck.output !== undefined) {
        details.append(block('本番の出力（確かめた結果）', recheck.output, {
          markedLines: recheck.comparison ? recheck.comparison.actualDiffLines : []
        }));
      }
      if (recheck && recheck.errorText) {
        details.append(block('エラーの内容', recheck.errorText));
      }
      if (recheck && recheck.status !== 'ok') {
        details.open = true;
      }
      return el('li', { className: 'verifyCounter' }, [
        header,
        details,
        el('div', { className: 'verifyButtons' }, [sendToRunButton(counterexample.input), deleteButton])
      ]);
    }));
    setBusy(busy);
  }

  function applyLoaded(message) {
    const target = message.target;
    hasTarget = Boolean(target);
    mainFileLabel.textContent = target ? target.mainFile : 'Python ファイルを開いてください';
    naive = { file: target ? target.naiveFile : '', exists: Boolean(target && target.naiveExists) };
    const data = message.data || {};
    useNaiveCheckbox.checked = data.useNaive !== false;
    renderNaiveState();
    format = data.format && Array.isArray(data.format.rows) ? data.format : { rows: [] };
    compareModeSelect.value = data.compareMode || 'tokens';
    iterationsInput.value = String(data.iterations || 100);
    counterexamples = Array.isArray(data.counterexamples) ? data.counterexamples : [];
    recheckResults = {};
    errors = [];
    formatBeforeImport = null;
    undoImportButton.hidden = true;
    setStatus(saveStatus, (message.warnings || []).join(' '), message.warnings && message.warnings.length ? 'error' : '');
    renderRows();
    renderCounterexamples();
    setBusy(busy);
    postFormat();
  }

  $('verifyAddRow').addEventListener('click', () => {
    requestRow($('verifyAddRowKind').value, (row) => {
      format.rows.push(row);
      renderRows();
      postFormat();
      const select = $(fieldId(format.rows.length - 1, 'kind'));
      if (select) {
        select.focus();
      }
    });
  });

  $('verifyFetchProblem').addEventListener('click', () => {
    setStatus(importStatus, '問題を読み込んでいます...');
    vscode.postMessage({ type: 'verifyFetchProblem', url: $('verifyProblemUrl').value.trim() });
  });

  $('verifyParseText').addEventListener('click', () => {
    setStatus(importStatus, '読み取っています...');
    vscode.postMessage({ type: 'verifyParseText', text: $('verifyProblemText').value });
  });

  undoImportButton.addEventListener('click', () => {
    if (!formatBeforeImport) {
      return;
    }
    format = formatBeforeImport;
    formatBeforeImport = null;
    undoImportButton.hidden = true;
    setStatus(importStatus, '読み取る前の入力形式に戻しました。');
    renderRows();
    postFormat();
    $('verifyFetchProblem').focus();
  });

  iterationsInput.addEventListener('change', postSettings);
  compareModeSelect.addEventListener('change', postSettings);

  startButton.addEventListener('click', () => {
    if (busy) {
      return;
    }
    postFormat();
    setBusy(true);
    resultBox.hidden = true;
    progressBox.hidden = false;
    progress.max = readIterations();
    progress.value = 0;
    setStatus(progressText, '準備しています...');
    setStatus(stressStatus, '');
    stressSummary.textContent = '実行中';
    vscode.postMessage({
      type: 'verifyStart',
      iterations: readIterations(),
      compareMode: compareModeSelect.value,
      seed: seedInput.value.trim()
    });
  });

  cancelButton.addEventListener('click', () => {
    cancelButton.disabled = true;
    vscode.postMessage({ type: 'verifyCancel' });
  });

  $('verifyChooseNaive').addEventListener('click', () => vscode.postMessage({ type: 'verifyChooseNaive' }));
  createNaiveButton.addEventListener('click', () => vscode.postMessage({ type: 'verifyCreateNaive' }));
  useNaiveCheckbox.addEventListener('change', () => {
    renderNaiveState();
    postSettings();
  });

  recheckButton.addEventListener('click', () => {
    setBusy(true);
    setStatus(counterStatus, '保存した反例で確かめています...');
    vscode.postMessage({ type: 'verifyRecheck', compareMode: compareModeSelect.value });
  });

  regenerateButton.addEventListener('click', () => {
    setBusy(true);
    setStatus(counterStatus, '愚直解で期待する出力を作り直しています...');
    vscode.postMessage({ type: 'verifyRegenerateExpected' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('verify')) {
      return;
    }
    if (message.type === 'verifyLoaded') {
      applyLoaded(message);
    } else if (message.type === 'verifyFormatStatus') {
      errors = Array.isArray(message.errors) ? message.errors : [];
      applyErrors();
      if (message.example) {
        example.textContent = message.example;
      } else {
        example.textContent = message.exampleError ? '（' + message.exampleError + '）' : '';
      }
    } else if (message.type === 'verifySaved') {
      setStatus(saveStatus, message.message, message.failed ? 'error' : '');
    } else if (message.type === 'verifyRowCreated') {
      const callback = pendingRowRequests[message.requestId];
      delete pendingRowRequests[message.requestId];
      if (callback && message.row) {
        callback(message.row);
      }
    } else if (message.type === 'verifyImportResult') {
      if (!message.ok) {
        setStatus(importStatus, message.message, 'error');
        return;
      }
      formatBeforeImport = format;
      undoImportButton.hidden = false;
      format = message.format;
      const reviewCount = format.rows.filter((row) => row.needsReview).length;
      const notes = [reviewCount ? '「要確認」の行を確かめてください。' : '', ...(message.warnings || [])].filter(Boolean);
      setStatus(importStatus, '読み取りました（' + format.rows.length + '行）。' + notes.join(' '), reviewCount ? '' : 'ok');
      renderRows();
      postFormat();
    } else if (message.type === 'verifyProgress') {
      progress.max = message.total;
      progress.value = message.iteration;
      setStatus(progressText, message.text || '');
    } else if (message.type === 'verifyStressResult') {
      setBusy(false);
      progressBox.hidden = true;
      stressSummary.textContent = message.summary || '';
      setStatus(stressStatus, '');
      renderStressResult(message);
    } else if (message.type === 'verifyStressStopped') {
      setBusy(false);
      progressBox.hidden = true;
      stressSummary.textContent = '';
      setStatus(stressStatus, message.message, 'error');
      if (message.showCreateNaive) {
        $('verifyNaiveSection').open = true;
      }
    } else if (message.type === 'verifyCounterexamples') {
      counterexamples = Array.isArray(message.counterexamples) ? message.counterexamples : [];
      if (message.clearRecheck) {
        recheckResults = {};
      }
      renderCounterexamples();
      if (message.message !== undefined) {
        setBusy(false);
        setStatus(counterStatus, message.message, message.failed ? 'error' : '');
      }
    } else if (message.type === 'verifyRecheckResult') {
      recheckResults = {};
      (message.results || []).forEach((result) => {
        recheckResults[result.id] = result;
      });
      setBusy(false);
      setStatus(counterStatus, message.message, message.allPassed ? 'ok' : 'error');
      renderCounterexamples();
    } else if (message.type === 'verifyNotice') {
      setBusy(false);
      setStatus(counterStatus, message.message, 'error');
    }
  });

  renderRows();
  renderCounterexamples();
  renderNaiveState();
  setBusy(false);
}

module.exports = {
  VERIFY_MARKUP,
  VERIFY_STYLES,
  initVerifyWorkspace
};
