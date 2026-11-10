// src/api/detail-studio.js
// 详情创作工作区唯一请求出口（api-layering-check：页面组件禁止散写 fetch）。
// 图片生成复用现有 /api/images 与现有封装 generateImages，不新建第二套图片体系。

import { apiJson, postForm, postJson } from "./client.js";
import { generateImages } from "./images.js";
import { routingFields } from "../shared/routing.js";

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

// 按现有 POST /api/images 契约拼 FormData（字段与 server/channel.js 归一化口径一致）。
// source 沿用现有白名单值 detail-main；routingFields 保证 channelId 落在合法线路。
export function buildDetailStudioImageForm({
  apiKey = "",
  prompt = "",
  model = "tt-image-2.6",
  channelId = "",
  imageSize = "2K",
  aspectRatio = "3:4"
} = {}) {
  const fields = routingFields(model, channelId);
  const form = new FormData();
  form.set("prompt", prompt);
  form.set("model", fields.model);
  form.set("channelId", fields.channelId);
  form.set("dispatchMode", fields.dispatchMode);
  form.set("imageSize", imageSize);
  form.set("aspectRatio", aspectRatio);
  form.set("n", "1");
  form.set("deferAutoSave", "1");
  form.set("source", "detail-main");
  form.set("apiKey", apiKey);
  return form;
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
export function qualityDetailStudio(id, { apiKey = "" } = {}) {
  return postJson(BASE + "/projects/" + encodeURIComponent(id) + "/planning/quality", { apiKey }, "质量审查失败");
}
