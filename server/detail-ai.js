import { createAbortSignal } from "./core/http-client.js";
import {
  BASE_SKILL,
  INDUSTRY_SKILLS,
  QUALITY_SKILL,
  SCREEN_MODULES,
  getIndustrySkillByText,
  getPlatformSkill
} from "./detail-skills.js";
import { clamp, extractJsonObject, fileMeta, modelName, postChatCompletion, responseContent, safeImagePart, shouldRetryWithoutImages, shouldRetryWithoutJsonFormat } from "./core/ai-chat-shared.js";
import { buildSkillPackV2, resolveDetailSkillVersion } from "./detail-skills-v2.js";
import { skillModuleV2, detailV2SkillRegistry } from "../prompts/server/detail-v2-planning/index.js";

const DEFAULT_DETAIL_ANALYSIS_MODEL = "gpt-5.6-luna"; // 2026-11-01 上游已下线 gpt-5.4-mini
const DETAIL_MODEL_SPEC = { fields: ["detailAnalysisModel", "textModel"], fallback: DEFAULT_DETAIL_ANALYSIS_MODEL };
const DETAIL_ANALYSIS_TIMEOUT_MS = 120000;
const MAX_AI_IMAGE_COUNT = 10;

// V220 / S2-B：注册表式条件注入的紧凑 Skill 指令层。
// 说明：8 个专业 Skill 的权威全文在 prompts/server/detail-v2-planning/skills/**/SKILL.md（阶段 A 已复核、只读消费）。
// 本文件被 esbuild bundle:true 打进服务端，运行时无法读 md，故按 detailV2SkillRegistry 的 id 装配一条
// "关键 directive" 注入模型上下文；每条 directive 含一句逐字摘自该 SKILL.md 规则段的短语，门禁据此回链取证，
// 证明指令源自专业资产而非凭空改写。新增 Skill 时须在 index.js 注册表登记，并在本表补 directive。
const V2_SKILL_DIRECTIVES = {
  "product-understanding": "[商品理解] 逐条做事实分级：图片直接可见=visible、有据但不可全确认=inferred、图片无法确认的功效/认证/疗效/销量/品牌背书=mustNotClaim；不得虚构材质、参数、认证、疗效、销量、品牌背书。",
  "industry-routing": "[行业路由] 展示行业与规则行业取同一 industryId，强特征优先、弱语境词不越权；禁止把清洗剂判为服装，不得跨品类串规则。",
  "consumer-marketing-strategy": "[消费者营销] 事实→需求→利益→表达四层策划，空洞参数罗列不算营销表达，每个卖点须落到对消费者的好处；消费者利益不得越过商品真实性。",
  "detail-story-planning": "[叙事规划] 屏数由 count 硬约束、板块只是偏好顺序；无板块时自主规划，禁止固定标题轮转，不得机械凑屏，每屏独立信息任务。",
  "visual-art-direction": "[视觉指导] 整组视觉 DNA 只声明一次、每屏带精简约束（含行业禁忌/主体锁）；六维差异须实质区分，禁止仅背景/颜色变化冒充差异。",
  "ecommerce-copy-layout": "[文案版式] 相邻屏文案不做语义复述；文案只引用 visible/inferred 事实，输出语种跟随 lang，质检建议不自动覆盖用户已确认文案。",
  "cross-screen-coherence": "[跨屏一致] 全局规则整组存一次、每屏精简约束；不能期待图片模型记住首屏，内容去重与视觉去重并行，重复源于内容不足时合并角色而非制造重复屏。",
  "detail-quality-control": "[质检] 严重错误不可被高分抵消（商品事实错误/虚假功效/行业错误一律 critical）；六维逐项记录，质检独立可选、只给建议、不自动覆盖提示词。"
};

// 由注册表派生 8 项注入视图：marker 来自注册表本体，directive 来自上表；顺序与注册表一致。
const V2_REGISTERED_SKILLS = detailV2SkillRegistry.map((skill) => ({
  id: skill.id,
  version: skill.version,
  marker: skill.marker,
  directive: V2_SKILL_DIRECTIVES[skill.id] || `[${skill.id}] 按该专业 Skill 规则执行，不得越过商品真实性。`
}));

