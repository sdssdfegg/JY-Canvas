// src/features/outfit/panels/ResultQueue.jsx
// V65 (P5-3) 2026-10-15：从 src/outfit-workflow.jsx renderResultQueue（3104–3295，派发日实测）逐字搬出。
// 内容：结果队列面板——任务卡网格（running/failed/success 三态）+ 预览卡引用 + 空态引导；
//   精修页专属的中线剪裁条以 renderSplitHalvesStrip prop 传入（该条不单独建文件，V65 §1.1 口径）。
// 模式：原函数内引用的 state/handler 全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   模块级工具几乎都已在 features/shared 导出（taskStatusLabel/taskDurationMs/canRerunTask 等），
//   面板直接 import，不重复实现；派生值（visibleTasks 等）由调用方算好传入（渲染期求值，无 TDZ 面）。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V65 §3.2 负向对照兜底。
import { Check, CheckSquare, Download, ImageOff, Loader2, RefreshCw, Sparkles, Square, Trash2 } from "lucide-react";
import {
  canRerunTask,
  displayResultImageSource,
  sanitizeTaskReferenceThumbs,
  taskDurationMs,
  taskHasCropReturnResult,
  taskReferencePreviewItems,
  taskRuntimeStageLabel,
  taskStatusLabel
} from "../outfit-task.js";
import { qualityBadgeTitle, qualityStatusClass, qualityStatusLabel } from "../outfit-top.js";
import { referenceSource, resultImageCardState } from "../../../shared/result-image.js";
import { CachedImage } from "../../../shared/ui/cached-image.jsx";
import { ElapsedTimer } from "../../../shared/ui/elapsed-timer.jsx";
import { ReferenceThumbTray } from "../../../shared/ui/reference-thumb-tray.jsx";
import { formatWholeSecondMs as formatMs } from "../../../lib/format/index.js";

