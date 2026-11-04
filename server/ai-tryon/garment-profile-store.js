// 服装档案存储层（P2-1）：零依赖叶子。
//
// 设计约束（与 task-store.js 同源纪律）：
//   1. 零依赖叶子 —— 本模块可能被 P3 恢复/启动链路在启动期 import。
//      任何"特性模块群"依赖都会在 rollup 打包后触发初始化期 TDZ（V121-R2 铁律），
//      因此只 import node 内置与 server/core/app-paths.js（app-paths 自身零副作用、纯同步路径计算）。
//      ⚠️ 扩展名判定等辅助逻辑一律写成模块内私有函数，**不得 import server/core/file-naming.js 等特性模块**，
//         否则会污染启动链路、且违反本模块"import 白名单仅 Node 内置 + app-paths.js"的静态钉桩。
//   2. 版本不可变：每次修改升版写新 profile-v<n>.json，旧版本文件**只增不改、不删**。
//   3. 原子写：临时文件 + rename 覆盖，沿用 task-store.js 的写法。
//   4. 索引单写入器串行化：index.json 变更经一个 Promise 链，防并发写坏。
//   5. 索引损坏容错：主文件 JSON.parse 失败时回退 .bak；两者皆坏则扫目录重建。
//   6. 🔴 用户资产红线：档案与基准图属用户资产。
//      - approved_baseline_asset_id 只能由 setApprovedBaseline 显式设置；
//      - updateGarmentProfile 的 patch 中即使带了 approved_baseline_asset_id 也会被强制剥离（绝不静默覆盖）。
//      - 本模块不提供任何删除接口；清理白名单天然不含本目录。
//
// 本模块只负责持久化与读写，不接 UI、不接路由、不碰生成链路、不改任何现有接口输出。
// 字段全集以 contracts/garment-profile.md §1（contract-v1）为准，本单冻结字段、不改契约。

import { mkdir, readFile, writeFile, rename, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { aiTryonGarmentsDir } from "../core/app-paths.js";

const VALID_STATUS = new Set(["draft", "confirmed", "archived"]);

// ── 文件名安全化（不引入额外依赖，内联防卫）──────────────────────────────
// 与 task-store.js:23-30 同源规则：去空字节、路径分隔换 "_"、限长 180。
function safeFileName(id) {
  const cleaned = String(id == null ? "" : id)
    .replace(/\u0000/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  if (!cleaned) throw new Error(`invalid garment_profile_id: ${JSON.stringify(id)}`);
  return cleaned.slice(0, 180);
}

function profileDir(id) {
  return path.join(aiTryonGarmentsDir, safeFileName(id));
}
function profileFilePath(id, version) {
  return path.join(profileDir(id), `profile-v${version}.json`);
}
function assetsDir(id) {
  return path.join(profileDir(id), "assets");
}
function indexFilePath() {
  return path.join(aiTryonGarmentsDir, "index.json");
}
function indexBakFilePath() {
  return `${indexFilePath()}.bak`;
}

// ── 串行化队列（防并发写坏）──────────────────────────────────────────────
// 每档案一个链（同 id 的多次写串行），全局索引一个链（index 是共享文件）。
// withChain 返回 fn 的真实结果（含拒绝），同时把"已 settled"的版本存入 map 续接，
// 保证单个失败不阻断后续写；当本链成为最新时清理 Map 条目，避免无限增长。
const perProfileChains = new Map();
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

// ── 私有辅助：MIME → 扩展名（内联，避免 import file-naming.js 破坏零依赖叶子）──
// 判定顺序：先信 mimeType，再退回 URL 后缀；兜底 png（历史上扩展名缺失导致加载失败比判错更糟）。
function imageExtensionFromType(mimeType, fallbackUrl = "") {
  const lower = String(mimeType || "").toLowerCase();
  if (lower.includes("jpeg")) return "jpg";
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  let pathname = String(fallbackUrl || "image.png");
  try {
    pathname = new URL(fallbackUrl || "https://local/image.png", "https://local").pathname;
  } catch {
    pathname = String(fallbackUrl || "image.png");
  }
  const ext = path.extname(pathname).replace(".", "").toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "png";
}

async function pathExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

// 重名不覆盖：加 _2 / _3 后缀（与 file-naming.uniqueFilePath 同口径）。
async function uniqueAssetPath(directory, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(directory, filename);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(directory, `${base}_${index}${ext}`);
    index += 1;
  }
  return candidate;
}

// 拒绝路径穿越/非法资产 id（红线：用户资产不得被写入越界路径）。
function safeAssetId(assetId) {
  const cleaned = String(assetId == null ? "" : assetId)
    .replace(/\u0000/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/\.\.+/g, "_")
    .trim();
  if (!cleaned) throw new Error(`invalid asset_id: ${JSON.stringify(assetId)}`);
  return cleaned.slice(0, 180);
}

// ── 摘要 ──────────────────────────────────────────────────────────────────
function summarize(profile) {
  return {
    id: profile.garment_profile_id,
    version: profile.version ?? 1,
    status: profile.status ?? "draft",
    created_at: profile.created_at ?? null,
    updated_at: profile.updated_at ?? null,
    approved_baseline_asset_id: profile.approved_baseline_asset_id ?? null,
    reference_asset_count: Array.isArray(profile.reference_assets) ? profile.reference_assets.length : 0
  };
}

// ── 索引读写 ──────────────────────────────────────────────────────────────
async function readProfileFile(id, version) {
  const file = profileFilePath(id, version);
  const raw = await readFile(file, "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 写前备份上一版索引（主文件损坏时回退 .bak）。
async function writeIndex(index) {
  const file = indexFilePath();
  const current = await readFile(file, "utf8").catch(() => null);
  if (current !== null) {
    await writeFile(indexBakFilePath(), current, "utf8").catch(() => {});
  }
  await atomicWrite(file, index);
}

// 读 index：缺失或主文件损坏 → 回退 .bak；两者皆坏 → 重建。
async function ensureIndex() {
  const raw = await readFile(indexFilePath(), "utf8").catch(() => null);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.garments) return parsed;
    } catch {
      // 主文件损坏 → 下方尝试 .bak
    }
  }
  const bak = await readFile(indexBakFilePath(), "utf8").catch(() => null);
  if (bak !== null) {
    try {
      const parsed = JSON.parse(bak);
      if (parsed && parsed.garments) return parsed;
    } catch {
      // 两者皆坏 → 重建
    }
  }
  return rebuildGarmentIndex();
}

