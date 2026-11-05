// 服装档案 API 客户端（P2-2）：薄封装，只走 src/api/client.js 准入层。
// 严禁在页面/组件里裸写 fetch("/api/garment-profiles...")（api-layering 门禁）。
import { apiJson, postJson, postForm } from "./client.js";

/** 列表（可按 status 过滤；不传则全部）。 */
export function listGarmentProfiles(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiJson(`/api/garment-profiles${qs}`, {}, "读取服装档案列表失败");
}

/** 详情（可带 version 读历史快照）。 */
export function getGarmentProfile(id, version) {
  const qs = version != null ? `?version=${encodeURIComponent(String(version))}` : "";
  return apiJson(`/api/garment-profiles/${encodeURIComponent(id)}${qs}`, {}, "读取服装档案失败");
}

/** 创建（draft，version=1）。body 见契约 §1。 */
export function createGarmentProfile(body = {}) {
  return postJson("/api/garment-profiles", body, "创建服装档案失败");
}

/** 改版（生成 v<n+1>）。 */
export function reviseGarmentProfile(id, patch = {}) {
  return postJson(`/api/garment-profiles/${encodeURIComponent(id)}/revision`, patch, "改版服装档案失败");
}

/** 确认基准资产（缺 assetId 由服务端 400 拒绝）。 */
export function setApprovedBaseline(id, assetId) {
  return postJson(`/api/garment-profiles/${encodeURIComponent(id)}/baseline`, { assetId }, "设置基准资产失败");
}

/** 上传标准参考图（multipart，字段名 file / asset_id）。 */
export function uploadGarmentAsset(id, file, assetId) {
  const form = new FormData();
  form.append("file", file, file && file.name ? file.name : "asset.bin");
  if (assetId) form.append("asset_id", assetId);
  return postForm(`/api/garment-profiles/${encodeURIComponent(id)}/assets`, form, "上传参考图失败");
}
