// 详情创作「单屏连续编辑与版本管理」业务层（V204 阶段 5 · versions 业务区）。
//
// 职责：版本元数据、版本链、编辑线程的语义操作；所有落盘经 project-store 的 mutateProject
// （唯一写入器链），保证与项目其它字段的写盘 / 索引同步一致，读操作无写盘副作用。
//
// 数据模型（落 project.versions，随项目存于 data/detail-studio/projects/<id>/project.json）：
//   screenVersions[] : 所有屏的版本链扁平数组，每版字段见 §2（versionId / screenIndex /
//                       imagePath / prompt / sourceTaskId / parentVersionId / editNote /
//                       editThreadRef / generationContext / createdAt / isCurrent / status）
//   currentVersionIds : { [screenIndex]: versionId } 每屏当前选定版本
//   editThreads       : { [screenIndex]: EditRound[] } 连续对话轮次（userInstruction 永久只读）
//
// 依赖方向：本文件 → store/project-store.js（零依赖叶子）；不 import 任何特性模块 / 浏览器模块，
// 避免污染 public 启动链路（TDZ 红线）。

import { mutateProject, getDetailStudioProject } from "../store/project-store.js";

function defaultVersions() {
  return { screenVersions: [], currentVersionIds: {}, editThreads: {} };
}

// 生成版本 id（时间戳 + 随机，保证全局唯一，避免与既有版本号冲突）。
export function buildVersionId() {
  return "ver_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function normalizeVersions(project) {
  if (!project.versions || typeof project.versions !== "object") project.versions = defaultVersions();
  const v = project.versions;
  if (!Array.isArray(v.screenVersions)) v.screenVersions = [];
  if (!v.currentVersionIds || typeof v.currentVersionIds !== "object") v.currentVersionIds = {};
  if (!v.editThreads || typeof v.editThreads !== "object") v.editThreads = {};
  return v;
}

// 创建一条「pending」版本：落盘元数据（图片随后由 finalize 补全）。isCurrent 默认 true。
// parentVersionId 取调用方传入（通常为当前版本），构建版本链追溯。
export async function createPendingVersion(id, {
  screenIndex, prompt, sourceTaskId = null, parentVersionId = null,
  editNote = "", editThreadRef = null, generationContext = null, versionId
}) {
  const vid = versionId || buildVersionId();
  const idx = Number(screenIndex);
  const version = {
    versionId: vid,
    screenIndex: idx,
    imagePath: null,
    prompt: String(prompt == null ? "" : prompt),
    sourceTaskId: sourceTaskId || null,
    parentVersionId: parentVersionId || null,
    editNote: String(editNote == null ? "" : editNote).slice(0, 2000),
    editThreadRef: editThreadRef || null,
    generationContext: generationContext || null,
    status: "pending",
    isCurrent: true,
    createdAt: new Date().toISOString()
  };
  await mutateProject(id, (project) => {
    const v = normalizeVersions(project);
    // versionId 去重：同 id 视为更新而非新增（幂等收口）。
    v.screenVersions = v.screenVersions.filter((x) => x.versionId !== vid).concat([version]);
    v.currentVersionIds[idx] = vid;
    // 同一屏其余版本 isCurrent 置 false
    v.screenVersions = v.screenVersions.map((x) =>
      x.screenIndex === idx && x.versionId !== vid ? { ...x, isCurrent: false } : x
    );
    return project;
  });
  return version;
}

// 生成完成后补全版本图片与状态（前端轮询 generation 状态成功后调用）。
// 只改该版本的 imagePath / status / resultRef，不删历史、不覆盖其它版本图片。
export async function finalizeVersion(id, versionId, { status = "success", imagePath = null, resultRef = null } = {}) {
  return mutateProject(id, (project) => {
    const v = normalizeVersions(project);
    let found = false;
    v.screenVersions = v.screenVersions.map((x) => {
      if (x.versionId === versionId) {
        found = true;
        return { ...x, status, imagePath: imagePath || null, resultRef: resultRef || null };
      }
      return x;
    });
    return found ? project : null;
  });
}

// 补丁式更新某版本字段（如生成提交后回填 sourceTaskId）。找不到版本返回 null。
export async function patchVersion(id, versionId, patch = {}) {
  return mutateProject(id, (project) => {
    const v = normalizeVersions(project);
    let found = false;
    v.screenVersions = v.screenVersions.map((x) => {
      if (x.versionId === versionId) { found = true; return { ...x, ...patch }; }
      return x;
    });
    return found ? project : null;
  });
}

// 切换当前版本：只改 currentVersionIds 与 isCurrent 标志，不删历史、不覆盖图片、不触发重生成。
export async function switchScreenVersion(id, screenIndex, versionId) {
  const idx = Number(screenIndex);
  return mutateProject(id, (project) => {
    const v = normalizeVersions(project);
    const target = v.screenVersions.find((x) => x.screenIndex === idx && x.versionId === versionId);
    if (!target) return null; // 版本不存在：不静默成功
    v.screenVersions = v.screenVersions.map((x) =>
      x.screenIndex === idx ? { ...x, isCurrent: x.versionId === versionId } : x
    );
    v.currentVersionIds[idx] = versionId;
    return project;
  });
}

// 追加一条编辑线程轮次。userInstruction 永久只读；agentSuggestion 本期恒 null；
// adoption 默认 manual（用户直接改）或 adopted；appliedPatch 为实际采纳生效内容。
export async function appendEditThreadRound(id, screenIndex, round) {
  const idx = Number(screenIndex);
  if (!round || typeof round !== "object" || typeof round.userInstruction !== "string") {
    throw new Error("编辑轮次非法（需 userInstruction）");
  }
  return mutateProject(id, (project) => {
    const v = normalizeVersions(project);
    const arr = Array.isArray(v.editThreads[idx]) ? v.editThreads[idx] : [];
    const entry = {
      userInstruction: round.userInstruction,
      agentSuggestion: round.agentSuggestion == null ? null : round.agentSuggestion,
      adoption: round.adoption || "manual",
      appliedPatch: round.appliedPatch == null ? null : round.appliedPatch,
      diff: round.diff == null ? null : round.diff,
      resultVersionId: round.resultVersionId == null ? null : round.resultVersionId,
      createdAt: new Date().toISOString()
    };
    v.editThreads[idx] = [...arr, entry];
    return project;
  });
}

// 只读：取某屏版本列表（按时间升序）+ 当前版本 id。无写盘副作用。
export async function getScreenVersions(id, screenIndex) {
  const safeId = String(id || "");
  const project = await getDetailStudioProject(safeId);
  if (!project || !project.versions) return { versions: [], currentVersionId: null };
  const idx = Number(screenIndex);
  const all = Array.isArray(project.versions.screenVersions) ? project.versions.screenVersions : [];
  const versions = all
    .filter((x) => x.screenIndex === idx)
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const currentVersionId = (project.versions.currentVersionIds && project.versions.currentVersionIds[idx]) || null;
  return { versions, currentVersionId };
}

// 只读：按 versionId 取单条版本（finalize 时反查 sourceTaskId）。
export async function getVersionById(id, versionId) {
  const project = await getDetailStudioProject(String(id || ""));
  if (!project || !project.versions) return null;
  const all = Array.isArray(project.versions.screenVersions) ? project.versions.screenVersions : [];
  return all.find((x) => x.versionId === versionId) || null;
}

export { defaultVersions };
