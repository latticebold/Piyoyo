'use strict';

const path = require('node:path');
const nodeFs = require('node:fs/promises');

const { analyzeAst } = require('./analyzer');
const {
  classifyGrowth,
  evaluateComplexity,
  formatComplexity,
  formatCount,
  symbolComplexity
} = require('./complexityExpr');
const { bindSymbols } = require('./inputBinding');
const {
  DEFAULT_OPS_PER_SECOND,
  detectImplementation,
  formatOperations,
  judgeOperations,
  opsPerSecondFromMeasurement
} = require('./judge');
const { compareModels, planMeasurement, runMeasurement } = require('./measure');
const { getSizeVariables, validateFormat } = require('../verify/inputFormat');
const { parseIntegerLiteral } = require('../verify/expression');

const AST_TIMEOUT_MS = 15000;
const AST_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;
const MEASURE_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
const SAVE_ANALYSIS_DELAY_MS = 300;
const CONFIDENCE_LABELS = { high: '高', medium: '中', low: '低' };
// 'call' covers user functions and expensive operations such as `x in list` or `.index()`.
const INLINE_HINT_KINDS = new Set(['loop', 'function', 'call']);
const NO_FORMAT_REASON = '入力形式がないため実測できません。上の「入力形式」を作ると使えます。';

function isPythonDocument(document) {
  return Boolean(document && !document.isUntitled
    && (document.languageId === 'python' || path.extname(document.fileName || '').toLowerCase() === '.py'));
}

function isFailedRun(result) {
  return Boolean(!result || result.timedOut || result.errorMessage || result.outputLimitExceeded
    || result.exitCode !== 0);
}

function hasRows(format) {
  return Boolean(format && Array.isArray(format.rows) && format.rows.length > 0);
}

class ComplexityController {
  constructor({
    vscodeApi,
    postMessage,
    getRunSettings,
    runPythonFile,
    getVerifyState,
    extensionPath,
    fs = nodeFs
  }) {
    this.vscodeApi = vscodeApi;
    this.postMessage = postMessage;
    this.getRunSettings = getRunSettings;
    this.runPythonFile = runPythonFile;
    this.getVerifyState = getVerifyState;
    this.astDumpPath = path.join(extensionPath, 'src', 'complexity', 'ast_dump.py');
    this.baselinePath = path.join(extensionPath, 'src', 'complexity', 'baseline.py');
    this.fs = fs;
    this.analysis = null;
    this.settings = null;
    this.manualBindings = new Map();
    this.measuredOpsPerSecond = new Map();
    this.lastMeasureText = '';
    this.busy = false;
    this.cancelRequested = false;
    this.analysisToken = 0;
    this.saveTimer = null;
    this.decorationType = null;
    this.lastView = null;
  }

  async handleMessage(message) {
    switch (message.type) {
      case 'complexityAnalyze': {
        const { target } = this.getVerifyState();
        if (!target) {
          this.postMessage({ type: 'complexityStatus', message: 'Python ファイルを開いてください。', tone: 'error' });
          return true;
        }
        await this.analyze(target);
        return true;
      }
      case 'complexityMeasure':
        await this.measure();
        return true;
      case 'complexityCancel':
        this.cancelRequested = true;
        return true;
      case 'complexityBindingChanged':
        this.changeBinding(message);
        return true;
      case 'complexityRevealLine':
        await this.revealLine(Number(message.line));
        return true;
      default:
        return false;
    }
  }

  async readSource(filePath) {
    const documents = (this.vscodeApi && this.vscodeApi.workspace && this.vscodeApi.workspace.textDocuments) || [];
    const document = documents.find((item) => item.fileName === filePath);
    if (document) {
      return document.getText();
    }
    return this.fs.readFile(filePath, 'utf8');
  }

  async analyze(filePath) {
    this.analysisToken += 1;
    const token = this.analysisToken;
    // A different file's result must never be shown while this one is being analyzed.
    if (this.analysis && this.analysis.filePath !== filePath) {
      this.clearAnalysis();
    }
    // Overlapping analyses: only the latest one may change what is shown.
    const fail = (message) => {
      if (token === this.analysisToken) {
        this.clearAnalysis();
        this.postResultError(message);
      }
    };
    try {
      let source;
      try {
        source = await this.readSource(filePath);
      } catch (error) {
        fail(`ファイルを読めませんでした: ${error.message}`);
        return;
      }
      const settings = await this.getRunSettings();
      const run = await this.runPythonFile({
        filePath: this.astDumpPath,
        cwd: path.dirname(filePath),
        input: source,
        pythonPath: settings.pythonPath,
        timeoutMs: AST_TIMEOUT_MS,
        workspaceFolders: settings.workspaceFolders,
        outputLimitBytes: AST_OUTPUT_LIMIT_BYTES,
        inspectRuntime: false
      });
      if (token !== this.analysisToken) {
        return;
      }
      if (isFailedRun(run)) {
        fail('コードを読み取れませんでした。' + (run && run.errorExplanation ? ' ' + run.errorExplanation : ''));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(run.stdout);
      } catch {
        fail('コードを読み取った結果を解釈できませんでした。');
        return;
      }
      const result = analyzeAst(parsed);
      if (!result.ok) {
        fail(result.message);
        return;
      }
      this.analysis = { filePath, result };
      this.settings = settings;
      this.publish();
    } catch (error) {
      fail('計算量を解析できませんでした: ' + error.message);
    }
  }

