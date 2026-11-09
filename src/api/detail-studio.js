// src/api/detail-studio.js
// 详情创作工作区唯一请求出口（api-layering-check：页面组件禁止散写 fetch）。
// 图片生成复用现有 /api/images 与现有封装 generateImages，不新建第二套图片体系。

import { apiJson, postJson } from "./client.js";
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
  model = "tt-image-2.5",
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
