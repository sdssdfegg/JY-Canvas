import { Loader2, Download, Check, Layers, Play, Wand2 } from "lucide-react";
import { StableTextarea } from "../../shared/ui/stable-textarea.jsx";
import { ElapsedTimer } from "../../shared/ui/elapsed-timer.jsx";
import { DetailUploadZone } from "../../features/crop/quick-crop-panels.jsx";
import ChannelPicker from "../../shared/ui/ChannelPicker.jsx";
import { CachedImage } from "../../shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "../../shared/ui/reference-thumb-tray.jsx";
import { MAX_REFERENCE_REWRITE_FILES } from "../../features/upload/reference-upload.js";
import { imageSourceFromResult } from "../../shared/models.js";
import { formatMs } from "../../lib/format/index.js";

// 参考生图面板视图（V59 从 src/main.jsx 迁出）。纯 JSX，无状态。
// 状态与编排全部来自 referenceApi（src/features/reference-remix/reference-state.js 的 useReferenceState 返回值）。
// 与图片快捷生成 / 视频 composer 共享的件（openPreview / openContextMenu / downloadItem / copyText /
// beginResultImageDrag / openReferencePreview / openReferenceContextMenu / beginReferenceImageDrag /
// openUploadPreview / markDeferredFeature）由 App() 下发为 props。
// COUNT_OPTIONS / REFERENCE_STRENGTH_OPTIONS / referenceControlOptions 为 main.jsx 模块级常量，作为 props 下发。

