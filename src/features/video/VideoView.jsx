import { Loader2, Download, Video, Plus, BookOpen, Flame, Play } from "lucide-react";
import { StableTextarea } from "../../shared/ui/stable-textarea.jsx";
import { ElapsedTimer } from "../../shared/ui/elapsed-timer.jsx";
import { UploadClearButton } from "../../shared/ui/UploadClearButton";
import { Button } from "../../shared/ui/Button";
import { formatMs } from "../../lib/format/index.js";

// 视频面板视图（V58 从 src/main.jsx 迁出）。纯 JSX，无状态。
// 状态与编排全部来自 videoApi（src/features/video/video-state.js 的 useVideoState 返回值）。
// 与图片快捷生成共享的件（isComposerDragging / onComposerDragLeave / onComposerPaste / downloadVideoResult /
// 顶层 settings·events·galleryZoom·copyText·setIsPromptAssistantOpen）由 App() 下发为 props。

export function VideoView({
  videoApi,
  isComposerDragging,
  onComposerDragLeave,
  onComposerPaste,
  downloadVideoResult,
  setIsPromptAssistantOpen,
  events,
  galleryZoom,
  copyText
}) {
  const {
    videoSettings,
    videoReferenceFile,
    setVideoReferenceFile,
    videoResults,
    videoTasks,
    videoStatus,
    videoError,
    videoReferenceInputRef,
    videoModels,
    videoRatios,
    videoResolutions,
    videoDurations,
    videoPromptHint,
    videoPriceText,
    videoBillingRequired,
    billingGatewayEnabled,
    videoReferencePreview,
    runningVideoTasks,
    updateVideoSetting,
    onPickVideoReference,
    onVideoComposerDragOver,
    onVideoComposerDrop,
    generateVideoFromComposer
  } = videoApi;

  return (
    <div className="canvasBoard videoCanvasBoard">
      <section className="galleryStrip videoGalleryStrip" style={{ "--asset-card-min": `${Math.round(236 * galleryZoom)}px` }}>
        {videoTasks.map((task) => (
          <article className="assetCard loadingCard videoAssetCard" key={task.id}>
            <Loader2 className="spin" size={28} />
            <span>{task.statusText || "视频生成中"}</span>
            <strong><ElapsedTimer startedAt={task.startedAt} /></strong>
            <em>{task.modelLabel} · {task.resolution} · {task.aspectRatio} · {task.duration}s</em>
          </article>
        ))}
        {videoResults.map((item) => (
          <article className="assetCard videoAssetCard" key={item.id}>
            <button
              className="assetDownloadButton"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                downloadVideoResult(item);
              }}
              title="下载视频"
              aria-label="下载视频"
            >
              <Download size={16} />
            </button>
            {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
            <video src={item.url} controls preload="metadata" />
            {item.prompt && (
              <button
                className="assetPrompt"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  copyText(item.prompt, "视频提示词已复制");
                }}
                title={item.prompt}
              >
                {item.prompt}
              </button>
            )}
            <div className="assetMeta">
              <span>{item.modelLabel}</span>
              <strong>{item.resolution} · {item.aspectRatio} · {item.duration}s</strong>
            </div>
          </article>
        ))}
      </section>

      {videoResults.length === 0 && runningVideoTasks.length === 0 && (
        <div className="emptyCanvas">
          <Video size={34} />
          <span>{videoStatus === "failed" ? videoError : "暂无视频"}</span>
        </div>
      )}

      <section
        className={`composer videoComposer ${isComposerDragging ? "dragging" : ""}`}
        onDragOver={onVideoComposerDragOver}
        onDragLeave={onComposerDragLeave}
        onDrop={onVideoComposerDrop}
        onPaste={onComposerPaste}
      >
        {videoPriceText && <span className="videoPriceBadge">{videoPriceText}</span>}

        <div className="videoReferenceLine">
          <input ref={videoReferenceInputRef} type="file" accept="image/*" onChange={onPickVideoReference} />
          <button className="videoReferenceTile" type="button" onClick={() => videoReferenceInputRef.current?.click()}>
            {videoReferencePreview ? (
              <>
                <img src={videoReferencePreview.url} alt={videoReferencePreview.file.name} />
                <span>{videoReferencePreview.file.name}</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span>参考图</span>
              </>
            )}
          </button>
          <input
            className="videoUrlInput"
            value={videoSettings.imageUrl}
            onChange={(event) => updateVideoSetting("imageUrl", event.target.value)}
            placeholder="图片参考 URL，可留空"
          />
          {(videoReferenceFile || videoSettings.imageUrl) && (
            <UploadClearButton onClick={() => { setVideoReferenceFile(null); updateVideoSetting("imageUrl", ""); }} />
          )}
        </div>

        <StableTextarea
          className="promptBox videoPromptBox"
          value={videoSettings.prompt}
          onChange={(event) => updateVideoSetting("prompt", event.target.value)}
          placeholder={videoPromptHint}
        />

        <div className="composerFooter">
          <div className="leftTools">
            <Button size="sm" onClick={() => setIsPromptAssistantOpen(true)}>
              <BookOpen size={16} />
              <span>词</span>
            </Button>
            <Button
              size="sm"
              active={videoSettings.outputAudio}
              onClick={() => updateVideoSetting("outputAudio", !videoSettings.outputAudio)}
            >
              <Flame size={16} />
              <span>{videoSettings.outputAudio ? "音频开" : "音频关"}</span>
            </Button>
            {videoBillingRequired && !billingGatewayEnabled && <span className="videoBillingBadge">计费未接入</span>}
          </div>

          <div className="rightTools videoRightTools">
            <select value={videoSettings.model} onChange={(event) => updateVideoSetting("model", event.target.value)}>
              {videoModels.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
            </select>
            <select value={videoSettings.aspectRatio} onChange={(event) => updateVideoSetting("aspectRatio", event.target.value)}>
              {videoRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
            <select value={videoSettings.resolution} onChange={(event) => updateVideoSetting("resolution", event.target.value)}>
              {videoResolutions.map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
            </select>
            <select value={videoSettings.duration} onChange={(event) => updateVideoSetting("duration", event.target.value)}>
              {videoDurations.map((duration) => <option key={duration} value={duration}>{duration}s</option>)}
            </select>
            <Button
              size="lg"
              tone="primary"
              onClick={() => void generateVideoFromComposer()}
              disabled={runningVideoTasks.length > 0}
            >
              {runningVideoTasks.length > 0 ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
              <span>生成视频</span>
            </Button>
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