// V219 §11.3 四项收窄偏差的双向映射说明（校准进 instruction，不改 outputSchema 既有枚举值）。
// 每项均给出"运行时值 ←→ 原文值"映射与不改枚举的声明，作为策划语义证据进入模型上下文。
const V2_CALIBRATION_DIRECTIVES = [
  "[事实分级映射] 运行时三级 visible|inferred|mustNotClaim 对应原文六级 observed/user_provided/verified → visible（其中 user_provided 视资料可靠度记 visible/inferred），inferred → inferred，unknown → inferred（须标注不可确认），prohibited → mustNotClaim；输出仍只用三级枚举，不改 schema 既有值。",
  "[内容角色映射] 原文十二角色 hero/problem/benefit/mechanism/usage/scenario/detail/comparison/evidence/trust/faq/conversion 为可扩展、可跳过、可调序的策划位，统一映射到现有 9 个 moduleId（hero|painReverse|coreSellingPoint|materialDetail|useScenario|specInfo|trustProof|conversionClose|fitStructure）：problem→painReverse、benefit→coreSellingPoint、mechanism/detail→materialDetail、usage/scenario→useScenario、evidence→specInfo、trust→trustProof、conversion/faq→conversionClose；角色可增可跳可调序，不新增 moduleId 枚举。",
  "[风险等级映射] 运行时三级 critical|major|minor 对应原文四级 critical|high|medium/low：critical→critical，high→major，medium/low→minor；输出仍只用三级枚举，不改 schema 既有值。",
  "[Schema 顶层归并] 原文 productProfile/uncertainties/groupQuality 三顶层归并承载于本契约既有顶层：productProfile→product，uncertainties→product.uncertainties 与 planning.facts[level=inferred|mustNotClaim]，groupQuality→qc；按 agent/output-contract.md 映射层转换，不新造第 10 个顶层键。"
];

function industrySeedText(input) {
  return [
    input.productName,
    input.productFeature,
    input.sellingPoints,
    input.userInstruction
  ].join(" ");
}

function compactSkillPack(input, v2Context = null) {
  // 空板块 AI 自主规划（决策 #3，Owner A 裁决后为默认能力）：只要未选内容板块即视为规划态，
  // 不再以 v2Context（V2 风格包）为门控。与 buildDetailAnalysisContent 内的 planningActive 口径一致。
  const planningActive = !(Array.isArray(input.selectedSections) && input.selectedSections.length > 0);
  const platformSkill = getPlatformSkill(input.workflow);
  const industrySeed = industrySeedText(input);
  const industrySkill = getIndustrySkillByText(industrySeed);
  const pack = {
    base: {
      productAuthenticityLock: BASE_SKILL.productAuthenticityLock,
      screenCountRule: BASE_SKILL.screenCountRule,
      imageNumberRules: BASE_SKILL.imageNumberRules,
      globalStyleConsistency: BASE_SKILL.globalStyleConsistency
    },
    platform: {
      id: platformSkill.id,
      platform: platformSkill.platform,
      pageType: platformSkill.pageType,
      rhythm: platformSkill.rhythm,
      copyRule: platformSkill.copyRule,
      visualRule: platformSkill.visualRule,
      imageNorms: platformSkill.imageNorms,
      conversionTraits: platformSkill.conversionTraits
    },
    industryCandidates: Object.values(INDUSTRY_SKILLS).map((skill) => ({
      id: skill.id,
      name: skill.name,
      analyzeAttributes: skill.analyzeAttributes,
      sellingAngles: skill.sellingAngles,
      recommendedScreens: skill.recommendedScreens,
      taboos: skill.taboos,
      qcRules: skill.qcRules
    })),
    seedIndustry: {
      id: industrySkill.id,
      name: industrySkill.name
    },
    modules: Object.values(SCREEN_MODULES).map((module) => ({
      id: module.id,
      name: module.name,
      purpose: module.purpose,
      referenceNeed: module.referenceNeed,
      qcRules: module.qcRules
    })),
    quality: QUALITY_SKILL
  };
  // 自建 V2 规划 Skill：条件注入（仅 planningActive 即空板块默认路径时进入 skillPack）。
  // 保持 compactSkillPack(input, v2Context) 调用锚点不变；planningActive 在函数内部自算，非第三参数。
  // V220/S2-B：把 index.js 注册表的 8 个专业 Skill 以 {marker,directive} 视图挂进 planningSkill.registeredSkills。
  // 仍嵌在 planningSkill 内而非新开顶层键——旧门禁 stripPlanningSkill/N6/B12 的"仅空选注入"语义原样成立，
  // 且 skillModuleV2 本体导出字节不变；8 项由 detailV2SkillRegistry 派生，不再单对象硬编码。
  const planningSkillField = planningActive
    ? { planningSkill: { ...skillModuleV2, registeredSkills: V2_REGISTERED_SKILLS } }
    : {};
  if (!v2Context) return { ...pack, ...planningSkillField };
  return {
    ...pack,
    ...planningSkillField,
    stylePack: v2Context.stylePack,
    stylePackPool: v2Context.stylePackPool,
    stylePackPlatformNote: v2Context.platformNote,
    compositionVariants: v2Context.compositionVariants,
    stylePackDecision: {
      id: v2Context.decision.pack.id,
      name: v2Context.decision.pack.name,
      reason: v2Context.decision.reason
    }
  };
}

