// 接口 mock 检查（不打上游、不扣费）。
//
// 用真实的 express 服务进程验证：
//   - /api/config 目录里 4 个 canonical 模型能力齐全、0 条旧线路
//   - 快捷生成 /api/images 请求带 canonical model + channelId + dispatchMode
//   - 批量换装 /api/generate-outfit 请求带 canonical model + channelId + dispatchMode
//   - 非法 / 旧 channelId 被服务端拒绝（在调用上游之前就返回 400）
//   - 合法 channelId + 无 KEY -> missing_api_key，证明校验通过且没有触发上游生图
//
// 用法：
//   node scripts/verify/http-mock-check.mjs              # 自包含：自己拉起测试实例
//   node scripts/verify/http-mock-check.mjs <baseUrl>    # 外部模式：复用已在跑的服务
//
// 自包含模式下测试实例的数据目录被挪到 .codex-artifacts/http-mock-check，
// 绝不写入用户的 data/ 与 logs/。
import process from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
const routingModule = await import(new URL("../../src/shared/routing.js", import.meta.url));
import { freshSandbox, installExitCleanup, removeSandbox, stopChild } from "./lib/sandbox.mjs";

const externalBaseUrl = process.argv[2] ? process.argv[2].replace(/\/+$/, "") : "";
const baseUrl = externalBaseUrl || "http://127.0.0.1:8899";
const workspaceRoot = process.cwd();
let failures = 0;
const lines = [];
function check(name, ok, detail = "") {
  lines.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// ---------------------------------------------------------------- 测试实例生命周期
const NODE = path.join(workspaceRoot, "runtime", "node", "node.exe");
const APP_PORT = 8899;
const SANDBOX_ROOT = path.join(workspaceRoot, ".codex-artifacts", "http-mock-check");
// 日志也要落在沙盒里：下面用这个前缀读被测实例自己的 generation.jsonl。
let logsRoot = workspaceRoot;
let child = null;

async function waitForHealth(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch { /* 还没起来 */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

if (!externalBaseUrl) {
  // freshSandbox 是「真删 + 重建」：工作区路径上的 rmSync 会静默无效（见 lib/sandbox.mjs）。
  freshSandbox(SANDBOX_ROOT);
  logsRoot = SANDBOX_ROOT;
  // 中途抛错时的兜底清理；正常路径在文件末尾显式收尾（要等进程真的退出）。
  installExitCleanup({ getChild: () => child, sandboxDir: SANDBOX_ROOT });
  child = spawn(NODE, [path.join("server", "index.js")], {
    cwd: workspaceRoot,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      // 显式 dev：dist/.release-mode（secure-win-release.mjs:208 构建时写入）会经 server/index.js:13-21 把实例强制成 production，测试实例必须免疫（V122）
      NODE_ENV: "development",
        // 按端口分目录：vite 配置哈希里含 PORT（见 vite.config.js），所有脚本共用一份缓存
        // 会让配置哈希每次都变 ⇒ 每次起服务都重新预构建 ⇒ 触发沙箱批量删除守卫而崩（2026-10-06 实测）
        JINGYIN_VITE_CACHE_DIR: path.join(process.cwd(), "tmp", `vite-cache-verify-${APP_PORT}`),
      PORT: String(APP_PORT),
      // 端口被占时直接失败，不漂到别的端口去测一个不是我们起的进程。
      JINGYIN_PORT_FALLBACK_LIMIT: "0",
      JINGYIN_RELEASE_ROOT: SANDBOX_ROOT,
      JINGYIN_NO_BROWSER: "1"
    }
  });
  if (!(await waitForHealth(APP_PORT))) {
    console.log(`[http-mock-check] 测试实例未在 ${APP_PORT} 端口就绪，无法继续`);
    process.exit(1);
  }
}

function tinyPng(name) {
  // 1x1 PNG，够 multer 解析出文件大小；不含任何用户内容。
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  return new File([bytes], name, { type: "image/png" });
}

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 120) }; }
  return { status: response.status, payload };
}

// ------------------------------------------------------------------ /api/config
const config = await json("/api/config");
check("GET /api/config 200", config.status === 200, String(config.status));

