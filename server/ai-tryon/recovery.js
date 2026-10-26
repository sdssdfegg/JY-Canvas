// 换装任务启动恢复（P1-6）。
//
// 🔴 零依赖叶子纪律（V121-R2）：本模块会被 `server/index.js` **启动链路** import，
//    因此只准依赖 node 内建 + `core/app-paths.js` + 同为叶子的 `task-store.js` /
//    `state-machine.js`（后者零 import）。绝不可 import execution.js / channel.js 等特性模块。
//
// 铁律（contracts/state-machine.md §2.3 + 本单 §5 风险）：
//   - **绝不盲目重新生图** —— 恢复只做「按检查点/既有证据收敛到终态」，不触发任何上游调用；
//   - 终态不静默覆盖 —— 终态任务直接跳过（isTerminalState）；
//   - 只走合法转移边 —— 逐段用 transition() 校验，留位态（ANALYZING 等）不做恢复。

import { existsSync } from "node:fs";
import { aiTryonTasksDir } from "../core/app-paths.js";
import { listTasks, readTask, updateStatus } from "./task-store.js";
import {
  TASK_STATES,
  isTerminalState,
  transition,
  planPathToTerminal
} from "./state-machine.js";

/** 单次启动恢复的扫描上限（防止历史任务堆积拖慢启动）。 */
export const DEFAULT_RECOVERY_MAX_SCAN = 500;

/**
 * 判断一个「被中断」的任务应收敛到哪个终态（纯函数，不写盘、不发请求）。
 * @param {object} task 完整任务对象（含 attempts / result_asset_ids）
 * @returns {string|null} TASK_STATES 终态之一；null=无法判定
 */
export function classifyInterruptedTask(task) {
  if (!task || typeof task !== "object") return null;
  const attempts = Array.isArray(task.attempts) ? task.attempts : [];
  // 结果资产已落 = 生图其实成功了、只是状态没推进完 → 直接收敛为成功。
  if (Array.isArray(task.result_asset_ids) && task.result_asset_ids.length > 0) {
    return TASK_STATES.SUCCEEDED;
  }
  // 一次 attempt 都没有 = 出海前就断了，证据不足，交人工看（绝不自动重发）。
  if (attempts.length === 0) return TASK_STATES.NEEDS_REVIEW;
  const last = attempts[attempts.length - 1] || {};
  // 质量类失败 → 人工复核（修复动作属 P4）。
  if (last.error_class === "quality") return TASK_STATES.NEEDS_REVIEW;
  return TASK_STATES.FAILED;
}

/**
 * 沿合法边把任务推进到终态（通用收敛器：启动恢复与路由出口共用）。
 * @param {string} fromStatus 当前非终态
 * @param {string} target 终态（SUCCEEDED / FAILED / NEEDS_REVIEW）
 * @param {(status:string, ctx?:object)=>Promise<any>} apply 形如 (status, ctx) => updateStatus(id, status, ctx)
 * @param {object} [finalCtx] 落在终态那一步要一起写入的字段
 * @returns {Promise<string>} 最终落到的状态
 * @throws {Error} 留位态/未知态/非法目标态（调用方须显式处理）
 */
export async function advanceToTerminal(fromStatus, target, apply, finalCtx = {}) {
  const plan = planPathToTerminal(fromStatus, target);
  if (!plan.ok) {
    throw new Error(`无法收敛到终态：${plan.reason}`);
  }
  let current = fromStatus;
  for (let index = 0; index < plan.events.length; index += 1) {
    const event = plan.events[index];
    const next = transition({ status: current }, event);
    const isLast = index === plan.events.length - 1;
    await apply(next, isLast ? finalCtx : {});
    current = next;
  }
  return current;
}

