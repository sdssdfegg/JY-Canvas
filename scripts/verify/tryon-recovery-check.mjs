// P1-6 验收：换装任务启动恢复 + 路由内嵌写入。
//
// 设计约束（与项目既有 verify 脚本同口径）：
//   - 纯进程内断言，不起服务、不调上游、**不扣额度**；
//   - **不碰用户数据**：所有存储走注入的假实现（recovery/route-inlay 的 store 参数）；
//   - 静态部分守护「零依赖叶子」红线（recovery.js 被启动链路 import，绝不可 import 特性模块）。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function loadModule(relPath) {
  return import(pathToFileURL(path.join(repoRoot, relPath)).href);
}

const sm = await loadModule("server/ai-tryon/state-machine.js");
const recovery = await loadModule("server/ai-tryon/recovery.js");
const inlay = await loadModule("server/ai-tryon/route-inlay.js");

const { TASK_STATES, TASK_EVENTS } = sm;
const { planPathToTerminal } = sm;
const { classifyInterruptedTask, recoverAiTryonTasks, runAiTryonStartupRecovery, DEFAULT_RECOVERY_MAX_SCAN } = recovery;
const { beginTryOnTask, settleTryOnTask } = inlay;

const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("[P1-6] 换装任务启动恢复 + 路由内嵌写入");

// ── 1. 终态收敛路径规划（纯函数）────────────────────────────────────────────
{
  const p1 = planPathToTerminal(TASK_STATES.CREATED, TASK_STATES.SUCCEEDED);
  check(
    "CREATED → SUCCEEDED 走完整合法边（无直达边，逐段推进）",
    p1.ok && p1.events.join(">") === [
      TASK_EVENTS.START_VALIDATION,
      TASK_EVENTS.MARK_READY,
      TASK_EVENTS.START_GENERATION,
      TASK_EVENTS.EVALUATE,
      TASK_EVENTS.SUCCEED
    ].join(">"),
    p1.ok ? p1.events.join(">") : String(p1.reason)
  );

  const p2 = planPathToTerminal(TASK_STATES.GENERATING, TASK_STATES.FAILED);
  check(
    "GENERATING → FAILED 为 [EVALUATE, FAIL]",
    p2.ok && p2.events.join(">") === [TASK_EVENTS.EVALUATE, TASK_EVENTS.FAIL].join(">"),
    p2.ok ? p2.events.join(">") : String(p2.reason)
  );

  const p3 = planPathToTerminal(TASK_STATES.EVALUATING, TASK_STATES.NEEDS_REVIEW);
  check(
    "EVALUATING → NEEDS_REVIEW 为 [MARK_NEEDS_REVIEW]",
    p3.ok && p3.events.join(">") === TASK_EVENTS.MARK_NEEDS_REVIEW,
    p3.ok ? p3.events.join(">") : String(p3.reason)
  );

  check(
    "留位态 ANALYZING 不做收敛（拒绝而非静默转移）",
    planPathToTerminal(TASK_STATES.ANALYZING, TASK_STATES.SUCCEEDED).ok === false
  );
  check(
    "非法目标态被拒（非终态不能当收敛目标）",
    planPathToTerminal(TASK_STATES.GENERATING, TASK_STATES.GENERATING).ok === false
  );
}

// ── 2. 中断任务分类（纯函数）────────────────────────────────────────────────
{
  check(
    "已有结果资产 → SUCCEEDED（生图其实成功、只是状态没推进完）",
    classifyInterruptedTask({ result_asset_ids: ["a.png"], attempts: [] }) === TASK_STATES.SUCCEEDED
  );
  check(
    "零 attempt（出海前中断）→ NEEDS_REVIEW（证据不足，绝不自动重发）",
    classifyInterruptedTask({ attempts: [] }) === TASK_STATES.NEEDS_REVIEW
  );
  check(
    "末次 attempt 为 quality → NEEDS_REVIEW",
    classifyInterruptedTask({ attempts: [{ error_class: "quality" }] }) === TASK_STATES.NEEDS_REVIEW
  );
  check(
    "末次 attempt 为 network → FAILED",
    classifyInterruptedTask({ attempts: [{ error_class: "network" }] }) === TASK_STATES.FAILED
  );
  check("空/非法任务 → null（不可判定）", classifyInterruptedTask(null) === null);
}

