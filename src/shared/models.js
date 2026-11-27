// 目录未加载 / 接口不可用时的本地兜底模型表；真实能力与顺序以 `/api/config` 的 routing catalog 为准。
// 顺序与 server/channel-config.js 的 ROUTING_MODELS 一致；已隐藏模型（如 SD Pro）不在此表，
// 其能力回退仍在 routing.js 的 FALLBACK_MODEL_CAPABILITIES / FALLBACK_MODEL_CHANNELS。
export const DEFAULT_MODELS = [
  {
    value: "tt-image-2",
    label: "TT Image 2",
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    quality: ["auto", "low", "medium", "high"],
    maxInputImages: 14,
    maxPromptLength: 20000,
    maxImageBytes: 16 * 1024 * 1024
  },
  {
    value: "tt-image-2.5",
    label: "TT Image 2.5",
    ratios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2", "21:9", "9:21"],
    sizes: ["auto", "1K", "2K", "4K"],
    quality: ["auto", "low", "medium", "high", "max"],
    maxInputImages: 8,
    maxPromptLength: 20000,
    maxImageBytes: 16 * 1024 * 1024
  },
  {
    value: "tt-image-2.6",
    label: "TT Image 2.6",
    ratios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2", "21:9", "9:21"],
    sizes: ["auto", "1K", "2K", "4K"],
    quality: ["auto", "low", "medium", "high", "max"],
    maxInputImages: 8,
    maxPromptLength: 20000,
    maxImageBytes: 16 * 1024 * 1024
  },
  {
    value: "banana-2",
    label: "纳米香蕉 2",
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    quality: ["auto", "low", "medium", "high"],
    maxInputImages: 14,
    maxPromptLength: 20000,
    maxImageBytes: 16 * 1024 * 1024
  },
  {
    value: "banana-2.1",
    label: "纳米香蕉2.1",
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    quality: ["auto", "low", "medium", "high"],
    maxInputImages: 14,
    maxPromptLength: 20000,
    maxImageBytes: 16 * 1024 * 1024
  },
  {
    value: "nano-banana-pro",
    label: "纳米香蕉 Pro",
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    quality: ["auto", "low", "medium", "high"],
    maxInputImages: 14,
    maxPromptLength: 20000,
    maxImageBytes: 16 * 1024 * 1024
  },
  {
    value: "doubao-seedream-5-0",
    label: "SD",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "21:9", "5:4", "4:5"],
    sizes: ["2K", "4K"],
    quality: [],
    maxInputImages: 14,
    maxPromptLength: 20000,
    maxImageBytes: 16 * 1024 * 1024
  },
  // 2026-11-27：SD 5.5（doubao-seedream-5-5，MC 单渠道，¥0.12，后端自动路由）。
  { value: "doubao-seedream-5-5", label: "SD 5.5", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "21:9", "5:4", "4:5"], sizes: ["2K", "4K"], quality: [], maxInputImages: 14, maxPromptLength: 20000, maxImageBytes: 16 * 1024 * 1024 },
  // 2026-10-26：SD Pro（doubao-seedream-5-0-pro）因上游渠道失效已隐藏，等找到合适价格再显示，
  // 故不在此离线兜底列表；离线能力回退仍保留于 routing.js 的 FALLBACK_MODEL_CAPABILITIES / FALLBACK_MODEL_CHANNELS。
];

export function imageSourceFromResult(image) {
  if (!image) return "";
  if (image.localUrl) return image.localUrl;
  if (image.type === "url") return image.value;
  if (image.type === "b64_json") {
    const value = String(image.value || "");
    if (value.startsWith("data:")) return value;
    return `data:${image.mimeType || image.archiveMime || "image/png"};base64,${value}`;
  }
  return "";
}
