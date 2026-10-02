// 后端「AI 文本调用」（chat/completions）族的共享小工具。
//
// V11-RF-027-2 从 server/detail-ai.js 等 7 个文件**原样搬来，没有任何逻辑改动**。
// 这 5 个函数是逐对 diff 判定出来的「零风险族」——它们在各个 *-ai.js 里的
// 行为完全相同，抽出来不会改变任何一次调用的结果，也不碰提示词与请求体字段。
//
// 取哪一版 / 为什么：
//   asText / clamp / responseContent / shouldRetryWithoutImages
//     → 各份实现**字节一致**，任选即等于全选。
//   shouldRetryWithoutJsonFormat
//     → 6 份实现**语义等价**（token 流相同），只有 `||` 写在行尾还是行首的差别；
//       取 5:1 的多数派（写在行尾）。
//
// readResponse 的去向（V11-RF-027-2b）：
//   本文件最初也收了 readResponse（6 处实现统一为 async/await 版），但它与
//   server/core/http-client.js 的 readTextSafely **函数体逐字节相同、仅函数名不同**，
//   属于「改名克隆」。027-2b 已把本文件的定义**真删**，6 个调用方改为
//   import { readTextSafely } from "./core/http-client.js" 并把调用点改名
//   （没有做 `export { readTextSafely as readResponse }` 转发壳 —— 那只是把重复换个形式留着）。
//
// V11-RF-027-3 追加的 5 族是**参数化族**：各入口原本的实现已经分叉（文案 / 图片精度 /
// 文件元信息字段 / 模型字段链 / 请求体构造各不相同），统一成一份实现后用参数把差异
// 表达出来，每个调用点传自己原来那份值 ⇒ 零用户可见变化。
//   extractJsonObject(text, label)
//     → 6 份只差抛错文案，label 由调用点传原文案（scripts/verify/** 与探针 0 断言依赖）。
//   safeImagePart(file, detail = "high")
//     → 只差 image_url.detail：出图类质检要 "high"，纯文本改写只要 "low"。
//   fileMeta(file, { index, role, fallback })
//     → 5 种 name 兜底规则 + 2 种字段集合；「给了才出现在产出里」保证字段集合与
//       key 顺序（index → role → name → type → size）都和抽走前逐字节一致。
//   modelName(input, { fields, fallback })
//     → 各入口读的 input 字段链不同；fields 是有序字段名，等价于原来的 `a || b || c`。
//   postChatCompletion({ baseUrl, apiKey, body, signal })
//     → 请求体由调用点用各自的场景化 buildXxxChatBody 组装好后传进来；
//       本函数只留 fetch + 读响应，不再认识任何业务字段，也不再和 buildXxxChatBody 的签名互相绑死。

import { readTextSafely } from "./http-client.js";

// 把任意输入整理成可放进模型请求的短文本，避免 undefined/null 混进提示词。
export function asText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function clamp(value, min, max, fallback) {
  return Math.max(min, Math.min(max, Number.parseInt(value, 10) || fallback));
}

// chat/completions 的返回体里，正文既可能是字符串，也可能是分块数组。
export function responseContent(payload) {
  const message = payload?.choices?.[0]?.message;
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((part) => part.text || part.content || "").join("\n");
  }
  return "";
}

// 上游不支持图片/多模态时，剥掉图片再重试一次。
export function shouldRetryWithoutImages(status, text) {
  const source = `${status} ${text}`.toLowerCase();
  return status >= 400 && (
    source.includes("image") ||
    source.includes("vision") ||
    source.includes("multimodal") ||
    source.includes("content part") ||
    source.includes("image_url")
  );
}

// 上游不支持 response_format/json_object 时，剥掉 JSON 约束再重试一次。
export function shouldRetryWithoutJsonFormat(status, text) {
  const source = `${status} ${text}`.toLowerCase();
  return status >= 400 && (
    source.includes("response_format") ||
    source.includes("json_object") ||
    source.includes("unsupported")
  );
}

// 模型有时会包一层 Markdown 代码块（```json ... ```），这里只抽 JSON 对象本体；
// 抠不出 `{...}` 就抛错，抛错文案带 label —— label 由调用点传自己原来那句，
// 因为这是直接弹给用户看的文案，不能统一。
export function extractJsonObject(text, label) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error(`${label}没有返回内容`);
  const unfenced = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
    throw new Error(`${label}返回的不是有效 JSON`);
  }
}

// 把上传文件转成 chat/completions 可识别的 data URL 图片输入。
// detail 是视觉精度：服装/姿态/质检这类要看清细节的用 "high"，
// 只要"看个大概"的文本改写用 "low"（省 token 也更快）。
export function safeImagePart(file, detail = "high") {
  return {
    type: "image_url",
    image_url: {
      url: `data:${file.mimetype || "image/png"};base64,${file.buffer.toString("base64")}`,
      detail
    }
  };
}

// 记录文件基础信息，只进提示词上下文和本地日志，不包含用户 Key。
// 三个可选项都是「传了才出现在产出里」，这样各入口拿到的字段集合与 key 顺序
// （index → role → name → type → size）和抽走前逐字节一致。
// name 兜底优先级：file.originalname > opts.fallback > `${role}-${index + 1}` > "image"。
export function fileMeta(file, { index, role, fallback } = {}) {
  const meta = {};
  if (index !== undefined) meta.index = index;
  if (role !== undefined) meta.role = role;
  meta.name = file?.originalname || fallback || (role ? `${role}-${(index ?? 0) + 1}` : "image");
  meta.type = file?.mimetype || "";
  meta.size = file?.size || file?.buffer?.length || 0;
  return meta;
}

// 按优先级选模型名：fields 是 input 上的字段名（有序，等价于 `a || b || c`），
// 一个都取不到就用 fallback。
export function modelName(input, { fields = [], fallback }) {
  return asText(fields.map((field) => input?.[field]).find(Boolean) || fallback, fallback);
}

// 只负责「发一次 chat/completions 请求并读回响应」，重试与降级由调用方的 mode 循环决定。
// 请求体由调用点组装好再传进来，本函数不认识任何业务字段。
export async function postChatCompletion({ baseUrl, apiKey, body, signal }) {
  const url = `${baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal
  });
  const parsed = await readTextSafely(response);
  return { url, response, parsed };
}
