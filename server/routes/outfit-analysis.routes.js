// 母版贴合分析 + AI 质检路由（V11-RF-210）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                            ← 形参
//   upload                                                         ← server/core/uploads.js
//   resolveApiKey / publicImageErrorPayload                        ← server/core/image-error-policy.js
//   channelBaseCandidates                                          ← server/core/image-channel-candidates.js
//   writeGenerationLog                                             ← server/core/generation-logger.js
//   compactLogMessage                                              ← server/core/format-utils.js
//   createOutfitMasterFitSpec                                      ← server/outfit-master-fit-ai.js
//   createOutfitQualityCheck                                       ← server/outfit-quality-ai.js
// ⇒ **没有任何符号来自 index.js 作用域**。
//   upload 是 multer 共享件，只 import 不重写（模块内零 multer(）。
//
// 逐字保留（执行单 §7）：
//   - 失败分支的**公开错误映射**：一律走 `publicImageErrorPayload`
//     （requestId 前缀 `master_fit_` / `quality_`；AbortError→504、其余→502），
//     不得改成裸 `error.message`；
//   - `writeGenerationLog` 的 **stage 名**逐字不动：
//     `outfit-master-fit-analysis` / `outfit-quality-check`；
//   - `timing.totalMs` 的计算口径（`Date.now() - receivedAt`）；
//   - 上传上限与字段名：master-fit 用 `upload.single("image")`；
//     quality-check 用 fields(image1/image2/result 各 1、reference 6)；
//   - 401「请先在设置里填写 API Key」与两条 400 文案（母版分析参数解析失败 /
//     AI质检参数解析失败 / AI质检需要图1、图2和生成结果）；
//   - 母版分析响应**只返回结构化 facts**，不返回 spec / promptBlock
//     （2026-09-26 决策：整段母版提示词已删除，只能通过
//     src/shared/outfit-intent.js 的唯一编译器注入）。
//
// 🔴 不得改动 `server/outfit-master-fit-ai.js`、`server/outfit-quality-ai.js`、
//    `server/outfit-pose-ai.js`（执行单 §7 禁止清单）。
//
import { upload } from "../core/uploads.js";
import {
  resolveApiKey,
  publicImageErrorPayload
} from "../core/image-error-policy.js";
import { channelBaseCandidates } from "../core/image-channel-candidates.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import { compactLogMessage } from "../core/format-utils.js";
import { createOutfitMasterFitSpec } from "../outfit-master-fit-ai.js";
import { createOutfitQualityCheck } from "../outfit-quality-ai.js";

