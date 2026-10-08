// RF-074 阶段 A 对照组：验证 createResultDownload 的「逐字搬运 + 调用契约不变 + 依赖未写死」。
//
// 五路断言：
//   1) 等价性：工厂里 10 个函数体 与 BASE(5635b04) 的原文切片 逐行相等；
//   2) 搬空：当前 main.jsx 已无这 10 个 `function NAME(` 内联定义；
//   3) 契约：工厂 return 覆盖调用点解构清单；内部互调的两个名字不在调用点解构；
//   4) 执行：真实工厂跑一遍（含 async），变华入参必须改变输出 ⇒ 证明没有写死某一侧；
//   5) 负向：①比对器对改动敏感 ②删掉一个 deps 解构项必须命中 ESLint no-undef
//            ③deps 缺项时运行时必然报错 ⇒ harness 不是恒真。
//
// ⚠ BASE 必须锁 5635b04（阶段 A 之前的提交）。改成 HEAD 会因 HEAD 已搬空而全线 FAIL。
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const BASE_REV = "5635b04";
const MAIN = `${ROOT}/src/main.jsx`;
const FACTORY_REL = "src/features/result-queue/quick-result-replace.js";
const FACTORY = `${ROOT}/${FACTORY_REL}`;

const NAMES = [
  "blobFromImageItem",
  "resultDragDownloadName",
  "beginResultImageDrag",
  "beginReferenceImageDrag",
  "copyImage",
  "downloadItem",
  "autoSaveGeneratedItems",
  "flashDownloadFeedback",
  "downloadSelected",
  "downloadAll"
];
const FACTORY_NAME = "createResultDownload";
const EXPECTED_DEPS = [
  "quickResults", "selectedIds", "addEvent", "quickResultDragIdRef", "QUICK_RESULT_DRAG_TYPE",
  "copyText", "saveDirectory", "refreshSaveDirectory", "setSaveDirectory", "setDirectoryDraft",
  "setDownloadFeedbackIds", "downloadFeedbackTimersRef"
];
// main.jsx 薄壳本轮实际解构的清单（内部互调的两个不在其中）
const EXPECTED_DESTRUCTURED = [
  "blobFromImageItem", "beginResultImageDrag", "beginReferenceImageDrag", "copyImage",
  "downloadItem", "autoSaveGeneratedItems", "downloadSelected", "downloadAll"
];
const INTERNAL_ONLY = ["resultDragDownloadName", "flashDownloadFeedback"];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------- git show（spawn，本环境 execSync/spawnSync 恒 EBUSY） ----------
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

// ---------- 按行切片工具 ----------
const stripCr = (lines) => lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
function findDecl(lines, name, from = 0) {
  const hits = [];
  for (let i = from; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith(`function ${name}(`) || t.startsWith(`async function ${name}(`)) hits.push(i);
  }
  return hits;
}
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
  }
  throw new Error(`unbalanced from line ${startIdx + 1}`);
}
const sameLines = (a, b) => a.length === b.length && a.every((l, i) => l === b[i]);

// ==========================================================
console.log(`== 断言1: 逐行等价（BASE=${BASE_REV} 原文切片 vs 工厂内函数体） ==`);
const baseLines = stripCr((await gitShow(BASE_REV, "src/main.jsx")).split("\n"));
const factoryLines = stripCr(readFileSync(FACTORY, "utf8").split("\n"));
const mainLines = stripCr(readFileSync(MAIN, "utf8").split("\n"));

let fStart = -1;
for (let i = 0; i < factoryLines.length; i++) {
  if (factoryLines[i].startsWith(`export function ${FACTORY_NAME}(deps) {`)) { fStart = i; break; }
}
if (fStart < 0) throw new Error(`工厂文件里找不到 ${FACTORY_NAME}`);
const fEnd = lineExtent(factoryLines, fStart);

const baseSlices = new Map();
const factorySlices = new Map();
for (const name of NAMES) {
  const bh = findDecl(baseLines, name);
  if (bh.length !== 1) { check(`identical:${name}`, false, `BASE 里命中 ${bh.length} 处定义`); continue; }
  const be = lineExtent(baseLines, bh[0]);
  const fh = findDecl(factoryLines, name, fStart).filter((i) => i < fEnd);
  if (fh.length !== 1) { check(`identical:${name}`, false, `工厂里命中 ${fh.length} 处定义`); continue; }
  const fe = lineExtent(factoryLines, fh[0]);
  const bSlice = baseLines.slice(bh[0], be + 1);
  const fSlice = factoryLines.slice(fh[0], fe + 1);
  baseSlices.set(name, bSlice);
  factorySlices.set(name, fSlice);
  check(
    `identical:${name}`,
    sameLines(bSlice, fSlice),
    `${bSlice.length} 行逐行比对${sameLines(bSlice, fSlice) ? "" : `，首个差异: BASE[${bSlice.findIndex((l, i) => l !== fSlice[i])}]`}`
  );
}