async function upsertIndex(profile) {
  const index = await ensureIndex();
  index.garments = index.garments || {};
  index.garments[profile.garment_profile_id] = summarize(profile);
  await writeIndex(index);
}

// ── 档案文件写（含索引更新；调用方负责 perProfileChain 串行化）────────────
async function writeProfileFileAndIndex(profile) {
  await atomicWrite(profileFilePath(profile.garment_profile_id, profile.version), profile);
  await withChain(indexChains, INDEX_KEY, async () => {
    await upsertIndex(profile);
  });
}

// ── 导出 API ──────────────────────────────────────────────────────────────
/**
 * 创建一个服装档案（draft，version=1）。id 已存在则抛错（不做隐式覆盖/升版）。
 * @param {object} [input]
 * @returns {Promise<object>}
 */
export async function createGarmentProfile(input = {}) {
  const id = safeFileName(input.garment_profile_id || randomUUID());
  return withChain(perProfileChains, id, async () => {
    const existing = await readProfileFile(id, 1).catch(() => null);
    if (existing) throw new Error(`createGarmentProfile: profile already exists: ${id}`);
    const now = new Date().toISOString();
    const profile = {
      garment_profile_id: id,
      version: 1,
      status: input.status && VALID_STATUS.has(input.status) ? input.status : "draft",
      created_at: now,
      updated_at: now,
      reference_assets: Array.isArray(input.reference_assets) ? input.reference_assets : [],
      color_profile: input.color_profile ?? null,
      fit_type: input.fit_type ?? {
        value: "unknown",
        autoDetected: false,
        humanCorrected: false,
        correctedBy: null,
        correctedAt: null
      },
      garment_attributes: input.garment_attributes ?? {},
      region_assets: Array.isArray(input.region_assets) ? input.region_assets : [],
      approved_baseline_asset_id: input.approved_baseline_asset_id ?? null,
      notes: input.notes ?? ""
    };
    await writeProfileFileAndIndex(profile);
    return profile;
  });
}

/**
 * 读取一个档案。省略 version 读最新（按索引最新版本）；指定 version 读该版本快照。
 * @param {string} id
 * @param {number} [version]
 * @returns {Promise<object|null>}
 */
export async function readGarmentProfile(id, version) {
  const sid = safeFileName(id);
  if (version != null) {
    return readProfileFile(sid, version);
  }
  const index = await ensureIndex();
  const summary = index.garments ? index.garments[sid] : null;
  if (!summary) return null;
  return readProfileFile(sid, summary.version);
}

/**
 * 改版：生成 v<n+1>，旧版本文件不动。
 * 🔴 红线1：patch 中的 approved_baseline_asset_id / garment_profile_id / version / created_at
 *    一律被剥离——基准只能由 setApprovedBaseline 显式设置，绝不允许通过补丁静默覆盖。
 * @param {string} id
 * @param {object} [patch]
 * @returns {Promise<object>}
 */
export async function updateGarmentProfile(id, patch = {}) {
  const sid = safeFileName(id);
  return withChain(perProfileChains, sid, async () => {
    const current = await readGarmentProfile(sid);
    if (!current) throw new Error(`updateGarmentProfile: profile not found: ${sid}`);
    const cleanPatch = { ...patch };
    // 受保护字段：不得经此通道修改（基线由 setApprovedBaseline 管；其余为系统字段）。
    delete cleanPatch.garment_profile_id;
    delete cleanPatch.version;
    delete cleanPatch.created_at;
    delete cleanPatch.approved_baseline_asset_id;
    const now = new Date().toISOString();
    const next = {
      ...current,
      ...cleanPatch,
      garment_profile_id: sid,
      version: current.version + 1,
      created_at: current.created_at,
      updated_at: now,
      approved_baseline_asset_id: current.approved_baseline_asset_id
    };
    await writeProfileFileAndIndex(next);
    return next;
  });
}

