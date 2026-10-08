// 文本归一化的两个小工具：asText / pickEnum。
//
// 为什么抽出来（前端专项阶段 B · 刀 1，2026-10-02）：
//   这两个函数此前在 src/shared/outfit-intent.js 与 src/shared/retouch-intent.js
//   各存在一份（019 门禁报的 24 条跨文件同名里的第 1、20 条）。两份实现**不等价**：
//     - outfit 版：`String(value ?? "")` —— 传对象会得到 `[object Object]`；
//     - retouch 版：先挡 null/undefined，再挡 `typeof value === "object"` 返回空串。
//   统一取 retouch 版（更严格的那份），理由与安全性见下面每个函数的注释。
//
// 只做纯函数：不碰 DOM、不请求接口，前后端都能直接 import（与 image-hosts.js 同款用法）。

/**
 * 安全地取一段纯文本：压缩空白、去首尾、按 limit 截断。
 * 对象 / 数组 / null / undefined 一律当空串 —— 防止把结构化对象拼成 `[object Object]`。
 *
 * 🔴 统一口径说明（刀 1 的关键判定）：
 *   原 outfit 版没有对象守卫，但 outfit 侧**所有调用点都已经自己守卫过了** ——
 *   例如 outfit-intent.js 的 `normalizeOutfitFacts()` 写的是
 *   `typeof raw === "string" || typeof raw === "number" ? asText(raw, 200) : ""`，
 *   注释里明写「非字符串/数字一律视为空，避免把结构化对象拼成 [object Object]」。
 *   也就是说 retouch 版新增的对象分支在 outfit 侧**永远走不到**，
 *   对字符串入参两版逐字节等价 ⇒ 这次统一对 outfit 是**零行为变化**，
 *   对 retouch 也是零变化（它就是原实现）。
 */
export function asText(value, limit = 240) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, limit);
}

/**
 * 从白名单里挑一个合法枚举值，不合法就用 fallback。
 * 复用 asText（含对象守卫、截断 60），枚举值都远短于 60，截断对既有调用点无影响。
 *
 * 注：原 outfit 版是 `String(value ?? "").trim()`，不压内部空白、不截断；
 * 既有调用点传的都是 mode / upperLayer 这类短枚举（无内部空白、长度远小于 60），
 * 两版结果一致 ⇒ 统一后无行为变化。
 */
export function pickEnum(value, allowed, fallback) {
  const text = asText(value, 60);
  return allowed.includes(text) ? text : fallback;
}
