// 通用生图主路由：批量 / 换装 / 精修 / 局部回贴 / 扩图（V11-RF-212，**批次 4 最大一单**）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本区间用到的 49 个外部符号 → 来源，由 tmp/scan-212-deps.mjs
// 扫描 + tmp/import-map.mjs 反查产出，**不是人肉列**）：
//   app                                                            ← 形参
//   extractImagesFromResponse / normalizeImageRequest /
//     validateImageCapabilities / validateImageRouting /
//     summarizeResponse                                             ← server/channel.js
//   buildOutfitPrompt / primaryOutfitGenerationError                ← server/outfit-skill.js
//   validateOutfitIntent                                            ← src/shared/outfit-intent.js
//   validateRetouchIntent                                           ← src/shared/retouch-intent.js
//   createOutfitPoseAnchor                                          ← server/outfit-pose-ai.js
//   createAbortSignal / readTextSafely                              ← server/core/http-client.js
//   persistGeneratedItemsInBackground                               ← server/core/asset-persist.js
//   imagePromptLogFields / isSmartOutfitInterventionEnabled /
//     publicImageErrorCode / publicImageErrorPayload / resolveApiKey /
//     shouldTreatPrivateChannelAuthAsChannelFault / shouldTryNextChannel /
//     shouldTryNextImageVariant / upstreamErrorMessage              ← server/core/image-error-policy.js
//   cacheOutfitGeneratedImageForDisplay /
//     archiveOutfitGeneratedImageInBackground                       ← server/core/outfit-archive.js
//   IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS / IMAGE_CONCURRENCY_LIMIT /
//     RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS                      ← server/core/runtime-config.js
//   acquireImageSlot / imageQueueSnapshot                           ← server/core/image-concurrency.js
//   localUploadParseMs                                              ← server/core/generation-trace.js
//   prepareImageBillingForRequest / finalizeBillingInBackground     ← server/core/billing-attempts.js
//   compactLogMessage                                               ← server/core/format-utils.js
//   writeGenerationLog                                              ← server/core/generation-logger.js
//   channelBaseCandidates / imageChannelBaseCandidates /
//     prepareJsonImageUrlsForChannel                                ← server/core/image-channel-candidates.js
//   imageCandidateEntries / imageChannelLogForCandidate /
//     imageApiKeyForCandidate / imageRequestVariantsForCandidate /
//     imageUrlForCandidate / imageHeadersForCandidate               ← server/core/image-route-candidates.js
//   IMAGE_UPLOAD_PARSE_CEILING / ensureFileBuffer /
//     imageForwardUpload / removeUploadedFiles / wrapOutfitUpload   ← server/core/uploads.js
//   outfitUploadFileGroups                                          ← server/core/outfit-upload-groups.js
//
// ⇒ **没有任何符号来自 index.js 作用域**（0 条）。签名用默认 `(app)`（0.1 裁定）。
//   upload 系列是 multer 共享件，只 import 不重写（模块内零 multer(）。
//   模块内零 express.Router()、零第二次 express()、零 new Map()。
//
// 逐字保留（执行单 §9）：
//   - 返回的本地 **`HZ-` 地址**、错误码/文案、`attempts` 数组、
//     诊断字段（含 `localUploadParseMs`、`imageConcurrency`）；
//   - **真正发给上游的 prompt 与搬家前逐字节相同**（由 mock 脚本钉住，见 commit）；
//   - 结构化意图校验：非法枚举仍 **400**
//     （`validateOutfitIntent` / `validateRetouchIntent` 的调用点与顺序不变）；
//   - 局部回贴底图规则：仍由前端决定、服务端只转发，
//     **不得新增任何"底图选择"逻辑**。
//
// 🔴 **禁止**（执行单 §9 硬性）：
//   - 删/改 `deferOutfitAutoSave` —— **G-5 刻意保留的 unused**。
//     本模块里那 1 条 `no-unused-vars` 是**预告例外**，不是缺陷，
//     详见 commit message 的「AB-2 三步防护」；
//   - 动 `prompts/server/outfit-skill.js`、`server/outfit-skill.js`、
//     `src/shared/outfit-intent.js`、`src/shared/retouch-intent.js`
//     （历史硬性决策：批量侧**只发用户原话** + 结构化意图编译，
//     **严禁复原已删除的通用 SKILL 规则块 / 换装规则开关字段**）；
//   - 动 `src/outfit-workflow.jsx`。
//
import {
  extractImagesFromResponse,
  normalizeImageRequest,
  validateImageCapabilities,
  validateImageRouting,
  summarizeResponse,
} from "../channel.js";
import {
  buildOutfitPrompt,
  primaryOutfitGenerationError,
} from "../outfit-skill.js";
import { validateOutfitIntent } from "../../src/shared/outfit-intent.js";
import { validateRetouchIntent } from "../../src/shared/retouch-intent.js";
import { createOutfitPoseAnchor } from "../outfit-pose-ai.js";
import {
  createAbortSignal,
  readTextSafely,
} from "../core/http-client.js";

