// src/features/main-app/panels/main-canvas-board.jsx
// P6-5 (V4.0) 2026-10-15：从 src/main.jsx App() return 抽出的快捷生成画板（canvasBoard）展示组件。
// 逐字搬运（仅整体 dedent 4 空格对齐 return 惯例），无状态、无副作用；
// 全部数据与回调由 App() 以同名 props 下发（COUNT_OPTIONS 经 countOptions 下发，同 DetailView 口径，
// 避免面板反向 import main.jsx 成环）。
// 接线完整性由 P6-5 §4 负向对照兜底（scripts/dev/p6-5-propcheck.mjs G 项：props 双向一致）。
import React from "react";
import {
  Loader2,
  CheckSquare,
  Square,
  Check,
  Download,
  RefreshCw,
  Trash2,
  ImageOff,
  Image as ImageIcon,
  X,
  Crop,
  Scissors,
  BookOpen,
  Wand2,
  Play
} from "lucide-react";
import { CachedImage } from "../../../shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "../../../shared/ui/reference-thumb-tray.jsx";
import { ElapsedTimer } from "../../../shared/ui/elapsed-timer.jsx";
import DebouncedTextarea from "../../../shared/DebouncedTextarea.jsx";
import { imageSourceFromResult } from "../../../shared/models.js";
import { resultImageCardState } from "../../../shared/result-image.js";
import { channelPriceLabel } from "../../../shared/routing.js";
import { formatMs, fileSize } from "../../../lib/format/index.js";