  clearAnalysis() {
    this.analysis = null;
    this.lastView = null;
    this.refreshDecorations();
  }

  postResultError(message) {
    this.postMessage({ type: 'complexityResult', ok: false, message });
  }

  currentFormat() {
    if (!this.analysis) {
      return null;
    }
    const { target, format } = this.getVerifyState();
    return target === this.analysis.filePath && hasRows(format) ? format : null;
  }

  measureState() {
    const { target, format } = this.getVerifyState();
    if (!target) {
      return { canMeasure: false, measureReason: 'Python ファイルを開いてください。' };
    }
    if (!hasRows(format)) {
      return { canMeasure: false, measureReason: NO_FORMAT_REASON };
    }
    if (!validateFormat(format).ok) {
      return { canMeasure: false, measureReason: '入力形式に誤りがあるため実測できません。' };
    }
    const plan = planMeasurement(format);
    return plan.ok ? { canMeasure: true, measureReason: '' } : { canMeasure: false, measureReason: plan.message };
  }

  computeView() {
    const { filePath, result } = this.analysis;
    const format = this.currentFormat();
    const binding = bindSymbols(result, format, { manual: this.manualBindings.get(filePath) || {} });
    const rename = binding.rename || {};
    // Same naming rule as formatComplexity, so the verdict and O(...) agree (n → N).
    const displayName = (symbol) => formatCount(symbolComplexity(symbol), { rename });
    const operations = evaluateComplexity(result.time, binding.values);
    const pythonPath = this.settings ? this.settings.pythonPath : '';
    const timeoutMs = this.settings ? this.settings.timeoutMs : 2000;
    const implementation = detectImplementation(pythonPath);
    const measured = this.measuredOpsPerSecond.get(pythonPath);
    const opsPerSecond = measured || DEFAULT_OPS_PER_SECOND[implementation];
    let verdict = null;
    let verdictNote = '';
    if (operations !== null) {
      const judged = judgeOperations({ operations, timeoutMs, opsPerSecond });
      const timeSymbols = new Set();
      result.time.terms.forEach((term) => {
        Object.keys(term.factors).forEach((symbol) => timeSymbols.add(symbol));
        (term.exp || []).forEach((symbol) => timeSymbols.add(symbol));
      });
      const shown = new Map();
      binding.bindings.forEach((item) => {
        const name = displayName(item.symbol);
        if (timeSymbols.has(item.symbol) && !shown.has(name)) {
          shown.set(name, `${name} = ${formatOperations(item.value)}`);
        }
      });
      const sizes = [...shown.values()].join('、');
      verdict = {
        text: `${sizes ? sizes + ' → ' : ''}${formatOperations(operations)} 回`,
        label: judged.label,
        verdict: judged.verdict
      };
    } else {
      verdictNote = binding.unbound.length > 0
        ? `上限が決まっていない変数があります（${binding.unbound.join('、')}）。「計算の前提」で上限を選んでください。`
        : '演算回数を計算できませんでした。';
    }
    const lines = result.lines.map((item) => ({
      line: item.line,
      kind: item.kind,
      label: item.kind === 'loop'
        ? '× ' + formatCount(item.complexity, { rename })
        : formatComplexity(item.complexity, { rename }),
      note: item.note || ''
    }));
    const formatVars = [];
    if (format) {
      format.rows.forEach((row) => {
        if (row.kind === 'ints') {
          (row.vars || []).forEach((variable) => formatVars.push(variable.name));
        }
      });
    }
    return {
      binding,
      rename,
      lines,
      message: {
        type: 'complexityResult',
        ok: true,
        fileName: path.basename(filePath),
        time: formatComplexity(result.time, { rename }),
        space: formatComplexity(result.space, { rename }),
        confidence: result.confidence,
        confidenceLabel: CONFIDENCE_LABELS[result.confidence] || result.confidence,
        verdict,
        verdictNote,
        speedText: `1 秒あたり ${formatOperations(opsPerSecond)} 回として計算（${implementation === 'pypy' ? 'PyPy' : 'Python'}・`
          + `${measured ? 'この PC で実測した値' : '目安の値'}）、制限時間 ${timeoutMs / 1000} 秒`,
        bindings: binding.bindings.map((item) => ({
          symbol: item.symbol,
          display: displayName(item.symbol),
          source: item.source,
          formatVar: item.formatVar || '',
          value: item.value,
          valueText: formatOperations(item.value)
        })),
        unbound: binding.unbound,
        formatVars,
        lines,
        warnings: result.warnings
      }
    };
  }