import {
  imagePromptLogFields,
  isSmartOutfitInterventionEnabled,
  publicImageErrorCode,
  publicImageErrorPayload,
  resolveApiKey,
  shouldTreatPrivateChannelAuthAsChannelFault,
  shouldTryNextChannel,
  shouldTryNextImageVariant,
  upstreamErrorMessage,
} from "../core/image-error-policy.js";
import {
  cacheOutfitGeneratedImageForDisplay,
  archiveOutfitGeneratedImageInBackground,
} from "../core/outfit-archive.js";
import {
  IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS,
  IMAGE_CONCURRENCY_LIMIT,
  RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS,
} from "../core/runtime-config.js";
import {
  acquireImageSlot,
  imageQueueSnapshot,
} from "../core/image-concurrency.js";
import { localUploadParseMs } from "../core/generation-trace.js";
import {
  prepareImageBillingForRequest,
  finalizeBillingInBackground,
} from "../core/billing-attempts.js";
import { compactLogMessage } from "../core/format-utils.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import {
  channelBaseCandidates,
  imageChannelBaseCandidates,
  prepareJsonImageUrlsForChannel,
} from "../core/image-channel-candidates.js";
import {
  imageCandidateEntries,
  imageChannelLogForCandidate,
  imageApiKeyForCandidate,
  imageRequestVariantsForCandidate,
  imageUrlForCandidate,
  imageHeadersForCandidate,
} from "../core/image-route-candidates.js";
import {
  IMAGE_UPLOAD_PARSE_CEILING,
  ensureFileBuffer,
  imageForwardUpload,
  removeUploadedFiles,
  wrapOutfitUpload,
} from "../core/uploads.js";
import { outfitUploadFileGroups } from "../core/outfit-upload-groups.js";

