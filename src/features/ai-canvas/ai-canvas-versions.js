// src/features/ai-canvas/ai-canvas-versions.js
// V143 MVP-6：生成结果**版本管理**（纯逻辑，零 import，便于无头断言）。
//
// 为什么要它：电商改图是「改提示词 → 重跑 → 对比」的循环。只留最新一张的话，
// 一旦重跑更差就没法回头，只能再烧一次额度重跑。所以每个生成节点保留若干版结果，
// 可来回切换；**下游链路永远吃「当前选中」的那一版**（resultUrl 跟着切）。
//
// 为什么零 import：与 ai-canvas-workflow.js 同理，纯逻辑必须能被引擎与无头脚本直接断言
// （ai-canvas-store.js 带 React，进不了纯 node）。

export const MAX_VERSIONS = 12;

export function versionList(data) {
  return Array.isArray(data?.results) ? data.results : [];
}

// 追加一版。超出上限丢最旧的一版——连续微调很少回头看十几版以前，
// 而且结果图按 dataURL/URL 存在项目里，无限堆积会撑爆 localStorage。
export function appendVersion(data, { url, usedModel, prompt }) {
  if (!url) {
    return { ...data, status: "failed", error: "生成结果地址为空" };
  }
  const list = versionList(data);
  const entry = {
    url: String(url),
    usedModel: String(usedModel || ""),
    prompt: String(prompt || ""),
    at: Date.now()
  };
  const next = [...list, entry].slice(-MAX_VERSIONS);
  return {
    ...data,
    results: next,
    currentIndex: next.length - 1,
    resultUrl: entry.url,
    usedModel: entry.usedModel,
    status: "success",
    error: null
  };
}

// 当前版本下标：越界一律夹到合法区间（旧存档 / 手改数据都可能越界）。
export function currentVersionIndex(data) {
  const list = versionList(data);
  if (!list.length) return -1;
  const raw = Number(data?.currentIndex);
  if (!Number.isFinite(raw)) return list.length - 1;
  return Math.min(Math.max(Math.trunc(raw), 0), list.length - 1);
}

// 切换版本：只改「当前指向」，不动版本列表本身。
export function selectVersion(data, index) {
  const list = versionList(data);
  if (!list.length) return data;
  const idx = Math.min(Math.max(Math.trunc(Number(index) || 0), 0), list.length - 1);
  const entry = list[idx];
  return {
    ...data,
    currentIndex: idx,
    resultUrl: entry.url,
    usedModel: String(entry.usedModel || "")
  };
}

export function versionSummary(data) {
  const list = versionList(data);
  if (!list.length) return { total: 0, index: -1, hasPrev: false, hasNext: false };
  const index = currentVersionIndex(data);
  return {
    total: list.length,
    index,
    hasPrev: index > 0,
    hasNext: index < list.length - 1
  };
}
