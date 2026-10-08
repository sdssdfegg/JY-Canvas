// 修复 outfit-top.js 文件头 mojibake：
// 原提取脚本把「新生成的中文注释」也按 latin1 写出，导致中文被截断成低位字节。
// 正解：新生成的文本用 utf8 写，从原文件切出来的文本保持 latin1（保原字节）。
// 本脚本只替换文件头，正文（import ASCII + 切片正文 latin1）原样保留。

import fs from 'fs';

const F = 'src/features/outfit/outfit-top.js';
const CRLF = '\r\n';

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

const buf = fs.readFileSync(F);
const s = buf.toString('latin1');

// 找到第一条以 import 开头的行（= 文件头结束位置）
let idx = -1;
let acc = 0;
for (const ln of s.split('\n')) {
  const clean = ln.replace(/\r$/, '');
  if (clean.startsWith('import ')) { idx = acc; break; }
  acc += ln.length + 1;
}

if (idx === -1) {
  console.error('未找到 import 起始位置，中止');
  process.exit(1);
}

const headerBuf = Buffer.from(HEADER, 'utf8');
const restBuf = buf.slice(idx);
const out = Buffer.concat([headerBuf, restBuf]);

if (out.includes(Buffer.from('\r\r\n', 'latin1'))) {
  console.error('CRCR 检测失败，中止');
  process.exit(1);
}

fs.writeFileSync(F, out);
console.log('已修复', F);
console.log('替换前文件头长度:', idx, '新文件头字节:', headerBuf.length);
console.log('总字节:', out.length);
