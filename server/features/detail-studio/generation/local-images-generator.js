// 详情创作「批量生成」出图生成器（V203 阶段 4 · P1）。
//
// 严格「只复用现有 /api/images」：以服务端内部自调用方式 POST 到本进程 /api/images，
// 从而复用其全部既有链路 —— normalizeImageRequest / resolveApiKey / imageChannelBaseCandidates /
// acquireImageSlot（全局 5 并发闸门）/ billing / 持久化。不重新实现任何生图逻辑、不引入第二套 Provider。
//
// 请求体 prompt 直接使用任务记录里的 frozenPrompt（与用户确认的冻结提示词字节一致），
// 不经任何 Skill / Agent / 提示词编译。参考图按 V202 约定带入（三类角色文件作为 multipart image 字段）。
//
// 🔴 V212-R1 P3：本文件仍服务 V204 单屏编辑 / V208 Tool 层的服务端内部自调用，但
// **FormData 字段集已与前端共享构造器 `src/features/detail/detail-image-form.js` 逐项对齐**
// （baseUrl / apiKey / model / channelId / dispatchMode / prompt / imageSize / aspectRatio /
// n / source / deferAutoSave / referenceMeta / image），不再有第二套私有字段集；
// 由 `detail-studio-image-form-parity-check.mjs` 静态锁定，防止再次漂移。
//
// 依赖：node 内置 fetch/FormData/Blob（runtime 24）+ 只读 read PORT from runtime-config。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PORT } from "../../../core/runtime-config.js";
import { normalizeApiKeyInput } from "../../auth/api-key.js";

const MAX_REFERENCE_FILES = 6;

/**
 * @param {{ frozenPrompt:string, model?:string, channelId?:string, apiKey?:string,
 *           imageSize?:string, aspectRatio?:string, referenceImagePaths?:string[],
 *           referenceRoles?:string[] }} req
 * @returns {Promise<{ok:boolean, image?:object, historyItems?:object[], status?:number, message?:string, error_class?:string, uncertain?:boolean}>}
 */
export async function generateViaLocalApi(req) {
  const form = new FormData();
  // 字段集与 src/features/detail/detail-image-form.js 的 buildDetailImageForm 逐项同构。
  form.set("baseUrl", ""); // 与一键详情默认配置一致，服务端 normalizeImageRequest 回退默认网关
  form.set("deferAutoSave", "1"); // 不自动落 history，结果由编排层落到 data/detail-studio/generation/results/
  form.set("apiKey", normalizeApiKeyInput(req.apiKey || ""));
  form.set("model", String(req.model || "tt-image-2.6"));
  form.set("channelId", String(req.channelId || ""));
  // routingFields 当前恒定返回 "manual"（src/shared/routing.js:573），由 parity 门禁锁定。
  form.set("dispatchMode", "manual");
  form.set("prompt", String(req.frozenPrompt || ""));
  form.set("imageSize", String(req.imageSize || "2K"));
  form.set("aspectRatio", String(req.aspectRatio || "3:4"));
  form.set("n", "1");
  form.set("source", "detail-studio");

  const paths = Array.isArray(req.referenceImagePaths) ? req.referenceImagePaths : [];
  const roles = Array.isArray(req.referenceRoles) ? req.referenceRoles : [];
  const meta = [];
  for (const p of paths) {
    try {
      const buf = await readFile(p);
      const filename = path.basename(p);
      form.append("image", new Blob([buf], { type: "image/png" }), filename);
      meta.push({
        name: filename,
        role: String(roles[meta.length] || roles[0] || "product").slice(0, 32),
        index: meta.length,
        size: buf.length,
        type: "image/png",
        lastModified: 0
      });
    } catch {
      // 单个参考图读不到不阻断整批，跳过该文件
    }
  }
  if (meta.length > 0) {
    form.set("referenceMeta", JSON.stringify(meta.slice(0, MAX_REFERENCE_FILES)));
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

  // 与一键详情 / 前端 extractResultImage 同构：historyItems 优先，其次 images，取 item.image || item。
  const items = Array.isArray(data.historyItems) && data.historyItems.length
    ? data.historyItems
    : (Array.isArray(data.images) ? data.images : []);
  const img = items[0] ? (items[0].image || items[0]) : null;
  return { ok: true, image: img, historyItems: data.historyItems };
}
