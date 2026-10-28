import {
  API_GATEWAY_MODULES,
  gatewayEnvBaseUrl,
  gatewayPriority
} from "./features/api-gateway/gateway-registry.js";

export const CHANNEL_POLICY = Object.freeze({
  defaultChannel: "jingyin-gateway",
  priceSource: "jingyin-gateway",
  customerKeyMode: "per-user-gateway-key",
  exposeUpstreamChannels: false,
  exposeUpstreamPrices: false,
  clientDirectFallbackEnabled: false
});

export const CHANNEL_IMAGE_SIZES = Object.freeze(["1K", "2K", "4K"]);

// 已下线的旧线路：必须从前端目录、服务端目录和服务端校验里同时移除/拒绝。
// 只隐藏下拉框不够——用户手动构造旧 channelId 时服务端也必须拒绝。
// 前三个是 3.0 目录里的**展示名**，后三个是同一批线路在 3.0 目录里的真实 publicId。
export const FORBIDDEN_CHANNEL_IDS = Object.freeze([
  "WD-banana pro-特价",
  "MC-限时特惠",
  "XBS-default",
  "silent-pro-line-03",
  "silent-banana-line-01",
  "silent-tt2-line-08",
  // 2026-09-25：TT Image 2（2.0）的「WD-image特价」下线。
  // 按上面的规则：目录里删掉，同时把它 3.0 展示名与 publicId 都记进拒绝名单。
  "WD-image特价",
  "silent-tt2-line-04"
]);

const FORBIDDEN_CHANNEL_ID_SET = new Set(
  FORBIDDEN_CHANNEL_IDS.map((value) => String(value).trim().toLowerCase())
);

export function isForbiddenChannelId(value) {
  return FORBIDDEN_CHANNEL_ID_SET.has(String(value || "").trim().toLowerCase());
}

// 前端隐藏（2026-10-22）：线路本身仍合法（服务端校验 routingChannelForModel 照常接受），
// 只是不再下发到前端目录（publicRoutingChannels / publicRoutingCatalog 都走同一过滤）。
// 与 src/shared/routing.js 的 HIDDEN_CHANNEL_IDS 保持同源同步——服务端先过滤目录，
// 已发布的客户端无需重打包即可生效；客户端本地 HIDDEN 过滤作为双保险。
export const HIDDEN_CHANNEL_IDS = Object.freeze([
  // 2026-10-22：用户实测不通，先隐藏待恢复（上游均为 api.lk888.ai）。
  "silent-tt2-line-01",   // MC-TT-cf（TT2.0）
  "silent-tt25-line-04",  // BR-default特价（TT2.5）
  // 2026-10-26：SD Pro 上游渠道（名创AI 5.0 Pro，mc-seedream-5-0-pro）失效，暂时隐藏，
  // 等找到合适价格再显示。与 src/shared/routing.js 的 HIDDEN_CHANNEL_IDS 同源同步。
  "mc-seedream-5-0-pro"   // SD Pro 名创AI 渠道
]);

const HIDDEN_CHANNEL_ID_SET = new Set(
  HIDDEN_CHANNEL_IDS.map((value) => String(value || "").trim().toLowerCase())
);

export function isHiddenChannelId(value) {
  return HIDDEN_CHANNEL_ID_SET.has(String(value || "").trim().toLowerCase());
}

// 前端隐藏模型（2026-10-26）：模型定义保留（ROUTING_MODELS / CHANNEL_MODELS / 客户端
// FALLBACK_* 都留着），只是不下发到前端目录（publicRoutingCatalog / publicChannelModels
// 都走同一过滤）。与 HIDDEN_CHANNEL_IDS 同语义：服务端仍接受该模型（已存的设置 / API 直调），
// 客户端本地隐藏作为双保险；等找到合适价格，从本数组移除即可恢复显示。
export const HIDDEN_MODEL_IDS = Object.freeze([
  "doubao-seedream-5-0-pro" // SD Pro：上游渠道失效，暂时隐藏
]);
const HIDDEN_MODEL_ID_SET = new Set(
  HIDDEN_MODEL_IDS.map((value) => String(value || "").trim().toLowerCase())
);
export function isHiddenModelId(value) {
  return HIDDEN_MODEL_ID_SET.has(String(value || "").trim().toLowerCase());
}

