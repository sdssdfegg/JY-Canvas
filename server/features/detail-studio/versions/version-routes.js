// 详情创作「单屏连续编辑与版本管理」路由（V204 阶段 5 · versions 业务区）。
//
// 🔴 产品功能，无条件注册（照 detail-studio 口径，严禁 NODE_ENV 提前 return）。
// 单屏编辑复用 V203 的 generation 链路（submitSingleScreen → 内部 POST /api/images），
// 不引入第二套 Provider / KEY / 网关。版本元数据随 project.versions 落 data/detail-studio/projects/，
// 不进 data/results（7 天 TTL）/ seed / 安装包默认种子。
//
// 关键不变量（执行单 §1 / §2 / §3 红线）：
//   - 单屏编辑只触发该屏一次生成任务，不重跑 B1/B2/B3/B4，前后屏上下文只读带入、不改写。
//   - idempotencyKey 绑定 versionId → 同屏连续两次生成产出两任务 / 两版本 / 两图，不命中旧账本。
//   - 切换版本只改 currentVersionId，不删历史、不覆盖图片文件。
//   - 用户原始意图（userInstruction）永久只读；本期不调用任何 Agent / SKILL，不显示建议 UI。

import path from "node:path";
import {
  getDetailStudioProject,
  detailStudioAssetsDir
} from "../store/project-store.js";
import { submitSingleScreen } from "../generation/orchestrator.js";
import { generationTaskStore } from "../generation/task-store.js";
import { generateViaLocalApi } from "../generation/local-images-generator.js";
import {
  buildVersionId,
  createPendingVersion,
  finalizeVersion,
  patchVersion,
  switchScreenVersion,
  appendEditThreadRound,
  getScreenVersions,
  getVersionById
} from "./version-store.js";

function respondError(res, error, fallback) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return res.status(400).json({ ok: false, message: message || fallback });
}

