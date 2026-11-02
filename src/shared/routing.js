// 快捷生成 / 批量生成共用的模型、线路和能力来源。
//
// 唯一来源约定：
//   1. 模型 ID 一律使用 3.0 routing catalog 的 canonical ID（banana-2 / nano-banana-pro /
//      tt-image-2 / tt-image-2.5）。旧存档里的 nano-banana2 等旧 ID 只在读取时映射一次。
//   2. 线路白名单和「已下线线路」名单与服务端 server/channel-config.js 保持一致。
//   3. 能力限制（可传图片数量、单张大小、提示词长度、比例、尺寸、质量、背景）
//      一律从 `/api/config` 的 routing catalog capabilities 读取；目录未加载完成前
//      不许用默认值覆盖用户存档。

export const LEGACY_MODEL_ALIASES = Object.freeze({
  "nano-banana2": "banana-2",
  "nano-banana-2": "banana-2",
  "nano-banana": "banana-2",
  "banana2": "banana-2",
  "banana-2": "banana-2",
  "nano-banana-pro": "nano-banana-pro",
  "banana-pro": "nano-banana-pro",
  "gpt-image": "tt-image-2",
  "gpt-image-2": "tt-image-2",
  "tt-image-2": "tt-image-2",
  "tt-image-2.5": "tt-image-2.5",
  "tt-image-2-5": "tt-image-2.5",
  "banana-2.1": "banana-2.1",
  "nano-banana-2.1": "banana-2.1",
  // 2026-10-24：名创AI 接入的豆包生图模型，canonical ID 即自身（TokenGo 上游模型名）。
  // 不登记会被 canonicalModel 回退成 tt-image-2，导致 SD / SD Pro 在前端被识别成 TT2.0、
  // 实际请求 model 也变成 tt-image-2（中转站误走到 TT2.0 渠道）。
  "doubao-seedream-5-0": "doubao-seedream-5-0",
  "doubao-seedream-5-0-pro": "doubao-seedream-5-0-pro"
});

// 已下线旧线路：前端目录、服务端目录、服务端校验三处都必须拒绝。
export const FORBIDDEN_CHANNEL_IDS = Object.freeze([
  "WD-banana pro-特价",
  "MC-限时特惠",
  "XBS-default",
  "silent-pro-line-03",
  "silent-banana-line-01",
  "silent-tt2-line-08",
  // 2026-09-25：TT Image 2（2.0）的「WD-image特价」下线（与 server/channel-config.js 同步）。
  "WD-image特价",
  "silent-tt2-line-04"
]);

const FORBIDDEN_CHANNEL_ID_SET = new Set(
  FORBIDDEN_CHANNEL_IDS.map((value) => String(value).trim().toLowerCase())
);

export function isForbiddenChannelId(value) {
  return FORBIDDEN_CHANNEL_ID_SET.has(String(value || "").trim().toLowerCase());
}

// 前端下架（2026-09-25）：**只在前端隐藏**，服务端目录与服务端校验保持不变。
// 与 FORBIDDEN_CHANNEL_IDS 的区别：
//   - FORBIDDEN：旧线路，前端目录/服务端目录/服务端校验三处都要删或拒；
//   - HIDDEN  ：线路本身照旧合法，只是不再出现在前端菜单里（渠道菜单、价格展示都走
//               channelsForModel，所以只在这一处过滤就够）。
// 隐藏后 channelsForModel 不再返回它们，channelForModel / convergeSettingsForModel /
// routingFields 会自动落到该模型的第一条合法线路，避免"界面显示 A、请求实际带 B"。
export const HIDDEN_CHANNEL_IDS = Object.freeze([
  // 2.0（TT Image 2）的 ZYG 三条
  "silent-tt2-line-05",
  "silent-tt2-line-06",
  "silent-tt2-line-07",
  // 2026-10-10（按用户要求）：香蕉 2 的「云枢」取消前端隐藏，与 PRO 云枢一起在前端显示。
  // 中转站线路本就 ACTIVE（publicId silent-banana-line-07，上游 yunshuaiapi.com / Gemini 分组）。
  // 2026-10-22（按用户要求）：用户实测不通的两条先隐藏（上游均为 api.lk888.ai），恢复后从这里移除即可：
  //   - MC-TT-cf（2.0，silent-tt2-line-01）
  //   - BR-default特价（2.5，silent-tt25-line-04）
  // 与 server/channel-config.js 的 HIDDEN_CHANNEL_IDS 同步：服务端目录同时不下发，已发布客户端免重打包生效。
  "silent-tt2-line-01",
  "silent-tt25-line-04",
  // 2026-10-26：SD Pro 上游渠道（mc-seedream-5-0-pro）失效，暂时隐藏待恢复。
  // 2026-10-28：SD 名创AI（mc-seedream-5-0）随 SD Pro 一起隐藏（用户要求，名创AI 整组下线）。
  // 与 server/channel-config.js 的 HIDDEN_CHANNEL_IDS 同步：前端隐藏、服务端仍接受。
  "mc-seedream-5-0-pro",
  "mc-seedream-5-0",
  // 2026-10-28（经与上游核实）：老夜渠道出问题共 3 条线路死亡，云枢两条随之下线，
  // 前端隐藏（服务端保留，渠道恢复后从本数组移除即可）。与 server/channel-config.js 同源同步。
  "silent-tt2-line-10",   // 云枢（TT2.0）
  "silent-tt25-line-05",   // 云枢（TT2.5）
  // 2026-10-30（用户要求）：TT2.5 的「云枢高质量」隐藏，恢复后从本数组与 server/channel-config.js 同源移除即可。
  "silent-tt25-line-09"   // 云枢高质量（TT2.5）
]);