console.log("== 断言2: main.jsx 已搬空 ==");
for (const name of NAMES) {
  const hits = findDecl(mainLines, name);
  check(`moved-away:${name}`, hits.length === 0, hits.length ? `仍在第 ${hits.map((i) => i + 1).join(",")} 行定义` : "");
}
const shellHits = mainLines.filter((l) => l.includes(`= ${FACTORY_NAME}(resultDownloadDeps);`));
check("shell:exactly-one", shellHits.length === 1, `薄壳行数=${shellHits.length}`);

console.log("== 断言3: 调用契约不变 ==");
const returnLineRe = /^\s{4}(\w+),?$/u;
const returned = new Set();
for (let i = fEnd; i > fStart; i--) {
  if (factoryLines[i] === "  return {") {
    for (let k = i + 1; k < fEnd; k++) {
      const m = factoryLines[k].match(returnLineRe);
      if (!m) break;
      returned.add(m[1]);
    }
    break;
  }
}
const shellIdx = mainLines.findIndex((l) => l.includes(`= ${FACTORY_NAME}(resultDownloadDeps);`));
const destructured = shellIdx < 0 ? [] : mainLines[shellIdx]
  .replace(/^.*const \{/, "")
  .replace(/\}.*$/, "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
check("contract:return-covers-destructured", destructured.every((n) => returned.has(n)),
  `解构=${destructured.join(",")}`);
check("contract:destructured-list-exact",
  JSON.stringify(destructured) === JSON.stringify(EXPECTED_DESTRUCTURED),
  `实测=${JSON.stringify(destructured)}`);
check("contract:internal-only-not-destructured", INTERNAL_ONLY.every((n) => !destructured.includes(n)),
  `${INTERNAL_ONLY.join("/")} 仅工厂内互调`);
const missingUsage = destructured.filter((n) => mainLines.filter((l, i) => i !== shellIdx && l.includes(n)).length === 0);
check("contract:each-destructured-still-used", missingUsage.length === 0, missingUsage.join(","));
check("contract:blobFromImageItem-feeds-createDetailGroup",
  mainLines.some((l) => l.trim() === "blobFromImageItem,"),
  "createDetailGroup 的 deps 仍拿到它");
const importedPaths = factoryLines.filter((l) => /^\s*import\s/u.test(l) || (/^\s+[A-Za-z_$][\w$]*,?$/u.test(l) && l.includes(".") && l.includes('"')));
check("contract:factory-imports-no-main",
  importedPaths.every((l) => !l.includes("main.jsx")) && factoryLines.filter((l) => /^import\s/u.test(l)).every((l) => !l.includes("main")),
  `零反向依赖（工厂只 import shared/api）`);
check("contract:no-react-hook", !factoryLines.some((l) => /from\s+"react"/u.test(l) || /\buse[A-Z]\w*\(/u.test(l)), "符合 B3 形态");
const depsBlock = factoryLines.slice(fStart, fEnd).join("\n");
const missingDeps = EXPECTED_DEPS.filter((n) => !new RegExp(`^\\s+${n},?$`, "mu").test(depsBlock));
check("contract:deps-complete", missingDeps.length === 0, missingDeps.length ? `缺 ${missingDeps.join(",")}` : "12 项依赖全在解构里");

// ==========================================================
console.log("== 断言4: 真实执行（工厂本体 + BASE 抽取体对照） ==");
const timers = [];
const events = [];
const setCalls = [];
const noop = () => {};
const store = new Map();
globalThis.window = {
  setTimeout: (fn, ms) => { timers.push(ms); return timers.length; },
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
const savePayloads = [];
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => (savePayloads.length ? savePayloads.shift() : { ok: true, filename: "f1.png", directory: "D:/save" }),
  blob: async () => ({ type: "image/png", size: 4 })
});

const baseDeps = () => {
  const feedback = new Set();
  return {
    quickResults: [{ id: "r1", image: { type: "url", value: "https://x/1.png" } },
      { id: "r2", image: { type: "url", value: "https://x/2.png" } },
      { id: "r3", image: { type: "url", value: "https://x/3.png" } }],
    selectedIds: new Set(["r1", "r3"]),
    addEvent: (label, detail) => events.push(`${label}|${detail ?? ""}`),
    quickResultDragIdRef: { current: "" },
    QUICK_RESULT_DRAG_TYPE: "application/x-jingyin-quick-result",
    copyText: async (text, msg) => { events.push(`copyText|${text}|${msg}`); return true; },
    saveDirectory: "D:/save",
    refreshSaveDirectory: async () => "D:/save",
    setSaveDirectory: (v) => setCalls.push(["setSaveDirectory", v]),
    setDirectoryDraft: (v) => setCalls.push(["setDirectoryDraft", v]),
    setDownloadFeedbackIds: (fn) => { const next = fn(feedback); feedback.clear(); next.forEach((v) => feedback.add(v)); return next; },
    downloadFeedbackTimersRef: { current: new Map() },
    _feedback: feedback
  };
};

const { createResultDownload } = await import(pathToFileURL(FACTORY).href);
const api = createResultDownload(baseDeps());

// 4.1 拖拽下载文件名
{
  const a = api.resultDragDownloadName({ createdAt: 1700000000000 }, 0);
  const b = api.resultDragDownloadName({ createdAt: 1700000000000 }, 1);
  check("run:resultDragDownloadName-form", a.startsWith("静音AI绘画-") && /-\d{4}$/u.test(a), a);
  check("run:resultDragDownloadName-param-sensitive", a !== b, `序号随 fallbackIndex 变化: ${a} -> ${b}`);
  check("run:resultDragDownloadName-saved-first",
    api.resultDragDownloadName({ createdAt: 1700000000000, savedFilename: "saved.png" }, 5) === "saved.png",
    "已有 savedFilename 时优先返回它");
}
// 4.2 结果图拖拽
{
  const dep = baseDeps();
  const local = createResultDownload(dep);
  const data = new Map();
  const event = { dataTransfer: { setData: (k, v) => data.set(k, v), set effectAllowed(v) { this._ea = v; } }, stopPropagation() {} };
  local.beginResultImageDrag(event, { id: "r9", image: { type: "url", value: "https://x/9.png" } }, 2);
  check("run:beginResultImageDrag-downloadurl", data.has("DownloadURL"), [...data.keys()].join(","));
  check("run:beginResultImageDrag-result-id", data.get("application/x-jingyin-result-id") === "r9", String(data.get("application/x-jingyin-result-id")));
  check("run:beginResultImageDrag-ref-set", dep.quickResultDragIdRef.current === "r9", String(dep.quickResultDragIdRef.current));

  const dep2 = { ...baseDeps(), QUICK_RESULT_DRAG_TYPE: "application/zzz-other" };
  const local2 = createResultDownload(dep2);
  const data2 = new Map();
  const event2 = { dataTransfer: { setData: (k, v) => data2.set(k, v), set effectAllowed(v) {} }, stopPropagation() {} };
  local2.beginResultImageDrag(event2, { id: "r9", image: { type: "url", value: "https://x/9.png" } }, 2);
  check("run:beginResultImageDrag-type-param", data2.has("application/zzz-other") && !data2.has("application/x-jingyin-quick-result"),
    "QUICK_RESULT_DRAG_TYPE 走 deps，改了就变 ⇒ 不是写死常量");
}
// 4.3 参考图拖拽
{
  const data = new Map();
  const event = { dataTransfer: { setData: (k, v) => data.set(k, v), set effectAllowed(v) {} }, stopPropagation() {} };
  api.beginReferenceImageDrag(event, { localUrl: "https://x/ref.png", name: "我的参考图" }, 0);
  const url = data.get("DownloadURL") || "";
  check("run:beginReferenceImageDrag-name", url.includes("我的参考图"), url.slice(0, 80));
  const data2 = new Map();
  api.beginReferenceImageDrag({ dataTransfer: { setData: (k, v) => data2.set(k, v), set effectAllowed(v) {} }, stopPropagation() {} }, { localUrl: "https://x/ref2.png" }, 4);
  check("run:beginReferenceImageDrag-index-fallback", (data2.get("DownloadURL") || "").includes("参考图-5"), String(data2.get("DownloadURL") || "").slice(0, 80));
}
// 4.4 blob / 下载 / 自动保存
{
  const blob = await (async () => { try { return await api.blobFromImageItem({ image: { type: "url", value: "https://x/1.png" } }); } catch (e) { return `ERR:${e.message}`; } })();
  check("run:blobFromImageItem-fetch", blob && typeof blob === "object" && blob.type === "image/png", JSON.stringify(blob));
  let thrown = "";
  try { await api.blobFromImageItem({ image: null }); } catch (e) { thrown = e.message; }
  check("run:blobFromImageItem-invalid-src", thrown === "图片地址无效", thrown);

  const dep = baseDeps();
  const local = createResultDownload(dep);
  events.length = 0;
  savePayloads.push({ ok: true, filename: "shot.png", directory: "D:/save" });
  await local.downloadItem({ id: "r1", image: { type: "url", value: "https://x/1.png" } }, 0);
  check("run:downloadItem-event", events.some((e) => e.startsWith("下载|已保存到 shot.png")), events.join(" / "));
  check("run:downloadItem-sets-dir", setCalls.filter((c) => c[0] === "setSaveDirectory").length > 0, `${setCalls.length} 次 setter 调用`);
  check("run:downloadItem-flashes", dep._feedback.has("r1"), `反馈集合=[${[...dep._feedback].join(",")}]`);

  const dep2 = baseDeps();
  const local2 = createResultDownload(dep2);
  savePayloads.push({ ok: true, filename: "a.png", directory: "D:/save" }, { ok: true, filename: "b.png", directory: "D:/save" });
  const saved = await local2.autoSaveGeneratedItems([{ id: "a" }, { id: "b" }]);
  check("run:autoSaveGeneratedItems-count", saved === 2, `savedCount=${saved}`);
  const none = await local2.autoSaveGeneratedItems([]);
  check("run:autoSaveGeneratedItems-empty", none === 0, `savedCount=${none}`);
}
// 4.5 下载反馈时长 = 1300（main 侧口径，未被 outfit 的 1100 统一）
{
  timers.length = 0;
  const dep = baseDeps();
  const local = createResultDownload(dep);
  local.flashDownloadFeedback("r1");
  await new Promise((r) => setTimeout(r, 5));
  check("run:flashDownloadFeedback-1300ms", timers.includes(1300) && !timers.includes(1100), `setTimeout delays=[${timers.join(",")}]`);
  local.flashDownloadFeedback("");
  check("run:flashDownloadFeedback-guard", dep._feedback.size === 1, `空 id 不入反馈集合，size=${dep._feedback.size}`);
}
// 4.6 下载选中 / 下载全部的参数化
{
  const dep = baseDeps();
  const local = createResultDownload(dep);
  events.length = 0;
  await local.downloadSelected();
  check("run:downloadSelected-selected-count", events.some((e) => e === "下载选中|已提交 2 张保存任务"), events.join(" / "));
  const dep2 = { ...baseDeps(), selectedIds: new Set() };
  const local2 = createResultDownload(dep2);
  events.length = 0;
  const onlySelected = () => events.filter((e) => e.startsWith("下载选中|"));
  await local2.downloadSelected();
  check("run:downloadSelected-param-sensitive", onlySelected().length === 0, `空选中⇒不弹「下载选中」事件 (${onlySelected().length} 条)`);
  const dep3 = { ...baseDeps(), quickResults: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] };
  const local3 = createResultDownload(dep3);
  events.length = 0;
  await local3.downloadAll();
  check("run:downloadAll-count", events.some((e) => e === "下载全部|已提交 4 张保存任务"), events.join(" / "));
}
// 4.7 复制图片（剪贴板成功 / 退化为复制地址）
{
  const dep = baseDeps();
  const local = createResultDownload(dep);
  globalThis.navigator.clipboard = { write: async () => {} };
  globalThis.window.ClipboardItem = class { constructor(o) { this.o = o; } };
  events.length = 0;
  await local.copyImage({ image: { type: "url", value: "https://x/1.png" } });
  check("run:copyImage-clipboard", events.some((e) => e === "复制|图片已复制到剪贴板"), events.join(" / "));
  globalThis.navigator.clipboard = undefined;
  events.length = 0;
  await local.copyImage({ image: { type: "url", value: "https://x/1.png" } });
  check("run:copyImage-fallback-text", events.some((e) => e === "copyText|https://x/1.png|图片地址已复制"), events.join(" / "));
}
// 4.8 async 函数体：从 BASE 抽出独立执行，与工厂版输出对齐
{
  const slice = baseSlices.get("autoSaveGeneratedItems");
  const sliceText = slice.join("\n");
  const startsAtAsync = sliceText.trimStart().startsWith("async function autoSaveGeneratedItems(");
  check("async-extract:starts-at-async", startsAtAsync, slice[0].trim().slice(0, 46));
  // 反证：同样的函数体用普通 Function 构造会因内含 await 直接报语法错
  // ⇒ 必须用 Object.getPrototypeOf(async function(){}).constructor，且抽取起点要从 `async` 算起。
  let syncErr = "";
  try {
    new Function("items", sliceText.slice(sliceText.indexOf("{")));
  } catch (e) {
    syncErr = e.message;
  }
  check("async-extract:needs-async-constructor", syncErr.length > 0, syncErr.slice(0, 60));
  const body = sliceText.slice(sliceText.indexOf("{"));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fromBase = new AsyncFunction(
    "items", "fetch", "saveDirectory", "refreshSaveDirectory", "setSaveDirectory", "setDirectoryDraft", "addEvent",
    body
  );
  const rec = [];
  savePayloads.push({ ok: true, filename: "x.png", directory: "D:/x" }, { ok: true, filename: "y.png", directory: "D:/x" });
  const baseOut = await fromBase([{ id: "a" }, { id: "b" }], globalThis.fetch, "D:/x", async () => "D:/x",
    (v) => rec.push(["dir", v]), (v) => rec.push(["draft", v]), () => {});
  const depFac = baseDeps();
  const localFac = createResultDownload(depFac);
  savePayloads.push({ ok: true, filename: "x.png", directory: "D:/x" }, { ok: true, filename: "y.png", directory: "D:/x" });
  const factoryOut = await localFac.autoSaveGeneratedItems([{ id: "a" }, { id: "b" }]);
  check("async-extract:base-vs-factory", baseOut === factoryOut && baseOut === 2, `BASE=${baseOut} FACTORY=${factoryOut}`);
}

