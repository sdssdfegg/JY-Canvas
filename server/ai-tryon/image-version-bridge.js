// 图片版本写入桥（P2-4）：把一次 generate-outfit 出口结果落盘为一条图片版本记录，
// 并把成功出口的本地结果图**固化**进永久版本资产目录（脱离 resultDir 的 TTL 清理）。
//
// 边界（严守执行单 §1.1 / §1.2 / §5）：
//   - **绝不阻断生成**（P0 生命线：快捷/批量生成/批量换装/局部回贴）——
//     所有写操作失败都吞掉并只落日志，绝不向上抛；后台链路挂载，不占响应时间。
//   - 只调用 V170 交付的 image-version-store（只调用不改）；不碰生成链路、不改任何响应体字段。
//   - 资产固化红线：只**复制**已落盘的本地结果文件进永久目录，**绝不删除 / 迁移任何既有 results/ 文件**。
//   - 敏感键剥离交给 store 的 stripSensitiveKeys；本桥只传非敏感 execution_params（绝不传入 apiKey）。
//
// 存储可注入（recordOutfitImageVersion 的 store 参数）：默认走真存储；单测/验收可注入假存储。

import { copyFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { aiTryonImageVersionAssetsDir, resultDir } from "../core/app-paths.js";
import { appendImageVersion } from "./image-version-store.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import { compactLogMessage } from "../core/format-utils.js";

/**
 * 把成功出口的本地结果图固化进永久版本资产目录（脱离 resultDir 的 TTL 清理）。
 * 只在本地结果文件已落盘时复制；否则返回 null（不把 TTL 引用当永久资产写进版本记录）。
 * @param {object} [displayImage] outfit.routes 成功出口的 displayImage（含 localUrl）
 * @returns {Promise<string|null>} 固化后的资产文件名，或 null（未固化）
 */
async function cureResultAsset(displayImage) {
  if (!displayImage || typeof displayImage.localUrl !== "string") return null;
  const raw = displayImage.localUrl.split("?")[0];
  const m = /^\/api\/result\/(.+)$/.exec(raw);
  if (!m) return null;
  const filename = path.basename(decodeURIComponent(m[1]));
  const src = path.join(resultDir, filename);
  // 路径穿越防护：只允许落在 resultDir 内。
  if (!path.resolve(src).startsWith(path.resolve(resultDir) + path.sep)) return null;
  try {
    const info = await stat(src);
    if (!info.isFile()) return null;
    const ext = path.extname(filename) || ".png";
    const assetName = `${randomUUID()}${ext}`;
    await mkdir(aiTryonImageVersionAssetsDir, { recursive: true });
    await copyFile(src, path.join(aiTryonImageVersionAssetsDir, assetName));
    return assetName;
  } catch {
    return null;
  }
}

/** 输入素材引用：只取名字/大小，绝不取 buffer（对齐 route-inlay 的 assetRef 红线）。 */
function inputRefs(files) {
  if (!Array.isArray(files)) return [];
  return files
    .map((f) => ({
      type: "image",
      name: String(f.originalname || f.filename || "").slice(0, 160),
      bytes: Number(f.size) || 0
    }))
    .filter((r) => r.name || r.bytes);
}

/**
 * 从一次 generate-outfit 出口结果写一条图片版本（成功或失败）。
 * 永不抛出：任何失败都吞掉并落日志，绝不阻断生成响应（P0 生命线）。
 * @param {object} outcome
 * @param {string} outcome.taskId 换装任务 id（无则跳过记录）
 * @param {string} [outcome.requestId]
 * @param {boolean} outcome.ok 是否成功
 * @param {string} [outcome.model]
 * @param {string} [outcome.channel]
 * @param {object} [outcome.displayImage] 成功出口的本地显示图（用于固化）
 * @param {Array} [outcome.files] 上传文件（取名字/大小）
 * @param {string} [outcome.userInstruction] 用户本轮指令（纯文本）
 * @param {object} [outcome.modelAndVersions]
 * @param {object} [outcome.executionParams] 非敏感执行参数
 * @param {string} [outcome.error] 失败信息
 * @param {object} [store] 注入用（单测/验收）
 * @returns {Promise<object|null>}
 */
export async function recordOutfitImageVersion(outcome = {}, store = { appendImageVersion }) {
  const taskId = outcome && outcome.taskId;
  if (!taskId) return null;
  const append = store.appendImageVersion || appendImageVersion;
  try {
    const ok = outcome.ok === true;
    const resultAssetRef = ok ? await cureResultAsset(outcome.displayImage) : null;
    return await append({
      task_id: String(taskId),
      parent_version_id: null,
      input_asset_refs: inputRefs(outcome.files),
      result_asset_ref: resultAssetRef,
      user_instruction:
        typeof outcome.userInstruction === "string" && outcome.userInstruction.trim()
          ? outcome.userInstruction.slice(0, 2000)
          : null,
      model_and_versions:
        outcome.modelAndVersions && typeof outcome.modelAndVersions === "object"
          ? outcome.modelAndVersions
          : outcome.model
            ? { model: outcome.model, channel: outcome.channel || null }
            : null,
      execution_params:
        outcome.executionParams && typeof outcome.executionParams === "object" ? outcome.executionParams : null,
      status: ok ? "succeeded" : "failed",
      error: ok ? null : outcome.error != null ? compactLogMessage(outcome.error, 500) : null
    });
  } catch (error) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      ok: false,
      stage: "image-version-record-failed",
      requestId: (outcome && outcome.requestId) || null,
      message: compactLogMessage(error, 300)
    }).catch(() => {});
    return null;
  }
}

/**
 * 后台版版本写入（对齐 settleTryOnTaskInBackground / finalizeBillingInBackground 惯例）：
 * 不占响应时间、不阻断响应。
 * @param {object} [outcome]
 */
export function recordOutfitImageVersionInBackground(outcome = {}) {
  if (!outcome || !outcome.taskId) return;
  void recordOutfitImageVersion(outcome).catch(() => {});
}
