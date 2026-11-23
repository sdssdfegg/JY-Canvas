// V218 P2：一键详情工程线 P0/P1 固化门禁（运行时断言 + 静态锚点 + 负向对照 + 基线棘轮）。
//
// 这是 V218 工程线第一批最后一道门禁，把 P0（生成链路健壮性）与 P1（持久化护栏 / 通用会话态契约）
// 的修复从「人工复核探针」升级为「可重复执行的回归门禁」。分三层：
//   ① 运行时层：用 Vite 虚拟模块 mock React hooks，真实驱动 useDetailState 内部状态机——
//      并发连点只发一轮请求（in-flight 锁）、abort 后 detailStatus/prompt.status 复位且不留 generating、
//      catch 路径触发 2400ms 历史补拉；并用 fetch 探针证明 postForm 不传 options 时逐字节等价。
//   ② 静态锚点层：超时阈值 >= 服务端 + 30s、三必保锚点、prompt 白名单键集、数据边界、不落盘。
//   ③ 负向对照层：判定谓词喂合成坏数据必须判红，证明断言不是永真（≥2 条）。
//
// 口径照搬 detail-v2-planning-chain-check：存量记账、新增判红、stale 判红、--update --reason。
// 首次上线 items: []（存量 0）。零上游、零 KEY、不碰 ROOT/data，进 --fast 快速子集。
//
// 注意：hook 状态机靠 mock 的 useState/useRef 槽位驱动，槽位顺序取自当前 HEAD 的
// useDetailState 解构顺序（23 槽）；若将来重排 hook，本门禁会如实判红，需同步校正 preset。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { createServer } from "vite";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "verify", "detail-v2-engineering-chain-baseline.json");
const AS_JSON = process.argv.includes("--json");
const UPDATE = process.argv.includes("--update");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
// 所有源码切片探针配 >=0 守卫：锚点搬家会如实判红，不会静默变成假绿。
const has = (source, needle) => typeof source === "string" && source.indexOf(needle) >= 0;
const countOf = (source, needle) => source.split(needle).length - 1;

const checks = [];
let singleCount = 0;
let doubleCount = 0;
const push = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: String(detail || "") });
function check(name, fn) {
  try { fn(); push(name, true); }
  catch (error) { push(name, false, String(error?.message || error).slice(0, 180)); }
}

// mock React hooks：把 useState/useRef 变成可控槽位，useEffect 收集不执行、useMemo/useCallback 直调。
// 暴露 globalThis.__v218Mock 供门禁注入初始 state 与读取终态。
const REACT_MOCK = [
  "let states = [];",
  "let idx = 0;",
  "globalThis.__v218Mock = {",
  "  setPreset(p) { states = p.slice(); idx = 0; },",
  "  idx() { return idx; },",
  "  get(i) { return states[i]; }",
  "};",
  "export function useState(init) {",
  "  const i = idx++;",
  "  if (!(i in states)) states[i] = typeof init === 'function' ? init() : init;",
  "  return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }];",
  "}",
  "export function useRef(init) {",
  "  const i = idx++;",
  "  if (!(i in states)) states[i] = { current: init };",
  "  return states[i];",
  "}",
  "export function useMemo(fn) { return fn(); }",
  "export function useEffect() {}",
  "export function useCallback(fn) { return fn; }",
  "export default { useState, useRef, useMemo, useEffect, useCallback };"
].join("\n");

const mockPlugin = {
  name: "v218-engineering-react-mock",
  enforce: "pre",
  resolveId(id) { if (id === "react") return "\0v218-react-mock"; return null; },
  load(id) { if (id === "\0v218-react-mock") return REACT_MOCK; return null; }
};

