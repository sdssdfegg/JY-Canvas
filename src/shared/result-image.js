// 结果图「失效/缺图」的统一处理（快捷生成与批量生成共用）。
//
// 背景（P1 缺图自愈）：
//   结果卡片原来对"图片加载失败"完全没有处理 —— 预载失败后照样把坏地址塞给 <img>，
//   于是每次打开页面都会重复请求已经不存在的文件（404），或者回退到早已退役的上游域名（502），
//   用户看到的就是一张没有解释的空白卡片，而且永远不会自愈。
//
// 这里提供两件事：
//   1. 判读服务端标记的"归档文件已丢失"（`image.missing`），命中时**根本不发请求**；
//   2. 把"加载失败"翻译成人能看懂的原因，让卡片显示原因而不是空白。
//
// 注意：本模块只做判读与文案，不发起任何网络请求，也不修改持久化数据；
// V11-RF-052 起另外承载「拖拽下载族」（见文件末尾那段注释），它们会碰 DOM 与 FileReader。

import { IMAGE_SOURCE_REASONS, classifyImageSource } from "./image-hosts.js";
import { fileBaseName } from "./file-name.js";
import { displayImageRequestUrl } from "../api/assets.js";

/** 缺图/失效的原因码 → 用户可读文案。 */
export const RESULT_IMAGE_MISSING_REASONS = Object.freeze({
  archive_missing: "本地归档文件已丢失：这条记录保存时原图没有落到本机（或归档文件被移动/清理过）。",
  remote_expired: "远程原图链接已失效：结果图只在渠道服务器上存过临时链接，链接过期后无法再取回。",
  load_failed: "图片加载失败：归档文件可能已被移动或删除，远程链接也可能已经过期。",
  reference_missing: "参考图缩略图已丢失：不影响已生成的结果图，只是看不到当时的参考图。",
  // 2026-09-26：批量生成里"只拿到浏览器内存里的临时图、没能落成可恢复地址"的结果。
  // 典型来源：局部回贴/扩图的本地合成结果缓存失败，随后浏览器整页刷新——
  // blob: 地址只在创建它的那个文档里有效，刷新后必然失效。
  // 这里必须说清楚真实原因，不能写成"结果请到保存目录确认"。
  temp_blob_expired: "临时地址已失效：这张结果当时只存在浏览器内存里（本地合成/缓存失败），整页刷新后无法再取回；应用内切换页面不受影响。",
  // 统一地址校验（允许本地 /api、data:/blob: 与**任意 https 公网图床**；
  // 只挡非 https 与本地/内网地址——渠道成图在各自 CDN 上，不能按域名拦）
  [IMAGE_SOURCE_REASONS.BLOCKED_HOST]: "原图地址指向本机或内网，出于安全已停止加载。",
  [IMAGE_SOURCE_REASONS.BLOCKED_SCHEME]: "原图地址的协议不被允许（只允许 https，或本地归档），已停止加载。",
  [IMAGE_SOURCE_REASONS.BLOCKED_PROXY_TARGET]: "原图代理地址里的目标地址不合法，已停止加载。",
  [IMAGE_SOURCE_REASONS.NO_SOURCE]: "这条记录没有可用的图片地址。"
});

/** 默认文案（没有具体原因码时）。 */
export const RESULT_IMAGE_MISSING_FALLBACK = "这张结果的原图已失效，无法显示。";

/** 取可读原因文案。 */
export function resultImageMissingText(image) {
  const reason = String(image?.missingReason || image?.missing_reason || "").trim();
  return RESULT_IMAGE_MISSING_REASONS[reason] || RESULT_IMAGE_MISSING_FALLBACK;
}

/** 服务端是否已经把这条记录标成"归档文件已丢失"。 */
export function isResultImageMarkedMissing(image) {
  return Boolean(image?.missing || image?.imageMissing);
}

/**
 * 结果卡片该显示什么。
 *
 * @param {object} image 记录里的 `image` 对象
 * @param {(image: object) => string} sourceFromImage 取出地址的函数（快捷生成/批量生成各有一套）
 * @returns {{src: string, missing: boolean, reason: string}}
 *          `missing === true` 时 `src` 一定是空串 → 调用方**不要**渲染 <img>，
 *          这样既不会 404/502，也不会出现"空白卡片无解释"。
 */
