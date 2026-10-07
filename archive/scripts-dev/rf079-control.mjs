// RF-079 对照组：验证 outfit-workflow.jsx 的 result/task 域「逐字搬到 src/features/outfit/outfit-task.js」。
//
// 五路断言：
//   1) 等价性：新模块里每个函数/常量体 与 BASE(5635b04) 的原文切片 逐行相等（只许顶部多一个 export）；
//   2) 搬空：当前 outfit 已无这些名字的顶层定义，且反向 import 只有一处；
//   3) 契约：反向 import 名字 ⊆ 新模块导出；剩余代码引用的导出名必须全部回引；
//            新模块绝不 import outfit-workflow.jsx；订阅语义未改；常量随迁判定正确；
//   4) 执行：真实 import 新模块跑一遍纯函数，改入参必须改变输出 ⇒ 证明没有写死某一侧；
//   5) 负向：①比对器对改动敏感（不是恒真）②订阅/退订真的增减集合 ③常量留在原处的反证。
//
// ⚠ BASE 必须锁 5635b04（本单之前的提交）。写成 HEAD 会因 HEAD 已搬空而全线 FAIL。
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const BASE_REV = "5635b04";
const OUT = `${ROOT}/src/outfit-workflow.jsx`;
const MOD_REL = "src/features/outfit/outfit-task.js";
const MOD = `${ROOT}/${MOD_REL}`;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------- git show（spawn；本环境 execSync/spawnSync 恒 EBUSY） ----------
function gitShow(rev, path) {
  return new Promise((resolve, reject) => {
    const p = spawn("git", ["show", `${rev}:${path}`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `git show exit ${code}`))));
  });
}

// ---------- 行工具 ----------
const stripCr = (lines) => lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
function lineExtent(lines, startIdx) {
  let depth = 0;
  let quote = null;
  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    for (let j = 0; j < raw.length; j++) {
      const c = raw[j];
      const n = raw[j + 1];
      if (quote) {
        if (c === "\\") { j++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "/" && n === "/") break;
      if (c === "/" && n === "*") {
        const k = raw.indexOf("*/", j + 2);
        if (k < 0) break;
        j = k + 1;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return i; }
    }
    // 单行声明（如 `export const X = 1;`）靠分号收尾
    if (depth === 0 && /[;})]$/.test(raw.trimEnd())) return i;
  }
  return startIdx;
}
const sameLines = (a, b) => a.length === b.length && a.every((l, i) => l === b[i]);
const deindent2 = (a) => a.map((l) => (l.startsWith("  ") ? l.slice(2) : l));

// 顶层声明定位：允许 0 或 2 空格缩进（BASE 里有 2 空格缩进的待搬函数）
function findDecl(lines, name) {
  const hits = [];
  const reFn = new RegExp(`^ {0,2}(async )?function ${name}\\(`);
  const reConst = new RegExp(`^ {0,2}(export )?(const|let) ${name}\\s*=`);
  for (let i = 0; i < lines.length; i++) {
    if (reFn.test(lines[i]) || reConst.test(lines[i])) hits.push(i);
  }
  return hits;
}

// ==========================================================
const baseSrc = stripCr((await gitShow(BASE_REV, "src/outfit-workflow.jsx")).split("\n"));
const modRaw = stripCr(readFileSync(MOD, "utf8").split("\n"));
const outLines = stripCr(readFileSync(OUT, "utf8").split("\n"));
// 新模块去掉 export 前缀后，与 BASE 原文同形
const modLines = modRaw.map((l) => l.replace(/^export /, ""));

// 导出清单（从新模块权威提取，随模块演进自动更新）
const exportedNames = [];
for (const l of modRaw) {
  const m = l.match(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/) ||
            l.match(/^export\s+(?:const|let)\s+([A-Za-z0-9_$]+)\s*=/);
  if (m) exportedNames.push(m[1]);
}
const SYNTHESIZED = new Set(["subscribeOutfitLiveRuns"]); // 本单合成，BASE 里没有

