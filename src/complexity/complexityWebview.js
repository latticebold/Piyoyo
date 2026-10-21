'use strict';

// Markup, styles, and the browser-side script of the 計算量 section in the 検証 tab.
// initComplexitySection is injected into the webview via toString(), so it must stay
// self-contained (no closures over this module).

const COMPLEXITY_STYLES = `
    .complexitySectionTitle {
      margin: 0;
      color: var(--piyoyo-text);
      font-size: 14px;
      font-weight: 650;
    }

    .complexityBig {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .complexityBigItem {
      display: grid;
      gap: 2px;
      min-width: 0;
      padding: 8px 10px;
      border: 1px solid var(--piyoyo-line);
      border-radius: 6px;
      background: var(--piyoyo-surface);
    }

    .complexityBigLabel {
      color: var(--vscode-descriptionForeground);
      font-size: var(--piyoyo-font-small);
      font-weight: 600;
    }

    .complexityBigValue {
      color: var(--piyoyo-yellow);
      font-family: var(--vscode-editor-font-family);
      font-size: 22px;
      font-weight: 700;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .complexityVerdict {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 10px;
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

    .complexityConfidence {
      color: var(--vscode-descriptionForeground);
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

    .complexitySection details > .verifyVarList,
    .complexitySection details > .verifyStatus {
      margin-top: 4px;
    }
`;

const COMPLEXITY_MARKUP = `
      <section id="complexitySection" class="verifySection complexitySection" aria-labelledby="complexityHeading">
        <h2 id="complexityHeading" class="complexitySectionTitle">計算量</h2>
        <div class="verifySectionBody">
          <div class="verifyButtons">
            <button id="complexityAnalyze" type="button">解析</button>
            <button id="complexityMeasure" class="verifySecondary" type="button">実測</button>
            <button id="complexityCancel" class="verifySecondary" type="button" hidden>中止</button>
          </div>
          <span id="complexityStatus" class="verifyStatus" aria-live="polite"></span>
          <div id="complexityResult" class="verifyRows" hidden>
            <div class="complexityBig">
              <div class="complexityBigItem">
                <span class="complexityBigLabel">時間</span>
                <span id="complexityTime" class="complexityBigValue"></span>
              </div>
              <div class="complexityBigItem">
                <span class="complexityBigLabel">空間</span>
                <span id="complexitySpace" class="complexityBigValue"></span>
              </div>
            </div>
            <div id="complexityVerdict" class="complexityVerdict" aria-live="polite"></div>
            <details id="complexityBreakdown">
              <summary>内訳（行ごと）</summary>
              <ol id="complexityLines" class="complexityList"></ol>
            </details>
            <details id="complexityWarnings" hidden>
              <summary>警告 (<span id="complexityWarningCount">0</span>)</summary>
              <ul id="complexityWarningList" class="complexityList"></ul>
            </details>
            <details id="complexityAssumptions">
              <summary>計算の前提（変数の上限・速さ）</summary>
              <div id="complexityBindings" class="verifyVarList" aria-label="変数の上限"></div>
              <span id="complexitySpeed" class="verifyStatus"></span>
            </details>
          </div>
          <details id="complexityMeasureDetails" hidden>
            <summary>実測</summary>
            <div id="complexityMeasureResult" class="verifyStatus"></div>
          </details>
        </div>
      </section>
`;

function initComplexitySection({ vscode }) {
  const SOURCE_LABELS = { name: '名前で対応', order: '読む順で対応', manual: '選び直し' };
  const $ = (id) => document.getElementById(id);
  const analyzeButton = $('complexityAnalyze');
  const measureButton = $('complexityMeasure');
  const cancelButton = $('complexityCancel');
  const status = $('complexityStatus');
  const resultBox = $('complexityResult');
  const bindingsBox = $('complexityBindings');
  const assumptions = $('complexityAssumptions');
  const linesList = $('complexityLines');
  const warnings = $('complexityWarnings');
  const warningList = $('complexityWarningList');
  const warningCount = $('complexityWarningCount');
  const measureDetails = $('complexityMeasureDetails');
  const measureResult = $('complexityMeasureResult');

  let busy = false;

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
    // Kept enabled without a format: pressing it explains why measuring is not possible.
    measureButton.disabled = busy;
    cancelButton.hidden = !busy;
  }

  function lineButton(line, text) {
    const button = el('button', { type: 'button', className: 'complexityLineButton', title: line ? line + ' 行目へ移動' : undefined });
    button.append(el('span', { className: 'complexityLineNumber' }, line ? line + ' 行' : ''), document.createTextNode(text));
    if (line) {
      button.addEventListener('click', () => vscode.postMessage({ type: 'complexityRevealLine', line }));
    }
    return listItem(button);
  }

  function renderBindings(message) {
    const formatVars = Array.isArray(message.formatVars) ? message.formatVars : [];
    const items = [
      ...(message.bindings || []),
      ...(message.unbound || []).map((symbol) => ({ symbol, display: symbol, unbound: true }))
    ];
    bindingsBox.replaceChildren(...items.map((binding) => {
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
      return row;
    }));
    // Opened when the user has something to decide; never closed under them while they edit.
    if ((message.unbound || []).length > 0) {
      assumptions.open = true;
    }
  }

  function renderResult(message) {
    if (!message.ok) {
      resultBox.hidden = true;
      setStatus(message.message, 'error');
      return;
    }
    resultBox.hidden = false;
    setStatus('');
    $('complexityTime').textContent = message.time;
    $('complexitySpace').textContent = message.space;
    const verdictBox = $('complexityVerdict');
    const confidence = el('span', { className: 'complexityConfidence' }, '推定: ' + message.confidenceLabel);
    if (message.verdict) {
      verdictBox.replaceChildren(
        el('span', { className: 'complexityVerdictLabel ' + message.verdict.verdict }, message.verdict.label),
        el('span', {}, message.verdict.text),
        confidence
      );
    } else {
      verdictBox.replaceChildren(el('span', { className: 'verifyStatus' }, message.verdictNote || ''), confidence);
    }
    $('complexitySpeed').textContent = message.speedText || '';
    renderBindings(message);
    linesList.replaceChildren(...(message.lines || []).map((item) => (
      lineButton(item.line, item.label + (item.note ? '（' + item.note + '）' : ''))
    )));
    const warningItems = message.warnings || [];
    warningCount.textContent = String(warningItems.length);
    warningList.replaceChildren(...warningItems.map((warning) => lineButton(warning.line, warning.message)));
    warnings.hidden = warningItems.length === 0;
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
    measureResult.className = 'verifyStatus';
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
      measureButton.title = message.canMeasure ? '入力のサイズを変えて実際の時間を測ります' : (message.measureReason || '');
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
