// RF-081 (V26) 施工提取脚本
// 从 src/outfit-workflow.jsx 抽出 84 个顶层函数 + 70 个常量 -> src/features/outfit/outfit-top.js
// 抽出 3 个 JSX 面板 -> src/features/outfit/outfit-panels.jsx
// 全程 latin1 字节级操作，保留 CRLF 与 UTF-8 字节。DRY_RUN 模式只报告不写入。
//
// 用法: node scripts/dev/rf081-extract.mjs            (dry-run)
//       DRY_RUN=0 node scripts/dev/rf081-extract.mjs  (真实写入)

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import fs from 'fs';

const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;

const DRY_RUN = process.env.DRY_RUN !== '0';
const SRC = 'src/outfit-workflow.jsx';
const OUT_TOP = 'src/features/outfit/outfit-top.js';
const PANELS = 'src/features/outfit/outfit-panels.jsx';
const JSON_PATH = 'scripts/dev/rf081-result.json';

const BUILTINS = new Set([
  'String','Number','Boolean','Array','Object','Math','Date','JSON','Promise','Map','Set',
  'WeakMap','WeakSet','Symbol','RegExp','Error','TypeError','RangeError','ReferenceError',
  'SyntaxError','window','document','globalThis','File','Blob','URL','URLSearchParams',
  'FileReader','Image','FileList','DataView','ArrayBuffer','Uint8Array','Uint16Array',
  'Uint32Array','Int8Array','Int16Array','Int32Array','Float32Array','Float64Array',
  'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
  'cancelAnimationFrame','queueMicrotask','console','fetch','navigator','localStorage',
  'sessionStorage','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent',
  'decodeURIComponent','escape','unescape','structuredClone','TextEncoder','TextDecoder',
  'Event','CustomEvent','MouseEvent','KeyboardEvent','HTMLElement','Element','Node',
  'performance','btoa','atob','Proxy','Reflect','Function','Generator','AsyncFunction',
  'BigInt','Infinity','NaN','undefined','null','true','false','this','super','await',
  // React / 全局 JSX 相关
  'React','JSX','Fragment','createElement','useState','useEffect','useRef','useMemo',
  'useCallback','useContext','useReducer','useLayoutEffect','forwardRef','memo'
]);

const CRLF = '\r\n';

// ---------- 读取（latin1 保字节） ----------
const rawBuf = fs.readFileSync(SRC);
const src = rawBuf.toString('latin1');

let ast;
try {
  ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
} catch (e) {
  console.error('PARSE ERROR:', e.message);
  process.exit(1);
}

// importMap: localName -> { source, imported, specifierType, node }
const importMap = new Map();
const importNodes = [];
ast.program.body.forEach((node) => {
  if (t.isImportDeclaration(node)) {
    importNodes.push(node);
    node.specifiers.forEach((s) => {
      const local = s.local.name;
      const imported = s.imported ? s.imported.name : local;
      let specifierType = 'named';
      if (t.isImportDefaultSpecifier(s)) specifierType = 'default';
      else if (t.isImportNamespaceSpecifier(s)) specifierType = 'namespace';
      importMap.set(local, { source: node.source.value, imported, specifierType, node });
    });
  }
});

// ---------- 加载设计单结果 ----------
const json = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const trueTopNames = json.trueTop.map((x) => x.name);
const needMigrate = json.needMigrate;
const MOVE = new Set([...trueTopNames, ...needMigrate]);
// 设计单 needMigrate 漏搬的 3 个顶层常量：被 loadOutfitPromptPresets/Categories 引用，
// 且 PROMPT_PRESETS_KEY / PROMPT_CATEGORIES_KEY 依赖 PROMPT_LIBRARY_VERSION（均 <2820 真顶层，非伪顶层）
['PROMPT_BUILTIN_PRESETS', 'PROMPT_LIBRARY_VERSION', 'PROMPT_PRESET_GROUPS'].forEach((n) => MOVE.add(n));
const PANEL_NAMES = new Set([
  'LocalPasteDiagnosticsPanel',
  'CropReturnDiagnosticsPanel',
  'LegacyModulePanel'
]);
const topMove = new Set([...MOVE].filter((n) => !PANEL_NAMES.has(n)));

