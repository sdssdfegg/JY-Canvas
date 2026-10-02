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


/**
 * 探测上游模型清单（设置弹窗里的「连接测试」按钮）。
 *
 * 2026-10-03 收口（V11-RF-060）：`main.jsx` 与 `outfit-workflow.jsx` 各一份，
 * 剥离缩进后**逐字节一致**（23 行）。差异为零 ⇒ 直接搬，全部依赖改为注入。
 *
 * 落在这里的依据：`src/features/auth/README.md` 边界第 1 条 ——
 * 「本地 KEY 输入、清洗、鉴权错误识别、设置弹窗逻辑」。
 *
 * ⚠️ 依赖全部走入参，不在本模块 import：本模块保持零副作用、零 React 依赖，
 *    也避免把 api/connection.js 等运行时模块拉进纯工具模块。
 */
export async function testApiConnection({
  setIsConnectionTesting,
  setConnectionState,
  setConnectionStatus,
  settings,
  config,
  testConnection,
  formatConnectionResult,
  addEvent
}) {
  setIsConnectionTesting(true);
  setConnectionState("running");
  setConnectionStatus("正在探测上游模型清单…");
  try {
    const result = await testConnection({
      baseUrl: settings.baseUrl || config.defaultBaseUrl || "",
      apiKey: settings.apiKey,
      model: settings.model,
      channelId: settings.channelId
    });
    setConnectionState(result.ok ? "ok" : "error");
    setConnectionStatus(formatConnectionResult(result));
    addEvent(result.ok ? "连接测试" : "连接测试失败", result.message || "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setConnectionState("error");
    setConnectionStatus(message || "连接测试失败");
    addEvent("连接测试失败", message || "请求失败");
  } finally {
    setIsConnectionTesting(false);
  }
}
