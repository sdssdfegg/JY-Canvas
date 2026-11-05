// 图片版本数据层（P2-3）：零依赖叶子。
//
// 设计约束（与 garment-profile-store.js / task-store.js 同源纪律）：
//   1. 零依赖叶子 —— 本模块可能被启动/恢复链路在启动期 import。
//      任何"特性模块群"依赖都会在 rollup 打包后触发初始化期 TDZ（V121-R2 铁律），
//      因此只 import node 内置与 server/core/app-paths.js（app-paths 自身零副作用、纯同步路径计算）。
//      ⚠️ 扩展名判定等辅助逻辑一律写成模块内私有函数，不得 import server/core/file-naming.js 等特性模块。
//   2. 版本不可变：每个编辑轮次写一个新 <version_id>.json，旧版本文件只增不改、不删。
//   3. 原子写：临时文件 + rename 覆盖，沿用 task-store.js / garment-profile-store.js 的写法。
//   4. 索引单写入器串行化：index.json 变更经一个 Promise 链（全模块共享 INDEX_KEY），防并发写坏。
//   5. 索引损坏容错：主文件 JSON.parse 失败时回退 .bak；两者皆坏则扫目录重建。
//   6. 🔴 用户资产红线：图片版本记录属用户有意资产（每条对应一次真实出图/编辑轮次）。
//      - user_accepted 只能由 setUserAccepted 显式设置；updateImageVersion 的 patch 即使带了它也会被强制丢弃，绝不静默覆盖。
//      - execution_params 中的敏感键（API Key / 口令 / 私钥 / token 等）在写入前强制作废，读回不得命中。
//   7. 🔴 引用失效红线：result_asset_ref 与 input_asset_refs 只是引用，不落 buffer，资产可能因 TTL 清理而失效。
//
// 本模块只负责持久化与只读查询，不接 UI、不接路由、不碰生成链路、不改任何现有接口输出。

import { mkdir, readFile, writeFile, rename, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { aiTryonImageVersionsDir } from "../core/app-paths.js";

const VALID_STATUS = new Set(["pending", "succeeded", "failed"]);
const SENSITIVE_KEY_RE = /(api[_-]?key)|(apikey)|(password)|(passwd)|(secret)|(private[_-]?key)|(access[_-]?key)|(token)|(credential)/i;

function safeVersionId(id) {
  const raw = id == null ? "" : String(id);
  if (raw.length === 0) throw new Error("invalid version_id: empty");
  const backslash = String.fromCharCode(92);
  if (raw.split("").some((c) => c.charCodeAt(0) < 32)) throw new Error("invalid version_id: control char not allowed: " + JSON.stringify(id));
  if (raw.includes("/") || raw.includes(backslash) || raw.includes("..")) throw new Error("invalid version_id: separator or dot-dot not allowed: " + JSON.stringify(id));
  if (path.isAbsolute(raw)) throw new Error("invalid version_id: absolute path not allowed: " + JSON.stringify(id));
  const cleaned = raw.trim();
  if (cleaned.length === 0) throw new Error("invalid version_id: empty after trim: " + JSON.stringify(id));
  return cleaned.length > 180 ? cleaned.slice(0, 180) : cleaned;
}

function stripSensitiveKeys(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripSensitiveKeys(item));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    out[k] = stripSensitiveKeys(v);
  }
  return out;
}

function normalizeAssetRef(ref) {
  if (!ref || typeof ref !== "object") return { type: null, ref: null, name: null, bytes: null };
  return {
    type: ref.type != null ? String(ref.type) : null,
    ref: ref.ref != null ? String(ref.ref) : null,
    name: ref.name != null ? String(ref.name) : null,
    bytes: typeof ref.bytes === "number" ? ref.bytes : null
  };
}

function versionFilePath(id) {
  return path.join(aiTryonImageVersionsDir, safeVersionId(id) + ".json");
}
function indexFilePath() {
  return path.join(aiTryonImageVersionsDir, "index.json");
}
function indexBakFilePath() {
  return indexFilePath() + ".bak";
}

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

