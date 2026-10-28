// server/routes/ai-canvas-agent.routes.js
// V143 MVP-3：AI 无限画布 Agent 路由。
//
// 形态与既有 AI 文本路由一致（对照 server/routes/outfit-analysis.routes.js）：
//   resolveApiKey → 缺 Key 401；channelBaseCandidates() 取渠道候选；
//   成功/失败都写 generation 日志；对外错误统一走 publicImageErrorPayload。
// 本路由只做「指令 → 动作清单」，不触发生成、不碰任何现有业务页面。

import { resolveApiKey, publicImageErrorPayload } from "../core/image-error-policy.js";
import { channelBaseCandidates } from "../core/image-channel-candidates.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import { createCanvasAgentPlan } from "../ai-canvas-agent.js";

export function registerAiCanvasAgentRoutes(app) {
  app.post("/api/ai-canvas-agent", async (req, res) => {
    const payload = req.body && typeof req.body === "object" ? req.body : {};

    const apiKey = resolveApiKey(payload.apiKey);
    if (!apiKey) {
      return res.status(401).json({ ok: false, message: "请先在设置里填写 API Key" });
    }
    if (!String(payload.instruction || "").trim()) {
      return res.status(400).json({ ok: false, message: "请先输入要给画布 Agent 的指令" });
    }

    const receivedAt = Date.now();
    try {
      const result = await createCanvasAgentPlan({
        input: payload,
        apiKey,
        baseUrls: channelBaseCandidates()
      });
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: true,
        stage: "ai-canvas-agent",
        model: result.model,
        usedBaseUrl: result.usedBaseUrl,
        timing: result.timing,
        attempts: result.attempts
      });
      res.json({
        ok: true,
        reply: result.reply,
        actions: result.actions,
        dropped: result.dropped,
        model: result.model,
        timingMs: Date.now() - receivedAt
      });
    } catch (error) {
      const rawMessage = error?.name === "AbortError"
        ? "画布 Agent 超时，请稍后重试"
        : error instanceof Error ? error.message : String(error);
      const publicPayload = publicImageErrorPayload({
        requestId: `canvas_agent_${receivedAt}`,
        status: error?.name === "AbortError" ? 504 : 502,
        upstreamMessage: rawMessage,
        attempts: []
      });
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: false,
        stage: "ai-canvas-agent",
        timing: { totalMs: Date.now() - receivedAt },
        error: rawMessage,
        publicError: publicPayload.message
      });
      res.status(publicPayload.status).json({
        ok: false,
        error: publicPayload.error,
        message: publicPayload.message
      });
    }
  });
}
