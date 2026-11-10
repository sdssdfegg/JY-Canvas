// src/features/detail-studio/detail-studio-state.js
// 详情创作工作区独立业务状态：项目级 truth 来自服务端，不依赖浏览器 localStorage。
// public 首启会清 localStorage 并删 IndexedDB 库，所以工作进度一律落服务端 data/。

import { useCallback, useEffect, useState } from "react";
import { getAppConfig } from "../../../api/config.js";
import {
  analyzeDetailStudio,
  buildDetailStudioImageForm,
  compileDetailStudioPrompts,
  createDetailStudioProject,
  directorDetailStudio,
  freezeDetailStudioPrompts,
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
  updateDetailStudioProject,
  uploadDetailStudioReferenceImage
} from "../../../api/detail-studio.js";
import { readJsonStorage } from "../../../lib/storage/json-storage.js";
import { STORAGE_KEY } from "../../../shared/app-defaults.js";
import { normalizeApiKeyInput } from "../../auth/api-key.js";

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
  const uploadReferenceImage = useCallback(async (file, role, label = "") => {
    if (!currentProject) return null;
    if (!file) return null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await uploadDetailStudioReferenceImage(currentProject.id, file, role, label);
      const res = await listDetailStudioReferenceImages(currentProject.id);
      setReferenceImages(Array.isArray(res.referenceImages) ? res.referenceImages : []);
      setNotice("参考图已上传并按职责标注");
      return true;
    } catch (err) {
      setError(errorMessage(err, "上传参考图失败"));
      return null;
    } finally {
      setBusy(false);
    }
  }, [currentProject]);

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
      const res = await analyzeDetailStudio(currentProject.id, { apiKey });
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await directorDetailStudio(currentProject.id, { apiKey });
      setCurrentProject(res.project);
      setNotice("分屏方案已生成（" + (res.screens ? res.screens.length : 0) + " 屏），可审阅后编译冻结");
      return res;
    } catch (err) {
      setError(errorMessage(err, "导演分屏失败"));
      return null;
    } finally {
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
    refresh,
    createProject,
    openProject,
    loadReferenceImages,
    saveProject,
    saveModelConfig,
    saveProductData,
    uploadReferenceImage,
    saveModeCRawPrompt,
    parseModeC,
    freezeModeC,
    analyzeProject,
    directorProject,
    compilePrompts,
    freezePrompts,
    runTextProbe,
    runImageProbe,
    runImageGeneration
  };
}
