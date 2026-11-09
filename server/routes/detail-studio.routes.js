// server/routes/detail-studio.routes.js
// 阶段 1 + 阶段 2：详情创作独立工作区路由。
//
// 🔴 产品功能，无条件注册：严禁照抄 seed.routes.js 的
// `if (process.env.NODE_ENV === "production") return;` —— public 构建经
// esbuild define(NODE_ENV="production") 会把整段死代码消除，客户版将丢失工作区。
// 全部复用现有模型体系：postChatCompletion（文本）+ /api/images（图片），
// 不引入第二套 Provider / API Key / 网关 / 图片生成体系。
// 项目数据只落服务端 data/detail-studio/projects/，不进 seed、不受 7 天 TTL 清理影响。
// 阶段 2 新增：参考图专用上传端点（落 data/detail-studio/assets/，不改现有 assets/save 路由）、
// 模型与渠道配置写入、模式 C（完整提示词直接生成）的解析与冻结端点。

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { upload, safeUploadFilename, outfitUploadErrorPayload } from "../core/uploads.js";
import {
  buildImageProbe,
  describeCapabilities,
  probeTextModel
} from "../features/detail-studio/probe/capabilities.js";
import {
  appendReferenceImage,
  createDetailStudioProject,
  DETAIL_STUDIO_REFERENCE_ROLES,
  detailStudioAssetsDir,
  getDetailStudioProject,
  listDetailStudioProjects,
  updateDetailStudioProject
} from "../features/detail-studio/store/project-store.js";
import { parseModeCTidy } from "../features/detail-studio/intake/mode-c.js";

function respondDetailStudioError(res, error, fallback) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return res.status(400).json({ ok: false, message: message || fallback });
}

function detailStudioPayload(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
}

function referenceImageServeUrl(id, filename) {
  return `/api/detail-studio/projects/${encodeURIComponent(id)}/reference-images/${encodeURIComponent(filename)}`;
}