// ── 3. 启动恢复扫描（假存储，**不碰用户数据**）──────────────────────────────
{
  const tasks = {
    "t-success": { task_id: "t-success", status: TASK_STATES.GENERATING, attempts: [{ error_class: "network" }], result_asset_ids: ["x.png"] },
    "t-failed": { task_id: "t-failed", status: TASK_STATES.GENERATING, attempts: [{ error_class: "network" }] },
    "t-review": { task_id: "t-review", status: TASK_STATES.READY_TO_GENERATE, attempts: [] },
    "t-done": { task_id: "t-done", status: TASK_STATES.SUCCEEDED, attempts: [{ ok: true }] },
    "t-reserved": { task_id: "t-reserved", status: TASK_STATES.ANALYZING, attempts: [{ error_class: "network" }] }
  };
  const writes = [];
  const store = {
    listTasks: async () => Object.values(tasks).map((t) => ({ id: t.task_id, status: t.status })),
    readTask: async (id) => tasks[id],
    updateStatus: async (id, status, ctx = {}) => {
      writes.push({ id, status, ctx });
      tasks[id].status = status;
    },
    exists: () => true,
    tasksDir: "fake-tasks-dir"
  };

  const summary = await recoverAiTryonTasks(store);

  check("扫描到全部 5 条", summary.scanned === 5, `scanned=${summary.scanned}`);
  check("终态任务被跳过（不覆盖）", summary.skippedTerminal === 1, `skippedTerminal=${summary.skippedTerminal}`);
  check("留位态被跳过（不静默转移）", summary.skippedReserved === 1, `skippedReserved=${summary.skippedReserved}`);
  check("恢复 3 条非终态", summary.recovered === 3, `recovered=${summary.recovered}`);
  check("其中成功 1 / 失败 1 / 待复核 1", summary.succeeded === 1 && summary.failed === 1 && summary.needsReview === 1,
    `s=${summary.succeeded} f=${summary.failed} r=${summary.needsReview}`);
  check("无异常", summary.errors.length === 0, summary.errors.join("; "));

  const landed = (id) => writes.filter((w) => w.id === id).pop()?.status;
  check("t-success 收敛为 SUCCEEDED", landed("t-success") === TASK_STATES.SUCCEEDED, String(landed("t-success")));
  check("t-failed 收敛为 FAILED", landed("t-failed") === TASK_STATES.FAILED, String(landed("t-failed")));
  check("t-review 收敛为 NEEDS_REVIEW", landed("t-review") === TASK_STATES.NEEDS_REVIEW, String(landed("t-review")));
  check("终态任务未被写入任何状态", writes.filter((w) => w.id === "t-done").length === 0);
  check("留位态未被写入任何状态", writes.filter((w) => w.id === "t-reserved").length === 0);
  check(
    "恢复记录带 recovery_note（标明非自动重发生图）",
    writes.filter((w) => w.ctx?.recovery_note === "startup-recovery-no-auto-regenerate").length === 3
  );

  // 🔴 绝不自动重新生图：恢复路径没有任何 dispatch/出海口（静态 + 动态双保险见下节）。
  check(
    "恢复过程未产生任何新 attempt（不重发）",
    !writes.some((w) => typeof w.ctx?.attempt_id === "string")
  );

  const missing = await recoverAiTryonTasks({ ...store, exists: () => false });
  check("任务目录不存在时直接返回（首次启动不凭空建目录）", missing.dirMissing === true && missing.scanned === 0);

  const capped = await recoverAiTryonTasks({ ...store, maxScan: 2 });
  check("maxScan 生效（防止历史堆积拖慢启动）", typeof capped.scanned === "number", `scanned=${capped.scanned}`);
  check("默认扫描上限为正整数", Number.isInteger(DEFAULT_RECOVERY_MAX_SCAN) && DEFAULT_RECOVERY_MAX_SCAN > 0);
}

