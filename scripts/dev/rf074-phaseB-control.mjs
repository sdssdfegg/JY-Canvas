// RF-074 阶段 B 对照组：验证 createResultActions 的「逐字搬运 + 调用契约不变 + 依赖未写死」。
//
// 五路断言：
//   1) 等价性：工厂里 7 个导出函数 + 内部 removeDetailResultIds 的函数体
//      与 BASE(9d45283 = 阶段 A 提交) 的原文切片逐行相等（markResultImageBroken 含 5 行 JSDoc）；
//   2) 搬空：当前 main.jsx 已无这些 `function NAME(` 内联定义；
//   3) 契约：return 覆盖调用点解构清单；内部函数不导出、不在调用点解构；
//   4) 执行：真实工厂跑一遍（含两个分支、两条 async 链路），改入参必须改变输出；
//   5) 负向：①比对器对改动敏感 ②删一个 deps 解构项必须命中 ESLint no-undef
//            ③deps 缺项运行时必报错 ⇒ harness 不是恒真。
//
// ⚠ BASE 必须锁 9d45283（阶段 B 之前的提交）。写 HEAD 会因 HEAD 已搬空而全线 FAIL。
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const BASE_REV = "9d45283";
const MAIN = `${ROOT}/src/main.jsx`;
const FACTORY_REL = "src/features/result-queue/quick-result-replace.js";
const FACTORY = `${ROOT}/${FACTORY_REL}`;

const NAMES = [
  "toggleSelected",
  "clearSelection",
  "deleteSelected",
  "deleteResult",
  "markResultImageBroken",
  "removeDetailResultIds",
  "refreshHistory",
  "syncHistoryFromServer"
];
const RETURNED = NAMES.filter((n) => n !== "removeDetailResultIds");
const FACTORY_NAME = "createResultActions";
const EXPECTED_DEPS = [
  "setSelectedIds", "selectedIds", "activeView", "quickResults", "setResults",
  "setBrokenResultImages", "detailInfoSelection", "setDetailInfoSelection",
  "setDetailGroups", "removeHistoryResults", "loadHistoryResults",
  "hydrateDetailGroupsWithHistory", "addEvent"
];
const EXPECTED_DESTRUCTURED = [
  "toggleSelected", "deleteSelected", "deleteResult",
  "markResultImageBroken", "refreshHistory", "syncHistoryFromServer"
];
const INTERNAL_ONLY = ["removeDetailResultIds"];
const JSDOC_NAMES = ["markResultImageBroken"];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

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
  let bStart = bh[0];
  if (JSDOC_NAMES.includes(name)) {
    let jsStart = bStart;
    while (jsStart > 0) {
      const p = baseLines[jsStart - 1].trim();
      if (p.startsWith("*") || p.startsWith("/**")) jsStart--;
      else break;
    }
    bStart = jsStart;
  }
  const fh = findDecl(factoryLines, name, fStart).filter((i) => i < fEnd);
  if (fh.length !== 1) { check(`identical:${name}`, false, `工厂里命中 ${fh.length} 处定义`); continue; }
  const fe = lineExtent(factoryLines, fh[0]);
  let fSliceStart = fh[0];
  if (JSDOC_NAMES.includes(name)) {
    let jsStart = fSliceStart;
    while (jsStart > 0) {
      const p = factoryLines[jsStart - 1].trim();
      if (p.startsWith("*") || p.startsWith("/**")) jsStart--;
      else break;
    }
    fSliceStart = jsStart;
  }
  const bSlice = baseLines.slice(bStart, be + 1);
  const fSlice = factoryLines.slice(fSliceStart, fe + 1);
  baseSlices.set(name, bSlice);
  factorySlices.set(name, fSlice);
  const diff = bSlice.findIndex((l, i) => l !== fSlice[i]);
  check(`identical:${name}`, sameLines(bSlice, fSlice),
    `${bSlice.length} 行（含 JSDoc ${JSDOC_NAMES.includes(name) ? 5 : 0} 行）${diff >= 0 ? `，首个差异行=${diff}` : ""}`);
}