const HIDDEN_CHANNEL_ID_SET = new Set(
  HIDDEN_CHANNEL_IDS.map((value) => String(value).trim().toLowerCase())
);

export function isHiddenChannelId(value) {
  return HIDDEN_CHANNEL_ID_SET.has(String(value || "").trim().toLowerCase());
}

// 香蕉 2 白名单三条：Subdirect → 云枢 → Origin，统一 ¥0.12/张。
// 「云枢」（silent-banana-line-07）2026-10-10 已取消前端隐藏，前端菜单现含 laoye 共四条。
// 香蕉 Pro 白名单四条：云枢 → Subdirect → laoye → Origin（2026-10-20 laoye 由第一改同价位最后）。
export const MODEL_CHANNEL_ALLOWLIST = Object.freeze({
  "banana-2": Object.freeze([
    { id: "silent-banana-line-07", label: "云枢", price: 0.12 },
    { id: "silent-banana-line-08", label: "Subdirect", price: 0.12 },
    { id: "silent-banana-line-09", label: "Origin", price: 0.12 },
    { id: "silent-banana-line-12", label: "laoye", price: 0.12 }
  ]),
  "nano-banana-pro": Object.freeze([
    { id: "silent-pro-line-01", label: "云枢", price: 0.14 },
    { id: "silent-pro-line-10", label: "Subdirect", price: 0.14 },
    { id: "silent-pro-line-12", label: "laoye", price: 0.14 },
    // 2026-10-10 补齐 PRO 云枢（上游复用 yunshuaiapi.com 的 Gemini 分组，上游模型 nano-banana-pro；
    // 同一 apiKeyEnv LK888_SILENT_YUNSHUAI_GEMINI_API_KEY 与香蕉 2 云枢同源，价格 0.14 = cost 0.14 + markup 0）。
    { id: "silent-pro-line-09", label: "Origin", price: 0.16 }
  ]),
  "banana-2.1": Object.freeze([
    { id: "silent-banana21-line-01", label: "云枢", price: 0.12 },
    { id: "silent-banana21-line-02", label: "Subdirect", price: 0.12 },
    { id: "silent-banana21-line-12", label: "laoye", price: 0.12 }
  ])
});

// 每模型「默认渠道」覆盖：channelId 为空（用户未选 / 初次加载）时，defaultChannelForModel
// 优先返回这里指定的渠道，而不是 channelsForModel 的第一条（价格升序首条=最便宜）。
// 这样既能把某条较高价渠道设为默认，又不破坏「渠道列表按价格升序」的展示规约。
// 仅 TT2.5 设了 laoye 满血版；TT2.0 因该 KEY 仅 image2.5全参 分组、无 gpt-image-2，
// 不存在 laoye 渠道，故不在此映射，2.0 默认仍走列表首条。
export const MODEL_DEFAULT_CHANNEL = Object.freeze({
  "tt-image-2.5": "silent-tt25-line-10"
});

// 官方渠道（人工排序，不按价格）：始终置顶、保持此处顺序；其余渠道在其下方按价格升序。
// 与 server/channel-config.js 的 OFFICIAL_CHANNELS 同源同步。
// 官方渠道（人工排序置顶，不参与价格排序）。机制对所有模型通用：
// 只列出「有官方渠道」的模型；未列出的模型 OFFICIAL_CHANNELS[model] 为空 ⇒ 全部按价格升序、不显示分组虚线。
// 以后用户指定「某渠道是官方渠道」时，把该渠道 id 追加到对应模型数组即可自动置顶（顺序=人工顺序）。
export const OFFICIAL_CHANNELS = Object.freeze({
  // 2026-10-30（用户要求）：LK-1K（silent-tt25-line-11）移入「其他渠道」按价格排序，
  // 优质渠道组只保留 LY满血版。要放回优质组时，把该 id 追加回本数组即可（顺序=显示顺序）。
  // 2026-11-02：TT满血版（silent-tt25-tt-manxue，¥0.26，老夜 image2.5全参 满血 KEY，上游/协议/全参能力与 LY 同源、仅 KEY 与价格不同）
  //   排在 LY 后面，追加到本数组 LY 之后即可（顺序=显示顺序，紧跟 LY）。与 server/provider_families.json 同源同步。
  "tt-image-2.5": ["silent-tt25-line-10", "silent-tt25-tt-manxue"]
});

