// scripts/dev/verify-detail-studio-model-chain.mjs
// V199 §8/4 真链路验收（非仅前端 state）：
//   ① 切图片模型 / 渠道 → buildDetailStudioImageForm 产出的 FormData 的 model / channelId 随之变化；
//   ② 切文本（推理）模型 → 前端 probeDetailStudioText 实际发出请求体的 textModel 随之变化。
//
// 故意放在 scripts/dev/ 下、不进 scripts/verify/：这是一次性阶段验收证据脚本，
// 不计入提交钩子的 59 项快速子集（保持 --fast 59/59 口径）。
//
// 运行：node scripts/dev/verify-detail-studio-model-chain.mjs

import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.cwd();
const abs = (p) => path.resolve(ROOT, p);

// client.js 在模块顶层装了一个 window 诊断钩子（installClientRuntimeDiagnostics），
// 这里给最小 window 垫片让它提前 return，既避免 ReferenceError 又能正常 import 业务模块。
globalThis.window = { __jingyinClientDiagnosticsInstalled: true, addEventListener() {}, location: { href: "http://localhost/" } };

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log("  ✓ " + msg);
  } else {
    console.error("  ✗ " + msg);
    failures += 1;
  }
}

// ── ① 图片模型 / 渠道：FormData 实测 ──
const api = await import(pathToFileURL(abs("src/api/detail-studio.js")).href);
const { buildDetailStudioImageForm } = api;

console.log("[图片] buildDetailStudioImageForm 的 FormData 随 model/channelId 变化：");
const f1 = buildDetailStudioImageForm({ model: "tt-image-2.6", channelId: "silent-tt26-line-01", prompt: "x" });
const f2 = buildDetailStudioImageForm({ model: "tt-image-2.5", channelId: "silent-tt25-line-10", prompt: "x" });

assert(f1.get("model") === "tt-image-2.6", `model 写入 tt-image-2.6（实得 ${f1.get("model")}）`);
assert(f1.get("channelId") === "silent-tt26-line-01", `channelId 写入 silent-tt26-line-01（实得 ${f1.get("channelId")}）`);
assert(f2.get("model") === "tt-image-2.5", `切换图片模型后 model 变 tt-image-2.5（实得 ${f2.get("model")}）`);
assert(f2.get("channelId") === "silent-tt25-line-10", `切换渠道后 channelId 变 silent-tt25-line-10（实得 ${f2.get("channelId")}）`);
assert(
  f1.get("model") !== f2.get("model") && f1.get("channelId") !== f2.get("channelId"),
  "两次请求体 model + channelId 均不同（证明选择真正流入 FormData）"
);

// 渠道留空 → routingFields 自动取该图片模型的合法默认线路（非空、非写死）
const f3 = buildDetailStudioImageForm({ model: "tt-image-2.6", channelId: "", prompt: "x" });
assert(
  f3.get("channelId") && f3.get("channelId") !== "",
  `渠道留空时自动解析为合法线路（实得 ${f3.get("channelId")}）`
);
assert(f3.get("dispatchMode") === "manual", "dispatchMode 恒为 manual");

// ── ② 文本（推理）模型：实际发出请求体实测 ──
// mock fetch，捕获 probeDetailStudioText 真正 POST 出去的 JSON body。
const captured = [];
globalThis.fetch = async (url, options) => {
  captured.push({ url, body: options && options.body ? JSON.parse(options.body) : null });
  return {
    ok: true,
    status: 200,
    text: async () => "{}",
    json: async () => ({})
  };
};

console.log("[文本] probeDetailStudioText 实际发出请求体的 textModel 随选择变化：");
await api.probeDetailStudioText({ apiKey: "k", prompt: "p", textModel: "gpt-6-luna" });
await api.probeDetailStudioText({ apiKey: "k", prompt: "p", textModel: "gpt-5.6-sol" });

const sent = captured.filter((c) => String(c.url || "").includes("/api/detail-studio/probe/text"));
assert(sent.length === 2, `共发出 2 次探针请求（实得 ${sent.length}）`);
assert(sent[0].body && sent[0].body.textModel === "gpt-6-luna", `第 1 次 textModel=gpt-6-luna（实得 ${sent[0]?.body?.textModel}）`);
assert(sent[1].body && sent[1].body.textModel === "gpt-5.6-sol", `第 2 次 textModel=gpt-5.6-sol（实得 ${sent[1]?.body?.textModel}）`);
assert(sent[0].body.textModel !== sent[1].body.textModel, "两次请求体 textModel 不同（证明选择真正流入出站请求）");

console.log("");
if (failures === 0) {
  console.log("V199 §8/4 模型链路口径验收通过：图片 model/channelId 与文本 textModel 均真实流入请求。");
  process.exit(0);
} else {
  console.error(`V199 §8/4 验收失败：${failures} 项断言未通过。`);
  process.exit(1);
}
