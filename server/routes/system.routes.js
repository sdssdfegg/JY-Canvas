// 系统 / 诊断路由（V11-RF-201 —— **批次 4 的模板单**）
//
// 本文件是批次 4 后续 12 张路由单照抄的模板，约定如下：
//   1. 导出 `registerXxxRoutes(app[, deps])`，由 `server/index.js` 在**原位置**调用；
//   2. 依赖一律 import 自 `server/core/*` 或 `server/*.js`，
//      **绝不从 index.js 作用域隐式抓变量**；
//   2b. **模板约定（重要）**：`deps` 只在**确有需要注入**时才写成第二个形参
//      （例：204 需要 multer 上传件）。本模块全部依赖均可 import，
//      故签名为 `registerSystemRoutes(app)` —— **不挂用不到的 deps 形参**：
//      挂着会被 ESLint `no-unused-vars` 判红，也会让后来者误以为这里有注入。
//   3. 路由模块内禁止 `express.Router()` / 第二次 `express()` / `multer(...)` / `new Map()`；
//   4. 注册顺序即中间件生效顺序，index.js 里的调用位置必须与原顺序一致。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                    ← 形参
//   PRIMARY_CHANNEL_API_BASE_URL / publicChannelGateways /
//     publicChannelModels / publicChannelPolicyConfig /
//     publicRoutingCatalog                                 ← server/channel-config.js
//   publicBillingGatewayPolicy                              ← server/billing-gateway.js
//   publicVideoModels / publicVideoPolicyConfig             ← server/video-config.js
//   checkGatewayConnectivity                                ← server/core/gateway-connectivity.js
//   createAbortSignal                                       ← server/core/http-client.js
//   clientDiagnosticStage / resolveApiKey /
//     sanitizeClientDiagnosticValue                         ← server/core/image-error-policy.js
//   IMAGE_CONCURRENCY_LIMIT / VIDEO_BILLING_GATEWAY_REQUIRED ← server/core/runtime-config.js
//   imageQueueSnapshot                                      ← server/core/image-concurrency.js
//   channelBaseCandidates                                   ← server/core/image-channel-candidates.js
//   writeGenerationLog                                      ← server/core/generation-logger.js
// ⇒ **没有任何符号来自 index.js 作用域**。
//
// 逐字保留（改一个字就会红一片，见执行单 2-4）：
//   - /api/config 的每个字段，尤其 `hasServerKey: false`（G-6：本地不内置 KEY）；
//   - /api/health 的 version / imageConcurrency / memory 四项 / uptimeSec
//     （scripts/check-launcher 44 项 + 启动静音内测画板.bat 依赖其文案）；
//   - /api/client-diagnostic-event 的落盘行为（local-edit-base-file-check 的端到端断言依赖它）。

import {
  PRIMARY_CHANNEL_API_BASE_URL,
  publicChannelGateways,
  publicChannelModels,
  publicChannelPolicyConfig,
  publicRoutingCatalog
} from "../channel-config.js";
import { publicBillingGatewayPolicy } from "../billing-gateway.js";
import {
  publicVideoModels,
  publicVideoPolicyConfig
} from "../video-config.js";
import { checkGatewayConnectivity } from "../core/gateway-connectivity.js";
import { createAbortSignal } from "../core/http-client.js";
import {
  clientDiagnosticStage,
  resolveApiKey,
  sanitizeClientDiagnosticValue
} from "../core/image-error-policy.js";
import {
  IMAGE_CONCURRENCY_LIMIT,
  VIDEO_BILLING_GATEWAY_REQUIRED
} from "../core/runtime-config.js";
import { imageQueueSnapshot } from "../core/image-concurrency.js";
import { channelBaseCandidates } from "../core/image-channel-candidates.js";
import {
  activeGatewayBaseUrl,
  publicGatewayTargetState,
  setActiveGatewayTarget
} from "../core/gateway-target.js";
import { writeGenerationLog } from "../core/generation-logger.js";