export function MainCanvasBoard({
  quickGalleryRef,
  galleryCardMin,
  quickGalleryItems,
  brokenResultImages,
  selectedIds,
  quickResultReplaceTargetId,
  setQuickResultReplaceTargetId,
  openPreview,
  openContextMenu,
  handleQuickResultReplaceDragOver,
  handleQuickResultReplaceDrop,
  toggleSelected,
  downloadFeedbackIds,
  downloadItem,
  rerunResult,
  deleteResult,
  beginResultImageDrag,
  clearQuickResultDragState,
  markResultImageBroken,
  openReferencePreview,
  openReferenceContextMenu,
  beginReferenceImageDrag,
  copyText,
  quickResults,
  runningQuickTasks,
  status,
  error,
  isComposerDragging,
  onComposerDragOver,
  onComposerDragLeave,
  onComposerDrop,
  onComposerPaste,
  previewFiles,
  referenceDropTarget,
  beginReferenceDrop,
  endReferenceDrop,
  onReferenceDrop,
  draggingReferenceId,
  referenceSortTarget,
  beginReferenceSort,
  moveReferenceSort,
  endReferenceSort,
  cancelReferenceSort,
  openUploadPreview,
  removeReferenceImage,
  openQuickCropEdit,
  openQuickLocalEdit,
  settings,
  updateSetting,
  isQuickChannelMenuOpen,
  setIsQuickChannelMenuOpen,
  quickChannel,
  quickChannels,
  activeModel,
  inputRef,
  onPickFiles,
  models,
  ratios,
  quickSizes,
  quickMaxReferenceFiles,
  optimizePrompt,
  isQuickPromptOptimizing,
  generate,
  countOptions,
  events,
  onQuickBoardWheel,
  setFiles,
  setQuickCropEditTarget,
  setQuickLocalEditTarget,
  setIsPromptAssistantOpen
}) {
  return (
    <div className="canvasBoard" onWheel={onQuickBoardWheel}>
      <section ref={quickGalleryRef} className="galleryStrip" style={{ "--asset-card-min": `${galleryCardMin}px` }}>
        {quickGalleryItems.map((galleryItem, index) => {
          if (galleryItem.kind === "task") {
            const task = galleryItem.task;
            return (
              <article className="assetCard loadingCard" key={galleryItem.key}>
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
          const selected = selectedIds.has(item.id);
          return (
            <article
              className={`assetCard ${quickResultReplaceTargetId === item.id ? "replaceTarget" : ""}`}
              key={galleryItem.key}
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
                className={`assetDownloadButton ${downloadFeedbackIds.has(item.id) ? "downloaded" : ""}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void downloadItem(item, index);
                }}
                title="下载到指定文件夹"
                aria-label="下载到指定文件夹"
              >
                {downloadFeedbackIds.has(item.id) ? <Check size={16} /> : <Download size={16} />}
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
        })}
      </section>

      {quickResults.length === 0 && runningQuickTasks.length === 0 && (
        <div className="emptyCanvas">
          <ImageIcon size={34} />
          <span>{status === "failed" ? error : "暂无图片"}</span>
        </div>
      )}

      <section
        className={`composer ${isComposerDragging ? "dragging" : ""}`}
        onDragOver={onComposerDragOver}
        onDragLeave={onComposerDragLeave}
        onDrop={onComposerDrop}
        onPaste={onComposerPaste}
      >
        {/* 2026-09-25 UI 调整：删除悬浮框里的「图片生成 / 视频生成」页签。
            它与顶部结果栏的「全部 / 图片 / 视频」是同一功能的重复入口，
            切换逻辑和底层 setQuickMode 都保留（顶部栏仍然可以切）。 */}

        {previewFiles.length > 0 && (
          <div className="composerReferences">
            <div
              className={`referenceInsertZone ${referenceDropTarget?.type === "insert" && referenceDropTarget.index === 0 ? "active" : ""}`}
              onDragOver={(event) => beginReferenceDrop(event, "insert", 0)}
              onDragLeave={endReferenceDrop}
              onDrop={(event) => onReferenceDrop(event, "insert", 0)}
              title="拖到这里插入图片"
            />
            {previewFiles.map((item, index) => (
              <React.Fragment key={item.id || `${item.file.name}-${item.file.lastModified}-${index}`}>
                <div
                  className={`referenceThumbWrap ${draggingReferenceId === item.id ? "sorting" : ""} ${referenceSortTarget?.id === item.id ? (referenceSortTarget.placement === "after" ? "dropAfter" : "dropBefore") : ""}`}
                  data-reference-id={item.id}
                >
                  <div
                  className={`referenceThumb ${referenceDropTarget?.type === "replace" && referenceDropTarget.index === index ? "replaceTarget" : ""} ${item.cropEdit ? "cropEditReady" : ""} ${item.localEdit ? "localEditReady" : ""}`}
                  data-reference-index={index}
                  draggable={false}
                  onDragOver={(event) => beginReferenceDrop(event, "replace", index)}
                  onDragLeave={endReferenceDrop}
                  onDrop={(event) => onReferenceDrop(event, "replace", index)}
                  onPointerDown={(event) => beginReferenceSort(event, item)}
                  onPointerMove={moveReferenceSort}
                  onPointerUp={endReferenceSort}
                  onPointerCancel={cancelReferenceSort}
                  onClick={() => openUploadPreview(item)}
                  title={previewFiles.length > 1 ? `${item.file.name} · ${fileSize(item.file.size)}，按住可左右拖动调整顺序；拖新图到这里可替换` : `${item.file.name} · ${fileSize(item.file.size)}，拖新图到这里可替换`}
                >
                  <b>图{index + 1}</b>
                  <img src={item.url} alt={item.file.name} draggable={false} />
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); removeReferenceImage(index); }}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label="移除参考图"
                  >
                    <X size={12} />
                  </button>
                  </div>
                  <div className="referenceToolRow">
                    <button
                      className={`referenceToolButton ${item.cropEdit ? "active" : ""}`}
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openQuickCropEdit(item); }}
                      title={item.cropEdit ? "重新调整普通裁剪" : "普通裁剪"}
                      aria-label={item.cropEdit ? "重新调整普通裁剪" : "普通裁剪"}
                    >
                      <Crop size={14} />
                    </button>
                    <button
                      className={`referenceToolButton ${item.localEdit ? "active" : ""}`}
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openQuickLocalEdit(item); }}
                      title={item.localEdit ? "重新调整局部回贴" : "局部回贴"}
                      aria-label={item.localEdit ? "重新调整局部回贴" : "局部回贴"}
                    >
                      <Scissors size={14} />
                    </button>
                  </div>
                </div>
                <div
                  className={`referenceInsertZone ${referenceDropTarget?.type === "insert" && referenceDropTarget.index === index + 1 ? "active" : ""}`}
                  onDragOver={(event) => beginReferenceDrop(event, "insert", index + 1)}
                  onDragLeave={endReferenceDrop}
                  onDrop={(event) => onReferenceDrop(event, "insert", index + 1)}
                  title="拖到这里插入图片"
                />
              </React.Fragment>
            ))}
          </div>
        )}

        <DebouncedTextarea
          className="promptBox"
          value={settings.prompt}
          onChange={(value) => updateSetting("prompt", value)}
          placeholder="输入你要生成或修改的画面"
        />

        <div className="composerFooter">
          {/* 快捷悬浮框右上角功能组：与 3.0 快捷生成右上角四个功能一一对应。
              清空图片 / 提示词助手 / 优化提示词 / 渠道价格（线路价格）四个功能
              在本页只保留这一套入口；底部原来的同名入口已删除。 */}
          <div className="quickToolCluster" role="group" aria-label="快捷生成工具">
            <button
              className="quickToolButton"
              type="button"
              title="清空图片"
              aria-label="清空图片"
              onClick={() => { setFiles([]); setQuickCropEditTarget(null); setQuickLocalEditTarget(null); setIsQuickChannelMenuOpen(false); }}
            >
              <Trash2 size={15} />
            </button>
            <button
              className="quickToolButton"
              type="button"
              title="提示词助手"
              aria-label="提示词助手"
              onClick={() => { setIsPromptAssistantOpen(true); setIsQuickChannelMenuOpen(false); }}
            >
              <BookOpen size={15} />
            </button>
            <button
              className="quickToolButton"
              type="button"
              title="优化提示词"
              aria-label="优化提示词"
              disabled={isQuickPromptOptimizing}
              onClick={() => { setIsQuickChannelMenuOpen(false); void optimizePrompt(); }}
            >
              {isQuickPromptOptimizing ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
            </button>
            <button
              className={`quickToolButton channelPriceButton ${isQuickChannelMenuOpen ? "active" : ""}`}
              type="button"
              title={quickChannel ? `线路价格：${quickChannel.label} ${channelPriceLabel(quickChannel)}` : "线路价格：当前模型暂无可用线路"}
              aria-label="线路价格"
              aria-expanded={isQuickChannelMenuOpen}
              onClick={() => setIsQuickChannelMenuOpen((current) => !current)}
            >
              <span className="quickToolGlyph">¥</span>
            </button>

            {isQuickChannelMenuOpen && (
              <div className="quickChannelMenu" role="menu" aria-label="线路价格菜单">
                <div className="quickChannelMenuTitle">
                  {activeModel?.label || settings.model} 可用线路
                </div>
                {quickChannels.map((channel) => (
                  <button
                    key={channel.id}
                    className={`quickChannelItem ${quickChannel?.id === channel.id ? "active" : ""}`}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      updateSetting("channelId", channel.id);
                      setIsQuickChannelMenuOpen(false);
                    }}
                  >
                    <span>{channel.label}</span>
                    <em>{channelPriceLabel(channel)}</em>
                  </button>
                ))}
                {quickChannels.length === 0 && (
                  <p className="quickChannelEmpty">当前模型暂无可用线路，请检查渠道目录</p>
                )}
              </div>
            )}
          </div>

          <div className="leftTools">
            {/* 2026-09-25 UI 调整：删除可见的「上传」和「库/素材库」按钮。
                隐藏的 file input 与拖拽/粘贴上传能力全部保留（onPickFiles / onComposerDrop / onComposerPaste 未改动），
                只是不再提供这两个重复入口的按钮。 */}
            <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPickFiles} />
          </div>

          <div className="rightTools">
            <select value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
              {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
            </select>
            <select value={settings.aspectRatio} onChange={(event) => updateSetting("aspectRatio", event.target.value)}>
              {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
            <select value={settings.imageSize} onChange={(event) => updateSetting("imageSize", event.target.value)}>
              {quickSizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <select value={settings.n} onChange={(event) => updateSetting("n", event.target.value)}>
              {countOptions.filter((count) => count <= quickMaxReferenceFiles).map((count) => (
                <option key={count} value={count}>{count}张</option>
              ))}
            </select>
            <button className="generateButton" type="button" onClick={() => generate()}>
              {runningQuickTasks.length > 0 ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
              <span>生成</span>
            </button>
          </div>
        </div>
      </section>

      {events.length > 0 && (
        <div className="eventPill">
          <strong>{events[0].label}</strong>
          <span>{events[0].detail}</span>
        </div>
      )}
    </div>
  );
}
