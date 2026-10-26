// 换装任务状态机（P1-4）：纯函数最小版。零依赖叶子（不 import 任何模块，避免污染启动/打包链路）。
//
// 设计依据：contracts/state-machine.md（总纲 §4.3/§4.4 落地版）。
// P1-4 只实现「最小可落地子集」——把契约 12/13 态中的线性主链路 + 终态打通，
// 其余 4 个态（ANALYZING / POSTPROCESSING / REPAIR_PENDING / RETRY_WAIT）作为**留位**：
// 它们是合法 state 值（在 TASK_STATES 中），但本单不为它们接转移边，任何向它们或自它们的转移都抛错，
// 由 P3/P4 按契约填充具体业务（M-02 的后续补齐）。
//
// 铁律落位（contracts/state-machine.md §2）：
//   1. 持久化优先 —— 转移结果由调用方（P1-5）在「外部调用前」先写任务状态 + attempt（依赖 P1-1 task-store）。
//   2. 终态不静默覆盖 —— 终态（SUCCEEDED/FAILED/CANCELLED/NEEDS_REVIEW）的任何转移都抛错；
//      需新尝试时由调用方创建受关联的新 attempt（isTerminalState 供其判断）。
//   6. 预算门 —— checkBudgetBeforeCall 在「调用之前」放行判断，默认 1 初始 + 2 额外（contract §3）。
//   5. 重试分类 —— isRetryableError 区分限流/网络/超时（可有限退避）与 参数/权限（不自动重试）；
//      具体重试/修复动作在 P1-5，本模块只给分类判定。
//
// 本模块不读写磁盘、不碰路由、不新建队列；只做「状态 + 转移 + 预算/重试判定」的纯逻辑。

/** 任务状态全集（契约 §1）。ANALYZING/POSTPROCESSING/REPAIR_PENDING/RETRY_WAIT 为 P1-4 留位。 */
export const TASK_STATES = Object.freeze({
  CREATED: "CREATED",
  VALIDATING: "VALIDATING",
  ANALYZING: "ANALYZING", // 留位（P3/P4 填充）
  READY_TO_GENERATE: "READY_TO_GENERATE",
  GENERATING: "GENERATING",
  POSTPROCESSING: "POSTPROCESSING", // 留位
  EVALUATING: "EVALUATING",
  REPAIR_PENDING: "REPAIR_PENDING", // 留位
  RETRY_WAIT: "RETRY_WAIT", // 留位
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  NEEDS_REVIEW: "NEEDS_REVIEW"
});

/** 终态集合（契约 §1 末行）。终态不静默覆盖。 */
export const TERMINAL_STATES = Object.freeze([
  TASK_STATES.SUCCEEDED,
  TASK_STATES.FAILED,
  TASK_STATES.CANCELLED,
  TASK_STATES.NEEDS_REVIEW
]);

/** 事件全集：驱动状态机从当前态走向下一态。 */
export const TASK_EVENTS = Object.freeze({
  START_VALIDATION: "START_VALIDATION",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  MARK_READY: "MARK_READY",
  START_GENERATION: "START_GENERATION",
  GENERATION_FAILED: "GENERATION_FAILED",
  EVALUATE: "EVALUATE",
  SUCCEED: "SUCCEED",
  FAIL: "FAIL",
  MARK_NEEDS_REVIEW: "MARK_NEEDS_REVIEW",
  CANCEL: "CANCEL_CUR" // 命名避免与内置 cancel 语义混淆（契约用 CANCELLED 作终态名）
});

/**
 * P1-4 实现的转移子集（collapse ANALYZING/POSTPROCESSING/REPAIR_PENDING/RETRY_WAIT 为留位）。
 * 键=当前态，值={事件:下一态}。表中不存在的 (态,事件) 组合 = 非法转移，transition 抛错。
 */
