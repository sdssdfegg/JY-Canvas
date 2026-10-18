// app-defaults.js —— RF-082 从 src/main.jsx 逐字抽出（加 export），未改逻辑。
export const STORAGE_PREFIX = import.meta.env.VITE_JINGYIN_STORAGE_PREFIX || "jingyin-internal";

export const STORAGE_KEY = `${STORAGE_PREFIX}-settings-v3`;

export const PROMPT_LIBRARY_VERSION = "v2-20260802";

export const PROMPT_PRESETS_KEY = `${STORAGE_PREFIX}-prompt-library-${PROMPT_LIBRARY_VERSION}`;

export const PROMPT_CATEGORIES_KEY = `${STORAGE_PREFIX}-prompt-categories-${PROMPT_LIBRARY_VERSION}`;

export const DETAIL_PRESETS_KEY = `${STORAGE_PREFIX}-detail-presets-v1`;

export const DETAIL_GROUPS_KEY = `${STORAGE_PREFIX}-detail-groups-v1`;

export const PUBLIC_RELEASE_MODE = import.meta.env.VITE_JINGYIN_PUBLIC_RELEASE === "1";

export const PUBLIC_RELEASE_ID = import.meta.env.VITE_JINGYIN_RELEASE_ID || STORAGE_PREFIX;

export const PUBLIC_RELEASE_RESET_KEY = `${STORAGE_PREFIX}-public-reset-${PUBLIC_RELEASE_ID}`;

export const ACTIVE_VIEW_KEY = `${STORAGE_PREFIX}-active-view-v1`;

export const defaultState = {
  baseUrl: "",
  apiKey: "",
  model: "tt-image-2",
  channelId: "",
  dispatchMode: "manual",
  imageSize: "2K",
  aspectRatio: "3:4",
  n: 1,
  prompt: "把袖子改长一点点，差不多到手腕的位置",
  theme: "dark"
};

export const videoDefaults = {
  model: "seedance-2.0",
  prompt: "",
  duration: 5,
  resolution: "720p",
  aspectRatio: "9:16",
  outputAudio: false,
  imageUrl: ""
};

export const referenceDefaults = {
  model: "tt-image-2",
  channelId: "",
  dispatchMode: "manual",
  imageSize: "2K",
  aspectRatio: "3:4",
  n: 1,
  strength: 60,
  element: "medium",
  composition: "light",
  scene: "medium",
  prompt: ""
};

export const detailDefaults = {
  workflow: "taobao-detail",
  analysisMode: "ai",
  model: "tt-image-2",
  channelId: "",
  dispatchMode: "manual",
  ratio: "9:16",
  imageSize: "2K",
  count: 10,
  copywriting: "need",
  richness: "simple",
  fontStyle: "heiti",
  detailSkillVersion: "v1",
  stylePackId: "auto",
  modelMode: "use-model",
  modelPose: "regular",
  modelUsage: 4,
  reverseScreens: 2,
  lang: "中文",
  productName: "",
  productFeature: "",
  userInstruction: "",
  sellingPoints: ""
};

export const builtinPrompts = [
  {
    id: "portrait-retouch",
    title: "人像精修",
    category: "常用",
    content: "保留人物五官、神态和身份特征，优化皮肤质感、发丝细节和服装纹理，商业摄影质感，柔和自然光，背景干净。"
  },
  {
    id: "product-retouch",
    title: "产品精修",
    category: "常用",
    content: "保留产品结构、材质、比例和关键细节，增强边缘清晰度与表面质感，干净高级的电商主图光线，画面真实。"
  },
  {
    id: "local-outfit-material-fit",
    title: "局部换装锁版型面料",
    category: "常用",
    content: [
      "局部换装任务：图1是原图，已框选局部编辑区域；图2是本次要换上的服装唯一来源。",
      "请先在内部分析图2服装的面料类别和可见材质事实，例如棉麻、帆布、牛仔、雪纺、皮革、蕾丝、网纱、针织等，以及织纹方向、颗粒大小、厚薄、垂感、光泽、高光位置、透明度、褶皱逻辑、缝线方向和边缘结构；不要输出分析文字，只把分析结果用于生成。",
      "把图2服装真实穿到图1人物局部区域内，严格保持图2的服装类别、版型、廓形、宽松/修身程度、腰身松量、肩线、领口形状、袖型、袖长、袖口、衣长、裙长、下摆宽度、开衩、扣子、拉链、口袋、拼接线、颜色、面料纹理、厚薄、垂感、反光和光泽。",
      "只允许做符合图1姿态和身体角度的真实穿着适配与自然褶皱，不能按模型审美自动美化版型；禁止把图2服装改成更收腰、更细腰、更短、更紧身、更修身、更顺滑、更亮、更薄、更厚或更完美状态。",
      "图1人物的脸、发型、头部位置、身体比例、姿势、手臂手腕手指、腿脚、背景光影和选区边缘必须保持稳定；不要输出整张重构图、对比图、文字、水印或边框。"
    ].join("\n")
  },
  {
    id: "upscale",
    title: "超分",
    category: "常用",
    content: "提升图片清晰度和细节层次，去除噪点、压缩痕迹和轻微模糊，保持原图构图、人物特征、产品结构和色彩风格不变。"
  },
  {
    id: "old-photo",
    title: "老照片修复",
    category: "常用",
    content: "修复老照片划痕、褪色、污点和破损区域，增强面部细节与自然色彩，保持年代感和原始构图，不改变人物身份。"
  },
  {
    id: "classic-figure",
    title: "经典手办",
    category: "批量复刻",
    content: "把主体做成高品质经典手办展示图，保留角色特征和服装结构，材质细腻，工作室灯光，底座干净，商业级成品质感。"
  },
  {
    id: "portrait-grid",
    title: "人物九宫格",
    category: "批量复刻",
    content: "生成同一人物的九宫格头像或半身图，保持人物身份一致，变化表情、角度、动作和光线，整体风格统一，画面干净。"
  },
  {
    id: "ip-four-view",
    title: "ip四视图",
    category: "批量sku",
    content: "生成同一 IP 角色四视图，正面、侧面、背面和三分之二视角，角色设定一致，比例准确，服装与配色统一，白底展示。"
  },
  {
    id: "line-color",
    title: "线稿上色",
    category: "局部迁移",
    content: "在保留原始线稿结构和线条细节的基础上进行上色，颜色干净协调，明暗层次自然，画面完整，不改变构图。"
  }
];
