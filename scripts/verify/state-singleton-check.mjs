// 单例状态门禁（V11-RF-101 的硬性交付物，不是可选项）。
//
// 断言：以下进程级单例状态符号，在【全部服务端源码】里只允许各有 1 处定义点
// （let/const/var 声明），且该定义点必须位于指定的目标模块内。
// 任何其它文件里出现第二处声明，都代表有人"自建第二份状态"，
// 立即变红并点名文件（这是批次 3/4 的公共护栏）。
//   - activeImageRequestCount / imageRequestQueue → 出图并发状态（RF-101）。
//   - videoRouteSessions → 视频线路会话状态（RF-113，与 101 同一类单例陷阱：
//     状态有两份 = 会话丢失 / 轮询拿不到原线路，表现为视频状态查询走错线路或 401）。
//   - resultCacheCleanupStarted → 结果缓存清理启动标记（RF-116，与 101/113 同一类单例陷阱：
//     状态有两份 = 清理可能跑两次 / 漏跑，表现为缓存清理行为异常）。
//   - saveFilenameLock → 保存文件名并发锁（RF-020 补入；两份 = 锁形同虚设，并发保存会撞文件名）。
//   - resultCacheCleanupRunning / resultCacheCleanupTimer → 清理的重入标记与定时器句柄
//     （RF-020 补入；两份 = 定时器泄漏 / 清理并发重入）。
//   - localGenerationRequestStartedAt → 请求追踪起点时间戳表（RF-020 补入；
//     源码注释自证"进程级单例，只此一份"，两份 = 追踪耗时取不到起点、localUploadParseMs 恒为 0）。
//
// 🔴 监视清单（实测得出，2026-10-02，共 8 条 —— 写本注释时逐个扫过 server/** 的模块级
//    let / var / 顶层 Map / Set / 数组状态，每条都有归属）：
//      1. activeImageRequestCount    image-concurrency.js
//      2. imageRequestQueue          image-concurrency.js
//      3. videoRouteSessions         video-route-session.js
//      4. resultCacheCleanupStarted  app-bootstrap.js
//      5. saveFilenameLock           asset-persist.js
//      6. resultCacheCleanupRunning  result-cache.js
//      7. resultCacheCleanupTimer    result-cache.js
//      8. localGenerationRequestStartedAt  generation-trace.js
//    ⚠️ 不得写"体量小所以不用管" —— 曾因从体量推断而漏掉 4 处（§0.9 第 11 条）。
//    ⚠️ 本清单即"实测门禁名单"；新增进程级单例状态时必须同步改这里与本文件头注释。
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

// 每个受监视符号：必须在「唯一目标模块」里有且仅有一处定义点（let/const/var）。
// 以后新增进程级单例状态，直接往这里加一条即可，不需要改下面的逻辑。
const MONITORED = [
  { symbol: "activeImageRequestCount", targetModule: path.join("server", "core", "image-concurrency.js") },
  { symbol: "imageRequestQueue", targetModule: path.join("server", "core", "image-concurrency.js") },
  { symbol: "videoRouteSessions", targetModule: path.join("server", "core", "video-route-session.js") },
  { symbol: "resultCacheCleanupStarted", targetModule: path.join("server", "core", "app-bootstrap.js") },
  // ↓ V11-RF-020 补齐：此前门禁只监视上面 4 条，实测模块级可变状态共 8 处，漏了这 4 条。
  { symbol: "saveFilenameLock", targetModule: path.join("server", "core", "asset-persist.js") },
  { symbol: "resultCacheCleanupRunning", targetModule: path.join("server", "core", "result-cache.js") },
  { symbol: "resultCacheCleanupTimer", targetModule: path.join("server", "core", "result-cache.js") },
  // 这一条执行单未列，是执行者实测扫出来的：源码注释自证"进程级单例，只此一份（Map）"。
  { symbol: "localGenerationRequestStartedAt", targetModule: path.join("server", "core", "generation-trace.js") }
];

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

for (const { symbol, targetModule } of MONITORED) {
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
  const bad = perFile.filter((f) => f.file !== targetModule);
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
    failures.push({ symbol, targetModule, reasons: offending, files: perFile.map((f) => f.file) });
  }
  report[symbol] = {
    targetModule,
    definitions: totalDefs,
    references: perFile.reduce((n, f) => n + f.references, 0),
    files: perFile
  };
}

const ok = failures.length === 0;
const output = {
  ok,
  monitored: MONITORED.map((m) => ({ symbol: m.symbol, targetModule: m.targetModule })),
  symbols: report
};
if (!ok) output.failures = failures;
console.log(JSON.stringify(output, null, 2));
process.exit(ok ? 0 : 1);
