// 换装任务状态机验收（P1-4 交付物，纯进程内、不启动服务、不出图、不扣费）。
//
// 覆盖四件事：
//   1) 合法转移全通过：线性主链路 CREATED→VALIDATING→READY_TO_GENERATE→GENERATING→EVALUATING→SUCCEEDED；
//      失败分支 VALIDATING→FAILED、取消分支 CREATED→CANCELLED；
//   2) 非法转移被拒：跳跃转移 / 终态再转移 / 留位态（ANALYZING 等）转移，全部抛 IllegalStateTransitionError（不静默）；
//   3) 终态不静默覆盖：SUCCEEDED/FAILED/CANCELLED/NEEDS_REVIEW 任意事件均抛错；
//   4) 预算门与重试分类：checkBudgetBeforeCall 在调用前判定余量；isRetryableError 区分可重试/不可重试。
//
// 退出码：通过 0 / 失败 1。

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const sm = await import(pathToFileURL(path.join(repoRoot, "server", "ai-tryon", "state-machine.js")).href);
const {
  TASK_STATES, TASK_EVENTS, TERMINAL_STATES, FAILURE_TAGS,
  isTerminalState, isValidState, transition, checkBudgetBeforeCall, isRetryableError
} = sm;

const failures = [];
function assert(cond, label, detail) {
  if (cond) {
    console.log("  ok   " + label);
  } else {
    failures.push({ label, detail });
    console.log("  FAIL " + label + "  =>  " + detail);
  }
}
function expectTransition(task, event, expected) {
  let got;
  let threw = false;
  try {
    got = transition(task, event);
  } catch (err) {
    threw = true;
    got = err && err.name;
  }
  assert(!threw && got === expected, `transition ${task.status || "(none)"} --${event}--> ${expected}`, `got=${got} threw=${threw}`);
}
function expectThrows(task, event) {
  let threw = false;
  let name = "";
  try {
    transition(task, event);
  } catch (err) {
    threw = true;
    name = err && err.name;
  }
  assert(threw && name === "IllegalStateTransitionError", `非法转移应抛错：${task.status || "(none)"} --${event}-->`, `threw=${threw} name=${name}`);
}

console.log("[state-machine-check] 仓库根: " + repoRoot);

// ---- 1) 合法转移：线性主链路 + 失败分支 + 取消分支 ----
console.log("[1] 合法转移（主链路 / 失败 / 取消）");
expectTransition({ status: TASK_STATES.CREATED }, TASK_EVENTS.START_VALIDATION, TASK_STATES.VALIDATING);
expectTransition({ status: TASK_STATES.VALIDATING }, TASK_EVENTS.MARK_READY, TASK_STATES.READY_TO_GENERATE);
expectTransition({ status: TASK_STATES.READY_TO_GENERATE }, TASK_EVENTS.START_GENERATION, TASK_STATES.GENERATING);
expectTransition({ status: TASK_STATES.GENERATING }, TASK_EVENTS.EVALUATE, TASK_STATES.EVALUATING);
expectTransition({ status: TASK_STATES.EVALUATING }, TASK_EVENTS.SUCCEED, TASK_STATES.SUCCEEDED);
expectTransition({ status: TASK_STATES.VALIDATING }, TASK_EVENTS.VALIDATION_FAILED, TASK_STATES.FAILED);
expectTransition({ status: TASK_STATES.CREATED }, TASK_EVENTS.CANCEL, TASK_STATES.CANCELLED);
expectTransition({ status: TASK_STATES.GENERATING }, TASK_EVENTS.GENERATION_FAILED, TASK_STATES.FAILED);
expectTransition({ status: TASK_STATES.EVALUATING }, TASK_EVENTS.MARK_NEEDS_REVIEW, TASK_STATES.NEEDS_REVIEW);

// 缺省 status 按 CREATED 处理
expectTransition({}, TASK_EVENTS.START_VALIDATION, TASK_STATES.VALIDATING);

// ---- 2) 非法转移被拒（跳跃 / 乱序） ----
console.log("[2] 非法转移被拒");
expectThrows({ status: TASK_STATES.CREATED }, TASK_EVENTS.SUCCEED);
expectThrows({ status: TASK_STATES.CREATED }, TASK_EVENTS.EVALUATE);
expectThrows({ status: TASK_STATES.GENERATING }, TASK_EVENTS.SUCCEED); // 必须经 EVALUATING
expectThrows({ status: TASK_STATES.VALIDATING }, TASK_EVENTS.START_GENERATION); // 必须经 READY_TO_GENERATE
expectThrows({ status: TASK_STATES.READY_TO_GENERATE }, TASK_EVENTS.EVALUATE);