// 能力字段说明（唯一来源 = 本目录，前端与服务端都读这里）：
//   supportedSizes / supportedResolutions / supportedAspectRatios / supportedQuality /
//   supportedVersions / supportedBackgroundModes / supportsCustomSize / maxInputImages
//     —— 与 3.0 main.py `TEST2_MODEL_CAPABILITIES` 逐字对齐。
//   maxPromptLength / maxImageBytes
//     —— 3.0 routing catalog **没有**这两个字段（已核对 main.py 2394-2490），
//        V11 在 catalog 里补齐为能力字段，前后端统一按它执行。
//        maxPromptLength 取 3.0 `ONLINE_IMAGE_PROMPT_MAX_LENGTH` 默认值 20000；
//        maxImageBytes 取 16MB（V11 本地上传/本地裁剪回贴链路的实际上限，
//        上游更严格的 10MB 由中转适配器在转发前压缩，见
//        API/问题记录/2026-08-26-LK888参考图超过10MB被上游拒绝.md）。
export const DEFAULT_MAX_PROMPT_LENGTH = 20000;
export const DEFAULT_MAX_IMAGE_BYTES = 16 * 1024 * 1024;

// 与 3.0 `/api/ecommerce/routing` 对齐的客户可见模型目录。
// 线路 ID 是静音中转适配器的 publicId，不能替换成本地自造 ID。
const ROUTING_CHANNELS = Object.freeze([
  // TT2.0 默认线路顺序：laoye 第一（默认线路）/ 云枢 第二；vakv 质量差，2026-10-20 由「同价位第三」改为「同价位排最后」。
  // 2.0 各线路价格口径不变（Origin 0.10 / MC-TT-cf 等 0.11），仅默认线路前移。
  // 数组顺序 = 前端菜单顺序；第一条同时也是"用户没选过线路时"的默认线路
  // （channelForModel / convergeSettingsForModel 都取 channels[0]）。
  // 2.0 的 Origin 与其它 2.0 线路同价（0.10），所以改默认线路不影响价格口径。
  { id: "silent-tt2-line-12", label: "laoye", price: 0.10, model: "tt-image-2" },
  { id: "silent-tt2-line-10", label: "云枢", price: 0.10, model: "tt-image-2" },
  { id: "silent-tt2-line-11", label: "Origin", price: 0.10, model: "tt-image-2" },
  { id: "silent-tt2-line-03", label: "XT-default", price: 0.10, model: "tt-image-2" },
  { id: "silent-tt2-line-05", label: "ZYG-default", price: 0.10, model: "tt-image-2" },
  { id: "silent-tt2-line-06", label: "ZYG-svip", price: 0.10, model: "tt-image-2" },
  { id: "silent-tt2-line-07", label: "ZYG-vip", price: 0.10, model: "tt-image-2" },
  { id: "silent-tt2-line-14", label: "vakv", price: 0.1, model: "tt-image-2" },
  { id: "silent-tt2-line-01", label: "MC-TT-cf", price: 0.11, model: "tt-image-2" },
  { id: "silent-tt2-line-02", label: "XT2", price: 0.11, model: "tt-image-2" },
  { id: "silent-tt2-line-09", label: "速创", price: 0.11, model: "tt-image-2" },
  // 2026-10-09：2.0 模型新增 Subdirect 渠道（上游复用 subdirect.aicodexvip.top，
  // 上游模型 gpt-image-2）。与 2.5 的 silent-tt25-line-07 同源，作为 2.5 挂掉时的替代线；
  // 价格 0.11 = cost 0.05 + markup 0.06，与 MC-TT-cf / XT2 / 速创口径一致。
  { id: "silent-tt2-line-13", label: "Subdirect", price: 0.11, model: "tt-image-2" },
  // 2026-10-11（晚）：TT2.5 下拉顺序 = 云枢第一（默认线路），其余按价格低→高，云枢高质量（最贵 ¥0.14）排最后；vakv 质量差，2026-10-20 由「同价位第二」改为「同价位排最后」。
  { id: "silent-tt25-line-05", label: "云枢", price: 0.10, model: "tt-image-2.5" },
  { id: "silent-tt25-line-06", label: "Origin", price: 0.10, model: "tt-image-2.5" },
  { id: "silent-tt25-line-01", label: "XT-image2-s", price: 0.10, model: "tt-image-2.5" },
  { id: "silent-tt25-line-02", label: "XT-特殊分组", price: 0.10, model: "tt-image-2.5" },
  { id: "silent-tt25-line-03", label: "XT-default", price: 0.10, model: "tt-image-2.5" },
  { id: "silent-tt25-line-08", label: "vakv", price: 0.1, model: "tt-image-2.5" },
  // 2026-09-28：新增 Subdirect（上游 subdirect.aicodexvip.top，OpenAI-images 协议，
  // 上游模型 gpt-image-2.5-flare / gpt-image-2.5-sunburst）。价格 ¥0.11。
  { id: "silent-tt25-line-07", label: "Subdirect", price: 0.11, model: "tt-image-2.5" },
  { id: "silent-tt25-line-04", label: "BR-default特价", price: 0.12, model: "tt-image-2.5" },
  // 2026-10-11：TT2.5 新增「云枢高质量」分组（yunshuaiapi.com），价格 ¥0.14，按价格排最后。
  { id: "silent-tt25-line-09", label: "云枢高质量", price: 0.14, model: "tt-image-2.5" },
  // 香蕉 2：展示用户指定的四条线路（云枢 / Subdirect / Origin / laoye），统一 ¥0.12/张。
  // 2026-10-20：laoye 由「同价位排第一（默认线路）」改为「同价位排最后」，默认线路让给云枢。
  // 数组顺序就是前端菜单顺序（channelsForModel 按白名单顺序输出），不要重排。
  // `silent-banana-line-09` 是 Origin 香蕉 2 的客户端 channelId：它必须由静音中转站
  // 适配器侧先登记成一条 Origin 线路（上游 model=nano-banana-2）才会真正生效；
  // 本地源码只负责把这条线路发出去，不把任何上游 KEY 放进客户端。
  // 2026-10-12：laoye 香蕉线路（luckfill 香蕉账户，对应 154 new-api 渠道 id=1「老夜的渠道」）曾排第一为默认线路；
  // 2026-10-20：改为「同价位排最后」——默认线路让给云枢，laoye 移到同价（¥0.12）四条的末尾。价格口径不变。
  { id: "silent-banana-line-07", label: "云枢", price: 0.12, model: "banana-2" },
  { id: "silent-banana-line-08", label: "Subdirect", price: 0.12, model: "banana-2" },
  { id: "silent-banana-line-09", label: "Origin", price: 0.12, model: "banana-2" },
  { id: "silent-banana-line-12", label: "laoye", price: 0.12, model: "banana-2" },
  // 香蕉 2.1：云枢渠道（yunshuaiapi.com，Gemini 分组），价格 ¥0.12。
  // 2026-10-12：laoye 香蕉2.1 线路（luckfill 香蕉账户）曾排第一；2026-10-20：同价位（¥0.12）排最后，默认线路让给云枢。
  { id: "silent-banana21-line-01", label: "云枢", price: 0.12, model: "banana-2.1" },
  // 2026-10-11：新增 Subdirect 备用渠道（subboost.aicodexvip.top，Gemini 分组），价格 ¥0.12；
  // 与 src/shared/routing.js 的 MODEL_CHANNEL_ALLOWLIST["banana-2.1"] 及适配器 silent-subboost-banana21 对齐。
  { id: "silent-banana21-line-02", label: "Subdirect", price: 0.12, model: "banana-2.1" },
  { id: "silent-banana21-line-12", label: "laoye", price: 0.12, model: "banana-2.1" },
  // 香蕉 Pro：展示用户指定的四条线路（云枢 / Subdirect / laoye / Origin）；
  // 云枢（silent-pro-line-01）上游复用 yunshuaiapi.com 的 Gemini 分组，价格 0.14 = cost 0.14 + markup 0；
  // Origin（silent-pro-line-09）价格 0.16，最贵，恒排最后。
  // 2026-10-12：laoye 香蕉Pro 线路（luckfill 香蕉账户）曾排第一；2026-10-20：同价位（¥0.14）排最后（Origin 仍最末），默认线路让给云枢。
  { id: "silent-pro-line-01", label: "云枢", price: 0.14, model: "nano-banana-pro" },
  { id: "silent-pro-line-10", label: "Subdirect", price: 0.14, model: "nano-banana-pro" },
  { id: "silent-pro-line-12", label: "laoye", price: 0.14, model: "nano-banana-pro" },
  { id: "silent-pro-line-09", label: "Origin", price: 0.16, model: "nano-banana-pro" },
  // 2026-10-24：SD / SD Pro 各挂一条「名创AI」渠道（TokenGo 上游，154 new-api 渠道 28/29）。
  // 价格 ¥0.11 / ¥0.15 与中转站 ModelPrice（上游成本 0.078 / 0.117 + 毛利）一致；4K 与 2K 同价，无加价。
  { id: "mc-seedream-5-0", label: "名创AI", price: 0.11, model: "doubao-seedream-5-0" },
  // 2026-10-27：新增「HS」渠道（火山方舟官方 doubao-seedream-5-0-flash-260915，154 new-api 渠道 30）。
  // provider=volc：上游原生要 size=像素串(WIDTHxHEIGHT) + response_format=url + watermark=true，
  //   与 TokenGo 的 宽高比串+分辨率 完全不同，故单独走 volc 格式分支（见 server/channel.js）。
  // upstreamModel：UI 模型名仍是 doubao-seedream-5-0（挂在 SD 模型下），但实际发给中转站的模型名是火山的
  //   flash 版；中转站按该 model 选中 154 new-api 渠道 30。
  // sizes=[1K,2K]：火山不支持 4K（直连实测 4K 档位 400 InvalidParameter），故限制；比例沿用 SD 模型，
  //   火山接受任意 WIDTHxHEIGHT 像素串，所有比例均可用。
  // 前端展示名统一用「HS」，不出现「火山引擎」字眼。
  { id: "hs-seedream-5-0-flash", label: "HS", price: 0.12, model: "doubao-seedream-5-0", upstreamModel: "doubao-seedream-5-0-flash-260915", provider: "volc", sizes: ["1K", "2K"] },
  { id: "mc-seedream-5-0-pro", label: "名创AI", price: 0.15, model: "doubao-seedream-5-0-pro" }
]);

