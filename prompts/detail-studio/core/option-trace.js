// prompts/detail-studio/core/option-trace.js
//
// 选项 → PlanningContext → frozenPrompt 溯源（appliedOptions[]）。
//
// 职责：把各模块产出的「选项影响了哪条约束」trace 聚合成最终落库的 appliedOptions，
// 并提供完整性校验——确保每一个参与编译的选项都被记录（质检第⑥类「用户参数未生效」的可定位依据）。
//
// 纯函数、零依赖。

/**
 * 合并多组 trace，按 `${option}|${affected}` 去重（同选项同落点的多条约束只留一条代表性记录）。
 * @param {...Array} traceArrays
 * @returns {Array<{option:string, value:string, affected:string, clause:string}>}
 */
export function mergeTraces(...traceArrays) {
  const seen = new Map();
  for (const arr of traceArrays) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || !item.option) continue;
      const key = `${String(item.option)}|${String(item.affected || "")}`;
      if (!seen.has(key)) {
        seen.set(key, {
          option: String(item.option),
          value: String(item.value == null ? "" : item.value),
          affected: String(item.affected || ""),
          clause: String(item.clause || "")
        });
      }
    }
  }
  return [...seen.values()];
}

/**
 * 由全局锁 trace 与其它 trace 构建完整 appliedOptions。
 * @param {Object} input
 * @param {Array} [input.globalLockTraces] 来自 global-lock.js 的 traces
 * @param {Array} [input.extraTraces]      其它模块（B3 编译器）追加的 traces
 * @returns {Array}
 */
export function buildAppliedOptions({ globalLockTraces = [], extraTraces = [] } = {}) {
  return mergeTraces(globalLockTraces, extraTraces);
}

/**
 * 校验 appliedOptions 是否完整覆盖了应被追踪的选项集合。
 * @param {Array} appliedOptions
 * @param {Array<string>} expectedOptions  应被追踪的选项键集合
 * @returns {{ complete: boolean, missing: string[] }}
 */
export function missingTracedOptions(appliedOptions = [], expectedOptions = []) {
  const traced = new Set((Array.isArray(appliedOptions) ? appliedOptions : []).map((item) => item && item.option));
  const missing = (Array.isArray(expectedOptions) ? expectedOptions : []).filter((key) => !traced.has(key));
  return { complete: missing.length === 0, missing };
}

/** 把 appliedOptions 压成「选项 → 值列表」的便于阅读/调试的映射。 */
export function summarizeAppliedOptions(appliedOptions = []) {
  const map = {};
  for (const item of (Array.isArray(appliedOptions) ? appliedOptions : [])) {
    if (!item || !item.option) continue;
    if (!map[item.option]) map[item.option] = [];
    const v = item.value || "";
    if (!map[item.option].includes(v)) map[item.option].push(v);
  }
  return map;
}
