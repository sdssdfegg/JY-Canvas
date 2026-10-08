import { createAbortSignal } from "./core/http-client.js";
import { renderReferencePolicy, NO_REFERENCE_NOTE } from "../src/shared/reference-policy.js";
import { asText, extractJsonObject, fileMeta, modelName, postChatCompletion, responseContent, safeImagePart, shouldRetryWithoutImages, shouldRetryWithoutJsonFormat } from "./core/ai-chat-shared.js";

const DEFAULT_REFERENCE_TEXT_MODEL = "gpt-5.4-mini";
const REFERENCE_MODEL_SPEC = { fields: ["detailAnalysisModel", "referenceTextModel", "textModel"], fallback: DEFAULT_REFERENCE_TEXT_MODEL };
const REFERENCE_REWRITE_TIMEOUT_MS = 90000;
const MAX_REFERENCE_AI_IMAGE_COUNT = 8;

function clampStrength(value) {
  const parsed = Number.parseInt(value, 10);
  const rounded = Math.round((Number.isFinite(parsed) ? parsed : 60) / 10) * 10;
  return Math.max(30, Math.min(100, rounded));
}


function referenceDimensionPolicy(value, dimension) {
  const policies = {
    元素: {
      none: "元素维度禁止参考：不得使用参考图里的道具、装饰、人物身份、品牌、文字、水印和其它商品。",
      light: "元素维度轻参考：只抽象少量安全元素类别，例如柔和色块、轻量道具、材质氛围；具体物件必须替换。",
      medium: "元素维度中等参考：可学习元素层级和商业辅助道具类型，但要重组摆放、形状、材质和数量。",
      strong: "元素维度重点参考：学习参考图元素策略和视觉层次，但必须重绘元素细节，不能让用户觉得是同一张图。"
    },
    构图: {
      none: "构图维度禁止参考：采用新的电商构图，主体清楚、留白合理、卖点动线顺畅。",
      light: "构图维度轻参考：只参考主体大致占比或横竖节奏，镜头、裁切和留白要重新设计。",
      medium: "构图维度中等参考：可学习主次层级、卖点区位置和视觉动线，但要改变裁切、视角和空间比例。",
      strong: "构图维度重点参考：学习转化型构图逻辑，但必须改变关键版式、元素位置、镜头距离和透视。"
    },
    场景主题: {
      none: "场景维度禁止参考：重新建立适合商品调性的电商场景，参考图场景不进入画面。",
      light: "场景维度轻参考：只参考氛围词，例如清爽、户外、居家、轻奢、专业感；地点和细节必须重建。",
      medium: "场景维度中等参考：可吸收相近使用场景和情绪价值，但替换空间结构、背景物和光线细节。",
      strong: "场景维度重点参考：学习场景类型和消费情绪，但必须重构环境、装饰、人物关系和品牌信息。"
    }
  };
  return policies[dimension]?.[value] || policies[dimension]?.none || `${dimension}维度不参考。`;
}

function localReferencePrompt(input) {
  const userPrompt = asText(input.prompt, "生成一张高质量电商商品图，突出商品真实结构、材质、颜色和核心卖点。");
  const policyLines = Array.isArray(input.policies) && input.policies.length > 0
    ? input.policies
    : renderReferencePolicy({ strength: input.strength, element: input.element, composition: input.composition, scene: input.scene, styleCount: Number(input.styleCount) || 0 });
  const policyBlock = policyLines.length > 0 ? policyLines : [NO_REFERENCE_NOTE];
  return [
    userPrompt,
    ...policyBlock,
    "整体风格只能选择一个稳定主调性，不要把多张参考图平均融合，不要混搭成拼贴感。",
    "产品图优先级最高：保持商品结构、颜色、材质、比例、纹理和关键细节不变。",
    "画面要求：电商主图/详情图质感，主体清晰，光线统一，背景干净，构图服务转化，商品边缘清楚。",
    "禁止：照搬参考图、水印、品牌、乱码文字、错误商品、风格割裂、过曝、畸形、虚假卖点。"
  ].join("\n");
}

function buildReferencePolicyText(input) {
  if (Array.isArray(input.policies) && input.policies.length > 0) return input.policies;
  return [
    referenceDimensionPolicy(input.element, "元素"),
    referenceDimensionPolicy(input.composition, "构图"),
    referenceDimensionPolicy(input.scene, "场景主题")
  ];
}

