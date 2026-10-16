// 详情 v2 构图变体库（服务端权威）。
// moduleId 必须与 v1 SCREEN_MODULES 的 9 个 id 完全一致。
// 每个变体字段：id / letter / name / composition / firstLook / eyeFlow / textSafeZone / avoid / lighting?(变体专属布光)。

export const MODULE_VARIANTS = {
  hero: [
    {
      id: "hero-A",
      letter: "A",
      name: "居中霸屏",
      composition: "商品主体居中占画面 60-80%，四周留白呼吸",
      firstLook: "画面中心的商品主体",
      eyeFlow: "中心→标题→利益点标签",
      textSafeZone: "底部 1/5 或左右留白区",
      avoid: "主体过小、被文字压住、边缘切割"
    },
    {
      id: "hero-B",
      letter: "B",
      name: "黄金分割偏置+角标",
      composition: "主体置于黄金分割点，右上留出角标位置",
      firstLook: "偏置主体→右上利益点标签",
      eyeFlow: "主体→标签→底部标题",
      textSafeZone: "右上角标区与底部标题区",
      avoid: "标签遮挡主体、角标过大"
    },
    {
      id: "hero-C",
      letter: "C",
      name: "对角线动态",
      composition: "商品沿对角线动态摆放，带轻微倾角",
      firstLook: "对角线起点处的商品",
      eyeFlow: "沿对角线滑向对焦点",
      textSafeZone: "对角线空白三角区",
      avoid: "倾角过大失真、商品变形"
    },
    {
      id: "hero-D",
      letter: "D",
      name: "满版出血+底部安全区",
      composition: "商品近景满版出血，底部留出文案安全区",
      firstLook: "满版商品局部",
      eyeFlow: "局部细节→底部文案",
      textSafeZone: "底部 1/4 留白带",
      avoid: "关键结构被裁、文案压在商品上",
      lighting: "近景均匀柔光，避免过曝，保留商品真实结构"
    }
  ],
  painReverse: [
    {
      id: "painReverse-A",
      letter: "A",
      name: "左右对比",
      composition: "左右分屏，左侧问题状态右侧解决状态",
      firstLook: "左侧问题画面",
      eyeFlow: "左→右",
      textSafeZone: "底部通栏或右侧上部",
      avoid: "虚假对比、左右商品不一致、光比差异过大",
      lighting: "平光，左右两侧照度一致保证对比公平"
    },
    {
      id: "painReverse-B",
      letter: "B",
      name: "前后时间轴",
      composition: "按时间前后排列使用过程，箭头或步骤引导",
      firstLook: "第一步骤的问题画面",
      eyeFlow: "沿时间轴推进",
      textSafeZone: "时间轴下方留白",
      avoid: "步骤过多、过程不可信"
    },
    {
      id: "painReverse-C",
      letter: "C",
      name: "上下分屏",
      composition: "上问题下解决，中间分割线",
      firstLook: "上半屏问题",
      eyeFlow: "上→下",
      textSafeZone: "下半屏边角",
      avoid: "分割线生硬、对比夸张"
    },
    {
      id: "painReverse-D",
      letter: "D",
      name: "数据条对比",
      composition: "用数据条/图表表达前后差异",
      firstLook: "最大差异数据条",
      eyeFlow: "数据条→图例→产品",
      textSafeZone: "图表周边留白",
      avoid: "虚构数据、图表遮挡产品"
    }
  ],
  coreSellingPoint: [
    {
      id: "coreSellingPoint-A",
      letter: "A",
      name: "主体+右上信息块",
      composition: "商品主体在左/中，右上信息块讲一个卖点",
      firstLook: "商品主体",
      eyeFlow: "主体→信息块",
      textSafeZone: "信息块所在留白区",
      avoid: "信息块压主体、卖点超过一个"
    },
    {
      id: "coreSellingPoint-B",
      letter: "B",
      name: "爆炸分解式",
      composition: "卖点对应的局部爆炸分解，引线指向",
      firstLook: "分解出的核心部件",
      eyeFlow: "部件→引线→说明",
      textSafeZone: "分解图外围",
      avoid: "分解结构失实、部件悬浮不合理"
    },
    {
      id: "coreSellingPoint-C",
      letter: "C",
      name: "图标+短句矩阵",
      composition: "主图加 2-3 个图标短句环绕",
      firstLook: "中心商品",
      eyeFlow: "中心→图标矩阵",
      textSafeZone: "图标排布的留白区",
      avoid: "图标风格杂乱、短句过长"
    },
    {
      id: "coreSellingPoint-D",
      letter: "D",
      name: "场景化证明",
      composition: "在使用场景中自然呈现卖点",
      firstLook: "场景中的商品动作",
      eyeFlow: "动作→卖点文字",
      textSafeZone: "场景留白处",
      avoid: "场景抢主体、卖点看不见"
    }
  ],
  materialDetail: [
    {
      id: "materialDetail-A",
      letter: "A",
      name: "微距特写",
      composition: "材质微距特写，浅景深",
      firstLook: "纹理最清晰的焦点区",
      eyeFlow: "焦点→纹理蔓延",
      textSafeZone: "特写边缘留白",
      avoid: "过曝糊细节、磨皮过度",
      lighting: "侧逆光勾勒材质边缘，高光可控不过曝"
    },
    {
      id: "materialDetail-B",
      letter: "B",
      name: "剖视/结构解构",
      composition: "剖面或分层解构展示内部结构",
      firstLook: "剖面核心层",
      eyeFlow: "层→层",
      textSafeZone: "解构图外围",
      avoid: "内部结构虚构、分层失真"
    },
    {
      id: "materialDetail-C",
      letter: "C",
      name: "多细节排列",
      composition: "2-3 个细节小图围绕整体商品",
      firstLook: "最大的细节图",
      eyeFlow: "细节→整体",
      textSafeZone: "小图之间的留白",
      avoid: "细节图大小悬殊、整体商品被忽略"
    },
    {
      id: "materialDetail-D",
      letter: "D",
      name: "光影扫掠",
      composition: "侧光扫掠表面勾画纹理",
      firstLook: "光扫过的纹理高光带",
      eyeFlow: "高光带→全表面",
      textSafeZone: "背光面留白",
      avoid: "高光过曝、纹理被抹平",
      lighting: "侧光扫掠表面，高光带勾画纹理"
    }
  ],
  useScenario: [
    {
      id: "useScenario-A",
      letter: "A",
      name: "环境全景",
      composition: "商品置于真实环境全景中",
      firstLook: "环境中的商品",
      eyeFlow: "环境→商品→使用状态",
      textSafeZone: "环境天空/墙面留白",
      avoid: "场景喧宾夺主、比例失调"
    },
    {
      id: "useScenario-B",
      letter: "B",
      name: "中景互动",
      composition: "中景，人物/手部与商品互动",
      firstLook: "互动动作",
      eyeFlow: "动作→商品",
      textSafeZone: "动作延长线留白",
      avoid: "动作僵硬、商品被遮挡"
    },
    {
      id: "useScenario-C",
      letter: "C",
      name: "使用瞬间特写",
      composition: "使用瞬间的特写，强调效果",
      firstLook: "效果最明显的一瞬间",
      eyeFlow: "特写→整体效果",
      textSafeZone: "特写边框留白",
      avoid: "瞬间不可信、效果夸大"
    },
    {
      id: "useScenario-D",
      letter: "D",
      name: "镜像反射",
      composition: "利用反射面形成镜像，用户视角代入",
      firstLook: "反射中的商品",
      eyeFlow: "反射→实体",
      textSafeZone: "反射面上部",
      avoid: "反射变形、镜像混乱",
      lighting: "柔光主光加反射面补光，保留反射细节"
    }
  ],
  specInfo: [
    {
      id: "specInfo-A",
      letter: "A",
      name: "结构化表格",
      composition: "表格化参数，商品在侧",
      firstLook: "表格首行关键参数",
      eyeFlow: "表格→商品对照",
      textSafeZone: "表格单元格留白",
      avoid: "密集小字、虚构参数",
      lighting: "平光均匀，保证文字与商品同样清晰"
    },
    {
      id: "specInfo-B",
      letter: "B",
      name: "引线标注",
      composition: "商品实拍加引线标注关键部位",
      firstLook: "被标注的部位",
      eyeFlow: "标注点→参数文字",
      textSafeZone: "引线汇聚的留白区",
      avoid: "引线交叉混乱、标注超出商品"
    },
    {
      id: "specInfo-C",
      letter: "C",
      name: "尺度参照",
      composition: "与常见物品对比表示大小",
      firstLook: "参照物与商品的对比关系",
      eyeFlow: "对比→尺寸数字",
      textSafeZone: "对比图下方",
      avoid: "参照物误导、比例失真"
    },
    {
      id: "specInfo-D",
      letter: "D",
      name: "图标矩阵",
      composition: "参数转图标矩阵排列",
      firstLook: "最重要的图标",
      eyeFlow: "图标矩阵→商品",
      textSafeZone: "图标间隙",
      avoid: "图标语义不清、矩阵拥挤"
    }
  ],
  trustProof: [
    {
      id: "trustProof-A",
      letter: "A",
      name: "证书/报告卡式",
      composition: "证书/报告卡片式陈列",
      firstLook: "最核心的证书",
      eyeFlow: "证书→说明→商品",
      textSafeZone: "卡片间隙",
      avoid: "虚构证书、文字过小"
    },
    {
      id: "trustProof-B",
      letter: "B",
      name: "数据可视化",
      composition: "销量/评价/成分数据图表化",
      firstLook: "最大数据点",
      eyeFlow: "数据→图例→商品",
      textSafeZone: "图表留白",
      avoid: "数据不可验证、图表复杂"
    },
    {
      id: "trustProof-C",
      letter: "C",
      name: "服务流程条",
      composition: "服务保障流程横条展示",
      firstLook: "流程起点",
      eyeFlow: "沿流程条",
      textSafeZone: "流程条上下",
      avoid: "流程环节虚构、条过长"
    },
    {
      id: "trustProof-D",
      letter: "D",
      name: "品牌背书墙",
      composition: "品牌要素/材质工艺背书组合",
      firstLook: "品牌主标识",
      eyeFlow: "品牌→工艺细节",
      textSafeZone: "墙面留白",
      avoid: "品牌信息错误、装饰过度"
    }
  ],
  conversionClose: [
    {
      id: "conversionClose-A",
      letter: "A",
      name: "产品回归+CTA",
      composition: "商品清晰回归，配行动引导文案",
      firstLook: "商品主体",
      eyeFlow: "商品→行动文案",
      textSafeZone: "文案所在留白区",
      avoid: "过度促销、文案绝对化"
    },
    {
      id: "conversionClose-B",
      letter: "B",
      name: "组合陈列+价格锚",
      composition: "组合/规格陈列，价格锚点清晰",
      firstLook: "主推规格",
      eyeFlow: "规格阵列→价格",
      textSafeZone: "价格区域",
      avoid: "价格表述违规、陈列杂乱"
    },
    {
      id: "conversionClose-C",
      letter: "C",
      name: "保障图标排",
      composition: "保障图标一排收尾",
      firstLook: "核心保障图标",
      eyeFlow: "图标排→商品→结束语",
      textSafeZone: "图标排下方",
      avoid: "保障承诺无法验证"
    },
    {
      id: "conversionClose-D",
      letter: "D",
      name: "结束语+品牌收尾",
      composition: "品牌调性结束语画面收尾",
      firstLook: "结束语文字区",
      eyeFlow: "结束语→商品→品牌",
      textSafeZone: "文字区留白",
      avoid: "风格与首屏割裂"
    }
  ],
  fitStructure: [
    {
      id: "fitStructure-A",
      letter: "A",
      name: "整体展示",
      composition: "商品整体展示，轮廓完整",
      firstLook: "整体轮廓",
      eyeFlow: "轮廓→结构标注",
      textSafeZone: "轮廓外围",
      avoid: "结构改款、比例异常"
    },
    {
      id: "fitStructure-B",
      letter: "B",
      name: "局部放大",
      composition: "整体加关键局部放大",
      firstLook: "放大的关键结构",
      eyeFlow: "局部→整体",
      textSafeZone: "放大图周边",
      avoid: "局部与整体不一致"
    },
    {
      id: "fitStructure-C",
      letter: "C",
      name: "多角度排布",
      composition: "2-3 个角度排布",
      firstLook: "正面角度",
      eyeFlow: "正面→侧面→细节",
      textSafeZone: "角度间隙",
      avoid: "角度间商品不一致"
    },
    {
      id: "fitStructure-D",
      letter: "D",
      name: "线条解构",
      composition: "线框解构展示内部结构",
      firstLook: "解构主线",
      eyeFlow: "线框→实体",
      textSafeZone: "线框空白区",
      avoid: "线框与实体结构不符"
    }
  ]
};
