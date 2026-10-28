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

function firstNonBlank(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}
