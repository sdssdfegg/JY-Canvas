// 快捷 / 参考提示词重写路由（V11-RF-204）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                        ← 形参
//   upload                                                     ← server/core/uploads.js
//   resolveApiKey                                              ← server/core/image-error-policy.js
//   channelBaseCandidates                                      ← server/core/image-channel-candidates.js
//   createQuickPromptRewrite / quickPromptFallback             ← server/quick-prompt-ai.js
//   createReferencePromptRewrite / localReferencePrompt         ← server/reference-ai.js
// ⇒ **没有任何符号来自 index.js 作用域**（契约自检句：把本文件单独拿开看，
//   不打开 index.js 也能讲清每个自由标识符的来处）。
//
// 关于本单为什么是 `(app)` 而不是 `(app, deps)`：
//   执行单预告"这是本批第一次需要 deps 的单"，理由是 upload 来自 core/uploads.js。
//   实测 `upload` 是 **server/core/uploads.js:29 的命名导出**，可直接 import
//   ⇒ 按 §0.1 裁定走 `(app)`：只有确实无法 import、只能在 index.js 作用域构造时才用 deps。
//   ⚠️ `upload` 是 multer 实例（共享件）—— **本模块禁止重写 `multer(...)`**，
//      只准 import 这一份，否则中间件与路由脱钩。
//
// 逐字保留（改一个字就红一片，见执行单 §1）：
//   - 参数解析失败的 400 文案（"快捷生成提示词优化参数解析失败" / "参考生图扩写参数解析失败"）；
//   - 缺 KEY 的 400 + `{ ok:false, error:"missing_api_key" }`，两条 message 各不相同、不得合并；
//   - 上游失败 502 时**本地兜底提示词必须仍生效**（`quickPromptFallback` /
//     `localReferencePrompt`）—— 这是**断网可用性保障**，丢了会白屏；
//   - 上传字段与上限：`upload.array("image", 6)`、
//     `upload.fields([{ productImage, 6 }, { referenceImage, 6 }])`。
import { upload } from "../core/uploads.js";
import { resolveApiKey } from "../core/image-error-policy.js";
import { channelBaseCandidates } from "../core/image-channel-candidates.js";
import {
  createQuickPromptRewrite,
  quickPromptFallback,
} from "../quick-prompt-ai.js";
import {
  createReferencePromptRewrite,
  localReferencePrompt,
} from "../reference-ai.js";

export function registerPromptsRoutes(app) {
  app.post("/api/quick-prompt-rewrite", upload.array("image", 6), async (req, res) => {
    let payload = {};
    try {
      payload = req.body?.payload ? JSON.parse(req.body.payload) : (req.body || {});
    } catch {
      return res.status(400).json({ ok: false, message: "快捷生成提示词优化参数解析失败" });
    }

    const apiKey = resolveApiKey(payload.apiKey);
    if (!apiKey) {
      return res.status(400).json({ ok: false, error: "missing_api_key", message: "缺少 API Key，无法调用快捷生成文本模型" });
    }

    const files = (req.files || []).map((file, index) => ({ ...file, quickRole: "reference", quickIndex: index }));

    try {
      const plan = await createQuickPromptRewrite({
        input: payload,
        files,
        apiKey,
        baseUrls: channelBaseCandidates(apiKey)
      });
      res.json({ ok: true, ...plan });
    } catch (error) {
      const fallbackPrompt = quickPromptFallback(payload, files);
      res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "快捷生成文本模型优化失败",
        fallbackPrompt
      });
    }
  });

  app.post("/api/reference-prompt-rewrite", upload.fields([
    { name: "productImage", maxCount: 6 },
    { name: "referenceImage", maxCount: 6 }
  ]), async (req, res) => {
    let payload = {};
    try {
      payload = req.body?.payload ? JSON.parse(req.body.payload) : (req.body || {});
    } catch {
      return res.status(400).json({ ok: false, message: "参考生图扩写参数解析失败" });
    }

    const apiKey = resolveApiKey(payload.apiKey);
    if (!apiKey) {
      return res.status(400).json({ ok: false, error: "missing_api_key", message: "缺少 API Key，无法调用参考生图文本模型" });
    }

    const files = [
      ...((req.files?.productImage || []).map((file, index) => ({ ...file, referenceRole: "product", referenceIndex: index }))),
      ...((req.files?.referenceImage || []).map((file, index) => ({ ...file, referenceRole: "reference", referenceIndex: index })))
    ];

    try {
      const plan = await createReferencePromptRewrite({
        input: payload,
        files,
        apiKey,
        baseUrls: channelBaseCandidates(apiKey)
      });
      res.json({ ok: true, ...plan });
    } catch (error) {
      const fallbackPrompt = localReferencePrompt(payload);
      res.status(502).json({
        ok: false,
        message: error instanceof Error ? error.message : "参考生图文本模型扩写失败",
        fallbackPrompt
      });
    }
  });
}