console.log(`== 断言1: 逐行等价（BASE=${BASE_REV} 原文切片 vs 新模块） ==`);
check("meta:exported-count", exportedNames.length >= 80, `导出 ${exportedNames.length} 个`);
let identicalOk = 0;
let identicalFail = 0;
for (const name of exportedNames) {
  if (SYNTHESIZED.has(name)) continue;
  const bh = findDecl(baseSrc, name);
  const mh = findDecl(modLines, name);
  if (bh.length !== 1) { check(`identical:${name}`, false, `BASE 命中 ${bh.length} 处`); identicalFail++; continue; }
  if (mh.length !== 1) { check(`identical:${name}`, false, `新模块命中 ${mh.length} 处`); identicalFail++; continue; }
  const bSlice = baseSrc.slice(bh[0], lineExtent(baseSrc, bh[0]) + 1);
  const mSlice = modLines.slice(mh[0], lineExtent(modLines, mh[0]) + 1);
  const exact = sameLines(bSlice, mSlice);
  const shifted = sameLines(deindent2(bSlice), mSlice);
  if (exact || shifted) {
    identicalOk++;
  } else {
    identicalFail++;
    const k = bSlice.findIndex((l, i) => l !== mSlice[i]);
    check(`identical:${name}`, false, `${bSlice.length}行 vs ${mSlice.length}行，首个差异 BASE="${(bSlice[k] ?? "").trim()}" MOD="${(mSlice[k] ?? "").trim()}"`);
  }
}
check("identical:all", identicalFail === 0, `逐行相等 ${identicalOk} 个 / 失败 ${identicalFail} 个`);

console.log("== 断言2: 已搬空（outfit 里不再有这些顶层定义） ==");
let stillDefined = [];
for (const name of exportedNames) {
  const reFn = new RegExp(`^(async )?function ${name}\\(`);
  const reConst = new RegExp(`^(const|let) ${name}\\s*=`);
  if (outLines.some((l) => reFn.test(l) || reConst.test(l))) stillDefined.push(name);
}
check("moved:no-top-level-def-left", stillDefined.length === 0, stillDefined.length ? `仍定义: ${stillDefined.join(",")}` : `${exportedNames.length} 个全部搬空`);
const reverseImports = outLines.filter((l) => l.includes(`from "./features/outfit/outfit-task.js"`));
check("moved:reverse-import-exactly-one", reverseImports.length === 1, `反向 import 行数=${reverseImports.length}`);

console.log("== 断言3: 契约不变 ==");
// 解析反向 import 名字清单
// ⚠️ 必须先定位闭合行再往回找 `import {`：outfit 里有一堆多行 import，
// 从前往后找第一个 `import {` 会把中间的无关 import 全部算进来。
let revStart = -1;
let revEnd = -1;
for (let i = 0; i < outLines.length; i++) {
  if (outLines[i].includes(`from "./features/outfit/outfit-task.js"`)) {
    revEnd = i;
    for (let k = i; k >= 0; k--) {
      if (outLines[k].trim() === "import {") { revStart = k; break; }
    }
    break;
  }
}
const revNames = revStart >= 0
  ? outLines.slice(revStart + 1, revEnd).map((l) => l.replace(/,$/, "").trim()).filter(Boolean)
  : [];