// ---- 3) 终态不静默覆盖 ----
console.log("[3] 终态不静默覆盖");
for (const terminal of TERMINAL_STATES) {
  expectThrows({ status: terminal }, TASK_EVENTS.SUCCEED);
  expectThrows({ status: terminal }, TASK_EVENTS.CANCEL);
}

// ---- 3b) 留位态（ANALYZING/POSTPROCESSING/REPAIR_PENDING/RETRY_WAIT）转移被拒 ----
console.log("[3b] 留位态转移被拒");
for (const reserved of [
  TASK_STATES.ANALYZING, TASK_STATES.POSTPROCESSING, TASK_STATES.REPAIR_PENDING, TASK_STATES.RETRY_WAIT
]) {
  expectThrows({ status: reserved }, TASK_EVENTS.MARK_READY);
  expectThrows({ status: reserved }, TASK_EVENTS.SUCCEED);
}

// ---- 4) 终态判定 ----
console.log("[4] isTerminalState 判定");
for (const terminal of TERMINAL_STATES) {
  assert(isTerminalState(terminal) === true, `isTerminalState(${terminal}) === true`, String(isTerminalState(terminal)));
}
for (const nonTerminal of [
  TASK_STATES.CREATED, TASK_STATES.VALIDATING, TASK_STATES.READY_TO_GENERATE,
  TASK_STATES.GENERATING, TASK_STATES.EVALUATING, TASK_STATES.ANALYZING,
  TASK_STATES.POSTPROCESSING, TASK_STATES.REPAIR_PENDING, TASK_STATES.RETRY_WAIT
]) {
  assert(isTerminalState(nonTerminal) === false, `isTerminalState(${nonTerminal}) === false`, String(isTerminalState(nonTerminal)));
}
assert(isValidState("CREATED") === true, "isValidState(CREATED)", "");
assert(isValidState("NOT_A_STATE") === false, "isValidState(NOT_A_STATE) === false", "");

// ---- 5) 预算门（调用前判定余量） ----
console.log("[5] checkBudgetBeforeCall 预算门");
assert(checkBudgetBeforeCall({}) === true, "无 attempts → 放行", String(checkBudgetBeforeCall({})));
assert(checkBudgetBeforeCall({ attempts: [] }) === true, "attempts=0 → 放行", "");
const underBudget = { attempts: [1, 2] };
assert(checkBudgetBeforeCall(underBudget) === true, "attempts=2 (<3) → 放行", String(checkBudgetBeforeCall(underBudget)));
const atLimit = { attempts: [1, 2, 3] };
assert(checkBudgetBeforeCall(atLimit) === false, "attempts=3 (=max) → 拒绝", String(checkBudgetBeforeCall(atLimit)));
assert(
  checkBudgetBeforeCall(underBudget, { maxGenerationAttempts: 1 }) === false,
  "自定义 max=1 且 attempts=2 → 拒绝",
  String(checkBudgetBeforeCall(underBudget, { maxGenerationAttempts: 1 }))
);

// ---- 6) 重试分类 ----
console.log("[6] isRetryableError 重试分类");
for (const retryable of ["rate_limit", "network", "timeout"]) {
  assert(isRetryableError(retryable) === true, `isRetryableError(${retryable}) === true`, "");
}
for (const nonRetryable of ["param", "permission", "unknown", "quality"]) {
  assert(isRetryableError(nonRetryable) === false, `isRetryableError(${nonRetryable}) === false`, "");
}

// ---- 7) 失败标签集 ----
console.log("[7] FAILURE_TAGS 标签集");
assert(Array.isArray(FAILURE_TAGS) && FAILURE_TAGS.length === 10, "FAILURE_TAGS 含 10 个标签", String(FAILURE_TAGS && FAILURE_TAGS.length));
assert(FAILURE_TAGS.includes("MODEL_API_ERROR"), "含 MODEL_API_ERROR", "");

if (failures.length > 0) {
  console.error("\n[state-machine-check] 失败 " + failures.length + " 项：");
  for (const f of failures) {
    console.error("  - " + f.label + ": " + f.detail);
  }
  process.exit(1);
}
console.log("\n[state-machine-check] ok:true");
process.exit(0);
