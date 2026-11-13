// 详情创作「用户态批量 / 单屏生成」前端编排（V212 P1 · 出图入口唯一化）。
//
// 与一键详情共用同一个 generateImages 入口（src/api/images.js → POST /api/images），
// 禁止存在第二套 FormData 字段集（V212 §2 裁决①）。本模块只负责：
//   1) 把服务端 registerBatch 返回的每屏规格构造成 buildDetailStudioImageForm；
//   2) 逐屏（≤5 并发，与 /api/images 全局 5 并发一致）前端直调 generateImages；
//   3) 按 begin → 回写 success/error 把结果写回服务端任务记录。
// 服务端不再自发真实出图（generateViaLocalApi 已从用户态生产路径退役）。
//
// 失败隔离：单屏失败只写该任务（FAILED / NEEDS_CONFIRM 由服务端 classifyError 判定），
// 不影响其它屏；每屏结果经 POST /generation/:taskId/result 回写，前端轮询可见。

import { generateImages } from "../../../api/images.js";
import {
  beginDetailStudioGenerationTask,
  buildDetailStudioImageForm,
  fetchReferenceImageBlob,
  resetDetailStudioGenerationTask,
  writebackDetailStudioResult
} from "../../../api/detail-studio.js";
import { normalizeGenerationErrorText } from "../../../shared/generation-errors.js";

// 与 /api/images 全局 5 并发一致，避免一次性发起过多浏览器请求。
const MAX_CONCURRENCY = 5;

// 从 /api/images 返回体里取第一张结果图（与 detail-state.js 同构：historyItems || images）。
function extractResultImage(payload) {
  const items = Array.isArray(payload?.historyItems) && payload.historyItems.length
    ? payload.historyItems
    : (Array.isArray(payload?.images) ? payload.images : []);
  const entry = items[0];
  if (!entry) return null;
  return entry.image || entry;
}

// 把参考图 serve URL 列表拉成 Blob，供 buildDetailImageForm 作为参考文件（同域 fetch）。
async function loadReferenceBlobs(referenceImages) {
  const list = Array.isArray(referenceImages) ? referenceImages : [];
  const files = [];
  await Promise.all(list.map(async (r) => {
    if (!r || !r.url) return;
    try {
      const blob = await fetchReferenceImageBlob(r.url);
      if (blob && blob.size > 0) {
        // V212-R1 P2：Blob 没有 name，会让共享 form 的 referenceMeta.name 退化为占位名；
        // 还原服务端返回的真实文件名，与一键详情的 File 上传同构（上游按角色/文件名识别参考图）。
        const filename = String(r.filename || r.name || "reference.png");
        const file = typeof File === "function"
          ? new File([blob], filename, { type: blob.type || "image/png" })
          : blob;
        files.push({ file, role: r.role || "reference" });
      }
    } catch {
      // 单张拉取失败不阻断整批，跳过
    }
  }));
  return files;
}

// 单屏：begin → generateImages → 回写 success/error。失败也回写（终态由服务端判定）。
async function runOneScreen(projectId, spec, apiKey, referenceFiles) {
  const form = await buildDetailStudioImageForm({
    apiKey,
    prompt: spec.frozenPrompt,
    model: spec.model,
    channelId: spec.channelId,
    imageSize: spec.imageSize,
    aspectRatio: spec.aspectRatio,
    n: 1,
    source: "detail-studio",
    referenceFiles
  });
  await beginDetailStudioGenerationTask(projectId, spec.taskId);
  try {
    const payload = await generateImages(form);
    const image = extractResultImage(payload);
    if (!image) throw new Error("接口返回成功，但没有解析到图片");
    await writebackDetailStudioResult(projectId, spec.taskId, { outcome: "success", image });
  } catch (err) {
    const message = normalizeGenerationErrorText(err, {});
    await writebackDetailStudioResult(projectId, spec.taskId, {
      outcome: "error",
      error: { status: err?.status, name: err?.name, message }
    });
    throw err; // 让外层计数（不影响其它屏）
  }
}

// 批量：≤5 并发逐屏直调 generateImages + 回写。不阻塞调用方（按钮在注册后即恢复可用）。
export async function runDetailStudioBatchGeneration({ projectId, specs, apiKey, referenceImages, onNotice }) {
  const referenceFiles = await loadReferenceBlobs(referenceImages);
  let cursor = 0;
  let success = 0;
  let failed = 0;
  const worker = async () => {
    while (cursor < specs.length) {
      const spec = specs[cursor++];
      try {
        await runOneScreen(projectId, spec, apiKey, referenceFiles);
        success++;
      } catch {
        failed++;
      }
    }
  };
  const workers = [];
  const n = Math.min(MAX_CONCURRENCY, specs.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  const summary = `批量生成完成：成功 ${success} 屏，失败 ${failed} 屏。`;
  if (onNotice) onNotice(summary);
  return { success, failed };
}

// 单屏重试（用户态）：重置为 QUEUED → 前端重新直调 generateImages → 回写。
export async function runDetailStudioScreenRetry({ projectId, taskId, apiKey, referenceImages, onError }) {
  const task = await resetDetailStudioGenerationTask(projectId, taskId);
  const spec = {
    taskId,
    frozenPrompt: task?.frozenPrompt,
    model: task?.model,
    channelId: task?.channelId,
    imageSize: task?.imageSize,
    aspectRatio: task?.aspectRatio
  };
  const referenceFiles = await loadReferenceBlobs(referenceImages);
  try {
    await runOneScreen(projectId, spec, apiKey, referenceFiles);
  } catch (err) {
    if (onError) onError(err?.message || "重试失败");
    throw err;
  }
  return task;
}