check("contract:reverse-names-nonempty", revNames.length > 20, `回引 ${revNames.length} 个名字`);
const notExported = revNames.filter((n) => !exportedNames.includes(n));
check("contract:reverse-names-all-exported", notExported.length === 0, notExported.length ? `未导出: ${notExported.join(",")}` : "全部在新模块里导出");
// 剩余代码用到的导出名必须都在回引清单里（缺一个 ⇒ no-undef）
const inImportBlock = new Set();
for (let i = 0; i < outLines.length; i++) {
  if (/^import\s/.test(outLines[i])) {
    let j = i;
    if (/import\s*\{/.test(outLines[i])) {
      while (j < outLines.length && !/\}\s*from\s*["']/.test(outLines[j]) && !/^import\s*\{[^}]*\}\s*from/.test(outLines[j])) j++;
    }
    for (let k = i; k <= j; k++) inImportBlock.add(k);
    i = j;
  }
}
// ⚠️ 判定"是否仍被引用"必须剥注释：2163 行 JSDoc 里写了一句「见 outfitLiveRuns 的说明」，
// 不剥就会被当成真实引用。按行剥（整行是注释 / 行尾 //），不用跨行块注释正则。
const stripComments = (text) => text
  .split("\n")
  .map((line) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return "";
    const idx = line.search(/(^|\s)\/\//);
    if (idx === 0) return "";
    if (idx > 0) return line.slice(0, idx + 1);
    return line;
  })
  .join("\n");
const outCode = stripComments(outLines.filter((l, i) => !inImportBlock.has(i)).join("\n"));
check("contract:comment-false-positive-guard",
  new RegExp("\\boutfitLiveRuns\\b").test(outLines.join("\n")) && !new RegExp("\\boutfitLiveRuns\\b").test(outCode),
  "outfitLiveRuns 只出现在注释里 ⇒ 剥注释后不再是引用");
const usedButNotImported = exportedNames.filter((n) => new RegExp(`\\b${n}\\b`).test(outCode) && !revNames.includes(n));
check("contract:every-used-export-is-imported-back", usedButNotImported.length === 0,
  usedButNotImported.length ? `漏回引: ${usedButNotImported.join(",")}` : "剩余代码引用的导出名 100% 回引");
const modImports = modRaw.filter((l) => /^import\s/.test(l));
check("contract:module-never-imports-outfit", modImports.every((l) => !l.includes("outfit-workflow")), "零循环依赖");
check("contract:module-no-react-hook",
  !modRaw.some((l) => /from\s+"react"/.test(l)) && !modRaw.some((l) => /\buse[A-Z]\w*\(/.test(l)),
  "普通模块导出形态（无 hook、无 JSX）");
// 常量随迁判定：被搬走函数用到的随迁，没用到的留在原处
check("const:temp-prefix-stays", outLines.some((l) => /^const OUTFIT_TEMP_IMAGE_CACHE_PREFIX\s*=/.test(l)), "未被搬走函数引用 ⇒ 留在 outfit");
check("const:result-prefix-moved", !outLines.some((l) => /^const OUTFIT_RESULT_IMAGE_CACHE_PREFIX\s*=/.test(l)), "被搬走函数引用 ⇒ 随迁进新模块");
// 订阅点（§7.12）
check("contract:subscribe-site-single", outLines.filter((l) => l.includes("return subscribeOutfitLiveRuns(listener);")).length === 1, "订阅点换成 1 行调用");
check("contract:no-direct-subscriber-mutation",
  !outLines.some((l) => l.includes("outfitLiveRunSubscribers.add(")) &&
  !outLines.some((l) => l.includes("outfitLiveRunSubscribers.delete(")),
  "outfit 不再直接增删订阅者集合");

// ==========================================================
console.log("== 断言4: 真实执行（改入参必须改变输出 ⇒ 没写死） ==");
const noop = () => {};
const store = new Map();
globalThis.window = {
  setTimeout: () => 0,
  clearTimeout: noop,
  setInterval: () => 0,
  clearInterval: noop,
  addEventListener: noop,
  removeEventListener: noop,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  cancelAnimationFrame: noop,
  location: { href: "http://localhost/", protocol: "http:", host: "localhost" },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  devicePixelRatio: 1,
  open: noop,
  confirm: () => false,
  alert: noop
};
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node", language: "zh-CN", platform: "node", onLine: true }, configurable: true, writable: true });
if (typeof globalThis.document === "undefined") {
  Object.defineProperty(globalThis, "document", {
    value: { createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, click: noop }), body: { appendChild: noop, removeChild: noop }, addEventListener: noop, removeEventListener: noop },
    configurable: true,
    writable: true
  });
}
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }), blob: async () => ({ type: "image/png", size: 4 }) });
if (typeof globalThis.URL.createObjectURL !== "function") {
  globalThis.URL.createObjectURL = () => `blob:mock/${(globalThis.URL.__n = (globalThis.URL.__n || 0) + 1)}`;
  globalThis.URL.revokeObjectURL = noop;
}