// ---------- 收集顶层声明 ----------
function collectNames(id, names) {
  if (!id) return;
  if (t.isIdentifier(id)) names.add(id.name);
  else if (t.isObjectPattern(id)) id.properties.forEach((p) => {
    if (t.isObjectProperty(p)) collectNames(p.value, names);
    else if (t.isRestElement(p)) collectNames(p.argument, names);
  });
  else if (t.isArrayPattern(id)) id.elements.forEach((e) => collectNames(e, names));
  else if (t.isAssignmentPattern(id)) collectNames(id.left, names);
  else if (t.isRestElement(id)) collectNames(id.argument, names);
}

const topDecls = [];
ast.program.body.forEach((node) => {
  let inner = node;
  if (t.isExportNamedDeclaration(node) && node.declaration) inner = node.declaration;
  if (t.isFunctionDeclaration(inner) && inner.id) {
    topDecls.push({
      names: new Set([inner.id.name]),
      kind: 'function',
      node,
      start: node.start,
      end: node.end,
      text: src.slice(node.start, node.end)
    });
  } else if (t.isVariableDeclaration(inner)) {
    const names = new Set();
    inner.declarations.forEach((d) => collectNames(d.id, names));
    if (names.size === 0) return;
    topDecls.push({
      names,
      kind: 'var:' + inner.kind,
      node,
      start: node.start,
      end: node.end,
      text: src.slice(node.start, node.end)
    });
  }
});

// ---------- 分类 ----------
const moveTopDecls = [];
const movePanelDecls = [];
const mixedDecls = [];
const stayNames = new Set();
topDecls.forEach((d) => {
  const isPanel = [...d.names].some((n) => PANEL_NAMES.has(n));
  const allInTopMove = [...d.names].every((n) => topMove.has(n));
  if (isPanel) movePanelDecls.push(d);
  else if (allInTopMove) moveTopDecls.push(d);
  else {
    const anyIn = [...d.names].some((n) => MOVE.has(n));
    if (anyIn) mixedDecls.push(d);
    else d.names.forEach((n) => stayNames.add(n));
  }
});

const foundNames = new Set();
moveTopDecls.forEach((d) => d.names.forEach((n) => foundNames.add(n)));
const missing = [...topMove].filter((n) => !foundNames.has(n));

// ---------- 引用收集（仅 moved 范围，用 scope 判定是否真自由引用） ----------
function within(ranges, pos) {
  return ranges.some(([s, e]) => pos >= s && pos < e);
}
function collectRefsInRanges(ranges, internalNamesSet, isPanel) {
  const refs = new Set();       // 依赖 importMap 中的导入名
  const unresolved = new Set(); // 真正无绑定的引用 / 引用了未搬走的顶层名（反向依赖风险）
  const topImports = new Set(); // (仅 panels) 引用了搬到 outfit-top 的顶层名

  function consider(path, name) {
    if (BUILTINS.has(name)) return;
    const binding = path.scope.getBinding(name);
    if (binding) {
      const kind = binding.kind;
      if (kind === 'module') { refs.add(name); return; }       // 原 import
      if (internalNamesSet.has(name)) return;                   // 同文件内部定义
      if (isPanel && foundNames.has(name)) { topImports.add(name); return; } // 引 outfit-top
      const bpStart = binding.path.node.start;
      if (within(ranges, bpStart)) return;                      // 函数内局部/参数
      unresolved.add(name);                                     // 引用了未搬走的顶层名 -> 反向依赖
      return;
    }
    if (importMap.has(name)) { refs.add(name); return; }
    unresolved.add(name);
  }

  traverse(ast, {
    Identifier(path) {
      if (!path.isReferencedIdentifier()) return;
      const pos = path.node.start;
      if (!within(ranges, pos)) return;
      consider(path, path.node.name);
    },
    JSXIdentifier(path) {
      const p = path.parent;
      const isTag =
        (p.type === 'JSXOpeningElement' && p.name === path.node) ||
        (p.type === 'JSXMemberExpression' && p.object === path.node);
      if (!isTag) return;
      const name = path.node.name;
      if (/^[a-z]/.test(name) && !name.includes('.')) return; // 内在 HTML 元素，无需 import
      const pos = path.node.start;
      if (!within(ranges, pos)) return;
      consider(path, name);
    }
  });
  return { refs, unresolved, topImports };
}