const routing = config.payload?.routing || {};
const EXPECTED_MODELS = ["tt-image-2", "tt-image-2.5", "banana-2", "banana-2.1", "nano-banana-pro", "doubao-seedream-5-0"];
function pricesAscendingRows(rows) {
  for (let i = 1; i < rows.length; i += 1) {
    const prev = Number(rows[i - 1]?.price ?? -1);
    const cur = Number(rows[i]?.price ?? -1);
    if (cur < prev - 1e-9) return false;
  }
  return true;
}

const modelIds = (routing.models || []).map((model) => model.id);
check(
  "routing catalog 6 个 canonical 模型齐全（含香蕉2.1 与 SD，SD Pro 已隐藏）",
  EXPECTED_MODELS.every((id) => modelIds.includes(id)),
  modelIds.join(",")
);
check(
  "routing catalog 的模型顺序 = 2.0 → 2.5 → 香蕉 2 → 香蕉2.1 → 香蕉 Pro → SD",
  JSON.stringify(modelIds) === JSON.stringify(EXPECTED_MODELS),
  modelIds.join(",")
);
for (const modelId of EXPECTED_MODELS) {
  const rows = routingModule.channelsForModel(modelId, routing);
  check(
    `${modelId} 目录渠道按价格升序（价格低→高）`,
    pricesAscendingRows(rows),
    rows.map((item) => `${item.label}/${item.price}`).join(",")
  );
  check(
    `${modelId} 默认线路 = 列表第一条（动态）`,
    rows.length > 0 && routingModule.defaultChannelForModel(modelId, routing) === rows[0].id,
    `default=${routingModule.defaultChannelForModel(modelId, routing)} first=${rows[0]?.id}`
  );
}
check(
  "routing catalog 不含旧模型 ID nano-banana2 / gpt-image",
  !JSON.stringify(routing).includes("nano-banana2") && !JSON.stringify(routing).includes("gpt-image")
);

const capabilityKeys = ["maxInputImages", "maxPromptLength", "maxImageBytes", "supportedAspectRatios", "supportedSizes"];
for (const model of routing.models || []) {
  const caps = model.capabilities || {};
  check(
    `${model.id} capabilities 齐全`,
    capabilityKeys.every((key) => caps[key] !== undefined && caps[key] !== null)
  );
}

const routingText = JSON.stringify(routing);
for (const token of ["WD-banana pro-特价", "MC-限时特惠", "XBS-default", "silent-pro-line-03", "silent-banana-line-01", "silent-tt2-line-08"]) {
  check(`routing catalog 输出不含旧线路 ${token}`, !routingText.includes(token));
}

// 2026-10-26：SD Pro 因上游渠道失效被前端隐藏，目录不应再下发该模型与其渠道。
check("routing catalog 已隐藏 SD Pro 模型（doubao-seedream-5-0-pro）",
  !modelIds.includes("doubao-seedream-5-0-pro"),
  modelIds.join(","));
check("routing catalog 已隐藏 SD Pro 渠道（mc-seedream-5-0-pro）",
  !routingText.includes("mc-seedream-5-0-pro"),
  routingText.includes("mc-seedream-5-0-pro") ? "仍可见" : "已隐藏");

const configText = JSON.stringify(config.payload?.models || []);
check("config.models 输出不含旧线路名", !/WD-banana pro-特价|MC-限时特惠|XBS-default/.test(configText));

const bananaChannelRows = (routing.channels || [])
  .filter((channel) => (channel.supportedModels || []).includes("banana-2"));
const bananaChannels = bananaChannelRows.map((channel) => channel.id);
// 跨文件一致性：服务端目录里的香蕉2 前端线路，必须和 routing.js 白名单集合一致。
const bananaAllow = (routingModule.MODEL_CHANNEL_ALLOWLIST["banana-2"] || []).map((item) => item.id).sort();
check("香蕉 2 服务端目录线路集合 = routing.js 白名单（改了一处漏了另一处会立刻红）",
  JSON.stringify(bananaChannels.sort()) === JSON.stringify(bananaAllow),
  `catalog=${bananaChannels.join(",")} allow=${bananaAllow.join(",")}`);
