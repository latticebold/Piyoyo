'use strict';

const path = require('node:path');
const nodeFs = require('node:fs/promises');

const { normalizeFormat, validateFormat, createRow } = require('./inputFormat');
const { generateExample } = require('./inputGenerator');
const { compareOutputs, COMPARE_MODES } = require('./outputCompare');
const { runStressTest } = require('./stressRunner');
const {
  addCounterexample,
  createEmptyVerifyData,
  getVerifyFilePath,
  parseVerifyFile,
  removeCounterexample,
  resolveNaivePath,
  serializeVerifyFile,
  toRelativeNaivePath
} = require('./verifyFile');
const { isAtCoderTaskUrl, parseProblemHtml, parseProblemText, toJapaneseTaskUrl } = require('./problemParser');

const STRESS_OUTPUT_LIMIT_BYTES = 16 * 1024 * 1024;
const MAX_INPUT_SENT_TO_VIEW = 2 * 1024 * 1024;
const MAX_OUTPUT_SENT_TO_VIEW = 100 * 1024;
const FETCH_TIMEOUT_MS = 10000;
const SAVE_DELAY_MS = 500;
const PROGRESS_INTERVAL_MS = 100;
const STATUS_SUMMARIES = {
  passed: '通過',
  mismatch: '出力が違う',
  mainError: '実行時エラー',
  mainTimeout: '時間切れ',
  naiveError: '愚直解のエラー',
  generatorError: '入力を作れない',
  cancelled: '中止'
};
const COUNTEREXAMPLE_STATUSES = new Set(['mismatch', 'mainError', 'mainTimeout']);
const NAIVE_TEMPLATE_HEADER = [
  '# 愚直解: 遅くてもよいので、確実に正しい方法で書き直してください。',
  '# Piyoyo の「検証」タブが、本番の解と出力を比べます。',
  ''
].join('\n');

function isFailedRun(result) {
  return Boolean(!result || result.timedOut || result.errorMessage || result.outputLimitExceeded
    || result.exitCode !== 0);
}

function clip(text, limit) {
  const value = String(text || '');
  return value.length > limit ? value.slice(0, limit) : value;
}

function runErrorText(result) {
  if (!result) {
    return '';
  }
  return [result.errorExplanation, result.stderr].filter(Boolean).join('\n');
}

function viewRunResult(result) {
  if (!result) {
    return null;
  }
  return { stdout: clip(result.stdout, MAX_OUTPUT_SENT_TO_VIEW) };
}

function parseSeed(text, random) {
  const trimmed = String(text || '').trim();
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed);
    if (Number.isSafeInteger(value) && value <= 0xffffffff) {
      return { ok: true, seed: value };
    }
  }
  if (trimmed) {
    return { ok: false, message: 'シード値は 0 以上 4294967295 以下の整数で入れてください。' };
  }
  return { ok: true, seed: Math.floor(random() * 0x100000000) >>> 0 };
}