// ==========================================================
console.log("== 断言5: 负向对照（证明 harness 灵敏，不是恒真） ==");
// 5.1 比对器对改动敏感
{
  const name = "downloadItem";
  const perturbed = factorySlices.get(name).slice();
  perturbed[1] = `${perturbed[1]} `;
  check("neg:comparison-sensitive", !sameLines(baseSlices.get(name), perturbed), "改动 1 个字符即失配");
}
// 5.2 删掉一个 deps 解构项 ⇒ ESLint no-undef 必须点名
{
  const tmpFile = `${ROOT}/scripts/dev/__rf074a-negative-tmp.js`;
  const src = readFileSync(FACTORY, "utf8").split("\n");
  const dropIdx = src.findIndex((l) => l.trim() === "copyText,");
  const negative = [...src.slice(0, dropIdx), ...src.slice(dropIdx + 1)].join("\n");
  writeFileSync(tmpFile, negative, "utf8");
  try {
    const { ESLint } = await import(pathToFileURL(`${ROOT}/node_modules/eslint/lib/api.js`).href);
    const eslint = new ESLint();
    const ignored = await eslint.isPathIgnored(tmpFile);
    check("neg:tempfile-in-lint-scope", ignored === false, `isPathIgnored=${ignored}`);
    const [res] = await eslint.lintFiles([tmpFile]);
    const undefs = res.messages.filter((m) => m.ruleId === "no-undef" && m.message.includes("copyText"));
    check("neg:no-undef-hits", undefs.length > 0, `no-undef 命中 ${undefs.length} 条`);
  } finally {
    unlinkSync(tmpFile);
  }
}
// 5.3 deps 缺项 ⇒ 运行时必然抛错（证明该依赖真的被消费）
{
  const broken = { ...baseDeps() };
  delete broken.copyText;
  const local = createResultDownload(broken);
  globalThis.navigator.clipboard = undefined;
  let msg = "";
  await local.copyImage({ image: { type: "url", value: "https://x/1.png" } }).catch((e) => { msg = e.message; });
  check("neg:missing-dep-throws", /copyText/u.test(msg), msg || "(未抛错 ⇒ 依赖没被消费)");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n对照组结果: ${failed.length === 0 ? "ALL PASS" : `FAILURES=${failed.length}`} (共 ${results.length} 项)`);
if (failed.length) failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`));
process.exit(failed.length ? 1 : 0);
