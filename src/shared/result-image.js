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
// 注意：本模块只做判读与文案，不发起任何网络请求，也不修改持久化数据。

import { IMAGE_SOURCE_REASONS, classifyImageSource } from "./image-hosts.js";

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
