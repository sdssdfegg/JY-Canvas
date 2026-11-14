// src/features/detail-studio/detail-studio-state.js
// 详情创作工作区独立业务状态：项目级 truth 来自服务端，不依赖浏览器 localStorage。
// public 首启会清 localStorage 并删 IndexedDB 库，所以工作进度一律落服务端 data/。

import { useCallback, useEffect, useRef, useState } from "react";
import { getAppConfig } from "../../../api/config.js";
import { runDetailStudioBatchGeneration, runDetailStudioScreenRetry } from "../generation/detail-studio-generate.js";
import {
  analyzeDetailStudio,
  buildDetailStudioImageForm,
  cancelDetailStudioGenerationTask,
  compileDetailStudioPrompts,
  createDetailStudioProject,
  directorDetailStudio,
  ensureDetailStudioDraftProject,
  freezeDetailStudioPrompts,
  getDetailStudioGenerationStatus,
  qualityDetailStudio,
  freezeModeCPrompt,
  generateDetailStudioImage,
  getDetailStudioCapabilities,
  getDetailStudioProject,
  listDetailStudioProjects,
  listDetailStudioReferenceImages,
  parseModeCPrompt,
  probeDetailStudioImage,
  probeDetailStudioText,
  saveDetailStudioModeCRawPrompt,
  saveDetailStudioProductData,
  startDetailStudioGeneration,
  updateDetailStudioProject,
  uploadDetailStudioReferenceImage
} from "../../../api/detail-studio.js";
import { readJsonStorage, writeJsonStorage } from "../../../lib/storage/json-storage.js";
import { STORAGE_KEY } from "../../../shared/app-defaults.js";
import { normalizeApiKeyInput } from "../../auth/api-key.js";

// V213/S1 P0：自动草稿项目的幂等键（一次「开始创作」一个 token，存在本机）。
// public 首启只清固定清单里的键，本键不在清单内 ⇒ 刷新 / 重启都拿到同一个 token，
// 服务端据此命中既有草稿，不会每刷新一次就多一个项目。
// 客户不可见：本 token 只在本 hook 与 api 层之间流转，界面不出现。
const DETAIL_STUDIO_DRAFT_TOKEN_KEY = "jingyin-detail-studio-draft-token-v1";

function createDraftClientToken() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    }
  } catch {
    // 落到时间戳兜底（仍满足服务端 [A-Za-z0-9_-]{8,64} 字符集）。
  }
  return "ds" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function readDetailStudioDraftToken() {
  const stored = readJsonStorage(DETAIL_STUDIO_DRAFT_TOKEN_KEY, "");
  const token = typeof stored === "string" ? stored.trim() : "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(token) ? token : "";
}

// 换一个 token = 下一次自动草稿落一个新项目（手动新建 / 主动换项目时调用，避免续接到旧草稿）。
function rotateDetailStudioDraftToken() {
  const token = createDraftClientToken();
  writeJsonStorage(DETAIL_STUDIO_DRAFT_TOKEN_KEY, token);
  return token;
}

function ensureDetailStudioDraftToken() {
  return readDetailStudioDraftToken() || rotateDetailStudioDraftToken();
}

function errorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

// Owner 红线（V199 §6 + 两端 README）：整个画板只在设置页填一次 KEY，详情创作视图不得出现 KEY 输入。
// apiKey 一律从全局设置存储（STORAGE_KEY）经 normalizeApiKeyInput 读取，与 ai-canvas / video / detail 同源；
// 无 KEY 且服务端无内建 KEY 时，由面板提示「请到设置页填写」，绝不在本视图放输入。
function readDetailStudioApiKey() {
  try {
    const settings = readJsonStorage(STORAGE_KEY, null) || {};
    return normalizeApiKeyInput(settings && settings.apiKey);
  } catch {
    return "";
  }
}

