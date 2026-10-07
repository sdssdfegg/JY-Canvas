// 参考生图控制项——唯一真源（V4.0 执行单 V39）。
//
// 把 UI 档位（参考值 30–100%、元素/构图/场景 四档）翻译成「给模型的可执行视觉约束」。
// UI 说人话（百分比/档位标签只留在面板与日志），prompt 说画面话（可数预算 + 白/黑名单）。
//
// 纯逻辑模块：前端（Vite）与 server（Node/Express）共用。
// 禁止依赖 import.meta.env / 浏览器全局 / Node 全局 —— 否则任一侧 import 即崩。
//
// 结构契约（验收脚本依赖，不得改）：
//   renderReferencePolicy(...) 返回 string[]，调用方自己 join("\n")。
//   每条非 none 维度输出：`【<维度>继承】可继承：<keep>；继承上限：<budget>。必须重做：<rewrite>。禁止：<ban>。`
//   维度为 none：只输出 `【<维度>继承】禁止：<ban>。`，不得出现 keep / 程度词。
//   styleCount === 0：返回 []，由调用方补一句 NO_REFERENCE_NOTE。

export const REFERENCE_STRENGTH_OPTIONS = [30, 40, 50, 60, 70, 80, 90, 100];

/** 8 档参考值 → 3 档强度档位（预算矩阵的档位轴）。 */
export function referenceTierFromStrength(strength) {
  const s = Math.max(30, Math.min(100, Number.parseInt(strength, 10) || 60));
  if (s <= 50) return "low";
  if (s <= 70) return "medium";
  return "high";
}

/**
 * 三维度各自 value=none/light/medium/strong 的 keep/rewrite/ban。
 * keep：可继承白名单（具体画面属性，不得是程度副词）。
 * rewrite：必须重做的动作 + 幅度（硬动作）。
 * ban：硬禁止。
 * 元素维度的 keep 来自本表；构图/场景主题的 keep 由强度档位白名单在 render 时叠加（见 TIER_KEEP_WHITELIST）。
 */
export const REFERENCE_POLICY_TABLE = {
  元素: {
    none: {
      keep: [],
      rewrite: [],
      ban: [
        "不得出现参考图里的任何道具、装饰、文字、品牌标识、水印或人物身份",
        "只保留产品图本身的商品信息"
      ]
    },
    light: {
      keep: ["可吸收 1 个中性色块 / 材质氛围方向"],
      rewrite: ["所有具体物件必须重新组合，不得照搬参考图主体"],
      ban: ["不得复制参考图的道具造型、文字、品牌、水印", "不得出现与产品无关的人物身份"]
    },
    medium: {
      keep: ["可吸收对转化有帮助的元素类别与层级，如卖点承托物、背景材质、配色呼应方向"],
      rewrite: ["必须替换具体样式、造型、材质与摆放，不得同款"],
      ban: ["不得复制参考图的道具造型、商标、水印、原图文案", "不得出现与产品无关的人物身份"]
    },
    strong: {
      keep: ["可重点学习参考图的元素策略与商业层次"],
      rewrite: ["必须重构道具、背景细节、文字位置与视觉符号，避免同图感"],
      ban: ["不得复制参考图的道具造型、商标、水印、人物身份、原图文案"]
    }
  },
  构图: {
    none: {
      keep: [],
      rewrite: [],
      ban: ["不沿用参考图构图", "采用稳定电商构图，主体清晰、留白合理、卖点视线顺畅"]
    },
    light: {
      keep: [],
      rewrite: ["重新安排视角、留白、前后景关系", "不得与参考图相同镜头或相同版式"],
      ban: ["不得复制参考图的裁切比例、镜头距离、版式"]
    },
    medium: {
      keep: [],
      rewrite: ["重新设计裁切、角度与空间比例", "不得与参考图相同镜头或相同版式"],
      ban: ["不得复制参考图的裁切比例、镜头距离、版式"]
    },
    strong: {
      keep: [],
      rewrite: ["必须改变关键排版、画面比例、镜头距离与元素位置", "不得复刻"],
      ban: ["不得复制参考图的裁切比例、镜头距离、版式、元素位置"]
    }
  },
  场景主题: {
    none: {
      keep: [],
      rewrite: [],
      ban: ["不参考运营参考图场景", "重新生成符合商品调性的干净电商场景"]
    },
    light: {
      keep: [],
      rewrite: ["只参考氛围方向（如清爽 / 户外 / 居家 / 轻奢 / 专业感），地点和细节必须重建"],
      ban: ["不得复制参考图的场景地点、背景物、光线细节"]
    },
    medium: {
      keep: [],
      rewrite: ["可吸收相近使用场景与情绪价值，但替换空间结构、背景物与光线细节"],
      ban: ["不得复制参考图的场景地点、背景物、光线细节"]
    },
    strong: {
      keep: [],
      rewrite: ["必须重构环境、装饰、人物关系与品牌信息，避免同图感"],
      ban: ["不得复制参考图的场景地点、背景物、人物关系、品牌信息"]
    }
  }
};

