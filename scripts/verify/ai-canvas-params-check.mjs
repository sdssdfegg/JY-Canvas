// scripts/verify/ai-canvas-params-check.mjs
// V143：生成节点**出图参数**（模型 / 尺寸 / 比例）无头验收。
//
// 为什么必须测：这些参数直接决定出图效果，而服务端对「不支持的取值」是
// **静默降级**（server/channel.js:142/145）而非报错——传错值不会红，只会悄悄变成别的值。
// 所以只能在「发出请求之前」这一侧把取值钉死。
//
// 两条钉桩尤其重要：
//   1) 执行层不得绕过 resolveGenerationParams 直接取 genNode.data.model（否则节点/全局优先级失效）
//   2) 选项常量必须与服务端 CHANNEL_IMAGE_SIZES 一致，否则会出现「界面能选、上游不支持」
import { readFileSync } from "node:fs";
import process from "node:process";
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_SIZE,
  IMAGE_SIZE_OPTIONS,
  resolveGenerationParams
} from "../../src/features/ai-canvas/ai-canvas-params.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail });
}

// —— 1) 优先级：节点 > 设置 > 内置默认 ——
check("节点显式设置优先于全局设置", (() => {
  const out = resolveGenerationParams(
    { data: { model: "nano-banana-pro", imageSize: "4K", aspectRatio: "9:16" } },
    { model: "tt-image-2", imageSize: "2K", aspectRatio: "3:4" }
  );
  return out.model === "nano-banana-pro" && out.imageSize === "4K" && out.aspectRatio === "9:16";
})(), JSON.stringify(resolveGenerationParams(
  { data: { model: "nano-banana-pro", imageSize: "4K", aspectRatio: "9:16" } },
  { model: "tt-image-2", imageSize: "2K", aspectRatio: "3:4" }
)));

check("节点未设置时回退全局设置", (() => {
  const out = resolveGenerationParams({ data: {} }, { model: "tt-image-2", imageSize: "1K", aspectRatio: "16:9" });
  return out.model === "tt-image-2" && out.imageSize === "1K" && out.aspectRatio === "16:9";
})());

check("节点与设置都没给时用内置默认", (() => {
  const out = resolveGenerationParams({ data: {} }, {});
  return out.model === "tt-image-2" && out.imageSize === DEFAULT_IMAGE_SIZE && out.aspectRatio === DEFAULT_ASPECT_RATIO;
})(), `${DEFAULT_IMAGE_SIZE} / ${DEFAULT_ASPECT_RATIO}`);

// —— 2) 逐字段独立回退（不能因为一个字段有值就把其它字段也带出来）——
check("逐字段独立回退：只设了比例，尺寸仍取设置值", (() => {
  const out = resolveGenerationParams({ data: { aspectRatio: "1:1" } }, { imageSize: "4K" });
  return out.imageSize === "4K" && out.aspectRatio === "1:1";
})());

// —— 3) 脏值处理：空白串 / null / 节点缺失都当「未设置」——
check("空白串视为未设置（避免把空值发到上游）", (() => {
  const out = resolveGenerationParams({ data: { model: "   ", imageSize: "", aspectRatio: null } }, { model: "tt-image-2" });
  return out.model === "tt-image-2" && out.imageSize === DEFAULT_IMAGE_SIZE && out.aspectRatio === DEFAULT_ASPECT_RATIO;
})());
check("节点为 null / 无 data 时不崩且走设置与默认", (() => {
  const a = resolveGenerationParams(null, { imageSize: "1K" });
  const b = resolveGenerationParams({}, { imageSize: "1K" });
  return a.imageSize === "1K" && b.imageSize === "1K" && a.aspectRatio === DEFAULT_ASPECT_RATIO;
})());