const M = await import(pathToFileURL(MOD).href);

// 4.1 状态文案（S2-4）
{
  const cases = [["queued", "等待"], ["running", "生成中"], ["success", "完成"], ["detached", "待确认"], ["failed", "失败"]];
  let ok = true;
  for (const [input, expect] of cases) if (M.taskStatusLabel(input) !== expect) ok = false;
  check("run:taskStatusLabel-map", ok, cases.map(([i, e]) => `${i}→${e}`).join(" "));
  check("run:taskStatusLabel-param-sensitive", M.taskStatusLabel("queued") !== M.taskStatusLabel("failed"), "入参不同 ⇒ 输出不同");
  check("run:taskStatusLabel-fallback", M.taskStatusLabel("") === "--", "未知状态回落 --");
}
// 4.2 RuntimeStage（S2-5）
{
  const a = M.taskRuntimeStageLabel({ runtimeStage: "排队中", runtimeDetail: "第 2 个" });
  const b = M.taskRuntimeStageLabel({});
  check("run:taskRuntimeStageLabel-join", a === "排队中：第 2 个", a);
  check("run:taskRuntimeStageLabel-empty", b === "", "无 stage/detail ⇒ 空串");
}
// 4.3 耗时（S2-6）
{
  check("run:taskDurationMs-timing-first", M.taskDurationMs({ timingMs: 1500, startedAt: 1, finishedAt: 9 }) === 1500, "timingMs 优先");
  check("run:taskDurationMs-span", M.taskDurationMs({ startedAt: 1000, finishedAt: 3000 }) === 2000, "finishedAt-startedAt");
  check("run:taskDurationMs-null", M.taskDurationMs({}) === null, "无计时信息 ⇒ null");
  check("run:taskDurationMs-param-sensitive",
    M.taskDurationMs({ startedAt: 1000, finishedAt: 3000 }) !== M.taskDurationMs({ startedAt: 1000, finishedAt: 5000 }),
    "结束时间变化 ⇒ 输出变化");
}
// 4.4 中断文案（S2-10 真刷新）
{
  const reload = M.detachedTaskMessage({ savedPath: "D:/save/a.png" }, "reload");
  const pageSwitch = M.detachedTaskMessage({ savedPath: "D:/save/a.png" }, "page-switch");
  check("run:detachedTaskMessage-reload", reload.error.includes("整页刷新"), reload.error);
  check("run:detachedTaskMessage-param-sensitive", reload.error !== pageSwitch.error, `reason 不同 ⇒ 文案不同（${pageSwitch.error}）`);
  check("run:detachedTaskMessage-savedPath-hint", reload.errorDetail.includes("D:/save/a.png"), "带上保存路径提示");
  const same = { status: "success" };
  check("run:refreshDetachedTaskMessage-passthrough", M.refreshDetachedTaskMessage(same) === same, "非 detached ⇒ 原样返回同一引用");
}
// 4.5 下载文件名（S3-16 真分叉，绝不能被统一到 main 的规则）
{
  const a = M.taskDragDownloadName({ createdAt: 1700000000000 }, 0);
  const b = M.taskDragDownloadName({ createdAt: 1700000000000 }, 1);
  check("run:taskDragDownloadName-prefix", a.startsWith("静音AI绘画-") && /-\d{4}$/.test(a), a);
  check("run:taskDragDownloadName-param-sensitive", a !== b, `序号随 fallbackIndex 变化: ${a} → ${b}`);
  check("run:taskDragDownloadName-saved-first",
    M.taskDragDownloadName({ savedFilename: "saved.png", createdAt: 1700000000000 }, 9) === "saved.png",
    "已有 savedFilename 时优先返回它");
}
// 4.6 重跑/替换判定（S3-18/19）
{
  check("run:canRerunTask-true", M.canRerunTask({ modelItem: { file: {} }, clothingItem: { file: {} } }) === true, "模特+服装齐备");
  check("run:canRerunTask-outpaint-only", M.canRerunTask({ modelItem: { file: {} }, workflowMode: "outpaint" }) === true, "outpaint 免服装");
  check("run:canRerunTask-false", M.canRerunTask({ modelItem: { file: {} } }) === false, "缺服装且非免服装模式 ⇒ false");
  const src = { id: "a", status: "success", result: { type: "url", value: "https://x/1.png" } };
  const dst = { id: "b", status: "success", result: { type: "url", value: "https://x/2.png" } };
  check("run:canReplaceTaskResult-true", M.canReplaceTaskResult(src, dst) === true, "两张成功结果 ⇒ 可替换");
  check("run:canReplaceTaskResult-same-id", M.canReplaceTaskResult(src, src) === false, "同一任务 ⇒ 不可替换");
  check("run:canReplaceTaskResult-failed", M.canReplaceTaskResult({ ...src, status: "failed" }, dst) === false, "源失败 ⇒ 不可替换");
}
// 4.7 结果图源与缓存键（S2-7/8）
{
  check("run:imageSource-b64", M.imageSource({ type: "b64_json", value: "AAAA" }).startsWith("data:image/png;base64,"), "b64_json 补 data: 头");
  check("run:imageSource-url", M.imageSource({ type: "url", value: "https://x/1.png" }) === "https://x/1.png", "url 直出");
  check("run:imageSource-empty", M.imageSource(null) === "", "空 ⇒ 空串");
  const k1 = M.resultImageCacheKey({ type: "url", value: "https://x/1.png" });
  const k2 = M.resultImageCacheKey({ type: "url", value: "https://x/2.png" });
  check("run:resultImageCacheKey-prefix", k1.startsWith("result-image-cache:"), k1);
  check("run:resultImageCacheKey-param-sensitive", k1 !== k2, "不同地址 ⇒ 不同缓存键");
  check("run:resultImageCacheKey-blob-empty", M.resultImageCacheKey({ type: "url", value: "blob:abc" }) === "", "blob: 不入缓存");
  check("run:hasRestorableResultAddress-blob-false", M.hasRestorableResultAddress({ localUrl: "blob:abc" }) === false, "blob: 不可恢复");
}
// 4.8 cropReturn（依赖随迁的 cropReturnRectSnapshot）
{
  check("run:normalizeCropReturnMeta-null", M.normalizeCropReturnMeta({}) === null, "无 cropRect ⇒ null");
  const meta = M.normalizeCropReturnMeta({ cropRect: { x: 1, y: 2, width: 30, height: 40 }, sourceWidth: 100, sourceHeight: 200, aspectRatio: "1:1" });
  check("run:normalizeCropReturnMeta-obj", meta && meta.enabled === true && meta.sourceWidth === 100, JSON.stringify(meta && { e: meta.enabled, w: meta.sourceWidth, h: meta.sourceHeight }));
  check("run:cropReturnRectSnapshot-delegates", JSON.stringify(M.cropReturnRectSnapshot({ x: 1, y: 2, width: 3, height: 4 })) === JSON.stringify(M.localEditRectSnapshot({ x: 1, y: 2, width: 3, height: 4 })),
    "与 localEditRectSnapshot 同一实现（随迁依赖接上）");
}
// 4.9 随机背景焦点归一化
{
  check("run:normalizeRandomBackgroundFocus-upper", M.normalizeRandomBackgroundFocus("上衣") === "upper", "上衣→upper");
  check("run:normalizeRandomBackgroundFocus-lower", M.normalizeRandomBackgroundFocus("下装") === "lower", "下装→lower");
  check("run:normalizeRandomBackgroundFocus-set", M.normalizeRandomBackgroundFocus("套装") === "set", "套装→set");
  check("run:normalizeRandomBackgroundFocus-default", M.normalizeRandomBackgroundFocus("乱写") === "default", "未知→default");
}
// 4.10 订阅账本（§7.12 语义不得改变）
{
  const before = M.outfitLiveRunSubscribers.size;
  const seen = [];
  const unsub = M.subscribeOutfitLiveRuns((t) => seen.push(t));
  check("run:subscribe-adds", M.outfitLiveRunSubscribers.size === before + 1, `${before} → ${M.outfitLiveRunSubscribers.size}`);
  M.publishOutfitLiveRun({ id: "t1", status: "running", pageName: "换装" });
  check("run:publish-notifies", seen.length === 1 && seen[0].id === "t1", `收到 ${seen.length} 次推送`);
  unsub();
  check("run:unsubscribe-removes", M.outfitLiveRunSubscribers.size === before, `回到 ${M.outfitLiveRunSubscribers.size}`);
}