// 目录未加载完成时的本地兜底能力表（与 server/channel-config.js 的 ROUTING_MODELS 对齐）。
// 只用于「目录还没回来」这一种情况；目录一旦加载完成，一律以目录为准。
export const FALLBACK_MODEL_CAPABILITIES = Object.freeze({
  "tt-image-2": Object.freeze({
    maxInputImages: 14,
    maxImageBytes: 16 * 1024 * 1024,
    maxPromptLength: 20000,
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    quality: ["auto", "low", "medium", "high"],
    backgrounds: [],
    versions: [],
    customSize: false
  }),
  "banana-2": Object.freeze({
    maxInputImages: 14,
    maxImageBytes: 16 * 1024 * 1024,
    maxPromptLength: 20000,
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    quality: ["auto", "low", "medium", "high"],
    backgrounds: [],
    versions: [],
    customSize: false
  }),
  "tt-image-2.5": Object.freeze({
    maxInputImages: 8,
    maxImageBytes: 16 * 1024 * 1024,
    maxPromptLength: 20000,
    ratios: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2", "21:9", "9:21"],
    sizes: ["auto", "1K", "2K", "4K"],
    quality: ["auto", "low", "medium", "high", "max"],
    backgrounds: ["opaque", "transparent", "auto"],
    versions: ["flare", "sunburst"],
    customSize: true
  }),
  "nano-banana-pro": Object.freeze({
    maxInputImages: 14,
    maxImageBytes: 16 * 1024 * 1024,
    maxPromptLength: 20000,
    ratios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    sizes: ["1K", "2K", "4K"],
    quality: ["auto", "low", "medium", "high"],
    backgrounds: [],
    versions: [],
    customSize: false
  }),
  "banana-2.1": Object.freeze({
    maxInputImages: 14,
    maxImageBytes: 16 * 1024 * 1024,
    maxPromptLength: 20000,
    ratios: ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"],
    sizes: ["1K", "2K"],
    quality: ["auto", "low", "medium", "high"],
    backgrounds: [],
    versions: [],
    customSize: false
  }),
  "doubao-seedream-5-0": Object.freeze({
    maxInputImages: 14,
    maxImageBytes: 16 * 1024 * 1024,
    maxPromptLength: 20000,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "21:9", "5:4", "4:5"],
    sizes: ["2K", "4K"],
    quality: [],
    backgrounds: [],
    versions: [],
    customSize: false
  }),
  "doubao-seedream-5-0-pro": Object.freeze({
    maxInputImages: 14,
    maxImageBytes: 16 * 1024 * 1024,
    maxPromptLength: 20000,
    ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "auto"],
    sizes: ["1K", "2K"],
    quality: [],
    backgrounds: [],
    versions: [],
    customSize: false
  })
});

export const FALLBACK_DEFAULT_CAPABILITY = FALLBACK_MODEL_CAPABILITIES["tt-image-2"];

export function canonicalModel(value, fallback = "tt-image-2") {
  const key = String(value || "").trim().toLowerCase();
  return LEGACY_MODEL_ALIASES[key] || fallback;
}

/**
 * @internal 保留原因（P7-6 确认）：与本文件在用的 `isBanana2Model`（精确到 canonical ID）
 * 相对，这一族是「按前缀判 family」的粗粒度谓词，V11《渠道模型迁移》交付清单里连同
 * `isTtImageFamilyModel` / `isTtImage2Model` 一起点名登记为 routing 的公共判定 API。
 * 当前无调用点。统筹若判定"没有二手计划"可以一并删掉；保留期间请勿修改它们的语义。
 */
export function isBananaFamilyModel(value) {
  return /^(banana|nano-banana)/i.test(String(value || "").trim());
}

export function isBanana2Model(value) {
  return canonicalModel(value, "") === "banana-2";
}

/**
 * @internal 保留原因（P7-6 确认）：与 `isBananaFamilyModel` 同为 V11 交付的 model family
 * 谓词，当前无调用点。留着是为了「模型族」这个语义在本模块有一致的一组入口，
 * 将来新增模型时不必各处重写正则。统筹若判定无二手计划可一并删除。
 */
export function isTtImageFamilyModel(value) {
  return /^tt-image/i.test(String(value || "").trim());
}

// 精确到 canonical 的 tt-image-2（旧 ID gpt-image / gpt-image-2 映射到它）。
// 局部回贴的 GPT 专用合成参数只给这一支，不要扩散到 tt-image-2.5。
//
// @internal 保留原因（P7-6 确认）：上面这句业务约束是局部回贴链路的关键知识，
// 函数当前无调用点但注释本身有价值；同 `isBananaFamilyModel` 一并待统筹裁决。
export function isTtImage2Model(value) {
  return canonicalModel(value, "") === "tt-image-2";
}

