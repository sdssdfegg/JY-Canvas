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
  registerBatch,
  beginTask,
  recordResult,
  resetTaskForRetry,
  getBatchStatus,
  cancelTask,
  recoverOnStartup
} from "./orchestrator.js";
// 注：local-images-generator.js#generateViaLocalApi 已从「用户态批量生成」生产路径退役
// （/generation/start 改为 registerBatch + 前端直调 generateImages + recordResult 回写）。
// 该函数仅保留给 V208 Tool 层（create-task.tool.js / image-generate.tool.js）与 V204 单屏编辑
// （version-routes.js）作为服务端出图兼容路径，它们自行 import，不在此处引入。
import { MAX_SCREENS } from "./task-model.js";
import { routingChannelsForModel } from "../../../channel-config.js";

// 详情创作默认生图模型（与前端 buildDetailStudioImageForm 默认 model 一致：tt-image-2.6）。
// 仅用于「项目未配置 modelConfig」时的服务端兜底，绝不覆盖用户显式选择。
const DEFAULT_DETAIL_STUDIO_IMAGE_MODEL = "tt-image-2.6";

function respondError(res, error, fallback) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return res.status(400).json({ ok: false, message: message || fallback });
}

// 从项目构建批次规格：每屏一个独立任务，1:1 对应 ScreenSpec[] / 模式 C screens[]。
// 三类参考图（product / visualStyle / contentStructure）按 V202 约定全部带入（不混用、不作角色再分配）。
export function buildBatchSpec(project, { screenIndexes } = {}) {
  if (!project || !project.id) throw new Error("项目不存在");
  const assetsDir = detailStudioAssetsDir(project.id);
  const referenceImagePaths = Array.isArray(project.referenceImages)
    ? project.referenceImages.map((r) => path.join(assetsDir, r.filename))
    : [];
  const referenceRoles = Array.from(
    new Set((Array.isArray(project.referenceImages) ? project.referenceImages : []).map((r) => r.role).filter(Boolean))
  );

  // 新建 / 旧项目 modelConfig 三项可能全空（create 不写默认、migrate 补空），
  // 服务端默认回退到 tt-image-2.6 + 该模型合法渠道首项，口径与前端 buildDetailStudioImageForm
  // 的 routingFields 一致（channel-config.js 为权威渠道表，避免前端 / 服务端双份维护漂移）。
  // 用户显式配置过则用用户值，不让默认覆盖选择。
  const requestedImageModel = String((project.modelConfig && project.modelConfig.imageModel) || "").trim();
  const requestedChannelId = String((project.modelConfig && project.modelConfig.channelId) || "").trim();
  const imageModel = requestedImageModel || DEFAULT_DETAIL_STUDIO_IMAGE_MODEL;
  let channelId = requestedChannelId;
  if (!channelId) {
    const candidates = routingChannelsForModel(imageModel);
    channelId = candidates.length ? candidates[0].id : "";
  }
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
      // 双轨兼容（V209）：优先按 screen.id（compile 写入的 screen_N 键），数字索引 i 仅作老项目兜底。
      const fp = String(
        frozenMap[screen.id] != null ? frozenMap[screen.id]
          : (frozenMap[i] != null ? frozenMap[i]
            : (screen.frozenPrompt || screen.raw || ""))
      ).trim();
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

  // 启动批量生成（V212 P1 · 用户态出图入口唯一化）
  // 🔴 不再发起真实出图：仅登记 QUEUED 任务 + 返回每屏规格（taskId + 屏参数），
  // 由前端逐屏直调 generateImages（与一键详情同一入口）后回写结果。
  // submitBatch / generateViaLocalApi 仅保留给 V208 Tool 层与 V204 单屏编辑兼容路径。
  app.post("/api/detail-studio/projects/:id/generation/start", async (req, res) => {
    try {
      const project = await getDetailStudioProject(req.params.id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      const spec = buildBatchSpec(project, { screenIndexes: req.body && req.body.screenIndexes });
      const result = await registerBatch(spec);
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

  // 前端开始生成某屏前：QUEUED → RUNNING（面板展示「生成中」）。
  app.post("/api/detail-studio/projects/:id/generation/:taskId/begin", async (req, res) => {
    try {
      const task = await beginTask(req.params.id, req.params.taskId);
      res.json({ ok: true, task });
    } catch (error) {
      respondError(res, error, "标记任务开始失败");
    }
  });

  // 前端出图完成后回写结果：RUNNING → SUCCESS / FAILED / NEEDS_CONFIRM。
  // body: { outcome: "success", image?: {...} } | { outcome: "error", error: { status?, name?, message } }
  app.post("/api/detail-studio/projects/:id/generation/:taskId/result", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const task = await recordResult(req.params.id, req.params.taskId, {
        outcome: body.outcome,
        image: body.image || null,
        error: body.error || null
      });
      res.json({ ok: true, task });
    } catch (error) {
      respondError(res, error, "回写生成结果失败");
    }
  });

  // 用户态重试（失败 / 待确认）：重置为 QUEUED + 返回任务（含屏参数），由前端重新直调 generateImages + 回写。
  app.post("/api/detail-studio/projects/:id/generation/:taskId/retry", async (req, res) => {
    try {
      const task = await resetTaskForRetry(req.params.id, req.params.taskId);
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
export { recoverOnStartup };
