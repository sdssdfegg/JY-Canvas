// 唯一一份「顶层定义」正则 —— 服务端与前端两个 duplication 门禁共用。
//
// 为什么要有这个文件（V11-RF-019 / RF-026 的教训）：
//   两个门禁各持一份「同族但不同写法」的正则，已经漂过一次 ——
//   服务端 `server-duplication-check.mjs` 与前端 `lib/frontend-sources.mjs` 的
//   TOP_LEVEL_DEF_RES[0] 都只认行首 `function`，**都不认 `export function`**。
//   实测后果（§0.9 第 17 条）：服务端 205 个顶层函数声明里 159 个（77.6%）不在门禁视野内，
//   前端 019 的 22 条基线同样是低估值（修正后 24 条）。
//   ⇒ 「门禁全绿」只等于「在它的判据下没有重复」，不等于「没有重复」。
//   两份正则是漂移的温床：改了一处、忘了另一处，两年后必然再漂一次。
//   **提取逻辑只能有一份，就在这里。**
//
// 口径（三选一，写清楚，否则数字会互相打架）：
//   1) 行首锚定：只有列 0 的声明算顶层；缩进的内层函数不扫（done / viewLeft 之类
//      跨文件同名属正常作用域，全扫会大量误报——评估报告初版就是这么扫出 104 处的）。
//   2) 两种声明形式：函数声明族 + const 箭头常量族，见下面两个常量。
//   3) 名字长度过滤：MIN_NAME_LENGTH，**只有前端用**（见该常量说明）。
//
// 刻意不收的形式（收了只会引入噪声，实测无收益）：
//   - `const NAME = function(`：在 src/ 与 server/ 实测均为 0 处。
//   - 匿名 `export default function(`：没有名字，无法计入同名账。

/**
 * 函数声明族：`function NAME(` / `async function NAME(`，可选 export / export default 前缀。
 *
 * 🔴 V11-RF-026 修正（2026-10-02）：`export` 前缀必须认。
 *   旧：`/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm`
 *   新：下面这版。修之前，server/core 里 105 处 `export function` 全在门禁视野外。
 * 捕获组 1 = 函数名。
 */
export const TOP_LEVEL_FUNCTION_DEF_RE =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;

/**
 * const 箭头常量族：`const NAME = (` / `const NAME = async (`，可选 export 前缀。
 * 前端工具函数大量写成这种形式，只认 function 会留下盲区。
 * 捕获组 1 = 常量名。
 */
export const TOP_LEVEL_ARROW_CONST_DEF_RE =
  /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm;

/** 两个门禁共用的顺序：[0] 函数声明族，[1] const 箭头常量族。 */
export const TOP_LEVEL_DEF_RES = [
  TOP_LEVEL_FUNCTION_DEF_RE,
  TOP_LEVEL_ARROW_CONST_DEF_RE,
];

/**
 * 计入的最短名字长度（短于此值忽略）。
 *
 * 🔴 只有前端用，服务端**不启用**这个过滤：
 *   前端 82 个缩进内层函数里混着 done / map / foo 这类极短名噪声，需要过滤；
 *   服务端没有这个噪声，而过滤会让门禁视野变窄 —— 与 §0.9 第 17 条
 *   「不要选择性失明」直接冲突（026 刚把视野从 51 个函数扩到 216 个）。
 *   宁可多记，不可再看不见。
 */
export const MIN_NAME_LENGTH = 4;
