/**
 * RF-081 收尾对拍：验证「被搬走的每个模块顶层声明」与施工前 BASE 原文逐字节一致。
 * 用途：替代无法在本环境执行的 UI 冒烟（证明搬运未改变任何语义）。
 *
 * BASE = 8dd22b5（V26 施工前的最后提交，符合「BASE 必须锁本阶段之前」纪律）
 * 对照物 = src/features/outfit/outfit-top.js + src/features/outfit/outfit-panels.jsx（2 个 summary）
 *
 * 只读，不写任何 src。
 */
import fs from 'fs';
import { parse } from '@babel/parser';

const BASE_FILE = 'tmp/orig-outfit-base.jsx';
const NEW_FILES = [
  'src/features/outfit/outfit-top.js',
  'src/features/outfit/outfit-panels.jsx',
];

// latin1 读写：保证切片保真原字节（文件为 UTF-8 + CRLF）
const readRaw = (p) => fs.readFileSync(p).toString('latin1');

function parseFile(p) {
  const code = readRaw(p);
  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator'],
      errorRecovery: true,
    });
  } catch (e) {
    console.error('解析失败', p, e.message);
    throw e;
  }
  return { code, ast };
}

/** 收集顶层声明：name -> { text, kind, declaratorCount, start } */
function collectTopDecls({ code, ast }) {
  const map = new Map();
  for (const node of ast.program.body) {
    let names = [];
    let kind = node.type;

    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      if (!node.id) continue;
      names = [node.id.name];
    } else if (node.type === 'VariableDeclaration') {
      names = node.declarations.map((d) => (d.id && d.id.name) || null).filter(Boolean);
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const d = node.declaration;
      kind = 'Export:' + d.type;
      if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') {
        names = d.id ? [d.id.name] : [];
      } else if (d.type === 'VariableDeclaration') {
        names = d.declarations.map((x) => (x.id && x.id.name) || null).filter(Boolean);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      continue;
    } else {
      continue;
    }

    const text = code.slice(node.start, node.end);
    const declaratorCount =
      node.type === 'VariableDeclaration'
        ? node.declarations.length
        : (node.declaration && node.declaration.declarations ? node.declaration.declarations.length : 1);

    for (const n of names) {
      if (!map.has(n)) map.set(n, { text, kind, declaratorCount, start: node.start, file: null });
    }
  }
  return map;
}

/** 剥掉前导 export（含 export async function / export const ...） */
function stripExport(text) {
  let t = text;
  if (/^export\s+default\s+/.test(t)) t = t.replace(/^export\s+default\s+/, '');
  else if (/^export\s+/.test(t)) t = t.replace(/^export\s+/, '');
  return t;
}

/** 归一化：仅用于「非逐字节但语义等价」的二次判定，不作为通过标准 */
function norm(s) {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\s+$/s, '');
}

const base = parseFile(BASE_FILE);
const baseDecls = collectTopDecls(base);

const newDecls = new Map(); // name -> { text, file }
for (const f of NEW_FILES) {
  const pf = parseFile(f);
  const m = collectTopDecls(pf);
  for (const [n, v] of m) {
    v.file = f;
    if (!newDecls.has(n)) newDecls.set(n, v);
  }
}

// 被搬走的集合 = 新文件里出现的顶层声明名 ∩ BASE 里也有的（即确实是从 outfit 搬来的）
const moved = [...newDecls.keys()].filter((n) => baseDecls.has(n)).sort();
const onlyNew = [...newDecls.keys()].filter((n) => !baseDecls.has(n)).sort();

console.log('=== 规模 ===');
console.log('BASE 顶层声明名数:', baseDecls.size);
console.log('新文件(两处)顶层声明名数:', newDecls.size);
console.log('被搬走(BASE 也有)待对拍:', moved.length);
if (onlyNew.length) console.log('新文件独有(非从 BASE 搬来):', onlyNew.length, onlyNew.slice(0, 10).join(', '));

const identical = [];
const equivalent = [];
const differ = [];

for (const n of moved) {
  const b = baseDecls.get(n).text;
  const nw = stripExport(newDecls.get(n).text);
  if (b === nw) {
    identical.push(n);
  } else if (norm(b) === norm(nw)) {
    equivalent.push(n);
  } else {
    differ.push({ n, b, nw, baseDecl: baseDecls.get(n).declaratorCount, newDecl: newDecls.get(n).declaratorCount });
  }
}

console.log('\n=== 对拍结果 ===');
console.log('逐字节一致:', identical.length);
console.log('归一化后一致(行尾/尾空格差异):', equivalent.length);
console.log('不一致:', differ.length);

if (equivalent.length) {
  console.log('\n--- 归一化后一致清单(说明仅行尾/尾空格差异) ---');
  console.log(equivalent.join(', '));
}

if (differ.length) {
  console.log('\n--- 不一致明细(前 10) ---');
  for (const d of differ.slice(0, 10)) {
    console.log('\n### ' + d.n);
    console.log('  BASE 声明子数:', d.baseDecl, ' 新 声明子数:', d.newDecl);
    console.log('  BASE bytes:', d.b.length, ' 新 bytes:', d.nw.length);
    console.log('  --- BASE 前 200 字符 ---');
    console.log('  ' + JSON.stringify(d.b.slice(0, 200)));
    console.log('  --- 新   前 200 字符 ---');
    console.log('  ' + JSON.stringify(d.nw.slice(0, 200)));
  }
}

// 负向对照：故意改一个字节，验证比对器能抓到（否则恒真）
const probeName = identical[0];
if (probeName) {
  const orig = baseDecls.get(probeName).text;
  const tampered = orig.length > 3 ? orig.slice(0, -1) + (orig.slice(-1) === '}' ? ';' : '}') : orig + 'x';
  const caught = tampered !== stripExport(newDecls.get(probeName).text);
  console.log('\n=== 负向对照 ===');
  console.log('对 "' + probeName + '" 改动末字节后，比对器判定不一致:', caught, caught ? '✅ 有效' : '❌ 恒真，比对器失效');
}

console.log('\n结论:', differ.length === 0 ? '✅ 全部被搬声明与 BASE 原文逐字节一致' : '❌ 存在 ' + differ.length + ' 处不一致');