function catalogModelEntry(model, catalog = null) {
  const canonical = canonicalModel(model);
  const list = Array.isArray(catalog?.models) ? catalog.models : null;
  if (!list) return null;
  return list.find((entry) => (
    entry
    && (
      entry.value === canonical
      || entry.id === canonical
      || canonicalModel(entry.value, "") === canonical
      || canonicalModel(entry.id, "") === canonical
    )
  )) || null;
}

// catalog 是否已经加载完成（有 models 数组且非空）。
export function isRoutingCatalogReady(catalog = null) {
  return Boolean(catalog && Array.isArray(catalog.models) && catalog.models.length > 0);
}

/**
 * 能力限制统一出口。
 * catalog 优先（capabilities 字段），目录没加载完成时才回退到本地能力表。
 */
export function modelCapabilities(model, catalog = null) {
  const canonical = canonicalModel(model);
  const fallback = FALLBACK_MODEL_CAPABILITIES[canonical] || FALLBACK_DEFAULT_CAPABILITY;
  const entry = catalogModelEntry(canonical, catalog);
  const caps = entry?.capabilities && typeof entry.capabilities === "object" ? entry.capabilities : (entry || {});
  const pickList = (...values) => {
    for (const value of values) {
      if (Array.isArray(value) && value.length) return [...value];
    }
    return null;
  };
  const ratios = pickList(caps.supportedAspectRatios, caps.ratios, entry?.ratios) || fallback.ratios;
  const sizes = pickList(caps.supportedSizes, caps.supportedResolutions, caps.sizes, entry?.sizes) || fallback.sizes;
  return {
    modelId: canonical,
    label: caps.displayLabel || entry?.label || "",
    fromCatalog: Boolean(entry),
    maxInputImages: Math.max(1, Number(caps.maxInputImages || entry?.maxInputImages || fallback.maxInputImages)),
    maxImageBytes: Math.max(0, Number(caps.maxImageBytes || entry?.maxImageBytes || fallback.maxImageBytes)),
    maxPromptLength: Math.max(1, Number(caps.maxPromptLength || entry?.maxPromptLength || fallback.maxPromptLength)),
    ratios,
    sizes,
    quality: pickList(caps.supportedQuality, caps.supportedQualities, caps.quality, entry?.quality) || fallback.quality,
    backgrounds: pickList(caps.supportedBackgroundModes, caps.backgrounds, entry?.backgrounds) || fallback.backgrounds,
    versions: pickList(caps.supportedVersions, caps.versions, entry?.versions) || fallback.versions,
    customSize: Boolean(caps.supportsCustomSize ?? entry?.customSize ?? fallback.customSize)
  };
}

function normalizeChannelRow(channel, model, priceOverride) {
  if (!channel || !channel.id) return null;
  if (isForbiddenChannelId(channel.id)) return null;
  const price = Number(
    priceOverride
    ?? channel.pricing?.[model]?.price
    ?? channel.price
    ?? 0
  );
  return {
    id: channel.id,
    label: String(channel.label || channel.id),
    price: Number.isFinite(price) ? price : 0,
    currency: channel.pricing?.[model]?.currency || channel.currency || "CNY",
    // 渠道级尺寸子集（2026-10-28）：服务端目录对自声明 sizes 的渠道（如 HS 火山 flash 仅 1K/2K）
    // 会下发该字段；未声明时保持 undefined，沿用模型级 sizes，行为不变。
    ...(Array.isArray(channel.sizes) && channel.sizes.length ? { sizes: [...channel.sizes] } : {}),
    // 渠道级质量子集（2026-10-30）：与 sizes 对称——服务端目录对自声明 quality 的渠道（如 LK-1K 仅 auto/low/medium）
    // 会下发该字段；未声明时保持 undefined，沿用模型级 quality，行为不变。
    // 此前漏拷贝此字段，导致走目录路径的 LK-1K 质量声明丢失、high/max 未置灰（尺寸却生效，不对称）。
    ...(Array.isArray(channel.quality) && channel.quality.length ? { quality: [...channel.quality] } : {})
  };
}

