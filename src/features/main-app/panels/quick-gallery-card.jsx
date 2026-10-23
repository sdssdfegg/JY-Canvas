// src/features/main-app/panels/quick-gallery-card.jsx
// V5.0-001 (2026-10-23)：从 src/features/main-app/panels/main-canvas-board.jsx 的
// `quickGalleryItems.map(...)` 内联结果卡（约 118 行 JSX，含 task 加载卡 + result 卡两分支）
// 逐字抽取为 React.memo 组件。纯搬运：父作用域引用全部改为同名 props；无新状态、无新副作用；
// className / 事件语义 / 子组件（CachedImage / ReferenceThumbTray / ElapsedTimer）调用参数零改动。
// 行为等价由 V5.0-001 §3 P0 验收清单兜底（逐项点击验证）。
// V5.0-002 (2026-10-23)：props 收敛——上游 15 个 handler 由父组件「晚期绑定委托」稳定化（见 main-canvas-board.jsx），
// 整包集合 selectedIds/downloadFeedbackIds/quickResultReplaceTargetId 改由父组件每卡派生布尔 isSelected/isDownloaded/isReplaceTarget 透传，
// 使 React.memo 在常态（非卡片相关状态变更）真正 bail、杜绝全树重渲染。brokenResultImages 保留整包（仅缺图时变更，不破常态 memo）。
import React from "react";
import {
  Loader2,
  CheckSquare,
  Square,
  Check,
  Download,
  RefreshCw,
  Trash2,
  ImageOff
} from "lucide-react";
import { CachedImage } from "../../../shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "../../../shared/ui/reference-thumb-tray.jsx";
import { ElapsedTimer } from "../../../shared/ui/elapsed-timer.jsx";
import { imageSourceFromResult } from "../../../shared/models.js";
import { resultImageCardState } from "../../../shared/result-image.js";
import { formatMs } from "../../../lib/format/index.js";

export const QuickGalleryCard = React.memo(function QuickGalleryCard({
  galleryItem,
  index,
  brokenResultImages,
  isSelected,
  isDownloaded,
  isReplaceTarget,
  setQuickResultReplaceTargetId,
  openPreview,
  openContextMenu,
  handleQuickResultReplaceDragOver,
  handleQuickResultReplaceDrop,
  toggleSelected,
  downloadItem,
  rerunResult,
  deleteResult,
  beginResultImageDrag,
  clearQuickResultDragState,
  markResultImageBroken,
  openReferencePreview,
  openReferenceContextMenu,
  beginReferenceImageDrag,
  copyText
}) {
  if (galleryItem.kind === "task") {
    const task = galleryItem.task;
    return (
      <article className="assetCard loadingCard">
        <Loader2 className="spin" size={28} />
        <span>生成中</span>
        <strong><ElapsedTimer startedAt={task.startedAt} /></strong>
        <em>{task.modelLabel} · {task.imageSize} · {task.aspectRatio}</em>
      </article>
    );
  }
  const item = galleryItem.result;
  const src = imageSourceFromResult(item.image);
  // P1 缺图自愈：已知失效（服务端标记）或加载失败过 → 不再发请求，直接显示原因。
  // 失败标记带 src 快照：重刷后地址变了就自动失效，不会把新图也判成坏图。
  const cardState = resultImageCardState(item.image, imageSourceFromResult);
  const brokenEntry = brokenResultImages[item.id];
  const brokenReason = cardState.missing
    ? cardState.reason
    : (brokenEntry && brokenEntry.src === src ? brokenEntry.reason : "");
  const selected = isSelected;
  return (
    <article
      className={`assetCard ${isReplaceTarget ? "replaceTarget" : ""}`}
      onClick={() => openPreview(item)}
      onContextMenu={(event) => openContextMenu(event, item.id)}
      onDragOver={(event) => handleQuickResultReplaceDragOver(event, item)}
      onDragLeave={() => setQuickResultReplaceTargetId((current) => current === item.id ? "" : current)}
      onDrop={(event) => handleQuickResultReplaceDrop(event, item)}
    >
      <button
        className="selectBox"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggleSelected(item.id);
        }}
        aria-label="选择图片"
      >
        {selected ? <CheckSquare size={24} /> : <Square size={24} />}
      </button>
      <button
        className={`assetDownloadButton ${isDownloaded ? "downloaded" : ""}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void downloadItem(item, index);
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
          rerunResult(item, 1);
        }}
        title="重刷这张结果"
        aria-label="重刷这张结果"
      >
        <RefreshCw size={15} />
      </button>
      <button
        className="assetDeleteButton"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          deleteResult(item.id);
        }}
        title="删除这张结果"
        aria-label="删除这张结果"
      >
        <Trash2 size={15} />
      </button>
      {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
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
          alt={`生成图片 ${index + 1}`}
          draggable
          onDragStart={(event) => beginResultImageDrag(event, item, index)}
          onDragEnd={clearQuickResultDragState}
          onError={() => markResultImageBroken(item)}
          diagnostic={{ requestId: item.requestId || item.id, endpoint: "/api/images", module: "快捷生成", placement: "quick-card" }}
        />
      )}
      <ReferenceThumbTray references={item.references} count={item.referenceCount} className="assetReferenceTray" onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
      {item.prompt && (
        <button
          className="assetPrompt"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            copyText(item.prompt, "提示词已复制");
          }}
          title={item.prompt}
        >
          {item.prompt}
        </button>
      )}
      <div className="assetMeta">
        <span>{item.modelLabel}</span>
        <strong>{item.imageSize} · {item.aspectRatio}</strong>
      </div>
    </article>
  );
});
