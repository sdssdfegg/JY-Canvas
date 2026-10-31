// scripts/verify/ai-canvas-inspector-check.mjs
// V157：画布生成节点「属性面板（Inspector）」无头验收。
//
// 覆盖：节点卡片改为只读摘要（模型/渠道/尺寸/比例/单价由 buildGenerationSummary 聚合）、
// 渠道选项随模型过滤、Inspector 改动经 resolveGenerationParams 闭环写回节点 data。
//
// 同步钉桩（防止"又堆回节点里"倒退）：
//   - panels.jsx 不再在 NodeBody 内渲染可编辑的模型/渠道下拉；
//   - inspector.jsx 存在且通过 onUpdateData 写回 model/channelId/imageSize/aspectRatio/prompt；
//   - view.jsx 在选中节点时渲染 NodeInspector。
//
// 纯逻辑 + 源码静态断言 <1s，进提交钩子快速子集（--fast）。
// 用法：node scripts/verify/ai-canvas-inspector-check.mjs

import { readFileSync } from "node:fs";
import process from "node:process";
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_SIZE,
  IMAGE_SIZE_OPTIONS,
  buildGenerationSummary,
  resolveGenerationParams
} from "../../src/features/ai-canvas/ai-canvas-params.js";
import { channelsForModel } from "../../src/shared/routing.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// —— 1) buildGenerationSummary：字段完整（空节点走默认）——
const ttChannels = channelsForModel("tt-image-2", null);
const emptyNode = { data: {} };
const emptySummary = buildGenerationSummary(emptyNode, {}, ttChannels);
check("摘要字段完整：默认模型/尺寸/比例非空",
  emptySummary.model === "tt-image-2" &&
  emptySummary.imageSize === DEFAULT_IMAGE_SIZE &&
  emptySummary.aspectRatio === DEFAULT_ASPECT_RATIO,
  JSON.stringify(emptySummary));
check("摘要含渠道与单价（列表首条回落）",
  Boolean(emptySummary.channelId) && Boolean(emptySummary.channelLabel) && Number.isFinite(emptySummary.price),
  `${emptySummary.channelId} / ${emptySummary.channelLabel} / ${emptySummary.price}`);
check("尺寸/比例选项与常量一致（不会踩服务端静默降级）",
  IMAGE_SIZE_OPTIONS.join(",") === "1K,2K,4K" &&
  ASPECT_RATIO_OPTIONS.includes(DEFAULT_ASPECT_RATIO) &&
  IMAGE_SIZE_OPTIONS.includes(DEFAULT_IMAGE_SIZE),
  `size=[${IMAGE_SIZE_OPTIONS.join(",")}] ratio=[${ASPECT_RATIO_OPTIONS.join(",")}]`);

// —— 2) 渠道随模型过滤：tt-image-2 与 banana-2 列表非空且不同 ——
const bananaChannels = channelsForModel("banana-2", null);
const ttIds = new Set(ttChannels.map((c) => c.id));
const bananaIds = new Set(bananaChannels.map((c) => c.id));
const overlap = [...ttIds].filter((id) => bananaIds.has(id));
check("渠道目录：tt-image-2 与 banana-2 均非空",
  ttChannels.length > 0 && bananaChannels.length > 0,
  `tt=${ttChannels.length} banana=${bananaChannels.length}`);
check("渠道按模型过滤：两模型渠道集合不同（banana 仅白名单 4 条）",
  bananaChannels.length > 0 && bananaIds.size !== ttIds.size && overlap.length < bananaIds.size,
  `tt=${ttIds.size} banana=${bananaIds.size} 交集=${overlap.length}`);

// —— 3) 摘要随节点显式 channelId 变化（一眼看出走哪条线路）——
const bananaNode = { data: { model: "banana-2", channelId: "silent-banana-line-07" } };
const bananaSummary = buildGenerationSummary(bananaNode, {}, bananaChannels);
check("显式渠道：banana-2 + silent-banana-line-07 摘要命中该线路",
  bananaSummary.channelId === "silent-banana-line-07" && bananaSummary.model === "banana-2",
  JSON.stringify(bananaSummary));
