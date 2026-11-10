// 详情创作「批量生成」出图生成器（V203 阶段 4 · P1）。
//
// 严格「只复用现有 /api/images」：以服务端内部自调用方式 POST 到本进程 /api/images，
// 从而复用其全部既有链路 —— normalizeImageRequest / resolveApiKey / imageChannelBaseCandidates /
// acquireImageSlot（全局 5 并发闸门）/ billing / 持久化。不重新实现任何生图逻辑、不引入第二套 Provider。
//
// 请求体 prompt 直接使用任务记录里的 frozenPrompt（与用户确认的冻结提示词字节一致），
// 不经任何 Skill / Agent / 提示词编译。参考图按 V202 约定带入（三类角色文件作为 multipart image 字段）。
//
// 依赖：node 内置 fetch/FormData/Blob（runtime 24）+ 只读 read PORT from runtime-config。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PORT } from "../../../core/runtime-config.js";

/**
 * @param {{ frozenPrompt:string, model?:string, channelId?:string, apiKey?:string,
 *           imageSize?:string, aspectRatio?:string, referenceImagePaths?:string[] }} req
 * @returns {Promise<{ok:boolean, image?:object, historyItems?:object[], status?:number, message?:string, error_class?:string, uncertain?:boolean}>}
 */
export async function generateViaLocalApi(req) {
  const form = new FormData();
  form.set("prompt", String(req.frozenPrompt || ""));
  form.set("model", String(req.model || "tt-image-2.6"));
  form.set("channelId", String(req.channelId || ""));
  form.set("imageSize", String(req.imageSize || "2K"));
  form.set("aspectRatio", String(req.aspectRatio || "3:4"));
  form.set("n", "1");
  form.set("deferAutoSave", "1"); // 不自动落 history，结果由编排层落到 data/detail-studio/generation/results/
  form.set("source", "detail-main");
  form.set("apiKey", String(req.apiKey || ""));

  for (const p of Array.isArray(req.referenceImagePaths) ? req.referenceImagePaths : []) {
    try {
      const buf = await readFile(p);
      form.append("image", new Blob([buf], { type: "image/png" }), path.basename(p));
    } catch {
      // 单个参考图读不到不阻断整批，跳过该文件
    }
  }

  let res;
  try {
    res = await fetch(`http://127.0.0.1:${PORT}/api/images`, { method: "POST", body: form });
  } catch (err) {
    return { ok: false, name: err?.name, message: err instanceof Error ? err.message : String(err) };
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data || !data.ok) {
    const status = res.status;
    const uncertain = status === 504 || status === 499;
    return {
      ok: false,
      status,
      uncertain,
      error_class: data?.error || (status === 429 ? "rate_limited" : undefined),
      message: data?.message || data?.error || `HTTP ${status}`
    };
  }

  const img = Array.isArray(data.images) && data.images[0] ? data.images[0] : null;
  return { ok: true, image: img, historyItems: data.historyItems };
}
