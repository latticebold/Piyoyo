'use strict';

// Markup, styles, and the browser-side script of the 計算量 section in the 検証 tab.
// initComplexitySection is injected into the webview via toString(), so it must stay
// self-contained (no closures over this module).

const COMPLEXITY_STYLES = `
    .complexityHeadline {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 14px;
      align-items: baseline;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }

    .complexityHeadline strong {
      color: var(--piyoyo-text);
      font-size: 14px;
    }

    .complexityVerdict {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
      align-items: baseline;
      font-size: var(--piyoyo-font-small);
    }

    .complexityVerdictLabel {
      padding: 0 6px;
      border: 1px solid currentColor;
      border-radius: 4px;
      font-weight: 700;
    }

    .complexityVerdictLabel.safe {
      color: var(--piyoyo-yellow);
    }

    .complexityVerdictLabel.tight {
      color: var(--piyoyo-orange);
    }

    .complexityVerdictLabel.tle {
      color: var(--vscode-errorForeground);
    }

    .complexityBinding {
      display: grid;
      grid-template-columns: minmax(40px, auto) minmax(0, 1fr) minmax(0, 1fr);
      gap: 4px 6px;
      align-items: center;
      font-size: var(--piyoyo-font-small);
    }

    .complexityList {
      display: grid;
      gap: 2px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }

    .complexityLineButton {
      width: 100%;
      min-height: 0;
      padding: 2px 6px;
      border-color: transparent;
      color: var(--vscode-foreground);
      background: transparent;
      font-size: var(--piyoyo-font-small);
      text-align: left;
    }

    .complexityLineButton:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .complexityLineNumber {
      color: var(--piyoyo-muted);
      margin-right: 6px;
    }

    .complexitySection details > summary {
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
    }
`;

const COMPLEXITY_MARKUP = `
      <details id="complexitySection" class="verifySection complexitySection" open>
        <summary>計算量<span id="complexitySummary" class="summaryValue"></span></summary>
        <div class="verifySectionBody">
          <div class="verifyButtons">
            <button id="complexityAnalyze" type="button">解析</button>
            <button id="complexityMeasure" class="verifySecondary" type="button">実測</button>
            <button id="complexityCancel" class="verifySecondary" type="button" hidden>中止</button>
          </div>
          <span id="complexityMeasureHint" class="verifyStatus"></span>
          <span id="complexityStatus" class="verifyStatus" aria-live="polite"></span>
          <div id="complexityResult" class="verifyRows" hidden>
            <div class="complexityHeadline">
              <span>時間 <strong id="complexityTime"></strong></span>
              <span>領域 <strong id="complexitySpace"></strong></span>
              <span>推定: <strong id="complexityConfidence"></strong></span>
            </div>
            <div id="complexityVerdict" class="complexityVerdict" aria-live="polite"></div>
            <span id="complexitySpeed" class="verifyStatus"></span>
            <div id="complexityBindings" class="verifyVarList" aria-label="変数の上限"></div>
            <details id="complexityBreakdown">
              <summary>内訳（行ごと）</summary>
              <ol id="complexityLines" class="complexityList"></ol>
            </details>
            <details id="complexityWarnings">
              <summary>警告 (<span id="complexityWarningCount">0</span>)</summary>
              <ul id="complexityWarningList" class="complexityList"></ul>
            </details>
            <details id="complexityMeasureDetails" hidden>
              <summary>実測</summary>
              <div id="complexityMeasureResult" class="verifyStatus"></div>
            </details>
          </div>
        </div>
      </details>
`;

