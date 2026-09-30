// 对外 HTTP 请求的两个通用小工具。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 抽出它们是因為 image-proxy 与后续的出图请求都依赖这两件东西，
// 不抽的话代理层会反过来依赖 index.js，拆分就断了。
//
// createAbortSignal 的关键点是返回 dispose：
// 超时定时器必须手动清掉，否则每个请求结束后仍会挂一个 timer 到超时为止，
// 批量生成时会在 Node 里堆出几百个 wait 着的定时器。
//
// readTextSafely 永远不抛：上游有些错误响应不是 JSON（整页 HTML、纯文本报错），
// 这时候 json 置空、把原文带回去，交给调用方决定怎么展示。

export function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer)
  };
}

export async function readTextSafely(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}