// 目录接口不可用（离线 / /api/config 失败）时的线路兜底表，
// 与 server/channel-config.js 的 ROUTING_CHANNELS 保持一致，且不含任何已下线线路。
// 目录一旦加载完成，一律以目录为准。
export const FALLBACK_MODEL_CHANNELS = Object.freeze({
  // laoye 第一（默认线路）/ 云枢 第二；vakv 质量差，2026-10-20 同价位排最后，与 server/channel-config.js 顺序一致。
  "tt-image-2": Object.freeze([
    // 2026-10-28：laoye超分（老夜同上游 GPT特价 KEY，OPEN 协议同 laoye 2.0，前端 ¥0.08/张）。
    // 0.08 最低价 ⇒ 排第一 = 默认线路（routing-check 强制渠道按价格升序）。
    { id: "silent-tt2-line-15", label: "laoye超分", price: 0.08 },
    // 2026-10-28：旧「laoye」silent-tt2-line-12 摘除（上游 adobe特价 分组被清空，503）；
    //   恢复条件 = 上游恢复分组 + 154 适配器改回 ACTIVE。与 server/channel-config.js 同源。
    { id: "silent-tt2-line-10", label: "云枢", price: 0.1 },
    { id: "silent-tt2-line-11", label: "Origin", price: 0.1 },
    { id: "silent-tt2-line-03", label: "XT-default", price: 0.1 },
    { id: "silent-tt2-line-05", label: "ZYG-default", price: 0.1 },
    { id: "silent-tt2-line-06", label: "ZYG-svip", price: 0.1 },
    { id: "silent-tt2-line-07", label: "ZYG-vip", price: 0.1 },
    { id: "silent-tt2-line-14", label: "vakv", price: 0.1 },
    { id: "silent-tt2-line-01", label: "MC-TT-cf", price: 0.11 },
    { id: "silent-tt2-line-02", label: "XT2", price: 0.11 },
    { id: "silent-tt2-line-09", label: "速创", price: 0.11 },
    // 2026-10-31：2.0 的 Subdirect 复活（silent-tt2-line-13）→ 复用 2.5 sub 同一上游 subdirect.aicodexvip.top + 同一把 KEY；
    //   上游模型 gpt-image-2（/v1/models 已确认支持），对客 ¥0.12。2.5 的 Subdirect 改名 sub、价格 ¥0.13（见下方 silent-tt25-line-07）。
    { id: "silent-tt2-line-13", label: "sub", price: 0.12 },
  ]),
  "tt-image-2.5": Object.freeze([
    // 2026-10-11（晚）：TT2.5 渠道按价格低→高排列；vakv 质量差 2026-10-20 同价位排最后。
    { id: "silent-tt25-line-05", label: "云枢", price: 0.1 },
    { id: "silent-tt25-line-06", label: "Origin", price: 0.1 },
    { id: "silent-tt25-line-01", label: "XT-image2-s", price: 0.1 },
    { id: "silent-tt25-line-02", label: "XT-特殊分组", price: 0.1 },
    { id: "silent-tt25-line-03", label: "XT-default", price: 0.1 },
    { id: "silent-tt25-line-08", label: "vakv", price: 0.1 },
    // 2026-10-31：Subdirect 改名 sub、价格 ¥0.13（真实上游 subdirect.aicodexvip.top；原 127.0.0.1:3019 子代理未起→死已修；
    // 2.0 的 silent-tt2-line-13 复活为 sub 2.0 ¥0.12，与 server/channel-config.js 的 ROUTING_CHANNELS 同源同步）。
    { id: "silent-tt25-line-07", label: "sub", price: 0.13 },
    { id: "silent-tt25-line-04", label: "BR-default特价", price: 0.12 },
    // 2026-10-29：laoye满血版（¥0.14，老夜 image2.5全参 分组，官方 OpenAI images 协议，支持全参 incl MAX quality）。
    //   默认渠道由 MODEL_DEFAULT_CHANNEL 覆盖实现（channelId 为空时 defaultChannelForModel 返回 silent-tt25-line-10），
    //   列表本身仍严格价格升序。该 KEY 分组仅含 2.5（无 gpt-image-2），故只有 TT2.5 满血版；与 server/channel-config.js 同源同步。
    { id: "silent-tt25-line-10", label: "LY满血版", price: 0.14, official: true },
    // 2026-10-30 改名：LK满血版-1K → LK-1K（上游 api.lk888.ai，仅 1K，价格 0.12），优质渠道第二组。
    { id: "silent-tt25-line-11", label: "LK-1K", price: 0.12, sizes: ["1K"], quality: ["auto", "low", "medium"], official: true },
    // 2026-10-31：TT2.5 laoye（silent-tt25-line-12，¥0.08，老夜 TT25 特价 KEY；与 server/channel-config.js 同源同步）。
    { id: "silent-tt25-line-12", label: "laoye", price: 0.08 },
    // 2026-10-11：TT2.5 新增「云枢高质量」分组（yunshuaiapi.com），价格 ¥0.14，与 laoye 同价，排最后。
    { id: "silent-tt25-line-09", label: "云枢高质量", price: 0.14 },
    // 2026-11-02：TT满血版（silent-tt25-tt-manxue，¥0.26，老夜 image2.5全参 满血 KEY，与 LY满血版 同源上游/协议/全参能力，仅 KEY 与价格不同）；
    //   排 LY 后面。官方组置顶由 OFFICIAL_CHANNELS 实现；与 server/provider_families.json 同源同步。
    { id: "silent-tt25-tt-manxue", label: "TT满血版", price: 0.26, official: true }
  ]),
  // 香蕉 2 / 香蕉 Pro 用白名单本身兜底，不在这里重复维护。
  "banana-2": MODEL_CHANNEL_ALLOWLIST["banana-2"],
  "nano-banana-pro": MODEL_CHANNEL_ALLOWLIST["nano-banana-pro"],
  "banana-2.1": MODEL_CHANNEL_ALLOWLIST["banana-2.1"],
  // 2026-10-24：SD / SD Pro 离线兜底渠道（与 ROUTING_CHANNELS 同源；目录加载后以目录为准）。
  "doubao-seedream-5-0": Object.freeze([
    { id: "mc-seedream-5-0", label: "名创AI", price: 0.11 },
    // 2026-10-27：HS 渠道（与 server/channel-config.js 的 ROUTING_CHANNELS 同源）。前端展示名统一用「HS」，不出现「火山引擎」字眼。
    // 2026-10-28：补 sizes（火山 flash 仅 1K/2K，不支持 4K），离线兜底时尺寸下拉同样按渠道收敛。
    { id: "hs-seedream-5-0-flash", label: "HS", price: 0.12, sizes: ["1K", "2K"] }
  ]),
  "doubao-seedream-5-0-pro": Object.freeze([
    { id: "mc-seedream-5-0-pro", label: "名创AI", price: 0.15 }
  ])
});