async function atomicWrite(file, dataObj) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(dataObj, null, 2), "utf8");
  await rename(tmp, file);
}

async function pathExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readVersionFile(id) {
  const file = versionFilePath(id);
  const raw = await readFile(file, "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeIndex(index) {
  const file = indexFilePath();
  const current = await readFile(file, "utf8").catch(() => null);
  if (current !== null) {
    await writeFile(indexBakFilePath(), current, "utf8").catch(() => {});
  }
  await atomicWrite(file, index);
}

async function ensureIndex() {
  const raw = await readFile(indexFilePath(), "utf8").catch(() => null);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.versions) return parsed;
    } catch {
      // 主文件损坏则尝试 .bak
    }
  }
  const bak = await readFile(indexBakFilePath(), "utf8").catch(() => null);
  if (bak !== null) {
    try {
      const parsed = JSON.parse(bak);
      if (parsed && parsed.versions) return parsed;
    } catch {
      // 两者皆坏则重建
    }
  }
  return rebuildImageVersionIndex();
}

function nextSeqFromIndex(index) {
  let max = 0;
  for (const v of Object.values(index.versions || {})) {
    if (typeof v.version === "number" && v.version > max) max = v.version;
  }
  return max + 1;
}

function summarize(record) {
  return {
    version_id: record.version_id,
    version: record.version,
    task_id: record.task_id,
    parent_version_id: record.parent_version_id,
    status: record.status,
    created_at: record.created_at,
    user_accepted: record.user_accepted,
    has_result: Boolean(record.result_asset_ref)
  };
}

function buildRecord(input, versionId, seq, now) {
  return {
    version_id: versionId,
    version: seq,
    task_id: input.task_id != null ? String(input.task_id) : null,
    parent_version_id: input.parent_version_id != null ? safeVersionId(input.parent_version_id) : null,
    input_asset_refs: Array.isArray(input.input_asset_refs) ? input.input_asset_refs.map(normalizeAssetRef) : [],
    result_asset_ref: input.result_asset_ref != null ? String(input.result_asset_ref) : null,
    user_instruction: input.user_instruction != null ? String(input.user_instruction) : null,
    structured_edit_goal: input.structured_edit_goal != null ? input.structured_edit_goal : null,
    model_and_versions: input.model_and_versions != null ? input.model_and_versions : null,
    execution_params: stripSensitiveKeys(input.execution_params != null ? input.execution_params : null),
    created_at: now,
    status: input.status && VALID_STATUS.has(input.status) ? input.status : "pending",
    error: input.error != null ? String(input.error) : null,
    user_accepted: input.user_accepted === true
  };
}

async function commitRecord(record) {
  await atomicWrite(versionFilePath(record.version_id), record);
  await withChain(indexChains, INDEX_KEY, async () => {
    const index = await ensureIndex();
    index.versions = index.versions || {};
    index.versions[record.version_id] = summarize(record);
    await writeIndex(index);
  });
  return record;
}

/**
 * 创建（追加）一个图片版本。version_id 已存在则抛错（不做隐式覆盖/升版）。
 */
export async function appendImageVersion(input = {}) {
  const requestedId = input.version_id != null ? input.version_id : randomUUID();
  const versionId = safeVersionId(requestedId);
  return withChain(indexChains, INDEX_KEY, async () => {
    const existing = await readVersionFile(versionId);
    if (existing) throw new Error("appendImageVersion: version already exists: " + versionId);
    const index = await ensureIndex();
    const seq = nextSeqFromIndex(index);
    const now = new Date().toISOString();
    const record = buildRecord(input, versionId, seq, now);
    await atomicWrite(versionFilePath(record.version_id), record);
    index.versions = index.versions || {};
    index.versions[record.version_id] = summarize(record);
    await writeIndex(index);
    return record;
  });
}

/**
 * 改版（不可变存储）：生成新 version_id 的新版本文件，旧版本文件不动。
 * 红线：patch 中的 version_id / version / created_at / parent_version_id / user_accepted 一律被剥离。
 */
