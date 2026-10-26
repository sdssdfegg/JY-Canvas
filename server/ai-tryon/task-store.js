// 换装任务存储层（P1-1）：零依赖叶子。
//
// 设计约束（见 docs/ai-tryon/执行单/P1-1-任务存储与原子写层.md）：
//   1. 零依赖叶子 —— 本模块将被 P1-6 的恢复链路在启动期 import。
//      任何"特性模块群"依赖都会在 rollup 打包后触发初始化期 TDZ（V121-R2 铁律），
//      因此只 import node 内置与 server/core/app-paths.js（app-paths 自身零副作用、纯同步路径计算）。
//      ⚠️ 新增依赖前务必确认是零依赖叶子，否则会污染启动链路。
//   2. 原子写：临时文件 + rename 覆盖，沿用 generation-logger.js 的写法。
//   3. 索引单写入器串行化：所有 index.json 变更经一个 Promise 链，防并发写坏。
//   4. 损坏尾部容忍：读主文件 JSON.parse 失败时回退 .bak；index 损坏则扫目录重建。
//
// 本模块只负责持久化与读写，不实现状态机转移（P1-4）也不碰路由（P1-6）。
// 字段全集以 contracts/tryon-task.md §1 为准；P1 不实现的字段（garment_profile_id /
// quality_report_id 等）可空但结构在位。

import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { aiTryonTasksDir } from "../core/app-paths.js";

// ── 文件名安全化（不引入额外依赖，内联防卫）──────────────────────────────
// task_id 由前端批次生成（outfit-batch-execution.js:331），通常已是安全 id；
// 下面对其做最小净化，去除路径分隔与空字节，避免跨目录写或非法文件名。
function safeFileName(id) {
  const cleaned = String(id == null ? "" : id)
    .replace(/\u0000/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  if (!cleaned) throw new Error(`invalid task_id: ${JSON.stringify(id)}`);
  return cleaned.slice(0, 180); // 限长，避免超长 / 保留名问题
}

function taskFilePath(id) {
  return path.join(aiTryonTasksDir, `${safeFileName(id)}.json`);
}
function taskBakPath(id) {
  return `${taskFilePath(id)}.bak`;
}
function indexFilePath() {
  return path.join(aiTryonTasksDir, "index.json");
}

// ── 串行化队列（防并发写坏）──────────────────────────────────────────────
// 每任务一个链（同 id 的多次写串行），全局索引一个链（index 是共享文件）。
// withChain 返回 fn 的真实结果（含拒绝），同时把"已 settled"的版本存入 map 续接，
// 保证单个失败不阻断后续写；当本链成为最新时清理 Map 条目，避免无限增长。
const perTaskChains = new Map();
const indexChains = new Map();
const INDEX_KEY = "__index__";

function withChain(map, key, fn) {
  const prev = map.get(key) || Promise.resolve();
  const result = prev.then(() => fn(), () => fn());
  const settled = result.then(() => undefined, () => undefined);
  map.set(key, settled);
  settled.finally(() => {
    if (map.get(key) === settled) map.delete(key);
  });
  return result;
}

// ── 原子写：临时文件 + rename 覆盖 ────────────────────────────────────────
async function atomicWrite(file, dataObj) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(dataObj, null, 2), "utf8");
  await rename(tmp, file);
}

// ── 索引读写 ──────────────────────────────────────────────────────────────
function summarize(task) {
  return {
    id: task.task_id,
    status: task.status ?? "CREATED",
    created_at: task.created_at ?? null,
    updated_at: task.updated_at ?? null,
    finished_at: task.finished_at ?? null
  };
}

// 扫描 tasks 目录重建 index（主文件或 index 损坏时调用；在 indexChain 内串行，避免并发重建相互覆盖）。
async function rebuildIndex() {
  const dir = aiTryonTasksDir;
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir).catch(() => [])).filter(
    (name) => name.endsWith(".json") && name !== "index.json"
  );
  // 并发读取所有任务文件（这里没有 await-in-loop；读取互不依赖）。
  const tasks = await Promise.all(
    files.map(async (name) => {
      const id = name.slice(0, -".json".length);
      return readTask(id).catch(() => null);
    })
  );
  const entries = {};
  for (const task of tasks) {
    if (task && task.task_id) entries[task.task_id] = summarize(task);
  }
  const index = { version: 1, tasks: entries, rebuilt_at: new Date().toISOString() };
  await atomicWrite(indexFilePath(), index);
  return index;
}

// 读 index：缺失或损坏则重建。
async function ensureIndex() {
  const raw = await readFile(indexFilePath(), "utf8").catch(() => null);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.tasks) return parsed;
    } catch {
      // 损坏 → 下方重建
    }
  }
  return rebuildIndex();
}

async function upsertIndex(id, summary) {
  const index = await ensureIndex();
  index.tasks = index.tasks || {};
  index.tasks[id] = summary;
  await atomicWrite(indexFilePath(), index);
}

