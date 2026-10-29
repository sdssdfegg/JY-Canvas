// src/features/ai-canvas/ai-canvas-node-outfit.js
// V144：outfit 强类型画布节点的执行适配器。
//
// 设计纪律（与 V122「搬运丢参」教训一致）：
// - 复用既有 POST /api/generate-outfit 端点 + 页面同款 generateOutfit 客户端 + routingFields /
//   normalizeOutfitIntent / normalizeRetouchIntent 共享模块，**逐项对齐** outfit-batch-execution.js
//   的 runSingleTask payload 构造，不另写一份解析。
// - 服务端约定（来自 runSingleTask 实测）：① 所有输入图用同一个字段名 `image`，按序 图1=model、
//   图2=服装/颜色参考；② 结果图在响应 `payload.image`；③ recolor 不发 intent（仅 colorReferenceCount
//   + 颜色参考图），retouch 发 retouchIntent，outfit 发 outfitIntent + maskMode。
//
// 两个出口：
// - buildOutfitPayload(node, current, opts) —— 纯函数，构造 { payload, imageUrls }，被无头验收
//   脚本断言「字段无丢项 / 与 runSingleTask 同构」。不触网、不依赖浏览器 API。
// - runOutfitNodeGeneration(node, current, opts) —— 浏览器侧：把 imageUrls 转 File、拼 FormData、
//   调 generateOutfit，返回 { ok, src } 或 { ok:false, error }。

import { collectNodeInputs, imageForPort } from "./ai-canvas-data-bus.js";
import { getNodeDef, isOutfitKind } from "./ai-canvas-nodes.js";
import { generateOutfit } from "../../api/outfit.js";
import { fetchLocalBlob } from "../../api/assets.js";
import { routingFields } from "../../shared/routing.js";
import { normalizeOutfitIntent } from "../../shared/outfit-intent.js";
import { normalizeRetouchIntent } from "../../shared/retouch-intent.js";

// 把节点 + 上游输入解析成「对齐 runSingleTask 的 payload」+ 有序 imageUrls。
// imageUrls: [{ role, url }]，顺序即服务端约定（图1 = model，图2 = 服装/颜色参考）。
export function buildOutfitPayload(node, current, opts = {}) {
  const def = getNodeDef(node?.type);
  if (!def || !isOutfitKind(node?.type)) {
    throw new Error(`不是 outfit 强类型节点：${node?.type}`);
  }
  const data = node?.data || {};
  const settings = opts?.settings || {};
  const config = opts?.config || {};
  const apiKey = opts?.apiKey || settings?.apiKey || "";

  const { imageInputs, promptText } = collectNodeInputs(current, node);
  const prompt = String(data.prompt || promptText || "").trim();

  // 按 imageRoles 归位上游端口图：roles 把「端口名」映射到「角色名(model/clothing/color)」。
  const roles = def.imageRoles || {};
  const urlsByRole = {};
  Object.keys(roles).forEach((port) => {
    const url = imageForPort(imageInputs, port);
    if (url) urlsByRole[roles[port]] = url;
  });

  // 有序 imageUrls：model 必须存在；second 仅在有对应角色时存在（图2）。
  const imageUrls = [];
  if (urlsByRole.model) imageUrls.push({ role: "model", url: urlsByRole.model });
  const secondRole = ["clothing", "color", "detail", "reference"].find((r) => urlsByRole[r]);
  if (secondRole) imageUrls.push({ role: secondRole, url: urlsByRole[secondRole] });

  const wf = def.workflowMode;

  // canonical 路由字段：routingFields(settings.model, settings.channelId, config.routing || config)
  const rf = routingFields(settings.model, settings.channelId, config.routing || config);

  const payload = {
    apiKey,
    ...rf,
    imageSize: settings.imageSize || data.imageSize || "1024x1024",
    aspectRatio: settings.aspectRatio || data.aspectRatio || "1:1",
    prompt,
    productNote: settings.productNote || "",
    smartIntervention: settings.smartIntervention || false,
    workflowMode: wf,
    pageName: data.pageName || def.label,
    uploadLabels: settings.uploadLabels || {},
    modelImageCount: 1,
    colorReferenceCount: wf === "recolor" ? (secondRole === "color" ? 1 : 0) : 0,
    whiteRefineReferenceCount: wf === "white-refine" ? (secondRole ? 1 : 0) : 0,
    outpaintReferenceCount: 0,
    referenceCount: 0,
    pairingMode: settings.pairingMode || "auto",
    preprocessMode: settings.preprocessMode || "",
    deferAutoSave: true, // 画布结果只在画布内流转，不污染主画廊（与画布通用生成节点一致）
    maskEdit: false,
    localEdit: null
  };

  if (wf === "outfit") {
    const parts = (data.outfitIntent && data.outfitIntent.parts) || def.defaultData?.outfitIntent?.parts || ["upper", "lower"];
    payload.outfitIntent = normalizeOutfitIntent({ ...(data.outfitIntent || {}), parts });
    payload.maskMode = data.maskMode || settings.maskMode || "none";
  } else if (wf === "white-refine") {
    payload.retouchIntent = normalizeRetouchIntent(data.retouchIntent || {});
  }
  // recolor：canonical runSingleTask 对 recolor 不发 intent（仅 colorReferenceCount + 颜色参考图），故不附加 intent。

  return { payload, imageUrls, prompt };
}

// 浏览器侧执行：imageUrls(URL) -> File -> FormData -> generateOutfit。
// 返回 { ok:true, src } 或 { ok:false, error }。
export async function runOutfitNodeGeneration(node, current, opts = {}) {
  let built;
  try {
    built = buildOutfitPayload(node, current, opts);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!built.imageUrls.length || !built.imageUrls[0].url) {
    return { ok: false, error: "缺少图1（人物/主图）上游输入" };
  }
  const form = new FormData();
  form.append("payload", JSON.stringify(built.payload));
  for (const item of built.imageUrls) {
    try {
      const file = await urlToFile(item.url, `${item.role}.png`);
      form.append("image", file, `${item.role}.png`);
    } catch (error) {
      return { ok: false, error: `图片读取失败（${item.role}）：${error instanceof Error ? error.message : String(error)}` };
    }
  }
  try {
    const res = await generateOutfit(form);
    const src = res?.payload?.image || res?.image;
    if (!src) return { ok: false, error: "服务端未返回图片" };
    return { ok: true, src };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// URL -> File（data:/blob:/http: 均可；data: 直接解 base64，其它走 fetch）。
async function urlToFile(url, name) {
  if (typeof url === "string" && url.startsWith("data:")) {
    const [meta, b64] = url.split(",");
    const mimeMatch = meta.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }
  const blob = await fetchLocalBlob(url);
  return new File([blob], name, { type: blob.type || "image/png" });
}
