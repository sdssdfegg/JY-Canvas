// 详情创作「批量生成」路由（V203 阶段 4 · P1）。
//
// 🔴 产品功能，无条件注册（照 detail-studio.routes.js 口径，严禁 NODE_ENV 提前 return）。
// 复用现有 /api/images（经 local-images-generator 内部自调用），不引入第二套 Provider / KEY / 网关。
// 结果图经编排层落到 data/detail-studio/generation/results/，不进 data/results / seed / 安装包。
//
// 所有请求仅做「拼装批次规格 + 委托编排层」：状态机、幂等、重试、失败隔离、恢复均在 orchestrator。

import path from "node:path";
import { getDetailStudioProject, detailStudioAssetsDir } from "../store/project-store.js";
import { splitIntoScreens } from "../intake/mode-c.js";
import {
  submitBatch,
  getBatchStatus,
  retryTask,
  cancelTask,
  recoverOnStartup
} from "./orchestrator.js";
import { generateViaLocalApi } from "./local-images-generator.js";
import { MAX_SCREENS } from "./task-model.js";

function respondError(res, error, fallback) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return res.status(400).json({ ok: false, message: message || fallback });
}

// 从项目构建批次规格：每屏一个独立任务，1:1 对应 ScreenSpec[] / 模式 C screens[]。
// 三类参考图（product / visualStyle / contentStructure）按 V202 约定全部带入（不混用、不作角色再分配）。
function buildBatchSpec(project, { screenIndexes } = {}) {
  if (!project || !project.id) throw new Error("项目不存在");
  const assetsDir = detailStudioAssetsDir(project.id);
  const referenceImagePaths = Array.isArray(project.referenceImages)
    ? project.referenceImages.map((r) => path.join(assetsDir, r.filename))
    : [];
  const referenceRoles = Array.from(
    new Set((Array.isArray(project.referenceImages) ? project.referenceImages : []).map((r) => r.role).filter(Boolean))
  );

  const imageModel = String((project.modelConfig && project.modelConfig.imageModel) || "").trim();
  const channelId = String((project.modelConfig && project.modelConfig.channelId) || "").trim();
  if (!imageModel) throw new Error("尚未配置图片模型（阶段 2 模型与渠道配置）");
  if (!channelId) throw new Error("尚未选择图片渠道（阶段 2 模型与渠道配置）");

  const screens = [];
  const mode = project.mode;

  if (mode === "direct") {
    // 模式 C：完整提示词直接生成。消费 splitIntoScreens 产出的 screens[]，原文不改、不调 AI。
    const frozen = String((project.modeC && project.modeC.frozenPrompt) || "").trim();
    if (!frozen) throw new Error("模式 C 尚未冻结提示词");
    const parts = splitIntoScreens(frozen);
    for (const part of parts) {
      screens.push({
        screenIndex: part.index,
        frozenPrompt: part.raw,
        referenceImagePaths,
        referenceRoles,
        model: imageModel,
        channelId,
        imageSize: "2K",
        aspectRatio: "3:4"
      });
    }
  } else {
    // 模式 A / B：消费已规划 ScreenSpec[]（planning.screens）+ 冻结的逐屏 frozenPrompts。
    const planned = (project.planning && Array.isArray(project.planning.screens) ? project.planning.screens : []);
    const frozenMap = (project.planning && project.planning.frozenPrompts) || {};
    if (!planned.length) throw new Error("尚未生成分屏方案（阶段 3 规划）");
    planned.forEach((screen, i) => {
      const fp = String(frozenMap[i] != null ? frozenMap[i] : (screen.frozenPrompt || screen.raw || "")).trim();
      if (!fp) return; // 空屏跳过（不浪费一次上游请求）
      screens.push({
        screenIndex: i,
        frozenPrompt: fp,
        referenceImagePaths,
        referenceRoles,
        model: imageModel,
        channelId,
        imageSize: "2K",
        aspectRatio: "3:4"
      });
    });
  }

  if (!screens.length) throw new Error("没有可生成的屏（请先冻结提示词 / 完成分屏规划）");
  if (screens.length > MAX_SCREENS) {
    throw new Error(`单项目最多 ${MAX_SCREENS} 屏，当前 ${screens.length}`);
  }

  // 按 screenIndexes 过滤（若提供）
  let filtered = screens;
  if (Array.isArray(screenIndexes) && screenIndexes.length) {
    const set = new Set(screenIndexes.map(Number));
    filtered = screens.filter((s) => set.has(Number(s.screenIndex)));
  }

  return { projectId: project.id, screens: filtered };
}

export function registerDetailStudioGenerationRoutes(app) {
  // 服务重启后断点恢复：重建内存账本；running 且无结果 → 标 needs_confirm（不盲目重跑）。
  recoverOnStartup().catch(() => {});

  // 启动批量生成
  app.post("/api/detail-studio/projects/:id/generation/start", async (req, res) => {
    try {
      const project = await getDetailStudioProject(req.params.id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      const spec = buildBatchSpec(project, { screenIndexes: req.body && req.body.screenIndexes });
      const result = await submitBatch(
        { ...spec, apiKey: (req.body && req.body.apiKey) || "" },
        { generator: generateViaLocalApi }
      );
      res.json({ ok: true, ...result });
    } catch (error) {
      respondError(res, error, "启动批量生成失败");
    }
  });

  // 批次状态：整体进度 + 单屏列表
  app.get("/api/detail-studio/projects/:id/generation", async (req, res) => {
    try {
      const status = await getBatchStatus(req.params.id);
      res.json({ ok: true, ...status });
    } catch (error) {
      respondError(res, error, "读取生成状态失败");
    }
  });

  // 单屏手动重试（失败 / 需确认）：:taskId 为完整 task_id（取自批次状态列表）。
  app.post("/api/detail-studio/projects/:id/generation/:taskId/retry", async (req, res) => {
    try {
      const task = await retryTask(req.params.taskId, {
        generator: generateViaLocalApi,
        apiKey: (req.body && req.body.apiKey) || ""
      });
      res.json({ ok: true, task });
    } catch (error) {
      respondError(res, error, "重试任务失败");
    }
  });

  // 单屏取消
  app.post("/api/detail-studio/projects/:id/generation/:taskId/cancel", async (req, res) => {
    try {
      const task = await cancelTask(req.params.taskId);
      res.json({ ok: true, task });
    } catch (error) {
      respondError(res, error, "取消任务失败");
    }
  });
}

// 供 app.js 在路由注册后显式触发的恢复入口（与路由内自愈互补）。
export { recoverOnStartup, buildBatchSpec };
