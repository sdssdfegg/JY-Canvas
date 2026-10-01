// 网关连通性探测（V11-RF-115）。
//
// 从 server/index.js 原样搬来，逐字节等价，调用点零改动。
//
// 关键不变量（行为变更 = 「连接测试」/ 网关状态探测结果变样）：
//   - HEAD 先探，405 时回落 GET；
//   - 8000ms 超时（数值逐字）；
//   - ok = status >= 200 && status < 500 的边界（< 500，不是 < 400）；
//   - 返回字段 checkUrl / reachable / ok / status / statusText / server / latencyMs 不变；
//   - 失败分支 reachable:false 的语义不变。

import { normalizeBaseUrl } from "../channel.js";
import { createAbortSignal } from "./http-client.js";

function gatewayRootUrl(baseUrl) {
  return normalizeBaseUrl(baseUrl).replace(/\/v1$/i, "");
}

export async function checkGatewayConnectivity(gateway) {
  const url = gatewayRootUrl(gateway.baseUrl);
  const startedAt = Date.now();
  const abort = createAbortSignal(8000);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      signal: abort.signal
    });
    if (response.status === 405) {
      response = await fetch(url, {
        method: "GET",
        signal: abort.signal
      });
    }
    return {
      ...gateway,
      checkUrl: url,
      reachable: true,
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      statusText: response.statusText,
      server: response.headers.get("server") || "",
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ...gateway,
      checkUrl: url,
      reachable: false,
      ok: false,
      status: 0,
      statusText: "",
      server: "",
      latencyMs: Date.now() - startedAt,
      error: error?.name === "AbortError" ? "timeout" : error instanceof Error ? error.message : String(error)
    };
  } finally {
    abort.dispose();
  }
}
