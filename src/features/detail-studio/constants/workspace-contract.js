// src/features/detail-studio/constants/workspace-contract.js
// 详情创作工作区契约常量（零依赖叶子，任何业务区都可安全 import）。
// 集中放置模式枚举、标签、上限与自检默认值，避免各业务区各自硬编码、后续切割时口径分叉。

export const WORKSPACE_ID = "detail-studio";

// 三种创作模式：项目创建时确定，之后不可变（A / B / C 是三条真正独立的业务路径）。
export const STUDIO_MODES = ["guided", "assisted", "direct"];

export const STUDIO_MODE_LABELS = {
  guided: "A · 专业 AI 策划",
  assisted: "B · Agent 辅助策划",
  direct: "C · 完整提示词直接生成"
};

export const STUDIO_MODE_DESCRIPTIONS = {
  guided: "AI 主动引导完成商品资料收集、商品分析、营销策划与详情分屏",
  assisted: "保留用户原意，Agent 帮助完善、优化与补充",
  direct: "只识别边界、切分屏幕、组织生成任务，不擅自增加营销内容"
};

// 阶段 2 §4：商品资料 + 三类参考图职责（产品 / 视觉风格 / 内容结构）。
// 仅作契约常量，前端各业务区一致引用，避免硬编码分叉；后端 store 侧以同源数组校验。
// @internal 保留原因：阶段 2 §4 参考图职责契约；后端 store 已用同源数组做校验，前端参考图上传 / 选择面板随 P2 接入并经此常量渲染。
export const STUDIO_REFERENCE_ROLES = ["product", "visualStyle", "contentStructure"];

// @internal 保留原因：§4 参考图角色展示文案，随 P2 参考图面板接入。
export const STUDIO_REFERENCE_ROLE_LABELS = {
  product: "商品实拍 / 产品图",
  visualStyle: "视觉风格参考",
  contentStructure: "版式 / 内容结构参考"
};

// @internal 保留原因：§4 参考图角色说明文案，随 P2 参考图面板接入。
export const STUDIO_REFERENCE_ROLE_DESCRIPTIONS = {
  product: "商品本身的实拍或官方图，作为生成结果的主体依据",
  visualStyle: "期望的色调、质感、光影或画面风格参考",
  contentStructure: "期望的详情页版式、分屏结构或信息排布参考"
};

// 任务书口径：单个详情项目最多 20 屏（阶段 4 批量生成消费）。
export const STUDIO_MAX_SCREENS = 20;

// 阶段 2 重点 A：模型与渠道「推荐默认」（Owner 裁决 gpt-5.6-luna + TT Image 2.6）。
// 仅作 UI 默认值与回退锚点；真实清单以 src/shared/routing.js 与 GET /api/config 为准，不在此复制列表。
export const STUDIO_RECOMMENDED_TEXT_MODEL = "gpt-5.6-luna";
// @internal 保留原因：重点 A 图片模型推荐默认；后端 capabilities 已落地 recommended.imageModel，前端「模型渠道选择」面板随 P2 接入并经此常量回退。
export const STUDIO_RECOMMENDED_IMAGE_MODEL = "tt-image-2.6";

// 阶段 1 能力自检默认值：图片链路沿用现有 /api/images 的合法模型与线路。
// 阶段 2 起默认图片模型升 tt-image-2.6；渠道留空，由 routingFields(model, "") 按 2.6 自动取合法默认线路（不硬编码 2.5 线路）。
export const STUDIO_PROBE_MODEL = "tt-image-2.6";
export const STUDIO_PROBE_CHANNEL_ID = "";
export const STUDIO_PROBE_PROMPT = "详情创作工作区连通性测试图：一件纯色针织开衫的干净白底商品图";