// 换装语义能力三态（P1-2）：SUPPORTED / UNSUPPORTED / UNKNOWN。
// 未实测前一律 UNKNOWN；总纲 §6.1 规定生产策略不得把 UNKNOWN 当 SUPPORTED 进主路径。
export const TRYON_CAPABILITY_STATES = Object.freeze(["SUPPORTED", "UNSUPPORTED", "UNKNOWN"]);

// 三态归一：非法的或缺失的值一律退回 UNKNOWN，杜绝把未知当支持。
export function normalizeTryonState(value) {
  return TRYON_CAPABILITY_STATES.includes(value) ? value : "UNKNOWN";
}

export const ROUTING_MODELS = Object.freeze([
  {
    value: "tt-image-2",
    label: "TT Image 2",
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    maxInputImages: 14,
    quality: ["auto", "low", "medium", "high"],
    maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH,
    maxImageBytes: DEFAULT_MAX_IMAGE_BYTES
  },
  {
    value: "tt-image-2.5",
    label: "TT Image 2.5",
    ratios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2", "21:9", "9:21"],
    sizes: ["auto", "1K", "2K", "4K"],
    maxInputImages: 8,
    quality: ["auto", "low", "medium", "high", "xhigh", "max"],
    versions: ["flare", "sunburst"],
    backgrounds: ["opaque", "transparent", "auto"],
    customSize: true,
    maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH,
    maxImageBytes: DEFAULT_MAX_IMAGE_BYTES
  },
  {
    value: "banana-2",
    label: "纳米香蕉 2",
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    maxInputImages: 14,
    quality: ["auto", "low", "medium", "high"],
    maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH,
    maxImageBytes: DEFAULT_MAX_IMAGE_BYTES
  },
  // 2026-10-11：纳米香蕉2.1 移到第 4 位（紧跟「纳米香蕉 2」，在「纳米香蕉 Pro」之前）。
  // 数组顺序 = 前端模型下拉顺序（publicChannelModels 直接透传），不要随意重排。
  {
    value: "banana-2.1",
    label: "纳米香蕉2.1",
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    maxInputImages: 14,
    quality: ["auto", "low", "medium", "high"],
    maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH,
    maxImageBytes: DEFAULT_MAX_IMAGE_BYTES
  },
  {
    value: "nano-banana-pro",
    label: "纳米香蕉 Pro",
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    maxInputImages: 14,
    quality: ["auto", "low", "medium", "high"],
    maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH,
    maxImageBytes: DEFAULT_MAX_IMAGE_BYTES
  },
  // 2026-10-24：新增 SD / SD Pro（TokenGo doubao-seedream-5.0 系列，名创AI 渠道，154 new-api 渠道 28/29）。
  // 尺寸严格按上游实际支持：SD 仅 2K/4K（无 1K）；SD Pro 仅 1K/2K（无 4K）。
  // 长宽比按上游 param_schema 枚举暴露，并剔除上游实测定有问题的比例：
  //   SD 剔除 2:1 / 1:2（硬拒 HTTP 503）、9:21 / 3:2（静默返回 9:16 尺寸错图）；
  //   SD Pro 9 个比例 + auto 全部实测通过（154 /tmp/ratio_seq.log）。
  // maxInputImages=14（与已有文生图模型一致；上游参考图上限 10，服务端已兜底）。
  {
    value: "doubao-seedream-5-0",
    label: "SD",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "21:9", "5:4", "4:5"],
    sizes: ["2K", "4K"],
    maxInputImages: 14,
    quality: [],
    maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH,
    maxImageBytes: DEFAULT_MAX_IMAGE_BYTES
  },
  {
    value: "doubao-seedream-5-0-pro",
    label: "SD Pro",
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "auto"],
    sizes: ["1K", "2K"],
    maxInputImages: 14,
    quality: [],
    maxPromptLength: DEFAULT_MAX_PROMPT_LENGTH,
    maxImageBytes: DEFAULT_MAX_IMAGE_BYTES
  }
]);

