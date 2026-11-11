// server/features/detail-studio/project-store.js
// 阶段 2：详情创作「项目」持久化（服务端 truth 源，schema v2）。
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
export const DETAIL_STUDIO_ASSETS_DIR = path.join(dataDir, "detail-studio", "assets");
export const DETAIL_STUDIO_SCHEMA_VERSION = 2;
export const DETAIL_STUDIO_MODES = ["guided", "assisted", "direct"];

// §4 参考图职责：与前端 src/features/detail-studio/constants/workspace-contract.js#STUDIO_REFERENCE_ROLES 同源。
// 后端 store 侧独立维护一份，避免跨树 import 破坏「零依赖叶子」约束。
export const DETAIL_STUDIO_REFERENCE_ROLES = ["product", "visualStyle", "contentStructure"];

const REFERENCE_IMAGE_LIMIT = 60;
const REFERENCE_LABEL_LIMIT = 120;
const MODE_C_TEXT_LIMIT = 60000;

// 模式 C 边界（重点 A ④）：rawPrompt 一经写入即只读；tidyVersion / diff 可选；frozenPrompt 仅在用户确认后设定。
function sanitizeModeC(input, previous) {
  const base = previous && typeof previous === "object" ? previous : {
    rawPrompt: "", tidyVersion: null, diff: null, frozenPrompt: "", frozenAt: null
  };
  const value = input && typeof input === "object" ? input : {};
  const rawPrompt = base.rawPrompt
    ? base.rawPrompt
    : String(value.rawPrompt == null ? "" : value.rawPrompt).slice(0, MODE_C_TEXT_LIMIT);
  return {
    rawPrompt,
    tidyVersion: value.tidyVersion == null ? (base.tidyVersion ?? null) : String(value.tidyVersion).slice(0, MODE_C_TEXT_LIMIT),
    diff: value.diff == null ? (base.diff ?? null) : value.diff,
    frozenPrompt: String(value.frozenPrompt == null ? (base.frozenPrompt || "") : value.frozenPrompt).slice(0, MODE_C_TEXT_LIMIT),
    frozenAt: value.frozenAt == null ? (base.frozenAt || null) : value.frozenAt
  };
}

function isValidReferenceImage(item) {
  return Boolean(item && typeof item === "object" && typeof item.filename === "string" && item.filename
    && DETAIL_STUDIO_REFERENCE_ROLES.includes(item.role));
}

// v1 → v2 一次性升级：补齐阶段 2 预留的四个字段，对已 v2 项目幂等。
export function migrateProject(project) {
  if (!project || typeof project !== "object") return project;
  if (project.schemaVersion === DETAIL_STUDIO_SCHEMA_VERSION) return project;
  const migrated = { ...project, schemaVersion: DETAIL_STUDIO_SCHEMA_VERSION };
  if (!Array.isArray(migrated.referenceImages)) migrated.referenceImages = [];
  if (!migrated.productData || typeof migrated.productData !== "object") {
    migrated.productData = { fields: {}, text: "" };
  }
  if (!migrated.modelConfig || typeof migrated.modelConfig !== "object") {
    migrated.modelConfig = { textModel: "", imageModel: "", channelId: "" };
  }
  if (!migrated.modeC || typeof migrated.modeC !== "object") {
    migrated.modeC = { rawPrompt: "", tidyVersion: null, diff: null, frozenPrompt: "", frozenAt: null };
  }
  // 阶段 3（详情创作规划/分屏/冻结/质检）承载区：analyze 结论、逐屏 ScreenSpec、frozenPrompt、选项溯源。
  // 与 modeC 同口径——旧字段缺失时补齐默认，已存在则保留，保证幂等。
  if (!migrated.planning || typeof migrated.planning !== "object") {
    migrated.planning = {
      analyze: null,
      appliedOptions: [],
      globalLock: "",
      industryId: "",
      screens: [],
      narrativeSummary: "",
      visualDNA: null,
      frozenPrompts: {}
    };
  }
  if (!Array.isArray(migrated.planning.appliedOptions)) migrated.planning.appliedOptions = [];
  if (!Array.isArray(migrated.planning.screens)) migrated.planning.screens = [];
  if (!migrated.planning.frozenPrompts || typeof migrated.planning.frozenPrompts !== "object") {
    migrated.planning.frozenPrompts = {};
  }
  if (migrated.planning.visualDNA == null) migrated.planning.visualDNA = null;
  if (typeof migrated.planning.narrativeSummary !== "string") migrated.planning.narrativeSummary = "";
  // 阶段 5 版本管理承载区：每屏版本链 screenVersions[] / 当前版本 currentVersionIds / 编辑线程 editThreads。
  // 旧项目缺省补齐默认；已存在则保留并补齐子字段（幂等）。读操作（getScreenVersions）无写盘副作用。
  if (!migrated.versions || typeof migrated.versions !== "object") {
    migrated.versions = defaultVersions();
  } else {
    const dv = migrated.versions;
    if (!Array.isArray(dv.screenVersions)) dv.screenVersions = [];
    if (!dv.currentVersionIds || typeof dv.currentVersionIds !== "object") dv.currentVersionIds = {};
    if (!dv.editThreads || typeof dv.editThreads !== "object") dv.editThreads = {};
  }
  return migrated;
}

// 阶段 5 版本管理默认结构（随项目落 data/detail-studio/projects/<id>/project.json 的 versions 子对象）。
// 不单独建目录、不进 data/results（7 天 TTL）/ seed / 安装包默认种子。
function defaultVersions() {
  return { screenVersions: [], currentVersionIds: {}, editThreads: {} };
}