export function registerDetailStudioRoutes(app) {
  // 能力清单：纯本地，不需要 API Key，供阶段验收与前端自检使用。
  app.get("/api/detail-studio/capabilities", (_req, res) => {
    res.json(describeCapabilities());
  });

  app.get("/api/detail-studio/projects", async (_req, res) => {
    try {
      const index = await listDetailStudioProjects();
      res.json({ ok: true, ...index });
    } catch (error) {
      respondDetailStudioError(res, error, "读取详情项目列表失败");
    }
  });

  app.post("/api/detail-studio/projects", async (req, res) => {
    try {
      const project = await createDetailStudioProject(detailStudioPayload(req));
      res.json({ ok: true, project });
    } catch (error) {
      respondDetailStudioError(res, error, "新建详情项目失败");
    }
  });

  app.get("/api/detail-studio/projects/:id", async (req, res) => {
    try {
      const project = await getDetailStudioProject(req.params.id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      res.json({ ok: true, project });
    } catch (error) {
      respondDetailStudioError(res, error, "读取详情项目失败");
    }
  });

  app.put("/api/detail-studio/projects/:id", async (req, res) => {
    try {
      const project = await updateDetailStudioProject(req.params.id, detailStudioPayload(req));
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      res.json({ ok: true, project });
    } catch (error) {
      respondDetailStudioError(res, error, "保存详情项目失败");
    }
  });

  // 文本模型连通性：真调一次 /chat/completions，需用户自带 API Key（不落盘）。
  app.post("/api/detail-studio/probe/text", async (req, res) => {
    try {
      const result = await probeTextModel(detailStudioPayload(req));
      res.status(result.ok ? 200 : (result.status || 502)).json(result);
    } catch (error) {
      respondDetailStudioError(res, error, "文本模型连通性测试失败");
    }
  });

  // 图片请求体预检：只校验 /api/images 契约，不调用上游、不产生费用。
  app.post("/api/detail-studio/probe/image", (req, res) => {
    res.json(buildImageProbe(detailStudioPayload(req)));
  });

  // ── §4 参考图专用上传端点：落 data/detail-studio/assets/<id>/，不改动现有 assets/save 路由 ──
  app.get("/api/detail-studio/projects/:id/reference-images", async (req, res) => {
    try {
      const project = await getDetailStudioProject(req.params.id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      const list = Array.isArray(project.referenceImages) ? project.referenceImages : [];
      res.json({
        ok: true,
        referenceImages: list.map((entry) => ({ ...entry, url: referenceImageServeUrl(req.params.id, entry.filename) }))
      });
    } catch (error) {
      respondDetailStudioError(res, error, "读取参考图列表失败");
    }
  });

  app.post("/api/detail-studio/projects/:id/reference-images", (req, res) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        const payload = outfitUploadErrorPayload(err);
        return res.status(payload.status).json({ ok: false, ...payload });
      }
      try {
        const id = req.params.id;
        const project = await getDetailStudioProject(id);
        if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
        const file = req.file;
        if (!file) return res.status(400).json({ ok: false, message: "未收到图片文件" });
        const role = String(req.body.role || "");
        if (!DETAIL_STUDIO_REFERENCE_ROLES.includes(role)) {
          return res.status(400).json({ ok: false, message: "参考图角色非法（应为 product / visualStyle / contentStructure）" });
        }
        const dir = detailStudioAssetsDir(id);
        if (!dir) return res.status(400).json({ ok: false, message: "项目 id 非法" });
        await mkdir(dir, { recursive: true });
        const filename = safeUploadFilename(file.originalname);
        await writeFile(path.join(dir, filename), file.buffer);
        const entry = {
          id: "ref_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
          role,
          filename,
          label: String(req.body.label || "").slice(0, 120),
          mimeType: file.mimetype || "application/octet-stream",
          size: file.size,
          createdAt: new Date().toISOString()
        };
        const updated = await appendReferenceImage(id, entry);
        if (!updated) return res.status(404).json({ ok: false, message: "项目不存在" });
        res.json({ ok: true, entry: { ...entry, url: referenceImageServeUrl(id, filename) }, project: updated });
      } catch (error) {
        respondDetailStudioError(res, error, "上传参考图失败");
      }
    });
  });

  app.get("/api/detail-studio/projects/:id/reference-images/:filename", async (req, res) => {
    try {
      const id = req.params.id;
      const dir = detailStudioAssetsDir(id);
      if (!dir) return res.status(400).json({ ok: false, message: "项目 id 非法" });
      const safeName = path.basename(String(req.params.filename || ""));
      const absPath = path.resolve(dir, safeName);
      if (!absPath.startsWith(dir + path.sep)) return res.status(400).json({ ok: false, message: "文件名非法" });
      if (!existsSync(absPath)) return res.status(404).json({ ok: false, message: "文件不存在" });
      const project = await getDetailStudioProject(id);
      const entry = (project && Array.isArray(project.referenceImages) ? project.referenceImages : [])
        .find((e) => e.filename === safeName);
      if (entry && entry.mimeType) res.type(entry.mimeType);
      res.sendFile(absPath);
    } catch (error) {
      respondDetailStudioError(res, error, "读取参考图失败");
    }
  });

  // ── 模式 C（完整提示词直接生成）intake 端点 ──
  // 整理版解析（纯函数，不落盘）：返回 tidyVersion 与 diff，由前端决定是否保存。
  app.post("/api/detail-studio/projects/:id/intake/mode-c/parse", async (req, res) => {
    try {
      const project = await getDetailStudioProject(req.params.id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      const result = parseModeCTidy(detailStudioPayload(req).rawPrompt);
      res.json({ ok: true, ...result });
    } catch (error) {
      respondDetailStudioError(res, error, "整理提示词失败");
    }
  });

  // 冻结最终提示词：仅用户确认后写入 frozenPrompt，生成只认这一份。
  app.put("/api/detail-studio/projects/:id/intake/mode-c/freeze", async (req, res) => {
    try {
      const project = await getDetailStudioProject(req.params.id);
      if (!project) return res.status(404).json({ ok: false, message: "项目不存在" });
      const frozenPrompt = String(detailStudioPayload(req).frozenPrompt || "").slice(0, 60000);
      if (!frozenPrompt.trim()) return res.status(400).json({ ok: false, message: "冻结提示词不能为空" });
      const updated = await updateDetailStudioProject(req.params.id, {
        modeC: { frozenPrompt, frozenAt: new Date().toISOString() }
      });
      if (!updated) return res.status(404).json({ ok: false, message: "项目不存在" });
      res.json({ ok: true, project: updated });
    } catch (error) {
      respondDetailStudioError(res, error, "冻结提示词失败");
    }
  });
}
