// src/features/detail-studio/intake/basic-params/basic-param-options.js
// 详情创作工作区「基础参数」选项清单（照搬一键详情 DetailView.jsx 的 detailParamGrid 选项，
// 不 import 旧模块、不复制 JSX）。本文件只放静态选项常量与派生 helper，组件只负责渲染。
//
// 与旧详情的关系：选项语义对齐阶段 0 报告与 detail-state.js 常量；旧模块运行时行为零回归，
// 本工作区独立维护一份（按 V211 §2 裁决⑤ 允许「照搬选项清单」）。

import { modelCapabilities } from "../../../../shared/routing.js";

// 工作流 11 项（与 detail-state.js:50 对齐）。
export const workflowOptions = [
  { value: "taobao-main", label: "淘宝 / 主图" },
  { value: "taobao-detail", label: "淘宝 / 详情页" },
  { value: "tmall-detail", label: "天猫 / 详情页" },
  { value: "jd-detail", label: "京东 / 详情页" },
  { value: "douyin-detail", label: "抖音 / 详情页" },
  { value: "redbook-detail", label: "小红书 / 种草图文" },
  { value: "pdd-detail", label: "拼多多 / 详情页" },
  { value: "amazon-main", label: "亚马逊 / 主图" },
  { value: "amazon-detail", label: "亚马逊 / 详情页" },
  { value: "shein-detail", label: "SHEIN / 详情页" },
  { value: "temu-detail", label: "Temu / 详情页" }
];

export const copywritingOptions = [
  { value: "need", label: "需要文案" },
  { value: "blank", label: "文案留白" },
  { value: "poster", label: "无文案纯海报" }
];

export const richnessOptions = [
  { value: "simple", label: "精简" },
  { value: "balanced", label: "均衡" },
  { value: "rich", label: "丰富" }
];

export const fontStyleOptions = [
  { value: "soft", label: "柔和女性" },
  { value: "heiti", label: "常用黑体" },
  { value: "modern", label: "现代杂志" },
  { value: "bold", label: "醒目电商" },
  { value: "auto", label: "自动判断" }
];

export const modelModeOptions = [
  { value: "no-model", label: "无模特" },
  { value: "use-model", label: "使用模特" }
];

export const modelPoseOptions = [
  { value: "regular", label: "常规姿态" },
  { value: "special", label: "特殊姿态" }
];

export const detailSkillVersionOptions = [
  { value: "v1", label: "V1 稳定版（现有规则）" },
  { value: "v2", label: "V2 视觉分化（风格包轮换）" }
];

export const stylePackOptions = [
  { value: "auto", label: "自动轮换（每组不同）" },
  { value: "off", label: "关闭视觉风格" },
  { value: "S1", label: "S1 白底极简" },
  { value: "S2", label: "S2 生活场景" },
  { value: "S3", label: "S3 质感微距" },
  { value: "S4", label: "S4 痛点对比" },
  { value: "S5", label: "S5 促销信息" },
  { value: "S6", label: "S6 氛围情绪" },
  { value: "S7", label: "S7 科技理性" },
  { value: "S8", label: "S8 自然原生" }
];

// 图片比例默认清单（与 detail-state.js 的 detailModel.ratios || [...] 对齐）。
export const DETAIL_RATIOS = ["1:1", "3:4", "16:9"];

// 生成数量选项（单位：张）。
export const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6];

// 模特使用率 1~12。
export const MODEL_USAGE_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

// 插入反转屏 0~4。
export const REVERSE_SCREEN_OPTIONS = [0, 1, 2, 3, 4];

// 单个基础参数的默认初值（新建 / 旧项目缺字段时回退）。
export const DEFAULT_BASIC_PARAMS = {
  workflow: "taobao-detail",
  imageModel: "",
  ratio: "3:4",
  imageSize: "",
  count: 4,
  copywriting: "need",
  richness: "balanced",
  fontStyle: "auto",
  modelMode: "no-model",
  modelPose: "regular",
  modelUsage: 6,
  reverseScreens: 0,
  detailSkillVersion: "v1",
  stylePackId: "auto",
  lang: "zh-CN",
  productName: "",
  productFeature: "",
  userInstruction: "",
  sellingPoints: ""
};

// 取图片模型列表（来自 routing.catalog.models，与 ModelChannelConfigPanel 同源）。
export function getImageModelOptions(routing) {
  const models = routing && Array.isArray(routing.models) ? routing.models : [];
  return models.map((model) => ({ value: model.id, label: model.label || model.id }));
}

// 取指定图片模型的分辨率清单（来自 modelCapabilities(model, routing).sizes）。
export function getImageSizeOptions(imageModel, routing) {
  const caps = modelCapabilities(imageModel, routing || {});
  const sizes = Array.isArray(caps && caps.sizes) ? caps.sizes : [];
  return sizes.map((size) => ({ value: size, label: size }));
}