export function routingModelFor(value) {
  return ROUTING_MODELS.find((model) => model.value === String(value || "").trim()) || null;
}

export function routingChannelsForModel(model) {
  return ROUTING_CHANNELS.filter((channel) => channel.model === String(model || "").trim());
}

export function routingChannelForModel(model, channelId) {
  const requested = String(channelId || "").trim();
  // 旧线路一律拒绝，即使它曾经属于当前模型。
  if (isForbiddenChannelId(requested)) return null;
  return routingChannelsForModel(model).find((channel) => channel.id === requested) || null;
}

// 按渠道 id 直接取渠道（不经过 model 过滤）。
// 换装 / 图片编辑链路会先把 model 换成上游模型名（如 doubao-seedream-5-0-flash-260915），
// 而 ROUTING_CHANNELS 里登记的是 UI 模型名（doubao-seedream-5-0），此时
// routingChannelForModel 按 model 过滤不到任何渠道 → provider 丢失 →
// 火山(volc)专用分支不触发，回落通用分支打到不存在的 /images/edits（404 → 前端 502）。
export function routingChannelById(channelId) {
  const requested = String(channelId || "").trim();
  if (!requested || isForbiddenChannelId(requested)) return null;
  return ROUTING_CHANNELS.find((channel) => channel.id === requested) || null;
}