  publish() {
    this.postMessage({ type: 'complexityState', ...this.measureState() });
    if (!this.analysis) {
      return;
    }
    const view = this.computeView();
    this.lastView = view;
    this.postMessage(view.message);
    this.refreshDecorations();
  }

  changeBinding({ symbol, formatVar, value, clear }) {
    if (!this.analysis || typeof symbol !== 'string') {
      return;
    }
    const filePath = this.analysis.filePath;
    const manual = { ...(this.manualBindings.get(filePath) || {}) };
    if (clear) {
      delete manual[symbol];
    } else if (typeof formatVar === 'string' && formatVar) {
      manual[symbol] = { formatVar };
    } else if (value !== undefined) {
      const parsed = parseIntegerLiteral(String(value));
      if (parsed === null || parsed < 0n) {
        this.postMessage({ type: 'complexityStatus', message: `「${value}」は上限として読めません（例: 2×10^5）。`, tone: 'error' });
        return;
      }
      manual[symbol] = { value: Number(parsed) };
    }
    this.manualBindings.set(filePath, manual);
    this.publish();
  }

  handleTargetChanged(target) {
    if (target && (!this.analysis || this.analysis.filePath !== target)) {
      this.analyze(target);
    } else {
      this.publish();
    }
  }

  handleFormatChanged() {
    this.publish();
  }

