// 诊断日志层：把一次出图请求的每个阶段写到 <数据根目录>/logs 下的文件里。
//
// 从 server/index.js 原样搬来（按行区间机器切割），**没有任何逻辑改动**。
//
// 为什么单独成文件：它自成一套闭环（格式化 → 按阶段过滤 → 按任务分文件 → 轮转），
// 跟路由、跟上传、跟计费都没有耦合。留在主文件里只会淹没在五千行中间。
//
// 产出物有三类，别的位置别再手写第二份：
//   logs/generation.jsonl              每次请求的 JSONL 流水
//   logs/tasks/<日期>/<任务ID>.txt     给人看的单任务诊断报告
//   logs/runtime-errors.log            进程级异常（未捕获异常 / 未处理拒绝）
//
// 隐私约定（历史决策，不要破坏）：
//   单任务诊断日志只记阶段、耗时、数量、大小和错误摘要；
//   **绝不能写入 API Key、图片 base64 或完整图片数据**。
//   一个任务一个文件，靠 requestId 归集，方便让用户把整个文件发过来排查。

import { existsSync } from "node:fs";
import { appendFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./app-paths.js";
import { ASSET_LOG_MAX_BYTES, GENERATION_LOG_MAX_BYTES, RUNTIME_LOG_MAX_BYTES } from "./runtime-config.js";
import { compactLogMessage, localDateFolder, localDateTime, readableBytes, readableMs, sanitizeFilePart } from "./format-utils.js";

// ── 任务文本日志「写失败」的可见化（V30）───────────────────────────────────
// appendTaskTextLog 以前失败是完全静默的（`.catch(() => {})`），导致「单任务 txt 没生成」
// 无法区分下面两种性质完全不同的情况：
//   · 按设计跳过 —— requestId 为空 / client_ 前缀 / 阶段不在白名单（合法行为，不是故障）
//   · 想写没写成 —— mkdir 或 appendFile 真抛错（权限、磁盘满、路径非法、并发竞态）
// 这里只把第二种落到 runtime-errors.log，让它在排查时留得下信号。
//
// 为什么必须节流：本函数处在出图关键路径上，如果 txt 持续写失败（比如磁盘满），
// 每次请求都落一条会把故障放大成日志风暴，反而更难排查。
// ⇒ 同一类错误（按 error.code 分桶）最多每 60 秒落 1 条，期间次数累加进 suppressed。
// ⚠️ 只做观测：绝不改 taskTextLogPath 的跳过规则，也绝不让 txt 失败影响主流程。
const TASK_TEXT_FAULT_THROTTLE_MS = 60 * 1000;
const taskTextFaultBuckets = new Map();

export async function writeGenerationLog(entry) {
  if (process.env.JINGYIN_DISABLE_GENERATION_LOGS === "1") return;
  const logDir = path.join(rootDir, "logs");
  const logFile = path.join(logDir, "generation.jsonl");
  await mkdir(logDir, { recursive: true });
  await rotateLogFileIfNeeded(logFile, GENERATION_LOG_MAX_BYTES);
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
  // 单任务 txt 是「诊断用」的旁路产物：它写失败绝不能影响出图主流程，
  // 所以这里必须保留 .catch()，只是把以前吞掉的错误改成留一条可追溯的记录。
  await appendTaskTextLog(entry).catch((error) => {
    reportTaskTextLogFault(entry, error).catch(() => {});
  });
}

export async function rotateLogFileIfNeeded(file, maxBytes) {
  const info = await stat(file).catch(() => null);
  if (!info || info.size <= maxBytes) return;
  const rotated = `${file}.1`;
  await unlink(rotated).catch(() => {});
  await rename(file, rotated).catch(async () => {
    await writeFile(file, "", "utf8").catch(() => {});
  });
}

export function safeTaskLogId(value) {
  const id = String(value || "").trim();
  return sanitizeFilePart(id || `task_${Date.now()}`).slice(0, 120) || `task_${Date.now()}`;
}

export function safeTaskLogRequestId(entry) {
  const detailRequestId = entry?.detail && typeof entry.detail === "object"
    ? String(entry.detail.requestId || entry.detail.taskId || "")
    : "";
  return detailRequestId || String(entry?.requestId || "");
}

export function taskTextLogPath(entry) {
  const requestId = safeTaskLogRequestId(entry);
  if (!requestId || /^client_load_|^client_error_|^client_rejection_/i.test(requestId)) return "";
  const time = entry?.time ? Date.parse(entry.time) : Date.now();
  const folder = path.join(rootDir, "logs", "tasks", localDateFolder(Number.isFinite(time) ? time : Date.now()));
  return path.join(folder, `${safeTaskLogId(requestId)}.txt`);
}

export function taskLogUrl(value) {
  const text = String(value || "");
  if (!text) return "";
  try {
    const parsed = new URL(text);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return text.split("?")[0].slice(0, 180);
  }
}

export function taskLogStageTitle(stage) {
  return ({
    "client-generation-submit": "前端点击生成，准备提交",
    "client-generation-response": "前端收到本地接口响应",
    "client-generation-error": "前端生成请求失败",
    "client-generation-local-paste-composed": "局部回贴贴回合成完成",
    "client-result-display-ready": "前端结果图已完成显示准备",
    "local-request-received": "本地服务收到生成请求",
    "local-request-aborted": "本地请求被中断",
    "local-response-finished": "本地服务响应结束",
    "local-api-images-request-prepared": "快捷生成参数与上传文件解析完成",
    "local-outfit-request-prepared": "批量生成参数与上传文件解析完成",
    "smart-intervention-start": "智能干预/锚点分析开始",
    "smart-intervention-finished": "智能干预/锚点分析完成",
    "smart-intervention-failed": "智能干预/锚点分析失败并回退",
    "image-slot-acquired": "本地并发队列已放行",
    "forward-api-images-request": "开始转发快捷生成到中转站",
    "forward-outfit-request": "开始转发批量生成到中转站",
    "generate-outfit": "中转站批量生成返回",
    "upstream-api-images-ready": "中转站快捷生成已返回图片",
    "upstream-outfit-images-ready": "中转站批量生成已返回图片",
    "display-cache-base64-history-image": "结果图写入本地历史缓存",
    "display-cache-url-history-image": "结果图下载并写入本地历史缓存",
    "display-cache-history-image-deferred": "结果图本地缓存较慢，已改后台处理",
    "display-cache-outfit-result-image": "批量结果图下载/本地缓存",
    "background-display-cache-outfit-result-image": "批量结果图后台缓存完成",
    "local-api-images-response-ready": "快捷生成结果已准备返回前端",
    "local-outfit-response-ready": "批量生成结果已准备返回前端",
    "api-images-background-persist": "快捷生成后台保存完成",
    "background-cache-outfit-result-image": "批量结果图后台缓存完成"
  })[stage] || stage || "未命名阶段";
}

export function taskLogLines(entry) {
  const stage = String(entry?.stage || "");
  if (!stage) return [];
  const allowed = /^client-generation-|^client-result-display-ready$|^local-|^smart-intervention-|^image-slot-acquired$|^forward-|^generate-outfit$|^upstream-|^display-cache-|^background-display-cache-|^background-cache-outfit-|^api-images-background-persist$/.test(stage);
  if (!allowed) return [];

  const lines = [
    "",
    "------------------------------------------------------------",
    `时间：${localDateTime(entry?.time ? Date.parse(entry.time) : Date.now())}`,
    `阶段：${taskLogStageTitle(stage)}`
  ];
  if (entry.endpoint) lines.push(`本地接口：${entry.endpoint}`);
  if (entry.method) lines.push(`方法：${entry.method}`);
  if (entry.status !== undefined) lines.push(`状态码：${entry.status}`);
  if (entry.ok !== undefined) lines.push(`结果：${entry.ok ? "成功/继续" : "失败/异常"}`);
  if (entry.model || entry.requestedModel) lines.push(`模型：${entry.model || entry.requestedModel}`);
  if (entry.imageSize || entry.aspectRatio) lines.push(`尺寸：${entry.imageSize || "-"} / ${entry.aspectRatio || "-"}`);
  if (entry.workflowMode) lines.push(`板块模式：${entry.workflowMode}`);
  if (entry.n !== undefined) lines.push(`生成数量：${entry.n}`);
  if (entry.fileCount !== undefined) lines.push(`上传图片数：${entry.fileCount}`);
  if (entry.uploadBytes !== undefined) lines.push(`上传图片总大小：${readableBytes(entry.uploadBytes)}`);
  // V38 诊断：以前只能靠"前端上传文件数 3 vs 服务端上传图片数 2"反推有没有蒙版，有了这行不用猜。
  // maskBytes > 0 视为"有蒙版"（蒙版是 multer 的 mask 字段，只有 maskEdit 时才会有）。
  if (entry.maskBytes !== undefined) {
    const maskBytes = Number(entry.maskBytes) || 0;
    lines.push(`上传蒙版：${maskBytes > 0 ? `有（${readableBytes(maskBytes)}）` : "无"}`);
  }
  if (entry.contentLength !== undefined) lines.push(`本地请求体大小：${readableBytes(entry.contentLength)}`);
  if (entry.promptChars !== undefined || entry.promptBytes !== undefined) {
    lines.push(`提示词长度：${entry.promptChars || 0} 字 / ${readableBytes(entry.promptBytes || 0)}`);
  }
  if (entry.url) lines.push(`请求地址：${taskLogUrl(entry.url)}`);
  if (entry.channelId || entry.channelLabel) lines.push(`中转站/渠道：${entry.channelLabel || entry.channelId}`);
  if (entry.attempt !== undefined) lines.push(`尝试次数：${entry.attempt}`);
  if (entry.imageCount !== undefined) lines.push(`返回图片数：${entry.imageCount}`);
  if (entry.localDisplayCount !== undefined) lines.push(`本地展示缓存数：${entry.localDisplayCount}`);
  if (entry.bytes !== undefined) lines.push(`结果图大小：${readableBytes(entry.bytes)}`);
  if (entry.localUploadParseMs !== undefined) lines.push(`上传到本地/解析文件：${readableMs(entry.localUploadParseMs)}`);
  if (entry.queueWaitMs !== undefined) lines.push(`本地并发排队：${readableMs(entry.queueWaitMs)}`);
  if (entry.durationMs !== undefined) lines.push(`前端请求耗时：${readableMs(entry.durationMs)}`);
  if (entry.timingMs !== undefined) lines.push(`本阶段耗时：${readableMs(entry.timingMs)}`);
  if (entry.displayCacheMs !== undefined) lines.push(`结果图下载/缓存耗时：${readableMs(entry.displayCacheMs)}`);
  if (entry.totalMs !== undefined) lines.push(`累计总耗时：${readableMs(entry.totalMs)}`);
  if (entry.timing && typeof entry.timing === "object") {
    if (entry.timing.channelWaitMs !== undefined) lines.push(`等待中转站/上游：${readableMs(entry.timing.channelWaitMs)}`);
    if (entry.timing.parseMs !== undefined) lines.push(`解析中转站响应：${readableMs(entry.timing.parseMs)}`);
    if (entry.timing.totalMs !== undefined) lines.push(`本地累计：${readableMs(entry.timing.totalMs)}`);
  }
  if (entry.upstreamChannelWaitMs !== undefined) lines.push(`等待中转站/上游：${readableMs(entry.upstreamChannelWaitMs)}`);
  if (entry.postParseMs !== undefined) lines.push(`中转站返回后本地处理：${readableMs(entry.postParseMs)}`);
  if (entry.timeoutMs !== undefined) lines.push(`本阶段超时上限：${readableMs(entry.timeoutMs)}`);
  if (entry.hasLocalDisplayImage !== undefined) lines.push(`是否已有本地展示图：${entry.hasLocalDisplayImage ? "是" : "否"}`);
  if (entry.autoSavedCount !== undefined) lines.push(`自动保存数量：${entry.autoSavedCount}`);

  const detail = entry.detail && typeof entry.detail === "object" ? entry.detail : null;
  if (detail) {
    if (detail.payload?.workflowMode) lines.push(`前端板块模式：${detail.payload.workflowMode}`);
    if (detail.payload?.model) lines.push(`前端模型：${detail.payload.model}`);
    if (detail.payload?.imageSize || detail.payload?.aspectRatio) lines.push(`前端尺寸：${detail.payload.imageSize || "-"} / ${detail.payload.aspectRatio || "-"}`);
    if (detail.fileCount !== undefined) lines.push(`前端上传文件数：${detail.fileCount}`);
    if (detail.fileBytes !== undefined) lines.push(`前端上传文件大小：${readableBytes(detail.fileBytes)}`);
    if (detail.imageCount !== undefined) lines.push(`前端收到图片数：${detail.imageCount}`);
    if (detail.displayMs !== undefined) lines.push(`前端展示准备耗时：${readableMs(detail.displayMs)}`);
    if (detail.placement) lines.push(`前端展示位置：${detail.placement}`);
    if (detail.module) lines.push(`前端模块：${detail.module}`);
    if (detail.workflowMode) lines.push(`前端工作流：${detail.workflowMode}`);
    if (detail.sourceType) lines.push(`前端图片来源：${detail.sourceType}`);
    if (detail.message) lines.push(`前端信息：${compactLogMessage(detail.message, 260)}`);
    // 局部回贴尺寸对账单：底图（= 我给的图）/ 选框 / 贴回输出，
    // 用于核对"给多少尺寸 → 返回多少尺寸"，以及排查贴回偏移。
    const localPaste = detail.localPaste && typeof detail.localPaste === "object" ? detail.localPaste : null;
    if (localPaste) {
      if (detail.baseName) lines.push(`贴回底图：${compactLogMessage(detail.baseName, 120)}`);
      if (localPaste.base) lines.push(`贴回底图尺寸：${localPaste.base}`);
      if (localPaste.uploadCopy) lines.push(`上传副本尺寸：${localPaste.uploadCopy}`);
      if (localPaste.rect) lines.push(`选框尺寸：${localPaste.rect}${localPaste.rectAt ? ` @ (${localPaste.rectAt})` : ""}`);
      if (localPaste.output) lines.push(`贴回输出尺寸：${localPaste.output}`);
      if (localPaste.matches !== undefined) {
        lines.push(`尺寸一致性：${localPaste.matches ? "输出与底图同尺寸" : "输出与底图不一致（异常，请反馈）"}`);
      }
    }
  }

  const error = entry.error || entry.upstreamError || entry.message;
  if (error) lines.push(`错误/备注：${compactLogMessage(error, 360)}`);
  return lines;
}

export async function appendTaskTextLog(entry) {
  const file = taskTextLogPath(entry);
  if (!file) return;
  const lines = taskLogLines(entry);
  if (lines.length === 0) return;
  await mkdir(path.dirname(file), { recursive: true });
  const exists = existsSync(file);
  const header = exists ? "" : [
    "============================================================",
    "静音AI绘画 - 单任务诊断日志",
    `任务ID：${safeTaskLogRequestId(entry)}`,
    `创建时间：${localDateTime(entry?.time ? Date.parse(entry.time) : Date.now())}`,
    "说明：本日志只记录阶段、耗时、数量、大小和错误摘要；不会记录 API Key、图片 base64 编码或完整图片数据。",
    "============================================================",
    ""
  ].join("\n");
  await appendFile(file, `${header}${lines.join("\n")}\n`, "utf8");
}

export async function writeRuntimeFaultLog(entry) {
  const logDir = path.join(rootDir, "logs");
  const logFile = path.join(logDir, "runtime-errors.log");
  await mkdir(logDir, { recursive: true });
  await rotateLogFileIfNeeded(logFile, RUNTIME_LOG_MAX_BYTES);
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
}

/** 把「单任务 txt 想写没写成」记进 runtime-errors.log（同类错误 60 秒内最多 1 条）。
 * 只做观测：本函数返回的 promise 永不 reject，调用方可以放心 fire-and-forget。 */
export async function reportTaskTextLogFault(entry, error) {
  const bucket = String(error?.code || error?.name || "unknown");
  const now = Date.now();
  const state = taskTextFaultBuckets.get(bucket) || { lastAt: 0, suppressed: 0 };
  state.suppressed += 1;
  if (now - state.lastAt < TASK_TEXT_FAULT_THROTTLE_MS) {
    taskTextFaultBuckets.set(bucket, state);
    return;
  }
  state.lastAt = now;
  const pending = state.suppressed;
  state.suppressed = 0;
  taskTextFaultBuckets.set(bucket, state);
  await writeRuntimeFaultLog({
    time: new Date().toISOString(),
    ok: false,
    stage: "task-text-log-write-failed",
    requestId: entry?.requestId || null,
    endpoint: entry?.endpoint || null,
    error: String(error?.message || error).slice(0, 1000),
    bucket,
    // 本次之前被节流吞掉的同桶次数（>0 说明这不是偶发，是持续失败）
    suppressed: Math.max(0, pending - 1)
  }).catch(() => {});
}

export async function writeAssetLog(entry) {
  const logDir = path.join(rootDir, "logs");
  const logFile = path.join(logDir, "asset-errors.jsonl");
  await mkdir(logDir, { recursive: true });
  await rotateLogFileIfNeeded(logFile, ASSET_LOG_MAX_BYTES);
  await appendFile(logFile, `${JSON.stringify(entry)}\n`, "utf8");
}

export function processFaultMessage(error) {
  if (error instanceof Error) return error.stack || error.message;
  if (error && typeof error === "object" && "reason" in error) return processFaultMessage(error.reason);
  return String(error || "");
}

export function logProcessFault(stage, error) {
  const message = processFaultMessage(error);
  console.error(`[${stage}]`, message);
  const entry = {
    time: new Date().toISOString(),
    ok: false,
    stage,
    error: message.slice(0, 4000)
  };
  writeRuntimeFaultLog(entry).catch(() => {});
  writeGenerationLog(entry).catch(() => {});
}