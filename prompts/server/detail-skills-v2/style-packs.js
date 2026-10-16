// 详情 v2 视觉风格包数据（服务端权威）。
// 8 套风格包全量 + 平台禁配 + 自动轮换池。
// off（用户关闭视觉风格）：v2 下不注入任何风格包，含主图首屏强制 S1 一并关闭；
// 由 index.js 的 stylePackForGroup off 分支返回 { pack: null }，下游等价按「无风格包」处理。
// 修改本文件请同步 prompts/README.md 的 v2 规则表；不得改动 v1 任何文件与输出。

export const STYLE_PACKS = {
  S1: {
    id: "S1",
    name: "白底极简",
    colorTone: "中性白，无偏色，明度高",
    lighting: "均匀柔光、近无影，商品受光均匀无死角",
    compositionFamily: "居中或微偏置，主体占比 60-80%",
    background: "纯白或浅灰纯色背景，无道具、无装饰、无投影",
    fontMood: "无衬线，字重适中，干净理性",
    avoid: ["画面出现任何文字、道具、装饰元素", "彩色或渐变背景", "浓重投影"],
    lockLine: "中性白无偏色、均匀柔光近无影、纯白/浅灰纯色背景、无衬线干净字体",
    variantBias: { hero: ["A"], materialDetail: ["A"] }
  },
  S2: {
    id: "S2",
    name: "生活场景",
    colorTone: "暖中性，自然真实",
    lighting: "自然窗光，方向柔和，影子自然",
    compositionFamily: "环境融合中景，产品是视觉主角",
    background: "真实生活空间（家居台面、室内环境），整洁不杂乱",
    fontMood: "常规字体，亲切易读",
    avoid: ["场景复杂度超过产品主体", "出现与商品无关的品牌物品", "光线杂乱"],
    lockLine: "暖中性自然色温、窗光柔和定向、真实整洁生活空间、亲切常规字体",
    variantBias: { useScenario: ["A", "B"], hero: ["B"] }
  },
  S3: {
    id: "S3",
    name: "质感微距",
    colorTone: "中性偏冷，低饱和高级感",
    lighting: "侧逆光加柔光补，高光可控，勾勒材质边缘",
    compositionFamily: "微距近景、浅景深、材质充满画面",
    background: "纯色或材质台面（石材、金属、哑光纸）",
    fontMood: "细体或无衬线细字重，克制高级",
    avoid: ["过曝糊掉细节", "微距变形失实", "背景抢镜"],
    lockLine: "中性偏冷低饱和、侧逆光柔光补、微距浅景深、纯色/材质台面",
    variantBias: { materialDetail: ["A", "D"], hero: ["A"] }
  },
  S4: {
    id: "S4",
    name: "痛点对比",
    colorTone: "中性，对比双方光比一致",
    lighting: "平光，左右/前后场景照度一致，保证对比公平",
    compositionFamily: "左右或上下对比分屏，双色块明确分区",
    background: "双色块分屏背景，问题侧与解决侧色调区分",
    fontMood: "粗体，直接有力",
    avoid: ["虚假对比", "两侧商品不一致", "光比差异误导"],
    lockLine: "中性平光、双场景光比一致、左右/上下对比分屏、粗体直接",
    variantBias: { painReverse: ["A", "C"], coreSellingPoint: ["A"] }
  },
  S5: {
    id: "S5",
    name: "促销信息",
    colorTone: "暖色高饱和，热闹但不刺眼",
    lighting: "明亮平光，商品清晰，信息块可读",
    compositionFamily: "主体加信息块，利益点标签明确",
    background: "品牌色或暖色纯色底",
    fontMood: "粗黑标题，数字醒目",
    avoid: ["廉价感过度（大红大黄堆叠）", "信息块遮挡主体", "极限词"],
    lockLine: "暖色高饱和、明亮平光、主体+信息块、粗黑醒目字体",
    variantBias: { coreSellingPoint: ["A", "C"], conversionClose: ["B"] }
  },
  S6: {
    id: "S6",
    name: "氛围情绪",
    colorTone: "暖调浓郁，情绪化色调",
    lighting: "戏剧光、光束、明暗对比营造氛围",
    compositionFamily: "场景加情绪特写，使用后状态",
    background: "氛围环境（窗光房间、自然户外、节日场景）",
    fontMood: "手写感或细衬线，情绪化",
    avoid: ["产品被氛围淹没", "情绪盖过卖点", "暗部丢失商品细节"],
    lockLine: "暖调浓郁、戏剧光光束、场景+情绪特写、手写感字体",
    variantBias: { useScenario: ["C", "D"], hero: ["D"] }
  },
  S7: {
    id: "S7",
    name: "科技理性",
    colorTone: "冷调，灰阶稳定",
    lighting: "硬光、条形高光，结构清楚",
    compositionFamily: "结构分解、信息图、参数可视化",
    background: "深色或渐变灰",
    fontMood: "等宽或无衬线，理性编号感",
    avoid: ["浮夸装饰", "参数虚构", "深色背景丢失产品边缘"],
    lockLine: "冷调灰阶、硬光条形高光、结构分解/信息图、等宽理性字体",
    variantBias: { specInfo: ["A", "B"], materialDetail: ["B"] }
  },
  S8: {
    id: "S8",
    name: "自然原生",
    colorTone: "暖自然，质朴",
    lighting: "自然光加柔和反光，影子柔和",
    compositionFamily: "有机摆放、俯拍或自然角度",
    background: "天然材质台面（原木、石材、植物、麻布）",
    fontMood: "衬线或手写，质朴",
    avoid: ["脏乱背景", "摆放呆板", "色温偏黄失真"],
    lockLine: "暖自然质朴、自然光柔反、天然材质台面、衬线质朴字体",
    variantBias: { useScenario: ["A", "D"], materialDetail: ["A"] }
  }
};

// 自动轮换池：S1 是公域安全款，不进自动轮换（仅用户手动指定或主图首屏强制时出现）。
export function autoPoolIds() {
  return ["S2", "S3", "S4", "S5", "S6", "S7", "S8"];
}

// 平台禁用风格包：key 为 `${platform}-${pageType}`。
export const BANNED_PACKS = {
  "tmall-detail": ["S5"],
  "redbook-detail": ["S5"]
};

export function allowedPackIds(platformSkill = {}) {
  // BANNED_PACKS 的 key 是路由/平台 id（如 "tmall-detail"），即 platformSkill.id。
  const key = platformSkill.id || `${platformSkill.platform || ""}-${platformSkill.pageType || ""}`;
  const banned = BANNED_PACKS[key] || [];
  return Object.keys(STYLE_PACKS).filter((id) => !banned.includes(id));
}
