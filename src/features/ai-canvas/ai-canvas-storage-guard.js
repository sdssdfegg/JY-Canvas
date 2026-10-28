// src/features/ai-canvas/ai-canvas-storage-guard.js
// V143：画布持久化的**失败可见化**（纯逻辑，零 import，便于无头断言）。
//
// 为什么需要：画布把图片以 dataURL 存进 localStorage，而 json-storage.js 的
// writeJsonStorage 会吞掉异常只回 false；画布那边若不看返回值，配额写满时就是
// **静默停止持久化** —— 用户以为在自动保存，刷新后工作成果全没了。
// 「悄悄丢数据」是最坏的故障形态，宁可吵，不可静。
//
// 本模块只做两件事：把失败分类成可读原因，并给中文处置建议。它不负责写入本身。

// 没有 STORAGE_OK：写成功就用空消息表示（视图据此不显示告警），多一个常量反而是死导出。
export const STORAGE_QUOTA = "quota";
export const STORAGE_UNAVAILABLE = "unavailable";
export const STORAGE_UNKNOWN = "unknown";

// 各浏览器上报超限的方式不统一：DOMException.name / legacy code / 老式 message 都要认。
export function classifyStorageError(error) {
  const name = String(error?.name || "");
  const code = Number(error?.code);
  const text = String(error?.message || error || "").toLowerCase();
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return STORAGE_QUOTA;
  if (code === 22 || code === 1014) return STORAGE_QUOTA;
  if (/quota|exceed|超出|配额|超出配额/.test(text)) return STORAGE_QUOTA;
  if (name === "SecurityError" || /denied|disabled|隐私|禁用/.test(text)) return STORAGE_UNAVAILABLE;
  return STORAGE_UNKNOWN;
}

// 面向用户的中文处置建议：不只说"失败了"，要说清该做什么。
export function messageForFailure(kind) {
  if (kind === STORAGE_QUOTA) {
    return "本地存储已满，画布最新改动没能保存：请删掉不用的画布项目或图片节点再继续。";
  }
  if (kind === STORAGE_UNAVAILABLE) {
    return "浏览器不允许写入本地存储（可能是隐私模式），画布改动无法保存。";
  }
  return "画布保存失败，最新改动可能没写入本地存储：建议先删掉不用的画布项目再试。";
}

// 粗估项目占用的字节数（图片 dataURL 是绝对大头），给用户一个"用掉多少"的直观数字。
export function estimateProjectsBytes(projects = []) {
  let total = 0;
  for (const project of projects || []) {
    for (const node of project?.nodes || []) {
      total += String(node?.data?.src || node?.data?.url || "").length;
      total += String(node?.data?.text || node?.data?.prompt || "").length;
    }
    total += 512; // 项目结构与连线的开销粗估
  }
  return total;
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
