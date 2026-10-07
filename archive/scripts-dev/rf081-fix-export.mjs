// 修复 outfit-top.js：部分顶层声明缺少 export。
// 成因：提取脚本 exportify 用 /^function\b/ 匹配，不匹配 "async function ..."，
// 导致所有 async function 声明没被加上 export 前缀（构建报 "is not exported by"）。
// 本脚本把 outfit-top.js 中所有未导出的顶层声明确认补上 export。

import fs from 'fs';
import { parse } from '@babel/parser';
import * as t from '@babel/types';

const F = 'src/features/outfit/outfit-top.js';
const s = fs.readFileSync(F).toString('latin1');
const ast = parse(s, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });

// 需要补 export 的位置（升序收集，降序插入）
const inserts = [];
ast.program.body.forEach((node) => {
  if (t.isExportNamedDeclaration(node) || t.isExportDefaultDeclaration(node)) return; // 已导出
  if (!t.isFunctionDeclaration(node) && !t.isVariableDeclaration(node)) return;
  // 只处理顶层声明
  let name = '(?)';
  if (t.isFunctionDeclaration(node) && node.id) name = node.id.name;
  else if (t.isVariableDeclaration(node)) {
    const d = node.declarations[0];
    if (d && t.isIdentifier(d.id)) name = d.id.name;
  }
  inserts.push({ pos: node.start, name });
});

inserts.sort((a, b) => b.pos - a.pos);
let out = s;
for (const ins of inserts) {
  out = out.slice(0, ins.pos) + 'export ' + out.slice(ins.pos);
}

if (out.includes('\r\r\n')) { console.error('CRCR 检测失败，中止'); process.exit(1); }
fs.writeFileSync(F, Buffer.from(out, 'latin1'));

console.log('补 export 的顶层声明数:', inserts.length);
console.log(inserts.map((i) => '  ' + i.name).sort().join('\n'));

// 自检：重新解析，核对所有顶层声明都已导出
const ast2 = parse(out, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
const notExported = [];
ast2.program.body.forEach((node) => {
  if (t.isExportNamedDeclaration(node) || t.isExportDefaultDeclaration(node)) return;
  if (t.isFunctionDeclaration(node)) notExported.push(node.id ? node.id.name : '?');
  else if (t.isVariableDeclaration(node)) {
    for (const d of node.declarations) if (t.isIdentifier(d.id)) notExported.push(d.id.name);
  }
});
console.log('剩余未导出顶层声明:', notExported.length, notExported.length ? notExported.join(', ') : '(无)');