/**
 * 扫描并恢复非终态任务。存储可注入（单测用假存储，**不碰用户数据**）。
 * @param {object} [options]
 * @param {Function} [options.listTasks]
 * @param {Function} [options.readTask]
 * @param {Function} [options.updateStatus]
 * @param {number} [options.maxScan]
 * @returns {Promise<{scanned:number,recovered:number,succeeded:number,failed:number,needsReview:number,skippedTerminal:number,skippedReserved:number,unclassifiable:number,dirMissing:boolean,errors:string[]}>}
 */
export async function recoverAiTryonTasks(options = {}) {
  const {
    listTasks: list = listTasks,
    readTask: read = readTask,
    updateStatus: update = updateStatus,
    maxScan = DEFAULT_RECOVERY_MAX_SCAN,
    tasksDir = aiTryonTasksDir,
    exists = existsSync
  } = options;

  const summary = {
    scanned: 0,
    recovered: 0,
    succeeded: 0,
    failed: 0,
    needsReview: 0,
    skippedTerminal: 0,
    skippedReserved: 0,
    unclassifiable: 0,
    dirMissing: false,
    errors: []
  };

  // 首次启动 / 从未建过任务：目录不存在就直接返回，不为启动凭空建目录。
  if (!exists(tasksDir)) {
    summary.dirMissing = true;
    return summary;
  }

  let entries = [];
  try {
    entries = await list({ limit: maxScan });
  } catch (error) {
    summary.errors.push(`listTasks 失败：${error instanceof Error ? error.message : String(error)}`);
    return summary;
  }

  for (const entry of entries) {
    summary.scanned += 1;
    const id = entry?.id || entry?.task_id;
    if (!id) {
      summary.unclassifiable += 1;
      continue;
    }
    if (isTerminalState(entry.status)) {
      summary.skippedTerminal += 1;
      continue;
    }
    let task = null;
    try {
      task = await read(id);
    } catch (error) {
      summary.errors.push(`readTask(${id}) 失败：${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const target = classifyInterruptedTask(task);
    if (!target) {
      summary.unclassifiable += 1;
      continue;
    }
    if (!planPathToTerminal(task.status || entry.status, target).ok) {
      summary.skippedReserved += 1;
      continue;
    }
    try {
      const landed = await advanceToTerminal(
        task.status || entry.status,
        target,
        (status, ctx) => update(id, status, ctx),
        {
          recovered_at: new Date().toISOString(),
          recovery_note: "startup-recovery-no-auto-regenerate"
        }
      );
      summary.recovered += 1;
      if (landed === TASK_STATES.SUCCEEDED) summary.succeeded += 1;
      else if (landed === TASK_STATES.FAILED) summary.failed += 1;
      else summary.needsReview += 1;
    } catch (error) {
      summary.errors.push(`恢复 ${id} 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return summary;
}

/**
 * 启动钩子入口（挂 `server/index.js`）。**契约：永不抛出**——恢复失败绝不能挡住服务启动。
 * @param {object} [options] 透传 recoverAiTryonTasks（仅测试用；生产用默认真存储）
 * @returns {Promise<object>} summary（失败时 errors 非空）
 */
export async function runAiTryonStartupRecovery(options = {}) {
  try {
    const summary = await recoverAiTryonTasks(options);
    if (summary.dirMissing) return summary; // 无任务目录，静默（首次启动常态）
    if (summary.recovered > 0 || summary.errors.length > 0) {
      console.log(
        `[ai-tryon] 启动恢复：扫描 ${summary.scanned}，恢复 ${summary.recovered}` +
          `（成功 ${summary.succeeded} / 失败 ${summary.failed} / 待复核 ${summary.needsReview}）` +
          (summary.errors.length > 0 ? `，异常 ${summary.errors.length} 条` : "")
      );
    }
    return summary;
  } catch (error) {
    console.warn(
      `[ai-tryon] 启动恢复整体失败（已忽略，不影响启动）：${error instanceof Error ? error.message : String(error)}`
    );
    return { scanned: 0, recovered: 0, errors: [String(error)] };
  }
}
