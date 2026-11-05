// 图片版本 API 客户端（P2-4）：薄封装，只走 src/api/client.js 准入层。
// 严禁在页面/组件里裸写 fetch 访问接口（api-layering 门禁）。
import { apiJson } from "./client.js";

/** 版本列表（可选按 taskId 过滤；不传则全部，服务端已按序号倒序）。 */
export function listImageVersions(taskId) {
  const qs = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
  return apiJson(`/api/image-version/list${qs}`, {}, "读取编辑历史失败");
}

/** 固化资产 URL（按 versionId 解析，服务端从永久资产目录流式返回）。 */
export function imageVersionAssetUrl(versionId) {
  return `/api/image-version/asset/${encodeURIComponent(versionId)}`;
}
