// src/features/ai-canvas/ai-canvas-generation.js
// V143（MVP-2）：生成节点执行——复用 JY 现有 POST /api/images 服务，不重写生成系统。
// 设计约束（见审计 doc 07）：复用现有 API 配置（同存储键取 apiKey）、不暴露 key 给第三方、
// deferAutoSave=1 避免污染主画廊历史、调用失败显示明确错误。
import { generateImages } from "../../api/images.js";
import { getAppConfig } from "../../api/config.js";
import { STORAGE_KEY } from "../../shared/app-defaults.js";
import { readJsonStorage } from "../../lib/storage/json-storage.js";
import { workflowInputsWithChain } from "./ai-canvas-workflow.js";
import { resolveGenerationParams } from "./ai-canvas-params.js";

// 与 server IMAGE_UPLOAD_PARSE_CEILING 对齐：最多 6 张输入图。
const IMAGE_UPLOAD_CEILING = 6;

// 本地内联（零依赖叶子）：清洗 API Key 输入——剥零宽字符 / Bearer 前缀 / 首尾引号 / 空白。
// 从 src/features/auth/api-key.js 同款逻辑复制，避免在隔离 feature 间引入跨特性依赖。
function normalizeApiKeyInput(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "");
}

// data:image/png;base64,xxxx → File（浏览器环境 atob 可用）。
export function dataUrlToFile(dataUrl, name = "image.png") {
  const [meta, b64] = String(dataUrl || "").split(",");
  if (!b64) return null;
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

// 收集生成节点的上游：图片/结果节点（多张，作为编辑输入）+ 提示词节点（单条）。
export function collectGenerationInputs(current, genNode) {
  if (!current || !genNode) return { imageNodes: [], promptText: "" };
  const upstreamIds = current.edges
    .filter((e) => e.to === genNode.id)
    .map((e) => e.from);
  const imageNodes = current.nodes.filter(
    (n) =>
      upstreamIds.includes(n.id) &&
      (n.type === "image" || n.type === "result") &&
      (n.data.src || n.data.url)
  );
  const promptNode = current.nodes.find(
    (n) => upstreamIds.includes(n.id) && n.type === "prompt" && (n.data.text || "").trim()
  );
  const promptText = promptNode
    ? promptNode.data.text.trim()
    : (genNode.data.prompt || "").trim();
  return { imageNodes, promptText };
}

// MVP-4 追加（不改上面的语义）：工作流运行时的输入收集。
// 与 collectGenerationInputs 的差别只有一处——把「直接上游里已经生成成功的生成节点」
// 也算作输入图（用它的 resultUrl），这样 gen → gen 的链式多轮（连续编辑）才能跑通。
// 单独开一个函数是为了不碰原函数的语义：单节点「执行生成」仍走原来的口径。
// 真正的解析逻辑放在零 import 的 ai-canvas-workflow.js（那边能被无头脚本直接断言）。
export function collectWorkflowInputs(current, genNode) {
  return workflowInputsWithChain(collectGenerationInputs(current, genNode), current, genNode);
}

// 执行生成：复用现有 /api/images（multipart image + 表单字段），成功返回首图 URL。
// 调用失败（含上游 4xx/5xx）由 apiJson 抛 ApiError，message 即上游错误文案。
export async function runCanvasGeneration({ genNode, imageNodes, promptText, settings, config }) {
  const apiKey = normalizeApiKeyInput(settings?.apiKey);
  const hasServerKey = Boolean(config?.hasServerKey);
  if (!apiKey && !hasServerKey) {
    throw new Error("请先在「设置」中配置 API Key（画布复用 JY 现有模型服务）。");
  }
  if (!promptText) {
    throw new Error("缺少提示词：请在生成节点填写，或连接一个提示词节点。");
  }

  // 出图参数：**节点显式设置 > 全局设置 > 内置默认**（解析在零 import 的 ai-canvas-params.js）。
  // 注意服务端 channel.js:142/145 对不支持的尺寸/比例是「自动降级」而非报错，
  // 所以这里传的值必须是 CHANNEL_IMAGE_SIZES / 模型 ratios 内的合法值（选项常量已对齐）。
  const params = resolveGenerationParams(genNode, settings);
  const form = new FormData();
  const files = imageNodes
    .map((n, i) =>
      dataUrlToFile(n.data.src || n.data.url, `${n.type === "result" ? "result" : "image"}-${i}.png`)
    )
    .filter(Boolean)
    .slice(0, IMAGE_UPLOAD_CEILING);
  files.forEach((f) => form.append("image", f));
  form.set("prompt", promptText);
  form.set("model", params.model);
  form.set("imageSize", params.imageSize);
  form.set("aspectRatio", params.aspectRatio);
  form.set("n", "1");
  form.set("deferAutoSave", "1"); // 不污染主画廊历史（与现有业务隔离）
  form.set("apiKey", apiKey);
  // server/channel.js:167 的 source 白名单已预留 "infinite-canvas"，便于日志区分来源。
  form.set("source", "infinite-canvas");

  const res = await generateImages(form); // ok 时返回 payload；失败抛 ApiError
  const images = Array.isArray(res?.images) ? res.images : [];
  if (!images.length) {
    throw new Error("生成完成，但上游未返回图片。");
  }
  const first = images[0] || {};
  const resultUrl = first.url || (typeof first === "string" ? first : "");
  if (!resultUrl) {
    throw new Error("生成完成，但图片地址为空。");
  }
  return { resultUrl, usedModel: res?.usedModel || params.model };
}

// 读取 JY 现有设置（与全 App 同一存储键 jingyin-internal-settings-v3），供生成节点取 apiKey / 默认模型。
export function readJySettings() {
  return readJsonStorage(STORAGE_KEY, null) || {};
}

export async function fetchJyConfig() {
  try {
    const cfg = await getAppConfig();
    return cfg && typeof cfg === "object" ? cfg : { hasServerKey: false };
  } catch {
    return { hasServerKey: false };
  }
}