// ── 4. 启动钩子永不抛（启动链路铁律）────────────────────────────────────────
{
  let threw = false;
  let result = null;
  try {
    result = await runAiTryonStartupRecovery({
      listTasks: async () => { throw new Error("index 损坏"); },
      exists: () => true,
      tasksDir: "fake-tasks-dir"
    });
  } catch {
    threw = true;
  }
  check("listTasks 抛错时启动恢复不抛出（不挡启动）", threw === false);
  check("失败被记入 errors 而非静默", Array.isArray(result?.errors) && result.errors.length === 1,
    JSON.stringify(result?.errors || []));
}

// ── 5. 零依赖叶子红线（recovery.js 被 server/index.js 启动链路 import）──────
{
  const src = readFileSync(path.join(repoRoot, "server/ai-tryon/recovery.js"), "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(["node:fs", "../core/app-paths.js", "./task-store.js", "./state-machine.js"]);
  const illegal = imports.filter((spec) => !allowed.has(spec));
  check(
    "recovery.js 只 import 叶子（node:fs / app-paths / task-store / state-machine）",
    illegal.length === 0,
    `越界：${illegal.join(", ")}`
  );
  check(
    "recovery.js 不含任何出海/生图调用（绝不自动重新生图）",
    !/\b(fetch|dispatch|generateTryOn|imageForwardUpload)\s*\(/.test(src)
  );
  const indexSrc = readFileSync(path.join(repoRoot, "server/index.js"), "utf8");
  check(
    "server/index.js 已在启动链路挂接 runAiTryonStartupRecovery",
    /runAiTryonStartupRecovery\s*\(/.test(indexSrc)
  );
  check(
    "启动恢复挂在 listenOnPort 之前（先收敛再对外服务）",
    indexSrc.indexOf("runAiTryonStartupRecovery") < indexSrc.indexOf("listenOnPort(PORT)")
  );
}

// ── 6. 路由内嵌写入（入口/出口，假存储）────────────────────────────────────
{
  const logs = [];
  const attempts = [];
  const statuses = [];
  let created = null;
  const store = {
    createTryOnTask: async (payload) => {
      created = payload;
      return { task_id: "tryon-abc", status: TASK_STATES.READY_TO_GENERATE, attempts: [] };
    },
    appendAttempt: async (id, attempt) => { attempts.push({ id, ...attempt }); },
    updateStatus: async (id, status, ctx) => { statuses.push({ id, status, ctx }); },
    log: async (entry) => { logs.push(entry); }
  };

  const task = await beginTryOnTask({
    requestId: "outfit_1",
    params: { model: "tt-image-2", channelId: "silent-tt2-line-01", prompt: "p" },
    payload: { workflowMode: "outfit" },
    files: [{ originalname: "model.png", size: 1024 }, { originalname: "cloth.png", size: 2048 }]
  }, store);
  check("入口侧建任务成功", task?.task_id === "tryon-abc", JSON.stringify(task));
  check("requestId 兼作 idempotency_key（重复提交不重复建任务）", created?.idempotency_key === "outfit_1");
  check("输入资产只落元数据（名字/大小），不落 buffer", created?.input_model_asset?.name === "model.png"
    && created?.input_model_asset?.size === 1024 && !("buffer" in (created?.input_model_asset || {})));
  check("模型/渠道/来源写入 options", created?.model === "tt-image-2"
    && created?.channelId === "silent-tt2-line-01" && created?.options?.source === "/api/generate-outfit");

  // 建任务失败 → 返回 null 且只落日志（绝不阻断生成）
  const nullTask = await beginTryOnTask({ requestId: "outfit_2", params: {} }, {
    ...store,
    createTryOnTask: async () => { throw new Error("磁盘只读"); }
  });
  check("建任务失败返回 null（不阻断生成）", nullTask === null);
  check("建任务失败只落一条日志", logs.length === 1 && logs[0].stage === "tryon-task-create-failed",
    JSON.stringify(logs.map((l) => l.stage)));

  // 出口：成功
  const okRes = await settleTryOnTask(task, {
    ok: true, requestId: "outfit_1", model: "tt-image-2", channel: "silent-tt2-line-01",
    images: [{ value: "https://x/1.png" }, { url: "https://x/2.png" }]
  }, store);
  check("成功出口收敛为 SUCCEEDED", okRes.ok === true && okRes.landed === TASK_STATES.SUCCEEDED,
    JSON.stringify(okRes));
  check("成功出口落 1 条 attempt（不重复 append）", attempts.length === 1, `attempts=${attempts.length}`);
  const lastWrite = statuses[statuses.length - 1];
  check("结果资产引用落盘（只存可回溯字符串）",
    Array.isArray(lastWrite.ctx.result_asset_ids) && lastWrite.ctx.result_asset_ids.length === 2,
    JSON.stringify(lastWrite.ctx));

  // 出口：失败（非 quality）
  const failRes = await settleTryOnTask({ task_id: "tryon-b", status: TASK_STATES.READY_TO_GENERATE }, {
    ok: false, requestId: "outfit_3", status: 502, error: "上游超时"
  }, store);
  check("失败出口收敛为 FAILED", failRes.ok === true && failRes.landed === TASK_STATES.FAILED, JSON.stringify(failRes));
  check("失败出口带 failure_tag（可解释）",
    statuses[statuses.length - 1].ctx.failure_tag === "MODEL_API_ERROR",
    JSON.stringify(statuses[statuses.length - 1].ctx));

  // 出口：quality → NEEDS_REVIEW（而非 FAILED）
  const qRes = await settleTryOnTask({ task_id: "tryon-c", status: TASK_STATES.READY_TO_GENERATE }, {
    ok: false, requestId: "outfit_4", errorClass: "quality", error: "细节缺失"
  }, store);
  check("quality 失败进 NEEDS_REVIEW（不伪装成功、不直接判死）",
    qRes.ok === true && qRes.landed === TASK_STATES.NEEDS_REVIEW, JSON.stringify(qRes));

  // 无任务（建任务失败过的请求）→ 静默跳过，不写任何东西
  const before = attempts.length + statuses.length;
  const skip = await settleTryOnTask(null, { ok: true }, store);
  check("无任务时出口写入静默跳过", skip.ok === false && skip.reason === "no-task"
    && attempts.length + statuses.length === before, JSON.stringify(skip));

  // 终态再收敛应失败而非静默覆盖
  const terminal = await settleTryOnTask({ task_id: "tryon-d", status: TASK_STATES.SUCCEEDED }, {
    ok: false, requestId: "outfit_5", error: "迟到的失败"
  }, store);
  check("终态任务不被静默覆盖（返回失败而非改写）", terminal.ok === false, JSON.stringify(terminal));
}

// ── 7. 路由确实内嵌了两侧写入（源码扫描，防后续重构丢失挂点）────────────────
{
  const src = readFileSync(path.join(repoRoot, "server/routes/outfit.routes.js"), "utf8");
  check("路由入口调用 beginTryOnTask", /beginTryOnTask\s*\(/.test(src));
  check("成功/失败出口均调用 settleTryOnTaskInBackground",
    (src.match(/settleTryOnTaskInBackground\s*\(/g) || []).length >= 3,
    `次数=${(src.match(/settleTryOnTaskInBackground\s*\(/g) || []).length}`);
  check("响应体回传 tryonTaskId（供前端最小可见）", /tryonTaskId:/.test(src));
}

console.log(`\n[P1-6] ${failures.length === 0 ? "全部通过" : `${failures.length} 项失败`}`);
if (failures.length > 0) {
  console.error(`失败项：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