// 前端目录：旧线路不进入任何一条输出，dropdown / DOM 里旧渠道名数量必须是 0。
// HIDDEN 线路同样不下发（前端菜单不出现，但服务端校验仍接受其 channelId）。
export function publicRoutingChannels() {
  return ROUTING_CHANNELS.filter(
    (channel) => !isForbiddenChannelId(channel.id) && !isHiddenChannelId(channel.id)
  );
}

export function routingModelCapabilities(model) {
  const item = routingModelFor(model);
  if (!item) return null;
  return {
    modelId: item.value,
    displayLabel: item.label,
    supportedSizes: item.sizes,
    supportedResolutions: item.sizes,
    supportedAspectRatios: item.ratios,
    supportedQuality: item.quality,
    supportedQualities: item.quality,
    supportedVersions: item.versions,
    supportedBackgroundModes: item.backgrounds,
    supportsCustomSize: Boolean(item.customSize),
    maxInputImages: item.maxInputImages,
    maxPromptLength: item.maxPromptLength,
    maxImageBytes: item.maxImageBytes,
    // P1-2：换装语义三态，当前全部 UNKNOWN（等 P0-B 实测后由数据驱动改写）。
    maskSupport: normalizeTryonState(item.maskSupport),
    seedSupport: normalizeTryonState(item.seedSupport),
    dualImageUnderstanding: normalizeTryonState(item.dualImageUnderstanding),
    routes: { manual: "ACTIVE" },
    defaultRoute: "manual",
    verified: true
  };
}

