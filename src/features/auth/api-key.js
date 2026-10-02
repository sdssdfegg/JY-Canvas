export function normalizeApiKeyInput(value) {
  return String(value || "")
    // ① 先删不可见字符：微信/网页复制来的 KEY 首尾常带零宽字符，它们会挡住
    //    「Bearer 前缀」与「首尾引号」的识别窗口（旧实现的顺序 bug 根因在此）。
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // ② 再去 Bearer 前缀（大小写不敏感；必须紧跟空白，避免误伤 BearerXxx 这类真实 KEY）。
    .replace(/^Bearer\s+/i, "")
    .trim()
    // ③ 去首尾引号。用 + 量词以支持 ""sk-x"" 这类多层包裹（旧正则 ^["']|["']$ 只剥一层）。
    .replace(/^["']+|["']+$/g, "")
    .trim()
    // ④ 引号剥掉之后才露出来的那层 Bearer（整串带引号粘贴 "Bearer sk-x" 的情况）。
    //    旧实现没有这一步，引号剥完就到「删全部空白」，把 "Bearer sk" 粘成了 "Bearersk"。
    .replace(/^Bearer\s+/i, "")
    // ⑤ 兜底：删剩余的空白与不可见字符（含 KEY 中间的空格）。
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "");
}

export function isAuthErrorMessage(message) {
  return /invalid token|unauthorized|api key|401|密钥|key 无效|key无效/i.test(String(message || ""));
}