function buildReferenceSkillPayload(input, files, includeImages) {
  const productFiles = files.filter((file) => file.referenceRole === "product");
  const referenceFiles = files.filter((file) => file.referenceRole === "reference");
  const textPayload = {
    task: "参考生图智能扩写提示词",
    goal: "根据用户给定的产品图、运营参考图和四个参考控制项，输出一段干净、稳定、可直接用于图片生成的电商提示词。",
    input: {
      prompt: asText(input.prompt),
      strength: clampStrength(input.strength),
      element: asText(input.element, "medium"),
      composition: asText(input.composition, "light"),
      scene: asText(input.scene, "medium"),
      imageSize: asText(input.imageSize, "2K"),
      aspectRatio: asText(input.aspectRatio, "3:4"),
      targetImageModel: asText(input.model, "gpt-image")
    },
    images: {
      uploadOrder: [
        `前 ${productFiles.length} 张是产品图，是真实商品事实来源。`,
        `后 ${referenceFiles.length} 张是运营参考图，只能按参考控制项抽取方向。`
      ],
      productImages: productFiles.map((file, index) => fileMeta(file, { index, role: "product" })),
      referenceImages: referenceFiles.map((file, index) => fileMeta(file, { index, role: "reference" }))
    },
    skill: {
      priority: [
        "1. 产品图真实性锁定最高：不得改变商品结构、颜色、材质、比例、款式和关键细节。",
        "2. 用户原始提示词第二优先：必须保留用户真正想生成的商品图目标。",
        "3. 参考值是全局上限：参考值越高，参考图影响越明显，但仍不能照搬。",
        "4. 元素、构图、场景主题是三条独立通道：选择不参考的通道必须关闭；轻参考只抽象方向；重点参考只学习策略，不复制画面。"
      ],
      antiCollageRules: [
        "必须先选择一个主调性，不要同时堆叠多种场景、光线、色调和风格。",
        "多张参考图不能平均融合。选择最匹配用户目标的一张作为主参考，其余只作为辅助，不要把每张图的元素都塞进最终画面。",
        "如果元素、构图、场景主题的强度互相冲突，以构图稳定和商品清晰为优先，舍弃会造成缝合感的内容。",
        "提示词要像专业摄影/电商美术指导给生图模型的指令，不要像规则列表拼接。"
      ],
      referencePolicy: buildReferencePolicyText(input),
      requiredOutput: {
        prompt: "string，一段最终生图提示词，中文，150-320字，必须自然连贯，不要 Markdown；不得包含「参考值 / 百分比 / 档位说明」，必须是可直接执行的画面描述。",
        strategy: {
          mainStyleAxis: "string，单一主调性",
          referenceUsage: ["string，说明哪些参考维度被采用"],
          discardedParts: ["string，说明哪些参考内容被放弃以避免缝合感"]
        },
        negative: ["string，主要反向约束"]
      }
    }
  };

  const content = [{ type: "text", text: JSON.stringify(textPayload, null, 2) }];
  if (!includeImages) return content;

  let attachedCount = 0;
  for (const [role, list] of [["product", productFiles], ["reference", referenceFiles]]) {
    for (const [index, file] of list.entries()) {
      if (attachedCount >= MAX_REFERENCE_AI_IMAGE_COUNT) break;
      content.push({
        type: "text",
        text: `${role === "product" ? "产品图" : "运营参考图"} ${role}[${index}]：${file.originalname || `${role}-${index + 1}`}`
      });
      content.push(safeImagePart(file, "low"));
      attachedCount += 1;
    }
  }
  return content;
}

function buildReferenceChatBody(input, files, includeImages, withJsonFormat) {
  const body = {
    model: modelName(input, REFERENCE_MODEL_SPEC),
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content: [
          "你是资深电商图片视觉策略师和 AI 生图提示词架构师。",
          "你的任务不是把规则堆进提示词，而是做取舍：统一风格，明确哪些参考维度有效，避免缝合怪。",
          "必须输出严格 JSON，不要 Markdown，不要解释。"
        ].join("\n")
      },
      {
        role: "user",
        content: buildReferenceSkillPayload(input, files, includeImages)
      }
    ]
  };
  if (withJsonFormat) body.response_format = { type: "json_object" };
  return body;
}

function normalizeReferencePlan(plan, input) {
  const prompt = asText(plan?.prompt, localReferencePrompt(input));
  return {
    prompt,
    strategy: plan?.strategy && typeof plan.strategy === "object" ? plan.strategy : {
      mainStyleAxis: "电商商品图",
      referenceUsage: [],
      discardedParts: []
    },
    negative: Array.isArray(plan?.negative) ? plan.negative.map(asText).filter(Boolean) : []
  };
}

async function createReferencePromptRewrite({ input = {}, files = [], apiKey, baseUrls = [], timeoutMs = REFERENCE_REWRITE_TIMEOUT_MS }) {
  if (!apiKey) throw new Error("缺少 API Key，无法调用参考生图文本模型");
  const candidates = baseUrls.filter(Boolean);
  if (candidates.length === 0) throw new Error("没有可用的渠道地址");

  const startedAt = Date.now();
  const abort = createAbortSignal(timeoutMs);
  const attempts = [];

  try {
    for (const baseUrl of candidates) {
      for (const mode of [
        { includeImages: true, withJsonFormat: true },
        { includeImages: true, withJsonFormat: false },
        { includeImages: false, withJsonFormat: true },
        { includeImages: false, withJsonFormat: false }
      ]) {
        const { response, parsed } = await postChatCompletion({
          baseUrl,
          apiKey,
          body: buildReferenceChatBody(input, files, mode.includeImages, mode.withJsonFormat),
          signal: abort.signal
        });
        const message = parsed.json?.error?.message || parsed.text || `HTTP ${response.status}`;
        attempts.push({
          baseUrl,
          status: response.status,
          ok: response.ok,
          includeImages: mode.includeImages,
          withJsonFormat: mode.withJsonFormat,
          message: String(message).slice(0, 260)
        });

        if (!response.ok && mode.withJsonFormat && shouldRetryWithoutJsonFormat(response.status, message)) continue;
        if (!response.ok && mode.includeImages && shouldRetryWithoutImages(response.status, message)) continue;
        if (!response.ok) break;

        const plan = normalizeReferencePlan(extractJsonObject(responseContent(parsed.json), "参考生图文本模型"), input);
        return {
          ok: true,
          mode: mode.includeImages ? "ai-vision" : "ai-text",
          model: modelName(input, REFERENCE_MODEL_SPEC),
          usedBaseUrl: baseUrl,
          timing: { totalMs: Date.now() - startedAt },
          attempts,
          ...plan
        };
      }
    }
  } finally {
    abort.dispose();
  }

  const last = attempts[attempts.length - 1];
  throw new Error(last?.message || "参考生图文本模型扩写失败");
}

export {
  DEFAULT_REFERENCE_TEXT_MODEL,
  createReferencePromptRewrite,
  localReferencePrompt
};
