// 修复 outfit-top.js 的 import 相对路径：
// 提取时照抄了 outfit-workflow.jsx（位于 src/）的路径，如 "./api/assets.js"；
// 但 outfit-top.js 位于 src/features/outfit/，必须重新按新目录计算相对路径。
// 例：./api/assets.js -> ../../api/assets.js ；./features/outfit/outfit-task.js -> ./outfit-task.js

import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';

const F = 'src/features/outfit/outfit-top.js';
const ORIG_BASE = 'src';                  // outfit-workflow.jsx 所在目录
const NEW_BASE = 'src/features/outfit';   // outfit-top.js 所在目录

const buf = fs.readFileSync(F);
let s = buf.toString('latin1');

const ast = parse(s, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });

const edits = []; // {start, end, newText}
ast.program.body.forEach((node) => {
  if (node.type !== 'ImportDeclaration') return;
  const source = node.source.value;
  if (!source.startsWith('.')) return; // 裸模块（react / lucide-react）不动
  const abs = path.posix.normalize(path.posix.join(ORIG_BASE, source));
  let rel = path.posix.relative(NEW_BASE, abs);
  if (!rel.startsWith('.')) rel = './' + rel;
  const newNode = `\u0022${rel}\u0022`;
  if (rel !== source) {
    edits.push({ start: node.source.start, end: node.source.end, newText: newNode, old: source, rel });
  }
});

// 降序 splice，保证偏移有效
edits.sort((a, b) => b.start - a.start);
for (const e of edits) {
  s = s.slice(0, e.start) + e.newText + s.slice(e.end);
  console.log(`  ${e.old}  ->  ${e.rel}`);
}

fs.writeFileSync(F, Buffer.from(s, 'latin1'));
console.log('已重写 import 路径，条数:', edits.length);

// 校验：CRCR / NUL
const after = fs.readFileSync(F);
const str = after.toString('latin1');
console.log('CRCR:', str.split('\r\r\n').length - 1, ' NUL:', after.includes(0));