// 强度档位（low/medium/high）决定的元素预算与白名单（验收 4.2 / 6 矩阵）。
// 元素 budget 上限沿档位严格递增：≤1 / ≤3 / ≤5 类。
const TIER_ELEMENT_BUDGET = {
  low: "≤1 类抽象要素，且不得出现任何具体物件",
  medium: "≤3 类，具体物件必须换造型 / 材质",
  high: "≤5 类，且必须换造型 / 材质 / 摆放"
};

// 每档位内的细分（仅用于让「相邻档产生可验证差异」，不突破上面的档位上限）。
const STRENGTH_QUALIFIER = {
  30: "",
  40: "；仅允许 1 个中性色块方向",
  50: "；可吸收 1 个商业气质方向（如清爽 / 专业），不得具象化",
  60: "",
  70: "；主视觉层次可轻参考",
  80: "",
  90: "；可继承至多 1 个参考图的元素策略方向",
  100: "；强制重建全部可识别细节"
};

// 构图 / 场景主题的 keep 白名单随强度档位扩张（验收 4.2）。
const TIER_KEEP_WHITELIST = {
  构图: {
    low: ["画面取向（横 / 竖）"],
    medium: ["画面取向（横 / 竖）", "主体占比", "留白区位置"],
    high: ["画面取向（横 / 竖）", "主体占比", "留白区位置", "视线动线", "景深关系"]
  },
  场景主题: {
    low: ["光线类型"],
    medium: ["光线类型", "色调倾向", "材质氛围"],
    high: ["光线类型", "色调倾向", "材质氛围", "空间结构类型"]
  }
};

export const NO_REFERENCE_NOTE = "本次没有运营参考图，按标准电商构图生成。";

const DIMENSIONS = [
  { dim: "元素", key: "element" },
  { dim: "构图", key: "composition" },
  { dim: "场景主题", key: "scene" }
];

function elementBudgetText(strength) {
  const tier = referenceTierFromStrength(strength);
  const base = TIER_ELEMENT_BUDGET[tier];
  const s = Math.max(30, Math.min(100, Number.parseInt(strength, 10) || 60));
  const qual = STRENGTH_QUALIFIER[s] || "";
  return base + qual;
}

/**
 * 渲染参考生图策略。返回 string[]（每条维度一段），调用方 join("\n")。
 * styleCount <= 0 时返回 []（无运营参考图）。
 */
export function renderReferencePolicy(params = {}) {
  const { strength = 60, styleCount = 0 } = params || {};
  if (Number(styleCount) <= 0) return [];
  const tier = referenceTierFromStrength(strength);
  const out = [];
  for (const { dim, key } of DIMENSIONS) {
    const value = params[key] || "none";
    const cell = REFERENCE_POLICY_TABLE[dim][value] || REFERENCE_POLICY_TABLE[dim].none;
    const isNone = value === "none" || (cell.keep.length === 0 && cell.rewrite.length === 0);
    if (isNone) {
      out.push(`【${dim}继承】禁止：${cell.ban.join("，")}。`);
      continue;
    }
    let keep = cell.keep.slice();
    if (dim === "构图" || dim === "场景主题") {
      keep = keep.concat(TIER_KEEP_WHITELIST[dim][tier] || []);
    }
    const budget = dim === "元素" ? elementBudgetText(strength) : "";
    const keepText = keep.join("，");
    const rewriteText = cell.rewrite.join("，");
    const banText = cell.ban.join("，");
    const budgetPart = budget ? `继承上限：${budget}。` : "";
    out.push(`【${dim}继承】可继承：${keepText}；${budgetPart}必须重做：${rewriteText}。禁止：${banText}。`);
  }
  return out;
}
