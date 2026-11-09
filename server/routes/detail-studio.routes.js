// server/routes/detail-studio.routes.js
// 阶段 1：详情创作独立工作区路由。
//
// 🔴 产品功能，无条件注册：严禁照抄 seed.routes.js 的
// `if (process.env.NODE_ENV === "production") return;` —— public 构建经
// esbuild define(NODE_ENV="production") 会把整段死代码消除，客户版将丢失工作区。
// 全部复用现有模型体系：postChatCompletion（文本）+ /api/images（图片），
// 不引入第二套 Provider / API Key / 网关 / 图片生成体系。
// 项目数据只落服务端 data/detail-studio/projects/，不进 seed、不受 7 天 TTL 清理影响。

import {
  buildImageProbe,
  describeCapabilities,
  probeTextModel
} from "../features/detail-studio/probe/capabilities.js";
import {
  createDetailStudioProject,
  getDetailStudioProject,
  listDetailStudioProjects,
  updateDetailStudioProject
} from "../features/detail-studio/store/project-store.js";

function respondDetailStudioError(res, error, fallback) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return res.status(400).json({ ok: false, message: message || fallback });
}

function detailStudioPayload(req) {
  return req.body && typeof req.body === "object" ? req.body : {};
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
}
