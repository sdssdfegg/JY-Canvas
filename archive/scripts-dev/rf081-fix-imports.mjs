// 还原 outfit-workflow.jsx 的 import 区块：
// 首次提取时我把整个 import 区间重建成了「单行 import 列表」，导致：
//   1) import 区块里的中文注释被整段删除；
//   2) 多行 import 被压成超长单行（可读性下降）；
//   3) 行数虚降，A 值被夸大。
// 本脚本改为：以 HEAD 原始 import 区块为底本，只删除「孤儿 specifier」，
// 保留原有换行/缩进/注释，末尾再接上 2 行 back-import。

import fs from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';

const traverse = typeof _traverse === 'function' ? _traverse : _traverse.default;

const F = 'src/outfit-workflow.jsx';
const CRLF = '\r\n';

// 取出 HEAD 原版（本环境 spawnSync/execSync 恒 EBUSY，故先用 bash 导出到 tmp/orig-outfit.jsx）
const ORIG_DUMP = 'tmp/orig-outfit.jsx';
let orig = fs.readFileSync(ORIG_DUMP).toString('latin1');
const cur = fs.readFileSync(F).toString('latin1');

// ---- 1. 统计 CURRENT 里真正被引用的名字（import specifier 不算引用） ----
const curAst = parse(cur, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
const used = new Set();
traverse(curAst, {
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

// ---- 2. CUR 中我新增的 back-import 行（outfit-top.js / outfit-panels.jsx） ----
const curImports = [];
curAst.program.body.forEach((n) => { if (t.isImportDeclaration(n)) curImports.push(n); });
const backLines = [];
curImports.forEach((n) => {
  const srcv = n.source.value;
  if (srcv.endsWith('outfit-top.js')) backLines.push(cur.slice(n.start, n.end));
});
curImports.forEach((n) => {
  const srcv = n.source.value;
  // 只取「3 个面板」这一条（原来不存在，是我新增的）
  if (srcv.endsWith('outfit-panels.jsx') && /CropReturnDiagnosticsPanel|LegacyModulePanel|LocalPasteDiagnosticsPanel/.test(cur.slice(n.start, n.end))) {
    backLines.push(cur.slice(n.start, n.end));
  }
});
console.log('back-import 行数:', backLines.length);
backLines.forEach((l) => console.log('  ' + l.slice(0, 110) + '...'));

// ---- 3. 在 ORIGINAL 上删孤儿 specifier ----
const origAst = parse(orig, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
const origImports = [];
origAst.program.body.forEach((n) => { if (t.isImportDeclaration(n)) origImports.push(n); });

const wholeRemovals = [];   // 整条删除
const specRemovals = [];    // 删单个 specifier
let orphanCount = 0;
let droppedWhole = 0;

origImports.forEach((node) => {
  if (!node.specifiers || node.specifiers.length === 0) return; // 副作用 import 保留
  const orphans = node.specifiers.filter((s) => !used.has(s.local.name));
  if (orphans.length === node.specifiers.length) {
    wholeRemovals.push([node.start, node.end]);
    droppedWhole++;
    orphanCount += orphans.length;
    return;
  }
  orphans.forEach((s) => {
    orphanCount++;
    // 删除范围：specifier 本体 + 其后逗号 + 其后换行
    let e = s.end;
    let j = e;
    while (j < orig.length && (orig[j] === ' ' || orig[j] === '\t')) j++;
    if (orig[j] === ',') { j++; e = j; }
    while (e < orig.length && (orig[e] === '\n' || orig[e] === '\r')) e++;
    specRemovals.push([s.start, e, s.local.name]);
  });
});

console.log('孤儿 specifier 总数:', orphanCount, '（整条删除', droppedWhole, '条，逐个删除', specRemovals.length, '个）');

// 降序应用：先删 specifier，再删整条
const all = [...specRemovals.map((r) => [r[0], r[1]]), ...wholeRemovals].sort((a, b) => b[0] - a[0]);
for (const [start, end] of all) {
  let e = end;
  while (e < orig.length && (orig[e] === '\n' || orig[e] === '\r')) e++;
  orig = orig.slice(0, start) + orig.slice(e);
}

// 清理悬空逗号： ",\r\n}" / ", }" 等
orig = orig.replace(/,(\s*\r?\n?\s*)\}/g, '$1}').replace(/,\s*\}/g, ' }');

// ---- 4. 取 ORIGINAL 修改后的 import 区块 ----
const origAst2 = parse(orig, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
let firstStart = -1, lastEnd = -1;
origAst2.program.body.forEach((n) => {
  if (t.isImportDeclaration(n)) {
    if (firstStart === -1) firstStart = n.start;
    lastEnd = n.end;
  }
});
if (firstStart === -1) { console.error('ORIGINAL 未找到 import，中止'); process.exit(1); }
const restoredBlock = orig.slice(firstStart, lastEnd);

// ---- 5. 拼回 CURRENT ----
let cFirst = -1, cLast = -1;
curAst.program.body.forEach((n) => {
  if (t.isImportDeclaration(n)) {
    if (cFirst === -1) cFirst = n.start;
    cLast = n.end;
  }
});

const out = cur.slice(0, cFirst) + restoredBlock + CRLF + backLines.join(CRLF) + cur.slice(cLast);

if (out.includes('\r\r\n')) { console.error('CRCR 检测失败，中止'); process.exit(1); }
fs.writeFileSync(F, Buffer.from(out, 'latin1'));

console.log('已还原 import 区块。');
console.log('还原后 import 区块行数:', restoredBlock.split(/\r?\n/).length);
console.log('文件总行数:', out.split(/\r?\n/).length);