const topRanges = moveTopDecls.map((d) => [d.start, d.end]);
const { refs: topNeededImports, unresolved: topUnresolved } =
  collectRefsInRanges(topRanges, foundNames, false);

// ---------- panels 依赖 ----------
const panelRanges = movePanelDecls.map((d) => [d.start, d.end]);
const foundPanelNames = new Set();
movePanelDecls.forEach((d) => d.names.forEach((n) => foundPanelNames.add(n)));
const { refs: panelRefsRaw, unresolved: panelUnresolved, topImports: panelImportFromTop } =
  collectRefsInRanges(panelRanges, foundPanelNames, true);

// panels 需要的 import：引用的 importMap 名 + 引用的已搬到 outfit-top 的顶层名
const panelImportFromShared = new Set([...panelRefsRaw].filter((n) => importMap.has(n)));

// ---------- 生成 outfit-top.js ----------
function exportify(text, kind) {
  if (kind === 'function') return text.replace(/^function\b/, 'export function');
  if (kind.startsWith('var:')) return text.replace(/^(const|let|var)\b/, 'export $1');
  return text;
}

const HEADER = [
  '// src/features/outfit/outfit-top.js',
  '// RF-081 (V26): 从 src/outfit-workflow.jsx 抽出的模块顶层纯函数 + 常量。',
  '// 形态：普通模块导出（非 B3 工厂）；只被 outfit-workflow.jsx 单向 import，自身绝不反向 import outfit。',
  '//',
  '// 🔴 本文件 defaultLocalEditCrop 与 main.jsx 的 defaultQuickLocalEditCrop 是「真分叉」：',
  '//    outfit 侧语义 = fitRectToRatioLocked(null,…) 一行包装；main 侧保留「普通裁剪自由矩形」语义。',
  '//    两侧常量不同源、语义不同，严禁合并、严禁互相 import。见冷启动「局部回帖分叉裁定」。',
  ''
].join(CRLF);

function buildImportBlock(neededNamesSet) {
  // 按 source 分组；含 default/namespace 的 source 直接复制原 import 文本
  const bySource = new Map();
  [...neededNamesSet].forEach((n) => {
    const info = importMap.get(n);
    if (!info) return;
    if (!bySource.has(info.source)) bySource.set(info.source, new Set());
    bySource.get(info.source).add(n);
  });
  const lines = [];
  [...bySource.keys()].sort().forEach((source) => {
    const names = [...bySource.get(source)].sort();
    // 检测是否包含 default/namespace
    const hasSpecial = names.some((n) => {
      const info = importMap.get(n);
      return info && info.specifierType !== 'named';
    });
    if (hasSpecial) {
      // 复制原 import 行（含全部 specifier），保真
      const node = importMap.get(names[0]).node;
      lines.push(src.slice(node.start, node.end));
    } else {
      lines.push(`import { ${names.join(', ')} } from "${source}";`);
    }
  });
  return lines.join(CRLF) + CRLF;
}

const topImportBlock = buildImportBlock(topNeededImports);
const sortedTop = [...moveTopDecls].sort((a, b) => a.start - b.start);
const topBody = sortedTop.map((d) => exportify(d.text, d.kind)).join(CRLF);
const outfitTopContent = HEADER + topImportBlock + topBody + CRLF;

// ---------- 生成 outfit-panels.jsx 修改 ----------
const panelImportBlock =
  `import { ${[...panelImportFromTop].sort().join(', ')} } from "./outfit-top.js";` +
  (panelImportFromShared.size
    ? CRLF +
      [...panelImportFromShared].sort().map((n) => {
        const info = importMap.get(n);
        return `import { ${n} } from "${info.source}";`;
      }).join(CRLF)
    : '');
const sortedPanels = [...movePanelDecls].sort((a, b) => a.start - b.start);
const panelBody = sortedPanels.map((d) => exportify(d.text, d.kind)).join(CRLF);

