// prompts/detail-studio/references/reference-image-roles.js
//
// 参考图三角色方法论（阶段 3C P1）：product / visualStyle / contentStructure 各自的
// 「怎么用」与「禁止串用」确定性规则。
//
// 设计真相源：director-visual.js 的 DIRECTOR_SYSTEM_PROMPT「参考图三角色不串用」纪律 + 阶段 2
// 已落地的角色白名单与服务端校验（白名单逻辑在 server 侧，**本文件不改**、只补方法论与确定性检查）。
//
// 铁律（三角色职责隔离）：
//  - product      = 商品身份锚：只约束外观/包装/颜色/标签一致性。
//  - visualStyle  = 整体视觉 DNA：场景/构图/配色/版式/光线（不复制品牌/水印/人物身份）。
//  - contentStructure = 版式/信息层级（不进身份与风格）。
// 三者职责正交，串用会污染生成图（如把视觉风格配色覆盖商品真实包装色、把版式强加为外观）。

export const REFERENCE_IMAGE_ROLES = Object.freeze({
  product: {
    role: "product",
    label: "商品身份锚",
    purpose: "锁定商品自身的真实外观、包装、颜色、标签一致性；生成图的商品主体必须与此一致。",
    constrains: ["外观形态", "包装/瓶型", "颜色", "标签文字", "材质可见特征"],
    mustNotConstrain: [
      "场景氛围", "构图版式", "配色方案", "品牌/水印", "人物身份", "文案事实"
    ],
    forbiddenCrossovers: [
      "禁止把 visualStyle 的场景/配色复制成商品背景",
      "禁止把 contentStructure 的版式/文案强加为商品外观",
      "禁止把参考图里的其它商品混进目标商品"
    ],
    qcChecks: [
      "商品主体外观是否与 product 参考一致（不改瓶型/颜色/标签）",
      "是否混入参考图里的其它商品"
    ]
  },
  visualStyle: {
    role: "visualStyle",
    label: "视觉 DNA",
    purpose: "定义整套详情的视觉语言：场景、构图基调、配色方案、版式风格、光线情绪。",
    constrains: ["场景氛围", "构图基调", "配色方案", "版式风格", "光线情绪"],
    mustNotConstrain: [
      "商品具体外观", "品牌 logo/水印", "人物身份特征", "商品标签文字", "文案事实"
    ],
    forbiddenCrossovers: [
      "禁止复制品牌/水印/人物身份进生成图",
      "禁止把 visualStyle 的配色覆盖商品本来的包装色（除非用户明确要换色）",
      "禁止把视觉风格当成商品外观约束"
    ],
    qcChecks: [
      "视觉 DNA 是否跨屏统一（配色/光线/版式一致）",
      "是否误带品牌/水印/人物身份"
    ]
  },
  contentStructure: {
    role: "contentStructure",
    label: "内容结构",
    purpose: "定义版式与信息层级：标题位置、信息排布、留白节奏；不进身份与风格。",
    constrains: ["版式骨架", "信息层级", "标题/正文排布", "留白节奏"],
    mustNotConstrain: [
      "商品外观", "视觉风格/配色", "品牌 logo", "人物身份", "文案事实"
    ],
    forbiddenCrossovers: [
      "禁止把 contentStructure 的版式强加为商品外观或视觉风格",
      "禁止在结构层夹带文案事实（事实只来自用户资料，不来自参考图版式）"
    ],
    qcChecks: [
      "信息层级是否清楚（主文案/次文案/视觉占比）",
      "是否越界成了风格或身份约束"
    ]
  }
});

/** 角色白名单（与阶段 2 服务端校验口径一致；本文件只暴露，不改逻辑）。 */
export const ROLE_WHITELIST = Object.freeze([
  "product", "visualStyle", "contentStructure", "none"
]);

/** 确定性：角色是否在白名单内。 */
export function isRoleAllowed(role) {
  return ROLE_WHITELIST.includes(String(role || "").trim());
}

/**
 * 取某角色的「禁止串用」约束清单（供导演/编译器拼提示词时引用，避免串用）。
 * @param {string} role
 * @returns {string[]} mustNotConstrain + forbiddenCrossovers 合并（空角色返回空数组）
 */
export function roleGuard(role) {
  const r = REFERENCE_IMAGE_ROLES[String(role || "").trim()];
  if (!r) return [];
  return [...(r.mustNotConstrain || []), ...(r.forbiddenCrossovers || [])];
}

/**
 * 确定性校验一组参考图资产角色（零模型）：返回未知角色与重复/越界告警。
 * 注意：本函数是「方法论侧」软校验，真正强制白名单的是 server 侧（禁改）；此处只暴露约束、不双写逻辑。
 * @param {Array<{role:string, label?:string}>} assets
 * @returns {{ ok:boolean, violations:string[] }}
 */
export function validateReferenceAssets(assets = []) {
  const list = Array.isArray(assets) ? assets : [];
  const violations = [];
  const seen = {};
  for (const a of list) {
    const role = String((a && a.role) || "").trim();
    if (!isRoleAllowed(role)) {
      violations.push(`未知参考图角色「${role}」（白名单：${ROLE_WHITELIST.join("/")}）`);
      continue;
    }
    if (role === "none") continue;
    seen[role] = (seen[role] || 0) + 1;
  }
  // 同一角色多张参考图允许（不同角度），但不允许把非 product 角色当成身份锚使用——
  // 这一层由 director 提示词约束（roleGuard），此处只报告白名单外的角色。
  return { ok: violations.length === 0, violations };
}