// —— 4) 尺寸选项必须与服务端能力一致（否则界面能选、上游静默降级）——
const channelSrc = readFileSync(new URL("../../server/channel-config.js", import.meta.url), "utf8");
const sizeMatch = channelSrc.match(/CHANNEL_IMAGE_SIZES\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/);
const serverSizes = sizeMatch
  ? sizeMatch[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean)
  : [];
check("尺寸选项与服务端 CHANNEL_IMAGE_SIZES 完全一致",
  serverSizes.length > 0 && serverSizes.join(",") === IMAGE_SIZE_OPTIONS.join(","),
  `server=[${serverSizes.join(",")}] client=[${IMAGE_SIZE_OPTIONS.join(",")}]`);

// —— 5) 比例选项必须是主流模型 ratios 的子集（取 tt-image-2 那条校验）——
const ratioMatch = channelSrc.match(/ratios:\s*\[([^\]]*)\]/);
const serverRatios = ratioMatch
  ? ratioMatch[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean)
  : [];
check("比例选项是模型 ratios 的子集（不会踩到静默降级）",
  serverRatios.length > 0 && ASPECT_RATIO_OPTIONS.every((r) => serverRatios.includes(r)),
  `server=[${serverRatios.join(",")}] client=[${ASPECT_RATIO_OPTIONS.join(",")}]`);
check("默认比例在合法选项内", ASPECT_RATIO_OPTIONS.includes(DEFAULT_ASPECT_RATIO), DEFAULT_ASPECT_RATIO);
check("默认尺寸在合法选项内", IMAGE_SIZE_OPTIONS.includes(DEFAULT_IMAGE_SIZE), DEFAULT_IMAGE_SIZE);

// —— 6) 钉桩：执行层必须走 resolveGenerationParams，不得绕过直接取 model ——
const genSrc = readFileSync(new URL("../../src/features/ai-canvas/ai-canvas-generation.js", import.meta.url), "utf8");
check("钉桩：执行层 import 了 resolveGenerationParams",
  genSrc.includes("resolveGenerationParams") && /import[^;]*ai-canvas-params\.js/.test(genSrc));
check("钉桩：执行层不得绕过解析直接取 genNode.data.model",
  !/form\.set\(\s*"model"\s*,\s*genNode\.data\.model/.test(genSrc));
check("钉桩：执行层把 imageSize / aspectRatio 发给上游",
  genSrc.includes('form.set("imageSize"') && genSrc.includes('form.set("aspectRatio"'));
check("钉桩：执行层带 source=infinite-canvas（服务端白名单已预留）",
  genSrc.includes('form.set("source", "infinite-canvas")'));

// —— 7) 钉桩：面板的选项来自同一常量（不许在 JSX 里另写一份）——
const panelSrc = readFileSync(new URL("../../src/features/ai-canvas/ai-canvas-panels.jsx", import.meta.url), "utf8");
const inspectorSrc = readFileSync(new URL("../../src/features/ai-canvas/ai-canvas-inspector.jsx", import.meta.url), "utf8");
check("钉桩：属性面板选项来自 ai-canvas-params.js 的常量（不另写一份）",
  inspectorSrc.includes("IMAGE_SIZE_OPTIONS") && inspectorSrc.includes("ASPECT_RATIO_OPTIONS")
  && /import[^;]*ai-canvas-params\.js/.test(inspectorSrc));
// V157：可编辑控件已从节点卡片（panels.jsx）迁到属性面板（inspector.jsx），故写回钉桩改指 inspector。
check("钉桩：属性面板把参数写回节点 data（imageSize / aspectRatio）",
  inspectorSrc.includes('imageSize: e.target.value') && inspectorSrc.includes('aspectRatio: e.target.value'));

const failed = results.filter((item) => !item.pass);
console.log(`AI 画布出图参数验收：失败 ${failed.length} / 共 ${results.length} 项`);
failed.forEach((item) => console.log(`  ✗ ${item.name}${item.detail ? ` → ${item.detail}` : ""}`));
if (failed.length) process.exitCode = 1;