// ---------- 构造改后的 outfit-workflow.jsx ----------
// 1) 删除 moved decl 范围（含尾部换行）
function removeRanges(text, ranges) {
  let s = text;
  const sorted = [...ranges].sort((a, b) => b[0] - a[0]); // 降序
  for (const [start, end] of sorted) {
    let e = end;
    while (e < s.length && (s[e] === '\n' || s[e] === '\r')) e++;
    s = s.slice(0, start) + s.slice(e);
  }
  return s;
}

const allRanges = [...topRanges, ...panelRanges];
let remaining = removeRanges(src, allRanges);

// 2) 解析 remaining，求引用名 + 最后一条 import 位置
const remainingAst = parse(remaining, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
const refNamesInRemaining = new Set();
let lastImportEnd = -1;
let firstImportStart = -1;
remainingAst.program.body.forEach((node) => {
  if (t.isImportDeclaration(node)) {
    if (firstImportStart === -1) firstImportStart = node.start;
    lastImportEnd = node.end;
  }
});
traverse(remainingAst, {
  Identifier(path) {
    if (path.isReferencedIdentifier()) refNamesInRemaining.add(path.node.name);
  },
  JSXIdentifier(path) {
    const p = path.parent;
    if ((p.type === 'JSXOpeningElement' && p.name === path.node) ||
        (p.type === 'JSXMemberExpression' && p.object === path.node)) {
      const name = path.node.name;
      if (/^[a-z]/.test(name) && !name.includes('.')) return; // 内在 HTML 元素
      refNamesInRemaining.add(name);
    }
  }
});

// 3) back-import：remaining 中引用的 moved 名
const backFromTop = new Set([...topMove].filter((n) => refNamesInRemaining.has(n)));
const backFromPanels = new Set([...PANEL_NAMES].filter((n) => refNamesInRemaining.has(n)));

// 4) 孤儿 import 清理：原 import specifier 若不再被 remaining 引用 -> 删除
//    注意 moved 名（现由 back-import 提供）即使仍在 remaining 被引用，也原 import 中不存在（它们是局部定义），无冲突。
const rebuiltImports = [];
importNodes.forEach((node) => {
  // 副作用 import（无 specifier，如 css）必须保留
  if (!node.specifiers || node.specifiers.length === 0) {
    rebuiltImports.push(src.slice(node.start, node.end));
    return;
  }
  const kept = node.specifiers.filter((s) => refNamesInRemaining.has(s.local.name));
  if (kept.length === 0) return; // 整条 import 变孤儿
  // 重建文本
  const source = node.source.value;
  const named = kept.filter((s) => t.isImportSpecifier(s));
  const def = kept.filter((s) => t.isImportDefaultSpecifier(s));
  const ns = kept.filter((s) => t.isImportNamespaceSpecifier(s));
  let txt = 'import ';
  const parts = [];
  if (def.length) parts.push(def[0].local.name);
  if (ns.length) parts.push('* as ' + ns[0].local.name);
  if (named.length) {
    const list = named
      .map((s) => (s.imported && s.imported.name !== s.local.name ? `${s.imported.name} as ${s.local.name}` : s.local.name))
      .sort()
      .join(', ');
    parts.push(`{ ${list} }`);
  }
  txt += parts.join(', ') + ` from "${source}";`;
  rebuiltImports.push(txt);
});

const backImportLines = [];
if (backFromTop.size)
  backImportLines.push(`import { ${[...backFromTop].sort().join(', ')} } from "./features/outfit/outfit-top.js";`);
if (backFromPanels.size)
  backImportLines.push(`import { ${[...backFromPanels].sort().join(', ')} } from "./features/outfit/outfit-panels.jsx";`);

const newImportBlock = [...rebuiltImports, ...backImportLines].join(CRLF) + CRLF;

let modifiedOutfit;
if (firstImportStart !== -1 && lastImportEnd !== -1) {
  modifiedOutfit = remaining.slice(0, firstImportStart) + newImportBlock + remaining.slice(lastImportEnd);
} else {
  modifiedOutfit = remaining;
}

// ---------- 报告 ----------
console.log('===== RF-081 提取分析报告 =====');
console.log('DRY_RUN =', DRY_RUN);
console.log('源文件行数(约):', (src.match(/\n/g) || []).length + 1);
console.log('顶层声明总数:', topDecls.length);
console.log('-> 搬入 outfit-top.js 的函数/常量声明数:', moveTopDecls.length);
console.log('-> 搬入 panels.jsx 的面板声明数:', movePanelDecls.length);
console.log('-> 混合声明(需分裂/停手):', mixedDecls.length);
mixedDecls.forEach((d) => console.log('   混合:', [...d.names].join(','), d.kind, `L${src.slice(0, d.start).split('\n').length}`));
console.log('-> 缺失名(在 MOVE 但找不到声明):', missing.length);
missing.forEach((n) => console.log('   缺失:', n));
console.log('-> outfit-top 未解析引用(缺失依赖, 应停手):', topUnresolved.size);
[...topUnresolved].sort().forEach((n) => console.log('   unresolved:', n));
console.log('-> panels 未解析引用(缺失依赖, 应停手):', panelUnresolved.size);
[...panelUnresolved].sort().forEach((n) => console.log('   unresolved:', n));
console.log('outfit-top 需 import 名数:', topNeededImports.size, '->', [...topNeededImports].sort().join(', '));
console.log('panels 需从 outfit-top import:', [...panelImportFromTop].sort().join(', '));
console.log('panels 需从 shared import:', [...panelImportFromShared].sort().join(', '));
console.log('back-import (outfit <- top):', [...backFromTop].sort().join(', '));
console.log('back-import (outfit <- panels):', [...backFromPanels].sort().join(', '));
console.log('孤儿 import 待删 specifier 数(原 import 被整体移除条数):',
  importNodes.filter((n) => !n.specifiers.some((s) => refNamesInRemaining.has(s.local.name))).length);

const estTopLines = (outfitTopContent.match(/\n/g) || []).length;
console.log('outfit-top.js 预计行数:', estTopLines, '(CRCR 检查:' + (outfitTopContent.match(/\r\r\n/g) || []).length + ')');
const estModLines = (modifiedOutfit.match(/\n/g) || []).length;
console.log('改后 outfit-workflow.jsx 预计行数:', estModLines);

// ---------- 写入 ----------
if (!DRY_RUN) {
  console.log('\n===== 写入模式 =====');
  // 写 outfit-top.js（新文件，latin1 保字节）
  fs.writeFileSync(OUT_TOP, Buffer.from(outfitTopContent, 'latin1'));
  console.log('已写', OUT_TOP, estTopLines, '行');

  // 改 panels
  const pBuf = fs.readFileSync(PANELS);
  const psrc = pBuf.toString('latin1');
  const pAst = parse(psrc, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
  let pLastImportEnd = -1;
  pAst.program.body.forEach((node) => { if (t.isImportDeclaration(node)) pLastImportEnd = node.end; });
  let newPanels = psrc;
  if (panelImportBlock) {
    if (pLastImportEnd !== -1) {
      newPanels = psrc.slice(0, pLastImportEnd) + CRLF + panelImportBlock + CRLF + psrc.slice(pLastImportEnd);
    } else {
      newPanels = panelImportBlock + CRLF + psrc;
    }
  }
  // 末尾追加面板
  const sep = newPanels.endsWith(CRLF) ? CRLF : CRLF + CRLF;
  newPanels = newPanels + sep + panelBody + CRLF;
  // 防 CRCR
  if (newPanels.includes('\r\r\n')) { console.error('!! panels 出现 CRCR，已中止写入'); process.exit(1); }
  fs.writeFileSync(PANELS, Buffer.from(newPanels, 'latin1'));
  console.log('已改', PANELS);

  // 写回 outfit
  if (modifiedOutfit.includes('\r\r\n')) { console.error('!! outfit 出现 CRCR，已中止写入'); process.exit(1); }
  fs.writeFileSync(SRC, Buffer.from(modifiedOutfit, 'latin1'));
  console.log('已改', SRC);

  // 句末校验
  console.log('outfit-top 实际行数:', (outfitTopContent.match(/\n/g) || []).length);
} else {
  console.log('\n[DRY-RUN] 未写入任何文件。');
}
