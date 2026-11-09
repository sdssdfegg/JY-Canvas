// server/features/detail-studio/capabilities.js
// 阶段 1 能力自检：只复用 JY-Canvas 现有模型体系。
//  - 文本：server/core/ai-chat-shared.js#postChatCompletion → 单网关 /chat/completions
//  - 图片：现有 POST /api/images（前端 src/api/images.js#generateImages）
// 严禁引入第二套 Provider / API Key / 网关 / 图片生成体系。

import { modelName, postChatCompletion, responseContent } from "../../../core/ai-chat-shared.js";
import { resolveApiKey } from "../../../core/image-error-policy.js";
import { channelBaseCandidates } from "../../../core/image-channel-candidates.js";
import { DETAIL_STUDIO_MODEL_SPEC, describeDetailStudioModel } from "../model/model-config.js";
import { DETAIL_STUDIO_MODES, DETAIL_STUDIO_SCHEMA_VERSION } from "../store/project-store.js";

// 与 server/channel.js:126-211 及 server/routes/images.routes.js:147-158 对齐的最小契约。
export const IMAGE_REQUEST_REQUIRED_FIELDS = ["apiKey", "prompt", "model", "channelId", "dispatchMode"];
export const IMAGE_REQUEST_OPTIONAL_FIELDS = ["imageSize", "aspectRatio", "n", "deferAutoSave", "source"];

function gatewayList() {
  const candidates = channelBaseCandidates();
  return Array.isArray(candidates) ? candidates : [];
}

export function describeCapabilities() {
  const gateways = gatewayList();
  return {
    ok: true,
    workspace: "detail-studio",
    stage: 1,
    publicSafe: true,
    noSecondProvider: true,
    text: {
      ...describeDetailStudioModel(),
      endpoint: "/chat/completions",
      gatewayCount: gateways.length
    },
    image: {
      endpoint: "/api/images",
      transport: "multipart/form-data",
      reuse: "src/api/images.js#generateImages",
      requiredFields: IMAGE_REQUEST_REQUIRED_FIELDS,
      optionalFields: IMAGE_REQUEST_OPTIONAL_FIELDS,
      noDirectUpstreamCall: true
    },
    storage: {
      root: "data/detail-studio/projects",
      serverSide: true,
      browserOnly: false,
      resultCacheTtlExempt: true,
      seedExcluded: true,
      schemaVersion: DETAIL_STUDIO_SCHEMA_VERSION
    },
    modes: DETAIL_STUDIO_MODES,
    maxScreens: 20
  };
}

// 真调一次文本模型，验证 postChatCompletion 链路（需用户自带 API Key）。
// KEY 只在请求内存活，不落盘、不写日志、不回显。
export async function probeTextModel({ apiKey, prompt } = {}) {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return { ok: false, status: 401, message: "请先在设置里填写 API Key" };
  }
  const gateways = gatewayList();
  const baseUrl = gateways[0] || "";
  if (!baseUrl) {
    return { ok: false, status: 502, message: "未配置可用网关" };
  }
  const model = modelName({}, DETAIL_STUDIO_MODEL_SPEC);
  const body = {
    model,
    messages: [
      { role: "system", content: "你是 JY-Canvas 详情创作工作区的连通性测试助手，只回复 OK 两个字符。" },
      { role: "user", content: String(prompt || "连通性测试").slice(0, 200) }
    ],
    temperature: 0,
    max_tokens: 32
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const { response, parsed } = await postChatCompletion({
      baseUrl,
      apiKey: key,
      body,
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: "上游返回 HTTP " + response.status,
        upstream: String(parsed && parsed.text ? parsed.text : "").slice(0, 200)
      };
    }
    return {
      ok: true,
      endpoint: "/chat/completions",
      model,
      gatewayCount: gateways.length,
      reply: responseContent(parsed && parsed.json).slice(0, 200)
    };
  } catch (error) {
    const aborted = Boolean(error && error.name === "AbortError");
    return {
      ok: false,
      status: aborted ? 504 : 502,
      message: aborted ? "文本模型请求超时" : (error instanceof Error ? error.message : String(error))
    };
  } finally {
    clearTimeout(timer);
  }
}

// 只组装并校验 /api/images 的请求体契约，不实际调用上游、不产生费用。
// 沿用项目口径：冒烟验证不实际生图，避免触发上游与配额；真实出图留阶段 4 验收。
// apiKey 一律脱敏，绝不回显。
export function buildImageProbe(input = {}) {
  const fields = {
    apiKey: input.apiKey ? "<provided>" : "",
    prompt: String(input.prompt || "").trim(),
    model: String(input.model || "").trim(),
    channelId: String(input.channelId || "").trim(),
    dispatchMode: "manual",
    imageSize: String(input.imageSize || "2K").trim(),
    aspectRatio: String(input.aspectRatio || "3:4").trim(),
    n: "1",
    deferAutoSave: "1",
    source: "detail-main"
  };
  const missing = IMAGE_REQUEST_REQUIRED_FIELDS.filter((field) => !fields[field]);
  return {
    ok: missing.length === 0,
    endpoint: "/api/images",
    transport: "multipart/form-data",
    reuse: "src/api/images.js#generateImages",
    requiredFields: IMAGE_REQUEST_REQUIRED_FIELDS,
    optionalFields: IMAGE_REQUEST_OPTIONAL_FIELDS,
    missing,
    fields,
    note: "仅校验请求体契约，不实际调用上游、不产生费用；apiKey 已脱敏"
  };
}