/**
 * 列出档案（索引摘要级）。index 缺失/损坏时自动重建。
 * @param {object} [filter] { status?: string|string[] }
 * @returns {Promise<Array<object>>}
 */
export async function listGarmentProfiles(filter = {}) {
  const index = await ensureIndex();
  let entries = Object.values(index.garments || {});
  if (filter.status) {
    const set = new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);
    entries = entries.filter((e) => set.has(e.status));
  }
  return entries;
}

/**
 * 🔴 唯一允许设置基准的显式接口。任何生成结果/导入/迁移通道都不得调用其它方式覆盖基准。
 * @param {string} id
 * @param {string} assetId
 * @returns {Promise<object>}
 */
export async function setApprovedBaseline(id, assetId) {
  const sid = safeFileName(id);
  if (!assetId) throw new Error("setApprovedBaseline requires a non-empty assetId");
  return withChain(perProfileChains, sid, async () => {
    const current = await readGarmentProfile(sid);
    if (!current) throw new Error(`setApprovedBaseline: profile not found: ${sid}`);
    const now = new Date().toISOString();
    const next = {
      ...current,
      version: current.version + 1,
      updated_at: now,
      approved_baseline_asset_id: safeAssetId(assetId)
    };
    await writeProfileFileAndIndex(next);
    return next;
  });
}

/**
 * 落盘一张标准参考图资产。mimeType → 扩展名；重名自动加后缀不覆盖；路径穿越输入被拒。
 * 仅负责字节落盘与返回 asset_id，不直接写入 profile.reference_assets（由上层 UI/后续单经 update 登记）。
 * @param {string} id
 * @param {Buffer|Uint8Array} buffer
 * @param {string} mimeType
 * @param {object} [meta] { asset_id?: string }
 * @returns {Promise<{asset_id: string, file: string}>}
 */
export async function saveGarmentAsset(id, buffer, mimeType, meta = {}) {
  const sid = safeFileName(id);
  // 🔴 红线：路径穿越/绝对路径类 asset_id 直接拒绝（不中和、不落盘）。
  //    防止"../evil"或绝对路径污染用户资产目录或越界写。
  const rawId = meta.asset_id;
  if (rawId != null) {
    const s = String(rawId);
    if (/[\\/]/.test(s) || /\.\./.test(s) || path.isAbsolute(s)) {
      throw new Error(`saveGarmentAsset: invalid asset_id (path traversal not allowed): ${JSON.stringify(rawId)}`);
    }
  }
  const dir = assetsDir(sid);
  await mkdir(dir, { recursive: true });
  const ext = imageExtensionFromType(mimeType);
  const proposedId = safeAssetId(rawId || randomUUID());
  const candidate = await uniqueAssetPath(dir, `${proposedId}.${ext}`);
  // flag:"wx" 双保险：即便 uniqueAssetPath 竞态，已存在也直接失败而非静默覆盖。
  await writeFile(candidate, buffer, { flag: "wx" });
  const assetId = path.basename(candidate, path.extname(candidate));
  return { asset_id: assetId, file: candidate };
}

/**
 * 强制重建 index（供启动恢复或人工修复调用）。
 * @returns {Promise<object>}
 */
// 注意：本函数**不**套 withChain(indexChains) —— 它会被 ensureIndex 在「外层 indexChains 槽位内」
// 调用（upsertIndex 路径），若再自我获取同 key 链会死锁（同 task-store.rebuildIndex 直接写、不套链）。
// 独立调用时靠 atomicWrite 的单文件原子性保证安全；罕见的并发重建由「最后写入者胜」兜底，不锁。
export async function rebuildGarmentIndex() {
  await mkdir(aiTryonGarmentsDir, { recursive: true });
  const dirs = (await readdir(aiTryonGarmentsDir).catch(() => [])).filter(
    (name) => {
      if (name === "index.json" || name === "index.json.bak" || name.startsWith(".")) return false;
      return true;
    }
  );
  const garments = {};
  await Promise.all(
    dirs.map(async (dir) => {
      const files = (await readdir(path.join(aiTryonGarmentsDir, dir)).catch(() => [])).filter(
        (name) => /^profile-v(\d+)\.json$/.test(name)
      );
      if (files.length === 0) return;
      let maxV = 0;
      for (const f of files) {
        const m = /^profile-v(\d+)\.json$/.exec(f);
        const v = Number(m[1]);
        if (v > maxV) maxV = v;
      }
      const profile = await readProfileFile(dir, maxV);
      if (profile) garments[dir] = summarize(profile);
    })
  );
  const index = { version: 1, garments, rebuilt_at: new Date().toISOString() };
  await writeIndex(index);
  return index;
}