export function ReferenceRemixView({
  referenceApi,
  events,
  downloadFeedbackIds,
  models,
  config,
  openPreview,
  openContextMenu,
  downloadItem,
  copyText,
  beginResultImageDrag,
  openReferencePreview,
  openReferenceContextMenu,
  beginReferenceImageDrag,
  openUploadPreview,
  markDeferredFeature,
  countOptions,
  referenceStrengthOptions,
  referenceControlOptions
}) {
  const {
    referenceSettings,
    referenceProductFiles,
    referenceStyleFiles,
    referenceProductPreviews,
    referenceStylePreviews,
    referenceProductInputRef,
    referenceStyleInputRef,
    addReferenceRewriteFiles,
    removeReferenceRewriteFile,
    clearReferenceRewriteFiles,
    updateReferenceSetting,
    isReferencePromptRewriting,
    applySmartReferencePrompt,
    generateReferenceRemix,
    referenceGalleryItems,
    runningReferenceTasks,
    referenceResults,
    referenceStatus,
    referenceError,
    referenceModel,
    referenceRatios,
    referenceSizes
  } = referenceApi;

  return (
    <section className="referenceWorkbench">
      <aside className="referenceInputPanel">
        <div className="detailPanelScroll">
          <DetailUploadZone
            title="产品图（主体锁定）"
            subtitle={`产品图 + 参考图合计最多 ${MAX_REFERENCE_REWRITE_FILES} 张`}
            previews={referenceProductPreviews}
            count={referenceProductFiles.length + referenceStyleFiles.length}
            maxCount={MAX_REFERENCE_REWRITE_FILES}
            inputRef={referenceProductInputRef}
            onPick={(event) => {
              addReferenceRewriteFiles("product", event.target.files);
              event.target.value = "";
            }}
            onAddFiles={(fileList) => addReferenceRewriteFiles("product", fileList)}
            onRemove={(index) => removeReferenceRewriteFile("product", index)}
            onPreview={openUploadPreview}
            onAssetLibrary={() => markDeferredFeature("素材库")}
            onClear={() => clearReferenceRewriteFiles("product")}
          />

          <DetailUploadZone
            title="参考图（运营参考）"
            subtitle={`元素、构图、场景方向 · 与产品图合计最多 ${MAX_REFERENCE_REWRITE_FILES} 张`}
            previews={referenceStylePreviews}
            count={referenceProductFiles.length + referenceStyleFiles.length}
            maxCount={MAX_REFERENCE_REWRITE_FILES}
            inputRef={referenceStyleInputRef}
            onPick={(event) => {
              addReferenceRewriteFiles("style", event.target.files);
              event.target.value = "";
            }}
            onAddFiles={(fileList) => addReferenceRewriteFiles("style", fileList)}
            onRemove={(index) => removeReferenceRewriteFile("style", index)}
            onPreview={openUploadPreview}
            onAssetLibrary={() => markDeferredFeature("素材库")}
            onClear={() => clearReferenceRewriteFiles("style")}
          />

          <div className="detailDivider" />

          <section className="detailFormSection">
            {/* 2026-09-26：参考生图的渠道入口与「参考控制」参数区同一行，
                与快捷生成/一键详情共用 src/shared/ui/ChannelPicker.jsx；
                渠道状态保存在本页自己的 referenceSettings.channelId 里，互不污染。 */}
            <div className="detailFormHeader">
              <h3>参考控制</h3>
              <ChannelPicker
                model={referenceSettings.model}
                modelLabel={referenceModel?.label || referenceSettings.model}
                channelId={referenceSettings.channelId}
                routing={config.routing || config}
                onChange={(channelId) => updateReferenceSetting("channelId", channelId)}
              />
            </div>
            <div className="detailParamGrid">
              <label>
                <span>图片模型</span>
                <select value={referenceSettings.model} onChange={(event) => updateReferenceSetting("model", event.target.value)}>
                  {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
              </label>
              <label>
                <span>图片比例</span>
                <select value={referenceSettings.aspectRatio} onChange={(event) => updateReferenceSetting("aspectRatio", event.target.value)}>
                  {referenceRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
              </label>
              <label>
                <span>分辨率</span>
                <select value={referenceSettings.imageSize} onChange={(event) => updateReferenceSetting("imageSize", event.target.value)}>
                  {referenceSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <label>
                <span>生成数量</span>
                <select value={referenceSettings.n} onChange={(event) => updateReferenceSetting("n", event.target.value)}>
                  {countOptions.map((count) => <option key={count} value={count}>{count}张</option>)}
                </select>
              </label>
              <label>
                <span>参考值</span>
                <select value={referenceSettings.strength} onChange={(event) => updateReferenceSetting("strength", event.target.value)}>
                  {referenceStrengthOptions.map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
              </label>
              <label>
                <span>参考元素</span>
                <select value={referenceSettings.element} onChange={(event) => updateReferenceSetting("element", event.target.value)}>
                  {referenceControlOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>参考构图</span>
                <select value={referenceSettings.composition} onChange={(event) => updateReferenceSetting("composition", event.target.value)}>
                  {referenceControlOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>参考场景主题</span>
                <select value={referenceSettings.scene} onChange={(event) => updateReferenceSetting("scene", event.target.value)}>
                  {referenceControlOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="detailFormSection">
            <div className="referencePromptHeader">
              <h3>整体提示词</h3>
              <button className="smallButton" type="button" onClick={() => void applySmartReferencePrompt()} disabled={isReferencePromptRewriting}>
                {isReferencePromptRewriting ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
                <span>智能扩写提示词</span>
              </button>
            </div>
            <label className="detailField">
              <span>生成要求</span>
              <StableTextarea
                value={referenceSettings.prompt}
                onChange={(event) => updateReferenceSetting("prompt", event.target.value)}
                placeholder="例：生成一张女装主图，浅色调，干净电商质感，突出面料和版型，不要照抄参考图文字。"
              />
            </label>
            <p className="referenceHint">
              30% 以下参考意义很弱，所以这里从 30% 起步；参考越高越接近运营图方向，但后台会强制避开照抄、品牌、水印和相同文字。
            </p>
          </section>
        </div>

        <div className="detailPanelFooter">
          <button className="generateButton" type="button" onClick={() => void generateReferenceRemix()}>
            {runningReferenceTasks.length > 0 ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            <span>生成参考图</span>
          </button>
        </div>
      </aside>

      <section className="referenceResultBoard">
        <header className="referenceBoardHeader">
          <div>
            <strong>参考生图结果</strong>
            <span>结果只保存在参考生图模块，不进入快捷生成和一键详情分屏。</span>
          </div>
        </header>

        <div className="referenceGallery">
          {referenceGalleryItems.map((galleryItem, index) => {
            if (galleryItem.kind === "task") {
              const task = galleryItem.task;
              return (
                <article className="assetCard loadingCard referenceAssetCard" key={galleryItem.key}>
                  <Loader2 className="spin" size={28} />
                  <span>参考生图中</span>
                  <strong><ElapsedTimer startedAt={task.startedAt} /></strong>
                  <em>{task.modelLabel} · {task.imageSize} · {task.aspectRatio}</em>
                </article>
              );
            }
            const item = galleryItem.result;
            const src = imageSourceFromResult(item.image);
            const promptText = item.displayPrompt || item.prompt;
            return (
              <article
                className="assetCard referenceAssetCard"
                key={galleryItem.key}
                onClick={() => openPreview(item)}
                onContextMenu={(event) => openContextMenu(event, item.id)}
              >
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
                {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
                <CachedImage src={src} alt={`参考生图 ${index + 1}`} draggable onDragStart={(event) => beginResultImageDrag(event, item, index)} diagnostic={{ requestId: item.requestId || item.id, endpoint: "/api/images", module: "参考生图", placement: "reference-card" }} />
                <ReferenceThumbTray references={item.references} count={item.referenceCount} className="assetReferenceTray" onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
                {promptText && (
                  <button
                    className="assetPrompt"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      copyText(promptText, "提示词已复制");
                    }}
                    title={promptText}
                  >
                    {promptText}
                  </button>
                )}
                <div className="assetMeta">
                  <span>{item.modelLabel}</span>
                  <strong>{item.referenceStrength || referenceSettings.strength}% · {item.imageSize}</strong>
                </div>
              </article>
            );
          })}
        </div>

        {referenceResults.length === 0 && runningReferenceTasks.length === 0 && (
          <div className="referenceEmpty">
            <Layers size={34} />
            <span>{referenceStatus === "failed" ? referenceError : "上传产品图和运营参考图后开始生成"}</span>
          </div>
        )}

        {events.length > 0 && (
          <div className="eventPill">
            <strong>{events[0].label}</strong>
            <span>{events[0].detail}</span>
          </div>
        )}
      </section>
    </section>
  );
}