// P1-2 统一能力出口：返回含换装语义三态的结构，供后续「统一图像编辑执行入口」(P1-5) 的换装域消费。
// 与 routingModelCapabilities / validateModelCapabilities 共存：后两者保留作传输层校验，本函数只补全换装语义视图。
// capVersion 预留给 P0-B 实测后由数据驱动的策略版本（模型选择按参考图类型/品类/质量模式路由）；
// 当前仅 "v1" = 声明默认 UNKNOWN，策略版本加载待 P0-B 基线 + 用户批准后再启用（ADR-005）。
export function resolveModelCapabilities(modelId, _channelId = "", _capVersion = "v1") {
  const caps = routingModelCapabilities(modelId);
  if (!caps) {
    return {
      modelId: String(modelId || ""),
      available: false,
      evidence: "unknown_model",
      maskSupport: "UNKNOWN",
      seedSupport: "UNKNOWN",
      dualImageUnderstanding: "UNKNOWN"
    };
  }
  return {
    modelId: caps.modelId,
    available: true,
    evidence: "declared-default-unknown",
    maskSupport: normalizeTryonState(caps.maskSupport),
    seedSupport: normalizeTryonState(caps.seedSupport),
    dualImageUnderstanding: normalizeTryonState(caps.dualImageUnderstanding)
  };
}

// 服务端最终校验：任何字段都必须落在当前模型的 capabilities 内。
export function validateModelCapabilities(model, input = {}) {
  const item = routingModelFor(model);
  if (!item) return { ok: false, code: "unknown_model", message: "当前模型未接入 3.0 渠道目录" };

  const imageSize = String(input.imageSize ?? "").trim().toUpperCase();
  if (imageSize && !item.sizes.map((value) => value.toUpperCase()).includes(imageSize)) {
    return { ok: false, code: "unsupported_image_size", message: `${item.label} 不支持 ${imageSize} 尺寸` };
  }
  const aspectRatio = String(input.aspectRatio ?? "").trim();
  if (aspectRatio && !item.ratios.includes(aspectRatio)) {
    return { ok: false, code: "unsupported_aspect_ratio", message: `${item.label} 不支持 ${aspectRatio} 比例` };
  }
  const quality = String(input.quality ?? "").trim().toLowerCase();
  if (quality && item.quality && !item.quality.includes(quality)) {
    return { ok: false, code: "unsupported_quality", message: `${item.label} 不支持 ${quality} 画质` };
  }
  const background = String(input.background ?? "").trim().toLowerCase();
  if (background && (!item.backgrounds || !item.backgrounds.includes(background))) {
    return { ok: false, code: "unsupported_background", message: `${item.label} 不支持 ${background} 背景` };
  }
  const version = String(input.version ?? "").trim().toLowerCase();
  if (version && (!item.versions || !item.versions.includes(version))) {
    return { ok: false, code: "unsupported_version", message: `${item.label} 不支持 ${version} 版本` };
  }
  const promptLength = String(input.prompt ?? "").length;
  if (promptLength > item.maxPromptLength) {
    return {
      ok: false,
      code: "prompt_too_long",
      message: `${item.label} 提示词最多 ${item.maxPromptLength} 字，当前 ${promptLength} 字`
    };
  }
  const imageCount = Number(input.imageCount || 0);
  if (imageCount > item.maxInputImages) {
    return {
      ok: false,
      code: "too_many_images",
      message: `${item.label} 最多上传 ${item.maxInputImages} 张图片，当前 ${imageCount} 张`
    };
  }
  const oversized = (Array.isArray(input.files) ? input.files : [])
    .find((file) => Number(file?.size || 0) > item.maxImageBytes);
  if (oversized) {
    const limitMb = Math.round(item.maxImageBytes / 1024 / 1024);
    return {
      ok: false,
      code: "image_too_large",
      message: `${item.label} 单张图片不能超过 ${limitMb}MB：${oversized.originalname || "未命名图片"}`
    };
  }
  return { ok: true, model: item };
}