function initComplexitySection({ vscode }) {
  const SOURCE_LABELS = { name: '名前で対応', order: '読む順で対応', manual: '選び直し' };
  const $ = (id) => document.getElementById(id);
  const analyzeButton = $('complexityAnalyze');
  const measureButton = $('complexityMeasure');
  const cancelButton = $('complexityCancel');
  const measureHint = $('complexityMeasureHint');
  const status = $('complexityStatus');
  const summary = $('complexitySummary');
  const resultBox = $('complexityResult');
  const bindingsBox = $('complexityBindings');
  const linesList = $('complexityLines');
  const warningList = $('complexityWarningList');
  const warningCount = $('complexityWarningCount');
  const measureDetails = $('complexityMeasureDetails');
  const measureResult = $('complexityMeasureResult');

  let busy = false;
  let canMeasure = false;

  function el(tag, attributes = {}, text) {
    const node = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) {
        return;
      }
      if (key === 'className') {
        node.className = value;
      } else {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    });
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function listItem(child) {
    const item = el('li');
    item.append(child);
    return item;
  }

  function setStatus(message, tone = '') {
    status.textContent = message || '';
    status.className = tone ? 'verifyStatus ' + tone : 'verifyStatus';
  }

  function updateButtons() {
    analyzeButton.disabled = busy;
    measureButton.disabled = busy || !canMeasure;
    cancelButton.hidden = !busy;
  }

  function renderBindings(message) {
    const rows = [];
    const formatVars = Array.isArray(message.formatVars) ? message.formatVars : [];
    const items = [
      ...(message.bindings || []),
      ...(message.unbound || []).map((symbol) => ({ symbol, display: symbol, unbound: true }))
    ];
    items.forEach((binding) => {
      const select = el('select', { 'aria-label': binding.symbol + ' の上限の決め方' });
      select.append(el('option', { value: '' }, binding.unbound ? '（決まっていません）' : '自動'));
      formatVars.forEach((name) => select.append(el('option', { value: 'var:' + name }, '入力形式の ' + name)));
      select.append(el('option', { value: 'value' }, '数値を入れる'));
      const input = el('input', {
        type: 'text',
        inputmode: 'numeric',
        placeholder: '例: 2×10^5',
        'aria-label': binding.symbol + ' の上限'
      });
      if (binding.source === 'manual' && binding.formatVar) {
        select.value = 'var:' + binding.formatVar;
      } else if (binding.source === 'manual') {
        select.value = 'value';
        input.value = binding.valueText || '';
      }
      input.hidden = select.value !== 'value';
      const post = () => {
        if (select.value === '') {
          vscode.postMessage({ type: 'complexityBindingChanged', symbol: binding.symbol, clear: true });
        } else if (select.value === 'value') {
          if (input.value.trim()) {
            vscode.postMessage({ type: 'complexityBindingChanged', symbol: binding.symbol, value: input.value.trim() });
          }
        } else {
          vscode.postMessage({ type: 'complexityBindingChanged', symbol: binding.symbol, formatVar: select.value.slice(4) });
        }
      };
      select.addEventListener('change', () => {
        input.hidden = select.value !== 'value';
        if (!input.hidden) {
          input.focus();
        }
        post();
      });
      input.addEventListener('change', post);
      const description = binding.unbound
        ? '上限を選ぶか入れてください'
        : binding.display + ' = ' + (binding.valueText || '?') + '（' + (SOURCE_LABELS[binding.source] || '') + '）';
      const controls = el('div', { className: 'verifyRange' });
      controls.append(select, el('span'), input);
      const row = el('div', { className: 'complexityBinding' });
      row.append(el('code', {}, binding.symbol), el('span', {}, description), controls);
      rows.push(row);
    });
    bindingsBox.replaceChildren(...rows);
    bindingsBox.hidden = rows.length === 0;
  }

  function renderResult(message) {
    if (!message.ok) {
      resultBox.hidden = true;
      summary.textContent = '';
      setStatus(message.message, 'error');
      return;
    }
    resultBox.hidden = false;
    setStatus(message.fileName ? message.fileName + ' を解析しました。' : '');
    $('complexityTime').textContent = message.time;
    $('complexitySpace').textContent = message.space;
    $('complexityConfidence').textContent = message.confidenceLabel;
    const verdictBox = $('complexityVerdict');
    verdictBox.replaceChildren();
    if (message.verdict) {
      verdictBox.append(
        el('span', {}, message.verdict.text),
        el('span', { className: 'complexityVerdictLabel ' + message.verdict.verdict }, message.verdict.label)
      );
      summary.textContent = message.time + '・' + message.verdict.label;
    } else {
      verdictBox.append(el('span', { className: 'verifyStatus' }, message.verdictNote || ''));
      summary.textContent = message.time;
    }
    $('complexitySpeed').textContent = message.speedText || '';
    renderBindings(message);
    linesList.replaceChildren(...(message.lines || []).map((item) => {
      const button = el('button', { type: 'button', className: 'complexityLineButton', title: item.line + ' 行目へ移動' });
      button.append(el('span', { className: 'complexityLineNumber' }, item.line + ' 行'), document.createTextNode(item.label + (item.note ? '（' + item.note + '）' : '')));
      button.addEventListener('click', () => vscode.postMessage({ type: 'complexityRevealLine', line: item.line }));
      return listItem(button);
    }));
    const warnings = message.warnings || [];
    warningCount.textContent = String(warnings.length);
    warningList.replaceChildren(...warnings.map((warning) => {
      const button = el('button', { type: 'button', className: 'complexityLineButton' });
      button.append(el('span', { className: 'complexityLineNumber' }, warning.line ? warning.line + ' 行' : ''), document.createTextNode(warning.message));
      if (warning.line) {
        button.addEventListener('click', () => vscode.postMessage({ type: 'complexityRevealLine', line: warning.line }));
      }
      return listItem(button);
    }));
    $('complexityWarnings').open = warnings.length > 0 && message.confidence === 'low';
  }

  analyzeButton.addEventListener('click', () => {
    setStatus('解析しています...');
    vscode.postMessage({ type: 'complexityAnalyze' });
  });

  measureButton.addEventListener('click', () => {
    busy = true;
    updateButtons();
    measureDetails.hidden = false;
    measureDetails.open = true;
    measureResult.textContent = '実測の準備をしています...';
    vscode.postMessage({ type: 'complexityMeasure' });
  });

  cancelButton.addEventListener('click', () => {
    cancelButton.disabled = true;
    vscode.postMessage({ type: 'complexityCancel' });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('complexity')) {
      return;
    }
    if (message.type === 'complexityState') {
      canMeasure = Boolean(message.canMeasure);
      measureHint.textContent = message.canMeasure ? '' : (message.measureReason || '');
      updateButtons();
    } else if (message.type === 'complexityResult') {
      renderResult(message);
    } else if (message.type === 'complexityStatus') {
      setStatus(message.message, message.tone || '');
    } else if (message.type === 'complexityProgress') {
      measureResult.textContent = message.text || '';
    } else if (message.type === 'complexityMeasureResult') {
      busy = false;
      cancelButton.disabled = false;
      updateButtons();
      measureDetails.hidden = false;
      measureDetails.open = true;
      measureResult.textContent = message.text || message.message || '';
      measureResult.className = message.ok && !message.mismatch ? 'verifyStatus' : 'verifyStatus error';
    }
  });

  updateButtons();
}

module.exports = {
  COMPLEXITY_MARKUP,
  COMPLEXITY_STYLES,
  initComplexitySection
};