// ==========================================================
console.log("== 断言5: 负向（证明上面不是恒真） ==");
{
  // 5.1 比对器敏感：把新模块里某函数的正文改一个字符，逐行比对必须翻成不相等
  const idx = modLines.findIndex((l) => l.startsWith("function taskStatusLabel("));
  const end = lineExtent(modLines, idx);
  const mutated = modLines.slice(idx, end + 1).slice();
  mutated[1] = mutated[1].replace('"等待"', '"等待X"');
  check("neg:comparator-sensitive", !sameLines(modLines.slice(idx, end + 1), mutated), "改一个字符 ⇒ 比对器报不等");
  // 5.2 BASE 与 新模块 若错位取段（拿别的函数比）也必须不等
  const otherIdx = modLines.findIndex((l) => l.startsWith("function taskDurationMs("));
  const otherEnd = lineExtent(modLines, otherIdx);
  check("neg:comparator-not-always-true",
    !sameLines(modLines.slice(idx, end + 1), modLines.slice(otherIdx, otherEnd + 1)),
    "拿两个不同函数互比 ⇒ 不等（比对器区分内容）");
  // 5.3 反向 import 清单若漏一个正在用的名字，会被契约断言抓到
  const fake = exportedNames.filter((n) => new RegExp(`\\b${n}\\b`).test(outCode));
  check("neg:used-list-nonempty", fake.length > 10, `剩余代码实际引用 ${fake.length} 个导出名（漏回引会被断言3抓到）`);
  // 5.4 订阅：不调用返回函数时集合不减少（证明退订是真的由返回值触发）
  const before = M.outfitLiveRunSubscribers.size;
  M.subscribeOutfitLiveRuns(() => {});
  check("neg:subscribe-without-unsub-keeps", M.outfitLiveRunSubscribers.size === before + 1, "不退订 ⇒ 集合+1");
  M.outfitLiveRunSubscribers.forEach(() => {});
  M.subscribeOutfitLiveRuns(() => {});
  M.outfitLiveRunSubscribers.clear();
  check("neg:subscribers-clearable", M.outfitLiveRunSubscribers.size === 0, "清理后归零（集合是本模块同一份）");
}

// ==========================================================
const failed = results.filter((r) => !r.ok);
console.log(`\n== 汇总: ${results.length - failed.length}/${results.length} PASS ==`);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`));
  process.exit(1);
}
console.log("ALL PASS");