export async function updateImageVersion(versionId, patch = {}) {
  const sid = safeVersionId(versionId);
  return withChain(indexChains, INDEX_KEY, async () => {
    const current = await readVersionFile(sid);
    if (!current) throw new Error("updateImageVersion: version not found: " + sid);
    const clean = { ...patch };
    delete clean.version_id;
    delete clean.version;
    delete clean.created_at;
    delete clean.parent_version_id;
    delete clean.user_accepted;
    if (clean.execution_params != null) clean.execution_params = stripSensitiveKeys(clean.execution_params);
    const index = await ensureIndex();
    const seq = nextSeqFromIndex(index);
    const now = new Date().toISOString();
    const record = {
      ...current,
      ...clean,
      version_id: randomUUID(),
      version: seq,
      created_at: now,
      parent_version_id: current.version_id,
      user_accepted: current.user_accepted,
      execution_params: stripSensitiveKeys(clean.execution_params != null ? clean.execution_params : (current.execution_params ?? null))
    };
    await atomicWrite(versionFilePath(record.version_id), record);
    index.versions = index.versions || {};
    index.versions[record.version_id] = summarize(record);
    await writeIndex(index);
    return record;
  });
}

/**
 * 唯一允许设置 user_accepted 的显式接口。任何生成结果/导入通道都不得经其它方式覆盖。
 */
export async function setUserAccepted(versionId, accepted) {
  const sid = safeVersionId(versionId);
  return withChain(indexChains, INDEX_KEY, async () => {
    const current = await readVersionFile(sid);
    if (!current) throw new Error("setUserAccepted: version not found: " + sid);
    const index = await ensureIndex();
    const seq = nextSeqFromIndex(index);
    const now = new Date().toISOString();
    const record = {
      ...current,
      version_id: randomUUID(),
      version: seq,
      created_at: now,
      parent_version_id: current.version_id,
      user_accepted: accepted === true
    };
    await atomicWrite(versionFilePath(record.version_id), record);
    index.versions = index.versions || {};
    index.versions[record.version_id] = summarize(record);
    await writeIndex(index);
    return record;
  });
}

/**
 * 读取单个版本。
 */
export async function readImageVersion(versionId) {
  return readVersionFile(safeVersionId(versionId));
}

/**
 * 列出版本（索引摘要级）。index 缺失/损坏时自动重建。
 */
export async function listImageVersions(filter = {}) {
  const index = await ensureIndex();
  let entries = Object.values(index.versions || {});
  if (filter.status) {
    const set = new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    entries = entries.filter((e) => set.has(e.status));
  }
  if (filter.task_id != null) {
    const tid = String(filter.task_id);
    entries = entries.filter((e) => e.task_id === tid);
  }
  return entries;
}

/**
 * 读取父链（线性跟随 parent_version_id 直到根；不实现树遍历/比较/回退）。
 */
export async function readParentChain(versionId) {
  const sid = safeVersionId(versionId);
  const chain = [];
  const seen = new Set();
  let cur = await readVersionFile(sid);
  while (cur && !seen.has(cur.version_id)) {
    seen.add(cur.version_id);
    chain.unshift(cur);
    if (!cur.parent_version_id) break;
    cur = await readVersionFile(safeVersionId(cur.parent_version_id));
  }
  return chain;
}

/**
 * 强制重建 index（供启动恢复或人工修复调用）。
 * 注意：本函数不套 withChain(indexChains)，否则会在 ensureIndex 的链槽内自我死锁。
 */
export async function rebuildImageVersionIndex() {
  await mkdir(aiTryonImageVersionsDir, { recursive: true });
  const files = (await readdir(aiTryonImageVersionsDir).catch(() => [])).filter((name) => {
    if (name === "index.json" || name === "index.json.bak") return false;
    return name.endsWith(".json");
  });
  const versions = {};
  await Promise.all(
    files.map(async (name) => {
      const id = name.slice(0, -5);
      const rec = await readVersionFile(id);
      if (rec && rec.version_id) versions[rec.version_id] = summarize(rec);
    })
  );
  const index = { version: 1, versions, rebuilt_at: new Date().toISOString() };
  await writeIndex(index);
  return index;
}