// ── 任务文件写（含 .bak 备份与索引更新；调用方负责 perTaskChain 串行化）──
async function writeTaskFileAndIndex(task) {
  const id = task.task_id;
  const file = taskFilePath(id);
  const bak = taskBakPath(id);

  // 写前备份当前可用版本（损坏尾部容错：.bak 始终是「上一版好数据」）。
  const current = await readFile(file, "utf8").catch(() => null);
  if (current !== null) {
    try {
      const parsed = JSON.parse(current);
      await atomicWrite(bak, parsed);
    } catch {
      // 当前文件已坏：保留既有 .bak，不覆盖。
    }
  }

  await atomicWrite(file, task);

  await withChain(indexChains, INDEX_KEY, async () => {
    await upsertIndex(id, summarize(task));
  });
}

// ── 导出 API ──────────────────────────────────────────────────────────────
/**
 * 读取一个任务。主文件 JSON.parse 失败时回退 .bak；两者皆坏返回 null。
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function readTask(id) {
  const file = taskFilePath(id);
  const primary = await readFile(file, "utf8").catch(() => null);
  if (primary !== null) {
    try {
      return JSON.parse(primary);
    } catch {
      // 主文件损坏尾部 → 回退 .bak
    }
  }
  const bak = await readFile(taskBakPath(id), "utf8").catch(() => null);
  if (bak !== null) {
    try {
      return JSON.parse(bak);
    } catch {
      // 两者都坏 → 返回 null（数据丢失，交由上层决策）
    }
  }
  return null;
}

/**
 * 原子写入/创建任务。自动补 updated_at；缺 created_at 时以当前时间补。
 * @param {object} task 必须含 task_id
 * @returns {Promise<void>}
 */
export async function writeTask(task) {
  if (!task || typeof task !== "object" || !task.task_id) {
    throw new Error("writeTask requires a task object with a task_id field");
  }
  const now = new Date().toISOString();
  const next = { ...task };
  next.updated_at = now;
  if (!next.created_at) next.created_at = now;
  return withChain(perTaskChains, next.task_id, () => writeTaskFileAndIndex(next));
}

/**
 * 追加一次外部调用记录（attempt）。不存在的任务抛错。
 * @param {string} id
 * @param {object} attempt 至少可含 attempt_id/request_id/started_at/finished_at/model/channel/error_class/cost
 * @returns {Promise<void>}
 */
export async function appendAttempt(id, attempt = {}) {
  return withChain(perTaskChains, id, async () => {
    const task = await readTask(id);
    if (!task) throw new Error(`appendAttempt: task not found: ${id}`);
    const attempts = Array.isArray(task.attempts) ? task.attempts : [];
    attempts.push({
      attempt_id: attempt.attempt_id || `att_${attempts.length + 1}_${Date.now()}`,
      request_id: attempt.request_id || null,
      started_at: attempt.started_at || new Date().toISOString(),
      finished_at: attempt.finished_at || null,
      model: attempt.model || null,
      channel: attempt.channel || null,
      error_class: attempt.error_class || null,
      cost: attempt.cost ?? null,
      ...attempt
    });
    task.attempts = attempts;
    task.updated_at = new Date().toISOString();
    await writeTaskFileAndIndex(task);
  });
}

// 终态集合（用于自动补 finished_at；不做转移校验——转移逻辑属 P1-4）。
const TERMINAL_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "NEEDS_REVIEW"]);

/**
 * 更新任务状态并合并附加上下文。不存在的任务抛错。
 * 终态（SUCCEEDED/FAILED/CANCELLED/NEEDS_REVIEW）且尚无 finished_at 时自动补。
 * @param {string} id
 * @param {string} status
 * @param {object} [ctx] 额外字段（result_asset_ids/error/quality_report_id 等）；忽略其中的 status/task_id
 * @returns {Promise<void>}
 */
export async function updateStatus(id, status, ctx = {}) {
  return withChain(perTaskChains, id, async () => {
    const task = await readTask(id);
    if (!task) throw new Error(`updateStatus: task not found: ${id}`);
    task.status = status;
    task.updated_at = new Date().toISOString();
    if (TERMINAL_STATES.has(status) && !task.finished_at) {
      task.finished_at = task.updated_at;
    }
    if (ctx && typeof ctx === "object") {
      for (const [k, v] of Object.entries(ctx)) {
        if (k === "status" || k === "task_id") continue;
        task[k] = v;
      }
    }
    await writeTaskFileAndIndex(task);
  });
}

/**
 * 列出任务（索引摘要级）。index 缺失/损坏时自动重建。
 * @param {object} [filter] { status?: string|string[], created_after?: string|Date, limit?: number }
 * @returns {Promise<Array<{id,status,created_at,updated_at,finished_at}>>}
 */
export async function listTasks(filter = {}) {
  const index = await ensureIndex(); // 缺失/损坏则重建
  let entries = Object.values(index.tasks || {});
  if (filter.status) {
    const set = new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    entries = entries.filter((e) => set.has(e.status));
  }
  if (filter.created_after) {
    const t = new Date(filter.created_after).getTime();
    entries = entries.filter((e) => new Date(e.created_at || 0).getTime() >= t);
  }
  if (typeof filter.limit === "number" && filter.limit > 0) {
    entries = entries.slice(-filter.limit); // 取最近写入的 N 条（index 按写入顺序，近似"最近"）
  }
  return entries;
}

/**
 * 强制重建 index（供 P1-6 启动恢复或人工修复调用）。
 * @returns {Promise<object>}
 */
export async function rebuildIndexForStore() {
  return withChain(indexChains, INDEX_KEY, () => rebuildIndex());
}