export function registerOutfitRoutes(app) {
  app.post("/api/generate-outfit", wrapOutfitUpload(imageForwardUpload.fields([
    { name: "image", maxCount: IMAGE_UPLOAD_PARSE_CEILING },
    { name: "mask", maxCount: 1 }
  ])), async (req, res) => {
    let payload = {};
    try {
      payload = req.body?.payload ? JSON.parse(req.body.payload) : {};
    } catch {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ ok: false, message: "任务参数解析失败" });
    }

    const apiKey = resolveApiKey(payload.apiKey);
    if (!apiKey) {
      await removeUploadedFiles(req.files);
      return res.status(401).json({ ok: false, message: "请先在设置里填写 API Key" });
    }
    const receivedAt = Date.now();
    const requestId = String(payload.taskId || `outfit_${receivedAt}_${Math.random().toString(36).slice(2, 8)}`);
    const uploaded = outfitUploadFileGroups(req);
    let files = uploaded.imageFiles || [];
    let maskFile = uploaded.maskFile || null;
    const errors = [];
    const attempts = [];
    const helperBaseCandidates = channelBaseCandidates();
    let poseAi = null;
    let promptPayload = payload;
    const pageNameForWorkflow = String(payload.pageName || "");
    const modelTitleForWorkflow = String(payload.uploadLabels?.model?.title || "");
    const clothingTitleForWorkflow = String(payload.uploadLabels?.clothing?.title || "");
    const referenceTitleForWorkflow = String(payload.uploadLabels?.reference?.title || "");
    const workflowText = [
      payload.workflowMode,
      pageNameForWorkflow,
      modelTitleForWorkflow,
      clothingTitleForWorkflow,
      referenceTitleForWorkflow
    ].join(" ");
    const customWorkflow = String(payload.workflowMode || "") === "custom"
      || /临时需求|自定义需求|批量需求|custom/i.test(pageNameForWorkflow);
    const localDetailWorkflow = String(payload.workflowMode || "") === "local-detail"
      || /局部回贴|局部贴回|局部细节|局部精修|local\s*detail/i.test(workflowText);
    const designDraftWorkflow = String(payload.workflowMode || "") === "design-draft"
      || /设计稿|設計稿|design|实拍服装|真人实拍|细节补充/i.test(workflowText);
    const faceSwapWorkflow = String(payload.workflowMode || "") === "face-swap"
      || /批量换脸|换脸|人脸|脸部|face\s*swap/i.test(pageNameForWorkflow)
      || /人脸参考|脸部参考|人脸身份|脸部身份/i.test(workflowText)
      || (/目标人物图|人物图|模特图|原图/i.test(modelTitleForWorkflow)
        && /人脸参考|脸部参考|人脸身份|换脸|脸/i.test(clothingTitleForWorkflow));
    const poseRemixWorkflow = !faceSwapWorkflow && (
      String(payload.workflowMode || "") === "pose-remix"
      || /批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|固定成片|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(workflowText)
      || /固定母版成片|批量姿势参考图|只提取姿势/i.test(workflowText)
    );
    const outpaintWorkflow = String(payload.workflowMode || "") === "outpaint"
      || /批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(workflowText)
      || /待扩图原图|扩图参考图/i.test(workflowText);
    const randomBackgroundWorkflow = String(payload.workflowMode || "") === "random-background"
      || /随机背景|随机场景|随机实景|random\s*background/i.test(pageNameForWorkflow);
    const backgroundChangeWorkflow = !randomBackgroundWorkflow && (
      String(payload.workflowMode || "") === "background-change"
      || /换背景|換背景|背景更换|背景替换|换场景/i.test(pageNameForWorkflow)
      || /统一场景|场景图|目标场景|背景图|换背景|背景/i.test(clothingTitleForWorkflow)
      || (/人物图|人物照|人物|模特图|模特/i.test(modelTitleForWorkflow)
        && /统一场景|场景图|目标场景|背景图|换背景|背景/i.test(clothingTitleForWorkflow))
      || /PS贴回/i.test(workflowText)
    );
    const recolorWorkflow = String(payload.workflowMode || "") === "recolor"
      || /批量改色|改色|换色|服装改色|颜色替换|颜色参考|recolor/i.test(pageNameForWorkflow)
      || /改色服装参考图|目标颜色|颜色参考|颜色替换|换色/i.test(clothingTitleForWorkflow)
      || /改色服装参考图|目标颜色|颜色替换/i.test(workflowText);
    const whiteRefineWorkflow = String(payload.workflowMode || "") === "white-refine"
      || /批量白底精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(pageNameForWorkflow)
      || /批量平铺图|挂拍图|可选参考.*细节图|白底商品图|衣架去除/i.test(workflowText);
    const outfitWorkflow = !customWorkflow && !localDetailWorkflow && !poseRemixWorkflow && !outpaintWorkflow && !backgroundChangeWorkflow && !randomBackgroundWorkflow && !recolorWorkflow && !whiteRefineWorkflow && !designDraftWorkflow && !faceSwapWorkflow;
    if (!outpaintWorkflow && !payload.maskEdit) {
      maskFile = null;
    }
    const outfitReferenceMentioned = /图\s*3|图三|第三张|第三个|补充图|补充参考|参考图\s*3|reference\s*3/i.test([
      payload.prompt,
      payload.productNote
    ].join("\n"));
    if (outfitWorkflow && files.length > 2 && !outfitReferenceMentioned) {
      files = files.slice(0, 2);
      payload = { ...payload, referenceCount: 0 };
      promptPayload = payload;
    }
    if (localDetailWorkflow && !payload.localEdit?.enabled) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({
        ok: false,
        message: "局部回贴页需要先在图1缩略图下方设置局部回贴区域"
      });
    }

    const minRequiredFiles = outpaintWorkflow || whiteRefineWorkflow || randomBackgroundWorkflow ? 1 : 2;
    if (!Array.isArray(files) || files.length < minRequiredFiles) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({
        ok: false,
        message: faceSwapWorkflow
          ? "至少需要 1 张图1目标人物图和 1 张图2人脸参考图"
          : poseRemixWorkflow
            ? "至少需要 1 张图1姿态参考图和 1 张图2固定母版成片"
            : outpaintWorkflow
              ? "至少需要 1 张图1待扩图原图"
              : whiteRefineWorkflow
                ? "至少需要 1 张图1平铺图或挂拍图；图2参考图可选"
              : randomBackgroundWorkflow
                ? "至少需要 1 张图1人物图"
              : backgroundChangeWorkflow
                ? "至少需要 1 张人物图和 1 张场景图"
                : recolorWorkflow
                  ? "至少需要 1 张图1原图和 1 张图2颜色参考图"
                  : localDetailWorkflow
                    ? "至少需要 1 张图1待回贴图和 1 张图2细节结构参考图"
                    : "至少需要 1 张模特图和 1 张服装图"
      });
    }

    // 结构化换装意图：服务端权威校验。
    // 必须在智能介入之前 —— 非法枚举不能等到可能真实扣费的那一步才拒绝。
    // 只有"批量换装"带 outfitIntent 时才校验/收敛；其它 workflow 不带这个字段，行为不变。
    if (payload.outfitIntent !== undefined) {
      const intentCheck = validateOutfitIntent(payload.outfitIntent);
      if (!intentCheck.ok) {
        await removeUploadedFiles(req.files);
        return res.status(400).json({
          ok: false,
          error: "invalid_outfit_intent",
          message: `换装设置不合法：${intentCheck.errors[0]}`,
          errors: intentCheck.errors
        });
      }
      if (String(payload.workflowMode || "") === "outfit") {
        // 用归一化后的意图覆盖，后面 buildOutfitPrompt() 只认这一份。
        payload = { ...payload, outfitIntent: intentCheck.intent };
        promptPayload = payload;
      }
    }

    // 服装精修结构化意图：服务端权威校验（与换装同口径）。
    // 非法枚举 / 版本不对 / customPrompt 不是字符串 → 明确 400，绝不让 [object Object] 进提示词。
    if (payload.retouchIntent !== undefined) {
      const retouchCheck = validateRetouchIntent(payload.retouchIntent);
      if (!retouchCheck.ok) {
        await removeUploadedFiles(req.files);
        return res.status(400).json({
          ok: false,
          error: "invalid_retouch_intent",
          message: `精修设置不合法：${retouchCheck.errors[0]}`,
          errors: retouchCheck.errors
        });
      }
      if (String(payload.workflowMode || "") === "white-refine") {
        payload = { ...payload, retouchIntent: retouchCheck.intent };
        promptPayload = payload;
      }
    }

    // 路由 + 能力校验必须排在智能介入之前。
    // 智能介入会带服务器 KEY 调上游（可能真实扣费），旧 channelId 不能等到那之后才拒绝。
    const preflightParams = normalizeImageRequest({
      ...payload,
      prompt: buildOutfitPrompt(payload),
      n: 1,
      source: "outfit"
    });
    const preflightRouting = validateImageRouting(preflightParams);
    if (!preflightRouting.ok) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ ok: false, error: preflightRouting.code || "invalid_channel", message: preflightRouting.message });
    }
    const preflightCapability = validateImageCapabilities(preflightParams, files);
    if (!preflightCapability.ok) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ ok: false, error: preflightCapability.code, message: preflightCapability.message });
    }

    const smartInterventionEnabled = !designDraftWorkflow
      && !customWorkflow
      && !poseRemixWorkflow
      && !outpaintWorkflow
      && !randomBackgroundWorkflow
      && !recolorWorkflow
      && !whiteRefineWorkflow
      && isSmartOutfitInterventionEnabled(payload.smartIntervention);

    if (smartInterventionEnabled) {
      const smartStartedAt = Date.now();
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: true,
        stage: "smart-intervention-start",
        endpoint: "/api/generate-outfit",
        workflowMode: payload.workflowMode || null,
        fileCount: files.length,
        uploadBytes: files.reduce((sum, file) => sum + file.size, 0),
        baseCandidateCount: helperBaseCandidates.length
      });
      try {
        poseAi = await createOutfitPoseAnchor({
          input: payload,
          modelFile: await ensureFileBuffer(files[0]),
          apiKey,
          baseUrls: helperBaseCandidates
        });
        await writeGenerationLog({
          time: new Date().toISOString(),
          requestId,
          ok: true,
          stage: "smart-intervention-finished",
          endpoint: "/api/generate-outfit",
          timingMs: Date.now() - smartStartedAt,
          model: poseAi.model || "",
          mode: poseAi.mode || "",
          attemptCount: Array.isArray(poseAi.attempts) ? poseAi.attempts.length : 0
        });
        promptPayload = {
          ...payload,
          smartIntervention: true,
          poseAnchorPrompt: poseAi.promptBlock
        };
      } catch (error) {
        poseAi = {
          ok: false,
          message: error?.name === "AbortError"
            ? (faceSwapWorkflow ? "头脸锚点分析超时，已回退到基础换脸 SKILL" : poseRemixWorkflow ? "母版锚点分析超时，已回退到基础换姿势 SKILL" : backgroundChangeWorkflow ? "人物锚点分析超时，已回退到基础换背景 SKILL" : "姿态分析超时，已回退到基础香蕉 SKILL")
            : error instanceof Error ? error.message : String(error)
        };
        await writeGenerationLog({
          time: new Date().toISOString(),
          requestId,
          ok: false,
          stage: "smart-intervention-failed",
          endpoint: "/api/generate-outfit",
          timingMs: Date.now() - smartStartedAt,
          error: poseAi.message
        });
      }
    }

    const params = normalizeImageRequest({
      ...promptPayload,
      prompt: buildOutfitPrompt(promptPayload),
      n: 1,
      source: "outfit"
    });
    const routing = validateImageRouting(params);
    if (!routing.ok) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ ok: false, error: routing.code || "invalid_channel", message: routing.message });
    }
    // 批量换装同样走 capabilities 最终校验（图片数量 / 单张大小 / 提示词长度 / 比例 / 尺寸）。
    const capability = validateImageCapabilities(params, files);
    if (!capability.ok) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({ ok: false, error: capability.code, message: capability.message });
    }
    if (maskFile) {
      params.maskFile = maskFile;
    }
    const promptLog = imagePromptLogFields(params, promptPayload);
    // 注意（2026-09-25 审查）：这个信号前端确实在发（src/outfit-workflow.jsx 的
    // `deferAutoSave: Boolean(localEdit || taskIsOutpaint)`），但**这里算完没人用**。
    // V3 基线里同名字段（deferOutfitArchive）是拿来跳过服务端归档的；V11 架构变了：
    // 批量接口压根没有"写历史"这一步（persistGeneratedItemsInBackground 只被 /api/images 调用），
    // 服务端只做 HZ- 显示缓存，而 UI 依赖这个本地地址显示结果——照搬"跳过归档"会踩到显示契约。
    // 所以**先保留、不改保存时机**，等产品确认批量局部回贴/扩图到底要不要省掉这次归档。
    // 现状已被 scripts/verify/outfit-defer-autosave-check.mjs 钉住，改行为必须先让它红。
    // 这里**故意不加 `void`**：让 ESLint 继续报它未使用，等于把"这个问题还没定"留在门禁视野里。
    const deferOutfitAutoSave = Boolean(payload.deferAutoSave || payload.localEdit?.enabled);
    const uploadBytes = files.reduce((sum, file) => sum + file.size, 0) + (maskFile?.size || 0);
    const baseCandidates = imageChannelBaseCandidates(params.model);
    let releaseImageSlot = null;
    let billingTask = null;

    writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: true,
      stage: "local-outfit-request-prepared",
      endpoint: "/api/generate-outfit",
      workflowMode: payload.workflowMode || null,
      model: params.model,
      imageSize: params.imageSize,
      aspectRatio: params.aspectRatio,
      fileCount: files.length,
      hasMask: Boolean(maskFile),
      uploadBytes,
      localUploadParseMs: localUploadParseMs(requestId, receivedAt),
      hasApiKey: Boolean(apiKey),
      smartIntervention: smartInterventionEnabled,
      masterFitLock: Boolean(promptPayload.masterFitLock),
      localEdit: Boolean(payload.localEdit?.enabled),
      imageConcurrency: {
        limit: IMAGE_CONCURRENCY_LIMIT,
        ...imageQueueSnapshot()
      }
    }).catch(() => {});

    try {
      const queueStartedAt = Date.now();
      releaseImageSlot = await acquireImageSlot(1);
      const queueWaitMs = Date.now() - queueStartedAt;
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: true,
        stage: "image-slot-acquired",
        endpoint: "/api/generate-outfit",
        weight: 1,
        queueWaitMs,
        imageConcurrency: {
          limit: IMAGE_CONCURRENCY_LIMIT,
          ...imageQueueSnapshot()
        }
      });
      const billing = await prepareImageBillingForRequest({
        requestId,
        apiKey,
        params,
        files,
        candidates: baseCandidates,
        metadata: {
          endpoint: "/api/generate-outfit",
          workflowMode: payload.workflowMode || null,
          localEdit: Boolean(payload.localEdit?.enabled),
          hasMask: Boolean(maskFile),
          smartIntervention: smartInterventionEnabled,
          masterFitLock: Boolean(promptPayload.masterFitLock)
        }
      });
      if (billing.errorPayload) {
        return res.status(billing.errorPayload.status).json({
          ...billing.errorPayload,
          errors: [billing.errorPayload.message],
          smartIntervention: smartInterventionEnabled,
          poseAi
        });
      }
      billingTask = billing.billingTask;
      const imageCandidates = imageCandidateEntries(baseCandidates, billingTask);
      const forwardParams = await prepareJsonImageUrlsForChannel(params, files);

      baseLoop:
      for (const [baseIndex, candidate] of imageCandidates.entries()) {
        const channelLog = imageChannelLogForCandidate(candidate, baseIndex, imageCandidates.length);
        const channelApiKey = imageApiKeyForCandidate(candidate, apiKey);
        const usesPrivateChannelKey = Boolean((candidate.usesSignedRoute && candidate.hasCredential) || (channelApiKey && channelApiKey !== apiKey));
        const requestVariants = imageRequestVariantsForCandidate(forwardParams, files, candidate);
        for (const [variantIndex, variant] of requestVariants.entries()) {
          const url = imageUrlForCandidate(candidate, variant, files.length > 0);
          const body = await variant.createBody();
          const headers = imageHeadersForCandidate(candidate, channelApiKey, variant.headers);
          const abort = createAbortSignal(IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS);
          const forwardedAt = Date.now();
          try {
            await writeGenerationLog({
              time: new Date().toISOString(),
              requestId,
              ok: true,
              stage: "forward-outfit-request",
              url,
              ...channelLog,
              attempt: attempts.length + 1,
              baseAttempt: baseIndex + 1,
              candidateCount: imageCandidates.length,
              requestVariant: variant.id,
              requestFormat: variant.requestFormat,
              requestedModel: params.model,
              requestedChannelId: params.channelId,
              model: variant.model,
              protocol: variant.protocol,
              imageSize: params.imageSize,
              aspectRatio: params.aspectRatio,
              ...promptLog,
              fileCount: files.length,
              hasMask: Boolean(maskFile),
              uploadBytes,
              hasApiKey: Boolean(apiKey),
              hasChannelApiKey: Boolean(channelApiKey) || candidate.hasCredential,
              usesPrivateChannelKey,
              usesSignedRoute: Boolean(candidate.usesSignedRoute),
              smartIntervention: smartInterventionEnabled,
              masterFitLock: Boolean(promptPayload.masterFitLock),
              workflowMode: payload.workflowMode || null
            });
            const response = await fetch(url, {
              method: "POST",
              headers,
              body,
              signal: abort.signal
            });
            const responseAt = Date.now();
            const parsed = await readTextSafely(response);
            const upstreamMessage = upstreamErrorMessage(parsed, response.status);
            const privateChannelAuthFault = !response.ok && shouldTreatPrivateChannelAuthAsChannelFault(candidate, response.status, upstreamMessage);
            const timing = {
              totalMs: Date.now() - receivedAt,
              channelWaitMs: responseAt - forwardedAt,
              parseMs: Date.now() - responseAt
            };
            attempts.push({
              url,
              ...channelLog,
              status: response.status,
              ok: response.ok,
              model: variant.model,
              requestFormat: variant.requestFormat,
              errorCode: response.ok ? "" : (privateChannelAuthFault ? "channel_timeout" : publicImageErrorCode(response.status, upstreamMessage)),
              message: compactLogMessage(upstreamMessage, 500)
            });

            await writeGenerationLog({
              time: new Date().toISOString(),
              requestId,
              ok: response.ok,
              status: response.status,
              url,
              ...channelLog,
              stage: "generate-outfit",
              attempt: attempts.length,
              baseAttempt: baseIndex + 1,
              candidateCount: imageCandidates.length,
              requestVariant: variant.id,
              requestFormat: variant.requestFormat,
              requestedModel: params.model,
              requestedChannelId: params.channelId,
              model: variant.model,
              protocol: variant.protocol,
              imageSize: params.imageSize,
              aspectRatio: params.aspectRatio,
              ...promptLog,
              fileCount: files.length,
              hasMask: Boolean(maskFile),
              uploadBytes,
              hasApiKey: Boolean(apiKey),
              hasChannelApiKey: Boolean(channelApiKey) || candidate.hasCredential,
              usesPrivateChannelKey,
              usesSignedRoute: Boolean(candidate.usesSignedRoute),
              timing,
              smartIntervention: smartInterventionEnabled,
              masterFitLock: Boolean(promptPayload.masterFitLock),
              workflowMode: payload.workflowMode || null,
              customWorkflow,
              localDetailWorkflow,
              outpaintWorkflow,
              backgroundChangeWorkflow,
              randomBackgroundWorkflow,
              faceSwapWorkflow,
              localEdit: Boolean(payload.localEdit?.enabled),
              poseAi: poseAi ? {
                ok: poseAi.ok,
                model: poseAi.model,
                mode: poseAi.mode,
                totalMs: poseAi.timing?.totalMs,
                message: poseAi.message ? compactLogMessage(poseAi.message, 400) : undefined
              } : null,
              response: parsed.json ? summarizeResponse(parsed.json) : { textLength: parsed.text.length },
              ...(response.ok ? {} : {
                failureReason: privateChannelAuthFault ? "channel_timeout" : publicImageErrorCode(response.status, upstreamMessage),
                upstreamError: compactLogMessage(upstreamMessage, 900)
              })
            });

            if (!response.ok) {
              errors.push(`HTTP ${response.status} ${compactLogMessage(upstreamMessage, 500)} [${variant.model} / ${variant.requestFormat}]`);
              if (variantIndex < requestVariants.length - 1 && shouldTryNextImageVariant(response.status, upstreamMessage)) continue;
              if (baseIndex < imageCandidates.length - 1 && (privateChannelAuthFault || shouldTryNextChannel(response.status, upstreamMessage))) continue baseLoop;
              const publicPayload = publicImageErrorPayload({
                requestId,
                status: privateChannelAuthFault ? 504 : response.status,
                upstreamMessage: privateChannelAuthFault ? "private channel auth failed" : upstreamMessage,
                params,
                attempts
              });
              finalizeBillingInBackground(billingTask, {
                ok: false,
                status: publicPayload.status,
                error: publicPayload.error,
                message: publicPayload.message,
                usedModel: variant.model,
                timingMs: timing.totalMs,
                attempts
              });
              return res.status(publicPayload.status).json({
                ...publicPayload,
                errors: [publicPayload.message],
                smartIntervention: smartInterventionEnabled,
                poseAi
              });
            }

            const images = extractImagesFromResponse(parsed.json);
            if (!images.length) {
              errors.push(`渠道返回成功但没有图片 [${variant.model} / ${variant.requestFormat}]`);
              if (variantIndex < requestVariants.length - 1) continue;
              if (baseIndex < imageCandidates.length - 1 && shouldTryNextChannel(502, "渠道返回成功但没有图片")) continue baseLoop;
              const publicPayload = publicImageErrorPayload({
                requestId,
                status: 502,
                upstreamMessage: "渠道返回成功但没有图片",
                params,
                attempts
              });
              finalizeBillingInBackground(billingTask, {
                ok: false,
                status: publicPayload.status,
                error: publicPayload.error,
                message: publicPayload.message,
                usedModel: variant.model,
                timingMs: timing.totalMs,
                attempts
              });
              return res.status(publicPayload.status).json({
                ...publicPayload,
                errors: [publicPayload.message],
                smartIntervention: smartInterventionEnabled,
                poseAi
              });
            }

            await writeGenerationLog({
              time: new Date().toISOString(),
              requestId,
              ok: true,
              stage: "upstream-outfit-images-ready",
              imageCount: images.length,
              timing,
              postParseMs: Date.now() - responseAt
            });
            const displayCacheStartedAt = Date.now();
            const displayImage = await cacheOutfitGeneratedImageForDisplay(images[0], requestId, RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS);
            const displayCacheMs = Date.now() - displayCacheStartedAt;
            const hasLocalDisplayImage = String(displayImage?.localUrl || "").startsWith("/api/result/")
              || Boolean(displayImage?.resultArchiveFile);
            if (!hasLocalDisplayImage) {
              archiveOutfitGeneratedImageInBackground(images[0], requestId, "background-display-cache-outfit-result-image");
            }
            await writeGenerationLog({
              time: new Date().toISOString(),
              requestId,
              ok: true,
              stage: "local-outfit-response-ready",
              imageCount: images.length,
              hasLocalDisplayImage,
              displayCacheMs,
              totalMs: Date.now() - receivedAt,
              upstreamChannelWaitMs: timing.channelWaitMs
            });
            finalizeBillingInBackground(billingTask, {
              ok: true,
              status: response.status,
              usedChannel: attempts[attempts.length - 1] || null,
              usedModel: variant.model,
              outputCount: images.length,
              timingMs: Date.now() - receivedAt,
              attempts
            });
            return res.json({
              ok: true,
              taskId: requestId,
              image: displayImage,
              prompt: params.prompt,
              timingMs: Date.now() - receivedAt,
              usedModel: params.model,
              autoSavePending: false,
              smartIntervention: smartInterventionEnabled,
              poseAi: poseAi ? {
                ok: poseAi.ok,
                model: poseAi.model || null,
                mode: poseAi.mode || null,
                timing: poseAi.timing || null
              } : null
            });
          } catch (error) {
            const errorMessage = error?.name === "AbortError" ? "图片接口等待超时" : error instanceof Error ? error.message : String(error);
            const failureStatus = error?.name === "AbortError" ? 504 : 502;
            errors.push(errorMessage);
            attempts.push({
              url,
              ...channelLog,
              status: failureStatus,
              ok: false,
              model: variant.model,
              requestFormat: variant.requestFormat,
              errorCode: error?.name === "AbortError" ? "channel_timeout" : "channel_error",
              message: compactLogMessage(errorMessage, 500)
            });
            if (variantIndex < requestVariants.length - 1 && shouldTryNextImageVariant(failureStatus, errorMessage)) continue;
            if (baseIndex < imageCandidates.length - 1 && shouldTryNextChannel(failureStatus, errorMessage)) continue baseLoop;
            const publicPayload = publicImageErrorPayload({
              requestId,
              status: failureStatus,
              upstreamMessage: errorMessage,
              params,
              attempts
            });
            finalizeBillingInBackground(billingTask, {
              ok: false,
              status: publicPayload.status,
              error: publicPayload.error,
              message: publicPayload.message,
              usedModel: variant.model,
              timingMs: Date.now() - receivedAt,
              attempts
            });
            return res.status(publicPayload.status).json({
              ...publicPayload,
              errors: [publicPayload.message],
              smartIntervention: smartInterventionEnabled,
              poseAi,
              timingMs: Date.now() - receivedAt
            });
          } finally {
            abort.dispose();
          }
        }
      }

      const upstreamMessage = primaryOutfitGenerationError(errors);
      const publicPayload = publicImageErrorPayload({
        requestId,
        status: 502,
        upstreamMessage,
        params,
        attempts
      });
      finalizeBillingInBackground(billingTask, {
        ok: false,
        status: publicPayload.status,
        error: publicPayload.error,
        message: publicPayload.message,
        usedModel: params.model,
        timingMs: Date.now() - receivedAt,
        attempts
      });
      res.status(publicPayload.status).json({
        ...publicPayload,
        errors: [publicPayload.message],
        smartIntervention: smartInterventionEnabled,
        poseAi,
        timingMs: Date.now() - receivedAt
      });
    } finally {
      releaseImageSlot?.();
      await removeUploadedFiles(req.files);
    }
  });

}