export function publicRoutingCatalog() {
  const channels = publicRoutingChannels();
  return {
    dispatchModes: [{ id: "manual", label: "手动选择渠道", status: "ACTIVE", manual: true }],
    models: ROUTING_MODELS
      .filter((model) => !isHiddenModelId(model.value))
      .map((model) => ({
        id: model.value,
        label: model.label,
        status: "ACTIVE",
        capabilities: routingModelCapabilities(model.value)
      })),
    channels: channels.map((channel) => ({
      id: channel.id,
      label: channel.label,
      status: "ACTIVE",
      manual: true,
      public: true,
      supportedModels: [channel.model],
      pricing: { [channel.model]: { price: channel.price, currency: "CNY", unit: "image" } }
    })),
    pricing: {
      currency: "CNY",
      unit: "image",
      models: Object.fromEntries(ROUTING_MODELS
        .filter((model) => !isHiddenModelId(model.value))
        .map((model) => {
          const line = channels.find((channel) => channel.model === model.value);
          return [model.value, { price: line?.price || 0, currency: "CNY", unit: "image" }];
        }))
    },
    priceVersion: "v11-3.0-routing-2026-09-24"
  };
}

export const CHANNEL_MODELS = Object.freeze(ROUTING_MODELS.map((model) => ({
  value: model.value,
  label: model.label,
  ratios: model.ratios,
  sizes: model.sizes,
  maxInputImages: model.maxInputImages,
  maxPromptLength: model.maxPromptLength,
  maxImageBytes: model.maxImageBytes,
  quality: model.quality,
  versions: model.versions,
  backgrounds: model.backgrounds,
  customSize: model.customSize,
  defaultChannel: CHANNEL_POLICY.defaultChannel,
  priceSource: CHANNEL_POLICY.priceSource,
  visiblePrice: {},
  enabled: true,
  internalOnly: false
})));

export function normalizeBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return raw.endsWith("/v1") ? raw : `${raw}/v1`;
}

const ACTIVE_GATEWAY_MODULES = API_GATEWAY_MODULES
  .filter((gateway) => gateway && gateway.enabled !== false)
  .map((gateway, index) => ({
    ...gateway,
    priority: gatewayPriority(gateway, index),
    baseUrl: normalizeBaseUrl(gatewayEnvBaseUrl(gateway))
  }))
  .filter((gateway) => gateway.baseUrl)
  .sort((left, right) => left.priority - right.priority);

const JINGYIN_GATEWAY_BASE_URL = ACTIVE_GATEWAY_MODULES[0]?.baseUrl
  || normalizeBaseUrl("https://api.jingyin.online/v1");

export const CHANNEL_ENDPOINTS = Object.freeze(
  (ACTIVE_GATEWAY_MODULES.length ? ACTIVE_GATEWAY_MODULES : [{
    id: "jingyin-gateway",
    label: "静音中转站",
    role: "primary",
    priority: 1,
    baseUrl: JINGYIN_GATEWAY_BASE_URL,
    public: false,
    billingMode: "gateway",
    billingChannelId: "jingyin-gateway",
    upstreamApiKey: "",
    modelAliases: {}
  }]).map((gateway) => ({
    id: gateway.id,
    label: gateway.label,
    role: gateway.role || "primary",
    priority: gateway.priority || 1,
    baseUrl: gateway.baseUrl,
    public: Boolean(gateway.public),
    billingMode: gateway.billingMode || "gateway",
    billingChannelId: gateway.billingChannelId || gateway.id,
    upstreamApiKey: "",
    imageModels: CHANNEL_MODELS.map((model) => model.value),
    modelAliases: gateway.modelAliases || {}
  }))
);

const ACTIVE_CHANNEL_ENDPOINTS = CHANNEL_ENDPOINTS;

export const PRIMARY_CHANNEL_API_BASE_URL = JINGYIN_GATEWAY_BASE_URL;
export const LOCKED_CHANNEL_API_BASE_URLS = ACTIVE_CHANNEL_ENDPOINTS.map((endpoint) => endpoint.baseUrl);

function primaryChannelId() {
  return ACTIVE_CHANNEL_ENDPOINTS[0]?.id || CHANNEL_POLICY.defaultChannel;
}

export function isLockedChannelBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  return LOCKED_CHANNEL_API_BASE_URLS.includes(normalized);
}