  handleDocumentSaved(document) {
    if (!isPythonDocument(document)) {
      return;
    }
    const { target } = this.getVerifyState();
    if (document.fileName !== target) {
      return;
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.analyze(target);
    }, SAVE_ANALYSIS_DELAY_MS);
  }

  async measure() {
    if (this.busy) {
      return;
    }
    const finish = (fields) => this.postMessage({ type: 'complexityMeasureResult', ...fields });
    const { target, format } = this.getVerifyState();
    const state = this.measureState();
    if (!state.canMeasure) {
      finish({ ok: false, message: state.measureReason });
      return;
    }
    const plan = planMeasurement(format);
    this.busy = true;
    this.cancelRequested = false;
    try {
      const documents = (this.vscodeApi && this.vscodeApi.workspace && this.vscodeApi.workspace.textDocuments) || [];
      const document = documents.find((item) => item.fileName === target);
      if (document && document.isDirty) {
        await document.save();
      }
      const settings = await this.getRunSettings();
      this.settings = settings;
      const cwd = path.dirname(target);
      const run = (filePath, input) => this.runPythonFile({
        filePath,
        cwd,
        input,
        pythonPath: settings.pythonPath,
        timeoutMs: settings.timeoutMs,
        workspaceFolders: settings.workspaceFolders,
        outputLimitBytes: MEASURE_OUTPUT_LIMIT_BYTES,
        inspectRuntime: false
      });
      const result = await runMeasurement({
        format,
        runMain: (input) => run(target, input),
        runBaseline: () => run(this.baselinePath, ''),
        timeoutMs: settings.timeoutMs,
        isCancelled: () => this.cancelRequested,
        onProgress: ({ step, total, scale }) => {
          this.postMessage({ type: 'complexityProgress', text: `${step + 1} / ${total} 段目を測っています（${formatScale(scale)}）...` });
        }
      });
      if (!result.ok) {
        finish({ ok: false, message: result.message });
        return;
      }
      finish(this.describeMeasurement(result, plan, format));
      this.publish();
    } catch (error) {
      finish({ ok: false, message: '実測を続けられませんでした: ' + error.message });
    } finally {
      this.busy = false;
    }
  }

  describeMeasurement(result, plan, format) {
    const pointsText = result.points.map((point) => (
      `${plan.primaryVar}=${point.n}: ${point.timedOut ? '時間切れ' : Math.round(point.seconds * 1000) + ' ms'}`
    )).join(' / ');
    const fit = result.fit || {};
    let text = `${pointsText} → ${fit.model || '?'} に近い`;
    if (fit.confidence === 'low') {
      text += '（時間の差が小さく、はっきりしません）';
    }
    let mismatch = false;
    if (this.analysis && this.analysis.filePath === this.getVerifyState().target && fit.model) {
      const view = this.computeView();
      const primary = view.binding.bindings.find((item) => item.formatVar === plan.primaryVar);
      if (primary) {
        // A low-confidence fit (e.g. only one usable point) would report a false mismatch.
        if (fit.confidence === 'high') {
          const staticModel = classifyGrowth(this.analysis.result.time, primary.symbol);
          const compared = compareModels(fit.model, staticModel);
          if (compared.mismatch) {
            mismatch = true;
            text += '。' + compared.message;
          }
        }
        const sizeVariables = getSizeVariables(format);
        const opsPerSecond = opsPerSecondFromMeasurement(result.points, (point) => {
          const factor = plan.primaryMax > 0 ? point.n / plan.primaryMax : 1;
          const scaled = { ...view.binding.values };
          view.binding.bindings.forEach((item) => {
            if (item.formatVar && sizeVariables.has(item.formatVar)) {
              scaled[item.symbol] = Math.max(1, Math.round(item.value * factor));
            }
          });
          return evaluateComplexity(this.analysis.result.time, scaled);
        });
        if (opsPerSecond && this.settings) {
          this.measuredOpsPerSecond.set(this.settings.pythonPath, opsPerSecond);
        }
      }
    }
    if (result.stoppedAtScale >= 1) {
      text += '。最大サイズで時間切れになりました';
    } else if (result.stoppedAtScale) {
      text += `。${formatScale(result.stoppedAtScale)}で時間切れになったため、それより大きいサイズは測っていません`;
    }
    if (result.message) {
      text += '。' + result.message;
    }
    return { ok: true, text, mismatch, model: fit.model, points: result.points };
  }

  async revealLine(line) {
    if (!this.analysis || !Number.isInteger(line) || line < 1 || !this.vscodeApi) {
      return;
    }
    const { Uri, Range, Selection, TextEditorRevealType } = this.vscodeApi;
    const document = await this.vscodeApi.workspace.openTextDocument(Uri.file(this.analysis.filePath));
    const editor = await this.vscodeApi.window.showTextDocument(document, { preview: false });
    const position = document.lineAt(Math.min(line, document.lineCount) - 1).range.start;
    editor.selection = new Selection(position, position);
    editor.revealRange(new Range(position, position), TextEditorRevealType.InCenterIfOutsideViewport);
  }

  refreshDecorations() {
    if (!this.vscodeApi || !this.vscodeApi.window || typeof this.vscodeApi.window.createTextEditorDecorationType !== 'function') {
      return;
    }
    if (!this.decorationType) {
      this.decorationType = this.vscodeApi.window.createTextEditorDecorationType({
        after: {
          color: new this.vscodeApi.ThemeColor('editorCodeLens.foreground'),
          margin: '0 0 0 2em',
          fontStyle: 'italic'
        }
      });
    }
    const enabled = this.vscodeApi.workspace.getConfiguration('piyoyo').get('complexity.showInlineHints', true);
    (this.vscodeApi.window.visibleTextEditors || []).forEach((editor) => {
      const matches = enabled && this.analysis && this.lastView
        && editor.document && editor.document.fileName === this.analysis.filePath;
      if (!matches) {
        editor.setDecorations(this.decorationType, []);
        return;
      }
      const document = editor.document;
      // One hint per line: a line can hold a loop and an expensive call (for x in sorted(a):).
      const labelsByLine = new Map();
      this.lastView.lines
        .filter((item) => item.line >= 1 && item.line <= document.lineCount && INLINE_HINT_KINDS.has(item.kind))
        .forEach((item) => {
          labelsByLine.set(item.line, [...(labelsByLine.get(item.line) || []), item.label]);
        });
      const options = [...labelsByLine].map(([line, labels]) => {
        const end = document.lineAt(line - 1).range.end;
        return {
          range: new this.vscodeApi.Range(end, end),
          renderOptions: { after: { contentText: labels.join('  ') } }
        };
      });
      editor.setDecorations(this.decorationType, options);
    });
  }

  dispose() {
    clearTimeout(this.saveTimer);
    if (this.decorationType) {
      this.decorationType.dispose();
      this.decorationType = null;
    }
  }
}

function formatScale(scale) {
  return scale >= 1 ? '最大サイズ' : `最大の 1/${Math.round(1 / scale)} のサイズ`;
}

module.exports = {
  ComplexityController,
  isPythonDocument
};
