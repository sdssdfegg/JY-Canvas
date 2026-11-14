// src/api/detail-studio.js
// 详情创作工作区唯一请求出口（api-layering-check：页面组件禁止散写 fetch）。
// 图片生成复用现有 /api/images 与现有封装 generateImages，不新建第二套图片体系。

import { apiJson, postForm, postJson } from "./client.js";
import { generateImages } from "./images.js";
import { buildDetailImageForm } from "../features/detail/detail-image-form.js";

const BASE = "/api/detail-studio";

export function getDetailStudioCapabilities() {
  return apiJson(BASE + "/capabilities", {}, "读取详情创作能力信息失败");
}

export function listDetailStudioProjects() {
  return apiJson(BASE + "/projects", {}, "读取详情项目列表失败");
}

export function createDetailStudioProject(payload) {
  return postJson(BASE + "/projects", payload, "新建详情项目失败");
}

// V213/S1 P0：自动草稿项目（服务端按 clientToken 幂等）。客户不建项目直接传图时由状态层后台调用：
// 同一 token 命中即返回既有项目，未命中才建；刷新 / 双击 / 多图并发都不会产生第二个项目。
// nameHint 仅用于首次建项时取名（首图文件名），命中既有项目时被忽略。
export function ensureDetailStudioDraftProject(clientToken, nameHint = "") {
  return postJson(
    BASE + "/projects/ensure-draft",
    { clientToken: String(clientToken || ""), nameHint: String(nameHint || "") },
    "准备详情创作工作区失败"
  );
}

export function getDetailStudioProject(id) {
  return apiJson(BASE + "/projects/" + encodeURIComponent(id), {}, "读取详情项目失败");
}

export function updateDetailStudioProject(id, patch) {
  return apiJson(BASE + "/projects/" + encodeURIComponent(id), {
    method: "PUT",
    body: JSON.stringify(patch)
  }, "保存详情项目失败");
}

export function probeDetailStudioText(payload) {
  return postJson(BASE + "/probe/text", payload, "文本模型连通性测试失败");
}

export function probeDetailStudioImage(payload) {
  return postJson(BASE + "/probe/image", payload, "图片生成请求体预检失败");
}

// 详情创作生图 FormData 构造器：统一委托到共享 buildDetailImageForm（V212 P1 · 出图入口唯一化），
// 与一键详情共用同一套字段集（禁止两套 FormData 字段）。source 用 detail-studio，
// routingFields 在内部分配合法 channelId/dispatchMode，baseUrl/referenceFiles 透传。
// deferAutoSave=1（V212-R1 P2 已真正落到共享 FormData，不再只是注释）：结果不自动落全局 history，
// 由工作区自行持久化到 data/detail-studio/generation/results/；/api/images 的 display-cache
// 仍会把图片落到 data/history-images/ 并返回 /api/history-image/... URL，故结果图仍可显示。
export function buildDetailStudioImageForm({
  apiKey = "",
  prompt = "",
  model = "tt-image-2.6",
  channelId = "",
  imageSize = "2K",
  aspectRatio = "3:4",
  n = 1,
  source = "detail-studio",
  baseUrl,
  referenceFiles = []
} = {}) {
  return buildDetailImageForm({
    apiKey,
    prompt,
    model,
    channelId,
    imageSize,
    aspectRatio,
    n,
    source,
    baseUrl,
    deferAutoSave: true,
    referenceFiles
  });
}

// 真实出图入口：直接复用现有 generateImages → POST /api/images。
// 阶段 1 仅提供能力，默认不触发（用户主动点击才会产生上游费用）；批量生成留阶段 4。
export function generateDetailStudioImage(form) {
  return generateImages(form);
}

// ── 阶段 2 §4 商品资料：落到 project.productData（fields + text），随项目保存 ──
export function saveDetailStudioProductData(id, productData) {
  return updateDetailStudioProject(id, { productData });
}

// ── 阶段 2 §4 参考图：专用上传端点（落 data/detail-studio/assets/<id>/），不改动现有 assets/save 路由 ──
export function uploadDetailStudioReferenceImage(id, file, role, label = "") {
  const form = new FormData();
  form.set("file", file);
  form.set("role", role);
  form.set("label", String(label || ""));
  return postForm(BASE + "/projects/" + encodeURIComponent(id) + "/reference-images", form, "上传参考图失败");
}

export function listDetailStudioReferenceImages(id) {
  return apiJson(BASE + "/projects/" + encodeURIComponent(id) + "/reference-images", {}, "读取参考图列表失败");
}

// ── 阶段 2 §3 模式 C 四份边界 ──
// rawPrompt 落库后只读：仅传 rawPrompt，store 侧 sanitizeModeC 对已有 rawPrompt 保持不覆盖。
export function saveDetailStudioModeCRawPrompt(id, rawPrompt) {
  return updateDetailStudioProject(id, { modeC: { rawPrompt } });
}

// 整理版解析（纯函数，不落盘）：返回 tidyVersion 与 diff，由前端决定是否保存/冻结。
export function parseModeCPrompt(id, rawPrompt) {
  return postJson(BASE + "/projects/" + encodeURIComponent(id) + "/intake/mode-c/parse", { rawPrompt }, "整理提示词失败");
}

// 冻结最终提示词：仅用户确认后写入 frozenPrompt，生成只认这一份。
export function freezeModeCPrompt(id, frozenPrompt) {
  return apiJson(BASE + "/projects/" + encodeURIComponent(id) + "/intake/mode-c/freeze", {
    method: "PUT",
    body: JSON.stringify({ frozenPrompt })
  }, "冻结提示词失败");
}

