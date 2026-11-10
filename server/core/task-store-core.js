// 通用持久化任务存储层（V203 阶段 4 · R2 抽取）。
//
// 🔴 零依赖叶子：只 import node 内置模块，不依赖任何特性模块 / 业务模块 / 浏览器模块。
// 这是刻意与 server/ai-tryon/task-store.js 同源的实现 —— 后者是「旧换装」的唯一真相源且
// 属八文件禁改清单（只读参照、本体不改行为），本文件是从它逐行抽取的「通用参数化版本」：
// 仅把硬编码的 aiTryonTasksDir 改为由 createTaskStore({ tasksDir }) 注入，其余逻辑字节等价。
//
// 保留的六机制（与旧 task-store.js 一一对应）：
//   1. 原子写：临时文件 + rename 覆盖。
//   2. 写前 .bak 备份（损坏尾部时 .bak 始终是上一版好数据）。
//   3. 串行写入：每任务一条 Promise 链 + 全局 index.json 一条链，防并发写坏。
//   4. 主文件 JSON.parse 失败回退 .bak；二者皆坏返回 null。
//   5. index 缺失/损坏扫目录重建（在 indexChain 内串行）。
//   6. appendAttempt / updateStatus 等对外行为不变（字段补全、终态补 finished_at 等）。
//
// 本模块只负责持久化与读写，不实现状态机转移也不碰路由。
// 旧换装不依赖本文件（保持 task-store.js 零改动）；详情创作经薄适配层 detail-studio/generation/task-store.js 接入。

import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";

// ── 文件名安全化（不引入额外依赖，内联防卫）──────────────────────────────
function safeFileName(id) {
  const cleaned = String(id == null ? "" : id)
    .replace(/\u0000/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  if (!cleaned) throw new Error(`invalid task_id: ${JSON.stringify(id)}`);
  return cleaned.slice(0, 180); // 限长，避免超长 / 保留名问题
}

function taskFilePath(dir, id) {
  return path.join(dir, `${safeFileName(id)}.json`);
}
function taskBakPath(dir, id) {
  return `${taskFilePath(dir, id)}.bak`;
}
function indexFilePath(dir) {
  return path.join(dir, "index.json");
}

// ── 串行化队列（防并发写坏）──────────────────────────────────────────────
// 每任务一个链（同 id 的多次写串行），全局索引一个链（index 是共享文件）。
// withChain 返回 fn 的真实结果（含拒绝），同时把"已 settled"的版本存入 map 续接，
// 保证单个失败不阻断后续写；当本链成为最新时清理 Map 条目，避免无限增长。
function makeChains() {
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

  return { perTaskChains, indexChains, INDEX_KEY, withChain };
}

// ── 原子写：临时文件 + rename 覆盖 ────────────────────────────────────────
async function atomicWrite(file, dataObj) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(dataObj, null, 2), "utf8");
  // Windows 上覆盖已存在目标文件时，rename 可能偶发 EPERM/EACCES（目标被文件监视 / 杀毒短暂锁定，
  // 或前一写尚未释放句柄）。属瞬态，做有限次退避重试即可降抖；耗尽才上抛，避免掩盖真实错误。
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      lastErr = e;
      const transient = e && (e.code === "EPERM" || e.code === "EACCES");
      if (transient && attempt < 4) {
        await new Promise((r) => setTimeout(r, 8 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
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
async function rebuildIndex(ctx) {
  const { tasksDir } = ctx;
  await mkdir(tasksDir, { recursive: true });
  const files = (await readdir(tasksDir).catch(() => [])).filter(
    (name) => name.endsWith(".json") && name !== "index.json"
  );
  // 并发读取所有任务文件（这里没有 await-in-loop；读取互不依赖）。
  const tasks = await Promise.all(
    files.map(async (name) => {
      const id = name.slice(0, -".json".length);
      return readTask(ctx, id).catch(() => null);
    })
  );
  const entries = {};
  for (const task of tasks) {
    if (task && task.task_id) entries[task.task_id] = summarize(task);
  }
  const index = { version: 1, tasks: entries, rebuilt_at: new Date().toISOString() };
  await atomicWrite(indexFilePath(tasksDir), index);
  return index;
}

// 读 index：缺失或损坏则重建。
async function ensureIndex(ctx) {
  const { tasksDir } = ctx;
  const raw = await readFile(indexFilePath(tasksDir), "utf8").catch(() => null);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.tasks) return parsed;
    } catch {
      // 损坏 → 下方重建
    }
  }
  return rebuildIndex(ctx);
}

async function upsertIndex(ctx, id, summary) {
  const index = await ensureIndex(ctx);
  index.tasks = index.tasks || {};
  index.tasks[id] = summary;
  await atomicWrite(indexFilePath(ctx.tasksDir), index);
}

// ── 任务文件写（含 .bak 备份与索引更新；调用方负责 perTaskChain 串行化）──
async function writeTaskFileAndIndex(ctx, task) {
  const { tasksDir, withChain, indexChains, INDEX_KEY } = ctx;
  const id = task.task_id;
  const file = taskFilePath(tasksDir, id);
  const bak = taskBakPath(tasksDir, id);

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
    await upsertIndex(ctx, id, summarize(task));
  });
}