export function resultImageCardState(image, sourceFromImage) {
  // 服务端已标记的归档缺失最具体，优先用它
  if (isResultImageMarkedMissing(image)) {
    return { src: "", missing: true, reason: resultImageMissingText(image) };
  }
  const src = typeof sourceFromImage === "function" ? sourceFromImage(image) : "";
  if (!src) {
    return { src: "", missing: true, reason: RESULT_IMAGE_MISSING_REASONS.archive_missing };
  }
  // 统一地址校验：非白名单的绝对地址（旧中转站、预签名临时链接等）直接判失效、不发请求
  const verdict = classifyImageSource(src);
  if (!verdict.allowed) {
    return {
      src: "",
      missing: true,
      reason: RESULT_IMAGE_MISSING_REASONS[verdict.reason] || RESULT_IMAGE_MISSING_FALLBACK
    };
  }
  return { src, missing: false, reason: "" };
}

/**
 * 参考图对象 → 可显示的地址（V11-RF-042 收口）。
 *
 * 收口前两侧**是超集关系，不是分叉**：
 *   src/main.jsx（改前 :1096）        `localUrl || url || value`
 *   src/outfit-workflow.jsx（改前 :2455）`localUrl || previewUrl || url || value`
 *   —— 后者只多取一个 `previewUrl`，且夹在 `localUrl` 之后、`url` 之前，其余字段与顺序完全一致。
 * 按 RF-042 的预授权规则「**超集 ⇒ 统一到超集**」，取 outfit 那版。
 *
 * 为什么对 main 侧是零变化（不是"大概没事"，是逐条查过）：
 *   `previewUrl` 这个字段在 **src/main.jsx 全文件 0 命中** —— main 只读 localUrl/url/value，
 *   也从不为参考图对象写这个字段（参考图对象是 main 自己构造的，字段见 :740-744 与 :3728）。
 *   ⇒ 新增的 `previewUrl` 分支在 main 侧**永不触发**，取值结果与改前逐条相同。
 *   反过来若取 main 那版（收窄），outfit 侧会丢掉"本地编辑/原图预览地址"这一层 ⇒ 属于收窄，不取。
 *
 * @param {object} reference
 * @returns {string}
 */
export function referenceSource(reference) {
  return reference?.localUrl || reference?.previewUrl || reference?.url || reference?.value || "";
}

/** 参考图缩略图是否允许加载（同一套白名单校验）。 */
export function isAllowedReferenceImage(reference, sourceFromReference) {
  const src = typeof sourceFromReference === "function" ? sourceFromReference(reference) : "";
  if (!src) return false;
  return classifyImageSource(src).allowed;
}

/**
 * 结果图地址 → 诊断用的「来源类型」标签（V11-RF-041 收口）。
 *
 * 只用于**诊断打标**（`client-result-display-ready` 事件里的 `detail.sourceType`），
 * 与上面的失效判读是两件事：这里不判断地址能不能用，只回答"这张图是从哪儿来的"，
 * 便于事后定位"显示慢/显示不出来"到底卡在本地缓存、代理还是远程 CDN。
 *
 * 收口前在 src/main.jsx（CachedImage）与 src/outfit-workflow.jsx（PreparedResultImage）
 * 各有一份，**逐字完全一致**（`diff` 为空）⇒ 本次是纯搬运，标签字符串一个字都没改。
 * 标签一旦两侧不一致，同一张图在两个页面会被记成两种来源，日志没法对账。
 *
 * @param {string} src
 * @returns {"base64/data"|"browser-blob"|"local-cache"|"local-proxy"|"remote-url"|"local-url"|"empty"}
 */
