// V144：outfit 强类型节点 payload 构造对齐 runSingleTask（防「搬运丢参」）无头验收。
//
// 核心保证：buildOutfitPayload 产出的 payload 字段集与 src/features/outfit/handlers/
// outfit-batch-execution.js 的 runSingleTask 同构——
//   - 必含 apiKey / routingFields(展开为 model+channelId+dispatchMode) / imageSize / aspectRatio /
//     prompt / workflowMode / pageName / modelImageCount / colorReferenceCount /
//     whiteRefineReferenceCount / outpaintReferenceCount / referenceCount / pairingMode /
//     preprocessMode / deferAutoSave / maskEdit / localEdit
//   - outfit 发 outfitIntent + maskMode；white-refine 发 retouchIntent；recolor 不发 intent
//   - 图像 URL 按「图1=model、图2=服装/颜色参考」有序归集（服务端约定同名字段 image 按序）
//
// 全部 import 真实源码，不起服务、不联网、不扣费（只测纯函数 buildOutfitPayload）。
// 用法：node scripts/verify/ai-canvas-node-outfit-check.mjs

import { buildOutfitPayload } from "../../src/features/ai-canvas/ai-canvas-node-outfit.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// 在 runSingleTask 中一定出现的字段（白名单，少了就是「搬运丢参」）。
const REQUIRED_KEYS = [
  "apiKey", "model", "channelId", "dispatchMode", "imageSize", "aspectRatio",
  "prompt", "workflowMode", "pageName", "modelImageCount", "colorReferenceCount",
  "whiteRefineReferenceCount", "outpaintReferenceCount", "referenceCount", "pairingMode",
  "preprocessMode", "deferAutoSave", "maskEdit", "localEdit"
];

const fixtureOpts = {
  apiKey: "test-key",
  // 用 banana-2.1 的真实白名单线路（routingFields 会把任意 channelId 收敛到合法线路，
  // 所以这里必须给真线路 id，否则断言拿到的会是收敛后的第一条而非 "ch-x"）。
  settings: { model: "banana-2.1", channelId: "silent-banana21-line-01", imageSize: "1024x1024", aspectRatio: "1:1" },
  config: {}
};

// —— 公共辅助：构造一个带上游图/提示词的 current ——
function makeCurrent(tryonNode, extraNodes = [], extraEdges = []) {
  const imgModel = { id: "m", type: "image", data: { src: "data:img/model" } };
  const imgCloth = { id: "c", type: "image", data: { src: "data:img/cloth" } };
  return {
    nodes: [imgModel, imgCloth, ...extraNodes, tryonNode],
    edges: [
      { from: "m", to: tryonNode.id, toPort: "model" },
      { from: "c", to: tryonNode.id, toPort: "clothing" },
      ...extraEdges
    ]
  };
}

// ===== 换装（outfit）=====
const tryonNode = { id: "t", type: "outfit-tryon", data: { prompt: "换成红色连衣裙", status: "idle", outfitIntent: { parts: ["upper"] } } };
const tryonCurrent = makeCurrent(tryonNode);
const tryonBuilt = buildOutfitPayload(tryonNode, tryonCurrent, fixtureOpts);
const tp = tryonBuilt.payload;

check("换装：payload 含 runSingleTask 全部必填字段（无丢参）",
  REQUIRED_KEYS.every((k) => k in tp),
  REQUIRED_KEYS.filter((k) => !(k in tp)).join(",") || "all");
check("换装：workflowMode=outfit", tp.workflowMode === "outfit");
check("换装：apiKey / channelId 透传", tp.apiKey === "test-key" && tp.channelId === "silent-banana21-line-01");
check("换装：prompt 取节点自身提示词", tp.prompt === "换成红色连衣裙");
check("换装：outfitIntent.parts 含 upper（且经 normalizeOutfitIntent 补齐默认结构）",
  Array.isArray(tp.outfitIntent?.parts) && tp.outfitIntent.parts.includes("upper") &&
  tp.outfitIntent.wearing && tp.outfitIntent.wearing.mode === "follow" &&
  tp.outfitIntent.factsSource && typeof tp.outfitIntent.factsSource === "object",
  JSON.stringify(tp.outfitIntent?.parts));