export function buildChannelBaseCandidates(preferredBaseUrl = "") {
  const normalizedPreferred = normalizeBaseUrl(preferredBaseUrl);
  return [
    isLockedChannelBaseUrl(normalizedPreferred) ? normalizedPreferred : "",
    ...LOCKED_CHANNEL_API_BASE_URLS
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}

export function buildImageChannelBaseCandidates(_model, preferredBaseUrl = "") {
  return buildChannelBaseCandidates(preferredBaseUrl || PRIMARY_CHANNEL_API_BASE_URL);
}

export function channelEndpointForBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  return CHANNEL_ENDPOINTS.find((endpoint) => endpoint.baseUrl === normalized) || null;
}

export function upstreamModelForChannel(baseUrl, model) {
  const endpoint = channelEndpointForBaseUrl(baseUrl);
  return endpoint?.modelAliases?.[model] || model;
}

export function apiKeyForChannel(_baseUrl, fallbackApiKey = "") {
  return fallbackApiKey;
}

export function apiKeyHeadersForChannel(_baseUrl, apiKey = "") {
  const credential = String(apiKey || "").trim();
  if (!credential) return {};
  return {
    Authorization: /^Bearer\s+/i.test(credential) ? credential : `Bearer ${credential}`
  };
}

export function channelLogFields(baseUrl, baseIndex = 0, candidateCount = 0) {
  const endpoint = channelEndpointForBaseUrl(baseUrl);
  const attempt = Number.isFinite(baseIndex) ? baseIndex + 1 : 0;
  return {
    channelId: endpoint?.id || "jingyin-gateway",
    channelLabel: endpoint?.label || "静音中转站",
    channelRole: endpoint?.role || "primary",
    channelPublic: Boolean(endpoint?.public),
    channelPriority: endpoint?.priority || attempt,
    channelIsFallback: attempt > 1,
    channelBaseUrl: normalizeBaseUrl(baseUrl),
    channelAttempt: attempt,
    channelCandidateCount: Number.isFinite(candidateCount) ? candidateCount : 0
  };
}

export function publicChannelGateways() {
  return ACTIVE_CHANNEL_ENDPOINTS.map((endpoint, index) => ({
    id: endpoint.id,
    label: endpoint.label,
    role: endpoint.role,
    priority: endpoint.priority || index + 1,
    baseUrl: endpoint.baseUrl,
    billingMode: endpoint.billingMode,
    billingChannelId: endpoint.billingChannelId,
    imageModels: endpoint.imageModels,
    isPrimary: index === 0
  }));
}

export function publicChannelPolicyConfig() {
  return {
    defaultChannel: primaryChannelId(),
    priceSource: primaryChannelId(),
    customerKeyMode: CHANNEL_POLICY.customerKeyMode,
    exposeUpstreamChannels: CHANNEL_POLICY.exposeUpstreamChannels,
    exposeUpstreamPrices: CHANNEL_POLICY.exposeUpstreamPrices,
    clientDirectFallbackEnabled: CHANNEL_POLICY.clientDirectFallbackEnabled,
    activeEndpointCount: ACTIVE_CHANNEL_ENDPOINTS.length,
    gateways: publicChannelGateways(),
    primaryEndpoint: {
      id: ACTIVE_CHANNEL_ENDPOINTS[0]?.id || "jingyin-gateway",
      label: ACTIVE_CHANNEL_ENDPOINTS[0]?.label || "静音中转站",
      role: ACTIVE_CHANNEL_ENDPOINTS[0]?.role || "primary",
      baseUrl: PRIMARY_CHANNEL_API_BASE_URL
    }
  };
}

export function publicChannelModels() {
  return CHANNEL_MODELS
    .filter((model) => model.enabled && !isHiddenModelId(model.value))
    .map((model) => ({
    value: model.value,
    label: model.label,
    ratios: model.ratios,
    sizes: model.sizes,
    maxInputImages: model.maxInputImages,
    maxPromptLength: model.maxPromptLength,
    maxImageBytes: model.maxImageBytes,
    quality: model.quality,
    versions: model.versions,
    backgrounds: model.backgrounds,
    customSize: Boolean(model.customSize),
    channels: routingChannelsForModel(model.value).filter((channel) => !isForbiddenChannelId(channel.id)),
    defaultChannel: primaryChannelId(),
    priceSource: primaryChannelId(),
    visiblePrice: model.visiblePrice,
    enabled: model.enabled,
    internalOnly: model.internalOnly
  }));
}

export { ROUTING_CHANNELS };