export function diagnosticImageSourceType(src) {
  const text = String(src || "");
  if (text.startsWith("data:")) return "base64/data";
  if (text.startsWith("blob:")) return "browser-blob";
  if (text.startsWith("/api/result/") || text.startsWith("/api/history-image/")) return "local-cache";
  if (text.startsWith("/api/image-proxy")) return "local-proxy";
  if (/^https?:\/\//i.test(text)) return "remote-url";
  return text ? "local-url" : "empty";
}

/**
 * 结果图地址 + 记录 → 落盘用的 MIME（V11-RF-051 收口）。
 *
 * 收口前在 src/main.jsx 与 src/outfit-workflow.jsx 各有一份（都在组件内部、缩进定义），
 * 两份**逐字节一致**（脚本 `tmp/rf051-extract.mjs` 实测：496B / 442B，`Buffer.compare` 为 0）
 * ⇒ 本次是纯搬运，判定顺序、正则、兜底值一字未改。
 *
 * 为什么必须收口：这两条决定**下载文件的 MIME/扩展名**。两侧一旦不一致，
 * 同一张图在快捷生成下载的是 `a.png`、在批量生成下载的是 `a.webp`，
 * 而 Windows 按扩展名认类型 ⇒ 用户双击打不开，且现象只在"某一侧某一批"出现，极难归因。
 *
 * ⚠️ 与 `src/shared/image-input.js` 里的 `imageExtension`（按 MIME 字符串推）**不是同一族**：
 *   那一族只看 MIME，且被 `imageFilesFromClipboard` 依赖；本族还要回退到**地址里的扩展名**，
 *   因为结果图常常只有 URL（本地归档 / CDN 链接），拿不到 MIME。
 *   （`imageExtension` ↔ `imageExtensionFromMime` 的改名克隆已在 image-input.js 头部登记，属另一张单。）
 *
 * @param {string} src 图片地址（`/api/result/...`、CDN URL、`data:` 等）
 * @param {object|null} image 记录里的 image 对象（优先用服务端记的 MIME）
 * @returns {string} MIME，兜底 `"image/png"`
 */
export function imageMimeFromSource(src, image = null) {
  const explicit = String(image?.mimeType || image?.archiveMime || "").trim();
  if (explicit) return explicit;
  const dataMatch = String(src || "").match(/^data:([^;,]+)/i);
  if (dataMatch?.[1]) return dataMatch[1];
  if (/\.jpe?g(?:$|[?#])/i.test(src)) return "image/jpeg";
  if (/\.webp(?:$|[?#])/i.test(src)) return "image/webp";
  if (/\.gif(?:$|[?#])/i.test(src)) return "image/gif";
  return "image/png";
}

/**
 * 结果图地址 + MIME → 落盘扩展名（V11-RF-051 收口，配对上面那条）。
 *
 * 优先级：**MIME 优先**，MIME 认不出（非 jpg/webp/gif）时回退到**地址里的扩展名**，
 * 两者都认不出 → `"png"`。只对已知四种格式放行，其余一律兜底 png，避免把 URL 里
 * 任意查询参数尾部当成扩展名（正则限定 2–5 位字母数字 + 结尾/查询符）。
 *
 * @param {string} src
 * @param {string} mimeType 通常取上面 `imageMimeFromSource` 的结果
 * @returns {"jpg"|"webp"|"gif"|"png"}
 */
export function imageExtensionFromSource(src, mimeType) {
  if (/jpe?g/i.test(mimeType)) return "jpg";
  if (/webp/i.test(mimeType)) return "webp";
  if (/gif/i.test(mimeType)) return "gif";
  const pathMatch = String(src || "").match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
  if (pathMatch && /^(png|jpe?g|webp|gif)$/i.test(pathMatch[1])) {
    return pathMatch[1].toLowerCase().replace("jpeg", "jpg");
  }
  return "png";
}

/**
 * 图片真的加载失败之后调用：返回要展示的原因。
 * 只用于把"经验性失败"翻译成文案，不改动持久化数据。
 */
export function brokenImageReason() {
  return RESULT_IMAGE_MISSING_REASONS.load_failed;
}

// ---------------------------------------------------------------------------
// 拖拽下载族（V11-RF-052 收口）
//
// 收口前这 6 个函数在 src/main.jsx 与 src/outfit-workflow.jsx 各一份：
//   · safeDownloadFileName / padDragDownloadNumber / dragDownloadDateStamp /
//     absoluteDownloadUrl / beginImageDownloadDrag —— 剥离缩进后**逐字节一致**
//     （脚本 scripts/dev/d2-drag-family-check.mjs 实测，非肉眼）；
//   · dataUrlFromBlob —— 唯一实质差异是报错文案
//     （main「长图编码失败」/ outfit「图片编码失败」）。
//
// 文案差异按 RF-027-3 的先例走**入参化**，不擅自统一：
//   dataUrlFromBlob(blob, errorMessage = "图片编码失败")，main 侧 3 个调用点
//   显式传 "长图编码失败" ⇒ 两侧行为逐字不变。
//
// 为什么放在本模块（而不是新建文件）：两侧**本来就 import 了 result-image.js**，
// 且本族与上面的「结果图地址 → 落盘 MIME / 扩展名」是同一条链路的上下游
// ⇒ 加进既有模块不新增文件、不触发 019 的 scopeDrift（项目 §2.5：优先复用既有模块）。
//
// ⚠️ 本族要用 window / FileReader / dataTransfer ⇒ 只在浏览器里跑，
//    服务端与 Node 侧脚本不要 import 本模块。
// ---------------------------------------------------------------------------

export function safeDownloadFileName(name, ext = "png") {
  const base = fileBaseName(name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "image";
  return `${base}.${ext}`;
}

export function padDragDownloadNumber(value, length = 2) {
  return String(Math.max(0, Number.parseInt(value, 10) || 0)).padStart(length, "0");
}

export function dragDownloadDateStamp(value) {
  const timestamp = Number(value);
  const date = new Date(Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now());
  const day = [
    date.getFullYear(),
    padDragDownloadNumber(date.getMonth() + 1),
    padDragDownloadNumber(date.getDate())
  ].join("");
  const time = [
    padDragDownloadNumber(date.getHours()),
    padDragDownloadNumber(date.getMinutes()),
    padDragDownloadNumber(date.getSeconds())
  ].join("");
  return `${day}-${time}`;
}

export function absoluteDownloadUrl(src) {
  const requestUrl = displayImageRequestUrl(src);
  if (!requestUrl || /^(data|blob):/i.test(requestUrl)) return requestUrl || "";
  try {
    return new URL(requestUrl, window.location.href).href;
  } catch {
    return requestUrl;
  }
}

export function beginImageDownloadDrag(event, src, name = "静音AI绘画", image = null) {
  if (!src) return;
  event.stopPropagation?.();
  const mimeType = imageMimeFromSource(src, image);
  const filename = safeDownloadFileName(name, imageExtensionFromSource(src, mimeType));
  const downloadUrl = absoluteDownloadUrl(src);
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("DownloadURL", `${mimeType}:${filename}:${downloadUrl}`);
  event.dataTransfer.setData("application/x-jingyin-download-url", downloadUrl);
  event.dataTransfer.setData("text/uri-list", src);
  event.dataTransfer.setData("text/plain", src);
}

export function dataUrlFromBlob(blob, errorMessage = "图片编码失败") {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(errorMessage));
    reader.readAsDataURL(blob);
  });
}

// ——— 预览灯箱的拖拽平移（V11-RF-058）———
//
// 这两个来自 src/main.jsx 的 `beginPreviewDrag` / `movePreviewDrag` 与
// src/outfit-workflow.jsx 的 `startPreviewDrag` / `movePreviewDrag`：
// 剥掉缩进后两侧**逐字节一致**（`movePreviewDrag` 连函数名都一样；`beginPreviewDrag` ↔
// `startPreviewDrag` 只差函数名）⇒ 纯搬运，行为零变化。
//
// ⚠️ 同族的 `endPreviewDrag` **不搬**：两侧末尾一句分别是 `closePreview()` 与
// `closePreviewModal()`（关闭入口不同），属真分叉，留在各自的组件里。
// 另外 `handlePreviewWheel` ↔ `zoomPreviewByWheel` 缩放上限 4 vs 5、
// `shiftPreview` ↔ `navigatePreview` 边界停住 vs 取模循环，也都是真分叉 —— 一并登记不搬。

/**
 * 按下指针开始平移预览。
 *
 * 🔴 非左键（button !== 0）时返回 **null**，调用方必须**判空后再赋值**给 drag ref ——
 * 原实现在这个分支是「直接 return，不动 ref」；若改成无条件赋值会把正在进行的拖拽清掉。
 *
 * @returns {object|null} drag 状态对象（{ active, moved, startX, startY, startPan }）
 */
export function previewDragStart(event, pan) {
  if (event.button !== 0) return null;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  return {
    active: true,
    moved: false,
    startX: event.clientX,
    startY: event.clientY,
    startPan: pan
  };
}

/**
 * 按指针位移算出新的平移量。
 *
 * @returns {{ pan: { x: number, y: number }, moved: boolean }}
 *   `moved` 表示本次位移已超过 3px 阈值；调用方用它决定是否把 `drag.moved` 置真
 *   （原实现只置真、从不回置 false，所以调用方必须写 `if (moved) …`，不能写成
 *   `drag.moved = moved`，否则抖动回中会把已移动的标记清掉）。
 */
export function previewPanFromDrag(drag, event) {
  const deltaX = event.clientX - drag.startX;
  const deltaY = event.clientY - drag.startY;
  return {
    pan: { x: drag.startPan.x + deltaX, y: drag.startPan.y + deltaY },
    moved: Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3
  };
}
