// 视频请求的「失败定性 + 对外文案」层。
//
// 从 server/index.js 原样搬来（V11-RF-112），**没有任何逻辑改动**，调用点零改动。
//
// 这一层回答两个问题：
//   1. 上游这次失败到底是什么性质（401 / 余额 / 模型不可用 / 权限 / 超时 / 上游 5xx）？
//   2. 该给前端返回什么 errorCode、什么人话、任务失败文案里如何识别「上游资源不足已退款」？
//
// 几个不能随手改的点（行为变更 = 用户可见文案改变，必须单独确认）：
//   - publicVideoErrorCode 的状态码 → 错误码映射表顺序与默认兜底分支；
//   - publicVideoErrorMessage 的中文文案（逐字）；
//   - publicVideoTaskFailureMessage 的截断 / 包装规则，以及「all cookies failed」类正则
//     触发的「视频上游通道资源不足，任务已自动退款」特殊文案；
//   - publicVideoTaskPayload 的字段提取候选顺序：
//       视频 URL 候选链（json.url → … → firstDataItem.result_url，最后用 /^(https?:|data:)/i 过滤）
//       错误文案候选链（json.error.message → … → firstDataItem.error）
//     两条链的顺序就是行为，不得重排、不得增删。

import {
  isImageAuthError,
  isImageQuotaError,
  isImagePermissionError,
  quotaFailureMessage
} from "./image-error-policy.js";
import { compactLogMessage } from "./format-utils.js";

export function publicVideoErrorCode(status, message) {
  if (isImageAuthError(status, message)) return "invalid_api_key";
  if (isImageQuotaError(status, message)) return "insufficient_quota";
  if (isImagePermissionError(status, message)) return "permission_denied";
  if (/model_not_found|model.*not.*found|unsupported.*model|模型.*不可用|模型.*不存在/i.test(String(message || ""))) return "model_unavailable";
  if (status >= 500 || status === 429 || !status || /timeout|timed out|upstream|channel|渠道|上游/i.test(String(message || ""))) return "channel_timeout";
  return "upstream_error";
}

export function publicVideoErrorMessage(status, message) {
  const code = publicVideoErrorCode(status, message);
  if (code === "invalid_api_key") return "视频 API Key 无效或当前账号无权限，请检查配置后重试。";
  if (code === "insufficient_quota") return quotaFailureMessage(message);
  if (code === "permission_denied") return "当前视频通道无权调用该模型，请检查静音中转站视频权限。";
  if (code === "model_unavailable") return "当前视频模型暂不可用，请稍后重试。";
  if (code === "channel_timeout") return "视频生成超时，请重新生成。";
  return compactLogMessage(message || `HTTP ${status}`, 600);
}

export function publicVideoTaskFailureMessage(message) {
  const text = compactLogMessage(message, 600);
  if (!text) return null;
  if (/all cookies failed|cookie#|insufficient\s+tokens/i.test(text)) {
    return "视频上游通道资源不足，任务已自动退款，请稍后重试或切换可用视频渠道。";
  }
  return text;
}

export function publicVideoTaskPayload(json = {}, fallbackTaskId = "") {
  const firstDataItem = Array.isArray(json.data) ? json.data.find((item) => item && typeof item === "object") : null;
  const dataObject = json.data && typeof json.data === "object" && !Array.isArray(json.data) ? json.data : null;
  const taskObject = json.task && typeof json.task === "object" && !Array.isArray(json.task) ? json.task : null;
  const nestedDataObject = dataObject?.data && typeof dataObject.data === "object" && !Array.isArray(dataObject.data) ? dataObject.data : null;
  const output = json.output && typeof json.output === "object" ? json.output : null;
  const videoUrl = [
    json.url,
    json.video_url,
    json.output_url,
    output?.url,
    taskObject?.url,
    taskObject?.video_url,
    taskObject?.output_url,
    dataObject?.url,
    dataObject?.video_url,
    dataObject?.output_url,
    dataObject?.result_url,
    nestedDataObject?.url,
    nestedDataObject?.video_url,
    nestedDataObject?.output_url,
    nestedDataObject?.result_url,
    firstDataItem?.url,
    firstDataItem?.video_url,
    firstDataItem?.output_url,
    firstDataItem?.result_url
  ].map((value) => String(value || "").trim()).find((value) => /^(https?:|data:)/i.test(value)) || "";
  const rawErrorMessage = [
    json.error?.message,
    json.error,
    taskObject?.error?.message,
    taskObject?.error,
    dataObject?.fail_reason,
    dataObject?.error?.message,
    dataObject?.error,
    nestedDataObject?.error?.message,
    nestedDataObject?.error,
    nestedDataObject?.fail_reason,
    firstDataItem?.fail_reason,
    firstDataItem?.error?.message,
    firstDataItem?.error,
    dataObject?.result_url && !/^(https?:|data:)/i.test(String(dataObject.result_url)) ? dataObject.result_url : ""
  ].map((value) => String(value || "").trim()).filter(Boolean)[0] || null;
  const errorMessage = publicVideoTaskFailureMessage(rawErrorMessage);
  const taskId = json.task_id
    || json.taskId
    || json.id
    || json.video_id
    || taskObject?.task_id
    || taskObject?.taskId
    || taskObject?.id
    || dataObject?.task_id
    || dataObject?.taskId
    || dataObject?.id
    || nestedDataObject?.task_id
    || nestedDataObject?.taskId
    || nestedDataObject?.id
    || firstDataItem?.task_id
    || firstDataItem?.taskId
    || firstDataItem?.id
    || fallbackTaskId
    || "";
  return {
    taskId,
    id: taskId,
    status: json.status || taskObject?.status || dataObject?.status || nestedDataObject?.status || firstDataItem?.status || (taskId ? "queued" : "unknown"),
    progress: Number.isFinite(Number(json.progress ?? taskObject?.progress ?? dataObject?.progress ?? nestedDataObject?.progress ?? firstDataItem?.progress))
      ? Number(json.progress ?? taskObject?.progress ?? dataObject?.progress ?? nestedDataObject?.progress ?? firstDataItem?.progress)
      : null,
    url: videoUrl,
    format: json.format || taskObject?.format || dataObject?.format || nestedDataObject?.format || firstDataItem?.format || "",
    model: json.model || taskObject?.model || dataObject?.model || nestedDataObject?.model || firstDataItem?.model || "",
    seconds: json.seconds || json.duration || taskObject?.seconds || taskObject?.duration || dataObject?.seconds || dataObject?.duration || nestedDataObject?.seconds || nestedDataObject?.duration || firstDataItem?.seconds || firstDataItem?.duration || "",
    size: json.size || taskObject?.size || dataObject?.size || nestedDataObject?.size || firstDataItem?.size || "",
    metadata: json.metadata || taskObject?.metadata || dataObject?.metadata || nestedDataObject?.metadata || firstDataItem?.metadata || null,
    error: errorMessage,
    raw: json
  };
}
