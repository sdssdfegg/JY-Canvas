// 打破环：outfit-panels.jsx -> outfit-top.js -> outfit-panels.jsx
//
// 成因：RF-080 把共享常量（CHANNEL_UPLOAD_* / makeId / DEFAULT_PREPROCESS_MODE / ratioParts …）
// 放进了 outfit-panels.jsx，故被搬走的函数（outfit-top.js）必须 import panels.jsx；
// 而搬进 panels.jsx 的 3 个面板又需要 2 个 summary 函数 -> 反向 import，成环。
//
// 解法：把 2 个 summary 函数一并移进 outfit-panels.jsx（它们只被这 3 个面板使用，
// 且 panels.jsx 已具备其所需 import：fileSize / normalizeCropReturnMeta），
// 使依赖变成单向：outfit-top.js -> outfit-panels.jsx。仍只新建 1 个文件。

import fs from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;

const TOP = 'src/features/outfit/outfit-top.js';
const PANELS = 'src/features/outfit/outfit-panels.jsx';
const SUMMARY_NAMES = ['localPasteDiagnosticSummary', 'cropReturnDiagnosticSummary'];

function readLatin1(p) { return fs.readFileSync(p).toString('latin1'); }
function writeLatin1(p, s) {
  if (s.includes('\r\r\n')) { console.error('CRCR in ' + p + ' - 中止'); process.exit(1); }
  fs.writeFileSync(p, Buffer.from(s, 'latin1'));
}

// ---------- 1. 从 outfit-top.js 摘出并删除 2 个 summary ----------
let topS = readLatin1(TOP);
let topAst = parse(topS, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });

const picks = [];
topAst.program.body.forEach((node) => {
  let inner = node;
  if (t.isExportNamedDeclaration(node) && node.declaration) inner = node.declaration;
  let name = null;
  if (t.isFunctionDeclaration(inner) && inner.id) name = inner.id.name;
  else if (t.isVariableDeclaration(inner)) {
    for (const d of inner.declarations) if (t.isIdentifier(d.id)) name = d.id.name;
  }
  if (name && SUMMARY_NAMES.includes(name)) {
    picks.push({ name, start: node.start, end: node.end, text: topS.slice(node.start, node.end) });
  }
});

if (picks.length !== 2) {
  console.error('预期摘出 2 个 summary，实际', picks.length, '- 中止');
  process.exit(1);
}
console.log('摘出 summary:', picks.map((p) => p.name).join(', '));

// 降序删除（含尾部换行）
const ranges = picks.map((p) => [p.start, p.end]).sort((a, b) => b[0] - a[0]);
for (const [start, end] of ranges) {
  let e = end;
  while (e < topS.length && (topS[e] === '\n' || topS[e] === '\r')) e++;
  topS = topS.slice(0, start) + topS.slice(e);
}

// ---------- 2. 清理 outfit-top.js 的孤儿 import ----------
topAst = parse(topS, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
const used = new Set();
traverse(topAst, {
  Identifier(path) { if (path.isReferencedIdentifier()) used.add(path.node.name); },
  JSXIdentifier(path) {
    const p = path.parent;
    if ((p.type === 'JSXOpeningElement' && p.name === path.node) ||
        (p.type === 'JSXMemberExpression' && p.object === path.node)) {
      const n = path.node.name;
      if (/^[a-z]/.test(n) && !n.includes('.')) return;
      used.add(n);
    }
  }
});

const importNodes = [];
topAst.program.body.forEach((n) => { if (t.isImportDeclaration(n)) importNodes.push(n); });

const dropRanges = [];
const partial = [];
importNodes.forEach((node) => {
  if (!node.specifiers || node.specifiers.length === 0) return; // 副作用 import 保留
  const kept = node.specifiers.filter((s) => used.has(s.local.name));
  if (kept.length === node.specifiers.length) return;           // 未变
  if (kept.length === 0) { dropRanges.push([node.start, node.end]); return; }
  // 部分保留：重建为单行
  const source = node.source.value;
  const named = kept.filter((s) => t.isImportSpecifier(s));
  const def = kept.filter((s) => t.isImportDefaultSpecifier(s));
  const ns = kept.filter((s) => t.isImportNamespaceSpecifier(s));
  const parts = [];
  if (def.length) parts.push(def[0].local.name);
  if (ns.length) parts.push('* as ' + ns[0].local.name);
  if (named.length) {
    parts.push('{ ' + named.map((s) =>
      s.imported && s.imported.name !== s.local.name ? `${s.imported.name} as ${s.local.name}` : s.local.name
    ).sort().join(', ') + ' }');
  }
  partial.push({
    start: node.start, end: node.end,
    text: `import ${parts.join(', ')} from "${source}";`
  });
});

// 先应用 partial 替换（降序），再删除整条（降序）
partial.sort((a, b) => b.start - a.start);
for (const p of partial) topS = topS.slice(0, p.start) + p.text + topS.slice(p.end);
dropRanges.sort((a, b) => b[0] - a[0]);
for (const [start, end] of dropRanges) {
  let e = end;
  while (e < topS.length && (topS[e] === '\n' || topS[e] === '\r')) e++;
  topS = topS.slice(0, start) + topS.slice(e);
}
console.log('outfit-top.js 孤儿 import：整条删除', dropRanges.length, '条，改写', partial.length, '条');

writeLatin1(TOP, topS);

// ---------- 3. panels.jsx：删掉对 outfit-top.js 的 import，改为内联 2 个 summary ----------
let pS = readLatin1(PANELS);
const pAst = parse(pS, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
let removeRange = null;
pAst.program.body.forEach((node) => {
  if (t.isImportDeclaration(node) && node.source.value.includes('outfit-top.js')) {
    removeRange = [node.start, node.end];
  }
});
if (removeRange) {
  let e = removeRange[1];
  while (e < pS.length && (pS[e] === '\n' || pS[e] === '\r')) e++;
  pS = pS.slice(0, removeRange[0]) + pS.slice(e);
  console.log('panels: 已移除对 outfit-top.js 的 import');
} else {
  console.log('panels: 未找到对 outfit-top.js 的 import（可能已删）');
}

// 追加 2 个 summary（保持 export）
const summaryText = picks
  .sort((a, b) => a.start - b.start)
  .map((p) => p.text)
  .join('\r\n');
const sep = pS.endsWith('\r\n') ? '\r\n' : '\r\n\r\n';
pS = pS + sep + summaryText + '\r\n';

writeLatin1(PANELS, pS);

console.log('完成。请重跑 cycle-scan / vite build / eslint。');