check("显式渠道单价被摘要带回（非 0）",
  bananaSummary.price > 0, String(bananaSummary.price));

// —— 4) Inspector 改动写回闭环：节点 data.model 改变 → resolveGenerationParams 立刻反映 ——
// updateNodeData(id, {model}) 直接改 node.data，resolveGenerationParams 三级优先级解析即时生效，
// 因此渠道下拉（channelsForModel(resolved.model)）也会随之刷新——这正是"改动即时写回"的验收点。
const before = resolveGenerationParams({ data: {} }, {});
const after = resolveGenerationParams({ data: { model: "banana-2" } }, {});
check("写回闭环：node.data.model 改为 banana-2 后解析结果同步",
  before.model === "tt-image-2" && after.model === "banana-2",
  `before=${before.model} after=${after.model}`);
const afterChannels = channelsForModel(after.model, null);
check("写回闭环：模型变化后渠道候选集合随之变化",
  afterChannels.length > 0 && afterChannels.every((c) => bananaIds.has(c.id)),
  `afterChannels=${afterChannels.length}`);

// —— 5) 钉桩：NodeBody 不再含可编辑的模型/渠道下拉（根治 overflow 裁掉控件）——
const panelSrc = readFileSync(new URL("../../src/features/ai-canvas/ai-canvas-panels.jsx", import.meta.url), "utf8");
check("钉桩：panels.jsx 改为调用 buildGenerationSummary（只读摘要）",
  panelSrc.includes("buildGenerationSummary") && /import[^;]*ai-canvas-params\.js/.test(panelSrc));
check("钉桩：panels.jsx 节点卡片渲染只读摘要网格（.aiCanvasGenSummaryGrid）",
  panelSrc.includes("aiCanvasGenSummaryGrid"));
check("钉桩：panels.jsx 不再在 NodeBody 内渲染可编辑的模型下拉（.aiCanvasGenModel 已迁出）",
  !panelSrc.includes("aiCanvasGenModel"), "aiCanvasGenModel 仍出现在 NodeBody 内 = 倒退");

// —— 6) 钉桩：Inspector 通过 onUpdateData 写回全部参数 ——
const inspectorSrc = readFileSync(new URL("../../src/features/ai-canvas/ai-canvas-inspector.jsx", import.meta.url), "utf8");
check("钉桩：inspector.jsx 写回 model / channelId",
  inspectorSrc.includes('model: e.target.value') && inspectorSrc.includes('channelId: e.target.value'));
check("钉桩：inspector.jsx 写回 imageSize / aspectRatio / prompt",
  inspectorSrc.includes('imageSize: e.target.value') &&
  inspectorSrc.includes('aspectRatio: e.target.value') &&
  inspectorSrc.includes('prompt: e.target.value'));
check("钉桩：inspector.jsx 消费 channelsForModel（按模型过滤渠道）",
  inspectorSrc.includes("channelsForModel"));

// —— 7) 钉桩：view.jsx 在选中节点时渲染 NodeInspector ——
const viewSrc = readFileSync(new URL("../../src/features/ai-canvas/ai-canvas-view.jsx", import.meta.url), "utf8");
check("钉桩：view.jsx 导入并渲染 NodeInspector",
  viewSrc.includes("NodeInspector") &&
  /import\s*\{\s*NodeInspector\s*\}\s*from\s*"\.\/ai-canvas-inspector\.jsx"/.test(viewSrc));
check("钉桩：view.jsx 把 updateNodeData 透传给 Inspector（改动即时写回 store）",
  viewSrc.includes("onUpdateData={actions.updateNodeData}"));

const failed = results.filter((item) => !item.pass);
console.log(`AI 画布 Inspector 无头验收：失败 ${failed.length} / 共 ${results.length} 项`);
failed.forEach((item) => console.log(`  ✗ ${item.name}${item.detail ? ` → ${item.detail}` : ""}`));
if (failed.length) process.exitCode = 1;
