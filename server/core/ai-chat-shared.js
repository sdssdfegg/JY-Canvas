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