function buildDetailAnalysisContent(input, files, includeImages) {
  const productFiles = files.filter((file) => file.detailRole === "product");
  const referenceFiles = files.filter((file) => file.detailRole === "reference");
  const count = clamp(input.count, BASE_SKILL.screenCountRule.min, BASE_SKILL.screenCountRule.max, BASE_SKILL.screenCountRule.defaultCount);
  // V214 P1：客户可选内容板块。空选时为 null，客户板块相关条件分支不触发；
  // 但 A 裁决后空板块即默认规划路径，planningActive 为 true（V2 门控已解耦）。
  const selectedSections = Array.isArray(input.selectedSections) && input.selectedSections.length > 0
    ? input.selectedSections
    : null;
  const skillVersion = resolveDetailSkillVersion(input);
  const v2Context = skillVersion === "v2"
    ? buildSkillPackV2({
        input,
        platformSkill: getPlatformSkill(input.workflow),
        industrySkill: getIndustrySkillByText(industrySeedText(input))
      })
    : null;
  // R1（Owner A 裁决）：无板块 AI 自主规划为默认能力，不再附加 V2 风格包门控。
  // 仅以 selectedSections === null 判定空选——默认 v1/auto 请求也会注入规划 Skill 与契约。
  // 已选板块时走客户偏好分支；逐字节一致口径已收窄为「老前端不传新字段 / 显式关闭规划」兼容路径（§16.2）。
  const planningActive = selectedSections === null;
  const textPayload = {
    task: "完整 AI 详情页 Skill 分析与分屏提示词规划",
    instruction: [
      "你需要先分析商品图，再结合行业 Skill、平台 Skill、分屏模块库和质检 Skill，输出可直接用于图像生成的分屏 JSON。",
      "必须保护商品真实性。不要凭空发明材质、参数、认证、疗效、销量、品牌背书。",
      "productFileIndexes 和 referenceFileIndexes 必须使用 0 基索引，并且只能选择确实存在的图片。",
      "每屏只选择必要参考图，避免所有图片都进入同一屏导致主体漂移。",
      "如果无法从图片确认某个属性，请写成保守描述，不要假装确定。",
      "只输出 JSON，不要 Markdown，不要解释。",
      ...(skillVersion === "v2" && v2Context ? [
        `本组视觉风格已锁定为 ${v2Context.stylePack.id}《${v2Context.stylePack.name}》：色温/色调 ${v2Context.stylePack.colorTone}；布光 ${v2Context.stylePack.lighting}；构图族 ${v2Context.stylePack.compositionFamily}；背景 ${v2Context.stylePack.background}；字体气质 ${v2Context.stylePack.fontMood}。每一屏的 composition 必须体现该风格取值，全组禁止漂移到其它风格。`,
        `每屏必须在 compositionVariants 中该屏 moduleId 的变体里选择一个，将变体字母（A/B/C/D）写入 compositionVariantId 字段。变体已规定第一落点、视线动线、文案安全区与禁忌，composition 描述必须与所选变体兼容；不要自创构图，不要更换风格包取值。`,
        ...(v2Context.platformNote ? [v2Context.platformNote] : [])
      ] : []),
      ...(selectedSections ? [
        "客户已指定详情内容板块（selectedSections），按 order 作为叙事优先级组织分屏，尽可能遵循客户设定的先后顺序。",
        "允许按内容合理性合并或拆分客户板块；禁止一个板块机械对应一张图，禁止为满足板块数量凑屏或改变屏数，屏数仍由 screenCount 决定。",
        "不得虚构材质、参数、认证、疗效、销量、对比结果、品牌资质与品牌背书；图片中无法确认的商品事实不能当成事实输出。客户选择某板块不代表该事实存在，应改为保守表达或跳过无证据的具体断言。",
        "自定义板块（isCustom=true / moduleId=custom）与预设板块具有同等策划输入地位，须以 label 原文组织该屏文案；可为该屏填 moduleId=custom 并在 customLabel 写回客户原文，其余字段照常。"
      ] : []),
      // S1-b：空板块自主规划 Skill 指令（仅 planningActive 时注入，条件注入）
      ...(planningActive ? [
        ...skillModuleV2.directives,
        ...skillModuleV2.constraints,
        // V220/S2-B：8 个专业 Skill 的关键 directive + 4 项收窄偏差的双向映射说明
        ...V2_REGISTERED_SKILLS.map((skill) => skill.directive),
        ...V2_CALIBRATION_DIRECTIVES
      ] : [])
    ],
    input: {
      workflow: input.workflow,
      productName: input.productName,
      productFeature: input.productFeature,
      userInstruction: input.userInstruction,
      sellingPoints: input.sellingPoints,
      copywriting: input.copywriting,
      richness: input.richness,
      fontStyle: input.fontStyle,
      modelMode: input.modelMode,
      modelPose: input.modelPose,
      modelUsage: input.modelUsage,
      reverseScreens: input.reverseScreens,
      lang: input.lang,
      ratio: input.ratio,
      imageSize: input.imageSize,
      screenCount: count,
      ...(selectedSections ? { selectedSections } : {})
    },
    images: {
      productImages: productFiles.map((file, index) => fileMeta(file, { index, role: "product" })),
      referenceImages: referenceFiles.map((file, index) => fileMeta(file, { index, role: "reference" }))
    },
    skillPack: compactSkillPack(input, v2Context),
    outputSchema: {
      // V220/S2-B：按 V219 planning-result.schema.json 的 9 顶层键增补（agent/output-contract.md 兼容映射）。
      // 新增 schemaVersion/industryProfile/consumerInsights/marketingStrategy/globalVisualDNA 均为可选契约提示；
      // 旧 product/strategy/screens/qc/planning 字段一律不删、不改字节语义。
      schemaVersion: "string（固定 \"1.0.0\"；可选）",
      product: {
        name: "string",
        industryId: "apparel|beauty|food|home|electronics|motherBaby|pet|jewelry|sports|generic",
        industryName: "string",
        targetAudience: "string",
        materials: ["string"],
        colors: ["string"],
        structureLocks: ["string"],
        realSellingPoints: ["string"],
        riskNotes: ["string"],
        styleDirection: "string",
        uncertainties: ["{ claim: string, reason: string }（可选：图片无法确认事项，不作确定事实）"]
      },
      industryProfile: {
        industryId: "string（可选：展示=规则同一决策，强特征优先）",
        industryName: "string（可选）",
        evidence: ["string（可选：只引用 visible/inferred 事实）"],
        decisionLogic: "string（可选）",
        confidence: "high|medium|low（可选）",
        uncertaintyNote: "string（可选）"
      },
      consumerInsights: {
        audience: "string（可选）",
        needs: ["{ need: string, evidenceRef: string }（可选）"]
      },
      marketingStrategy: {
        valueLadder: ["{ fact: string, need: string, benefit: string, expression: string }（可选）"],
        tone: "string（可选）",
        boundaries: ["string（可选：行业禁忌与真实性边界）"]
      },
      globalVisualDNA: {
        palette: "string（可选：整组色调，只声明一次）",
        texture: "string（可选）",
        lighting: "string（可选：整组装统一布光）",
        cameraLanguage: "string（可选）",
        ratio: "string（可选）",
        tone: "string（可选）",
        integrityLocks: ["string（可选：主体/中文标签/行业禁忌锁，每屏精简约束保留）"]
      },
      strategy: {
        globalStyle: "string",
        copywritingTone: "string",
        pageRhythm: ["string"],
        platformNotes: ["string"],
        consistencyRules: ["string"]
      },
      screens: [
        {
          screen: 1,
          moduleId: "hero|painReverse|coreSellingPoint|materialDetail|useScenario|specInfo|trustProof|conversionClose|fitStructure",
          title: "string",
          summary: "string",
          sellingPoint: "string",
          composition: "string",
          copywriting: "string",
          productFileIndexes: [0],
          referenceFileIndexes: [0],
          referenceReason: "string",
          modelPolicyHint: "string",
          promptDirectives: ["string"],
          negativeConstraints: ["string"],
          qualityChecks: ["string"],
          ...(skillVersion === "v2" ? {
            compositionVariantId: "string（可选：该屏 moduleId 对应变体的字母 A/B/C/D 或完整 id 如 hero-A；无效时服务端按规则分配）"
          } : {})
        }
      ],
      qc: {
        globalChecks: ["string"],
        commonFailureRisks: ["string"],
        retryAdvice: ["string"]
      },
      // S1-b 规划契约（仅 planningActive 时写入 outputSchema，供模型产出 planning 顶层结果）
      ...(planningActive ? {
        planning: {
          narrative: { id: "string", reason: "string", confidence: "string" },
          screenRoles: [{ index: 0, role: "hero", sectionRefs: ["string"] }],
          facts: [{ claim: "string", level: "visible|inferred|mustNotClaim" }],
          dedupLog: ["string"]
        }
      } : {})
    }
  };

  const content = [
    {
      type: "text",
      text: JSON.stringify(textPayload, null, 2)
    }
  ];

  if (!includeImages) return content;

  let attachedCount = 0;
  for (const [role, list] of [["product", productFiles], ["reference", referenceFiles]]) {
    for (const [index, file] of list.entries()) {
      if (attachedCount >= MAX_AI_IMAGE_COUNT) break;
      content.push({
        type: "text",
        text: `${role === "product" ? "产品图" : "参考图"} ${role}Image[${index}]：${file.originalname || `${role}-${index + 1}`}`
      });
      content.push(safeImagePart(file, "low"));
      attachedCount += 1;
    }
  }

  return content;
}