// 画布 Agent 可用的**推理（文本）模型**清单（2026-11-01 新增）。
//
// 为什么不走 channelsForModel()：前端渠道目录只下发**图像**模型
// （tt-image-2 / 2.5 / banana-2 / 2.1 / pro / SD），
// 文本推理模型不在目录里，所以这里单独维护一份。
// 只列上游当前仍在提供的模型——实测上游 /v1/models 返回 21 个模型，
// 原默认 gpt-5.4-mini 已被下线（故 V153 同步把默认值改为 gpt-5.6-luna）。
//
// 默认值与服务端 DEFAULT_CANVAS_AGENT_MODEL（server/ai-canvas-agent.js）保持一致；
// 选择不持久化，每次重启回到默认，避免客户上次选了失效模型后一直卡住。
export const CANVAS_REASONING_MODELS = Object.freeze([
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna（推荐）" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-6-luna", label: "GPT-6 Luna" }
]);
export const DEFAULT_CANVAS_REASONING_MODEL = "gpt-5.6-luna";

/**
 * 当前模型的可用线路（含价格）。
 * - 旧线路在任何分支都不会出现。
 * - HIDDEN_CHANNEL_IDS 里的线路只在前端隐藏（服务端仍认，见上面的说明）。
 * - 香蕉 2 / 香蕉 Pro 只允许白名单里的那两条线路。
 * - 目录不可用时回退到本地兜底表，保证请求始终能带上合法 channelId。
 */
export function channelsForModel(model, catalog = null) {
  const canonical = canonicalModel(model);
  const configured = Array.isArray(catalog?.channels)
    ? catalog.channels
      .filter((channel) => {
        if (!channel || channel.status === "DISABLED") return false;
        const supported = Array.isArray(channel.supportedModels) ? channel.supportedModels : null;
        if (supported && supported.length) {
          return supported.some((value) => canonicalModel(value, "") === canonical);
        }
        return canonicalModel(channel.model, "") === canonical;
      })
      .map((channel) => normalizeChannelRow(channel, canonical))
      .filter(Boolean)
    : [];
  const allowlist = MODEL_CHANNEL_ALLOWLIST[canonical];
  let rows;
  if (allowlist) {
    const allowed = new Map(allowlist.map((channel) => [channel.id, channel]));
    const source = configured.length ? configured : allowlist;
    rows = source
      .map((channel) => allowed.get(channel.id) || null)
      .filter(Boolean)
      .map((channel) => ({ ...channel, price: Number(channel.price || 0) }))
      .filter((channel) => !isHiddenChannelId(channel.id));
  } else if (configured.length) {
    rows = configured.filter((channel) => !isHiddenChannelId(channel.id));
  } else {
    rows = (FALLBACK_MODEL_CHANNELS[canonical] || [])
      .filter((channel) => !isForbiddenChannelId(channel.id) && !isHiddenChannelId(channel.id))
      .map((channel) => ({ ...channel, currency: "CNY" }));
  }
  // 官方渠道优先：OFFICIAL_CHANNELS 人工顺序置顶（不按价格）；其余直接按"配置数组顺序"展示，
  // 不再按价格升降序（2026-10-30 用户要求：取消价格排序、改用手工顺序，方便后续自由调顺序）。
  // 官方渠道打 official:true 标记，供前端分组渲染（官方组 / 其他组 + 虚线隔断）。
  const officialIds = OFFICIAL_CHANNELS[canonical] || [];
  if (officialIds.length) {
    const officialSet = new Set(officialIds);
    const official = officialIds
      .map((id) => rows.find((row) => row.id === id))
      .filter(Boolean)
      .map((row) => ({ ...row, official: true }));
    // 其余渠道保留配置数组（catalog / FALLBACK）的原顺序，不做价格排序。
    const others = rows.filter((row) => !officialSet.has(row.id));
    rows = [...official, ...others];
  }
  return rows;
}