check("香蕉 2 线路价格都为正（价格档位由目录与白名单一致性门禁保证）",
  bananaChannelRows.length > 0 && bananaChannelRows.every((channel) => Number(channel.pricing?.["banana-2"]?.price ?? -1) > 0),
  JSON.stringify(bananaChannelRows.map((channel) => [channel.id, channel.pricing?.["banana-2"]?.price])));

const proChannels = (routing.channels || [])
  .filter((channel) => (channel.supportedModels || []).includes("nano-banana-pro"))
  .map((channel) => channel.id);
const proAllow = (routingModule.MODEL_CHANNEL_ALLOWLIST["nano-banana-pro"] || []).map((item) => item.id).sort();
check("香蕉 Pro 服务端目录线路集合 = routing.js 白名单（一致性门禁）",
  JSON.stringify(proChannels.sort()) === JSON.stringify(proAllow),
  `catalog=${proChannels.join(",")} allow=${proAllow.join(",")}`);

// 2026-09-25：2.0（tt-image-2）的 WD-image特价 下线；2.5 的 XT-image2-s / XT-特殊分组 保持可用
const tt2ChannelRows = (routing.channels || [])
  .filter((channel) => (channel.supportedModels || []).includes("tt-image-2"));
check(
  "2.0 目录里已无 WD-image特价（silent-tt2-line-04）",
  !tt2ChannelRows.some((channel) => channel.id === "silent-tt2-line-04" || channel.label === "WD-image特价"),
  tt2ChannelRows.map((channel) => channel.label).join(",")
);
const tt25ChannelRows = (routing.channels || [])
  .filter((channel) => (channel.supportedModels || []).includes("tt-image-2.5"));
for (const [id, label] of [["silent-tt25-line-01", "XT-image2-s"], ["silent-tt25-line-02", "XT-特殊分组"]]) {
  const row = tt25ChannelRows.find((channel) => channel.id === id);
  check(`2.5 目录里显示 ${label}`, Boolean(row) && row.label === label,
    row ? `${row.id}/${row.label}` : tt25ChannelRows.map((channel) => channel.id).join(","));
}

// 2026-09-25：2.0 的 ZYG 三条「只在前端隐藏」——服务端目录照旧，前端菜单里不该出现
{
  const hiddenIds = ["silent-tt2-line-05", "silent-tt2-line-06", "silent-tt2-line-07"];
  check("服务端目录里仍然保留 ZYG 三条（说明是前端隐藏，不是下架）",
    hiddenIds.every((id) => tt2ChannelRows.some((channel) => channel.id === id)),
    tt2ChannelRows.map((channel) => channel.id).join(","));
  const frontendRows = routingModule.channelsForModel("tt-image-2", routing);
  check("前端菜单数据源里没有 ZYG 三条",
    !frontendRows.some((channel) => hiddenIds.includes(channel.id))
      && !frontendRows.some((channel) => /^ZYG-/.test(String(channel.label || ""))),
    frontendRows.map((channel) => channel.label).join(","));
  check("2.0 前端菜单条数 = 服务端非隐藏渠道数（一致性门禁）",
    frontendRows.length === (routing.channels || [])
      .filter((channel) => (channel.supportedModels || []).includes("tt-image-2")
        && !routingModule.isHiddenChannelId(channel.id)
        && !routingModule.isForbiddenChannelId(channel.id)).length,
    `frontend=${frontendRows.length}`);
  check("2.0 前端菜单第一条是 laoye（2026-10-11 调整默认线路）",
    frontendRows[0]?.id === "silent-tt2-line-12" && frontendRows[0]?.label === "laoye",
    frontendRows.slice(0, 3).map((channel) => channel.label).join(","));

  // 2026-09-26（按用户要求）：香蕉 2 的「云枢」也改成前端隐藏，只在前端隐藏，服务端照旧认。
  const bananaFrontend = routingModule.channelsForModel("banana-2", routing);
  const bananaFrontendIds = (routingModule.MODEL_CHANNEL_ALLOWLIST["banana-2"] || []).map((item) => item.id).sort();
  check("香蕉 2 前端菜单集合 = 白名单（一致性门禁，不写死顺序）",
    JSON.stringify(bananaFrontend.map((item) => item.id).sort()) === JSON.stringify(bananaFrontendIds),
    bananaFrontend.map((channel) => `${channel.id}/${channel.label}`).join(","));
  check("香蕉 2 云枢是前端显示而不是下架（服务端目录仍在、服务端仍接受）",
    !routingModule.isHiddenChannelId("silent-banana-line-07")
      && !routingModule.isForbiddenChannelId("silent-banana-line-07")
      && (routing.channels || []).some((channel) => channel.id === "silent-banana-line-07"),
    "isHidden=false / isForbidden=false / 目录仍在");
}

