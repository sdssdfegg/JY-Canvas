// 数值小工具。
//
// 为什么抽出来（前端专项阶段 B · 刀 2，2026-10-02）：
//   `clamp` 此前在 src/image-editor.jsx 与 src/shared/local-edit-mask.js 各有一份
//   （019 门禁 24 条里的第 3 条），两版**实现不同**，详见函数注释。
//
// 只做纯函数：不碰 DOM、不请求接口，前后端都能直接 import。

/**
 * 把 value 夹到 [min, max] 区间内。
 *
 * 🔴 统一口径说明（刀 2 的关键判定）：两版实现**不同**，取 image-editor 那版：
 *   - image-editor 版：`Math.max(min, Math.min(max, Number(value) || 0))` —— 带数值清洗，NaN / 空 → 0
 *   - local-edit-mask 版：`Math.max(min, Math.min(max, value))` —— 不清洗
 *
 * 为什么取带清洗的那版，且对 local-edit-mask 是零行为变化：
 *   local-edit-mask 的 6 个调用点传进来的**都已经是数字**——
 *     clampLocalEditBrushSize/Opacity 传的是 `Number(value) || 默认值`，
 *     其余 4 处（76-79 行）传的是 `Math.round(...)` 结果。
 *   ⇒ 清洗分支（NaN → 0）在那里永远不触发，两版结果一致。
 *   反过来若取不带清洗那版，image-editor 里 `clamp(transform.scale || 1, ...)` 这类
 *   传 undefined/NaN 的调用点就会从「得到 min 附近的安全值」变成「得到 NaN」——
 *   那才是真正的回归。宁可保留更健壮的那份。
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
