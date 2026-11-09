// src/features/detail-studio/detail-studio-state.js
// 详情创作工作区独立业务状态：项目级 truth 来自服务端，不依赖浏览器 localStorage。
// public 首启会清 localStorage 并删 IndexedDB 库，所以工作进度一律落服务端 data/。

import { useCallback, useEffect, useState } from "react";
import { getAppConfig } from "../../../api/config.js";
import {
  buildDetailStudioImageForm,
  createDetailStudioProject,
  generateDetailStudioImage,
  getDetailStudioCapabilities,
  getDetailStudioProject,
  listDetailStudioProjects,
  probeDetailStudioImage,
  probeDetailStudioText,
  updateDetailStudioProject
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

  const openProject = useCallback(async (id) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await getDetailStudioProject(id);
      setCurrentProject(result.project);
      setNotice("已从服务端重新打开项目");
    } catch (err) {
      setError(errorMessage(err, "重新打开项目失败"));
    } finally {
      setBusy(false);
    }
  }, []);

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
    refresh,
    createProject,
    openProject,
    saveProject,
    saveModelConfig,
    runTextProbe,
    runImageProbe,
    runImageGeneration
  };
}