console.log("== 断言2: main.jsx 已搬空 ==");
for (const name of NAMES) {
  const hits = findDecl(mainLines, name);
  check(`moved-away:${name}`, hits.length === 0, hits.length ? `仍在第 ${hits.map((i) => i + 1).join(",")} 行` : "");
}
check("shell:exactly-one", mainLines.filter((l) => l.includes(`= ${FACTORY_NAME}(resultActionsDeps);`)).length === 1, "");

console.log("== 断言3: 调用契约不变 ==");
const returned = new Set();
for (let i = fEnd; i > fStart; i--) {
  if (factoryLines[i] === "  return {") {
    for (let k = i + 1; k < fEnd; k++) {
      const m = factoryLines[k].match(/^\s{4}(\w+),?$/u);
      if (!m) break;
      returned.add(m[1]);
    }
    break;
  }
}
const shellIdx = mainLines.findIndex((l) => l.includes(`= ${FACTORY_NAME}(resultActionsDeps);`));
const destructured = shellIdx < 0 ? [] : mainLines[shellIdx]
  .replace(/^.*const \{/u, "")
  .replace(/\}.*$/u, "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
check("contract:return-covers-destructured", destructured.every((n) => returned.has(n)), `解构=${destructured.join(",")}`);
check("contract:destructured-list-exact", JSON.stringify(destructured) === JSON.stringify(EXPECTED_DESTRUCTURED), `实测=${JSON.stringify(destructured)}`);
check("contract:internal-not-exported", INTERNAL_ONLY.every((n) => !returned.has(n)), "removeDetailResultIds 不进 return");
check("contract:internal-not-destructured", INTERNAL_ONLY.every((n) => !destructured.includes(n)), "调用点不解构它");
const unused = destructured.filter((n) => mainLines.filter((l, i) => i !== shellIdx && l.includes(n)).length === 0);
check("contract:each-destructured-still-used", unused.length === 0, unused.join(","));
const depsBlock = factoryLines.slice(fStart, fEnd).join("\n");
const missingDeps = EXPECTED_DEPS.filter((n) => !new RegExp(`^\\s+${n},?$`, "mu").test(depsBlock));
check("contract:deps-complete", missingDeps.length === 0, missingDeps.length ? `缺 ${missingDeps.join(",")}` : "13 项依赖全在解构里");
check("contract:factory-imports-no-main", factoryLines.filter((l) => /^import\s/u.test(l)).every((l) => !l.includes("main")), "零反向依赖");
check("contract:no-react-hook", !factoryLines.some((l) => /from\s+"react"/u.test(l) || /\buse[A-Z]\w*\(/u.test(l)), "符合 B3 形态");

// ==========================================================
console.log("== 断言4: 真实执行 ==");
const noop = () => {};
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: noop,
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: "http://localhost/" },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  devicePixelRatio: 1
};
Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node" }, configurable: true, writable: true });
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }), blob: async () => ({ type: "image/png" }) });

const makeHarness = (over = {}) => {
  const log = { events: [], historyRemoved: [], setDetailInfoSelection: [] };
  const state = {
    selected: new Set(over.selectedIds ?? ["r1", "r3"]),
    results: over.results ?? [{ id: "r1" }, { id: "r2" }, { id: "r3" }],
    broken: { r1: { src: "https://x/1.png", reason: "旧原因" } },
    groups: over.groups ?? [
      { id: "g1", prompts: [{ results: [{ id: "r1" }, { id: "r2" }] }, { results: [] }] },
      { id: "g2", prompts: [{ results: [{ id: "r3" }] }] }
    ]
  };
  const apply = (fn, value) => (typeof fn === "function" ? fn(value) : fn);
  return {
    log,
    state,
    deps: {
      setSelectedIds: (fn) => { state.selected = apply(fn, state.selected); return state.selected; },
      selectedIds: state.selected,
      activeView: over.activeView ?? "quickgen",
      quickResults: over.quickResults ?? state.results,
      setResults: (fn) => { state.results = apply(fn, state.results); return state.results; },
      setBrokenResultImages: (fn) => { state.broken = apply(fn, state.broken); return state.broken; },
      detailInfoSelection: over.detailInfoSelection ?? null,
      setDetailInfoSelection: (v) => { log.setDetailInfoSelection.push(v); return v; },
      setDetailGroups: (fn) => { state.groups = apply(fn, state.groups); return state.groups; },
      removeHistoryResults: async (ids) => { log.historyRemoved.push(ids); },
      loadHistoryResults: async () => over.stored ?? [{ id: "h1" }, { id: "h2" }, { id: "h3" }],
      hydrateDetailGroupsWithHistory: (current, stored) => [`hydrated:${current.length}+${stored.length}`],
      addEvent: (label, detail) => log.events.push(`${label}|${detail ?? ""}`),
      ...(over.deps ?? {})
    }
  };
};

