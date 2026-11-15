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
import { skillModuleV2 } from "../prompts/server/detail-v2-planning/index.js";

const DEFAULT_DETAIL_ANALYSIS_MODEL = "gpt-5.6-luna"; // 2026-11-01 上游已下线 gpt-5.4-mini
const DETAIL_MODEL_SPEC = { fields: ["detailAnalysisModel", "textModel"], fallback: DEFAULT_DETAIL_ANALYSIS_MODEL };
const DETAIL_ANALYSIS_TIMEOUT_MS = 120000;
const MAX_AI_IMAGE_COUNT = 10;

function industrySeedText(input) {
  return [
    input.productName,
    input.productFeature,
    input.sellingPoints,
    input.userInstruction
  ].join(" ");
}

function compactSkillPack(input, v2Context = null) {
  // planningActive（V2 启用且空板块）：条件注入规划 Skill。与 buildDetailAnalysisContent
  // 内的 planningActive 口径一致——v2Context 非 null 即 V2 启用，selectedSections 为空即未选板块。
  const planningActive = Boolean(v2Context)
    && !(Array.isArray(input.selectedSections) && input.selectedSections.length > 0);
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
  // 自建 V2 规划 Skill：条件注入（仅 planningActive 即 V2 启用且空板块时进入 skillPack）。
  // 保持 compactSkillPack 调用锚点不变，第三参数 planningActive 追加在锚点之后。
  const planningSkillField = planningActive ? { planningSkill: skillModuleV2 } : {};
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
  // V214 P1：客户可选内容板块。空选时为 null，下面所有条件分支都不触发，
  // 保证 textPayload 与改造前逐字节一致（JSON.stringify(textPayload, null, 2)）。
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
  // S1-b 规划触发：V2 风格包实际生效（v2Context 非 null）且未选任何内容板块时，由 AI 在
  // 指定屏数内自主规划（决策 #3）。以 v2Context 为门控（与 middleware 的 styleDecision 口径一致），
  // 保证「v2-off（stylePackId=off）== v1」的既有强不变式不被破坏；条件注入：V2 关闭 / 已选板块 / 风格包关闭时为 false。
  const planningActive = Boolean(v2Context) && selectedSections === null;
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
      ...(planningActive ? [...skillModuleV2.directives, ...skillModuleV2.constraints] : [])
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
        styleDirection: "string"
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