async function main() {
  // ───────────────────────────── 静态锚点层 ─────────────────────────────
  const state = read("src/features/detail/detail-state.js");
  const group = read("src/features/detail/detail-group.js");
  const client = read("src/api/client.js");
  const images = read("src/api/images.js");
  const view = read("src/features/detail/DetailView.jsx");
  const runtimeConfig = read("server/core/runtime-config.js");
  const seedText = read("seed/manifest.json");

  push("S1 证据源文件非空（防清空文件造成假绿）",
    [state, group, client, images, view, runtimeConfig, seedText].every((text) => text.length > 100),
    [state, group, client, images, view, runtimeConfig, seedText].map((text) => text.length).join("/"));

  // P0 静态锚点：超时阈值、abort 归一、finally 复位、in-flight 锁、历史补拉、planning 重入门禁。
  const timeoutMatch = /const DETAIL_IMAGE_TIMEOUT_MS = (\d+);/.exec(state);
  const serverMatch = /IMAGE_REQUEST_TIMEOUT_MS \|\| "(\d+)"/.exec(runtimeConfig);
  const frontTimeout = timeoutMatch ? Number(timeoutMatch[1]) : -1;
  const serverTimeout = serverMatch ? Number(serverMatch[1]) : -1;
  push("S2 前端超时常量已取到", timeoutMatch !== null, "实测 " + frontTimeout);
  push("S3 服务端超时常量已取到", serverMatch !== null, "实测 " + serverTimeout);
  push("S4 前端阈值 >= 服务端 + 30s 缓冲（不误杀长任务）",
    frontTimeout > 0 && serverTimeout > 0 && frontTimeout >= serverTimeout + 30000,
    "前端 " + frontTimeout + " / 服务端 " + serverTimeout + " / 差 " + (frontTimeout - serverTimeout));
  push("S5 复用 AbortController + 定时器（未新造第二套）",
    has(state, "new AbortController()") && has(state, "controller.abort()") && has(state, "window.clearTimeout(timer)"));
  push("S6 AbortError 归一（name 与 cause.name 双认）",
    has(state, 'err?.name === "AbortError"') && has(state, 'err?.cause?.name === "AbortError"'));
  push("S7 超时文案可读且提示勿重复提交",
    has(state, "可能网络僵死") && has(state, "切勿重复提交造成二次扣费"));
  push("S8 generateDetailPrompt finally 强制 idle 复位",
    has(state, "if (!settled)") && has(state, 'status: "idle"'));
  push("S9 in-flight 锁入口判断 + finally 释放",
    has(state, "if (detailGroupInFlightRef.current) return;") && has(state, "detailGroupInFlightRef.current = false;"));
  push("S10 Promise.allSettled 外包 finally 复位 detailStatus/group.status",
    has(state, "await Promise.allSettled(") && has(state, 'current === "generating" ? "ready" : current'));
  push("S11 planning 重入门禁 + finally 不留死值",
    has(state, 'if (detailStatus === "planning") return;') && has(state, 'current === "planning" ? "idle" : current'));
  push("S12 catch 与成功路径均有 2400ms 历史补拉（>=3 处）",
    countOf(state, "2400") >= 3, "实测 " + countOf(state, "2400") + " 处");
  push("S13 批量按钮 disabled 已加、单屏按钮保持",
    has(view, 'disabled={detailRunningCount > 0 || detailStatus === "generating"}') && has(view, 'disabled={prompt.status === "running"}'));
  push("S14 postForm 第 4 参可选 signal 透传、apiJson 其它分支未动",
    has(client, "postForm(url, form, fallbackMessage = \"请求失败\", options = {})") && has(client, "...(options.signal ? { signal: options.signal } : {})"));
  push("S15 generateImages 可选 options 透传",
    has(images, "generateImages(form, options = {})") && has(images, "postForm(\"/api/images\", form, \"图片生成失败\", options)"));

  // 三必保锚点（漏一个即撞既有门禁）。
  push("S16 必保锚点 selectedSections 条件注入仍在",
    has(state, "...(sectionPayload ? { selectedSections: sectionPayload } : {})"));
  push("S17 必保锚点 detailSkillVersion/stylePackId 归一仍在",
    has(state, 'detailSkillVersion: "v1"') && has(state, 'stylePackId: "auto"'));
  push("S18 必保锚点 stylePackId off/S1-S8 归一仍在",
    has(group, 'next.stylePackId === "off" || /^S[1-8]$/') || has(group, 'stylePackId === "off" || /^S[1-8]$/'));

  // P1 静态锚点：白名单键集、会话态契约、数据边界、不落盘、无专业 schema。
  const keyBlock = /const DETAIL_PROMPT_STORAGE_KEYS = \[([\s\S]*?)\];/.exec(group);
  const promptKeys = keyBlock ? [...keyBlock[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]) : [];
  // V2-COUNT-MODE：新增 shouldGenerate/isEmptyScreen 两键（19→21），供跳过空屏跨刷新保留。
  // 手动分屏：新增 source 键（21→22），标记分屏来自用户自建还是 AI 策划。
  push("S19 prompt 白名单 22 键已取到", promptKeys.length === 22, "实测 " + promptKeys.length + " 键");
  push("S20 prompt 白名单无重复键", new Set(promptKeys).size === promptKeys.length);
  const forbiddenSchema = ["narrative:", "screenRoles:", "dedupLog:", "visualDna:", "mustNotClaim:", "confidence:"];
  push("S21 未定义任何 planning 内部专业 schema",
    forbiddenSchema.every((needle) => !has(state, needle)), forbiddenSchema.filter((n) => has(state, n)).join(",") || "(无)");
  push("S22 切组清空会话态（不串组）",
    has(state, "detailPlanningContext.groupId !== activeDetailGroupId") && has(state, "setDetailPlanningContext(null)"));
  push("S23 会话态不进任何持久化路径", (() => {
    const writes = [...state.matchAll(/writeJsonStorage\([^)]*\)/g)].map((m) => m[0]);
    return writes.length > 0 && writes.every((w) => !/planning/i.test(w));
  })());
  push("S24 两个 localStorage 键写入源未变",
    has(state, "writeJsonStorage(DETAIL_PRESETS_KEY, detailPresets)") && has(state, "writeJsonStorage(DETAIL_GROUPS_KEY, sanitizeDetailGroupsForStorage(detailGroups))"));
  push("S25 种子零 V2 中间态 / Skill marker",
    !has(seedText, "planningContext") && !has(seedText, "JINGYIN_DETAIL_V2_PLANNING_SKILL"));
  push("S26 未新增第二套模型调用/端点",
    countOf(client, "await fetch(") === 1 && !has(view, "quality-check") && !has(view, "replan"));

  // ───────────────────────────── 运行时层 ─────────────────────────────
  // 浏览器垫片：client.js 用 window.location / FormData / performance，诊断安装需跳过。
  const fetchCalls = [];
  const timers = [];
  let fetchMode = "success";
  let historyPulls = 0;
  globalThis.window = {
    location: { origin: "http://127.0.0.1:8787", href: "http://127.0.0.1:8787/" },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
    addEventListener: () => {},
    __jingyinClientDiagnosticsInstalled: true
  };
  globalThis.localStorage = {
    _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }
  };
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    if (fetchMode === "abort") { const err = new Error("aborted"); err.name = "AbortError"; throw err; }
    return {
      ok: true, status: 200, headers: { get: () => "application/json" },
      json: async () => ({ ok: true, images: [{ url: "blob:x" }] }),
      text: async () => JSON.stringify({ ok: true, images: [{ url: "blob:x" }] }),
      clone() { return this; }
    };
  };

  const server = await createServer({
    root: ROOT, server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error",
    plugins: [mockPlugin], ssr: { noExternal: ["react"] }
  });
  try {
    const { postForm } = await import(pathToFileURL(path.join(ROOT, "src/api/client.js")).href);
    const { generateImages } = await import(pathToFileURL(path.join(ROOT, "src/api/images.js")).href);
    // 以别名调用：ssrLoadModule 加载的是 mock hooks 后的普通函数，不是真 React hook，
    // 借 useDetailState 之名会触发 react-hooks/rules-of-hooks 误判，用别名明确其普通函数身份。
    const { useDetailState: invokeDetailState } = await server.ssrLoadModule("/src/features/detail/detail-state.js");
    const { sanitizeDetailGroupsForStorage, normalizeDetailSettings } = await server.ssrLoadModule("/src/features/detail/detail-group.js");
    const ctxApi = await server.ssrLoadModule("/src/features/detail/detail-state.js");

    // ── ⑦ postForm parity（fetch 探针：不传 options 时键集合恰为 method/body/headers）──
    const formOf = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
    fetchCalls.length = 0;
    await postForm("/api/images", formOf({ prompt: "x" }), "图片生成失败");
    const parityCall = fetchCalls.find((c) => c.url === "/api/images");
    check("R1 postForm 不传 options 时 fetch 配置键集合恰为 body/headers/method（逐字节等价）", () => {
      const keys = Object.keys(parityCall.init).sort();
      if (JSON.stringify(keys) !== JSON.stringify(["body", "headers", "method"])) throw new Error("键集合漂移: " + keys.join(","));
      if ("signal" in parityCall.init) throw new Error("不传 options 却出现 signal");
      if (!parityCall.init.headers["X-Jingyin-Client-Request-Id"]) throw new Error("诊断头丢失");
    });
    fetchCalls.length = 0;
    const ctrl = new AbortController();
    await postForm("/api/images", formOf({ prompt: "y" }), "图片生成失败", { signal: ctrl.signal });
    check("R2 传 options.signal 时 fetch 拿到同一个 signal 且其它键不变", () => {
      const c = fetchCalls.find((item) => item.url === "/api/images");
      if (c.init.signal !== ctrl.signal) throw new Error("signal 未透传");
      if (c.init.method !== "POST" || !c.init.headers["X-Jingyin-Client-Request-Id"]) throw new Error("其它键被改");
    });
    fetchCalls.length = 0;
    await generateImages(formOf({ prompt: "z" }));
    check("R3 generateImages 不传第二参无 signal（其它板块零影响）", () => {
      const c = fetchCalls.find((item) => item.url === "/api/images");
      if ("signal" in c.init) throw new Error("其它板块被波及");
    });
    const c2 = new AbortController();
    fetchCalls.length = 0;
    await generateImages(formOf({ prompt: "w" }), { signal: c2.signal });
    check("R4 generateImages 第二参透传 signal", () => {
      if (fetchCalls.find((item) => item.url === "/api/images").init.signal !== c2.signal) throw new Error("未透传");
    });

    // ── ④⑤ 白名单清洗与会话态契约（真实调用纯函数）──
    check("R5 normalizeDetailSettings 22 键白名单未回退", () => {
      const app = read("src/shared/app-defaults.js");
      const dm = /detailDefaults\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(app);
      const n = dm ? [...dm[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].length : 0;
      const normalized = normalizeDetailSettings({ planning: 1, evil: 1, lang: "en" });
      if (Object.keys(normalized).length !== n) throw new Error("白名单键数漂移：实测 " + Object.keys(normalized).length + " / 期望 " + n);
      if (normalized.lang !== "en" || "planning" in normalized) throw new Error("既有键丢失或未知键残留");
    });

    check("R6 prompt 层未知键被剥离、19 键保留、results 清洗、slice(0,20)", () => {
      const dirty = {
        ...Object.fromEntries(promptKeys.map((k) => [k, k === "screen" ? 1 : (k === "results" ? [{ id: "r1", image: { url: "blob:x" } }] : "v-" + k)])),
        planning: { screens: [] }, planningContext: { instruction: "x" },
        JINGYIN_DETAIL_V2_PLANNING_SKILL: "marker", evilKey: 1
      };
      const out = sanitizeDetailGroupsForStorage([{ id: "g1", params: {}, prompts: [dirty] }]);
      const p = out[0].prompts[0];
      for (const bad of ["planning", "planningContext", "JINGYIN_DETAIL_V2_PLANNING_SKILL", "evilKey"]) {
        if (bad in p) throw new Error("未知键未剥离: " + bad);
      }
      for (const k of promptKeys) if (!(k in p)) throw new Error("既有键丢失: " + k);
      if (!Array.isArray(p.results) || p.results.length !== 1) throw new Error("results 清洗异常");
      const many = sanitizeDetailGroupsForStorage(Array.from({ length: 25 }, (_, i) => ({ id: "g" + i, params: {}, prompts: [] })));
      if (many.length !== 20) throw new Error("slice(0,20) 失效: " + many.length);
      if (JSON.stringify(out).includes("planningContext") || JSON.stringify(out).includes("evilKey")) throw new Error("序列化残留脏键");
    });

    check("R7 通用会话态 shape/version/groupId/空槽/序列化边界", () => {
      if (ctxApi.DETAIL_PLANNING_CONTEXT_VERSION !== 1) throw new Error("version 非 1");
      const ctx = ctxApi.createEmptyPlanningContext({ marker: "p" }, "g-1");
      const expected = ["groupId", "history", "instruction", "planning", "screens", "version"].sort();
      if (JSON.stringify(Object.keys(ctx).sort()) !== JSON.stringify(expected)) throw new Error("shape 错: " + Object.keys(ctx).join(","));
      if (ctx.groupId !== "g-1" || ctx.planning.marker !== "p") throw new Error("planning/groupId 写入错");
      if (ctx.screens.length || ctx.instruction !== "" || ctx.history.length) throw new Error("空槽被填");
      const s = ctxApi.serializePlanningContext({ ...ctx, evil: 1, planningContext: { a: 1 } });
      if ("evil" in s || "planningContext" in s) throw new Error("序列化未剥离未知键");
      if (JSON.stringify(Object.keys(s).sort()) !== JSON.stringify(expected)) throw new Error("序列化 shape 错");
    });

    // ── ①③② hook 运行时：并发连点锁 / abort 复位 / catch 补拉 ──
    const noop = () => {};
    const deps = {
      settings: { apiKey: "sk-test", baseUrl: "http://x", model: "m", channelId: "", lang: "中文" },
      config: { hasServerKey: false, defaultBaseUrl: "http://x", routing: {} },
      models: [{ value: "m", label: "M", ratios: ["1:1", "3:4", "16:9"] }],
      setResults: noop, addEvent: noop, setError: noop, setIsSettingsOpen: noop, updateSetting: noop,
      setActiveView: noop, selectedIds: new Set(), downloadItem: noop, blobFromImageItem: noop,
      saveDirectory: noop, refreshSaveDirectory: noop, setSaveDirectory: noop, setDirectoryDraft: noop,
      setContextMenu: noop, setReferenceContextMenu: noop, clampCount: (n) => Number(n) || 1,
      makeResultId: () => "r" + Math.random().toString(36).slice(2),
      normalizeGenerationErrorMessage: (e) => String(e?.message || e),
      DETAIL_ANALYSIS_MODEL: "m",
      syncHistoryFromServer: () => { historyPulls += 1; }
    };
    const makeGroup = () => ({
      id: "g1", label: "G", createdAt: 1, status: "idle",
      params: { model: "m", imageSize: "1024x1024", ratio: "1:1", channelId: "" },
      prompts: [
        { screen: 1, text: "t1", enabled: true, status: "idle", productFileIndexes: [], referenceFileIndexes: [] },
        { screen: 2, text: "t2", enabled: true, status: "idle", productFileIndexes: [], referenceFileIndexes: [] }
      ]
    });
    // 槽位顺序 = useDetailState 解构顺序（0..18 useState, 19..22 useRef）。
    const makePreset = () => [
      { model: "m", channelId: "" }, [], [], [], [makeGroup()], "idle", "g1", null,
      5, true, null, null, 1, { x: 0, y: 0 }, false, null, [], false, null,
      { current: null }, { current: null }, { current: null }, { current: false }
    ];
    // R8：并发连点只发一轮（in-flight 锁）。先测单次基线，再测并发。
    globalThis.__v218Mock.setPreset(makePreset());
    const apiSingle = invokeDetailState(deps);
    fetchMode = "success"; fetchCalls.length = 0;
    await apiSingle.generateDetailGroup("g1");
    singleCount = fetchCalls.length;
    globalThis.__v218Mock.setPreset(makePreset());
    const apiDouble = invokeDetailState(deps);
    fetchCalls.length = 0;
    await Promise.all([apiDouble.generateDetailGroup("g1"), apiDouble.generateDetailGroup("g1")]);
    doubleCount = fetchCalls.length;
    check("R8 并发连点只发一轮请求（in-flight 锁生效）", () => {
      if (!(singleCount > 0)) throw new Error("单次基线未发出请求");
      if (doubleCount !== singleCount) throw new Error("连点触发重复提交: 单次 " + singleCount + " / 连点 " + doubleCount);
    });

    // R9：abort 后 detailStatus / prompt.status 复位且不留 generating，in-flight 锁释放，catch 触发历史补拉。
    globalThis.__v218Mock.setPreset(makePreset());
    const apiAbort = invokeDetailState(deps);
    fetchMode = "abort"; fetchCalls.length = 0; timers.length = 0; historyPulls = 0;
    // generateDetailGroup 用 Promise.allSettled，单屏 abort 被吸收为 rejected、不向外抛；
    // 正确行为是整组落 failed、各屏 prompt.status=failed、detailStatus 不留 generating。
    await apiAbort.generateDetailGroup("g1");
    const status = globalThis.__v218Mock.get(5);
    const prompts = globalThis.__v218Mock.get(4)[0].prompts;
    const pullTimers = timers.filter((t) => t.ms === 2400);
    pullTimers.forEach((t) => t.fn());
    check("R9 abort 后 detailStatus/prompt.status 复位、不留 generating", () => {
      if (status !== "failed" && status !== "ready") throw new Error("detailStatus 异常: " + status);
      if (status === "generating") throw new Error("detailStatus 停在 generating");
      if (prompts.some((p) => p.status === "running")) throw new Error("prompt.status 停在 running: " + prompts.map((p) => p.status).join(","));
      if (prompts.some((p) => p.status !== "failed")) throw new Error("abort 未落 failed: " + prompts.map((p) => p.status).join(","));
      if (globalThis.__v218Mock.get(22).current !== false) throw new Error("in-flight 锁未释放");
    });
    check("R10 catch 路径触发 2400ms 历史补拉（上游已扣费兜底）", () => {
      if (pullTimers.length === 0) throw new Error("无 2400ms 补拉定时器");
      if (historyPulls < pullTimers.length) throw new Error("补拉回调未触发 syncHistoryFromServer");
    });

    // ── ⑥ 会话态不落盘（真实调用 sanitize，序列化结果不含会话态）──
    check("R11 分组序列化结果不含任何会话态字段", () => {
      const out = sanitizeDetailGroupsForStorage([{
        id: "g", params: {}, prompts: [{ screen: 1 }],
        planningContext: { instruction: "x" }, planning: { screens: [] }, evil: 1
      }]);
      const text = JSON.stringify(out);
      for (const bad of ["planningContext", "planning", "evil", "JINGYIN_DETAIL_V2_PLANNING_SKILL"]) {
        if (text.includes(bad)) throw new Error("落盘串入会话态: " + bad);
      }
    });
  } finally {
    await server.close();
  }

  // ───────────────────────────── 负向对照层 ─────────────────────────────
  // 判定谓词：喂真实数据判绿，喂合成坏数据判红，证明断言不是永真。
  const isSingleBatch = (n, base) => n === base;
  check("N1 负向：连点计数 2 倍时判红（证明 R8 谓词可区分）",
    () => { if (isSingleBatch(singleCount * 2, singleCount)) throw new Error("坏夹具未被判红"); });
  const timeoutOk = (f, s) => f > 0 && s > 0 && f >= s + 30000;
  check("N2 负向：前端阈值 30000 时判红（证明 S4 谓词可区分）",
    () => { if (timeoutOk(30000, serverTimeout)) throw new Error("坏夹具未被判红"); });
  const keysClean = (prompt) => !["planning", "planningContext", "evilKey", "JINGYIN_DETAIL_V2_PLANNING_SKILL"].some((k) => k in prompt);
  check("N3 负向：含未知键的 prompt 判红（证明 R6 谓词可区分）",
    () => { if (keysClean({ screen: 1, planningContext: { a: 1 } })) throw new Error("坏夹具未被判红"); });
  const parityOk = (init) => JSON.stringify(Object.keys(init).sort()) === JSON.stringify(["body", "headers", "method"]);
  check("N4 负向：fetch 配置含 signal 时判红（证明 R1 谓词可区分）",
    () => { if (parityOk({ method: "POST", body: {}, headers: {}, signal: {} })) throw new Error("坏夹具未被判红"); });

  // ───────────────────────────── 基线棘轮收口 ─────────────────────────────
  const violations = checks.filter((item) => !item.ok).map((item) => item.name);
  let baseline = [];
  if (existsSync(BASELINE)) {
    try {
      const parsed = JSON.parse(readFileSync(BASELINE, "utf8"));
      if (Array.isArray(parsed.items)) baseline = parsed.items;
    } catch { baseline = []; }
  }
  const beforeSet = new Set(baseline);
  const currentSet = new Set(violations);
  const added = violations.filter((name) => !beforeSet.has(name));
  const stale = baseline.filter((name) => !currentSet.has(name));
  const ok = added.length === 0 && stale.length === 0;

  if (UPDATE) {
    if (!REASON) { console.log("--update 须带 --reason 写明刷新理由"); process.exit(1); }
    writeFileSync(BASELINE, JSON.stringify({
      generatedAt: new Date().toISOString(), reason: REASON, items: violations
    }, null, 2) + "\n");
    console.log("基线已刷新：" + violations.length + " 条存量记账");
    process.exit(0);
  }

  const report = {
    ok, total: checks.length, passed: checks.length - violations.length,
    added, stale, failureCount: added.length + stale.length,
    failures: checks.filter((item) => !item.ok),
    note: ok
      ? "P0 运行时状态机 + P1 持久化护栏全绿；负向对照 4/4 判红有效"
      : "新增违规 / 基线陈旧：先修因，确有必要再跑 --update --reason"
  };
  console.log(AS_JSON ? JSON.stringify(report) : JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

await main();
