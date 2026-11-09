// server/features/detail-studio/project-store.js
// 阶段 1：详情创作「项目」持久化（服务端 truth 源）。
//
// 纪律：
// - 保持「零依赖叶子」：只 import node 内置模块 + server/core/app-paths.js，
//   与 server/ai-tryon/task-store.js 同口径，避免 public 生产构建初始化期 TDZ 白屏。
// - 本期不抽取、不修改 server/ai-tryon/task-store.js：R2 授权的通用任务层留阶段 4
//   （任务管理阶段）落地并单独验证旧换装兼容，避免为基础建设动到稳定运行的换装任务管理。
// - 项目数据只落 data/detail-studio/projects/：不进 data/results（7 天 TTL 清理）、
//   不进 seed/manifest.json、不进安装包种子（封装红线②）。
// - 原子写（tmp + rename）+ .bak 损坏回退 + index.json 单写入器链。

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../../../core/app-paths.js";

export const DETAIL_STUDIO_PROJECTS_DIR = path.join(dataDir, "detail-studio", "projects");
export const DETAIL_STUDIO_SCHEMA_VERSION = 1;
export const DETAIL_STUDIO_MODES = ["guided", "assisted", "direct"];

const INDEX_FILE = path.join(DETAIL_STUDIO_PROJECTS_DIR, "index.json");
const PROJECT_FILE_NAME = "project.json";
const MAX_NAME_LENGTH = 80;
const MAX_NOTE_LENGTH = 2000;
const PROJECT_STATUSES = ["draft", "active", "archived"];

function safeProjectId(value) {
  const raw = String(value || "");
  return /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? raw : "";
}

function cleanText(value, limit) {
  return String(value == null ? "" : value).trim().slice(0, limit);
}

function nowIso() {
  return new Date().toISOString();
}

function projectFilePath(id) {
  return path.join(DETAIL_STUDIO_PROJECTS_DIR, id, PROJECT_FILE_NAME);
}

async function readJsonWithBackup(file, fallback) {
  for (const source of [file, file + ".bak"]) {
    const text = await readFile(source, "utf8").catch(() => null);
    if (!text) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (parsed !== null && typeof parsed === "object") return parsed;
  }
  return fallback;
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  if (existsSync(file)) {
    const previous = await readFile(file).catch(() => null);
    if (previous) {
      await writeFile(file + ".bak", previous).catch(() => null);
    }
  }
  const temporary = file + "." + process.pid + "." + Date.now() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
    await rename(temporary, file);
  } catch (error) {
    await writeFile(temporary, "", "utf8").catch(() => null);
    throw error;
  }
}

// 所有 index.json 读写串行化，避免并发请求写坏索引。
let indexWriteChain = Promise.resolve();
function withIndexWrite(task) {
  const result = indexWriteChain.then(task, task);
  indexWriteChain = result.catch(() => null);
  return result;
}

async function loadIndex() {
  const index = await readJsonWithBackup(INDEX_FILE, { version: 1, projects: [] });
  return {
    version: DETAIL_STUDIO_SCHEMA_VERSION,
    projects: Array.isArray(index.projects) ? index.projects : []
  };
}

function indexEntry(project) {
  return {
    id: project.id,
    name: project.name,
    mode: project.mode,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

export async function listDetailStudioProjects() {
  return withIndexWrite(async () => loadIndex());
}

export async function getDetailStudioProject(id) {
  const safeId = safeProjectId(id);
  if (!safeId) return null;
  const project = await readJsonWithBackup(projectFilePath(safeId), null);
  if (!project || project.id !== safeId) return null;
  return project;
}

export async function createDetailStudioProject(input = {}) {
  const name = cleanText(input.name, MAX_NAME_LENGTH);
  if (!name) throw new Error("项目名称不能为空");
  const mode = DETAIL_STUDIO_MODES.includes(input.mode) ? input.mode : "guided";
  const timestamp = nowIso();
  const id = "ds_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  const project = {
    schemaVersion: DETAIL_STUDIO_SCHEMA_VERSION,
    id,
    name,
    mode,
    note: cleanText(input.note, MAX_NOTE_LENGTH),
    status: "draft",
    currentPlanRunId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return withIndexWrite(async () => {
    await writeJsonAtomic(projectFilePath(id), project);
    const index = await loadIndex();
    index.projects = [indexEntry(project), ...index.projects.filter((item) => item && item.id !== id)];
    await writeJsonAtomic(INDEX_FILE, index);
    return project;
  });
}

export async function updateDetailStudioProject(id, patch = {}) {
  const safeId = safeProjectId(id);
  if (!safeId) throw new Error("项目 id 非法");
  return withIndexWrite(async () => {
    const project = await readJsonWithBackup(projectFilePath(safeId), null);
    if (!project || project.id !== safeId) return null;
    // 只允许改基础信息：mode / id / createdAt 一律不可变（三种模式硬隔离）。
    if (Object.prototype.hasOwnProperty.call(patch, "name")) {
      const name = cleanText(patch.name, MAX_NAME_LENGTH);
      if (!name) throw new Error("项目名称不能为空");
      project.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "note")) {
      project.note = cleanText(patch.note, MAX_NOTE_LENGTH);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "status")) {
      const status = cleanText(patch.status, 32);
      if (PROJECT_STATUSES.includes(status)) project.status = status;
    }
    project.updatedAt = nowIso();
    await writeJsonAtomic(projectFilePath(safeId), project);
    const index = await loadIndex();
    index.projects = index.projects.map((item) =>
      item && item.id === safeId ? indexEntry(project) : item
    );
    await writeJsonAtomic(INDEX_FILE, index);
    return project;
  });
}
