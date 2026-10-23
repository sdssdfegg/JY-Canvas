// src/features/outfit/panels/result-card.jsx
// V5.0-006 (2026-10-24)：从 src/features/outfit/panels/ResultQueue.jsx 的
// `visibleTasks.map(...)` 内联卡（两个分支：非 success 状态卡 :74-108 / success 结果卡 :120-237）
// 逐字抽取为两个 React.memo 组件。纯搬运：父作用域引用全部改为同名 props；无新状态、无新副作用；
// className / 事件语义 / 子组件（CachedImage / ReferenceThumbTray / ElapsedTimer）调用参数零改动。
// 与 V5.0-001/002（主画廊 quick-gallery-card.jsx）同款手法：
//   · 上游 16 个 handler 由父组件「晚期绑定委托」稳定化（见 ResultQueue.jsx），逐项展开传入；
//   · 整包集合 selectedTaskIds/downloadFeedbackIds/resultReplaceTargetId/brokenTaskImages
//     改由父组件每卡派生布尔/单条（selected/isDownloaded/isReplaceTarget/brokenEntry）透传，
//     使 React.memo 在常态真正 bail、杜绝批量结果区全树重渲染。
// 派生值（durationMs/references/referenceCount/promptText/src/cardState/brokenReason/hasCropReturn）
// 全部下沉到卡内计算：父组件 map 里只留 O(1) 的集合查询，卡 bail 时这些开销一并省掉。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V5.0-006 §3.4 负向对照兜底。
import React from "react";
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

// ── 非 success 分支：running / failed 状态卡（原 ResultQueue.jsx:74-108）──────────
export const TaskStatusCard = React.memo(function TaskStatusCard({
  task,
  selected,
  settings,
  toggleTaskSelected,
  retryTask
}) {
  const failed = task.status === "failed";
  const runningTask = task.status === "running";
  const canRetry = failed && canRerunTask(task);
  return (
    <article className={`assetCard loadingCard outfitAssetCard ${task.status} ${selected ? "selected" : ""}`}>
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
});

// ── success 分支：结果卡（原 ResultQueue.jsx:120-237）──────────────────────────────
export const ResultCard = React.memo(function ResultCard({
  task,
  taskIndex,
  selected,
  isDownloaded,
  isReplaceTarget,
  brokenEntry,
  settings,
  workflowMode,
  toggleTaskSelected,
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
  const promptText = task.prompt || settings.prompt;
  const src = displayResultImageSource(task.result);
  // P1 缺图自愈：已知失效或加载失败过 → 不再重复请求，直接显示可读原因。
  const cardState = resultImageCardState(task.result, displayResultImageSource);
  // 会话内的失败标记优先，其次用持久化在任务记录里的标记（重载后依然生效）。
  const brokenReason = cardState.missing
    ? cardState.reason
    : (brokenEntry && brokenEntry.src === src ? brokenEntry.reason : "");
  const hasCropReturn = taskHasCropReturnResult(task);
  const durationMs = taskDurationMs(task);
  const fallbackReferences = taskReferencePreviewItems(task);
  const storedReferences = sanitizeTaskReferenceThumbs(task.referenceThumbs);
  const references = storedReferences.length ? storedReferences : fallbackReferences;
  const referenceCount = Math.max(
    Number(task.referenceCount || 0),
    references.length,
    fallbackReferences.length
  );
  return (
    <article
      className={`assetCard outfitAssetCard success ${selected ? "selected" : ""} ${task.rerunCandidate ? "rerunCandidate" : ""} ${hasCropReturn ? "cropReturnResult" : ""} ${isReplaceTarget ? "replaceTarget" : ""}`}
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
        className={`assetDownloadButton ${isDownloaded ? "downloaded" : ""}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void downloadTask(task);
        }}
        title="下载到指定文件夹"
        aria-label="下载到指定文件夹"
      >
        {isDownloaded ? <Check size={16} /> : <Download size={16} />}
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
          diagnostic={{ requestId: task.id, endpoint: "/api/generate-outfit", module: "批量生成", workflowMode: task.workflowMode || workflowMode || "", placement: "outfit-card" }}
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
});
