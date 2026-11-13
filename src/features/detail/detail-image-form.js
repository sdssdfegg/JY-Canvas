// 共享生图 FormData 构造器（V212 P1 · 出图入口唯一化）。
//
// 一键详情（detail-state.js）与详情创作工作区（use-detail-studio-state.js）共用同一个函数，
// 禁止存在两套 FormData 字段集（V212 §2 裁决①）。字段与一键详情原构造（detail-state.js:419-431）
// 逐项同构：baseUrl / apiKey(normalizeApiKeyInput) / model+channelId+dispatchMode(routingFields)
// / prompt / imageSize / aspectRatio / n / source / referenceMeta / image。
//
// 关键修复：旧工作区私有 form 缺 baseUrl / dispatchMode / referenceMeta，导致上游回
// 「请先上传商品图」bad_request。本函数统一带上三类角色参考图（product / visualStyle /
// contentStructure），与一键详情一致。

import { routingFields } from "../../shared/routing.js";
import { normalizeApiKeyInput } from "../auth/api-key.js";
import { prepareImageFilesForChannel } from "../upload/reference-upload.js";

const MAX_REFERENCE_FILES = 6;

/**
 * 构造 /api/images 的 multipart FormData。
 * @param {object} opts
 * @param {string} opts.apiKey 原始 KEY（函数内部做 normalizeApiKeyInput）
 * @param {string} opts.prompt 提示词（应与冻结提示词字节一致）
 * @param {string} opts.model 图片模型
 * @param {string} opts.channelId 渠道（空则由 routingFields 兜底合法线路）
 * @param {string} [opts.imageSize]
 * @param {string} [opts.aspectRatio]
 * @param {number} [opts.n]
 * @param {string} [opts.source] 白名单值：detail-main / detail-studio
 * @param {string} [opts.baseUrl] 网关地址；缺省空串（与一键详情默认配置一致，服务端回退默认网关）
 * @param {boolean} [opts.deferAutoSave] 仅工作区为 true：不自动落全局 history，由工作区自行持久化
 * @param {Array<{file: File|Blob, role?: string}>} [opts.referenceFiles] 参考图（含角色）
 * @returns {Promise<FormData>}
 */
export async function buildDetailImageForm({
  apiKey = "",
  prompt = "",
  model = "tt-image-2.6",
  channelId = "",
  imageSize = "2K",
  aspectRatio = "3:4",
  n = 1,
  source = "detail-main",
  baseUrl = "",
  deferAutoSave = false,
  referenceFiles = []
} = {}) {
  const fields = routingFields(model, channelId);
  const form = new FormData();
  // V212-R1 P2：一键详情总是发送 baseUrl（缺省空串），此前 `if (baseUrl)` 会让工作区请求
  // 从不带该字段，造成两套字段集漂移。空串由服务端 normalizeImageRequest 回退默认网关。
  form.set("baseUrl", String(baseUrl ?? ""));
  if (deferAutoSave) form.set("deferAutoSave", "1");
  form.set("apiKey", normalizeApiKeyInput(apiKey));
  form.set("model", fields.model);
  form.set("channelId", fields.channelId);
  form.set("dispatchMode", fields.dispatchMode);
  form.set("prompt", prompt);
  form.set("imageSize", imageSize);
  form.set("aspectRatio", aspectRatio);
  form.set("n", String(n));
  form.set("source", source);

  // 参考图：三类角色经 referenceMeta 上报，杜绝「缺商品图」类 bad_request（V212 §P1.4）。
  const files = [];
  const meta = [];
  for (const item of referenceFiles) {
    const file = item && item.file;
    if (!file) continue;
    const role = (item.role || "reference").slice(0, 32);
    meta.push({
      name: file.name || `reference-${meta.length + 1}`,
      role,
      index: meta.length,
      size: file.size || 0,
      type: file.type || "",
      lastModified: file.lastModified || 0
    });
    files.push(file);
  }
  if (meta.length > MAX_REFERENCE_FILES) meta.length = MAX_REFERENCE_FILES;
  if (meta.length > 0) {
    form.set("referenceMeta", JSON.stringify(meta));
  }

  if (files.length > 0) {
    const upload = await prepareImageFilesForChannel(files.slice(0, MAX_REFERENCE_FILES));
    upload.files.forEach((f) => form.append("image", f, f.name));
  }

  return form;
}
