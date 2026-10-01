// 调试路由（V11-RF-202 —— **验证 201 的模板可复制**）
//
// 模板约定同 `server/routes/system.routes.js`（本文件即按该模板落地，用于验证可复制性）：
//   1. 导出 `registerXxxRoutes(app[, deps])`，由 `server/index.js` 在**原位置**调用；
//   2. 依赖一律 import，绝不从 index.js 作用域隐式抓变量；
//   3. 禁止 `express.Router()` / 第二次 `express()` / `multer(...)` / `new Map()`；
//   4. 注册顺序即中间件生效顺序。
//
// 依赖注入表：
//   app                          ← 形参
//   buildImageRequestDiagnostic  ← import server/core/image-diagnostics.js
// ⇒ **无一项来自 index.js 作用域**。
//
// 逐字保留（执行单 3-2）：
//   - 异常分支必须仍是 `400` + `{ ok:false, message: <message> | "传参自检失败" }`；
//   - 本端点是**调试入口**：不得新增鉴权、不得改变监听地址（仍 127.0.0.1）。
//   - `buildImageRequestDiagnostic` 由 106 抽到 `server/core/image-diagnostics.js`，
//     这里是 **import**，不是复制。

import { buildImageRequestDiagnostic } from "../core/image-diagnostics.js";

export function registerDebugRoutes(app) {
  app.post("/api/debug/image-request-params", async (req, res) => {
    try {
      res.json(await buildImageRequestDiagnostic(req.body || {}));
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "传参自检失败"
      });
    }
  });
}
