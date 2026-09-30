// 文本格式化工具：日期、体积、耗时、日志摘要、文件名安全化。
//
// 从 server/index.js 原样搬来（按行区间机器切割），**没有任何逻辑改动**。
//
// 挑选标准是「零依赖纯函数」：不读盘、不发请求、不碰任何外部常量，
// 输入相同则输出必然相同。这样它们能被任意模块安全使用，
// 也是整个后端拆分里最先该独立出去的一层。
//
// 几个改动前必须先想清楚的约定：
//   - readableBytes / readableMs 直接出现在给用户的错误提示与诊断日志里，
//     改格式文案等于改用户看到的字；
//   - sanitizeFilePart 决定落盘文件名，非法字符统一换成下划线（跨平台都必须安全）；
//   - compactLogMessage 把上游长错误压进日志，上限值是按历史调校取的。

export function localDateFolder(value = Date.now()) {
  const timestamp = Number(value);
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTime(value = Date.now()) {
  const timestamp = Number(value);
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const pad = (number, size = 2) => String(number).padStart(size, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  ].join(" ");
}

export function readableBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

export function readableMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return "";
  if (ms >= 1000) return `${(ms / 1000).toFixed(3)} 秒`;
  return `${Math.max(0, Math.round(ms))} 毫秒`;
}

export function sanitizeFilePart(value) {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return cleaned || "jingyin";
}

export function compactLogMessage(value, limit = 700) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
