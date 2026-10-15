import { apiJson, postJson } from "./client.js";

export function getSaveDirectory() {
  return apiJson("/api/save-directory", {}, "读取保存目录失败");
}

export function setSaveDirectory(directory) {
  return postJson("/api/save-directory", { directory }, "保存目录设置失败");
}

export function pickSaveDirectory(directory) {
  return postJson("/api/pick-directory", { directory }, "目录选择失败");
}

export function openSaveDirectoryRequest(directory) {
  return postJson("/api/open-save-directory", { directory }, "打开保存目录失败");
}

// ---------------------------------------------------------------------------
// P7-6 收口：下面三个原本是散在 feature 里的裸 `fetch(...)`（P7-1 门禁点名的 9 处中的 7 处）。
//
// 为什么这三个**返回原始 Response** 而不是像上面那样用 postJson / 走到 ApiError：
// 调用方各自的容错和错误文案都不一样（`response.json()` 有几处 `.catch(() => null)`、
// 有几处不 catch；失败文案分别是「保存图片失败」「保存长图失败」「自动保存失败」），
// 还各自夹着 setSaveDirectory / addEvent / flashDownloadFeedback 之类的副作用。
// 一旦统一到 client.js 的错误通道，网络异常时的报错会从「原始 TypeError」变成
// 「保存图片失败：xxx」——那是本单被明令禁止的行为改动（R6）。
// 所以这里只把**请求本身**搬到准入层（URL / method / headers / body 逐字一致），
// 响应处理留在原地。将来要统一错误通道，是一个需要单独评估文案影响面的独立改动。
// ---------------------------------------------------------------------------

/** POST /api/save-image —— 把一条结果记录（含图片）落盘到指定目录。 */
export function saveImageRequest(directory, item) {
  return fetch("/api/save-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory, item })
  });
}

/** POST /api/save-processed-image —— 直接上传一个本地 File 到指定子目录。 */
export function saveProcessedImageRequest(form) {
  return fetch("/api/save-processed-image", {
    method: "POST",
    body: form
  });
}