// ------------------------------------------------- /api/images：旧 channelId 必须被拒
const forbiddenCases = [
  ["WD-banana pro-特价", "forbidden"],
  ["MC-限时特惠", "forbidden"],
  ["XBS-default", "forbidden"],
  ["silent-pro-line-03", "forbidden"],
  ["silent-banana-line-01", "forbidden"],
  ["silent-tt2-line-08", "forbidden"],
  ["silent-tt2-line-04", "forbidden"],
  ["silent-pro-line-10", "cross-model"]
];
for (const [channelId, kind] of forbiddenCases) {
  const form = new FormData();
  form.set("model", "banana-2");
  form.set("channelId", channelId);
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查，不会调用上游");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  form.set("n", "1");
  form.append("image", tinyPng("mock.png"), "mock.png");
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    `/api/images 拒绝 ${kind} channelId “${channelId}”`,
    result.status === 400 && ["forbidden_channel", "channel_model_mismatch"].includes(result.payload?.error),
    `status=${result.status} error=${result.payload?.error}`
  );
}

// --------------------------------------- /api/images：旧存档模型 ID 归一化后仍被接受
// 这里**故意不带 apiKey**：服务端顺序是 normalize -> validateImageRouting ->
// validateImageCapabilities -> apiKey 检查，所以 missing_api_key 反证了
// 「旧 ID nano-banana2 已成功归一化并通过路由 + 能力校验」，且全程没有上游请求。
{
  const form = new FormData();
  form.set("model", "nano-banana2");
  form.set("channelId", "silent-banana-line-08");
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    "旧存档 nano-banana2 归一化后通过路由/能力校验（停在 missing_api_key）",
    result.status === 400 && result.payload?.error === "missing_api_key",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// ------------------- /api/images：2.5 的 XT-image2-s / XT-特殊分组 必须真的能被服务端接受
// 同样故意不带 apiKey：missing_api_key 反证「通过了路由 + 能力校验」，且没有上游请求。
for (const [channelId, label] of [["silent-tt25-line-01", "XT-image2-s"], ["silent-tt25-line-02", "XT-特殊分组"]]) {
  const form = new FormData();
  form.set("model", "tt-image-2.5");
  form.set("channelId", channelId);
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  form.append("image", tinyPng("mock.png"), "mock.png");
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    `2.5 的 ${label} 通过服务端路由/能力校验（停在 missing_api_key）`,
    result.status === 400 && result.payload?.error === "missing_api_key",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// ------------------------------- /api/images：能力上限（图片数量）在服务端生效
{
  const form = new FormData();
  form.set("model", "tt-image-2.5");
  form.set("channelId", "silent-tt25-line-01");
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  for (let index = 0; index < 9; index += 1) {
    form.append("image", tinyPng(`mock-${index}.png`), `mock-${index}.png`);
  }
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    "/api/images 按 capabilities 拒绝超量图片（tt-image-2.5 > 8）",
    result.status === 400 && result.payload?.error === "too_many_images",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// ------------------------- /api/images：合法请求 + 无 KEY -> missing_api_key（未打上游）
{
  const form = new FormData();
  form.set("model", "banana-2");
  form.set("channelId", "silent-banana-line-07");
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查，不带 KEY，不会调用上游");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  form.append("image", tinyPng("mock.png"), "mock.png");
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    "/api/images 合法线路 + 无 KEY -> missing_api_key（证明未触发上游）",
    result.status === 400 && result.payload?.error === "missing_api_key",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// ------------------- 本轮新增：Origin 香蕉 2 线路（silent-banana-line-09）
// 快捷生成链路：合法线路 + 无 KEY -> missing_api_key，证明 Origin 线路通过了
// normalize -> validateImageRouting -> validateImageCapabilities，且没有触发上游生图。
{
  const form = new FormData();
  form.set("model", "banana-2");
  form.set("channelId", "silent-banana-line-09");
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查，Origin 线路，不带 KEY，不会调用上游");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  form.append("image", tinyPng("mock.png"), "mock.png");
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    "/api/images 接受 Origin 线路 banana-2 + silent-banana-line-09（停在 missing_api_key）",
    result.status === 400 && result.payload?.error === "missing_api_key",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// 跨模型：Origin 的香蕉 2 channelId 用在别的模型上必须被拒（channel_model_mismatch）。
for (const otherModel of ["nano-banana-pro", "tt-image-2"]) {
  const form = new FormData();
  form.set("model", otherModel);
  form.set("channelId", "silent-banana-line-09");
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  form.append("image", tinyPng("mock.png"), "mock.png");
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    `/api/images 拒绝 Origin 香蕉 2 线路用于 ${otherModel}`,
    result.status === 400 && result.payload?.error === "channel_model_mismatch",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// 反向：banana-2 蹭香蕉 Pro 的 Origin 线路也必须被拒。
{
  const form = new FormData();
  form.set("model", "banana-2");
  form.set("channelId", "silent-pro-line-09");
  form.set("dispatchMode", "manual");
  form.set("prompt", "mock 检查");
  form.set("imageSize", "2K");
  form.set("aspectRatio", "3:4");
  form.append("image", tinyPng("mock.png"), "mock.png");
  const result = await json("/api/images", { method: "POST", body: form });
  check(
    "/api/images 拒绝 banana-2 使用 Pro 的 Origin 线路 silent-pro-line-09",
    result.status === 400 && result.payload?.error === "channel_model_mismatch",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// ------------------- 批量换装链路：Origin 线路同样要在智能介入之前通过路由校验
// 这批请求都带假 KEY（服务端 API Key 存在性检查在最前面），并且故意塞一张超过
// banana-2 上限（16MB）的图：错误码是 image_too_large 就说明**路由已经放行**
// （否则会是 forbidden_channel / channel_model_mismatch）。全程没有上游请求。
{
  const oversized = new File([new Uint8Array(17 * 1024 * 1024)], "oversized.png", { type: "image/png" });
  const payload = {
    taskId: `mock-outfit-origin-${Date.now()}`,
    apiKey: "sk-mock-key-not-real",
    model: "banana-2",
    channelId: "silent-banana-line-09",
    dispatchMode: "manual",
    imageSize: "2K",
    aspectRatio: "3:4",
    prompt: "mock 批量换装检查，不会调用上游",
    workflowMode: "outfit",
    smartIntervention: false
  };
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.append("image", tinyPng("model.png"), "model.png");
  form.append("image", oversized, "oversized.png");
  const result = await json("/api/generate-outfit", { method: "POST", body: form });
  check(
    "/api/generate-outfit 放行 Origin 线路 silent-banana-line-09 的路由校验（停在 image_too_large）",
    result.status === 400 && result.payload?.error === "image_too_large",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// 对照：同样一张超大图 + 非法线路，必须在路由阶段就被拒（证明上一条不是被图片大小挡住的假阳性）。
{
  const oversized = new File([new Uint8Array(17 * 1024 * 1024)], "oversized.png", { type: "image/png" });
  const payload = {
    taskId: `mock-outfit-origin-bad-${Date.now()}`,
    apiKey: "sk-mock-key-not-real",
    model: "banana-2",
    channelId: "XBS-default",
    dispatchMode: "manual",
    imageSize: "2K",
    aspectRatio: "3:4",
    prompt: "mock 批量换装对照检查，不会调用上游",
    workflowMode: "outfit",
    smartIntervention: false
  };
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.append("image", tinyPng("model.png"), "model.png");
  form.append("image", oversized, "oversized.png");
  const result = await json("/api/generate-outfit", { method: "POST", body: form });
  check(
    "/api/generate-outfit 对照组（同图 + 旧线路）先报 forbidden_channel",
    result.status === 400 && result.payload?.error === "forbidden_channel",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// 批量换装：Origin 香蕉 2 channelId 用在 Pro 上必须被拒（跨模型组合不允许）。
{
  const payload = {
    taskId: `mock-outfit-cross-${Date.now()}`,
    apiKey: "sk-mock-key-not-real",
    model: "nano-banana-pro",
    channelId: "silent-banana-line-09",
    dispatchMode: "manual",
    imageSize: "2K",
    aspectRatio: "3:4",
    prompt: "mock 批量换装跨模型检查，不会调用上游",
    workflowMode: "outfit",
    smartIntervention: false
  };
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.append("image", tinyPng("model.png"), "model.png");
  form.append("image", tinyPng("clothing.png"), "clothing.png");
  const result = await json("/api/generate-outfit", { method: "POST", body: form });
  check(
    "/api/generate-outfit 拒绝 Pro 使用 Origin 香蕉 2 线路",
    result.status === 400 && result.payload?.error === "channel_model_mismatch",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// ------------------------------------------- /api/generate-outfit：批量换装路由字段
// 关键点：这里显式打开 smartIntervention（会带 KEY 调上游的本机 AI 介入），
// 旧 channelId 必须在**智能介入之前**就被拒绝，不能先花钱再报错。
// 用假 KEY 只是为了通过最前面的 API Key 存在性检查；因为路由先失败，
// 服务端不会发生任何上游请求。
const outfitLogPath = path.join(logsRoot, "logs", "generation.jsonl");
const outfitLogSizeBefore = existsSync(outfitLogPath) ? readFileSync(outfitLogPath).length : 0;
{
  const requestId = `mock-outfit-forbidden-${Date.now()}`;
  const payload = {
    taskId: requestId,
    apiKey: "sk-mock-key-not-real",
    model: "banana-2",
    channelId: "XBS-default",
    dispatchMode: "manual",
    imageSize: "2K",
    aspectRatio: "3:4",
    prompt: "mock 批量换装检查，不会调用上游",
    workflowMode: "outfit",
    smartIntervention: true
  };
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  form.append("image", tinyPng("model.png"), "model.png");
  form.append("image", tinyPng("clothing.png"), "clothing.png");
  const result = await json("/api/generate-outfit", { method: "POST", body: form });
  check(
    "/api/generate-outfit 拒绝旧 channelId XBS-default",
    result.status === 400 && result.payload?.error === "forbidden_channel",
    `status=${result.status} error=${result.payload?.error}`
  );
}

// 审计日志：这次被拒绝的请求之后，日志里不能新增任何 smart-intervention / 上游阶段
{
  if (!existsSync(outfitLogPath)) {
    check("审计 generation.jsonl（文件不存在，跳过）", true, outfitLogPath);
  } else {
    const appended = readFileSync(outfitLogPath).subarray(outfitLogSizeBefore).toString("utf8");
    const appendedLines = appended.split("\n").filter(Boolean);
    const upstreamStages = appendedLines.filter((line) => /smart-intervention-start|upstream-|upstream_request|image-slot-acquired/.test(line));
    check(
      "旧 channelId 的批量换装请求在智能介入之前被拒（日志无上游阶段）",
      upstreamStages.length === 0,
      `新增日志 ${appendedLines.length} 行，上游阶段 ${upstreamStages.length} 行`
    );
  }
}

console.log(lines.join("\n"));

// 收尾：先等测试实例真的退出（它在退出前还会写一次日志），再删沙盒，
// 否则 Windows 上的文件句柄会让目录删不干净。
let teardown = "";
if (!externalBaseUrl) {
  const childStopped = await stopChild(child);
  const sandbox = await removeSandbox(SANDBOX_ROOT);
  teardown = `，收尾：实例${childStopped ? "已退出" : "未确认退出"}、`
    + `沙盒${sandbox.removed ? `已清理(${sandbox.attempts} 次)` : `残留(${sandbox.error})`}`;
}
console.log(`\n[http-mock-check] 失败 ${failures} 项 / 共 ${lines.length} 项`
  + (externalBaseUrl
    ? `（外部实例 ${baseUrl}）`
    : `（自建实例 http://127.0.0.1:${APP_PORT}，沙盒 .codex-artifacts/http-mock-check${teardown}）`));
process.exit(failures === 0 ? 0 : 1);