async function fileExists(fs, filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hasMeaningfulData(data) {
  return data.format.rows.length > 0 || data.counterexamples.length > 0 || Boolean(data.naivePath);
}

class VerifyController {
  constructor({
    vscodeApi,
    postMessage,
    getRunSettings,
    runPythonFile,
    fs = nodeFs,
    fetchImpl = globalThis.fetch,
    random = Math.random,
    now = () => new Date()
  }) {
    this.vscodeApi = vscodeApi;
    this.postMessage = postMessage;
    this.getRunSettings = getRunSettings;
    this.runPythonFile = runPythonFile;
    this.fs = fs;
    this.fetchImpl = fetchImpl;
    this.random = random;
    this.now = now;
    this.target = null;
    this.data = createEmptyVerifyData();
    this.warnings = [];
    this.busy = false;
    this.cancelRequested = false;
    this.pendingTarget = null;
    this.saveTimer = null;
    this.fileExistedOnLoad = false;
    this.targetToken = 0;
  }

  // Picks the main solution for a Python file; a "<name>_naive.py" editor keeps "<name>.py".
  async resolveMainPath(filePath) {
    const parsed = path.parse(filePath);
    if (parsed.name.endsWith('_naive')) {
      const basePath = path.join(parsed.dir, parsed.name.slice(0, -'_naive'.length) + parsed.ext);
      if (await fileExists(this.fs, basePath)) {
        return basePath;
      }
    }
    return filePath;
  }

  async setTargetFile(filePath) {
    if (!filePath) {
      return;
    }
    // Editor switches can overlap; only the latest one may replace the loaded data.
    this.targetToken += 1;
    const token = this.targetToken;
    const mainPath = await this.resolveMainPath(filePath);
    if (token !== this.targetToken) {
      return;
    }
    if (this.busy) {
      this.pendingTarget = mainPath;
      return;
    }
    if (this.target === mainPath) {
      return;
    }
    const loaded = await this.readData(mainPath);
    await this.flushSave();
    if (token !== this.targetToken) {
      return;
    }
    this.target = mainPath;
    this.data = loaded.data;
    this.warnings = loaded.warnings;
    this.fileExistedOnLoad = loaded.existed;
    await this.postLoaded();
  }

  async readData(mainPath) {
    let text;
    try {
      text = await this.fs.readFile(getVerifyFilePath(mainPath), 'utf8');
    } catch {
      return { data: createEmptyVerifyData(), warnings: [], existed: false };
    }
    const parsed = parseVerifyFile(text);
    if (!parsed.ok) {
      return { data: createEmptyVerifyData(), warnings: [parsed.message], existed: true };
    }
    const normalized = normalizeFormat(parsed.data.format);
    return {
      data: { ...parsed.data, format: normalized.format },
      warnings: [...(parsed.warnings || []), ...(normalized.warnings || [])],
      existed: true
    };
  }

  async postLoaded() {
    if (!this.target) {
      this.postMessage({ type: 'verifyLoaded', target: null, data: createEmptyVerifyData(), warnings: [] });
      return;
    }
    const naivePath = resolveNaivePath(this.target, this.data.naivePath);
    this.postMessage({
      type: 'verifyLoaded',
      target: {
        mainFile: path.basename(this.target),
        naiveFile: toRelativeNaivePath(this.target, naivePath),
        naiveExists: await fileExists(this.fs, naivePath)
      },
      data: {
        format: this.data.format,
        compareMode: this.data.compareMode,
        iterations: this.data.iterations,
        counterexamples: this.data.counterexamples
      },
      warnings: this.warnings
    });
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_DELAY_MS);
  }

  async flushSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.save();
    }
  }

  async save({ force = false } = {}) {
    if (!this.target) {
      return false;
    }
    // Avoid creating a.piyoyo.json next to every file the user merely looks at.
    if (!force && !this.fileExistedOnLoad && !hasMeaningfulData(this.data)) {
      return false;
    }
    const filePath = getVerifyFilePath(this.target);
    try {
      await this.fs.writeFile(filePath, serializeVerifyFile(this.data), 'utf8');
      this.fileExistedOnLoad = true;
      this.postMessage({ type: 'verifySaved', message: path.basename(filePath) + ' に保存しました' });
      return true;
    } catch (error) {
      this.postMessage({ type: 'verifySaved', message: '保存できませんでした: ' + error.message, failed: true });
      return false;
    }
  }

  async handleMessage(message) {
    switch (message.type) {
      case 'verifyFormatChanged':
        this.handleFormatChanged(message.format);
        return true;
      case 'verifySettingsChanged':
        if (COMPARE_MODES.includes(message.compareMode)) {
          this.data.compareMode = message.compareMode;
        }
        if (Number.isInteger(message.iterations) && message.iterations >= 1 && message.iterations <= 10000) {
          this.data.iterations = message.iterations;
        }
        this.scheduleSave();
        return true;
      case 'verifyRequestRow':
        this.postMessage({
          type: 'verifyRowCreated',
          requestId: message.requestId,
          row: createRow(message.kind, Array.isArray(message.existingNames) ? message.existingNames : [])
        });
        return true;
      case 'verifyFetchProblem':
        await this.fetchProblem(String(message.url || ''));
        return true;
      case 'verifyParseText':
        this.postImportResult(parseProblemText(String(message.text || '')));
        return true;
      case 'verifyStart':
        await this.startStress(message);
        return true;
      case 'verifyCancel':
        this.cancelRequested = true;
        return true;
      case 'verifyRecheck':
        await this.recheck(message.compareMode);
        return true;
      case 'verifyRegenerateExpected':
        await this.regenerateExpected();
        return true;
      case 'verifyDeleteCounterexample':
        this.data = removeCounterexample(this.data, String(message.id || ''));
        await this.save({ force: true });
        this.postMessage({ type: 'verifyCounterexamples', counterexamples: this.data.counterexamples, message: '反例を消しました。' });
        return true;
      case 'verifyChooseNaive':
        await this.chooseNaive();
        return true;
      case 'verifyCreateNaive':
        await this.createNaive();
        return true;
      default:
        return false;
    }
  }

  handleFormatChanged(rawFormat) {
    if (!this.target) {
      return;
    }
    const { format } = normalizeFormat(rawFormat);
    const changed = JSON.stringify(format) !== JSON.stringify(this.data.format);
    this.data.format = format;
    const validation = validateFormat(format);
    let example = '';
    let exampleError = '';
    if (format.rows.length > 0) {
      if (!validation.ok) {
        exampleError = '入力形式に誤りがあります';
      } else {
        const generated = generateExample(format);
        if (generated.ok) {
          example = generated.input;
        } else {
          exampleError = generated.message;
        }
      }
    }
    // An empty format is the normal starting state, not a mistake to flag.
    const errors = format.rows.length > 0 ? validation.errors : [];
    this.postMessage({ type: 'verifyFormatStatus', errors, example, exampleError });
    if (changed) {
      this.scheduleSave();
    }
  }

  postImportResult(result) {
    if (!result.ok) {
      this.postMessage({ type: 'verifyImportResult', ok: false, message: result.message });
      return;
    }
    this.postMessage({ type: 'verifyImportResult', ok: true, format: result.format, warnings: result.warnings || [] });
  }

  async fetchProblem(url) {
    if (!isAtCoderTaskUrl(url)) {
      this.postImportResult({
        ok: false,
        message: 'atcoder.jp の問題ページの URL を入れてください（例: https://atcoder.jp/contests/abc001/tasks/abc001_a）。'
      });
      return;
    }
    if (typeof this.fetchImpl !== 'function') {
      this.postImportResult({ ok: false, message: 'この環境では問題ページを取得できません。問題文を貼り付けてください。' });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(toJapaneseTaskUrl(url), {
        signal: controller.signal,
        headers: { 'Accept-Language': 'ja' }
      });
      const loginRequired = response.status === 401 || response.status === 403
        || String(response.url || '').includes('/login');
      if (loginRequired) {
        this.postImportResult({ ok: false, message: 'ログインが必要な問題（開催中のコンテストなど）は読み取れません。問題文を貼り付けてください。' });
        return;
      }
      if (response.status === 404) {
        this.postImportResult({ ok: false, message: '問題ページが見つかりませんでした。URL を確かめてください。' });
        return;
      }
      if (!response.ok) {
        this.postImportResult({ ok: false, message: `問題ページを取得できませんでした（${response.status}）。問題文を貼り付けてください。` });
        return;
      }
      this.postImportResult(parseProblemHtml(await response.text()));
    } catch (error) {
      const message = error && error.name === 'AbortError'
        ? '問題ページの取得に時間がかかりすぎたため、中止しました。'
        : '問題ページを取得できませんでした。ネットワークを確かめるか、問題文を貼り付けてください。';
      this.postImportResult({ ok: false, message });
    } finally {
      clearTimeout(timer);
    }
  }

  async saveOpenDocument(filePath) {
    const documents = (this.vscodeApi && this.vscodeApi.workspace && this.vscodeApi.workspace.textDocuments) || [];
    const document = documents.find((item) => item.fileName === filePath);
    if (document && document.isDirty) {
      await document.save();
    }
  }

  async prepareRun({ needNaive }) {
    if (!this.target) {
      return { ok: false, message: 'Python ファイルを開いてください。' };
    }
    const mainPath = this.target;
    const naivePath = resolveNaivePath(mainPath, this.data.naivePath);
    if (needNaive && !(await fileExists(this.fs, naivePath))) {
      return {
        ok: false,
        message: `愚直解 ${toRelativeNaivePath(mainPath, naivePath)} が見つかりません。「愚直解の雛形を作る」で作れます。`,
        showCreateNaive: true
      };
    }
    await this.saveOpenDocument(mainPath);
    if (needNaive) {
      await this.saveOpenDocument(naivePath);
    }
    const settings = await this.getRunSettings();
    const cwd = path.dirname(mainPath);
    const run = (filePath, input, timeoutMs) => this.runPythonFile({
      filePath,
      cwd,
      input,
      pythonPath: settings.pythonPath,
      timeoutMs,
      workspaceFolders: settings.workspaceFolders,
      outputLimitBytes: STRESS_OUTPUT_LIMIT_BYTES,
      inspectRuntime: false
    });
    // The naive solution is allowed to be slow; its timeout only guards against hangs.
    const naiveTimeoutMs = Math.max(settings.timeoutMs * 5, 10000);
    return {
      ok: true,
      mainPath,
      runMain: (input) => run(mainPath, input, settings.timeoutMs),
      runNaive: (input) => run(naivePath, input, naiveTimeoutMs)
    };
  }

  setBusy(value) {
    this.busy = value;
    if (!value && this.pendingTarget) {
      const pending = this.pendingTarget;
      this.pendingTarget = null;
      this.setTargetFile(pending);
    }
  }

  async startStress({ iterations, compareMode, seed }) {
    if (this.busy) {
      return;
    }
    const stop = (message, extra = {}) => this.postMessage({ type: 'verifyStressStopped', message, ...extra });
    const format = this.data.format;
    if (!this.target) {
      stop('Python ファイルを開いてください。');
      return;
    }
    if (format.rows.length === 0) {
      stop('先に「入力形式」を作ってください。');
      return;
    }
    const validation = validateFormat(format);
    if (!validation.ok) {
      const first = validation.errors[0];
      stop(`入力形式に誤りがあります（${first.rowIndex + 1}行目: ${first.message}）。`);
      return;
    }
    if (format.rows.some((row) => row.needsReview)) {
      stop('「要確認」の行を確かめてから始めてください（確かめたら「確認した」を押します）。');
      return;
    }
    const parsedSeed = parseSeed(seed, this.random);
    if (!parsedSeed.ok) {
      stop(parsedSeed.message);
      return;
    }
    const mode = COMPARE_MODES.includes(compareMode) ? compareMode : this.data.compareMode;
    const total = Number.isInteger(iterations) && iterations >= 1 ? Math.min(iterations, 10000) : this.data.iterations;

    this.setBusy(true);
    this.cancelRequested = false;
    try {
      await this.flushSave();
      const prepared = await this.prepareRun({ needNaive: true });
      if (!prepared.ok) {
        stop(prepared.message, { showCreateNaive: prepared.showCreateNaive });
        return;
      }
      let lastProgressAt = 0;
      const result = await runStressTest({
        format,
        iterations: total,
        seed: parsedSeed.seed,
        compareMode: mode,
        runMain: prepared.runMain,
        runNaive: prepared.runNaive,
        isCancelled: () => this.cancelRequested,
        onProgress: ({ iteration, mode: planMode }) => {
          const nowMs = Date.now();
          if (nowMs - lastProgressAt < PROGRESS_INTERVAL_MS && iteration > 0) {
            return;
          }
          lastProgressAt = nowMs;
          this.postMessage({
            type: 'verifyProgress',
            iteration,
            total,
            text: `${iteration + 1} / ${total} 回目（${planMode === 'max' ? '最大サイズで時間を確認' : '愚直解と比較'}）`
          });
        }
      });
      if (!result.status) {
        stop(result.message || 'ストレステストを始められませんでした。');
        return;
      }
      await this.reportStressResult(result, prepared.mainPath);
    } catch (error) {
      stop('ストレステストを続けられませんでした: ' + error.message);
    } finally {
      this.setBusy(false);
    }
  }

  async reportStressResult(result, mainPath) {
    const stoppedOnCase = !['passed', 'cancelled', 'generatorError'].includes(result.status);
    const input = stoppedOnCase && typeof result.input === 'string' ? result.input : '';
    let errorText = '';
    if (result.status === 'mainError' || result.status === 'mainTimeout') {
      errorText = runErrorText(result.mainResult);
    } else if (result.status === 'naiveError') {
      errorText = '愚直解: ' + (runErrorText(result.naiveResult) || 'エラーで止まりました。');
    }
    this.postMessage({
      type: 'verifyStressResult',
      status: result.status,
      message: result.message,
      summary: STATUS_SUMMARIES[result.status] || '',
      seed: result.seed,
      iteration: result.iteration,
      mode: result.mode,
      input: input.length <= MAX_INPUT_SENT_TO_VIEW ? input : null,
      inputTooLarge: input.length > MAX_INPUT_SENT_TO_VIEW,
      mainResult: stoppedOnCase ? viewRunResult(result.mainResult) : null,
      naiveResult: stoppedOnCase ? viewRunResult(result.naiveResult) : null,
      comparison: stoppedOnCase ? result.comparison || null : null,
      errorText
    });

    const canSave = COUNTEREXAMPLE_STATUSES.has(result.status) && result.mode === 'compare'
      && input && result.naiveResult && !isFailedRun(result.naiveResult);
    if (!canSave || this.target !== mainPath) {
      return;
    }
    this.data = addCounterexample(this.data, {
      kind: result.status,
      input,
      expected: result.naiveResult.stdout,
      seed: result.caseSeed,
      createdAt: this.now().toISOString()
    });
    await this.save({ force: true });
    this.postMessage({ type: 'verifyCounterexamples', counterexamples: this.data.counterexamples });
  }

  async recheck(compareMode) {
    if (this.busy) {
      return;
    }
    const mode = COMPARE_MODES.includes(compareMode) ? compareMode : this.data.compareMode;
    this.setBusy(true);
    try {
      const prepared = await this.prepareRun({ needNaive: false });
      if (!prepared.ok) {
        this.postMessage({ type: 'verifyNotice', message: prepared.message });
        return;
      }
      const results = [];
      for (const counterexample of this.data.counterexamples) {
        const run = await prepared.runMain(counterexample.input);
        let status = 'ok';
        let comparison = null;
        if (run.timedOut) {
          status = 'timeout';
        } else if (isFailedRun(run)) {
          status = 'error';
        } else if (typeof counterexample.expected === 'string') {
          comparison = compareOutputs(counterexample.expected, run.stdout, mode);
          status = comparison.equal ? 'ok' : 'mismatch';
        }
        const messages = { ok: '✔ 一致', mismatch: '✖ 出力が違う', error: '✖ 実行時エラー', timeout: '✖ 時間切れ' };
        results.push({
          id: counterexample.id,
          status,
          message: messages[status],
          output: clip(run.stdout, MAX_OUTPUT_SENT_TO_VIEW),
          comparison,
          errorText: status === 'error' || status === 'timeout' ? runErrorText(run) : ''
        });
      }
      const failed = results.filter((result) => result.status !== 'ok').length;
      this.postMessage({
        type: 'verifyRecheckResult',
        results,
        allPassed: failed === 0,
        message: results.length === 0
          ? '保存した反例はありません。'
          : failed === 0 ? `${results.length} 件すべての反例で一致しました。` : `${results.length} 件中 ${failed} 件が一致しませんでした。`
      });
    } catch (error) {
      this.postMessage({ type: 'verifyNotice', message: '反例を確かめられませんでした: ' + error.message });
    } finally {
      this.setBusy(false);
    }
  }

  async regenerateExpected() {
    if (this.busy) {
      return;
    }
    this.setBusy(true);
    try {
      const prepared = await this.prepareRun({ needNaive: true });
      if (!prepared.ok) {
        this.postMessage({ type: 'verifyNotice', message: prepared.message });
        return;
      }
      let failed = 0;
      const counterexamples = [];
      for (const counterexample of this.data.counterexamples) {
        const run = await prepared.runNaive(counterexample.input);
        if (isFailedRun(run)) {
          failed += 1;
          counterexamples.push(counterexample);
        } else {
          counterexamples.push({ ...counterexample, expected: run.stdout });
        }
      }
      this.data = { ...this.data, counterexamples };
      await this.save({ force: true });
      this.postMessage({
        type: 'verifyCounterexamples',
        counterexamples,
        clearRecheck: true,
        failed: failed > 0,
        message: failed > 0
          ? `${failed} 件は愚直解がエラーになったため、前の期待する出力のままです。`
          : '期待する出力を作り直しました。'
      });
    } catch (error) {
      this.postMessage({ type: 'verifyNotice', message: '期待する出力を作り直せませんでした: ' + error.message });
    } finally {
      this.setBusy(false);
    }
  }

  async chooseNaive() {
    if (!this.target || !this.vscodeApi) {
      return;
    }
    const picked = await this.vscodeApi.window.showOpenDialog({
      defaultUri: this.vscodeApi.Uri.file(path.dirname(this.target)),
      canSelectMany: false,
      filters: { Python: ['py'] },
      openLabel: '愚直解に使う'
    });
    if (!picked || picked.length === 0) {
      return;
    }
    this.data.naivePath = toRelativeNaivePath(this.target, picked[0].fsPath);
    await this.save({ force: true });
    await this.postLoaded();
  }

  async createNaive() {
    if (!this.target || !this.vscodeApi) {
      return;
    }
    const naivePath = resolveNaivePath(this.target, this.data.naivePath);
    if (!(await fileExists(this.fs, naivePath))) {
      let mainSource = '';
      try {
        mainSource = await this.fs.readFile(this.target, 'utf8');
      } catch {
        mainSource = '';
      }
      await this.fs.writeFile(naivePath, NAIVE_TEMPLATE_HEADER + mainSource, { encoding: 'utf8', flag: 'wx' });
    }
    await this.postLoaded();
    const document = await this.vscodeApi.workspace.openTextDocument(this.vscodeApi.Uri.file(naivePath));
    await this.vscodeApi.window.showTextDocument(document, { preview: false });
  }
}

module.exports = {
  NAIVE_TEMPLATE_HEADER,
  VerifyController,
  parseSeed
};
