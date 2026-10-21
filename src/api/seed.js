// seed.js —— 封装配置同步（V123）的 API 准入层。
//
// V123：设置页「同步到封装配置」把开发者最新的提示词模板 / 页面状态写回仓库
// `seed/manifest.json`，封装时自动带上。网络出口收口在 src/api/（P7-6 口径）：
// 页面组件不直接 fetch，统一走这里的薄封装；release-seed.js 也不出现裸 fetch。
//
// 该接口仅在 internal/开发模式可用（public 构建的 server 路由被 esbuild 死代码消除），
// 因此前端在 PUBLIC_RELEASE_MODE 下根本不渲染同步按钮、也不调用本模块——无泄露风险。

import { postJson, apiJson } from "./client.js";

/**
 * 把当前浏览器里的封装种子（manifest）同步进仓库 `seed/manifest.json`。
 * 服务端会强制复核（entry id 合法 + 无凭据字段 + 逐 entry sanitize）后再落盘。
 * @param {object} manifest buildReleaseSeed() 产物 { version, seedId, entries }
 * @returns {Promise<{syncedAt:string, seedId:string, entriesCount:number}>}
 */
export function syncSeedManifest(manifest) {
  return postJson("/api/seed-sync", manifest, "同步封装配置失败");
}

/**
 * 读取仓库 `seed/manifest.json` 的同步状态，供设置页新鲜度提示使用。
 * 文件不存在时服务端返回 { exists:false }，前端据此提示"尚未同步"。
 */
export function fetchSeedSyncStatus() {
  return apiJson("/api/seed-sync", { method: "GET" }, "读取封装配置状态失败");
}