const TRANSITIONS = Object.freeze({
  [TASK_STATES.CREATED]: {
    [TASK_EVENTS.START_VALIDATION]: TASK_STATES.VALIDATING,
    [TASK_EVENTS.CANCEL]: TASK_STATES.CANCELLED
  },
  [TASK_STATES.VALIDATING]: {
    [TASK_EVENTS.MARK_READY]: TASK_STATES.READY_TO_GENERATE,
    [TASK_EVENTS.VALIDATION_FAILED]: TASK_STATES.FAILED,
    [TASK_EVENTS.CANCEL]: TASK_STATES.CANCELLED
  },
  [TASK_STATES.READY_TO_GENERATE]: {
    [TASK_EVENTS.START_GENERATION]: TASK_STATES.GENERATING,
    [TASK_EVENTS.CANCEL]: TASK_STATES.CANCELLED
  },
  [TASK_STATES.GENERATING]: {
    [TASK_EVENTS.EVALUATE]: TASK_STATES.EVALUATING,
    [TASK_EVENTS.GENERATION_FAILED]: TASK_STATES.FAILED,
    [TASK_EVENTS.CANCEL]: TASK_STATES.CANCELLED
  },
  [TASK_STATES.EVALUATING]: {
    [TASK_EVENTS.SUCCEED]: TASK_STATES.SUCCEEDED,
    [TASK_EVENTS.FAIL]: TASK_STATES.FAILED,
    [TASK_EVENTS.MARK_NEEDS_REVIEW]: TASK_STATES.NEEDS_REVIEW,
    [TASK_EVENTS.CANCEL]: TASK_STATES.CANCELLED
  }
});

/** 默认预算（契约 §3 工程默认值：1 初始 + 2 额外生成尝试；1 次针对性修复）。 */
export const BUDGET_DEFAULTS = Object.freeze({
  maxGenerationAttempts: 3,
  maxRepairAttempts: 1
});

/** 可重试的错误分类（契约 §2.5）：限流/临时网络/超时 → 有限指数退避。 */
export const RETRYABLE_ERROR_CATEGORIES = Object.freeze(["rate_limit", "network", "timeout"]);

/** 失败标签集（契约 §5，供 log-fields.md failure_tag 引用）。 */
export const FAILURE_TAGS = Object.freeze([
  "BODY_SHAPE_DRIFT",
  "GARMENT_TOO_BULKY",
  "FIT_TYPE_DRIFT",
  "COLOR_SHIFT",
  "PATTERN_DISTORTION",
  "DETAIL_MISSING",
  "EDGE_ARTIFACT",
  "BACKGROUND_CHANGED",
  "POSE_OCCLUSION_ERROR",
  "MODEL_API_ERROR"
]);

/** 非法状态转移错误（不静默：调用方必须显式处理）。 */
export class IllegalStateTransitionError extends Error {
  constructor(currentState, event, nextState, reason) {
    super(
      `非法状态转移：current=${currentState} event=${event} ` +
        `next=${nextState === null ? "<none>" : nextState} reason=${reason}`
    );
    this.name = "IllegalStateTransitionError";
    this.currentState = currentState;
    this.event = event;
    this.nextState = nextState;
    this.reason = reason;
  }
}

/** 判断 state 是否为合法枚举值。 */
export function isValidState(state) {
  return typeof state === "string" && Object.prototype.hasOwnProperty.call(TASK_STATES, state);
}

/** 判断 state 是否为终态（终态不可被转移覆盖）。 */
export function isTerminalState(state) {
  return TERMINAL_STATES.includes(state);
}

/**
 * 计算 nextState（纯函数，不写盘）。
 * @param {object} task 含 status（缺省按 CREATED）与可选 attempts 数组
 * @param {string} event TASK_EVENTS 之一
 * @returns {string} 下一态
 * @throws {IllegalStateTransitionError} 终态再转移 / 无此转移边
 */
