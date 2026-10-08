// 中转站计费/签发与尝试汇总（从 server/index.js 搬出，保持逐字节等价）。
//
// 4 个函数只在本模块内互相调用（billingChannelCandidates / billingAttemptSummaries 为私有辅助），
// 对外只暴露 prepareImageBillingForRequest（先记账/签发）与 finalizeBillingInBackground（落账，后台不阻塞）。
// 计费失败时的公开口径来自 billing-gateway 的 publicBillingErrorPayload，本模块只透传，不新增任何
// 上游地址、不新增任何 KEY 读取路径（G-6 红线）。
import { channelLogFields, upstreamModelForChannel } from "../channel-config.js";
import { finalizeBillingTask, prepareImageBillingTask, publicBillingErrorPayload } from "../billing-gateway.js";
import { writeGenerationLog } from "./generation-logger.js";

function billingChannelCandidates(baseUrls = [], params = {}) {
  return baseUrls.map((baseUrl, index) => {
    const channel = channelLogFields(baseUrl, index, baseUrls.length);
    return {
      channelId: channel.channelId,
      channelRole: channel.channelRole,
      channelAttempt: channel.channelAttempt,
      channelCandidateCount: channel.channelCandidateCount,
      model: upstreamModelForChannel(baseUrl, params.model),
      billingMode: "lightweight-gateway"
    };
  });
}

function billingAttemptSummaries(attempts = []) {
  return (Array.isArray(attempts) ? attempts : []).map((attempt) => ({
    channelId: attempt?.channelId || "unknown",
    channelRole: attempt?.channelRole || "unknown",
    status: attempt?.status || 0,
    ok: Boolean(attempt?.ok),
    model: attempt?.model || "",
    requestFormat: attempt?.requestFormat || "",
    errorCode: attempt?.errorCode || ""
  }));
}

async function prepareImageBillingForRequest({ requestId, apiKey, params, files, candidates, metadata }) {
  try {
    const billingTask = await prepareImageBillingTask({
      requestId,
      customerApiKey: apiKey,
      params,
      files,
      candidates: billingChannelCandidates(candidates, params),
      metadata
    });
    if (billingTask?.enabled) {
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: true,
        stage: "billing-gateway-prepare",
        billingGatewayTaskId: billingTask.gatewayTaskId,
        hasRouteToken: Boolean(billingTask.routeToken),
        signedRoute: Boolean(billingTask.signedRoute),
        metadata
      });
    }
    return { billingTask, errorPayload: null };
  } catch (error) {
    const errorPayload = publicBillingErrorPayload(error, requestId);
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: false,
      stage: "billing-gateway-prepare",
      status: errorPayload.status,
      error: errorPayload.error,
      message: errorPayload.message,
      metadata
    });
    return { billingTask: null, errorPayload };
  }
}

function finalizeBillingInBackground(billingTask, result = {}) {
  if (!billingTask?.enabled) return;
  const payload = {
    ...result,
    attempts: billingAttemptSummaries(result.attempts)
  };
  setTimeout(() => {
    finalizeBillingTask(billingTask, payload)
      .then((finalized) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: billingTask.requestId,
        ok: true,
        stage: "billing-gateway-finalize",
        billingGatewayTaskId: billingTask.gatewayTaskId,
        status: finalized.status,
        resultOk: Boolean(payload.ok),
        outputCount: payload.outputCount || 0,
        timingMs: payload.timingMs || 0
      }))
      .catch((error) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: billingTask.requestId,
        ok: false,
        stage: "billing-gateway-finalize",
        billingGatewayTaskId: billingTask.gatewayTaskId,
        resultOk: Boolean(payload.ok),
        error: error instanceof Error ? error.message : String(error)
      }));
  }, 0);
}

export {
  billingChannelCandidates,
  billingAttemptSummaries,
  prepareImageBillingForRequest,
  finalizeBillingInBackground
};