// ── 导出 API ──────────────────────────────────────────────────────────────
/**
 * 读取一个任务。主文件 JSON.parse 失败时回退 .bak；两者皆坏返回 null。
 * @param {object} ctx
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function readTask(ctx, id) {
  const { tasksDir } = ctx;
  const file = taskFilePath(tasksDir, id);
  const primary = await readFile(file, "utf8").catch(() => null);
  if (primary !== null) {
    try {
      return JSON.parse(primary);
    } catch {
      // 主文件损坏尾部 → 回退 .bak
    }
  }
  const bak = await readFile(taskBakPath(tasksDir, id), "utf8").catch(() => null);
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
 * @param {object} ctx
 * @param {object} task 必须含 task_id
 * @returns {Promise<void>}
 */
async function writeTask(ctx, task) {
  if (!task || typeof task !== "object" || !task.task_id) {
    throw new Error("writeTask requires a task object with a task_id field");
  }
  const now = new Date().toISOString();
  const next = { ...task };
  next.updated_at = now;
  if (!next.created_at) next.created_at = now;
  const { perTaskChains, withChain } = ctx;
  return withChain(perTaskChains, next.task_id, () => writeTaskFileAndIndex(ctx, next));
}

/**
 * 追加一次外部调用记录（attempt）。不存在的任务抛错。
 * @param {object} ctx
 * @param {string} id
 * @param {object} attempt 至少可含 attempt_id/request_id/started_at/finished_at/model/channel/error_class/cost
 * @returns {Promise<void>}
 */
async function appendAttempt(ctx, id, attempt = {}) {
  const { perTaskChains, withChain } = ctx;
  return withChain(perTaskChains, id, async () => {
    const task = await readTask(ctx, id);
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
    await writeTaskFileAndIndex(ctx, task);
  });
}

// 终态集合（用于自动补 finished_at；不做转移校验——转移逻辑属状态机层）。
const TERMINAL_STATES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "NEEDS_REVIEW"]);

/**
 * 更新任务状态并合并附加上下文。不存在的任务抛错。
 * 终态（SUCCEEDED/FAILED/CANCELLED/NEEDS_REVIEW）且尚无 finished_at 时自动补。
 * @param {object} ctx
 * @param {string} id
 * @param {string} status
 * @param {object} [extra] 额外字段（result_asset_ids/error/quality_report_id 等）；忽略其中的 status/task_id
 * @returns {Promise<void>}
 */
async function updateStatus(ctx, id, status, extra = {}) {
  const { perTaskChains, withChain } = ctx;
  return withChain(perTaskChains, id, async () => {
    const task = await readTask(ctx, id);
    if (!task) throw new Error(`updateStatus: task not found: ${id}`);
    task.status = status;
    task.updated_at = new Date().toISOString();
    if (TERMINAL_STATES.has(status) && !task.finished_at) {
      task.finished_at = task.updated_at;
    }
    if (extra && typeof extra === "object") {
      for (const [k, v] of Object.entries(extra)) {
        if (k === "status" || k === "task_id") continue;
        task[k] = v;
      }
    }
    await writeTaskFileAndIndex(ctx, task);
  });
}

/**
 * 列出任务（索引摘要级）。index 缺失/损坏时自动重建。
 * @param {object} ctx
 * @param {object} [filter] { status?: string|string[], created_after?: string|Date, limit?: number }
 * @returns {Promise<Array<{id,status,created_at,updated_at,finished_at}>>}
 */
async function listTasks(ctx, filter = {}) {
  const index = await ensureIndex(ctx); // 缺失/损坏则重建
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
 * 强制重建 index（供启动恢复或人工修复调用）。
 * @param {object} ctx
 * @returns {Promise<object>}
 */
async function rebuildIndexForStore(ctx) {
  const { indexChains, withChain, INDEX_KEY } = ctx;
  return withChain(indexChains, INDEX_KEY, () => rebuildIndex(ctx));
}

/**
 * 工厂：创建一个绑定到指定 tasksDir 的通用任务存储实例。
 * 每个实例持有独立的串行化链（新旧业务物理隔离，不共用索引文件）。
 * @param {{ tasksDir: string }} options tasksDir 为任务 .json 与 index.json 的存放目录
 * @returns {{ readTask, writeTask, appendAttempt, updateStatus, listTasks, rebuildIndexForStore, tasksDir }}
 */
export function createTaskStore(options) {
  if (!options || !options.tasksDir) {
    throw new Error("createTaskStore requires { tasksDir }");
  }
  const ctx = {
    tasksDir: options.tasksDir,
    ...makeChains()
  };
  return {
    tasksDir: ctx.tasksDir,
    readTask: (id) => readTask(ctx, id),
    writeTask: (task) => writeTask(ctx, task),
    appendAttempt: (id, attempt) => appendAttempt(ctx, id, attempt),
    updateStatus: (id, status, extra) => updateStatus(ctx, id, status, extra),
    listTasks: (filter) => listTasks(ctx, filter),
    rebuildIndexForStore: () => rebuildIndexForStore(ctx)
  };
}

export { TERMINAL_STATES };