function isValidVersionEntry(v) {
  return Boolean(v && typeof v === "object" && typeof v.versionId === "string" && v.versionId
    && Number.isInteger(v.screenIndex));
}

export function detailStudioAssetsDir(id) {
  const safeId = safeProjectId(id);
  if (!safeId) return "";
  return path.join(DETAIL_STUDIO_ASSETS_DIR, safeId);
}

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

// 通用受控写：在单写入器链内读 → migrate → mutate → 原子写 → 同步索引。
// 返回最新 project；项目不存在返回 null。版本管理等业务区经此修改 project.versions，
// 避免各自重复实现写盘与索引同步（保持唯一写入器链不变式）。
export async function mutateProject(id, mutator) {
  const safeId = safeProjectId(id);
  if (!safeId) throw new Error("项目 id 非法");
  return withIndexWrite(async () => {
    const project = migrateProject(await readJsonWithBackup(projectFilePath(safeId), null));
    if (!project || project.id !== safeId) return null;
    const next = mutator(project);
    if (!next) return project;
    next.updatedAt = nowIso();
    await writeJsonAtomic(projectFilePath(safeId), next);
    const index = await loadIndex();
    index.projects = index.projects.map((item) => (item && item.id === safeId ? indexEntry(next) : item));
    await writeJsonAtomic(INDEX_FILE, index);
    return next;
  });
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
  return migrateProject(project);
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
    modelConfig: { textModel: "", imageModel: "", channelId: "" },
    productData: { fields: {}, text: "" },
    referenceImages: [],
    modeC: { rawPrompt: "", tidyVersion: null, diff: null, frozenPrompt: "", frozenAt: null },
    planning: {
      analyze: null,
      appliedOptions: [],
      globalLock: "",
      industryId: "",
      screens: [],
      narrativeSummary: "",
      visualDNA: null,
      frozenPrompts: {}
    },
    versions: defaultVersions(),
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
    const project = migrateProject(await readJsonWithBackup(projectFilePath(safeId), null));
    if (!project || project.id !== safeId) return null;
    // 只允许改基础信息 + 阶段 2 四字段；mode / id / createdAt / schemaVersion 一律不可变（三种模式硬隔离）。
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
    if (Object.prototype.hasOwnProperty.call(patch, "modelConfig")) {
      const mc = patch.modelConfig;
      project.modelConfig = {
        textModel: String((mc && mc.textModel) || "").slice(0, 80),
        imageModel: String((mc && mc.imageModel) || "").slice(0, 80),
        channelId: String((mc && mc.channelId) || "").slice(0, 80)
      };
    }
    if (Object.prototype.hasOwnProperty.call(patch, "productData")) {
      const pd = patch.productData;
      project.productData = {
        fields: (pd && pd.fields && typeof pd.fields === "object" && !Array.isArray(pd.fields)) ? pd.fields : {},
        text: String((pd && pd.text) || "").slice(0, 20000)
      };
    }
    if (Object.prototype.hasOwnProperty.call(patch, "referenceImages")) {
      const refs = patch.referenceImages;
      project.referenceImages = Array.isArray(refs)
        ? refs.filter(isValidReferenceImage).slice(0, REFERENCE_IMAGE_LIMIT)
        : project.referenceImages;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "modeC")) {
      project.modeC = sanitizeModeC(patch.modeC, project.modeC);
    }
    // 阶段 3 规划区：analyze 结论 / 逐屏 / 冻结 / 选项溯源。受控合并，避免整体覆盖丢其它子字段。
    if (Object.prototype.hasOwnProperty.call(patch, "planning")) {
      const incoming = patch.planning;
      if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
        const prev = project.planning || {};
        project.planning = {
          analyze: incoming.analyze !== undefined ? incoming.analyze : (prev.analyze || null),
          appliedOptions: Array.isArray(incoming.appliedOptions) ? incoming.appliedOptions : (prev.appliedOptions || []),
          globalLock: String(incoming.globalLock != null ? incoming.globalLock : (prev.globalLock || "")),
          industryId: String(incoming.industryId != null ? incoming.industryId : (prev.industryId || "")),
          screens: Array.isArray(incoming.screens) ? incoming.screens : (prev.screens || []),
          narrativeSummary: String(incoming.narrativeSummary != null ? incoming.narrativeSummary : (prev.narrativeSummary || "")),
          visualDNA: incoming.visualDNA !== undefined ? incoming.visualDNA : (prev.visualDNA || null),
          frozenPrompts: (incoming.frozenPrompts && typeof incoming.frozenPrompts === "object")
            ? incoming.frozenPrompts
            : (prev.frozenPrompts || {})
        };
      }
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

// §4 参考图专用上传落盘：落 data/detail-studio/assets/<id>/，并把条目追加进 project.referenceImages。
// 只接受已校验的合法条目（见 isValidReferenceImage）；落盘与索引更新都在单写入器链内串行化。
export async function appendReferenceImage(id, entry) {
  const safeId = safeProjectId(id);
  if (!safeId) throw new Error("项目 id 非法");
  if (!isValidReferenceImage(entry)) throw new Error("参考图条目非法");
  return withIndexWrite(async () => {
    const project = migrateProject(await readJsonWithBackup(projectFilePath(safeId), null));
    if (!project || project.id !== safeId) return null;
    const list = Array.isArray(project.referenceImages) ? project.referenceImages : [];
    project.referenceImages = [...list, entry].slice(-REFERENCE_IMAGE_LIMIT);
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