export function registerDetailStudioVersionRoutes(app) {
  // 单屏连续编辑：基于上一版结果继续改 → 新版本 + 一次独立生成任务（绑定 versionId）。
  app.post("/api/detail-studio/projects/:id/screens/:screenIndex/edit", async (req, res) => {
    try {
      const id = req.params.id;
      const screenIndex = Number(req.params.screenIndex);
      const project = await getDetailStudioProject(id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const frozenPrompt = String(body.frozenPrompt == null ? "" : body.frozenPrompt);
      if (!frozenPrompt.trim()) return res.status(400).json({ ok: false, message: "单屏编辑需提供冻结提示词" });

      // 只取当前屏所需的生成参数与参考图（前后屏上下文只读带入，不改写其它屏 / planning）。
      const assetsDir = detailStudioAssetsDir(id);
      const referenceImagePaths = Array.isArray(project.referenceImages)
        ? project.referenceImages.map((r) => path.join(assetsDir, r.filename))
        : [];
      const referenceRoles = Array.from(
        new Set((Array.isArray(project.referenceImages) ? project.referenceImages : []).map((r) => r.role).filter(Boolean))
      );
      const imageModel = String((project.modelConfig && project.modelConfig.imageModel) || "").trim();
      const channelId = String((project.modelConfig && project.modelConfig.channelId) || "").trim();
      if (!imageModel) return res.status(400).json({ ok: false, message: "尚未配置图片模型（阶段 2 模型与渠道配置）" });
      if (!channelId) return res.status(400).json({ ok: false, message: "尚未选择图片渠道（阶段 2 模型与渠道配置）" });

      // 版本链：parent = 该屏当前版本（连续对话式修改的基础）。
      const { currentVersionId } = await getScreenVersions(id, screenIndex);
      const versionId = buildVersionId();
      // 生成上下文最小快照：该版参考图角色 + 模型 / 渠道 / 尺寸 / 比例（不依赖任务记录是否还在）。
      const generationContext = {
        referenceRoles,
        model: imageModel,
        channelId,
        imageSize: "2K",
        aspectRatio: "3:4"
      };

      const version = await createPendingVersion(id, {
        screenIndex,
        prompt: frozenPrompt,
        parentVersionId: currentVersionId,
        editNote: body.editNote,
        editThreadRef: body.editThreadRef || null,
        generationContext,
        versionId
      });

      // 单屏重生成：绑定 versionId → 幂等键含版本维度；只触发该屏一次任务。
      const result = await submitSingleScreen({
        projectId: id,
        apiKey: body.apiKey || "",
        screen: {
          screenIndex,
          frozenPrompt,
          versionId,
          referenceImagePaths,
          referenceRoles,
          model: imageModel,
          channelId,
          imageSize: "2K",
          aspectRatio: "3:4"
        }
      }, { generator: generateViaLocalApi });

      const taskId = (result.created && result.created[0]) ||
        (result.skipped && result.skipped[0] && result.skipped[0].taskId) || null;
      if (taskId) await patchVersion(id, versionId, { sourceTaskId: taskId });

      // 编辑线程留痕：用户原话永久只读（userInstruction 不被覆盖）；本期 adoption=manual（用户直接改）。
      await appendEditThreadRound(id, screenIndex, {
        userInstruction: String(body.userInstruction == null ? (body.editNote || frozenPrompt) : body.userInstruction),
        adoption: "manual",
        appliedPatch: { frozenPrompt },
        resultVersionId: versionId
      });

      res.json({ ok: true, version, taskId, skipped: result.skipped || [] });
    } catch (error) {
      respondError(res, error, "单屏编辑失败");
    }
  });

  // 生成完成后补全版本图片：前端轮询 generation 状态成功后再调。
  app.post("/api/detail-studio/projects/:id/versions/:versionId/finalize", async (req, res) => {
    try {
      const id = req.params.id;
      const versionId = req.params.versionId;
      const project = await getDetailStudioProject(id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      const version = await getVersionById(id, versionId);
      if (!version) return res.status(404).json({ ok: false, message: "版本不存在" });
      const task = version.sourceTaskId ? await generationTaskStore.readTask(version.sourceTaskId) : null;
      if (!task || (!task.resultPath && task.status !== "failed" && task.status !== "needs_confirm" && task.status !== "cancelled")) {
        return res.status(409).json({ ok: false, message: "任务尚未完成" });
      }
      if (task.status === "success") {
        await finalizeVersion(id, versionId, { status: "success", imagePath: task.resultPath, resultRef: task.resultRef });
      } else {
        // 失败 / 待确认：版本标记为对应状态，不写图片路径，由前端提示重试。
        await finalizeVersion(id, versionId, { status: task.status });
      }
      res.json({ ok: true });
    } catch (error) {
      respondError(res, error, "版本落盘失败");
    }
  });

  // 读取某屏版本列表 + 当前版本 id（只读，无写盘副作用）。
  app.get("/api/detail-studio/projects/:id/screens/:screenIndex/versions", async (req, res) => {
    try {
      const { versions, currentVersionId } = await getScreenVersions(req.params.id, Number(req.params.screenIndex));
      res.json({ ok: true, versions, currentVersionId });
    } catch (error) {
      respondError(res, error, "读取版本失败");
    }
  });

  // 切换当前版本：只改 currentVersionId 与 isCurrent 标志，不删历史、不覆盖图片。
  app.post("/api/detail-studio/projects/:id/screens/:screenIndex/versions/:versionId/switch", async (req, res) => {
    try {
      const updated = await switchScreenVersion(req.params.id, Number(req.params.screenIndex), req.params.versionId);
      if (!updated) return res.status(404).json({ ok: false, message: "版本不存在" });
      res.json({ ok: true });
    } catch (error) {
      respondError(res, error, "切换版本失败");
    }
  });

  // 追加一条编辑线程轮次（用户直接改，无 AI 建议）。
  app.post("/api/detail-studio/projects/:id/screens/:screenIndex/edit-thread", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const round = await appendEditThreadRound(req.params.id, Number(req.params.screenIndex), {
        userInstruction: String(body.userInstruction == null ? "" : body.userInstruction),
        adoption: body.adoption || "manual",
        appliedPatch: body.appliedPatch == null ? null : body.appliedPatch,
        resultVersionId: body.resultVersionId == null ? null : body.resultVersionId
      });
      if (!round) return res.status(404).json({ ok: false, message: "项目不存在" });
      res.json({ ok: true });
    } catch (error) {
      respondError(res, error, "追加编辑轮次失败");
    }
  });
}