export function defaultChannelForModel(model, catalog = null) {
  const canonical = canonicalModel(model);
  const channels = channelsForModel(canonical, catalog);
  // 默认渠道优先取首个官方渠道（保持官方排序第一），回退 MODEL_DEFAULT_CHANNEL，再回退列表首条。
  const officialList = OFFICIAL_CHANNELS[canonical] || [];
  for (const id of officialList) {
    if (channels.some((channel) => channel.id === id)) return id;
  }
  const override = MODEL_DEFAULT_CHANNEL[canonical];
  if (override) {
    const matched = channels.find((channel) => channel.id === override);
    if (matched) return matched.id;
  }
  return channels[0]?.id || "";
}

export function channelForModel(model, channelId, catalog = null) {
  const channels = channelsForModel(model, catalog);
  const requested = String(channelId || "").trim();
  if (requested && !isForbiddenChannelId(requested)) {
    const matched = channels.find((channel) => channel.id === requested);
    if (matched) return matched;
  }
  // 未指定渠道（初次 / 未选），或指定了但非法/不在本模型：
  // 优先用每模型默认覆盖（如 TT2.5 → laoye 满血版），否则取列表首条（最便宜的合法线路）。
  const fallbackId = defaultChannelForModel(model, catalog);
  return channels.find((channel) => channel.id === fallbackId) || channels[0] || null;
}

/**
 * 渠道级尺寸（2026-10-28）：当前模型在指定渠道下可用的尺寸档位。
 * - 规则 = 「模型能力 sizes ∩ 渠道自声明 sizes」；渠道未声明 sizes 时沿用模型能力，行为不变。
 * - 交集顺序沿用模型能力的顺序；交集为空（配置异常）时回退模型能力，绝不让下拉变空。
 * - 典型用例：SD（doubao-seedream-5-0）模型级 2K/4K，HS（火山 flash）渠道级 1K/2K
 *   ⇒ 选 HS 时下拉只剩 2K（4K 隐藏；1K 因服务端模型级校验不支持而同样不出现）。
 */
export function sizesForChannel(model, channelId, catalog = null) {
  const canonical = canonicalModel(model);
  const caps = modelCapabilities(canonical, catalog);
  const channel = channelForModel(canonical, channelId, catalog);
  const channelSizes = Array.isArray(channel?.sizes) ? channel.sizes : null;
  if (!channelSizes || !channelSizes.length) return caps.sizes;
  const allowed = new Set(channelSizes.map((value) => String(value).trim().toUpperCase()));
  const intersected = caps.sizes.filter((value) => allowed.has(String(value).trim().toUpperCase()));
  return intersected.length ? intersected : caps.sizes;
}

/**
 * 渠道级质量：与 sizesForChannel 同模式——渠道声明了 quality 就取「模型 ∩ 渠道」，
 * 没声明则用模型全量。用于前端把该渠道不支持的质量档（如 LK-1K 的 high/max）置灰而非移除。
 */
export function qualitiesForChannel(model, channelId, catalog = null) {
  const canonical = canonicalModel(model);
  const caps = modelCapabilities(canonical, catalog);
  const channel = channelForModel(canonical, channelId, catalog);
  const channelQualities = Array.isArray(channel?.quality) ? channel.quality : null;
  if (!channelQualities || !channelQualities.length) return caps.quality || [];
  const allowed = new Set(channelQualities.map((value) => String(value).trim().toLowerCase()));
  const intersected = (caps.quality || []).filter((value) => allowed.has(String(value).trim().toLowerCase()));
  return intersected.length ? intersected : (caps.quality || []);
}

/**
 * 请求路由字段：model / channelId / dispatchMode。
 * 任何情况下都返回 canonical model，且 channelId 一定落在当前模型的合法线路里。
 */
export function routingFields(model, channelId, catalog = null) {
  const canonical = canonicalModel(model);
  const channel = channelForModel(canonical, channelId, catalog);
  const fields = { model: canonical, channelId: channel?.id || "", dispatchMode: "manual" };
  return fields;
}

export function channelPriceLabel(channel) {
  if (!channel) return "";
  const price = Number(channel.price || 0);
  return price > 0 ? `¥${price.toFixed(2)}/张` : "价格待定";
}

