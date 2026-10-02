// 后端「AI 文本调用」（chat/completions）族的共享小工具。
//
// V11-RF-027-2 从 server/detail-ai.js 等 7 个文件**原样搬来，没有任何逻辑改动**。
// 这 6 个函数是逐对 diff 判定出来的「零风险 6 族」——它们在各个 *-ai.js 里的
// 行为完全相同，抽出来不会改变任何一次调用的结果，也不碰提示词与请求体字段。
//
// 取哪一版 / 为什么：
//   asText / clamp / responseContent / shouldRetryWithoutImages
//     → 各份实现**字节一致**，任选即等于全选。
//   shouldRetryWithoutJsonFormat
//     → 6 份实现**语义等价**（token 流相同），只有 `||` 写在行尾还是行首的差别；
//       取 5:1 的多数派（写在行尾）。
//   readResponse
//     → detail-ai.js 是 async/await 版，其余 5 处是 `.then()` 版。两者在本函数内
//       行为完全相同（await 就是 .then 的语法糖，没有额外时序差异），统一取
//       **async/await 版**：它对入参更宽容（Promise 与普通值都能吃），
//       `.then()` 版遇到非 Promise 入参会直接抛，属于"放宽"方向的统一。
//
// 已知重复（**不在本单范围，已报备统筹**）：本文件的 readResponse 与
// server/core/http-client.js 的 readTextSafely 逻辑等价，是既有的「同逻辑不同名」，
// 属门禁盲区；本单不动 http-client.js（禁止修改清单），也不顺手统一。

// 把任意输入整理成可放进模型请求的短文本，避免 undefined/null 混进提示词。
export function asText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function clamp(value, min, max, fallback) {
  return Math.max(min, Math.min(max, Number.parseInt(value, 10) || fallback));
}

// 永远不抛：上游错误响应经常不是 JSON（整页 HTML、纯文本报错），
// 这时 json 置空、把原文带回去，交给调用方决定怎么展示。
export async function readResponse(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
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