function buildDetailChatBody(input, files, includeImages, withJsonFormat) {
  const body = {
    model: modelName(input, DETAIL_MODEL_SPEC),
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: "你是资深电商详情页视觉策略总监、商品真实性审校员和 AI 生图提示词架构师。你必须用中文输出严格 JSON。"
      },
      {
        role: "user",
        content: buildDetailAnalysisContent(input, files, includeImages)
      }
    ]
  };
  if (withJsonFormat) body.response_format = { type: "json_object" };
  return body;
}

async function createDetailAiPlan({ input = {}, files = [], apiKey, baseUrls = [], timeoutMs = DETAIL_ANALYSIS_TIMEOUT_MS }) {
  if (!apiKey) throw new Error("缺少 API Key，无法调用详情 AI 分析模型");
  const candidates = baseUrls.filter(Boolean);
  if (candidates.length === 0) throw new Error("没有可用的渠道地址");

  const startedAt = Date.now();
  const attempts = [];
  const abort = createAbortSignal(timeoutMs);

  try {
    for (const baseUrl of candidates) {
      for (const mode of [
        { includeImages: true, withJsonFormat: true },
        { includeImages: true, withJsonFormat: false },
        { includeImages: false, withJsonFormat: true },
        { includeImages: false, withJsonFormat: false }
      ]) {
        const { url, response, parsed } = await postChatCompletion({
          baseUrl,
          apiKey,
          body: buildDetailChatBody(input, files, mode.includeImages, mode.withJsonFormat),
          signal: abort.signal
        });
        const message = parsed.json?.error?.message || parsed.text || `HTTP ${response.status}`;
        attempts.push({
          url,
          status: response.status,
          ok: response.ok,
          includeImages: mode.includeImages,
          withJsonFormat: mode.withJsonFormat,
          message: String(message).slice(0, 260)
        });

        if (!response.ok && mode.withJsonFormat && shouldRetryWithoutJsonFormat(response.status, message)) continue;
        if (!response.ok && mode.includeImages && shouldRetryWithoutImages(response.status, message)) continue;
        if (!response.ok) break;

        const content = responseContent(parsed.json);
        const plan = extractJsonObject(content, "AI 分析模型");
        return {
          ok: true,
          model: modelName(input, DETAIL_MODEL_SPEC),
          usedBaseUrl: baseUrl,
          mode: mode.includeImages ? "ai-vision" : "ai-text",
          timing: {
            totalMs: Date.now() - startedAt
          },
          attempts,
          plan
        };
      }
    }
  } finally {
    abort.dispose();
  }

  const last = attempts[attempts.length - 1];
  throw new Error(last?.message || "详情 AI 分析失败");
}

export {
  DEFAULT_DETAIL_ANALYSIS_MODEL,
  createDetailAiPlan
};
