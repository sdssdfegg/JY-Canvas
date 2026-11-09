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

// 任务书口径：单个详情项目最多 20 屏（阶段 4 批量生成消费）。
export const STUDIO_MAX_SCREENS = 20;

// 阶段 1 能力自检默认值：图片链路沿用现有 /api/images 的合法模型与线路。
export const STUDIO_PROBE_MODEL = "tt-image-2.5";
export const STUDIO_PROBE_CHANNEL_ID = "silent-tt25-line-07";
export const STUDIO_PROBE_PROMPT = "详情创作工作区连通性测试图：一件纯色针织开衫的干净白底商品图";
