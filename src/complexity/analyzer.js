'use strict';

const C = require('./complexityExpr');

const MAX_PASSES = 4;
const SCOPE_TYPES = new Set(['FunctionDef', 'AsyncFunctionDef', 'Lambda', 'ClassDef']);
const KNOWN_MODULES = new Set([
  'heapq', 'bisect', 'math', 'itertools', 'collections', 'functools', 'copy', 'sys', 'operator', 'string', 'random'
]);
const MEMO_DECORATORS = new Set(['lru_cache', 'cache']);
const LINE_KIND_ORDER = { function: 0, loop: 1, recursion: 2, call: 3 };
const STRIP_METHODS = new Set(['strip', 'rstrip', 'lstrip', 'decode']);
const READ_METHODS = new Set(['strip', 'rstrip', 'lstrip', 'decode', 'split', 'rsplit']);
const READLINE_PATHS = new Set(['sys.stdin.readline', 'sys.stdin.buffer.readline']);
const READ_ALL_PATHS = new Set(['sys.stdin.read', 'sys.stdin.buffer.read', 'sys.stdin.readlines', 'sys.stdin.buffer.readlines']);
const LIST_WRAPPERS = new Set(['list', 'tuple', 'sorted', 'set', 'deque']);
const COLLECTION_BUILDERS = new Set(['list', 'tuple', 'set', 'frozenset', 'dict', 'Counter', 'deque', 'bytearray', 'OrderedDict']);
const PASS_THROUGH_ITERS = new Set(['list', 'tuple', 'sorted', 'reversed', 'set', 'frozenset', 'iter', 'deque', 'accumulate']);
const AGGREGATES = new Set(['sum', 'max', 'min', 'any', 'all']);
const HEAP_LOG_FUNCS = new Set(['heappush', 'heappop', 'heappushpop', 'heapreplace']);
const BISECT_FUNCS = new Set(['bisect', 'bisect_left', 'bisect_right']);
const INSORT_FUNCS = new Set(['insort', 'insort_left', 'insort_right']);
const NUMERIC_FUNCS = new Set(['int', 'abs', 'round', 'float', 'floor', 'ceil', 'trunc']);
const STRING_FUNCS = new Set(['str', 'chr', 'bin', 'hex', 'oct', 'format', 'repr']);
const STRING_LINEAR_METHODS = new Set([
  'split', 'rsplit', 'replace', 'find', 'rfind', 'upper', 'lower', 'strip', 'lstrip', 'rstrip', 'swapcase', 'translate'
]);
const STRING_RESULT_METHODS = new Set([
  'join', 'strip', 'lstrip', 'rstrip', 'replace', 'upper', 'lower', 'swapcase', 'translate', 'zfill', 'format'
]);
const SIZE_PRESERVING_METHODS = new Set([
  'split', 'rsplit', 'strip', 'rstrip', 'lstrip', 'replace', 'upper', 'lower', 'copy', 'keys', 'values', 'items', 'encode',
  'most_common'
]);

const MESSAGES = {
  invalidResult: 'コードの読み取り結果が正しくないため、計算量を推定できませんでした。',
  syntax: (line, detail) => (line
    ? `${line} 行目に文法の誤りがあるため、計算量を推定できませんでした（${detail}）。`
    : `文法の誤りがあるため、計算量を推定できませんでした（${detail}）。`),
  internal: (detail) => `計算量の推定中に問題が起きました（${detail}）。`,
  unknownWhile: 'この while ループが何回くり返すか読み取れなかったので、N 回とみなしました。',
  unknownLoop: 'このループが何回くり返すか読み取れなかったので、N 回とみなしました。',
  unknownCounter: 'この while ループの上限が分からないので、N 回とみなしました。',
  unknownQueue: 'キューが空になるまでの回数が分からないので、N 回とみなしました。',
  unknownBinarySearch: '二分探索の範囲の幅が分からないので、log N 回とみなしました。',
  unknownGeometric: '半分（または2倍）にしていく範囲が分からないので、log N 回とみなしました。',
  unknownSize: (what) => `${what}の大きさが分からないので、N とみなしました。`,
  unknownCollection: (name) => `「${name}」の長さをコードから読み取れなかったので、|${name}| のまま計算しました。`,
  stringConcat: 'ループの中で文字列に += すると、毎回つなぎ直すので O(N) かかることがあります。リストに append して、最後に "".join(...) でつなぐと安全です。',
  exponential: 'メモ化なしで自分自身を2回以上呼んでいるので、指数時間（2^N）になりそうです。@lru_cache などでメモ化できないか考えてみましょう。',
  unknownRecursion: '再帰の回数を読み取れなかったので、N 回とみなしました。',
  unknownStates: 'メモ化再帰の状態の数が分からないので、N とみなしました。',
  mutualRecursion: '関数どうしが呼び合っているので、計算量を正しく読めていないかもしれません。',
  permutations: '順列の数は N! 通りですが、ここでは 2^N と表示しています。',
  unstable: 'くり返しの中で大きくなるデータの大きさが決まらなかったので、結果は目安です。'
};

const NOTES = {
  assumed: 'N 回とみなしました',
  binarySearch: '二分探索',
  sqrt: '√N 回',
  geometric: '毎回半分（または2倍）',
  harmonic: '調和級数（全体の回数）',
  queue: 'BFS・DFS（頂点の数だけ）',
  queueEmpty: 'キュー（スタック）が空になるまで',
  adjacency: 'ならし計算（全体で辺の数）',
  twoPointer: 'しゃくとり法（全体の回数）',
  permutations: '順列（N! 通りを 2^N で表示）',
  comprehension: '内包表記',
  memo: 'メモ化再帰（状態の数だけ呼ばれる）',
  dfs: '再帰の DFS（頂点の数だけ呼ばれる）',
  halving: '半分ずつ小さくなる再帰',
  linear: '1 ずつ小さくなる再帰',
  exponential: 'メモ化なしの再帰（指数時間）',
  unknownRecursion: '再帰の回数を N とみなしました'
};

function fail(line, message) {
  return { ok: false, line, message };
}

// ---- AST helpers ----

function isNode(value) {
  return value !== null && typeof value === 'object' && typeof value._type === 'string';
}

function childNodes(node) {
  const children = [];
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (isNode(value)) {
      children.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    }
  }
  return children;
}

function walkNode(node, visit) {
  if (!isNode(node) || visit(node) === false) {
    return;
  }
  for (const child of childNodes(node)) {
    walkNode(child, visit);
  }
}

function findInBody(stmts, predicate, skipNode = null) {
  const found = [];
  for (const stmt of stmts || []) {
    walkNode(stmt, (node) => {
      if (node === skipNode || SCOPE_TYPES.has(node._type)) {
        return false;
      }
      if (predicate(node)) {
        found.push(node);
      }
      return true;
    });
  }
  return found;
}

function constNumber(node) {
  if (!isNode(node)) {
    return null;
  }
  if (node._type === 'Constant' && typeof node.value === 'number' && Number.isFinite(node.value)) {
    return node.value;
  }
  if (node._type === 'UnaryOp' && node.op._type === 'USub') {
    const inner = constNumber(node.operand);
    return inner === null ? null : -inner;
  }
  return null;
}

function targetNames(target) {
  if (!isNode(target)) {
    return [];
  }
  if (target._type === 'Name') {
    return [target.id];
  }
  if (target._type === 'Tuple' || target._type === 'List') {
    return target.elts.flatMap(targetNames);
  }
  if (target._type === 'Starred') {
    return targetNames(target.value);
  }
  return [];
}

function rootName(node) {
  let current = node;
  while (isNode(current) && (current._type === 'Subscript' || current._type === 'Attribute')) {
    current = current.value;
  }
  return isNode(current) && current._type === 'Name' ? current.id : null;
}

function lineOf(node, fallback = null) {
  return isNode(node) && Number.isInteger(node.lineno) ? node.lineno : fallback;
}

function isComprehension(node) {
  return isNode(node) && ['ListComp', 'SetComp', 'GeneratorExp', 'DictComp'].includes(node._type);
}

function isName(node, id) {
  return isNode(node) && node._type === 'Name' && (id === undefined || node.id === id);
}

function paramNames(fn) {
  return [...fn.args.posonlyargs, ...fn.args.args].map((arg) => arg.arg);
}

function allParamNames(fn) {
  const args = fn.args;
  return [
    ...paramNames(fn),
    ...(args.vararg ? [args.vararg.arg] : []),
    ...args.kwonlyargs.map((arg) => arg.arg),
    ...(args.kwarg ? [args.kwarg.arg] : [])
  ];
}

function addOrNull(a, b) {
  return a && b ? C.add(a, b) : null;
}

function firstNonConstant(values) {
  return values.find((value) => value && !C.isConstant(value)) || null;
}

// ---- program preparation ----

function dottedName(program, node) {
  if (!isNode(node)) {
    return null;
  }
  if (node._type === 'Name') {
    return program.importAliases.get(node.id) || node.id;
  }
  if (node._type === 'Attribute') {
    const base = dottedName(program, node.value);
    return base ? `${base}.${node.attr}` : null;
  }
  return null;
}

function rawInputKind(program, node) {
  if (!isNode(node) || node._type !== 'Call') {
    return null;
  }
  const func = node.func;
  if (func._type === 'Name') {
    if (program.inputNames.has(func.id)) {
      return 'line';
    }
    if (program.readAllNames.has(func.id)) {
      return 'all';
    }
  }
  const path = dottedName(program, func);
  if (path && READLINE_PATHS.has(path)) {
    return 'line';
  }
  if (path && READ_ALL_PATHS.has(path)) {
    return 'all';
  }
  if (func._type === 'Attribute' && ['read', 'readline', 'readlines'].includes(func.attr) &&
    func.value._type === 'Call' && isName(func.value.func, 'open')) {
    return func.attr === 'readline' ? 'line' : 'all';
  }
  return null;
}

function isTemplateCall(program, node) {
  return isNode(node) && node._type === 'Call' && isName(node.func) &&
    program.templates.has(node.func.id) && node.args.length === 0;
}

