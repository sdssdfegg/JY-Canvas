import { apiJson, postJson } from "./client.js";

export function getHistoryResults() {
  return apiJson("/api/history", {}, "读取历史记录失败");
}

export function appendHistoryResults(items) {
  return postJson("/api/history", { items }, "保存历史记录失败");
}

export function deleteHistoryResults(ids) {
  return apiJson("/api/history", {
    method: "DELETE",
    body: JSON.stringify({ ids })
  }, "删除历史记录失败");
}

/**
 * @internal 保留原因（P7-6 确认）：对应服务端 `DELETE /api/history` 的 `clear` 分支，
 * 是清空历史记录在前端唯一的入口，`src/api/README.md` 有登记。当前 UI 没给按钮，
 * 但这是有意的产品取舍（清空太危险），不是没人用的残骸——真出了脏数据要靠它收尾。
 */
export function clearHistoryResultsOnServer() {
  return apiJson("/api/history", {
    method: "DELETE",
    body: JSON.stringify({ clear: true })
  }, "清空历史记录失败");
}

/**
 * 修复失效历史引用（P1 缺图自愈）。
 *
 * 默认只标记、不删除；只有显式传 `dropMissing: true` 才会清理掉失效条目。
 * 服务端在第一次修复前会留 data/history.pre-repair-backup.json。
 *
 * @internal 保留原因（P7-6 确认）：对应服务端 `POST /api/history/repair`，是缺图自愈
 * 的前端入口，`history-repair-check` 验收脚本直接对着这条端面跑断言。UI 入口在 V11-P1
 * 阶段性下线后暂缺，但端到端能力与验收都在，删了会让脚本失去被测对象。
 */
export function repairHistoryResults({ dropMissing = false } = {}) {
  return postJson("/api/history/repair", { dropMissing }, "修复历史记录失败");
}
