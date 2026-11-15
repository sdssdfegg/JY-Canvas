// 一键详情 V2 · 自建规划 Skill（纯数据、零依赖叶子）。
//
// 这是 S1-b 引入的「总策划 Agent」静态注入层：单次模型调用 + 本 Skill 静态注入 +
// 确定性编译执行。本文件不调用模型、不依赖任何运行时模块，只导出一份声明式契约。
//
// 冻结契约（执行单 §4）：导出 skillModuleV2 = { id, version, marker, directives[], constraints[] }。
// marker 唯一且稳定，供门禁在真实请求体中断言 Skill 已进入模型上下文。
//
// 目录名 detail-v2-planning 为 C-6 临时占位（执行单 §12），执行 AI 不得擅自改名。
//
// 内容必须覆盖（执行单 §5.1）：
//   ① 商品事实保护（不得虚构材质/参数/认证/疗效/销量/品牌背书）；
//   ② 首屏 hero 默认，但不写死标题文字；
//   ③ 板块是偏好不是固定模板；
//   ④ 不机械凑屏。

export const skillModuleV2 = {
  id: "jingyin-detail-v2-planning",
  version: "1.0.0",
  // 唯一且稳定的标记，门禁据此在 skillPack 子对象中断言本 Skill 真实进入模型请求体。
  marker: "JINGYIN_DETAIL_V2_PLANNING_SKILL",
  // 行动指令：注入到 textPayload.instruction，约束模型的分屏规划行为。
  directives: [
    "商品事实保护：不得虚构材质、参数、认证、疗效、销量、品牌背书；图片中无法确认的商品事实只能写成保守描述或跳过，绝不能作为确定事实输出。",
    "首屏（index 0）默认核心任务为 hero 角色，但禁止写死首屏标题文字，须依据商品属性与屏序自主拟定。",
    "内容板块（selectedSections）是用户的偏好排序，不是固定模板；无板块时必须在用户指定的屏数内自主规划屏序、内容任务与标题来源，不得回退到固定标题轮转（如「首屏主视觉」「收尾转化」等模板化标题）。",
    "不机械凑屏：屏数由 screenCount 决定，禁止为填满屏数而重复或硬凑内容；每一屏都应有独立的信息价值与视觉任务。"
  ],
  // 硬约束：与 directives 一同注入 instruction，但语义更刚性，模型不得违背。
  constraints: [
    "planning 与 screens 必须同时产出；planning 是独立顶层规划结果，不得挂进 group。",
    "首屏 role 必须为 hero；screenRoles 的 index 从 0 开始且与 screens 一一对应。",
    "禁止在 planning.facts 中输出任何无法从商品图确认的具体断言；无法确认者须标为 inferred 或 mustNotClaim。",
    "禁止输出任何固定轮转的模板化标题；标题须由屏序与内容任务决定。"
  ]
};

export default skillModuleV2;