export function transition(task, event) {
  const current = task && typeof task.status === "string" && isValidState(task.status)
    ? task.status
    : TASK_STATES.CREATED;
  if (isTerminalState(current)) {
    throw new IllegalStateTransitionError(current, event, null, "terminal-state-cannot-transition");
  }
  const next = TRANSITIONS[current] && TRANSITIONS[current][event];
  if (!next) {
    throw new IllegalStateTransitionError(current, event, null, "no-such-transition");
  }
  return next;
}

/**
 * 调用前预算门（契约 §2.6）：当前已尝试次数是否仍有余量。
 * @param {object} task 含 attempts 数组（P1-1 task-store 写入）
 * @param {object} [budget] 覆盖 BUDGET_DEFAULTS
 * @returns {boolean} true=放行下次外部调用
 */
export function checkBudgetBeforeCall(task, budget = BUDGET_DEFAULTS) {
  const attempts = task && Array.isArray(task.attempts) ? task.attempts.length : 0;
  const max = budget && typeof budget.maxGenerationAttempts === "number"
    ? budget.maxGenerationAttempts
    : BUDGET_DEFAULTS.maxGenerationAttempts;
  return attempts < max;
}

/**
 * 重试分类判定（契约 §2.5）。
 * @param {string} category 错误类别
 * @returns {boolean} true=可有限退避重试；false=参数/权限等不自动重试
 */
export function isRetryableError(category) {
  return RETRYABLE_ERROR_CATEGORIES.includes(category);
}

// ── 终态收敛路径规划（P1-6 复用：启动恢复 + 路由出口共用，避免两处各写一份边表）──
// 场景：进程被中断时任务停在非终态（如 GENERATING），恢复/收尾需要「沿合法边」走到终态。
// 状态机没有「非终态 → 终态」的直达边，必须逐段走（先到 EVALUATING 再到终态）。

/** 各非终态 → EVALUATING 的合法事件路径。留位态不在表内 → 不做收敛。 */
const PATH_TO_EVALUATING = Object.freeze({
  [TASK_STATES.CREATED]: [
    TASK_EVENTS.START_VALIDATION,
    TASK_EVENTS.MARK_READY,
    TASK_EVENTS.START_GENERATION,
    TASK_EVENTS.EVALUATE
  ],
  [TASK_STATES.VALIDATING]: [
    TASK_EVENTS.MARK_READY,
    TASK_EVENTS.START_GENERATION,
    TASK_EVENTS.EVALUATE
  ],
  [TASK_STATES.READY_TO_GENERATE]: [
    TASK_EVENTS.START_GENERATION,
    TASK_EVENTS.EVALUATE
  ],
  [TASK_STATES.GENERATING]: [TASK_EVENTS.EVALUATE],
  [TASK_STATES.EVALUATING]: []
});

/** EVALUATING → 终态的事件。 */
const TERMINAL_EVENT = Object.freeze({
  [TASK_STATES.SUCCEEDED]: TASK_EVENTS.SUCCEED,
  [TASK_STATES.FAILED]: TASK_EVENTS.FAIL,
  [TASK_STATES.NEEDS_REVIEW]: TASK_EVENTS.MARK_NEEDS_REVIEW
});

/**
 * 规划「从当前态沿合法边走到指定终态」的事件序列（纯函数，不写盘）。
 * @param {string} fromStatus 当前非终态
 * @param {string} targetTerminal SUCCEEDED / FAILED / NEEDS_REVIEW
 * @returns {{ok:boolean, events:string[]|null, reason:string|null}}
 */
export function planPathToTerminal(fromStatus, targetTerminal) {
  const path = PATH_TO_EVALUATING[fromStatus];
  if (!path) {
    return { ok: false, events: null, reason: `reserved-or-unknown-state:${fromStatus}` };
  }
  const finalEvent = TERMINAL_EVENT[targetTerminal];
  if (!finalEvent) {
    return { ok: false, events: null, reason: `invalid-terminal-target:${targetTerminal}` };
  }
  return { ok: true, events: [...path, finalEvent], reason: null };
}