// 按 official 标记把渠道拆成「官方组 / 其他组」。官方组已按 OFFICIAL_CHANNELS 顺序在前，
// 其他组按价格升序在后（见 channelsForModel）。供 UI 分组渲染（官方组在上、虚线隔断、其他组在下）。
export function splitOfficialChannels(channels = []) {
  const official = [];
  const others = [];
  for (const channel of channels) {
    if (channel?.official) official.push(channel);
    else others.push(channel);
  }
  return { official, others };
}

/**
 * 切换模型 / 目录加载完成后收敛设置。
 * 只收敛：图片数量、比例、尺寸、质量、背景、版本。
 * - 不改用户原始提示词（提示词长度只在提交前按 capabilities 截断，且超限会提示）
 * - 不改模型、渠道
 * - preserveChannel=false 时才允许把非法 channelId 收敛到当前模型的第一条合法线路
 */
export function convergeSettingsForModel(settings = {}, catalog = null, options = {}) {
  const next = { ...settings };
  const canonical = canonicalModel(next.model);
  next.model = canonical;
  next.dispatchMode = "manual";
  const caps = modelCapabilities(canonical, catalog);
  // 渠道级尺寸收敛（2026-10-28）：先解析渠道，尺寸按「模型 ∩ 渠道」判断，
  // 避免存档里 imageSize=4K + 渠道=HS（火山 flash 不支持 4K）时目录加载后仍保留 4K。
  const channel = channelForModel(canonical, next.channelId, catalog);
  const channelSizes = Array.isArray(channel?.sizes) && channel.sizes.length
    ? (() => {
        const allowed = new Set(channel.sizes.map((value) => String(value).trim().toUpperCase()));
        const intersected = caps.sizes.filter((value) => allowed.has(String(value).trim().toUpperCase()));
        return intersected.length ? intersected : caps.sizes;
      })()
    : caps.sizes;

  if (!caps.ratios.includes(next.aspectRatio)) next.aspectRatio = caps.ratios[0];
  if (!channelSizes.includes(next.imageSize)) next.imageSize = channelSizes.includes("2K") ? "2K" : channelSizes[0];
  // 渠道级质量收敛（2026-10-30）：切到限质量渠道（如 LK-1K 仅 auto/low/medium）时，
  // 把已选但不支持的档（high/max）落回该渠道首个可用档，避免界面与实际发出参数不一致。
  const channelQualities = Array.isArray(channel?.quality) && channel.quality.length
    ? (() => {
      const allowed = new Set(channel.quality.map((value) => String(value).trim().toLowerCase()));
      const intersected = (caps.quality || []).filter((value) => allowed.has(String(value).trim().toLowerCase()));
      return intersected.length ? intersected : (caps.quality || []);
    })()
    : (caps.quality || []);
  if (channelQualities.length && next.quality && !channelQualities.includes(next.quality)) {
    next.quality = channelQualities[0];
  }
  // 版本 / 背景收敛（2026-10-30）：默认参数改为 sunburst + 背景(默认) 后，切到不支持这些参数的
  // 模型（如 TT2.0 的 versions/backgrounds 均为空）时必须清掉，否则会把非法参数发到上游。
  const modelVersions = caps.versions || [];
  if (next.version && !modelVersions.includes(next.version)) next.version = modelVersions[0] || "";
  const modelBackgrounds = caps.backgrounds || [];
  if (next.background && !modelBackgrounds.includes(next.background)) next.background = modelBackgrounds[0] || "";

  const requestedCount = Number.parseInt(next.n, 10) || 1;
  next.n = Math.max(1, Math.min(requestedCount, caps.maxInputImages));

  if (caps.quality.length) {
    const quality = String(next.quality || "").trim().toLowerCase();
    next.quality = caps.quality.includes(quality) ? quality : "";
  } else {
    next.quality = "";
  }
  if (caps.backgrounds.length) {
    const background = String(next.background || "").trim().toLowerCase();
    next.background = caps.backgrounds.includes(background) ? background : "";
  } else {
    next.background = "";
  }
  if (caps.versions.length) {
    const version = String(next.version || "").trim().toLowerCase();
    next.version = caps.versions.includes(version) ? version : "";
  } else {
    next.version = "";
  }

  if (options.preserveChannel !== true) {
    next.channelId = channel?.id || "";
  }
  return next;
}

/**
 * 提示词按当前模型 capabilities 截断。
 * 返回截断后的文本和一个截断标记，调用方据此提示用户。
 */
export function clampPromptForModel(prompt, model, catalog = null) {
  const text = String(prompt || "");
  const caps = modelCapabilities(model, catalog);
  if (text.length <= caps.maxPromptLength) return { prompt: text, truncated: false, maxPromptLength: caps.maxPromptLength };
  return { prompt: text.slice(0, caps.maxPromptLength), truncated: true, maxPromptLength: caps.maxPromptLength };
}
