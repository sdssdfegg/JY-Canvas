// 一键详情／主图提示词组路由（V11-RF-209）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                            ← 形参
//   upload                                                         ← server/core/uploads.js
//   resolveApiKey / imageFailureMessage                            ← server/core/image-error-policy.js
//   channelBaseCandidates                                          ← server/core/image-channel-candidates.js
//   writeGenerationLog                                             ← server/core/generation-logger.js
//   createDetailAiPlan                                             ← server/detail-ai.js
//   buildDetailPromptGroup as buildDetailPromptGroupV2             ← server/detail-middleware.js
// ⇒ **没有任何符号来自 index.js 作用域**。
//   upload 是 multer 共享件，只 import 不重写（模块内零 multer(）。
//   两个 detail-* 符号走 server/ 直连（它们本身是活壳转发层的入口，
//   详见 detail-skills.js / outfit-skill.js 文件头注释）。
//
// 逐字保留（执行单 §6）：
//   - 上传字段：productImage(maxCount 6) / referenceImage(maxCount 6)，
//     以及 files 合并时打的 `detailRole` / `detailIndex` 标记；
//   - `resolveApiKey` 校验与「无 KEY 时静默降级为 local」分支；
//   - `createDetailAiPlan` 的调用参数与 **aiError 的错误公开口径**
//     （走 imageFailureMessage，504 超时 / 502 其余），不得改成裸 message；
//   - 响应结构 `{ ok:true, group }` 与失败 `{ ok:false, message }`（前端按字段取用）；
//   - `analysisMode` 的回填逻辑：`aiPlan?.ok ? "ai" : "local"`。
//
// 🔴 **禁止**（执行单 §6 硬性）：
//   - 不得改动 `prompts/server/detail-skills.js`（G-2 历史决策：
//     一键详情/主图**保留完整规则集**）；
//   - 不得复活已删除的 `buildDetailPromptGroup`（见 `版本记录.md:182`）——
//     本文件只用 V2（detail-middleware.js 的那份）；
//   - 不得顺手删除 `server/detail-skills.js`——它是**活壳**
//     （detail-ai.js:8 / detail-middleware.js:12 引用它）。
//
import { upload } from "../core/uploads.js";
import {
  resolveApiKey,
  imageFailureMessage,
} from "../core/image-error-policy.js";
import { channelBaseCandidates } from "../core/image-channel-candidates.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import { createDetailAiPlan } from "../detail-ai.js";
import { buildDetailPromptGroup as buildDetailPromptGroupV2 } from "../detail-middleware.js";

export function registerDetailRoutes(app) {
  app.post("/api/detail-prompts", upload.fields([
    { name: "productImage", maxCount: 6 },
    { name: "referenceImage", maxCount: 6 }
  ]), async (req, res) => {
    try {
      const payload = req.body?.payload
        ? JSON.parse(req.body.payload)
        : (req.body || {});
      const files = [
        ...((req.files?.productImage || []).map((file, index) => ({ ...file, detailRole: "product", detailIndex: index }))),
        ...((req.files?.referenceImage || []).map((file, index) => ({ ...file, detailRole: "reference", detailIndex: index })))
      ];
      const apiKey = resolveApiKey(payload.apiKey);
      let aiPlan = null;
      let aiError = "";

      if (String(payload.analysisMode || "ai") === "ai" && apiKey) {
        try {
          aiPlan = await createDetailAiPlan({
            input: payload,
            files,
            apiKey,
            baseUrls: channelBaseCandidates()
          });
          await writeGenerationLog({
            time: new Date().toISOString(),
            ok: true,
            stage: "detail-ai-plan",
            model: aiPlan.model,
            usedBaseUrl: aiPlan.usedBaseUrl,
            mode: aiPlan.mode,
            timing: aiPlan.timing,
            attempts: aiPlan.attempts
          });
        } catch (error) {
          const rawAiError = error?.name === "AbortError"
            ? "详情 AI 分析超时"
            : error instanceof Error ? error.message : String(error);
          aiError = imageFailureMessage(error?.name === "AbortError" ? 504 : 502, rawAiError, payload, []);
          await writeGenerationLog({
            time: new Date().toISOString(),
            ok: false,
            stage: "detail-ai-plan",
            error: rawAiError,
            publicError: aiError
          });
        }
      }

      const group = await buildDetailPromptGroupV2(
        {
          ...payload,
          analysisMode: aiPlan?.ok ? "ai" : "local"
        },
        files,
        {
          aiPlan: aiPlan?.plan || null,
          aiMeta: aiPlan ? {
            model: aiPlan.model,
            mode: aiPlan.mode,
            timing: aiPlan.timing
          } : null,
          aiError
        }
      );
      res.json({ ok: true, group });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "详情提示词生成失败"
      });
    }
  });
}
