// src/features/ai-canvas/ai-canvas-params.js
// V143：生成节点的**出图参数解析**（纯逻辑，零 import，便于无头断言）。
//
// 为什么单独成文件：出图参数（模型 / 尺寸 / 比例）要被生成执行用到，又要能被无头断言；
// 而 ai-canvas-generation.js 因为要读设置，会连带 import app-defaults.js 的
// import.meta.env（Vite 专属），纯 node 下导不进来。所以解析逻辑必须放零 import 叶子。

export const DEFAULT_IMAGE_SIZE = "2K";
export const DEFAULT_ASPECT_RATIO = "3:4";
export const IMAGE_SIZE_OPTIONS = ["1K", "2K", "4K"];
export const ASPECT_RATIO_OPTIONS = ["3:4", "1:1", "9:16", "16:9"];

// 取值优先级：**节点上显式设置的 > 全局设置的 > 内置默认**。
// 这样单个节点可以覆盖全局（比如整条链路都 3:4，只有某个节点要 9:16）。
export function resolveGenerationParams(genNode, settings) {
  const data = genNode?.data || {};
  return {
    model: firstNonBlank(data.model, settings?.model, "tt-image-2"),
    imageSize: firstNonBlank(data.imageSize, settings?.imageSize, DEFAULT_IMAGE_SIZE),
    aspectRatio: firstNonBlank(data.aspectRatio, settings?.aspectRatio, DEFAULT_ASPECT_RATIO)
  };
}

// V157：生成节点的**只读摘要**构造（供节点卡片摘要 + 属性面板复用）。
//
// 为什么放零 import 叶子：节点卡片（NodeBody）与无头验收脚本都要用，且前者不能依赖
// 任何渲染层；把"已解析参数 + 当前渠道单价"收敛成一个纯函数，两边调用同一份逻辑。
//
// 注意：渠道单价依赖运行时的渠道目录（channelsForModel 来自 routing.js，含 React 无关的
// 纯逻辑但本文件刻意不 import 它，保持零依赖叶子可被 node 直接跑）。调用方先把
// `channelsForModel(resolved.model, routing)` 算好传进来——本函数只做"摘要聚合"。
// channelId 为空（节点/设置都没选）时回落到列表首条，与出图时的默认线路一致。
export function buildGenerationSummary(genNode, settings, channels = []) {
  const data = genNode?.data || {};
  const resolved = resolveGenerationParams(genNode, settings);
  const explicitChannel = firstNonBlank(data.channelId, settings?.channelId, "");
  const channel =
    channels.find((c) => c?.id === explicitChannel) || channels[0] || null;
  return {
    model: resolved.model,
    imageSize: resolved.imageSize,
    aspectRatio: resolved.aspectRatio,
    channelId: channel?.id || "",
    channelLabel: channel?.label || "",
    price: Number(channel?.price || 0)
  };
}

function firstNonBlank(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}