check("换装：maskMode 默认 none（P1-8.1 透传）", tp.maskMode === "none");
check("换装：pageName 有值（服务端按页路由）", Boolean(tp.pageName));
check("换装：colorReferenceCount=0（非改色）、whiteRefineReferenceCount=0",
  tp.colorReferenceCount === 0 && tp.whiteRefineReferenceCount === 0);
check("换装：imageUrls 有序为 model + clothing 两张（图1=人物、图2=服装）",
  tryonBuilt.imageUrls.length === 2 &&
  tryonBuilt.imageUrls[0].role === "model" && tryonBuilt.imageUrls[0].url === "data:img/model" &&
  tryonBuilt.imageUrls[1].role === "clothing" && tryonBuilt.imageUrls[1].url === "data:img/cloth",
  JSON.stringify(tryonBuilt.imageUrls.map((i) => i.role)));

// ===== 改色（recolor）=====
const recolorNode = { id: "rc", type: "outfit-recolor", data: { prompt: "", status: "idle" } };
const recolorCurrent = makeCurrent(recolorNode, [], []);
const recolorBuilt = buildOutfitPayload(recolorNode, recolorCurrent, fixtureOpts);
const rp = recolorBuilt.payload;

check("改色：workflowMode=recolor", rp.workflowMode === "recolor");
check("改色：colorReferenceCount=1（有颜色参考图）", rp.colorReferenceCount === 1);
check("改色：canonical runSingleTask 对 recolor 不发 intent（与页面一致，防丢参不瞎加）",
  rp.outfitIntent === undefined && rp.retouchIntent === undefined,
  `outfitIntent=${rp.outfitIntent} retouchIntent=${rp.retouchIntent}`);
check("改色：imageUrls 为 model + color（图2=颜色参考）",
  recolorBuilt.imageUrls.length === 2 &&
  recolorBuilt.imageUrls[0].role === "model" && recolorBuilt.imageUrls[1].role === "color",
  JSON.stringify(recolorBuilt.imageUrls.map((i) => i.role)));

// 改色没有上游提示词时 prompt 为空串（不崩）
check("改色：无提示词时 prompt 为空串而非 undefined", rp.prompt === "");

// ===== 精修（white-refine）=====
const retouchNode = { id: "rt", type: "outfit-retouch", data: { prompt: "白底精修", status: "idle", retouchIntent: {} } };
const retouchCurrent = {
  nodes: [
    { id: "m", type: "image", data: { src: "data:img/model" } },
    retouchNode
  ],
  edges: [{ from: "m", to: "rt", toPort: "model" }]
};
const retouchBuilt = buildOutfitPayload(retouchNode, retouchCurrent, fixtureOpts);
const wp = retouchBuilt.payload;

check("精修：workflowMode=white-refine", wp.workflowMode === "white-refine");
check("精修：retouchIntent 经 normalizeRetouchIntent（含 version）",
  wp.retouchIntent && "version" in wp.retouchIntent, JSON.stringify(wp.retouchIntent));
check("精修：whiteRefineReferenceCount=0（无第二图）、colorReferenceCount=0",
  wp.whiteRefineReferenceCount === 0 && wp.colorReferenceCount === 0);
check("精修：imageUrls 仅 model 一张（图1=主图）",
  retouchBuilt.imageUrls.length === 1 && retouchBuilt.imageUrls[0].role === "model",
  JSON.stringify(retouchBuilt.imageUrls.map((i) => i.role)));

// ===== 反例：非 outfit 节点抛错 =====
let threw = false;
try { buildOutfitPayload({ id: "g", type: "generation", data: {} }, { nodes: [], edges: [] }, fixtureOpts); }
catch { threw = true; }
check("反例：对非 outfit 节点调用 buildOutfitPayload 抛错（类型守门）", threw);

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
