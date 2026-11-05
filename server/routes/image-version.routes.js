// 图片版本只读 API（P2-4）：薄封装 image-version-store，只暴露只读 GET，无 DELETE / 无写接口。
//
// 纪律（执行单 §3.1/§3.2 + 数据层红线）：
//   - 本文件是**唯一**允许 import 数据层的 routes 文件（与 garment-profile.routes.js 同款纪律）；
//     server/app.js 只 import 本注册壳，绝不直接 import 数据层。
//   - 🔴 不提供任何删除 / 清空 / 写接口：用户资产红线（版本记录与固化资产只增不改不删）。
//   - 错误统一 try/catch，不泄漏堆栈与绝对路径到前端。
//   - 资产端点按 version_id 解析固化资产文件名，路径穿越拒绝（不只中和）。
//   - version_id 路径穿越**拒绝**（不只中和），防越界读。
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { aiTryonImageVersionAssetsDir } from "../core/app-paths.js";
import { errorMessage, safeMessage } from "../core/route-helpers.js";
import { listImageVersions, readImageVersion } from "../ai-tryon/image-version-store.js";

// version_id 路径穿越拒绝（不只中和）：含 / \ .. 空字节或非 trim 即拒。
function assertSafeVersionId(id) {
  const s = String(id == null ? "" : id);
  if (!s) throw new Error("invalid id");
  if (/[\\/]/.test(s) || /\.\./.test(s) || /\u0000/.test(s) || s !== s.trim()) {
    throw new Error("invalid id (path traversal not allowed)");
  }
  return s;
}

export function registerImageVersionRoutes(app) {
  // GET /api/image-version/list?taskId= —— 版本列表（可选按 task_id 过滤；不传则全部，最近优先）
  app.get("/api/image-version/list", async (req, res) => {
    try {
      const taskId = req.query.taskId ? String(req.query.taskId) : undefined;
      const filter = taskId ? { task_id: taskId } : {};
      const versions = await listImageVersions(filter);
      versions.sort((a, b) => (b.version || 0) - (a.version || 0));
      res.json({ ok: true, versions });
    } catch (error) {
      res.status(500).json({ ok: false, message: safeMessage(error) });
    }
  });

  // GET /api/image-version/asset/:versionId —— 读取某版本的固化结果资产（永久副本），无则 404
  app.get("/api/image-version/asset/:versionId", async (req, res) => {
    try {
      const versionId = assertSafeVersionId(req.params.versionId);
      const record = await readImageVersion(versionId);
      if (!record || !record.result_asset_ref) {
        return res.status(404).json({ ok: false, message: "资产不存在" });
      }
      const filename = path.basename(String(record.result_asset_ref));
      const file = path.join(aiTryonImageVersionAssetsDir, filename);
      // 路径穿越防护：只允许落在固化资产目录内。
      if (!path.resolve(file).startsWith(path.resolve(aiTryonImageVersionAssetsDir) + path.sep)) {
        return res.status(400).json({ ok: false, message: "无效资产路径" });
      }
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) return res.status(404).json({ ok: false, message: "资产不存在" });
      const data = await readFile(file);
      const mime = /\.png$/i.test(filename)
        ? "image/png"
        : /\.jpe?g$/i.test(filename)
          ? "image/jpeg"
          : /\.webp$/i.test(filename)
            ? "image/webp"
            : /\.gif$/i.test(filename)
              ? "image/gif"
              : "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.send(data);
    } catch (error) {
      const status = /invalid id/.test(errorMessage(error)) ? 400 : 500;
      res.status(status).json({ ok: false, message: safeMessage(error) });
    }
  });
}