export function registerSystemRoutes(app) {
  app.get("/api/config", (_req, res) => {
    const billingPolicy = publicBillingGatewayPolicy();
    const videoPolicy = publicVideoPolicyConfig();
    const videoAvailableByGateway = billingPolicy.enabled;
    const videoAvailable = videoPolicy.enabled || videoAvailableByGateway;
    res.json({
      ok: true,
      defaultBaseUrl: activeGatewayBaseUrl(),
      fallbackBaseUrl: "",
      gatewaySwitch: publicGatewayTargetState(),
      hasServerKey: false,
      channelPolicy: publicChannelPolicyConfig(),
      models: publicChannelModels(),
      routing: publicRoutingCatalog(),
      billingGatewayPolicy: {
        ...billingPolicy,
        videoRequired: VIDEO_BILLING_GATEWAY_REQUIRED
      },
      videoPolicy: {
        ...videoPolicy,
        enabled: videoAvailable,
        routeSource: videoAvailableByGateway ? "billing-gateway" : (videoPolicy.enabled ? "server-key" : "unconfigured")
      },
      videoModels: publicVideoModels().map((model) => ({
        ...model,
        enabled: videoAvailable
      }))
    });
  });

  // 切换网关目标（老 / 新服务器）。只能选登记过的线路；被环境变量锁定时返回 409。
  app.post("/api/gateway-target", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.id || body.targetId || "").trim();
    const result = setActiveGatewayTarget(id);
    if (!result.ok) {
      return res.status(result.error === "gateway_switch_locked" ? 409 : 400).json({
        ok: false,
        error: result.error,
        message: result.message
      });
    }
    res.json({
      ok: true,
      gatewaySwitch: publicGatewayTargetState(),
      defaultBaseUrl: activeGatewayBaseUrl()
    });
  });

  // 与 3.0 使用同一份模型能力/手动线路目录；旧 V11 页面也可直接读取。
  app.get("/api/ecommerce/routing", (_req, res) => {
    res.json({ ok: true, ...publicRoutingCatalog() });
  });

  /**
   * POST /api/connection-test —— 「连接测试」。
   *
   * 行为对照 3.0 的 `/api/providers/test-connection`：
   *   只向上游发 `GET {base}/models`（带 Authorization），**不调用生图、不上传图片、不扣费**。
   * 与 3.0 的差异：V11 的网关/线路来自本仓库的 channel 配置，KEY 由前端传入（服务端不落盘），
   * 所以这里按 V11 自己的字段名收发。
   *
   * 安全：
   *   - 绝不回显 API Key / Authorization；
   *   - 上游错误信息先做脱敏（去掉 key/token 片段）再返回；
   *   - 不写入任何日志文件，也不返回完整响应体，只给结论 + 状态码 + 耗时。
   */
  app.post("/api/connection-test", async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const requestedBaseUrl = String(body.baseUrl || body.base_url || "").trim().replace(/\/+$/, "");
    const fallbackBaseUrl = String(channelBaseCandidates()[0] || PRIMARY_CHANNEL_API_BASE_URL || "").replace(/\/+$/, "");
    const baseUrl = requestedBaseUrl || fallbackBaseUrl;
    const startedAt = Date.now();

    if (!baseUrl) {
      return res.status(400).json({ ok: false, status: 0, message: "请先填写请求地址", latencyMs: 0 });
    }
    if (!/^https?:\/\//i.test(baseUrl)) {
      return res.status(400).json({ ok: false, status: 0, message: "请求地址必须以 http:// 或 https:// 开头", latencyMs: 0 });
    }

    const apiKey = resolveApiKey(body.apiKey);
    if (!apiKey) {
      return res.status(400).json({ ok: false, status: 0, message: "请先填写或保存 API Key", latencyMs: 0 });
    }

    // 与 3.0 一致：base 以 /v1 结尾就直接拼 /models，否则补 /v1/models。
    const probeUrl = /\/v1$/i.test(baseUrl) ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
    const abort = createAbortSignal(15000);
    try {
      const response = await fetch(probeUrl, {
        method: "GET",
        redirect: "manual",
        signal: abort.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json"
        }
      });
      const status = Number(response.status || 0);
      let message;
      if (status === 401 || status === 403) {
        message = `API Key 无效或无权限（HTTP ${status}）`;
      } else if (status === 404) {
        message = "连接可达，但上游没有 /v1/models 接口（HTTP 404）";
      } else if (status >= 500) {
        message = `上游服务暂时不可用（HTTP ${status}）`;
      } else if (status >= 400) {
        message = `上游拒绝了探测请求（HTTP ${status}）`;
      } else {
        // 只读模型清单，用来证明这条线路真的可用；不展示完整响应内容。
        let modelCount = 0;
        try {
          const payload = await response.json();
          const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
          modelCount = list.length;
        } catch { /* 模型清单解析失败不影响连通结论 */ }
        message = modelCount > 0
          ? `连接正常，可用模型 ${modelCount} 个`
          : "连接正常";
      }
      return res.json({
        ok: status >= 200 && status < 400,
        status,
        latencyMs: Date.now() - startedAt,
        model: String(body.model || ""),
        channelId: String(body.channelId || ""),
        message
      });
    } catch (error) {
      const isTimeout = error?.name === "AbortError";
      const raw = error instanceof Error ? error.message : String(error);
      // 脱敏：上游报错里可能带 key/token 片段，统一替换掉再回前端。
      const safe = raw.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***");
      return res.json({
        ok: false,
        status: 0,
        latencyMs: Date.now() - startedAt,
        model: String(body.model || ""),
        channelId: String(body.channelId || ""),
        message: isTimeout ? "连接超时（15 秒无响应）" : `连接失败：${safe}`
      });
    } finally {
      abort.dispose();
    }
  });

  app.get("/api/gateways", (_req, res) => {
    const gateways = publicChannelGateways();
    res.json({
      ok: true,
      priorityRule: "priority 数字越小越靠前；第 1 个是主中转站，后续是备用中转站。",
      activeEndpointCount: gateways.length,
      gateways
    });
  });

  app.get("/api/gateways/status", async (_req, res) => {
    const gateways = publicChannelGateways();
    const checks = await Promise.all(gateways.map(checkGatewayConnectivity));
    res.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      priorityRule: "priority 数字越小越靠前；本检查不携带用户 KEY、不调用生图、不扣费。",
      activeEndpointCount: checks.length,
      allReachable: checks.every((item) => item.reachable),
      gateways: checks
    });
  });

  app.get("/api/health", (_req, res) => {
    const memory = process.memoryUsage();
    res.json({
      ok: true,
      version: "11.0.0",
      now: new Date().toISOString(),
      gatewayBaseUrl: activeGatewayBaseUrl(),
      imageConcurrency: {
        limit: IMAGE_CONCURRENCY_LIMIT,
        ...imageQueueSnapshot()
      },
      memory: {
        rssMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
        heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
        heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(1)),
        externalMb: Number((memory.external / 1024 / 1024).toFixed(1))
      },
      uptimeSec: Math.floor(process.uptime())
    });
  });

  app.post("/api/client-diagnostic-event", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const requestId = String(body.requestId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: body.ok !== false,
      stage: clientDiagnosticStage(body.stage),
      event: sanitizeClientDiagnosticValue("event", body.event || body.stage || ""),
      endpoint: sanitizeClientDiagnosticValue("endpoint", body.endpoint || body.url || ""),
      method: sanitizeClientDiagnosticValue("method", body.method || ""),
      status: Number.isFinite(Number(body.status)) ? Number(body.status) : undefined,
      durationMs: Number.isFinite(Number(body.durationMs)) ? Number(body.durationMs) : undefined,
      detail: sanitizeClientDiagnosticValue("detail", body.detail || {})
    }).catch(() => {});
    res.json({ ok: true });
  });
}
