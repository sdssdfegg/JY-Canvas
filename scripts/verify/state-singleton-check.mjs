// 单例状态门禁（V11-RF-101 的硬性交付物，不是可选项）。
//
// 断言：activeImageRequestCount / imageRequestQueue 这两个出图并发状态符号，
// 在【全部服务端源码】里只允许各有 1 处定义点（let/const/var 声明），
// 且该定义点必须位于 server/core/image-concurrency.js 内。
// 任何其它文件里出现第二处声明，都代表有人"自建第二份并发状态"，
// 立即变红并点名文件（这是批次 3/4 的公共护栏）。
//
// 复用 V11-RF-010 的「服务端源码真相源」收集器 listServerSourceFiles()，
// 这样将来 server/routes/** 出现"各持一份"会被自动抓住，不需要回头改本脚本。
//
// 退出码：通过 0 / 失败 1。输出 JSON，含每个符号的「定义点 / 引用点」分列统计。
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { listServerSourceFiles } from "./lib/server-sources.mjs";

const ROOT = process.cwd();
const TARGET_MODULE = path.join("server", "core", "image-concurrency.js");
const SYMBOLS = ["activeImageRequestCount", "imageRequestQueue"];

// 去掉注释，避免注释/字符串里的字样被误判成定义点。
// 行注释只切「行首或空白后的 //」（保留 http:// 这类协议写法），且只切到行尾。
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/(?!\/)[^\n]*/g, "$1");
}

function findDefinitions(stripped, symbol) {
  const re = new RegExp(`\\b(?:let|const|var)\\s+${symbol}\\b`, "g");
  const defs = [];
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const before = stripped.slice(0, m.index);
    defs.push(before.split("\n").length);
  }
  return defs;
}

function countWord(stripped, symbol) {
  const re = new RegExp(`\\b${symbol}\\b`, "g");
  let n = 0;
  while (re.exec(stripped) !== null) n += 1;
  return n;
}

const files = listServerSourceFiles();
const failures = [];
const report = {};

for (const symbol of SYMBOLS) {
  const perFile = [];
  for (const file of files) {
    let source;
    try { source = readFileSync(file, "utf8"); } catch { continue; }
    const stripped = stripComments(source);
    const defs = findDefinitions(stripped, symbol);
    if (defs.length === 0) continue;
    const total = countWord(stripped, symbol);
    perFile.push({
      file: path.relative(ROOT, file),
      definitions: defs,
      references: Math.max(0, total - defs.length)
    });
  }
  const totalDefs = perFile.reduce((n, f) => n + f.definitions.length, 0);
  const bad = perFile.filter((f) => f.file !== TARGET_MODULE);
  const offending = [];
  if (totalDefs !== 1) {
    offending.push(`定义点 ${totalDefs} 处（期望 1）`);
  }
  if (bad.length > 0) {
    offending.push(`第二处定义出现在非目标模块：${bad.map((f) => f.file).join(", ")}`);
  }
  if (totalDefs === 1 && bad.length === 0 && perFile.length === 0) {
    offending.push("未在任何服务端源码中找到定义");
  }
  if (offending.length > 0) {
    failures.push({ symbol, reasons: offending, files: perFile.map((f) => f.file) });
  }
  report[symbol] = {
    definitions: totalDefs,
    references: perFile.reduce((n, f) => n + f.references, 0),
    files: perFile
  };
}

const ok = failures.length === 0;
const output = { ok, targetModule: TARGET_MODULE, symbols: report };
if (!ok) output.failures = failures;
console.log(JSON.stringify(output, null, 2));
process.exit(ok ? 0 : 1);