// ── 阶段 3 规划批次①（商品分析 + 电商策划）：1 次模型调用，返回结构化 JSON ──
// KEY 由前端从全局设置读取后透传（不在本视图落盘）。落库到 project.planning。
export function analyzeDetailStudio(id, { apiKey = "", textModel = "" } = {}) {
  return postJson(BASE + "/projects/" + encodeURIComponent(id) + "/planning/analyze", { apiKey, textModel }, "商品分析失败");
}

// ── 阶段 3 规划批次②（导演 + 分屏）：1 次模型调用，产出结构化 ScreenSpec[] ──
export function directorDetailStudio(id, { apiKey = "", textModel = "" } = {}) {
  return postJson(BASE + "/projects/" + encodeURIComponent(id) + "/planning/director", { apiKey, textModel }, "导演分屏失败");
}

// ── B3 确定性编译：把已规划的 ScreenSpec[] 编译成每屏 frozenPrompts（零模型）──
export function compileDetailStudioPrompts(id) {
  return postJson(BASE + "/projects/" + encodeURIComponent(id) + "/planning/compile", {}, "编译提示词失败");
}

// ── B3 冻结：用户确认后服务端重编译并落库 frozenPrompts ──
export function freezeDetailStudioPrompts(id) {
  return apiJson(BASE + "/projects/" + encodeURIComponent(id) + "/planning/freeze", { method: "PUT" }, "冻结提示词失败");
}

// ── B4 质量审查：独立 1 次模型调用 + 一次定向修正 + 再审查（封顶）──
// 模型调用合计 ≤2 次，受服务端 MAX_AUTO_FIX=1 约束，不合格明确交回人工。
export function qualityDetailStudio(id, { apiKey = "", textModel = "" } = {}) {
  return postJson(BASE + "/projects/" + encodeURIComponent(id) + "/planning/quality", { apiKey, textModel }, "质量审查失败");
}

// ── 阶段 4 批量生成与任务管理 ──
// 全部复用现有 /api/images（经服务端内部自调用），不新建第二套图片体系。
// KEY 由 hook 从全局设置读取后透传（本视图不出现 KEY 输入）。
export function startDetailStudioGeneration(id, { apiKey = "", screenIndexes } = {}) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/generation/start",
    { apiKey, screenIndexes },
    "启动批量生成失败"
  );
}

export function getDetailStudioGenerationStatus(id) {
  return apiJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/generation",
    {},
    "读取生成状态失败"
  );
}

// 前端开始生成某屏前：标记任务 RUNNING（面板展示「生成中」）。
export function beginDetailStudioGenerationTask(id, taskId) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/generation/" + encodeURIComponent(taskId) + "/begin",
    {},
    "标记任务开始失败"
  );
}

// 前端出图完成后回写结果：{ outcome: "success", image } | { outcome: "error", error: { status?, name?, message } }
export function writebackDetailStudioResult(id, taskId, body) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/generation/" + encodeURIComponent(taskId) + "/result",
    body,
    "回写生成结果失败"
  );
}

// 把参考图 serve URL 取回为 Blob（前端构造生图 form 的参考文件用）。
// 收口到 api 层（api-layering-check：页面 / 状态层禁止散写 fetch）。同域请求，无需额外鉴权。
export async function fetchReferenceImageBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("参考图读取失败（HTTP " + res.status + "）");
  return res.blob();
}

// 用户态重试：重置任务为 QUEUED 并返回任务（含屏参数），由前端重新直调 generateImages + 回写。
// V212 P1：不再由服务端发起真实出图（generateViaLocalApi 已从用户态生产路径退役）。
export function resetDetailStudioGenerationTask(id, taskId) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/generation/" + encodeURIComponent(taskId) + "/retry",
    {},
    "重试任务失败"
  );
}

export function cancelDetailStudioGenerationTask(id, taskId) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/generation/" + encodeURIComponent(taskId) + "/cancel",
    {},
    "取消任务失败"
  );
}

// ── 阶段 5 单屏连续编辑与版本管理 ──
// 单屏编辑：基于上一版结果继续改，产生新版本 + 一次独立生成任务（绑定 versionId）。
export function editDetailStudioScreen(id, screenIndex, payload) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/screens/" + encodeURIComponent(screenIndex) + "/edit",
    payload,
    "单屏编辑失败"
  );
}

// 生成完成后补齐版本图片（前端轮询 generation 状态成功后调用）。
export function finalizeDetailStudioVersion(id, versionId) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/versions/" + encodeURIComponent(versionId) + "/finalize",
    {},
    "版本落盘失败"
  );
}

// 读取某屏版本列表 + 当前版本 id。
export function getDetailStudioScreenVersions(id, screenIndex) {
  return apiJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/screens/" + encodeURIComponent(screenIndex) + "/versions",
    {},
    "读取版本失败"
  );
}

// 切换当前版本：只改 currentVersionId，不删历史、不覆盖图片。
export function switchDetailStudioVersion(id, screenIndex, versionId) {
  return postJson(
    BASE + "/projects/" + encodeURIComponent(id) + "/screens/" + encodeURIComponent(screenIndex) + "/versions/" + encodeURIComponent(versionId) + "/switch",
    {},
    "切换版本失败"
  );
}