export function registerOutfitAnalysisRoutes(app) {
  // 中文注释：只分析当前图2上身母版一次，返回可编辑的固定版型规格，不参与图片生成。
  app.post("/api/outfit-master-fit-analysis", upload.single("image"), async (req, res) => {
    let payload = {};
    try {
      payload = req.body?.payload ? JSON.parse(req.body.payload) : {};
    } catch {
      return res.status(400).json({ ok: false, message: "母版分析参数解析失败" });
    }

    const apiKey = resolveApiKey(payload.apiKey);
    if (!apiKey) {
      return res.status(401).json({ ok: false, message: "请先在设置里填写 API Key" });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, message: "请先选择图2服装母版" });
    }

    const receivedAt = Date.now();
    try {
      const result = await createOutfitMasterFitSpec({
        input: payload,
        clothingFile: req.file,
        apiKey,
        baseUrls: channelBaseCandidates()
      });
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: true,
        stage: "outfit-master-fit-analysis",
        model: result.model,
        usedBaseUrl: result.usedBaseUrl,
        mode: result.mode,
        timing: result.timing,
        attempts: result.attempts,
        source: result.source
      });
      res.json({
        ok: true,
        model: result.model,
        mode: result.mode,
        timingMs: Date.now() - receivedAt,
        source: result.source,
        // 2026-09-26：只返回结构化服装事实。
        // 原来的 spec / promptBlock（整段母版提示词）已删除 —— 分析结果必须先转结构化数据，
        // 再由 src/shared/outfit-intent.js 的唯一编译器按选中部位插进最终提示词，
        // 不允许再把一整段文本直接拼进生图提示词。
        facts: result.facts
      });
    } catch (error) {
      const rawMessage = error?.name === "AbortError"
        ? "图2母版版型分析超时，请稍后重试"
        : error instanceof Error ? error.message : String(error);
      const publicPayload = publicImageErrorPayload({
        requestId: `master_fit_${receivedAt}`,
        status: error?.name === "AbortError" ? 504 : 502,
        upstreamMessage: rawMessage,
        attempts: []
      });
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: false,
        stage: "outfit-master-fit-analysis",
        timing: { totalMs: Date.now() - receivedAt },
        error: rawMessage,
        publicError: publicPayload.message
      });
      res.status(publicPayload.status).json({
        ok: false,
        error: publicPayload.error,
        message: publicPayload.message
      });
    }
  });

  // 中文注释：生成后可选 AI 质检，只标记结果和返修建议，不自动返修，方便先测试质检准确性。
  app.post("/api/outfit-quality-check", upload.fields([
    { name: "image1", maxCount: 1 },
    { name: "image2", maxCount: 1 },
    { name: "result", maxCount: 1 },
    { name: "reference", maxCount: 6 }
  ]), async (req, res) => {
    let payload = {};
    try {
      payload = req.body?.payload ? JSON.parse(req.body.payload) : {};
    } catch {
      return res.status(400).json({ ok: false, message: "AI质检参数解析失败" });
    }

    const apiKey = resolveApiKey(payload.apiKey);
    if (!apiKey) {
      return res.status(401).json({ ok: false, message: "请先在设置里填写 API Key" });
    }

    const files = {
      image1: req.files?.image1?.[0] || null,
      image2: req.files?.image2?.[0] || null,
      result: req.files?.result?.[0] || null,
      reference: req.files?.reference || []
    };
    if (!files.image1?.buffer?.length || !files.image2?.buffer?.length || !files.result?.buffer?.length) {
      return res.status(400).json({ ok: false, message: "AI质检需要图1、图2和生成结果" });
    }

    const receivedAt = Date.now();
    try {
      const result = await createOutfitQualityCheck({
        input: payload,
        files,
        apiKey,
        baseUrls: channelBaseCandidates()
      });
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: true,
        stage: "outfit-quality-check",
        workflowMode: payload.workflowMode || null,
        pageName: payload.pageName || null,
        pass: result.pass,
        score: result.score,
        model: result.model,
        usedBaseUrl: result.usedBaseUrl,
        mode: result.mode,
        timing: result.timing,
        attempts: result.attempts
      });
      res.json({
        ok: true,
        pass: result.pass,
        score: result.score,
        summary: result.summary,
        issues: result.issues,
        repairPrompt: result.repairPrompt,
        faceQuality: result.faceQuality,
        poseMatch: result.poseMatch,
        outfitMatch: result.outfitMatch,
        model: result.model,
        mode: result.mode,
        timingMs: Date.now() - receivedAt
      });
    } catch (error) {
      const rawMessage = error?.name === "AbortError"
        ? "AI质检超时，请稍后重试"
        : error instanceof Error ? error.message : String(error);
      const publicPayload = publicImageErrorPayload({
        requestId: `quality_${receivedAt}`,
        status: error?.name === "AbortError" ? 504 : 502,
        upstreamMessage: rawMessage,
        attempts: []
      });
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: false,
        stage: "outfit-quality-check",
        workflowMode: payload.workflowMode || null,
        pageName: payload.pageName || null,
        timing: { totalMs: Date.now() - receivedAt },
        error: compactLogMessage(rawMessage, 600),
        publicError: publicPayload.message
      });
      res.status(publicPayload.status).json({
        ok: false,
        error: publicPayload.error,
        message: publicPayload.message
      });
    }
  });
}