export function ResultQueue({
  visibleTasks,
  selectedTaskIds,
  downloadFeedbackIds,
  brokenTaskImages,
  resultReplaceTargetId,
  galleryCardMin,
  taskGridRef,
  settings,
  activeOutfitPage,
  resultFilter,
  isWhiteRefineWorkflow,
  isPoseRemixWorkflow,
  isRandomBackgroundWorkflow,
  isOutpaintWorkflow,
  isRecolorWorkflow,
  isFaceSwapWorkflow,
  renderSplitHalvesStrip,
  toggleTaskSelected,
  retryTask,
  downloadTask,
  rerunResultTask,
  deleteResultTask,
  setPreview,
  setImageLightbox,
  handleResultReplaceDragOver,
  handleResultReplaceDrop,
  setResultReplaceTargetId,
  markTaskImageBroken,
  beginTaskImageDrag,
  clearResultDragState,
  openReferenceContextMenu,
  beginReferenceImageDrag,
  copyText
}) {
  return (
    <section className="resultPanel queuePanel" id="result-archive-section">
      {/* 精修页专属：结果图中线剪裁开关（样式与 3.0 一致，只在精修页出现）。 */}
      {isWhiteRefineWorkflow && renderSplitHalvesStrip()}
      <div className="taskGrid" ref={taskGridRef} style={{ "--asset-card-min": `${galleryCardMin}px` }}>
        {visibleTasks.map((task, taskIndex) => {
          const selected = selectedTaskIds.has(task.id);
          const durationMs = taskDurationMs(task);
          const fallbackReferences = taskReferencePreviewItems(task);
          const storedReferences = sanitizeTaskReferenceThumbs(task.referenceThumbs);
          const references = storedReferences.length ? storedReferences : fallbackReferences;
          const referenceCount = Math.max(
            Number(task.referenceCount || 0),
            references.length,
            fallbackReferences.length
          );
          if (task.status !== "success") {
            const failed = task.status === "failed";
            const runningTask = task.status === "running";
            const canRetry = failed && canRerunTask(task);
            return (
              <article className={`assetCard loadingCard outfitAssetCard ${task.status} ${selected ? "selected" : ""}`} key={task.id}>
                <button
                  className="selectBox"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleTaskSelected(task.id);
                  }}
                  aria-label={selected ? "取消选中" : "选择图片"}
                >
                  {selected ? <CheckSquare size={24} /> : <Square size={24} />}
                </button>
                {runningTask ? <Loader2 className="spin" size={28} /> : <Sparkles size={28} />}
                <span>{taskStatusLabel(task.status)}</span>
                <strong>{runningTask ? <ElapsedTimer startedAt={task.startedAt} /> : `${task.imageSize || settings.imageSize} · ${task.aspectRatio || settings.aspectRatio}`}</strong>
                <em>{task.modelLabel || settings.model}</em>
                {taskRuntimeStageLabel(task) && (
                  <p className="assetError runtimeStage" title={taskRuntimeStageLabel(task)}>
                    {taskRuntimeStageLabel(task)}
                  </p>
                )}
                {canRetry && (
                  <button className="assetRetryButton" type="button" onClick={() => retryTask(task)}>
                    重试
                  </button>
                )}
                {task.error && <p className="assetError" title={task.errorDetail || task.error}>{task.error}</p>}
              </article>
            );
          }

          const promptText = task.prompt || settings.prompt;
          const src = displayResultImageSource(task.result);
          // P1 缺图自愈：已知失效或加载失败过 → 不再重复请求，直接显示可读原因。
          const cardState = resultImageCardState(task.result, displayResultImageSource);
          // 会话内的失败标记优先，其次用持久化在任务记录里的标记（重载后依然生效）。
          const brokenEntry = brokenTaskImages[task.id] || task.resultMissing;
          const brokenReason = cardState.missing
            ? cardState.reason
            : (brokenEntry && brokenEntry.src === src ? brokenEntry.reason : "");
          const hasCropReturn = taskHasCropReturnResult(task);
          return (
            <article
              className={`assetCard outfitAssetCard success ${selected ? "selected" : ""} ${task.rerunCandidate ? "rerunCandidate" : ""} ${hasCropReturn ? "cropReturnResult" : ""} ${resultReplaceTargetId === task.id ? "replaceTarget" : ""}`}
              key={task.id}
              onClick={() => setPreview(task)}
              onDragOver={(event) => handleResultReplaceDragOver(event, task)}
              onDragLeave={() => setResultReplaceTargetId((current) => current === task.id ? "" : current)}
              onDrop={(event) => handleResultReplaceDrop(event, task)}
            >
              <button
                className="selectBox"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTaskSelected(task.id);
                }}
                aria-label={selected ? "取消选中" : "选择图片"}
              >
                {selected ? <CheckSquare size={24} /> : <Square size={24} />}
              </button>
              <button
                className={`assetDownloadButton ${downloadFeedbackIds.has(task.id) ? "downloaded" : ""}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void downloadTask(task);
                }}
                title="下载到指定文件夹"
                aria-label="下载到指定文件夹"
              >
                {downloadFeedbackIds.has(task.id) ? <Check size={16} /> : <Download size={16} />}
              </button>
              <button
                className="assetRerunButton"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void rerunResultTask(task);
                }}
                disabled={!canRerunTask(task)}
                title={canRerunTask(task) ? "重刷这张结果" : "历史结果缺少原始上传图，不能重刷"}
                aria-label="重刷这张结果"
              >
                <RefreshCw size={15} />
              </button>
              <button
                className="assetDeleteButton"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteResultTask(task.id);
                }}
                title="删除这张结果"
                aria-label="删除这张结果"
              >
                <Trash2 size={15} />
              </button>
              {task.rerunCandidate && <div className="assetRerunBadge">重刷候选</div>}
              {hasCropReturn && <div className="assetCropReturnBadge">裁剪回流</div>}
              {Number.isFinite(durationMs) && durationMs > 0 && <div className="assetTimeBadge">用时 {formatMs(durationMs)}</div>}
              {task.qualityCheck && (
                <div
                  className={`qualityBadge ${qualityStatusClass(task.qualityCheck)}`}
                  title={qualityBadgeTitle(task.qualityCheck)}
                >
                  {qualityStatusLabel(task.qualityCheck)}
                </div>
              )}
              {brokenReason ? (
                <div className="assetImageFallback" title={brokenReason}>
                  <ImageOff size={26} />
                  <strong>原图已失效</strong>
                  <span>{brokenReason}</span>
                  <em>可点右上角删除按钮清理这条记录</em>
                </div>
              ) : (
                <CachedImage
                  src={src}
                  alt={`AI换装结果 ${task.order || ""}`}
                  decoding="async"
                  loading={taskIndex < 6 ? "eager" : "lazy"}
                  fetchPriority={taskIndex < 4 ? "high" : "low"}
                  draggable
                  onDragStart={(event) => beginTaskImageDrag(event, task, taskIndex)}
                  onDragOver={(event) => handleResultReplaceDragOver(event, task)}
                  onDrop={(event) => handleResultReplaceDrop(event, task)}
                  onDragEnd={clearResultDragState}
                  onError={() => markTaskImageBroken(task)}
                  diagnostic={{ requestId: task.id, endpoint: "/api/generate-outfit", module: "批量生成", workflowMode: task.workflowMode || activeOutfitPage.workflowMode || "", placement: "outfit-card" }}
                />
              )}
              <ReferenceThumbTray
                references={references}
                count={referenceCount}
                className="assetReferenceTray"
                onOpen={(reference) => setImageLightbox({ title: reference.name || reference.label || "参考图", src: referenceSource(reference) })}
                onContextMenu={openReferenceContextMenu}
                onImageDragStart={beginReferenceImageDrag}
              />
              {promptText && (
                <button
                  className="assetPrompt"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void copyText(promptText, "提示词已复制");
                  }}
                  title={promptText}
                >
                  {promptText}
                </button>
              )}
              <div className="assetMeta">
                <span>{task.modelLabel || settings.model}</span>
                <strong>{task.imageSize || settings.imageSize} · {task.aspectRatio || settings.aspectRatio}</strong>
              </div>
            </article>
          );
        })}
        {visibleTasks.length === 0 && (
          <div className="emptyTasks">
            <Sparkles size={28} />
            <span>{resultFilter === "video" ? "视频模块暂未接入。" : isPoseRemixWorkflow ? "上传图1姿态参考图和图2固定母版成片后，点击生成。" : isRandomBackgroundWorkflow ? "上传图1人物图，并在场景补充里写大概场景后，点击生成。" : isOutpaintWorkflow ? "上传图1半身照后，点击生成向下扩图。" : isRecolorWorkflow ? "上传图1原图和图2颜色参考图后，点击生成。" : isFaceSwapWorkflow ? "上传图1目标人物图和图2人脸参考图后，点击生成。" : "上传模特图和服装图后，点击生成。"}</span>
          </div>
        )}
      </div>
    </section>
  );
}