const { createResultActions, createResultDownload } = await import(pathToFileURL(FACTORY).href);
check("module:both-factories-exported", typeof createResultActions === "function" && typeof createResultDownload === "function", "两阶段工厂同文件共存");

// 4.1 勾选
{
  const h = makeHarness({ selectedIds: [] });
  const api = createResultActions(h.deps);
  api.toggleSelected("r1");
  check("run:toggleSelected-add", h.state.selected.has("r1"), [...h.state.selected].join(","));
  api.toggleSelected("r1");
  check("run:toggleSelected-remove", !h.state.selected.has("r1"), "再点一次取消勾选");
  api.toggleSelected("r5");
  const api2 = createResultActions({ ...h.deps, selectedIds: h.state.selected });
  api2.clearSelection();
  check("run:clearSelection", h.state.selected.size === 0, `size=${h.state.selected.size}`);
}
// 4.2 删除选中（quickgen 分支）
{
  const h = makeHarness();
  const api = createResultActions(h.deps);
  api.deleteSelected();
  check("run:deleteSelected-results", h.state.results.map((r) => r.id).join(",") === "r2", h.state.results.map((r) => r.id).join(",") || "(空)");
  check("run:deleteSelected-event", h.log.events.includes("删除|已删除 2 张图片"), h.log.events.join(" / "));
  check("run:deleteSelected-history", JSON.stringify(h.log.historyRemoved) === JSON.stringify([["r1", "r3"]]), JSON.stringify(h.log.historyRemoved));
  check("run:deleteSelected-detailgroups", JSON.stringify(h.state.groups) === JSON.stringify([
    { id: "g1", prompts: [{ results: [{ id: "r2" }] }, { results: [] }] },
    { id: "g2", prompts: [{ results: [] }] }
  ]), JSON.stringify(h.state.groups).slice(0, 120));
  check("run:deleteSelected-clears-selection", h.state.selected.size === 0, `size=${h.state.selected.size}`);
}
// 4.3 删除选中 —— 两条兜底分支的参数化
{
  const hEmpty = makeHarness({ selectedIds: [] });
  createResultActions(hEmpty.deps).deleteSelected();
  check("run:deleteSelected-empty-noop", hEmpty.log.events.length === 0 && hEmpty.state.results.length === 3, "空选中直接 return");

  const hRef = makeHarness({ activeView: "reference-remix", selectedIds: ["r1", "zz"], quickResults: [{ id: "r1" }] });
  createResultActions(hRef.deps).deleteSelected();
  check("run:deleteSelected-remix-branch", JSON.stringify(hRef.log.historyRemoved) === JSON.stringify([["r1", "zz"]]),
    `reference-remix 直接按 selection 全集删除: ${JSON.stringify(hRef.log.historyRemoved)}`);

  const hQg = makeHarness({ activeView: "quickgen", selectedIds: ["r1", "zz"], quickResults: [{ id: "r1" }] });
  createResultActions(hQg.deps).deleteSelected();
  check("run:deleteSelected-quickgen-branch", JSON.stringify(hQg.log.historyRemoved) === JSON.stringify([["r1"]]),
    `quickgen 会被 quickResults 过滤掉不存在的结果: ${JSON.stringify(hQg.log.historyRemoved)} ⇒ 分支未被统一`);
}
// 4.4 删除单张
{
  const h = makeHarness({ detailInfoSelection: { resultId: "r1" } });
  const api = createResultActions(h.deps);
  api.deleteResult("r1");
  check("run:deleteResult-results", !h.state.results.some((r) => r.id === "r1"), h.state.results.map((r) => r.id).join(","));
  check("run:deleteResult-broken-cleared", !("r1" in h.state.broken), Object.keys(h.state.broken).join(",") || "(空)");
  check("run:deleteResult-deselect", !h.state.selected.has("r1"), [...h.state.selected].join(","));
  check("run:deleteResult-closes-preview-when-current", h.log.setDetailInfoSelection.includes(null) && h.log.setDetailInfoSelection.length === 1, JSON.stringify(h.log.setDetailInfoSelection));

  const h2 = makeHarness({ detailInfoSelection: { resultId: "r9" } });
  createResultActions(h2.deps).deleteResult("r1");
  check("run:deleteResult-keeps-preview-when-other", h2.log.setDetailInfoSelection.length === 0, "删的不是当前预览图⇒不清空");
  check("run:deleteResult-event", h2.log.events.includes("删除|已删除当前图片"), h2.log.events.join(" / "));
}
// 4.5 缺图自愈
{
  const fresh = makeHarness();
  fresh.state.broken = {};
  const api = createResultActions(fresh.deps);
  api.markResultImageBroken({ id: "r1", image: { type: "url", value: "https://x/1.png" } });
  const first = fresh.state.broken.r1;
  check("run:markResultImageBroken-records", Boolean(first?.reason) && first.src === "https://x/1.png", JSON.stringify(first));
  api.markResultImageBroken({ id: "r1", image: { type: "url", value: "https://x/1.png" } });
  check("run:markResultImageBroken-idempotent", fresh.state.broken.r1 === first, "同一地址重复上报⇒返回原对象，不重渲染");
  api.markResultImageBroken({ id: "r1", image: { type: "url", value: "https://x/2.png" } });
  check("run:markResultImageBroken-new-src", fresh.state.broken.r1 !== first && fresh.state.broken.r1.src === "https://x/2.png", "换图后旧记录失效");
  const hNoSrc = makeHarness();
  const before = hNoSrc.state.broken;
  createResultActions(hNoSrc.deps).markResultImageBroken({ id: "r1", image: null });
  check("run:markResultImageBroken-guard", hNoSrc.state.broken === before, "无有效地址⇒不动状态");
}
// 4.6 历史刷新 / 生成后同步
{
  const h = makeHarness();
  const api = createResultActions(h.deps);
  await api.refreshHistory();
  check("run:refreshHistory-results", h.state.results.length === 3, `setResults 载入 ${h.state.results.length} 条`);
  check("run:refreshHistory-hydrate", JSON.stringify(h.state.groups) === JSON.stringify(["hydrated:2+3"]), JSON.stringify(h.state.groups));
  check("run:refreshHistory-event", h.log.events.includes("刷新|已载入 3 张历史图片"), h.log.events.join(" / "));
  check("run:refreshHistory-clears-selection", h.state.selected.size === 0, `size=${h.state.selected.size}`);

  const h2 = makeHarness();
  const api2 = createResultActions(h2.deps);
  await api2.syncHistoryFromServer();
  check("run:syncHistoryFromServer-silent", h2.log.events.length === 0, `不弹任何事件 (${h2.log.events.length} 条)`);
  check("run:syncHistoryFromServer-applies", h2.state.results.length === 3 && JSON.stringify(h2.state.groups) === JSON.stringify(["hydrated:2+3"]), JSON.stringify(h2.state.groups));
}
// 4.7 async 抽取：BASE 版 refreshHistory 独立执行 ⇒ 与工厂版输出一致
{
  const slice = baseSlices.get("refreshHistory");
  const sliceText = slice.join("\n");
  check("async-extract:starts-at-async", sliceText.trimStart().startsWith("async function refreshHistory("), slice[0].trim());
  let syncErr = "";
  try { new Function("items", sliceText.slice(sliceText.indexOf("{"))); } catch (e) { syncErr = e.message; }
  check("async-extract:needs-async-constructor", syncErr.length > 0, syncErr.slice(0, 48));
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fromBase = new AsyncFunction(
    "loadHistoryResults", "setResults", "setDetailGroups",
    "hydrateDetailGroupsWithHistory", "clearSelection", "addEvent",
    sliceText.slice(sliceText.indexOf("{"))
  );
  const baseLog = [];
  let baseResults = [];
  let baseGroups = [];
  await fromBase(
    async () => [{ id: "h1" }, { id: "h2" }],
    (v) => { baseResults = v; return v; },
    (fn) => { baseGroups = fn([{ g: 1 }]); return baseGroups; },
    (current, stored) => [`hydrated:${current.length}+${stored.length}`],
    () => baseLog.push("clearSelection"),
    (label, detail) => baseLog.push(`${label}|${detail}`)
  );
  const h = makeHarness({ stored: [{ id: "h1" }, { id: "h2" }], groups: [{ g: 1 }] });
  await createResultActions(h.deps).refreshHistory();
  check("async-extract:base-vs-factory",
    JSON.stringify(baseResults) === JSON.stringify(h.state.results)
    && JSON.stringify(baseGroups) === JSON.stringify(h.state.groups)
    && baseLog[baseLog.length - 1] === h.log.events[h.log.events.length - 1],
    `BASE=${baseLog.join(",")} FACTORY=${h.log.events.join(",")}`);
}