export function useDetailStudioState() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [routing, setRouting] = useState(null);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [textProbe, setTextProbe] = useState(null);
  const [imageProbe, setImageProbe] = useState(null);
  const [imageGeneration, setImageGeneration] = useState(null);
  // 阶段 2 §4 / §3：参考图列表（带 url，由 list 端点补全）+ 模式 C 解析结果（整理版与差异，瞬时 UI 态）。
  const [referenceImages, setReferenceImages] = useState([]);
  const [modeCParse, setModeCParse] = useState(null);
  // B4 质检报告（瞬时 UI 态，不落盘；与 modeCParse 同口径）。
  const [qcReport, setQcReport] = useState(null);
  // V210：导演分屏长耗时反馈——运行态、已等待秒数、结构化错误（类别 + 建议）。
  const [directorRunning, setDirectorRunning] = useState(false);
  const [directorWaitingSec, setDirectorWaitingSec] = useState(0);
  const [directorError, setDirectorError] = useState(null);
  const directorTimerRef = useRef(null);
  // V212 P1：前端逐屏直调 generateImages 的后台批次进行中标记，防止重复点击导致同一屏二次扣费。
  const generatingRef = useRef(false);
  // V213 P0：自动草稿项目的 in-flight promise（同一时刻只发一次 ensure 请求，多图并发共用）。
  const ensureDraftRef = useRef(null);

  useEffect(() => () => {
    if (directorTimerRef.current) clearInterval(directorTimerRef.current);
  }, []);

  // apiKey 由本 hook 统一从全局设置读取（Owner 红线：详情创作视图不出现 KEY 输入）。
  const apiKey = readDetailStudioApiKey();
  const apiKeyMissing = !apiKey && !hasServerKey;

  const refresh = useCallback(async () => {
    try {
      const [list, caps] = await Promise.all([
        listDetailStudioProjects(),
        getDetailStudioCapabilities()
      ]);
      setProjects(Array.isArray(list.projects) ? list.projects : []);
      setCapabilities(caps);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "加载详情创作工作区失败"));
    }
    // 模型 / 渠道目录（重点 A 下拉选项源）：取 GET /api/config 的 routing 段。
    // 目录加载慢或失败不应阻断工作区主流程，故独立 try 且不改主 error/notice。
    try {
      const config = await getAppConfig();
      setRouting(config && config.routing ? config.routing : null);
      setHasServerKey(Boolean(config && config.hasServerKey));
    } catch {
      setRouting(null);
      setHasServerKey(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(async (payload) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await createDetailStudioProject(payload);
      setCurrentProject(result.project);
      // V213 P0：手动新建后换 token —— 下次自动草稿落新项目，不续接到旧草稿。
      rotateDetailStudioDraftToken();
      setNotice("项目已创建并保存到服务端");
      await refresh();
      return result.project;
    } catch (err) {
      setError(errorMessage(err, "新建详情项目失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  // §4 参考图列表（带 url，由 list 端点补全；无 KEY、不上游，失败不阻断主流程）。
  const loadReferenceImages = useCallback(async (id) => {
    if (!id) return;
    try {
      const res = await listDetailStudioReferenceImages(id);
      setReferenceImages(Array.isArray(res.referenceImages) ? res.referenceImages : []);
    } catch {
      setReferenceImages([]);
    }
  }, []);

  // V213/S1 P0：自动草稿项目 —— 客户不建项目、直接传图时的唯一入口。
  // 已有项目直接复用；并发（双击 / 一次拖多张）用 in-flight ref 复用同一个请求；
  // 刷新后的重复由服务端按 clientToken 幂等兜住（主防线在服务端，本 ref 只是补充）。
  const ensureDraftProject = useCallback(async (nameHint = "") => {
    if (currentProject && currentProject.id) return currentProject;
    if (ensureDraftRef.current) return ensureDraftRef.current;
    const pending = (async () => {
      const res = await ensureDetailStudioDraftProject(ensureDetailStudioDraftToken(), nameHint);
      const project = (res && res.project) || null;
      if (project) {
        setCurrentProject(project);
        await refresh();
      }
      return project;
    })();
    ensureDraftRef.current = pending;
    try {
      return await pending;
    } finally {
      ensureDraftRef.current = null;
    }
  }, [currentProject, refresh]);

  const openProject = useCallback(async (id) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await getDetailStudioProject(id);
      setCurrentProject(result.project);
      setReferenceImages([]);
      await loadReferenceImages(id);
      setNotice("已从服务端重新打开项目");
    } catch (err) {
      setError(errorMessage(err, "重新打开项目失败"));
    } finally {
      setBusy(false);
    }
  }, [loadReferenceImages]);

  const saveProject = useCallback(async (patch) => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await updateDetailStudioProject(currentProject.id, patch);
      setCurrentProject(result.project);
      setNotice("项目基础信息已保存");
      await refresh();
      return result.project;
    } catch (err) {
      setError(errorMessage(err, "保存项目失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject, refresh]);

  // 重点 A：保存「推理模型 / 图片模型 / 渠道」三选配置，随当前项目落服务端 modelConfig。
  // 局部选择态在面板内自管，保存经此动作合并进 project.modelConfig（服务端对四字段放行，mode 不可变）。
  const saveModelConfig = useCallback(async (patch) => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const prev = currentProject.modelConfig || { textModel: "", imageModel: "", channelId: "" };
      const next = {
        textModel: prev.textModel,
        imageModel: prev.imageModel,
        channelId: prev.channelId,
        ...patch
      };
      const result = await updateDetailStudioProject(currentProject.id, { modelConfig: next });
      setCurrentProject(result.project);
      setNotice("模型与渠道配置已随项目保存");
      return result.project;
    } catch (err) {
      setError(errorMessage(err, "保存模型配置失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  // P2.6：保存「基础参数」15 控件 + 4 文本域，落 project.basicParams（服务端对 basicParams 放行）。
  // 局部草稿在面板内自管，保存时整体合并进 project.basicParams；重开项目经服务端还原。
  const [basicParamsSaved, setBasicParamsSaved] = useState(false);
  const saveBasicParams = useCallback(async (patch) => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    setBasicParamsSaved(false);
    try {
      const prev = currentProject.basicParams || {};
      const next = { ...prev, ...patch };
      const result = await updateDetailStudioProject(currentProject.id, { basicParams: next });
      setCurrentProject(result.project);
      setBasicParamsSaved(true);
      setNotice("基础参数已保存");
      return result.project;
    } catch (err) {
      setError(errorMessage(err, "保存基础参数失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  const runTextProbe = useCallback(async (payload = {}) => {
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return;
    }
    setBusy(true);
    try {
      setTextProbe(await probeDetailStudioText({
        apiKey,
        prompt: payload.prompt,
        textModel: payload.textModel
      }));
    } catch (err) {
      setTextProbe({ ok: false, message: errorMessage(err, "文本模型连通性测试失败") });
    } finally {
      setBusy(false);
    }
  }, [hasServerKey]);

  const runImageProbe = useCallback(async (payload = {}) => {
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return;
    }
    setBusy(true);
    try {
      setImageProbe(await probeDetailStudioImage({
        apiKey,
        prompt: payload.prompt,
        model: payload.model,
        channelId: payload.channelId
      }));
    } catch (err) {
      setImageProbe({ ok: false, message: errorMessage(err, "图片请求体预检失败") });
    } finally {
      setBusy(false);
    }
  }, [hasServerKey]);

  // 真实出图：由本 hook 用当前 apiKey 拼 FormData，面板不再持有 / 传入 KEY。
  const runImageGeneration = useCallback(async (payload = {}) => {
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return;
    }
    setBusy(true);
    try {
      const form = buildDetailStudioImageForm({
        apiKey,
        prompt: payload.prompt,
        model: payload.model,
        channelId: payload.channelId
      });
      const result = await generateDetailStudioImage(form);
      setImageGeneration({
        ok: true,
        requestId: result.requestId || "",
        count: Array.isArray(result.images) ? result.images.length : 0
      });
    } catch (err) {
      setImageGeneration({ ok: false, message: errorMessage(err, "图片生成失败") });
    } finally {
      setBusy(false);
    }
  }, [hasServerKey]);

  // §4 商品资料：落到 project.productData（fields + text），随项目保存。
  const saveProductData = useCallback(async (productData) => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveDetailStudioProductData(currentProject.id, productData);
      setCurrentProject(result.project);
      setNotice("商品资料已保存");
      return result.project;
    } catch (err) {
      setError(errorMessage(err, "保存商品资料失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  // §4 参考图：上传（带 role + label）→ 重新拉取列表（带 url）刷新本地展示。
  // V213 P0：无项目时先 ensure 草稿项目拿 id，再拼上传 URL —— 这里是「不建项目也能直接传图」的
  // 唯一收口处（三处 UI 硬挡已放行，最终都落到本函数）。幂等靠服务端 token 命中，刷新不会多建项目。
  const uploadReferenceImage = useCallback(async (file, role, label = "") => {
    if (!file) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const project = (currentProject && currentProject.id)
        ? currentProject
        : await ensureDraftProject(file.name);
      if (!project || !project.id) {
        setError("工作区尚未就绪，请稍后重试");
        return null;
      }
      await uploadDetailStudioReferenceImage(project.id, file, role, label);
      const res = await listDetailStudioReferenceImages(project.id);
      setReferenceImages(Array.isArray(res.referenceImages) ? res.referenceImages : []);
      setNotice("参考图已上传并按职责标注");
      return true;
    } catch (err) {
      setError(errorMessage(err, "上传参考图失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject, ensureDraftProject]);

  // §3 模式 C：保存原始提示词（rawPrompt，落库后只读）。
  const saveModeCRawPrompt = useCallback(async (rawPrompt) => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await saveDetailStudioModeCRawPrompt(currentProject.id, rawPrompt);
      setCurrentProject(result.project);
      setNotice("原始提示词已保存（只读，不可再覆盖）");
      return result.project;
    } catch (err) {
      setError(errorMessage(err, "保存原始提示词失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  // §3 模式 C：调用纯函数解析整理版与差异（不落盘，前端决定后续是否冻结）。
  const parseModeC = useCallback(async (rawPrompt) => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    try {
      const res = await parseModeCPrompt(currentProject.id, rawPrompt);
      setModeCParse(res);
      return res;
    } catch (err) {
      setError(errorMessage(err, "整理提示词失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  // §3 模式 C：仅用户确认后冻结 frozenPrompt，生成只认这一份。
  const freezeModeC = useCallback(async (frozenPrompt) => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await freezeModeCPrompt(currentProject.id, frozenPrompt);
      setCurrentProject(result.project);
      setNotice("提示词已冻结，生成时仅使用此版本");
      return result.project;
    } catch (err) {
      setError(errorMessage(err, "冻结提示词失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  // ── 阶段 3 规划批次①：商品分析 + 电商策划（1 次模型调用）──
  const analyzeProject = useCallback(async () => {
    if (!currentProject) return null;
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return null;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await analyzeDetailStudio(currentProject.id, { apiKey, textModel: (currentProject.modelConfig && currentProject.modelConfig.textModel) || "" });
      setCurrentProject(res.project);
      setNotice(res.completeness >= 0.8
        ? "商品分析完成，信息较完整，可进入分屏"
        : "商品分析完成，信息尚有缺口，建议补充后再分屏");
      return res;
    } catch (err) {
      setError(errorMessage(err, "商品分析失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject, hasServerKey]);

  // ── 阶段 3 规划批次②：导演 + 分屏（1 次模型调用，产出结构化 ScreenSpec[]）──
  const directorProject = useCallback(async () => {
    if (!currentProject) return null;
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return null;
    }
    setDirectorError(null);
    setDirectorWaitingSec(0);
    setDirectorRunning(true);
    setBusy(true);
    setError("");
    setNotice("");
    // V210：每秒累加「已等待 N 秒」，让长耗时可见（避免「转圈后无反应」）。
    if (directorTimerRef.current) clearInterval(directorTimerRef.current);
    directorTimerRef.current = setInterval(() => {
      setDirectorWaitingSec((s) => s + 1);
    }, 1000);
    try {
      const res = await directorDetailStudio(currentProject.id, { apiKey, textModel: (currentProject.modelConfig && currentProject.modelConfig.textModel) || "" });
      setCurrentProject(res.project);
      setNotice("分屏方案已生成（" + (res.screens ? res.screens.length : 0) + " 屏），可审阅后编译冻结");
      return res;
    } catch (err) {
      // V210：捕获结构化错误（类别 + 建议），前端 banner 置顶展示 + 重试入口。
      const payload = (err && err.payload) ? err.payload : {};
      const message = payload.message || errorMessage(err, "导演分屏失败");
      setDirectorError({
        message,
        errorClass: payload.errorClass || null,
        suggestion: payload.suggestion || null,
        upstreamStatus: (payload.upstreamStatus !== undefined && payload.upstreamStatus !== null) ? payload.upstreamStatus : null
      });
      setError(message);
      return null;
    } finally {
      if (directorTimerRef.current) {
        clearInterval(directorTimerRef.current);
        directorTimerRef.current = null;
      }
      setDirectorRunning(false);
      setBusy(false);
    }
  }, [currentProject, hasServerKey]);

  // ── B3 确定性编译：把已规划 ScreenSpec[] 编译成每屏 frozenPrompts（零模型）──
  const compilePrompts = useCallback(async () => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await compileDetailStudioPrompts(currentProject.id);
      setNotice("提示词已编译，请审阅每屏后再冻结");
      return res;
    } catch (err) {
      setError(errorMessage(err, "编译提示词失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  // ── B3 冻结：用户确认后服务端重编译并落库 frozenPrompts ──
  const freezePrompts = useCallback(async () => {
    if (!currentProject) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await freezeDetailStudioPrompts(currentProject.id);
      setCurrentProject(res.project);
      setNotice("提示词已冻结，生成时仅使用此版本");
      return res;
    } catch (err) {
      setError(errorMessage(err, "冻结提示词失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

  // ── B4 质量审查：独立 1 次模型调用 + 一次定向修正 + 再审查（封顶）──
  const qualityReview = useCallback(async () => {
    if (!currentProject) return null;
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return null;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await qualityDetailStudio(currentProject.id, { apiKey, textModel: (currentProject.modelConfig && currentProject.modelConfig.textModel) || "" });
      setQcReport(res);
      if (res.project) setCurrentProject(res.project);
      setNotice(res.needsHuman
        ? "质检发现需人工确认的问题，已交回人工"
        : `质检完成（${res.findings ? res.findings.length : 0} 项，修正 ${res.fixedCount || 0} 次）`);
      return res;
    } catch (err) {
      setError(errorMessage(err, "质量审查失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject, hasServerKey]);

  // ── 阶段 4 批量生成与任务管理：提交整批屏生成任务（V212 P1 · 前端直调 + 回写）──
  // 流程：服务端 registerBatch 仅登记 QUEUED 任务 + 返回每屏规格 → 前端逐屏直调 generateImages
  // （与一键详情同一入口 /api/images）→ begin/result 回写状态。服务端不再自调用出图。
  // 幂等：registerBatch 同一指纹返回 skipped（已有任务），不会重复扣费。
  // 具体编排（构造 form / 并发 / 回写）抽到 generation/detail-studio-generate.js，本 hook 只做薄封装。

  const startGeneration = useCallback(async (projectId, { screenIndexes } = {}) => {
    if (!projectId) return null;
    if (generatingRef.current) {
      setNotice("已有批量生成在进行中，请等待完成或查看下方任务列表");
      return null;
    }
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return null;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const reg = await startDetailStudioGeneration(projectId, { apiKey, screenIndexes });
      const specs = (reg && reg.specs) || [];
      if (specs.length === 0) {
        if (Array.isArray(reg?.skipped) && reg.skipped.length > 0) {
          setNotice("该批屏已生成成功（幂等复用，未重复提交上游）");
        } else {
          setNotice("没有可生成的屏（请先冻结提示词 / 完成分屏规划）");
        }
        return reg;
      }
      // 后台逐屏直调 generateImages + 回写（不阻塞按钮）；按钮在注册后即恢复可用。
      generatingRef.current = true;
      void runDetailStudioBatchGeneration({ projectId, specs, apiKey, referenceImages, onNotice: setNotice })
        .catch((err) => setError(errorMessage(err, "批量生成执行失败")))
        .finally(() => { generatingRef.current = false; });
      setNotice(`已提交 ${specs.length} 屏，正在逐屏出图（与一键详情同一生图链路）…`);
      return reg;
    } catch (err) {
      setError(errorMessage(err, "启动批量生成失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [hasServerKey, referenceImages]);

  // 单屏重试（用户态）：重置任务为 QUEUED → 前端重新直调 generateImages → 回写。
  const retryGeneration = useCallback(async (taskId) => {
    if (!currentProject) return null;
    if (generatingRef.current) {
      setNotice("已有批量生成在进行中，请稍后重试");
      return null;
    }
    const apiKey = readDetailStudioApiKey();
    if (!apiKey && !hasServerKey) {
      setError("请到设置页填写 API Key（全画板只在设置页填一次，其他视图不重复输入）");
      return null;
    }
    setError("");
    setNotice("");
    try {
      await runDetailStudioScreenRetry({
        projectId: currentProject.id,
        taskId,
        apiKey,
        referenceImages,
        onError: (msg) => setError(msg)
      });
      setNotice("该屏已重新提交生成，请查看任务列表进度");
      return taskId;
    } catch (err) {
      setError(errorMessage(err, "重试失败"));
      return null;
    }
  }, [currentProject, hasServerKey, referenceImages]);

  return {
    projects,
    currentProject,
    capabilities,
    routing,
    hasServerKey,
    apiKey,
    apiKeyMissing,
    busy,
    error,
    notice,
    textProbe,
    imageProbe,
    imageGeneration,
    referenceImages,
    modeCParse,
    qcReport,
    directorRunning,
    directorWaitingSec,
    directorError,
    refresh,
    createProject,
    ensureDraftProject,
    openProject,
    loadReferenceImages,
    saveProject,
    saveModelConfig,
    saveBasicParams,
    basicParamsSaved,
    saveProductData,
    uploadReferenceImage,
    saveModeCRawPrompt,
    parseModeC,
    freezeModeC,
    analyzeProject,
    directorProject,
    compilePrompts,
    freezePrompts,
    qualityReview,
    runTextProbe,
    runImageProbe,
    runImageGeneration,
    startGeneration,
    retryGeneration,
    getDetailStudioGenerationStatus,
    cancelDetailStudioGenerationTask
  };
}