function containsInputUncached(program, node) {
  let found = false;
  walkNode(node, (current) => {
    if (found || SCOPE_TYPES.has(current._type)) {
      return false;
    }
    if (rawInputKind(program, current) || isTemplateCall(program, current)) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

function containsInput(program, node) {
  if (!isNode(node)) {
    return false;
  }
  if (!program.inputCache) {
    return containsInputUncached(program, node);
  }
  if (!program.inputCache.has(node)) {
    program.inputCache.set(node, containsInputUncached(program, node));
  }
  return program.inputCache.get(node);
}

function singleReturnValue(fn) {
  const body = fn.body.filter((stmt) => !(stmt._type === 'Expr' && stmt.value._type === 'Constant' && typeof stmt.value.value === 'string'));
  return body.length === 1 && body[0]._type === 'Return' ? body[0].value : null;
}

function collectDefinitions(program, node, inClass) {
  if (!isNode(node)) {
    return;
  }
  if (node._type === 'FunctionDef' || node._type === 'AsyncFunctionDef') {
    program.functionNodes.push(node);
    if (!inClass) {
      program.functions.set(node.name, node);
    }
    childNodes(node).forEach((child) => collectDefinitions(program, child, false));
    return;
  }
  const nextInClass = node._type === 'ClassDef' ? true : inClass;
  childNodes(node).forEach((child) => collectDefinitions(program, child, nextInClass));
}

function collectImports(program) {
  walkNode(program.tree, (node) => {
    if (node._type === 'Import') {
      for (const alias of node.names) {
        const local = alias.asname || alias.name.split('.')[0];
        program.importAliases.set(local, alias.asname ? alias.name : local);
      }
    } else if (node._type === 'ImportFrom' && node.module) {
      for (const alias of node.names) {
        program.importAliases.set(alias.asname || alias.name, `${node.module}.${alias.name}`);
      }
    }
    return true;
  });
}

function collectInputAliases(program) {
  for (let round = 0; round < 3; round += 1) {
    walkNode(program.tree, (node) => {
      if (node._type === 'Assign' && node.targets.length === 1 && isName(node.targets[0])) {
        const name = node.targets[0].id;
        const path = dottedName(program, node.value);
        if (path && READLINE_PATHS.has(path)) {
          program.inputNames.add(name);
        } else if (path && READ_ALL_PATHS.has(path)) {
          program.readAllNames.add(name);
        } else if (node.value._type === 'Lambda' && allArgsEmpty(node.value.args) &&
          containsInputUncached(program, node.value.body)) {
          program.templates.set(name, node.value.body);
        }
      } else if ((node._type === 'FunctionDef' || node._type === 'AsyncFunctionDef') && allArgsEmpty(node.args)) {
        const value = singleReturnValue(node);
        if (value && containsInputUncached(program, value)) {
          program.templates.set(node.name, value);
        }
      }
      return true;
    });
  }
}

function allArgsEmpty(args) {
  return args.posonlyargs.length === 0 && args.args.length === 0 && !args.vararg &&
    args.kwonlyargs.length === 0 && !args.kwarg;
}

function pickAssumedSymbol(program) {
  const names = new Set();
  walkNode(program.tree, (node) => {
    if (node._type === 'Assign' && containsInput(program, node.value)) {
      node.targets.forEach((target) => targetNames(target).forEach((name) => names.add(name)));
    }
    return true;
  });
  if (names.has('n')) {
    return 'n';
  }
  return 'N';
}

function prepareProgram(tree) {
  const program = {
    tree,
    functions: new Map(),
    functionNodes: [],
    importAliases: new Map(),
    inputNames: new Set(['input']),
    readAllNames: new Set(),
    templates: new Map(),
    inputCache: null,
    assumedSymbol: 'N'
  };
  collectDefinitions(program, tree, false);
  collectImports(program);
  collectInputAliases(program);
  program.inputCache = new WeakMap();
  program.assumedSymbol = pickAssumedSymbol(program);
  return program;
}

// ---- input reads ----

function unwrapAlias(program, node, depth = 0) {
  if (depth < 5 && isTemplateCall(program, node)) {
    return unwrapAlias(program, program.templates.get(node.func.id), depth + 1);
  }
  return node;
}

function stripString(program, node) {
  let current = unwrapAlias(program, node);
  while (isNode(current) && current._type === 'Call' && current.func._type === 'Attribute' &&
    STRIP_METHODS.has(current.func.attr) && current.args.length <= 1) {
    current = unwrapAlias(program, current.func.value);
  }
  return current;
}

function isLineRead(program, node) {
  return rawInputKind(program, stripString(program, node)) === 'line';
}

function isSplitLine(program, node) {
  const current = unwrapAlias(program, node);
  return isNode(current) && current._type === 'Call' && current.func._type === 'Attribute' &&
    current.func.attr === 'split' && isLineRead(program, current.func.value);
}

function builtinNameOf(program, func) {
  if (!isName(func)) {
    return null;
  }
  const path = program.importAliases.get(func.id);
  return path ? path.split('.').pop() : func.id;
}

function isIntMap(program, node) {
  const current = unwrapAlias(program, node);
  return isNode(current) && current._type === 'Call' && builtinNameOf(program, current.func) === 'map' &&
    current.args.length === 2 && isName(current.args[0]) && ['int', 'float'].includes(current.args[0].id) &&
    isSplitLine(program, current.args[1]);
}

function isIntListComp(program, node) {
  const current = unwrapAlias(program, node);
  return isNode(current) && (current._type === 'ListComp' || current._type === 'GeneratorExp') &&
    current.generators.length === 1 && isSplitLine(program, current.generators[0].iter) &&
    current.elt._type === 'Call' && ['int', 'float'].includes(builtinNameOf(program, current.elt.func));
}

function isIntsSource(program, node) {
  return isIntMap(program, node) || isIntListComp(program, node);
}

function isIntRead(program, node) {
  const current = unwrapAlias(program, node);
  if (!isNode(current)) {
    return false;
  }
  if (current._type === 'Call' && ['int', 'float'].includes(builtinNameOf(program, current.func)) &&
    current.args.length >= 1) {
    return isLineRead(program, current.args[0]);
  }
  if (current._type === 'BinOp' && ['Add', 'Sub'].includes(current.op._type) && constNumber(current.right) !== null) {
    return isIntRead(program, current.left);
  }
  return false;
}

function wrappedIntsSource(program, node) {
  const current = unwrapAlias(program, node);
  if (!isNode(current)) {
    return null;
  }
  if (current._type === 'Call' && LIST_WRAPPERS.has(builtinNameOf(program, current.func)) &&
    current.args.length === 1 && isIntsSource(program, current.args[0])) {
    return builtinNameOf(program, current.func);
  }
  if (current._type === 'List' && current.elts.length === 1 && current.elts[0]._type === 'Starred' &&
    isIntsSource(program, current.elts[0].value)) {
    return 'list';
  }
  return null;
}

// True when the node is itself a read such as int(input()) or list(map(int, input().split()))[1:].
function isReadRooted(program, node) {
  let current = unwrapAlias(program, node);
  for (let step = 0; step < 20 && isNode(current); step += 1) {
    if (rawInputKind(program, current) || isTemplateCall(program, current)) {
      return true;
    }
    if (current._type === 'Subscript' && current.slice._type === 'Slice') {
      current = unwrapAlias(program, current.value);
    } else if (current._type === 'Call' && current.func._type === 'Attribute' && READ_METHODS.has(current.func.attr)) {
      current = unwrapAlias(program, current.func.value);
    } else if (current._type === 'Call' && isName(current.func) && current.args.length === 1 &&
      (LIST_WRAPPERS.has(builtinNameOf(program, current.func)) || NUMERIC_FUNCS.has(builtinNameOf(program, current.func)))) {
      current = unwrapAlias(program, current.args[0]);
    } else if (current._type === 'Call' && builtinNameOf(program, current.func) === 'map' && current.args.length === 2) {
      current = unwrapAlias(program, current.args[1]);
    } else if ((current._type === 'ListComp' || current._type === 'GeneratorExp') && current.generators.length === 1) {
      current = unwrapAlias(program, current.generators[0].iter);
    } else if (current._type === 'List' && current.elts.length === 1 && current.elts[0]._type === 'Starred') {
      current = unwrapAlias(program, current.elts[0].value);
    } else if (current._type === 'BinOp' && ['Add', 'Sub'].includes(current.op._type) && constNumber(current.right) !== null) {
      current = unwrapAlias(program, current.left);
    } else {
      return false;
    }
  }
  return false;
}

function isLineList(program, node) {
  const current = unwrapAlias(program, node);
  if (isLineRead(program, current)) {
    return true;
  }
  return isNode(current) && current._type === 'Call' && builtinNameOf(program, current.func) === 'list' &&
    current.args.length === 1 && isLineRead(program, current.args[0]);
}

function classifyInputRead(ctx, valueNode, targetNode) {
  const program = ctx.program;
  if (!containsInput(program, valueNode)) {
    return null;
  }
  const tuple = isNode(targetNode) && (targetNode._type === 'Tuple' || targetNode._type === 'List');
  let value = unwrapAlias(program, valueNode);
  while (value._type === 'Subscript' && value.slice._type === 'Slice' && isReadRooted(program, value.value)) {
    value = unwrapAlias(program, value.value);
  }
  const read = { kind: 'unknown', count: null, sorted: false };
  const wrapper = wrappedIntsSource(program, value);
  if (isIntRead(program, value)) {
    read.kind = 'ints';
  } else if (isIntsSource(program, value)) {
    read.kind = tuple ? 'ints' : 'intList';
  } else if (wrapper) {
    read.kind = tuple ? 'ints' : 'intList';
    read.sorted = wrapper === 'sorted';
  } else if (isLineList(program, value)) {
    read.kind = tuple ? 'unknown' : 'string';
  } else if (value._type === 'ListComp' && value.generators.length === 1 && value.generators[0].ifs.length === 0 &&
    !containsInput(program, value.generators[0].iter) && isReadRooted(program, value.elt)) {
    const element = value.elt;
    read.count = iterInfo(ctx, value.generators[0].iter).count;
    if (isLineList(program, element)) {
      read.kind = 'lines';
    } else if (isIntRead(program, element)) {
      read.kind = 'intList';
    }
  } else if (!isReadRooted(program, value)) {
    return null;
  }
  return read;
}

function classifyStrayInput(program, node) {
  let kind = null;
  walkNode(node, (current) => {
    if (kind || SCOPE_TYPES.has(current._type)) {
      return false;
    }
    if (isIntRead(program, current)) {
      kind = 'ints';
    } else if (isIntsSource(program, current) || wrappedIntsSource(program, current)) {
      kind = 'intList';
    } else if (isLineList(program, current)) {
      kind = 'string';
    }
    return !kind;
  });
  return kind || 'unknown';
}

function inputCount(ctx, base) {
  const multiplier = totalMultiplier(ctx);
  if (base) {
    return C.multiply(base, multiplier);
  }
  return C.isConstant(multiplier) ? null : multiplier;
}

function recordInput(ctx, node, targets, kind, count) {
  if (ctx.silent) {
    return;
  }
  const key = `${node.lineno}:${node.col_offset}`;
  if (ctx.inputKeys.has(key)) {
    return;
  }
  ctx.inputKeys.add(key);
  ctx.inputs.push({ line: lineOf(node), targets, kind, count });
}

function recordStrayInput(ctx, node) {
  if (ctx.handledInputs.has(node)) {
    return;
  }
  ctx.handledInputs.add(node);
  recordInput(ctx, node, [], classifyStrayInput(ctx.program, node), inputCount(ctx, null));
}

// ---- context and scopes ----

function createScope(parent, globals = new Set(), nonlocals = new Set()) {
  return { vars: new Map(), parent, globals, nonlocals };
}

function createContext(program, prevGrowth) {
  const moduleScope = createScope(null);
  return {
    program,
    prevGrowth,
    growth: new Map(),
    moduleScope,
    scope: moduleScope,
    frames: [],
    callerMultiplier: C.constant(),
    funcStack: [],
    moduleAmort: C.constant(),
    time: C.constant(),
    lines: new Map(),
    comprehensionLines: new Map(),
    warnings: new Map(),
    inputs: [],
    inputKeys: new Set(),
    space: C.constant(),
    flags: { assumed: false, low: false },
    silent: 0,
    callCache: new Map(),
    analyzedNodes: new Set(),
    handledInputs: new WeakSet()
  };
}

function makeInfo(fields = {}) {
  return {
    kind: null,
    value: null,
    size: null,
    elemSize: null,
    elemTotal: null,
    adjacency: false,
    memory: null,
    exact: null,
    exactSize: null,
    fresh: false,
    ...fields
  };
}

function lookupEntry(ctx, name) {
  let scope = ctx.scope;
  if (scope.globals.has(name)) {
    scope = ctx.moduleScope;
  }
  while (scope) {
    if (scope.vars.has(name)) {
      return { scope, info: scope.vars.get(name) };
    }
    scope = scope.parent;
  }
  return null;
}

function lookup(ctx, name) {
  const entry = lookupEntry(ctx, name);
  return entry ? entry.info : null;
}

function assignName(ctx, name, info) {
  let scope = ctx.scope;
  if (scope.globals.has(name)) {
    scope = ctx.moduleScope;
  } else if (scope.nonlocals.has(name)) {
    let candidate = scope.parent;
    while (candidate && !candidate.vars.has(name)) {
      candidate = candidate.parent;
    }
    scope = candidate || scope;
  }

  const stored = { ...info, frameDepth: ctx.frames.length, funcLevel: ctx.funcStack.length };
  if (stored.fresh) {
    const sizeGrowth = ctx.prevGrowth.get(`size:${name}`);
    if (sizeGrowth && stored.size) {
      stored.size = C.add(stored.size, sizeGrowth);
    }
    const elemGrowth = ctx.prevGrowth.get(`elem:${name}`);
    if (elemGrowth && stored.adjacency) {
      stored.elemTotal = C.add(stored.elemTotal || C.constant(), elemGrowth);
    }
    if (stored.memory && !ctx.silent) {
      ctx.space = C.add(ctx.space, stored.memory);
    }
  }
  stored.fresh = false;
  scope.vars.set(name, stored);
}

function warn(ctx, line, message) {
  if (ctx.silent) {
    return;
  }
  const key = `${line}:${message}`;
  if (!ctx.warnings.has(key)) {
    ctx.warnings.set(key, { line, message });
  }
}

function assume(ctx, line, message) {
  if (!ctx.silent) {
    ctx.flags.assumed = true;
    warn(ctx, line, message);
  }
  return C.symbolComplexity(ctx.program.assumedSymbol);
}

function markLow(ctx) {
  if (!ctx.silent) {
    ctx.flags.low = true;
  }
}

function addLine(ctx, line, kind, complexity, note = '', exact = null) {
  if (!Number.isInteger(line)) {
    return;
  }
  const key = `${line}:${kind}`;
  const existing = ctx.lines.get(key);
  if (!existing) {
    ctx.lines.set(key, { line, kind, complexity, note, exact });
    return;
  }
  existing.complexity = C.add(existing.complexity, complexity);
  if (note && !existing.note.split('、').includes(note)) {
    existing.note = existing.note ? `${existing.note}、${note}` : note;
  }
  if (existing.exact !== exact) {
    existing.exact = null;
  }
}

// ---- loop frames ----

function pushFrame(ctx, { node, count, varNames = [], amortized = false, adjSize = null }) {
  const frame = { node, count, varNames: new Set(varNames), amortized, adjSize, amortExtra: C.constant() };
  ctx.frames.push(frame);
  return frame;
}

function popFrame(ctx) {
  ctx.frames.pop();
}

function frameProduct(frames) {
  const counts = [];
  for (const frame of frames) {
    if (frame.amortized && counts.length > 0) {
      counts[counts.length - 1] = frame.count;
    } else {
      counts.push(frame.count);
    }
  }
  return counts.reduce((product, count) => C.multiply(product, count), C.constant());
}

function totalMultiplier(ctx) {
  return C.multiply(ctx.callerMultiplier, frameProduct(ctx.frames));
}

function inLoop(ctx) {
  return ctx.frames.length > 0 || !C.isConstant(ctx.callerMultiplier);
}

function enclosingLoopFrame(ctx, name) {
  for (let index = ctx.frames.length - 1; index >= 0; index -= 1) {
    const frame = ctx.frames[index];
    if (frame.varNames.has(name)) {
      return C.isConstant(frame.count) ? null : frame;
    }
  }
  return null;
}

// Sum over i of (bound / i) for the loop that owns i: bound × log(that loop's count).
function harmonicTotal(bound, frame) {
  return bound ? C.multiply(bound, C.logOfComplexity(frame.count)) : null;
}

function absorb(ctx, cost, target = null) {
  if (target && ctx.frames.includes(target)) {
    target.amortExtra = C.add(target.amortExtra, cost);
  } else if (ctx.frames.length > 0) {
    const frame = ctx.frames[ctx.frames.length - 1];
    frame.amortExtra = C.add(frame.amortExtra, cost);
  } else if (ctx.funcStack.length > 0) {
    const record = ctx.funcStack[ctx.funcStack.length - 1];
    record.amortExtra = C.add(record.amortExtra, cost);
  } else {
    ctx.moduleAmort = C.add(ctx.moduleAmort, cost);
  }
}

function recordGrowth(ctx, baseNode, amount) {
  if (ctx.silent || !isNode(baseNode)) {
    return;
  }
  let name = null;
  const keys = [];
  if (baseNode._type === 'Name') {
    name = baseNode.id;
    keys.push(`size:${name}`);
  } else if (baseNode._type === 'Subscript' && isName(baseNode.value)) {
    name = baseNode.value.id;
    keys.push(`elem:${name}`);
    const info = lookup(ctx, name);
    if (info && info.kind === 'dict') {
      keys.push(`size:${name}`);
    }
  } else {
    return;
  }

  const entry = lookupEntry(ctx, name);
  const multiplier = entry && entry.info.funcLevel === ctx.funcStack.length
    ? frameProduct(ctx.frames.slice(entry.info.frameDepth || 0))
    : totalMultiplier(ctx);
  const total = C.multiply(amount || C.constant(), multiplier);
  for (const key of keys) {
    ctx.growth.set(key, C.add(ctx.growth.get(key) || C.constant(), total));
  }
}

// ---- calls ----

function resolveCall(ctx, node) {
  const program = ctx.program;
  const func = node.func;
  if (isName(func)) {
    if (program.templates.has(func.id)) {
      return { kind: 'input', name: func.id };
    }
    if (program.functions.has(func.id)) {
      return { kind: 'user', name: func.id };
    }
    return { kind: 'builtin', name: builtinNameOf(program, func) };
  }
  if (isNode(func) && func._type === 'Attribute') {
    if (isName(func.value)) {
      const path = program.importAliases.get(func.value.id) || func.value.id;
      if (KNOWN_MODULES.has(path.split('.')[0]) && !lookup(ctx, func.value.id)) {
        return { kind: 'builtin', name: func.attr };
      }
    }
    return { kind: 'method', name: func.attr, obj: func.value };
  }
  return { kind: 'unknown', name: null };
}

// ---- magnitudes (how large a number can be) ----

function nameValue(ctx, name) {
  const info = lookup(ctx, name);
  if (!info) {
    return C.symbolComplexity(name);
  }
  return info.value || null;
}

function mag(ctx, node) {
  if (!isNode(node)) {
    return null;
  }
  switch (node._type) {
    case 'Constant':
      return C.constant();
    case 'Name':
      return nameValue(ctx, node.id);
    case 'UnaryOp':
      return node.op._type === 'Not' ? C.constant() : mag(ctx, node.operand);
    case 'BinOp':
      return binOpMag(ctx, node);
    case 'Call':
      return callMag(ctx, node);
    case 'IfExp':
      return addOrNull(mag(ctx, node.body), mag(ctx, node.orelse));
    case 'Compare':
    case 'BoolOp':
      return C.constant();
    default:
      return null;
  }
}

function binOpMag(ctx, node) {
  const op = node.op._type;
  if (op === 'Pow') {
    const exponent = constNumber(node.right);
    if (exponent !== null) {
      const base = mag(ctx, node.left);
      return base ? C.powerOf(base, exponent) : null;
    }
    if (constNumber(node.left) !== null) {
      const power = mag(ctx, node.right);
      return power ? C.exponentialOf(power) : null;
    }
    return null;
  }
  if (op === 'LShift') {
    const base = mag(ctx, node.left);
    const shift = mag(ctx, node.right);
    return base && shift ? C.multiply(base, C.exponentialOf(shift)) : null;
  }
  if (op === 'RShift' || op === 'FloorDiv' || op === 'Div') {
    return mag(ctx, node.left);
  }
  if (op === 'Mod') {
    return mag(ctx, node.right);
  }
  const left = mag(ctx, node.left);
  const right = mag(ctx, node.right);
  if (op === 'Sub') {
    return left && right ? C.add(left, right) : left;
  }
  if (!left || !right) {
    return null;
  }
  if (op === 'Mult') {
    return C.multiply(left, right);
  }
  if (op === 'BitAnd') {
    return C.isConstant(left) || C.isConstant(right) ? C.constant() : C.add(left, right);
  }
  return C.add(left, right);
}

function callMag(ctx, node) {
  const target = resolveCall(ctx, node);
  const args = node.args;
  if (target.kind === 'method') {
    if (target.name === 'bit_length') {
      const value = mag(ctx, target.obj);
      return value ? C.logOfComplexity(value) : null;
    }
    if (['count', 'index', 'find', 'rfind'].includes(target.name)) {
      return sizeOf(ctx, target.obj);
    }
    return null;
  }
  if (target.kind !== 'builtin') {
    return null;
  }
  const name = target.name;
  if (name === 'len') {
    return args.length ? sizeOf(ctx, args[0]) : null;
  }
  if (NUMERIC_FUNCS.has(name)) {
    return args.length ? mag(ctx, args[0]) : C.constant();
  }
  if (name === 'max' || name === 'min') {
    if (args.length < 2) {
      return null;
    }
    return args.map((arg) => mag(ctx, arg)).reduce((sum, value) => addOrNull(sum, value), C.constant());
  }
  if (name === 'isqrt' || name === 'sqrt') {
    const value = args.length ? mag(ctx, args[0]) : null;
    return value ? C.powerOf(value, 0.5) : null;
  }
  if (['log', 'log2', 'log10'].includes(name)) {
    const value = args.length ? mag(ctx, args[0]) : null;
    return value ? C.logOfComplexity(value) : null;
  }
  if (name === 'pow' && args.length === 2) {
    return binOpMag(ctx, { _type: 'BinOp', left: args[0], op: { _type: 'Pow' }, right: args[1] });
  }
  return null;
}

function constValue(ctx, node) {
  if (!isNode(node)) {
    return null;
  }
  if (node._type === 'Constant') {
    if (typeof node.value === 'number' && Number.isFinite(node.value)) {
      return node.value;
    }
    return typeof node.value === 'boolean' ? Number(node.value) : null;
  }
  if (node._type === 'Name') {
    const info = lookup(ctx, node.id);
    return info && typeof info.exact === 'number' ? info.exact : null;
  }
  if (node._type === 'UnaryOp' && node.op._type === 'USub') {
    const inner = constValue(ctx, node.operand);
    return inner === null ? null : -inner;
  }
  if (node._type !== 'BinOp') {
    return null;
  }
  const left = constValue(ctx, node.left);
  const right = constValue(ctx, node.right);
  if (left === null || right === null) {
    return null;
  }
  const operations = {
    Add: () => left + right,
    Sub: () => left - right,
    Mult: () => left * right,
    FloorDiv: () => (right === 0 ? null : Math.floor(left / right)),
    Pow: () => left ** right,
    Mod: () => (right === 0 ? null : ((left % right) + right) % right),
    LShift: () => left * 2 ** right
  };
  const result = operations[node.op._type] ? operations[node.op._type]() : null;
  return typeof result === 'number' && Number.isFinite(result) && Math.abs(result) <= 1e18 ? result : null;
}

// ---- sizes (how long a collection is) ----

function nameSize(ctx, name, line) {
  const info = lookup(ctx, name);
  if (info) {
    return info.size;
  }
  markLow(ctx);
  warn(ctx, line, MESSAGES.unknownCollection(name));
  return C.symbolComplexity(`|${name}|`);
}

function literalSize(ctx, elts) {
  let size = C.constant();
  for (const element of elts) {
    if (element._type === 'Starred') {
      size = addOrNull(size, sizeOf(ctx, element.value));
    }
  }
  return size;
}

function isStringLike(ctx, node) {
  if (!isNode(node)) {
    return false;
  }
  switch (node._type) {
    case 'Constant':
      return typeof node.value === 'string';
    case 'JoinedStr':
      return true;
    case 'Name': {
      const info = lookup(ctx, node.id);
      return Boolean(info && info.kind === 'str');
    }
    case 'Call': {
      const target = resolveCall(ctx, node);
      return (target.kind === 'builtin' && STRING_FUNCS.has(target.name)) ||
        (target.kind === 'method' && STRING_RESULT_METHODS.has(target.name));
    }
    case 'BinOp':
      return (node.op._type === 'Add' && (isStringLike(ctx, node.left) || isStringLike(ctx, node.right))) ||
        (node.op._type === 'Mult' && (isStringLike(ctx, node.left) || isStringLike(ctx, node.right))) ||
        (node.op._type === 'Mod' && isStringLike(ctx, node.left));
    case 'Subscript':
      return isStringLike(ctx, node.value);
    default:
      return false;
  }
}

function isSequenceLike(ctx, node) {
  if (!isNode(node)) {
    return false;
  }
  if (isStringLike(ctx, node)) {
    return true;
  }
  switch (node._type) {
    case 'List':
    case 'Tuple':
    case 'ListComp':
      return true;
    case 'Name': {
      const info = lookup(ctx, node.id);
      return Boolean(info && ['list', 'deque'].includes(info.kind));
    }
    case 'Call': {
      const target = resolveCall(ctx, node);
      return target.kind === 'builtin' && ['list', 'tuple', 'sorted'].includes(target.name);
    }
    case 'BinOp':
      return ['Add', 'Mult'].includes(node.op._type) && (isSequenceLike(ctx, node.left) || isSequenceLike(ctx, node.right));
    case 'Subscript':
      return node.slice._type === 'Slice' && isSequenceLike(ctx, node.value);
    default:
      return false;
  }
}

function sizeOf(ctx, node) {
  if (!isNode(node)) {
    return null;
  }
  switch (node._type) {
    case 'Name':
      return nameSize(ctx, node.id, lineOf(node));
    case 'Constant':
    case 'Dict':
    case 'JoinedStr':
      return C.constant();
    case 'List':
    case 'Tuple':
    case 'Set':
      return literalSize(ctx, node.elts);
    case 'BinOp':
      return binOpSize(ctx, node);
    case 'ListComp':
    case 'SetComp':
    case 'GeneratorExp':
    case 'DictComp':
      return comprehensionShape(ctx, node).length;
    case 'Call':
      return callSize(ctx, node);
    case 'Subscript':
      return subscriptSize(ctx, node);
    case 'IfExp':
      return addOrNull(sizeOf(ctx, node.body), sizeOf(ctx, node.orelse));
    default:
      return null;
  }
}

function binOpSize(ctx, node) {
  const op = node.op._type;
  if (op === 'Mult') {
    if (isSequenceLike(ctx, node.left)) {
      const length = sizeOf(ctx, node.left);
      const times = mag(ctx, node.right);
      return length && times ? C.multiply(length, times) : null;
    }
    if (isSequenceLike(ctx, node.right)) {
      const length = sizeOf(ctx, node.right);
      const times = mag(ctx, node.left);
      return length && times ? C.multiply(length, times) : null;
    }
    return null;
  }
  if (op === 'Add' && isSequenceLike(ctx, node.left) && isSequenceLike(ctx, node.right)) {
    return addOrNull(sizeOf(ctx, node.left), sizeOf(ctx, node.right));
  }
  if (op === 'Mod' && isStringLike(ctx, node.left)) {
    return C.constant();
  }
  return null;
}

function rangeBound(ctx, args) {
  if (args.length === 0) {
    return null;
  }
  if (args.length === 1) {
    return mag(ctx, args[0]);
  }
  return addOrNull(mag(ctx, args[0]), mag(ctx, args[1]));
}

function callSize(ctx, node) {
  const target = resolveCall(ctx, node);
  const args = node.args;
  if (target.kind === 'method') {
    if (SIZE_PRESERVING_METHODS.has(target.name)) {
      return containsInput(ctx.program, target.obj) ? null : sizeOf(ctx, target.obj);
    }
    if (target.name === 'join') {
      return args.length ? sizeOf(ctx, args[0]) : null;
    }
    return null;
  }
  if (target.kind !== 'builtin') {
    return null;
  }
  const name = target.name;
  if (name === 'range') {
    return rangeBound(ctx, args);
  }
  if (PASS_THROUGH_ITERS.has(name) || COLLECTION_BUILDERS.has(name) || name === 'enumerate') {
    return args.length ? sizeOf(ctx, args[0]) : C.constant();
  }
  if (name === 'map' || name === 'filter') {
    return args.length >= 2 ? args.slice(1).map((arg) => sizeOf(ctx, arg)).reduce(addOrNull, C.constant()) : null;
  }
  if (name === 'zip') {
    return args.map((arg) => sizeOf(ctx, arg)).reduce(addOrNull, C.constant());
  }
  if (name === 'permutations') {
    const base = args.length ? sizeOf(ctx, args[0]) : null;
    const choose = args.length >= 2 ? constNumber(args[1]) : null;
    if (!base) {
      return null;
    }
    return choose !== null ? C.powerOf(base, choose) : C.exponentialOf(base);
  }
  if (name === 'combinations' || name === 'combinations_with_replacement') {
    const base = args.length ? sizeOf(ctx, args[0]) : null;
    const choose = args.length >= 2 ? constNumber(args[1]) : null;
    if (!base) {
      return null;
    }
    return choose !== null ? C.powerOf(base, choose) : C.exponentialOf(base);
  }
  if (name === 'product') {
    const repeatKeyword = node.keywords.find((keyword) => keyword.arg === 'repeat');
    const repeat = repeatKeyword ? constNumber(repeatKeyword.value) : 1;
    const base = args.map((arg) => sizeOf(ctx, arg)).reduce((acc, size) => (acc && size ? C.multiply(acc, size) : null), C.constant());
    return base && repeat !== null ? C.powerOf(base, repeat) : null;
  }
  if (STRING_FUNCS.has(name)) {
    return C.constant();
  }
  return null;
}

function subscriptSize(ctx, node) {
  if (node.slice._type === 'Slice') {
    return sizeOf(ctx, node.value);
  }
  if (isName(node.value)) {
    const info = lookup(ctx, node.value.id);
    if (info && info.elemSize) {
      return info.elemSize;
    }
    if (info && info.adjacency) {
      return info.elemTotal;
    }
    if (info && info.kind === 'str') {
      return C.constant();
    }
  }
  return null;
}

function elemSizeOf(ctx, node) {
  if (!isNode(node)) {
    return null;
  }
  if (isName(node)) {
    const info = lookup(ctx, node.id);
    return info ? info.elemSize : null;
  }
  if ((node._type === 'List' || node._type === 'Tuple') && node.elts.length > 0 && isSequenceLike(ctx, node.elts[0])) {
    return sizeOf(ctx, node.elts[0]);
  }
  if (isComprehension(node)) {
    return comprehensionShape(ctx, node).elemSize;
  }
  if (node._type === 'Call' && node.args.length === 1) {
    return elemSizeOf(ctx, node.args[0]);
  }
  return null;
}

function isEmptyContainer(ctx, node) {
  if (!isNode(node)) {
    return false;
  }
  if (['List', 'Set', 'Tuple'].includes(node._type) && node.elts.length === 0) {
    return true;
  }
  if (node._type === 'Dict' && node.keys.length === 0) {
    return true;
  }
  if (node._type === 'Call' && node.args.length === 0) {
    const target = resolveCall(ctx, node);
    return target.kind === 'builtin' && ['list', 'set', 'deque', 'dict'].includes(target.name);
  }
  return false;
}

function withTempScope(ctx, callback) {
  const saved = ctx.scope;
  ctx.scope = createScope(saved);
  try {
    return callback();
  } finally {
    ctx.scope = saved;
  }
}

function comprehensionShape(ctx, node) {
  return withTempScope(ctx, () => {
    let length = C.constant();
    for (const generator of node.generators) {
      const info = iterInfo(ctx, generator.iter);
      length = length && info.count ? C.multiply(length, info.count) : null;
      bindTarget(ctx, generator.target, info);
    }
    const element = node._type === 'DictComp' ? node.value : node.elt;
    return {
      length,
      elemSize: isSequenceLike(ctx, element) ? sizeOf(ctx, element) : null,
      empty: isEmptyContainer(ctx, element)
    };
  });
}

// ---- describing assigned values ----

function describe(ctx, node) {
  if (!isNode(node)) {
    return makeInfo();
  }
  switch (node._type) {
    case 'Constant':
      if (typeof node.value === 'string') {
        return makeInfo({ kind: 'str', size: C.constant(), memory: C.constant(), fresh: true });
      }
      if (typeof node.value === 'number' || typeof node.value === 'boolean') {
        return makeInfo({ kind: 'int', value: C.constant(), exact: constValue(ctx, node) });
      }
      return makeInfo();
    case 'Name': {
      const info = lookup(ctx, node.id);
      return info ? { ...info, fresh: false, memory: null } : makeInfo({ value: C.symbolComplexity(node.id) });
    }
    case 'List':
    case 'Tuple':
    case 'Set': {
      const size = literalSize(ctx, node.elts);
      const hasStarred = node.elts.some((element) => element._type === 'Starred');
      return makeInfo({
        kind: node._type === 'Set' ? 'set' : 'list',
        size,
        elemSize: elemSizeOf(ctx, node),
        memory: size,
        exactSize: hasStarred ? null : node.elts.length,
        fresh: true
      });
    }
    case 'Dict':
      return makeInfo({ kind: 'dict', size: C.constant(), memory: C.constant(), fresh: true });
    case 'JoinedStr':
      return makeInfo({ kind: 'str', size: C.constant(), fresh: true });
    case 'BinOp':
      return describeBinOp(ctx, node);
    case 'ListComp':
    case 'SetComp':
    case 'DictComp':
    case 'GeneratorExp':
      return describeComprehension(ctx, node);
    case 'Call':
      return describeCall(ctx, node);
    case 'Subscript':
      return describeSubscript(ctx, node);
    case 'IfExp': {
      const body = describe(ctx, node.body);
      const orelse = describe(ctx, node.orelse);
      return makeInfo({
        kind: body.kind === orelse.kind ? body.kind : null,
        value: addOrNull(body.value, orelse.value),
        size: addOrNull(body.size, orelse.size)
      });
    }
    case 'UnaryOp':
      return makeInfo({ kind: 'int', value: mag(ctx, node), exact: constValue(ctx, node) });
    case 'Compare':
    case 'BoolOp':
      return makeInfo({ kind: 'int', value: C.constant() });
    case 'NamedExpr':
      return describe(ctx, node.value);
    default:
      return makeInfo();
  }
}

function describeBinOp(ctx, node) {
  const leftSequence = isSequenceLike(ctx, node.left);
  if (leftSequence || isSequenceLike(ctx, node.right)) {
    const sequence = leftSequence ? node.left : node.right;
    const size = sizeOf(ctx, node);
    let elemSize = null;
    if (node.op._type === 'Mult' && sequence._type === 'List' && sequence.elts.length === 1 &&
      isSequenceLike(ctx, sequence.elts[0])) {
      elemSize = sizeOf(ctx, sequence.elts[0]);
    }
    return makeInfo({
      kind: isStringLike(ctx, node) ? 'str' : 'list',
      size,
      elemSize,
      memory: size && elemSize ? C.multiply(size, elemSize) : size,
      fresh: true
    });
  }
  return makeInfo({ kind: 'int', value: mag(ctx, node), exact: constValue(ctx, node) });
}

function describeComprehension(ctx, node) {
  const shape = comprehensionShape(ctx, node);
  if (node._type === 'GeneratorExp') {
    return makeInfo({ kind: 'gen', size: shape.length });
  }
  const kind = { ListComp: 'list', SetComp: 'set', DictComp: 'dict' }[node._type];
  if (kind === 'list' && shape.empty) {
    return makeInfo({ kind, size: shape.length, adjacency: true, elemTotal: C.constant(), memory: shape.length, fresh: true });
  }
  const memory = shape.length && shape.elemSize ? C.multiply(shape.length, shape.elemSize) : shape.length;
  return makeInfo({ kind, size: shape.length, elemSize: shape.elemSize, memory, fresh: true });
}

function describeCall(ctx, node) {
  const target = resolveCall(ctx, node);
  const args = node.args;
  if (target.kind === 'method') {
    const name = target.name;
    if (name === 'split' || name === 'rsplit') {
      const size = sizeOf(ctx, node);
      return makeInfo({ kind: 'list', size, memory: size, fresh: true });
    }
    if (name === 'copy') {
      const base = describe(ctx, target.obj);
      return { ...base, memory: base.size, fresh: true };
    }
    if (STRING_RESULT_METHODS.has(name)) {
      const size = sizeOf(ctx, node);
      return makeInfo({ kind: 'str', size, memory: size, fresh: true });
    }
    if (['keys', 'values', 'items'].includes(name)) {
      return makeInfo({ kind: 'view', size: sizeOf(ctx, target.obj) });
    }
    if (['count', 'index', 'find', 'rfind', 'bit_length'].includes(name)) {
      return makeInfo({ kind: 'int', value: callMag(ctx, node) });
    }
    return makeInfo();
  }
  if (target.kind !== 'builtin') {
    return makeInfo();
  }

  const name = target.name;
  const first = args[0];
  if (['list', 'tuple', 'sorted', 'reversed'].includes(name)) {
    const size = first ? sizeOf(ctx, first) : C.constant();
    return makeInfo({ kind: 'list', size, elemSize: first ? elemSizeOf(ctx, first) : null, memory: size, fresh: true });
  }
  if (name === 'set' || name === 'frozenset') {
    const size = first ? sizeOf(ctx, first) : C.constant();
    return makeInfo({ kind: 'set', size, memory: size, fresh: true });
  }
  if (name === 'dict' || name === 'Counter' || name === 'OrderedDict') {
    const size = first ? sizeOf(ctx, first) : C.constant();
    return makeInfo({ kind: 'dict', size, memory: size, fresh: true });
  }
  if (name === 'defaultdict') {
    const factory = first ? builtinNameOf(ctx.program, first) : null;
    return makeInfo({
      kind: 'dict',
      size: C.constant(),
      memory: C.constant(),
      adjacency: ['list', 'set', 'deque'].includes(factory),
      elemTotal: C.constant(),
      fresh: true
    });
  }
  if (name === 'deque') {
    const size = first ? sizeOf(ctx, first) : C.constant();
    return makeInfo({ kind: 'deque', size, memory: size, fresh: true });
  }
  if (name === 'range') {
    return makeInfo({ kind: 'range', size: rangeBound(ctx, args) });
  }
  if (STRING_FUNCS.has(name)) {
    return makeInfo({ kind: 'str', size: C.constant(), fresh: true });
  }
  if (['len', 'max', 'min', 'isqrt', 'sqrt', 'pow', 'log', 'log2', 'log10'].includes(name) || NUMERIC_FUNCS.has(name)) {
    return makeInfo({ kind: 'int', value: callMag(ctx, node), exact: null });
  }
  if (name === 'sum') {
    return makeInfo({ kind: 'int', value: null });
  }
  if (['permutations', 'combinations', 'combinations_with_replacement', 'product', 'enumerate', 'zip', 'map', 'filter',
    'accumulate'].includes(name)) {
    return makeInfo({ kind: 'iter', size: sizeOf(ctx, node) });
  }
  return makeInfo();
}

function describeSubscript(ctx, node) {
  if (node.slice._type === 'Slice') {
    const base = describe(ctx, node.value);
    const size = sizeOf(ctx, node);
    return { ...base, size, memory: size, fresh: true, exact: null, exactSize: null };
  }
  const info = isName(node.value) ? lookup(ctx, node.value.id) : null;
  if (info && info.elemSize) {
    return makeInfo({ kind: 'list', size: info.elemSize });
  }
  if (info && info.adjacency) {
    return makeInfo({ kind: 'list', size: info.elemTotal });
  }
  if (info && info.kind === 'str') {
    return makeInfo({ kind: 'str', size: C.constant() });
  }
  return makeInfo();
}

function kindOf(ctx, node) {
  if (!isNode(node)) {
    return null;
  }
  switch (node._type) {
    case 'Name': {
      const info = lookup(ctx, node.id);
      return info ? info.kind : null;
    }
    case 'Constant':
      return typeof node.value === 'string' ? 'str' : null;
    case 'JoinedStr':
      return 'str';
    case 'List':
    case 'Tuple':
    case 'ListComp':
      return 'list';
    case 'Set':
    case 'SetComp':
      return 'set';
    case 'Dict':
    case 'DictComp':
      return 'dict';
    default:
      return describe(ctx, node).kind;
  }
}

// ---- iteration counts ----

function rangeExact(ctx, args) {
  const values = args.map((arg) => constValue(ctx, arg));
  if (values.length === 0 || values.length > 3 || values.some((value) => value === null)) {
    return null;
  }
  const [start, stop, step] = values.length === 1 ? [0, values[0], 1] : [values[0], values[1], values[2] ?? 1];
  if (step === 0) {
    return null;
  }
  const length = step > 0 ? Math.ceil((stop - start) / step) : Math.ceil((start - stop) / -step);
  return Math.max(0, length);
}

function rangeIter(ctx, node) {
  const args = node.args;
  const bound = rangeBound(ctx, args);
  const result = {
    count: bound,
    elem: makeInfo({ kind: 'int', value: bound }),
    elems: null,
    amortizable: false,
    absorbInto: null,
    adjSize: null,
    exact: rangeExact(ctx, args),
    note: ''
  };
  const step = args[2];
  const owner = isName(step) ? enclosingLoopFrame(ctx, step.id) : null;
  if (owner) {
    result.count = harmonicTotal(bound, owner);
    result.amortizable = true;
    result.absorbInto = owner;
    result.note = NOTES.harmonic;
  }
  return result;
}

function iterInfo(ctx, node) {
  const result = { count: null, elem: makeInfo(), elems: null, amortizable: false, adjSize: null, exact: null, note: '', permutation: false };
  if (!isNode(node)) {
    return result;
  }
  switch (node._type) {
    case 'Call':
      return callIterInfo(ctx, node, result);
    case 'Name': {
      const info = lookup(ctx, node.id);
      if (info && info.kind === 'range') {
        return { ...result, count: info.size, elem: makeInfo({ kind: 'int', value: info.size }) };
      }
      result.count = sizeOf(ctx, node);
      if (info && info.elemSize) {
        result.elem = makeInfo({ kind: 'list', size: info.elemSize });
      } else if (info && info.kind === 'str') {
        result.elem = makeInfo({ kind: 'str', size: C.constant() });
      }
      result.exact = info ? info.exactSize : null;
      return result;
    }
    case 'Subscript': {
      if (node.slice._type !== 'Slice' && isName(node.value)) {
        const info = lookup(ctx, node.value.id);
        if (info && info.adjacency) {
          return { ...result, count: info.elemTotal, amortizable: true, adjSize: info.size, note: NOTES.adjacency };
        }
      }
      result.count = sizeOf(ctx, node);
      return result;
    }
    case 'List':
    case 'Tuple':
    case 'Set': {
      result.count = literalSize(ctx, node.elts);
      const constantsOnly = node.elts.every((element) => constNumber(element) !== null ||
        ((element._type === 'Tuple' || element._type === 'List') && element.elts.every((item) => constNumber(item) !== null)));
      if (constantsOnly) {
        result.elem = makeInfo({ kind: 'int', value: C.constant() });
      }
      result.exact = node.elts.some((element) => element._type === 'Starred') ? null : node.elts.length;
      return result;
    }
    case 'Constant':
      result.count = C.constant();
      result.exact = typeof node.value === 'string' ? node.value.length : null;
      result.elem = makeInfo({ kind: 'str', size: C.constant() });
      return result;
    default:
      result.count = sizeOf(ctx, node);
      return result;
  }
}

function callIterInfo(ctx, node, result) {
  const target = resolveCall(ctx, node);
  const args = node.args;
  if (target.kind === 'builtin') {
    const name = target.name;
    if (name === 'range') {
      return rangeIter(ctx, node);
    }
    if (name === 'enumerate' && args.length) {
      const inner = iterInfo(ctx, args[0]);
      return { ...inner, elems: [makeInfo({ kind: 'int', value: inner.count }), inner.elem], elem: makeInfo() };
    }
    if (name === 'zip') {
      const parts = args.map((arg) => iterInfo(ctx, arg));
      return {
        ...result,
        count: parts.map((part) => part.count).reduce(addOrNull, C.constant()),
        elems: parts.map((part) => part.elem)
      };
    }
    if (PASS_THROUGH_ITERS.has(name) && args.length) {
      return { ...iterInfo(ctx, args[0]), exact: null };
    }
    if ((name === 'map' || name === 'filter') && args.length >= 2) {
      return { ...result, count: callSize(ctx, node) };
    }
    if (name === 'permutations') {
      const count = callSize(ctx, node);
      const exponential = args.length < 2 || constNumber(args[1]) === null;
      return {
        ...result,
        count,
        note: exponential ? NOTES.permutations : '',
        permutation: exponential,
        elem: makeInfo({ kind: 'list', size: args.length ? sizeOf(ctx, args[0]) : null })
      };
    }
  }
  if (target.kind === 'method' && ['items', 'keys', 'values'].includes(target.name)) {
    return { ...result, count: sizeOf(ctx, target.obj) };
  }
  result.count = sizeOf(ctx, node);
  return result;
}

function bindTarget(ctx, target, info) {
  if (!isNode(target)) {
    return;
  }
  if (target._type === 'Name') {
    assignName(ctx, target.id, { ...(info.elem || makeInfo()), fresh: false, memory: null });
    return;
  }
  if (target._type === 'Tuple' || target._type === 'List') {
    target.elts.forEach((element, index) => {
      let elementInfo = makeInfo();
      if (info.elems && info.elems[index]) {
        elementInfo = info.elems[index];
      } else if (info.elem && info.elem.kind === 'int') {
        elementInfo = info.elem;
      }
      bindTarget(ctx, element, { elem: elementInfo });
    });
    return;
  }
  if (target._type === 'Starred') {
    bindTarget(ctx, target.value, { elem: makeInfo({ kind: 'list' }) });
  }
}

// ---- costs of expressions ----

function sizeOrAssume(ctx, node, line) {
  if (isReadRooted(ctx.program, node)) {
    return C.constant();
  }
  const size = sizeOf(ctx, node);
  if (size) {
    return size;
  }
  return assume(ctx, line, MESSAGES.unknownSize(exprLabel(node)));
}

function exprLabel(node) {
  if (isName(node)) {
    return `「${node.id}」`;
  }
  if (isNode(node) && node._type === 'Subscript' && rootName(node)) {
    return `「${rootName(node)}[...]」`;
  }
  return 'データ';
}

function sumCosts(ctx, nodes) {
  return nodes.reduce((total, child) => C.add(total, exprCost(ctx, child)), C.constant());
}

function exprCost(ctx, node) {
  if (!isNode(node)) {
    return C.constant();
  }
  if (isReadRooted(ctx.program, node)) {
    recordStrayInput(ctx, node);
    return C.constant();
  }
  switch (node._type) {
    case 'Call':
      return callCost(ctx, node);
    case 'ListComp':
    case 'SetComp':
    case 'GeneratorExp':
    case 'DictComp':
      return comprehensionCost(ctx, node);
    case 'Lambda':
      return C.constant();
    case 'Compare':
      return compareCost(ctx, node);
    case 'Subscript':
      return subscriptCost(ctx, node);
    case 'BinOp':
      return binOpCost(ctx, node);
    case 'NamedExpr': {
      const cost = exprCost(ctx, node.value);
      bindAssign(ctx, node.target, node.value);
      return cost;
    }
    default:
      return sumCosts(ctx, childNodes(node));
  }
}

function compareCost(ctx, node) {
  let cost = sumCosts(ctx, [node.left, ...node.comparators]);
  node.ops.forEach((op, index) => {
    if (op._type === 'In' || op._type === 'NotIn') {
      cost = C.add(cost, membershipCost(ctx, node.comparators[index], lineOf(node)));
    }
  });
  return cost;
}

function membershipCost(ctx, container, line) {
  switch (container._type) {
    case 'Set':
    case 'Dict':
    case 'SetComp':
    case 'DictComp':
    case 'Constant':
      return C.constant();
    case 'List':
    case 'Tuple':
      return literalSize(ctx, container.elts) || C.constant();
    case 'Call': {
      const target = resolveCall(ctx, container);
      if (target.kind === 'builtin' && ['range', 'set', 'frozenset', 'dict', 'Counter'].includes(target.name)) {
        return C.constant();
      }
      if (target.kind === 'method' && target.name === 'keys') {
        return C.constant();
      }
      return sizeOrAssume(ctx, container, line);
    }
    case 'Name': {
      const kind = kindOf(ctx, container);
      if (['set', 'dict', 'range', 'view'].includes(kind)) {
        return C.constant();
      }
      return sizeOrAssume(ctx, container, line);
    }
    default:
      return sizeOrAssume(ctx, container, line);
  }
}

function subscriptCost(ctx, node) {
  let cost = C.add(exprCost(ctx, node.value), exprCost(ctx, node.slice));
  if (node.slice._type === 'Slice') {
    cost = C.add(cost, sizeOrAssume(ctx, node.value, lineOf(node)));
  }
  return cost;
}

function binOpCost(ctx, node) {
  let cost = C.add(exprCost(ctx, node.left), exprCost(ctx, node.right));
  const op = node.op._type;
  const concat = op === 'Add' && isSequenceLike(ctx, node.left) && isSequenceLike(ctx, node.right);
  const repeat = op === 'Mult' && (isSequenceLike(ctx, node.left) || isSequenceLike(ctx, node.right));
  if (concat || repeat) {
    cost = C.add(cost, sizeOf(ctx, node) || C.constant());
  }
  return cost;
}

function comprehensionCost(ctx, node) {
  const counts = [];
  const cost = withTempScope(ctx, () => generatorCost(ctx, node, 0, counts));
  const line = lineOf(node);
  if (Number.isInteger(line) && counts.length > 0) {
    const total = counts.reduce((product, item) => C.multiply(product, item.count), C.constant());
    const exact = counts.length === 1 ? counts[0].exact : null;
    const existing = ctx.comprehensionLines.get(line);
    if (existing) {
      existing.complexity = C.add(existing.complexity, total);
      existing.exact = existing.exact === exact ? exact : null;
    } else {
      ctx.comprehensionLines.set(line, { line, kind: 'loop', complexity: total, note: NOTES.comprehension, exact });
    }
  }
  return cost;
}

function generatorCost(ctx, node, index, counts) {
  if (index >= node.generators.length) {
    if (node._type === 'DictComp') {
      return C.add(exprCost(ctx, node.key), exprCost(ctx, node.value));
    }
    return exprCost(ctx, node.elt);
  }
  const generator = node.generators[index];
  const iterCost = exprCost(ctx, generator.iter);
  const info = iterInfo(ctx, generator.iter);
  const line = lineOf(generator.iter, lineOf(node));
  const count = info.count || assume(ctx, line, MESSAGES.unknownLoop);
  counts.push({ count, exact: info.exact });
  if (info.permutation) {
    warn(ctx, line, MESSAGES.permutations);
  }
  const frame = pushFrame(ctx, {
    node: generator,
    count,
    varNames: targetNames(generator.target),
    amortized: info.amortizable,
    adjSize: info.adjSize
  });
  bindTarget(ctx, generator.target, info);
  let inner = sumCosts(ctx, generator.ifs);
  inner = C.add(inner, generatorCost(ctx, node, index + 1, counts));
  popFrame(ctx);
  const loopCost = C.add(C.multiply(count, inner), frame.amortExtra);
  if (info.amortizable) {
    absorb(ctx, loopCost, info.absorbInto);
    return iterCost;
  }
  return C.add(iterCost, loopCost);
}

function callCost(ctx, node) {
  let cost = C.constant();
  if (node.func._type === 'Attribute') {
    cost = C.add(cost, exprCost(ctx, node.func.value));
  } else if (node.func._type !== 'Name') {
    cost = C.add(cost, exprCost(ctx, node.func));
  }
  for (const arg of node.args) {
    cost = C.add(cost, exprCost(ctx, arg._type === 'Starred' ? arg.value : arg));
  }
  for (const keyword of node.keywords) {
    cost = C.add(cost, exprCost(ctx, keyword.value));
  }
  return C.add(cost, callOwnCost(ctx, node));
}

function callOwnCost(ctx, node) {
  const target = resolveCall(ctx, node);
  let own = C.constant();
  let note = '';
  if (target.kind === 'user') {
    own = callUserFunction(ctx, target.name, node);
    note = `${target.name}()`;
  } else if (target.kind === 'builtin') {
    own = builtinCost(ctx, target.name, node);
    note = target.name;
  } else if (target.kind === 'method') {
    own = methodCost(ctx, target.name, target.obj, node);
    note = `.${target.name}()`;
  }
  if (!C.isConstant(own)) {
    addLine(ctx, lineOf(node), 'call', own, note);
  }
  return own;
}

function sortCost(size) {
  return C.multiply(size, C.logOfComplexity(size));
}

function builtinCost(ctx, name, node) {
  const args = node.args;
  const first = args[0];
  const line = lineOf(node);
  if (name === 'sorted') {
    return first ? sortCost(sizeOrAssume(ctx, first, line)) : C.constant();
  }
  if (AGGREGATES.has(name) || COLLECTION_BUILDERS.has(name)) {
    if (args.length === 1 && !isComprehension(first) && first._type !== 'Starred') {
      return sizeOrAssume(ctx, first, line);
    }
    return C.constant();
  }
  if (name === 'print') {
    return args.filter((arg) => arg._type === 'Starred')
      .reduce((total, arg) => C.add(total, sizeOrAssume(ctx, arg.value, line)), C.constant());
  }
  if (HEAP_LOG_FUNCS.has(name)) {
    if (!first) {
      return C.constant();
    }
    if (name === 'heappush') {
      recordGrowth(ctx, first, C.constant());
    }
    return C.logOfComplexity(sizeOrAssume(ctx, first, line));
  }
  if (name === 'heapify') {
    return first ? sizeOrAssume(ctx, first, line) : C.constant();
  }
  if (name === 'nlargest' || name === 'nsmallest') {
    if (args.length < 2) {
      return C.constant();
    }
    const count = mag(ctx, first);
    return C.multiply(sizeOrAssume(ctx, args[1], line), count ? C.logOfComplexity(count) : C.constant());
  }
  if (BISECT_FUNCS.has(name)) {
    return first ? C.logOfComplexity(sizeOrAssume(ctx, first, line)) : C.constant();
  }
  if (INSORT_FUNCS.has(name)) {
    if (!first) {
      return C.constant();
    }
    recordGrowth(ctx, first, C.constant());
    return sizeOrAssume(ctx, first, line);
  }
  if (name === 'deepcopy' || (name === 'copy' && first)) {
    return sizeOrAssume(ctx, first, line);
  }
  return C.constant();
}

function methodCost(ctx, name, obj, node) {
  const args = node.args;
  const line = lineOf(node);
  const kind = kindOf(ctx, obj);
  switch (name) {
    case 'sort':
      return sortCost(sizeOrAssume(ctx, obj, line));
    case 'append':
    case 'appendleft':
      recordGrowth(ctx, obj, C.constant());
      return C.constant();
    case 'add':
    case 'setdefault':
      recordGrowth(ctx, obj, C.constant());
      return C.constant();
    case 'extend':
    case 'update': {
      const added = args.length ? sizeOrAssume(ctx, args[0], line) : C.constant();
      recordGrowth(ctx, obj, added);
      return added;
    }
    case 'insert':
      recordGrowth(ctx, obj, C.constant());
      return sizeOrAssume(ctx, obj, line);
    case 'pop':
      if (args.length > 0 && kind !== 'dict' && kind !== 'set' && constNumber(args[0]) !== -1) {
        return sizeOrAssume(ctx, obj, line);
      }
      return C.constant();
    case 'index':
    case 'count':
    case 'remove':
      return kind === 'set' || kind === 'dict' ? C.constant() : sizeOrAssume(ctx, obj, line);
    case 'reverse':
    case 'copy':
      return sizeOrAssume(ctx, obj, line);
    case 'most_common':
      return sortCost(sizeOrAssume(ctx, obj, line));
    case 'join':
      return args.length && !isComprehension(args[0]) ? sizeOrAssume(ctx, args[0], line) : C.constant();
    default:
      return STRING_LINEAR_METHODS.has(name) && kind === 'str' ? sizeOrAssume(ctx, obj, line) : C.constant();
  }
}

// ---- statements ----

function blockCost(ctx, stmts) {
  let total = C.constant();
  for (const stmt of stmts || []) {
    total = C.add(total, stmtCost(ctx, stmt));
  }
  return total;
}

function stmtCost(ctx, node) {
  switch (node._type) {
    case 'Expr':
      return exprStmtCost(ctx, node);
    case 'Assign':
      return assignCost(ctx, node, node.targets);
    case 'AnnAssign':
      return node.value ? assignCost(ctx, node, [node.target]) : C.constant();
    case 'AugAssign':
      return augAssignCost(ctx, node);
    case 'For':
    case 'AsyncFor':
      return forCost(ctx, node);
    case 'While':
      return whileCost(ctx, node);
    case 'If':
      return C.add(exprCost(ctx, node.test), C.add(blockCost(ctx, node.body), blockCost(ctx, node.orelse)));
    case 'With':
    case 'AsyncWith':
      return C.add(sumCosts(ctx, node.items.map((item) => item.context_expr)), blockCost(ctx, node.body));
    case 'Try':
    case 'TryStar':
      return [node.body, ...node.handlers.map((handler) => handler.body), node.orelse, node.finalbody]
        .reduce((total, block) => C.add(total, blockCost(ctx, block)), C.constant());
    case 'Match':
      return node.cases.reduce((total, matchCase) => C.add(total, blockCost(ctx, matchCase.body)), exprCost(ctx, node.subject));
    case 'Return':
      return exprCost(ctx, node.value);
    case 'Delete':
      return sumCosts(ctx, node.targets);
    case 'Raise':
      return exprCost(ctx, node.exc);
    case 'Assert':
      return exprCost(ctx, node.test);
    case 'Global':
      node.names.forEach((name) => ctx.scope.globals.add(name));
      return C.constant();
    case 'Nonlocal':
      node.names.forEach((name) => ctx.scope.nonlocals.add(name));
      return C.constant();
    default:
      return C.constant();
  }
}

function exprStmtCost(ctx, node) {
  const program = ctx.program;
  const value = node.value;
  if (value._type === 'Call' && value.func._type === 'Attribute' &&
    ['append', 'appendleft', 'add'].includes(value.func.attr) && value.args.length === 1 &&
    isReadRooted(program, value.args[0])) {
    const element = value.args[0];
    let kind = 'unknown';
    if (isIntRead(program, element)) {
      kind = 'intList';
    } else if (isLineList(program, element)) {
      kind = 'lines';
    }
    const base = rootName(value.func.value);
    recordInput(ctx, node, base ? [base] : [], kind, inputCount(ctx, null));
    ctx.handledInputs.add(element);
  }
  return exprCost(ctx, value);
}

function assignCost(ctx, node, targets) {
  const read = classifyInputRead(ctx, node.value, targets[0]);
  if (read) {
    return applyInputRead(ctx, node, targets, read);
  }
  const cost = exprCost(ctx, node.value);
  for (const target of targets) {
    bindAssign(ctx, target, node.value);
  }
  return cost;
}

function applyInputRead(ctx, node, targets, read) {
  const names = targetNames(targets[0]);
  recordInput(ctx, node, names, read.kind, inputCount(ctx, read.count));
  for (const target of targets) {
    bindInputTarget(ctx, target, read);
  }
  if (read.sorted && names.length === 1) {
    const info = lookup(ctx, names[0]);
    if (info && info.size) {
      return sortCost(info.size);
    }
  }
  return C.constant();
}

function bindInputTarget(ctx, target, read) {
  if (target._type === 'Tuple' || target._type === 'List') {
    for (const element of target.elts) {
      if (isName(element)) {
        assignName(ctx, element.id, read.kind === 'ints'
          ? makeInfo({ kind: 'int', value: C.symbolComplexity(element.id) })
          : makeInfo());
      } else if (element._type === 'Starred' && isName(element.value)) {
        const size = C.symbolComplexity(`|${element.value.id}|`);
        assignName(ctx, element.value.id, makeInfo({ kind: 'list', size, memory: size, fresh: true }));
      }
    }
    return;
  }
  if (!isName(target)) {
    return;
  }
  const name = target.id;
  const symbolSize = C.symbolComplexity(`|${name}|`);
  if (read.kind === 'ints') {
    assignName(ctx, name, makeInfo({ kind: 'int', value: C.symbolComplexity(name) }));
  } else if (read.kind === 'string') {
    assignName(ctx, name, makeInfo({ kind: 'str', size: symbolSize, memory: symbolSize, fresh: true }));
  } else {
    const size = read.count || symbolSize;
    const kind = read.kind === 'unknown' && !read.count ? null : 'list';
    assignName(ctx, name, makeInfo({ kind, size, memory: size, fresh: true }));
  }
}

function bindAssign(ctx, target, valueNode) {
  if (!isNode(target)) {
    return;
  }
  if (target._type === 'Name') {
    assignName(ctx, target.id, describe(ctx, valueNode));
    return;
  }
  if (target._type === 'Tuple' || target._type === 'List') {
    const values = isNode(valueNode) && (valueNode._type === 'Tuple' || valueNode._type === 'List') &&
      valueNode.elts.length === target.elts.length && !valueNode.elts.some((element) => element._type === 'Starred')
      ? valueNode.elts
      : null;
    const infos = target.elts.map((element, index) => (values ? describe(ctx, values[index]) : makeInfo()));
    target.elts.forEach((element, index) => {
      if (isName(element)) {
        assignName(ctx, element.id, infos[index]);
      } else if (element._type === 'Starred' && isName(element.value)) {
        assignName(ctx, element.value.id, makeInfo({ kind: 'list' }));
      } else if (element._type === 'Tuple' || element._type === 'List') {
        bindAssign(ctx, element, values ? values[index] : null);
      } else if (element._type === 'Subscript') {
        bindAssign(ctx, element, null);
      }
    });
    return;
  }
  if (target._type === 'Subscript' && isName(target.value)) {
    const info = lookup(ctx, target.value.id);
    if (info && info.kind === 'dict') {
      recordGrowth(ctx, target.value, C.constant());
    }
    return;
  }
  if (target._type === 'Starred') {
    bindAssign(ctx, target.value, null);
  }
}

function augAssignCost(ctx, node) {
  const cost = exprCost(ctx, node.value);
  const target = node.target;
  const op = node.op._type;
  if (isName(target)) {
    const entry = lookupEntry(ctx, target.id);
    const info = entry ? entry.info : null;
    const stringy = (info && info.kind === 'str') || (!info && isStringLike(ctx, node.value)) ||
      (info && info.kind === null && isStringLike(ctx, node.value));
    if (op === 'Add' && stringy && inLoop(ctx)) {
      warn(ctx, lineOf(node), MESSAGES.stringConcat);
    }
    if (op === 'Add' && info && ['list', 'deque', 'str'].includes(info.kind)) {
      const added = sizeOf(ctx, node.value) || C.constant();
      recordGrowth(ctx, target, added);
      return info.kind === 'str' ? cost : C.add(cost, added);
    }
    if (op === 'Add' && info && info.kind === 'int') {
      const delta = mag(ctx, node.value);
      const multiplier = info.funcLevel === ctx.funcStack.length
        ? frameProduct(ctx.frames.slice(info.frameDepth || 0))
        : totalMultiplier(ctx);
      info.value = info.value && delta ? C.add(info.value, C.multiply(multiplier, delta)) : null;
      info.exact = null;
    }
    return cost;
  }
  if (target._type === 'Subscript' && isName(target.value)) {
    const info = lookup(ctx, target.value.id);
    if (info && info.adjacency && op === 'Add') {
      recordGrowth(ctx, target, sizeOf(ctx, node.value) || C.constant());
    } else if (info && info.kind === 'dict') {
      recordGrowth(ctx, target.value, C.constant());
    }
  }
  return cost;
}

function loopLabel(count, exact) {
  if (C.isConstant(count)) {
    return exact !== null && exact !== undefined ? `× ${exact}` : '× 定数';
  }
  return `× ${C.formatCount(count)}`;
}

function forCost(ctx, node) {
  const iterCost = exprCost(ctx, node.iter);
  const info = iterInfo(ctx, node.iter);
  const line = lineOf(node);
  let count = info.count;
  let note = info.note;
  if (!count) {
    count = assume(ctx, line, MESSAGES.unknownLoop);
    note = NOTES.assumed;
  }
  if (info.permutation) {
    warn(ctx, line, MESSAGES.permutations);
  }
  const frame = pushFrame(ctx, {
    node,
    count,
    varNames: targetNames(node.target),
    amortized: info.amortizable,
    adjSize: info.adjSize
  });
  bindTarget(ctx, node.target, info);
  const bodyCost = blockCost(ctx, node.body);
  popFrame(ctx);
  const loopCost = C.add(C.multiply(count, bodyCost), frame.amortExtra);
  addLine(ctx, line, 'loop', count, note, info.exact);
  const elseCost = blockCost(ctx, node.orelse);
  if (info.amortizable) {
    absorb(ctx, loopCost, info.absorbInto);
    return C.add(iterCost, elseCost);
  }
  return C.add(C.add(iterCost, loopCost), elseCost);
}

function whileCost(ctx, node) {
  const pattern = whilePattern(ctx, node);
  const testCost = exprCost(ctx, node.test);
  const frame = pushFrame(ctx, { node, count: pattern.count, amortized: Boolean(pattern.amortized) });
  const bodyCost = blockCost(ctx, node.body);
  popFrame(ctx);
  const loopCost = C.add(C.multiply(pattern.count, C.add(bodyCost, testCost)), frame.amortExtra);
  addLine(ctx, lineOf(node), 'loop', pattern.count, pattern.note, null);
  const elseCost = blockCost(ctx, node.orelse);
  if (pattern.amortized) {
    absorb(ctx, loopCost, pattern.absorbInto);
    return elseCost;
  }
  return C.add(loopCost, elseCost);
}

// ---- while patterns ----

function compareParts(test) {
  if (!isNode(test)) {
    return [];
  }
  if (test._type === 'BoolOp') {
    return test.values.flatMap(compareParts);
  }
  if (test._type === 'Compare') {
    const operands = [test.left, ...test.comparators];
    return test.ops.map((op, index) => ({ left: operands[index], op: op._type, right: operands[index + 1] }));
  }
  if (test._type === 'Name') {
    return [{ left: test, op: 'NotEq', right: null }];
  }
  return [];
}

function collectTargetUpdates(target, value, name, updates) {
  if (!isNode(target)) {
    return;
  }
  if (target._type === 'Name') {
    if (target.id === name) {
      updates.push({ type: 'assign', value });
    }
    return;
  }
  if (target._type === 'Tuple' || target._type === 'List') {
    const values = isNode(value) && (value._type === 'Tuple' || value._type === 'List') &&
      value.elts.length === target.elts.length ? value.elts : null;
    target.elts.forEach((element, index) => collectTargetUpdates(element, values ? values[index] : null, name, updates));
    return;
  }
  if (target._type === 'Starred') {
    collectTargetUpdates(target.value, null, name, updates);
  }
}

function assignmentsTo(stmts, name, skipNode = null) {
  const updates = [];
  findInBody(stmts, (node) => {
    if (node._type === 'Assign') {
      node.targets.forEach((target) => collectTargetUpdates(target, node.value, name, updates));
    } else if (node._type === 'AnnAssign' && node.value) {
      collectTargetUpdates(node.target, node.value, name, updates);
    } else if (node._type === 'AugAssign' && isName(node.target, name)) {
      updates.push({ type: 'aug', op: node.op._type, value: node.value });
    } else if ((node._type === 'For' || node._type === 'comprehension') && targetNames(node.target).includes(name)) {
      updates.push({ type: 'other' });
    } else if (node._type === 'NamedExpr' && isName(node.target, name)) {
      updates.push({ type: 'assign', value: node.value });
    }
    return false;
  }, skipNode);
  return updates;
}

function linearStep(ctx, update, name) {
  let op = null;
  let value = null;
  if (update.type === 'aug') {
    op = update.op;
    value = update.value;
  } else if (update.type === 'assign' && isNode(update.value) && update.value._type === 'BinOp' &&
    ['Add', 'Sub'].includes(update.value.op._type)) {
    const expression = update.value;
    op = expression.op._type;
    if (isName(expression.left, name)) {
      value = expression.right;
    } else if (op === 'Add' && isName(expression.right, name)) {
      value = expression.left;
    }
  }
  if (!value || (op !== 'Add' && op !== 'Sub')) {
    return null;
  }
  if (constNumber(value) !== null) {
    return 'const';
  }
  if (isName(value) && enclosingLoopFrame(ctx, value.id)) {
    return 'harmonic';
  }
  return 'var';
}

function geometricDirection(update, name) {
  let op = null;
  let value = null;
  if (update.type === 'aug') {
    op = update.op;
    value = update.value;
  } else if (update.type === 'assign' && isNode(update.value) && update.value._type === 'BinOp') {
    const expression = update.value;
    op = expression.op._type;
    if (isName(expression.left, name)) {
      value = expression.right;
    } else if (op === 'Mult' && isName(expression.right, name)) {
      value = expression.left;
    }
  }
  if (!value) {
    return null;
  }
  const number = constNumber(value);
  if (op === 'FloorDiv' || op === 'Div') {
    return (number !== null && number >= 2) || isName(value) ? 'shrink' : null;
  }
  if (op === 'RShift') {
    return (number !== null && number >= 1) || isName(value) ? 'shrink' : null;
  }
  if (op === 'Mult') {
    return number !== null && number >= 2 ? 'grow' : null;
  }
  if (op === 'LShift') {
    return number !== null && number >= 1 ? 'grow' : null;
  }
  return null;
}

function containsHalving(node, names) {
  let halving = false;
  let mentions = names.length === 0;
  walkNode(node, (current) => {
    if (current._type === 'BinOp') {
      const number = constNumber(current.right);
      if (((current.op._type === 'FloorDiv' || current.op._type === 'Div') && number === 2) ||
        (current.op._type === 'RShift' && number === 1)) {
        halving = true;
      }
    }
    if (current._type === 'Name' && names.includes(current.id)) {
      mentions = true;
    }
    return true;
  });
  return halving && mentions;
}

function queueName(test) {
  if (!isNode(test)) {
    return null;
  }
  if (test._type === 'Name') {
    return test.id;
  }
  if (test._type === 'Call' && isName(test.func, 'len') && isName(test.args[0])) {
    return test.args[0].id;
  }
  if (test._type === 'Compare' && test.ops.length === 1 && ['Gt', 'NotEq', 'GtE'].includes(test.ops[0]._type)) {
    return queueName(test.left);
  }
  if (test._type === 'BoolOp') {
    for (const value of test.values) {
      const name = queueName(value);
      if (name) {
        return name;
      }
    }
  }
  return null;
}

function popsFrom(ctx, body, name) {
  return findInBody(body, (node) => {
    if (node._type !== 'Call') {
      return false;
    }
    if (node.func._type === 'Attribute' && isName(node.func.value, name) && ['popleft', 'pop'].includes(node.func.attr)) {
      return true;
    }
    const target = resolveCall(ctx, node);
    return target.kind === 'builtin' && target.name === 'heappop' && isName(node.args[0], name);
  }).length > 0;
}

function graphSizeIn(ctx, body) {
  let total = null;
  for (const loop of findInBody(body, (node) => node._type === 'For' || node._type === 'comprehension')) {
    const iter = loop.iter;
    if (isNode(iter) && iter._type === 'Subscript' && isName(iter.value)) {
      const info = lookup(ctx, iter.value.id);
      if (info && info.adjacency && info.size) {
        total = total ? C.add(total, info.size) : info.size;
      }
    }
  }
  return total;
}

function visitedSizeIn(ctx, body) {
  let total = null;
  const targets = findInBody(body, (node) => node._type === 'Assign' || node._type === 'AugAssign')
    .flatMap((node) => (node._type === 'Assign' ? node.targets : [node.target]))
    .flatMap((target) => (target._type === 'Tuple' || target._type === 'List' ? target.elts : [target]));
  for (const target of targets) {
    if (target._type !== 'Subscript') {
      continue;
    }
    const name = rootName(target);
    const info = name ? lookup(ctx, name) : null;
    const size = info ? firstNonConstant([info.memory, info.size]) : null;
    if (size) {
      total = total ? C.add(total, size) : size;
    }
  }
  return total;
}

function queuePattern(ctx, node) {
  const name = queueName(node.test);
  if (!name || !popsFrom(ctx, node.body, name)) {
    return null;
  }
  const graphSize = graphSizeIn(ctx, node.body);
  if (graphSize && !C.isConstant(graphSize)) {
    return { count: graphSize, note: NOTES.queue };
  }
  const queueInfo = lookup(ctx, name);
  const count = firstNonConstant([visitedSizeIn(ctx, node.body), queueInfo ? queueInfo.size : null]) ||
    assume(ctx, lineOf(node), MESSAGES.unknownQueue);
  return { count, note: NOTES.queueEmpty };
}

function binarySearchNames(test) {
  for (const part of compareParts(test)) {
    const { left, op, right } = part;
    if (isNode(left) && left._type === 'BinOp' && left.op._type === 'Sub' && isName(left.left) && isName(left.right) &&
      ['Gt', 'GtE', 'NotEq'].includes(op)) {
      return [left.right.id, left.left.id];
    }
    if (isNode(left) && left._type === 'Call' && isName(left.func, 'abs') && left.args.length === 1 &&
      left.args[0]._type === 'BinOp' && left.args[0].op._type === 'Sub' && isName(left.args[0].left) &&
      isName(left.args[0].right)) {
      return [left.args[0].right.id, left.args[0].left.id];
    }
    if (isName(left) && isName(right) && ['Lt', 'LtE', 'NotEq'].includes(op)) {
      return [left.id, right.id];
    }
    if (isName(left) && isName(right) && ['Gt', 'GtE'].includes(op)) {
      return [right.id, left.id];
    }
    if (isNode(left) && left._type === 'BinOp' && left.op._type === 'Add' && isName(left.left) &&
      constNumber(left.right) !== null && isName(right) && ['Lt', 'LtE'].includes(op)) {
      return [left.left.id, right.id];
    }
  }
  return null;
}

function binarySearchPattern(ctx, node) {
  const names = binarySearchNames(node.test);
  if (!names) {
    return null;
  }
  const midAssigned = findInBody(node.body, (current) =>
    (current._type === 'Assign' || current._type === 'AugAssign' || current._type === 'NamedExpr') &&
    containsHalving(current.value, names)).length > 0;
  const boundsMove = assignmentsTo(node.body, names[0]).length > 0 || assignmentsTo(node.body, names[1]).length > 0;
  if (!midAssigned || !boundsMove) {
    return null;
  }
  const width = addOrNull(nameValue(ctx, names[0]), nameValue(ctx, names[1]));
  const count = width
    ? C.logOfComplexity(width)
    : C.logOfComplexity(assume(ctx, lineOf(node), MESSAGES.unknownBinarySearch));
  return { count, note: NOTES.binarySearch };
}

function squaredName(node) {
  if (!isNode(node) || node._type !== 'BinOp') {
    return null;
  }
  if (node.op._type === 'Mult' && isName(node.left) && isName(node.right, node.left.id)) {
    return node.left.id;
  }
  if (node.op._type === 'Pow' && isName(node.left) && constNumber(node.right) === 2) {
    return node.left.id;
  }
  return null;
}

function sqrtSides(part) {
  const { left, op, right } = part;
  if (['Lt', 'LtE'].includes(op) && squaredName(left)) {
    return { name: squaredName(left), bound: right };
  }
  if (['Gt', 'GtE'].includes(op) && squaredName(right)) {
    return { name: squaredName(right), bound: left };
  }
  if (['Lt', 'LtE'].includes(op) && isName(left) && isNode(right) && right._type === 'BinOp' &&
    right.op._type === 'FloorDiv' && isName(right.right, left.id)) {
    return { name: left.id, bound: right.left };
  }
  return null;
}

function sqrtPattern(ctx, node) {
  for (const part of compareParts(node.test)) {
    const found = sqrtSides(part);
    if (!found) {
      continue;
    }
    const updates = assignmentsTo(node.body, found.name);
    if (updates.length === 0 || !updates.every((update) => linearStep(ctx, update, found.name) === 'const')) {
      continue;
    }
    const bound = mag(ctx, found.bound) || assume(ctx, lineOf(node), MESSAGES.unknownCounter);
    return { count: C.powerOf(bound, 0.5), note: NOTES.sqrt };
  }
  return null;
}

function geometricPattern(ctx, node) {
  for (const part of compareParts(node.test)) {
    const sides = [[part.left, part.right], [part.right, part.left]];
    for (const [side, other] of sides) {
      if (isNode(side) && side._type === 'BinOp' && ['LShift', 'Pow'].includes(side.op._type) &&
        constNumber(side.left) !== null && isName(side.right)) {
        const updates = assignmentsTo(node.body, side.right.id);
        if (updates.length > 0 && updates.every((update) => linearStep(ctx, update, side.right.id) === 'const')) {
          const bound = (other ? mag(ctx, other) : null) || assume(ctx, lineOf(node), MESSAGES.unknownGeometric);
          return { count: C.logOfComplexity(bound), note: NOTES.geometric };
        }
      }
      if (!isName(side)) {
        continue;
      }
      const updates = assignmentsTo(node.body, side.id);
      if (updates.length === 0) {
        continue;
      }
      const directions = updates.map((update) => geometricDirection(update, side.id));
      if (directions.some((direction) => direction === null)) {
        continue;
      }
      let range = null;
      if (directions.every((direction) => direction === 'shrink')) {
        range = nameValue(ctx, side.id) || firstNonConstant([other ? mag(ctx, other) : null]);
      } else if (directions.every((direction) => direction === 'grow')) {
        range = other ? mag(ctx, other) : null;
      } else {
        continue;
      }
      if (!range) {
        range = assume(ctx, lineOf(node), MESSAGES.unknownGeometric);
      }
      return { count: C.logOfComplexity(range), note: NOTES.geometric };
    }
  }
  return null;
}

function isTwoPointer(ctx, whileNode, name) {
  if (ctx.frames.length === 0) {
    return false;
  }
  const outer = ctx.frames[ctx.frames.length - 1];
  if (outer.varNames.has(name) || !Array.isArray(outer.node.body)) {
    return false;
  }
  return assignmentsTo(outer.node.body, name, whileNode).length === 0;
}

function counterPattern(ctx, node) {
  for (const part of compareParts(node.test)) {
    const sides = [[part.left, part.right], [part.right, part.left]];
    for (const [side, other] of sides) {
      if (!isName(side)) {
        continue;
      }
      const updates = assignmentsTo(node.body, side.id);
      if (updates.length === 0) {
        continue;
      }
      const steps = updates.map((update) => linearStep(ctx, update, side.id));
      if (steps.some((step) => step === null)) {
        continue;
      }
      const start = nameValue(ctx, side.id);
      const bound = other ? mag(ctx, other) : C.constant();
      const range = addOrNull(start, bound) || assume(ctx, lineOf(node), MESSAGES.unknownCounter);
      if (steps.includes('harmonic')) {
        const stepUpdate = updates.find((update, index) => steps[index] === 'harmonic');
        const stepValue = stepUpdate.type === 'aug' ? stepUpdate.value
          : isName(stepUpdate.value.left, side.id) ? stepUpdate.value.right : stepUpdate.value.left;
        const owner = enclosingLoopFrame(ctx, stepValue.id);
        return { count: harmonicTotal(range, owner), note: NOTES.harmonic, amortized: true, absorbInto: owner };
      }
      const amortized = isTwoPointer(ctx, node, side.id);
      return { count: range, note: amortized ? NOTES.twoPointer : '', amortized };
    }
  }
  return null;
}

function whilePattern(ctx, node) {
  const pattern = queuePattern(ctx, node) ||
    binarySearchPattern(ctx, node) ||
    sqrtPattern(ctx, node) ||
    geometricPattern(ctx, node) ||
    counterPattern(ctx, node);
  if (pattern) {
    return pattern;
  }
  markLow(ctx);
  return { count: assume(ctx, lineOf(node), MESSAGES.unknownWhile), note: NOTES.assumed };
}

// ---- user functions and recursion ----

function argInfo(ctx, node) {
  if (isName(node)) {
    const info = lookup(ctx, node.id);
    return info ? { ...info, fresh: false, memory: null } : makeInfo({ value: C.symbolComplexity(node.id) });
  }
  return { ...describe(ctx, node), fresh: false, memory: null };
}

function bindParams(ctx, fn, call) {
  const params = paramNames(fn);
  const args = fn.args;
  const bindings = new Map();
  let index = 0;
  for (const arg of call.args) {
    if (arg._type === 'Starred') {
      break;
    }
    if (index < params.length) {
      bindings.set(params[index], argInfo(ctx, arg));
    }
    index += 1;
  }
  const keywordParams = new Set([...params, ...args.kwonlyargs.map((arg) => arg.arg)]);
  for (const keyword of call.keywords) {
    if (keyword.arg && keywordParams.has(keyword.arg)) {
      bindings.set(keyword.arg, argInfo(ctx, keyword.value));
    }
  }
  const firstDefault = params.length - args.defaults.length;
  params.forEach((param, position) => {
    if (!bindings.has(param)) {
      bindings.set(param, position >= firstDefault ? argInfo(ctx, args.defaults[position - firstDefault]) : makeInfo());
    }
  });
  args.kwonlyargs.forEach((arg, position) => {
    if (!bindings.has(arg.arg)) {
      const fallback = args.kw_defaults[position];
      bindings.set(arg.arg, fallback ? argInfo(ctx, fallback) : makeInfo());
    }
  });
  if (args.vararg) {
    bindings.set(args.vararg.arg, makeInfo({ kind: 'list' }));
  }
  if (args.kwarg) {
    bindings.set(args.kwarg.arg, makeInfo({ kind: 'dict' }));
  }
  return bindings;
}

function bindingKey(bindings) {
  return JSON.stringify([...bindings].map(([name, info]) => [
    name, info.kind, info.value, info.size, info.elemSize, info.elemTotal, info.adjacency
  ]));
}

function scopeDeclarations(fn) {
  const globals = new Set();
  const nonlocals = new Set();
  findInBody(fn.body, (node) => {
    if (node._type === 'Global') {
      node.names.forEach((name) => globals.add(name));
    } else if (node._type === 'Nonlocal') {
      node.names.forEach((name) => nonlocals.add(name));
    }
    return false;
  });
  return { globals, nonlocals };
}

function nearestAdjacencySize(ctx) {
  for (let index = ctx.frames.length - 1; index >= 0; index -= 1) {
    if (ctx.frames[index].adjSize) {
      return ctx.frames[index].adjSize;
    }
  }
  return null;
}

function callUserFunction(ctx, name, node) {
  const fn = ctx.program.functions.get(name);
  const stackIndex = ctx.funcStack.findIndex((record) => record.node === fn);
  if (stackIndex >= 0) {
    const top = ctx.funcStack[ctx.funcStack.length - 1];
    if (stackIndex === ctx.funcStack.length - 1) {
      top.selfCalls.push({ node, inLoop: ctx.frames.length > 0, adjSize: nearestAdjacencySize(ctx) });
    } else {
      markLow(ctx);
      warn(ctx, lineOf(node), MESSAGES.mutualRecursion);
    }
    return C.constant();
  }

  const bindings = bindParams(ctx, fn, node);
  const key = `${name}|${ctx.silent ? 'silent' : 'live'}|${bindingKey(bindings)}`;
  let result = ctx.callCache.get(key);
  if (!result) {
    result = analyzeFunction(ctx, fn, bindings, ctx.scope);
    ctx.callCache.set(key, result);
  }
  if (!C.isConstant(result.amort)) {
    absorb(ctx, result.amort);
  }
  return result.cost;
}

function analyzeFunction(ctx, fn, bindings, parentScope) {
  ctx.analyzedNodes.add(fn);
  const { globals, nonlocals } = scopeDeclarations(fn);
  const scope = createScope(parentScope, globals, nonlocals);
  const saved = { scope: ctx.scope, frames: ctx.frames, callerMultiplier: ctx.callerMultiplier };
  ctx.callerMultiplier = totalMultiplier(ctx);
  ctx.scope = scope;
  ctx.frames = [];
  const record = { node: fn, selfCalls: [], amortExtra: C.constant() };
  ctx.funcStack.push(record);
  for (const [name, info] of bindings) {
    scope.vars.set(name, { ...info, frameDepth: 0, funcLevel: ctx.funcStack.length });
  }

  let cost;
  try {
    cost = blockCost(ctx, fn.body);
  } finally {
    ctx.funcStack.pop();
    ctx.frames = saved.frames;
    ctx.callerMultiplier = saved.callerMultiplier;
    ctx.scope = saved.scope;
  }

  let amort = record.amortExtra;
  if (record.selfCalls.length > 0) {
    cost = combineRecursion(ctx, fn, bindings, scope, record, cost);
    amort = C.constant();
  }
  addLine(ctx, lineOf(fn), 'function', C.add(cost, amort));
  return { cost, amort };
}

function hasMemoDecorator(ctx, fn) {
  return fn.decorator_list.some((decorator) => {
    const target = decorator._type === 'Call' ? decorator.func : decorator;
    if (isName(target)) {
      return MEMO_DECORATORS.has(builtinNameOf(ctx.program, target));
    }
    return isNode(target) && target._type === 'Attribute' && MEMO_DECORATORS.has(target.attr);
  });
}

function argumentFor(callNode, param, index) {
  const keyword = callNode.keywords.find((item) => item.arg === param);
  if (keyword) {
    return keyword.value;
  }
  const positional = callNode.args[index];
  return positional && positional._type !== 'Starred' ? positional : null;
}

function paramRange(ctx, fn, bindings, param) {
  const info = bindings.get(param);
  const fromBinding = info ? firstNonConstant([info.value, info.size]) : null;
  if (fromBinding) {
    return fromBinding;
  }
  let bound = null;
  for (const compare of findInBody(fn.body, (node) => node._type === 'Compare')) {
    for (const part of compareParts(compare)) {
      const other = isName(part.left, param) ? part.right : isName(part.right, param) ? part.left : null;
      const value = other ? mag(ctx, other) : null;
      if (value && !C.isConstant(value)) {
        bound = bound ? C.add(bound, value) : value;
      }
    }
  }
  return bound;
}

function midNamesOf(fn) {
  const names = new Set();
  findInBody(fn.body, (node) => {
    if (node._type === 'Assign' && containsHalving(node.value, [])) {
      node.targets.forEach((target) => targetNames(target).forEach((name) => names.add(name)));
    }
    return false;
  });
  return names;
}

function callHalves(callNode, midNames) {
  const args = [...callNode.args, ...callNode.keywords.map((keyword) => keyword.value)];
  return args.length > 0 && args.some((arg) => {
    let halving = containsHalving(arg, []);
    walkNode(arg, (current) => {
      if (isName(current) && midNames.has(current.id)) {
        halving = true;
      }
      return !halving;
    });
    return halving;
  });
}

function callStepsByConstant(callNode, params) {
  return [...callNode.args, ...callNode.keywords.map((keyword) => keyword.value)].some((arg) =>
    isNode(arg) && arg._type === 'BinOp' && ['Add', 'Sub'].includes(arg.op._type) &&
    ((isName(arg.left) && params.includes(arg.left.id) && constNumber(arg.right) !== null) ||
      (isName(arg.right) && params.includes(arg.right.id) && constNumber(arg.left) !== null)));
}

function hasGrowingFactor(c) {
  return c.terms.some((term) => term.exp.length > 0 || Object.values(term.factors).some((factor) => factor.pow > 0));
}

function combineRecursion(ctx, fn, bindings, scope, record, perCall) {
  markLow(ctx);
  const params = paramNames(fn);
  const sites = record.selfCalls;
  const line = lineOf(sites[0].node, lineOf(fn));
  const varying = params.filter((param, index) => sites.some((site) => {
    const arg = argumentFor(site.node, param, index);
    return arg && !isName(arg, param);
  }));

  const savedScope = ctx.scope;
  ctx.scope = scope;
  let calls;
  let depth;
  let note;
  let cost = null;
  try {
    if (hasMemoDecorator(ctx, fn)) {
      calls = C.constant();
      depth = C.constant();
      for (const param of varying) {
        const range = paramRange(ctx, fn, bindings, param) || assume(ctx, line, MESSAGES.unknownStates);
        calls = C.multiply(calls, range);
        depth = C.add(depth, range);
      }
      note = NOTES.memo;
      if (!ctx.silent) {
        ctx.space = C.add(ctx.space, calls);
      }
    } else if (sites.some((site) => site.adjSize)) {
      calls = sites.find((site) => site.adjSize).adjSize;
      depth = calls;
      note = NOTES.dfs;
    } else {
      let width = null;
      for (const param of varying) {
        const range = paramRange(ctx, fn, bindings, param);
        if (range) {
          width = width ? C.add(width, range) : range;
        }
      }
      const branching = sites.length > 1 || sites.some((site) => site.inLoop);
      const midNames = midNamesOf(fn);
      const halving = sites.every((site) => callHalves(site.node, midNames));
      const linear = sites.some((site) => callStepsByConstant(site.node, params));
      const range = () => width || assume(ctx, line, MESSAGES.unknownRecursion);
      if (halving && !branching) {
        calls = C.logOfComplexity(range());
        depth = calls;
        note = NOTES.halving;
        cost = C.isConstant(perCall) ? calls : hasGrowingFactor(perCall) ? perCall : C.multiply(perCall, calls);
      } else if (halving) {
        calls = range();
        depth = C.logOfComplexity(calls);
        note = NOTES.halving;
        cost = C.isConstant(perCall) ? calls : C.multiply(perCall, depth);
      } else if (branching) {
        const size = range();
        calls = C.exponentialOf(size);
        depth = size;
        note = NOTES.exponential;
        warn(ctx, line, MESSAGES.exponential);
      } else if (linear) {
        calls = range();
        depth = calls;
        note = NOTES.linear;
      } else {
        calls = assume(ctx, line, MESSAGES.unknownRecursion);
        depth = calls;
        note = NOTES.unknownRecursion;
      }
    }
  } finally {
    ctx.scope = savedScope;
  }

  if (!ctx.silent) {
    ctx.space = C.add(ctx.space, depth);
  }
  addLine(ctx, line, 'recursion', calls, note);
  return cost || C.add(C.multiply(calls, perCall), record.amortExtra);
}

// ---- module ----

function runModule(ctx) {
  const body = blockCost(ctx, ctx.program.tree.body);
  ctx.time = C.add(body, ctx.moduleAmort);
  ctx.silent += 1;
  for (const fn of ctx.program.functionNodes) {
    if (ctx.analyzedNodes.has(fn)) {
      continue;
    }
    const bindings = new Map(allParamNames(fn).map((param) => [
      param,
      makeInfo({ value: C.symbolComplexity(param), size: C.symbolComplexity(`|${param}|`) })
    ]));
    analyzeFunction(ctx, fn, bindings, ctx.moduleScope);
  }
  ctx.silent -= 1;
}

function growthKey(growth) {
  return JSON.stringify([...growth.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function lineLabel(entry) {
  if (entry.kind === 'loop' || entry.kind === 'recursion') {
    return loopLabel(entry.complexity, entry.exact);
  }
  return C.formatComplexity(entry.complexity);
}

function buildResult(ctx) {
  let space = ctx.space;
  for (const value of ctx.growth.values()) {
    space = C.add(space, value);
  }
  const comprehensionEntries = [...ctx.comprehensionLines.values()]
    .filter((entry) => !ctx.lines.has(`${entry.line}:loop`));
  const lines = [...ctx.lines.values(), ...comprehensionEntries]
    .sort((a, b) => a.line - b.line || LINE_KIND_ORDER[a.kind] - LINE_KIND_ORDER[b.kind])
    .map((entry) => ({
      line: entry.line,
      kind: entry.kind,
      label: lineLabel(entry),
      complexity: entry.complexity,
      note: entry.note
    }));
  const warnings = [...ctx.warnings.values()].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  const symbols = [...new Set([...C.symbolsOf(ctx.time), ...C.symbolsOf(space)])].sort(C.compareSymbols);
  let confidence = 'high';
  if (ctx.flags.low) {
    confidence = 'low';
  } else if (ctx.flags.assumed) {
    confidence = 'medium';
  }
  return {
    ok: true,
    time: ctx.time,
    space,
    confidence,
    lines,
    warnings,
    inputs: ctx.inputs,
    symbols
  };
}

function analyzeModule(tree) {
  const program = prepareProgram(tree);
  let prevGrowth = new Map();
  let ctx = null;
  let stable = false;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    ctx = createContext(program, prevGrowth);
    runModule(ctx);
    if (growthKey(ctx.growth) === growthKey(prevGrowth)) {
      stable = true;
      break;
    }
    prevGrowth = ctx.growth;
  }
  if (!stable) {
    ctx.flags.low = true;
    warn(ctx, unstableLine(ctx), MESSAGES.unstable);
  }
  return buildResult(ctx);
}

// The first loop whose header mentions a container that was still growing between passes.
function unstableLine(ctx) {
  const changed = new Set();
  for (const key of new Set([...ctx.growth.keys(), ...ctx.prevGrowth.keys()])) {
    if (JSON.stringify(ctx.growth.get(key)) !== JSON.stringify(ctx.prevGrowth.get(key))) {
      changed.add(key.slice(key.indexOf(':') + 1));
    }
  }
  let line = null;
  walkNode(ctx.program.tree, (node) => {
    if (line !== null) {
      return false;
    }
    const header = node._type === 'For' || node._type === 'comprehension' ? node.iter : node._type === 'While' ? node.test : null;
    walkNode(header, (inner) => {
      if (line === null && isName(inner) && changed.has(inner.id)) {
        line = lineOf(node, lineOf(header));
      }
      return line === null;
    });
    return line === null;
  });
  if (line !== null) {
    return line;
  }
  const loopLines = [...ctx.lines.values()].filter((entry) => entry.kind === 'loop').map((entry) => entry.line);
  return loopLines.length > 0 ? Math.min(...loopLines) : 1;
}

function analyzeAst(astResult) {
  try {
    if (!astResult || typeof astResult !== 'object') {
      return fail(null, MESSAGES.invalidResult);
    }
    if (astResult.ok === false) {
      const line = Number.isInteger(astResult.line) ? astResult.line : null;
      return fail(line, MESSAGES.syntax(line, String(astResult.message || 'invalid syntax')));
    }
    const tree = astResult.tree;
    if (!isNode(tree) || tree._type !== 'Module' || !Array.isArray(tree.body)) {
      return fail(null, MESSAGES.invalidResult);
    }
    return analyzeModule(tree);
  } catch (error) {
    return fail(null, MESSAGES.internal(error && error.message ? error.message : String(error)));
  }
}

module.exports = {
  analyzeAst
};
