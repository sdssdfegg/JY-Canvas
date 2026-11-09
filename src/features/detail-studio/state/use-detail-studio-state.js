// src/features/detail-studio/detail-studio-state.js
// 详情创作工作区独立业务状态：项目级 truth 来自服务端，不依赖浏览器 localStorage。
// public 首启会清 localStorage 并删 IndexedDB 库，所以工作进度一律落服务端 data/。

import { useCallback, useEffect, useState } from "react";
import {
  createDetailStudioProject,
  generateDetailStudioImage,
  getDetailStudioCapabilities,
  getDetailStudioProject,
  listDetailStudioProjects,
  probeDetailStudioImage,
  probeDetailStudioText,
  updateDetailStudioProject
} from "../../../api/detail-studio.js";

function errorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

export function useDetailStudioState() {
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [textProbe, setTextProbe] = useState(null);
  const [imageProbe, setImageProbe] = useState(null);
  const [imageGeneration, setImageGeneration] = useState(null);

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

  const runTextProbe = useCallback(async (payload) => {
    setBusy(true);
    try {
      setTextProbe(await probeDetailStudioText(payload));
    } catch (err) {
      setTextProbe({ ok: false, message: errorMessage(err, "文本模型连通性测试失败") });
    } finally {
      setBusy(false);
    }
  }, []);

  const runImageProbe = useCallback(async (payload) => {
    setBusy(true);
    try {
      setImageProbe(await probeDetailStudioImage(payload));
    } catch (err) {
      setImageProbe({ ok: false, message: errorMessage(err, "图片请求体预检失败") });
    } finally {
      setBusy(false);
    }
  }, []);

  const runImageGeneration = useCallback(async (form) => {
    setBusy(true);
    try {
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
  }, []);

  return {
    projects,
    currentProject,
    capabilities,
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
    runTextProbe,
    runImageProbe,
    runImageGeneration
  };
}