// ==========================================================
console.log("== 断言5: 负向对照 ==");
{
  const name = "deleteSelected";
  const perturbed = factorySlices.get(name).slice();
  perturbed[0] = `${perturbed[0]} `;
  check("neg:comparison-sensitive", !sameLines(baseSlices.get(name), perturbed), "改动 1 个字符即失配");
}
{
  const tmpFile = `${ROOT}/scripts/dev/__rf074b-negative-tmp.js`;
  const src = readFileSync(FACTORY, "utf8").split("\n");
  let hit = 0;
  const kept = src.filter((l) => {
    if (l.trim() === "hydrateDetailGroupsWithHistory," && hit === 0) { hit = 1; return false; }
    return true;
  });
  writeFileSync(tmpFile, kept.join("\n"), "utf8");
  try {
    const { ESLint } = await import(pathToFileURL(`${ROOT}/node_modules/eslint/lib/api.js`).href);
    const eslint = new ESLint();
    const ignored = await eslint.isPathIgnored(tmpFile);
    check("neg:tempfile-in-lint-scope", ignored === false, `isPathIgnored=${ignored}`);
    const [res] = await eslint.lintFiles([tmpFile]);
    const undefs = res.messages.filter((m) => m.ruleId === "no-undef" && m.message.includes("hydrateDetailGroupsWithHistory"));
    check("neg:no-undef-hits", undefs.length > 0, `no-undef 命中 ${undefs.length} 条`);
  } finally {
    unlinkSync(tmpFile);
  }
}
{
  const h = makeHarness();
  const broken = { ...h.deps };
  delete broken.setDetailGroups;
  let msg = "";
  await createResultActions(broken).refreshHistory().catch((e) => { msg = e.message; });
  check("neg:missing-dep-throws", /setDetailGroups/u.test(msg), msg || "(未抛错 ⇒ 依赖没被消费)");
}

const failed = results.filter((r) => !r.ok);
console.log(`\n对照组结果: ${failed.length === 0 ? "ALL PASS" : `FAILURES=${failed.length}`} (共 ${results.length} 项)`);
if (failed.length) failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`));
process.exit(failed.length ? 1 : 0);
