// src/features/outfit/panels/OutfitWorkbench.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出 outfit 主工作台（原内联巨石）。
// 内容（按执行单 §2.2 三段顺序搬，本文件逐步增长）：
//   ① topbar（结果筛选 tab + 工具栏）
//   ② outfitScrollArea（ResultQueue + assetGrid 上传区 + originalLibraryPanel 原图库）
//   ③ composerPanel（换装/精修设置 + 提示词/补充 + 底部生成控制条）—— 后续 commit 追加
// 模式：原闭包捕获的 state / handler / 派生值全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   模块级工具/常量（MAX_UPLOAD_IMAGES / GARMENT_PART_OPTIONS / sameGarmentParts /
//   normalizeGarmentComposition / garmentCompositionLabel / fileSize）与子组件（ResultQueue / UploadZone /
//   ImageFactsPanel）直接 import；GARMENT_PART_PRESET_OPTIONS 为父模块级常量，以同名 prop 传入。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V68 §3.2 负向对照 + v68-free-idents 兜底。
import {
  Check,
  Crop,
  Download,
  FolderOpen,
  Images,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Video
} from "lucide-react";
import { MAX_UPLOAD_IMAGES, UploadZone } from "../outfit-panels.jsx";
import {
  GARMENT_PART_OPTIONS,
  garmentCompositionLabel,
  normalizeGarmentComposition,
  sameGarmentParts
} from "../outfit-top.js";
import { fileSize } from "../../../lib/format/index.js";
import { ResultQueue } from "./ResultQueue.jsx";
import { ImageFactsPanel } from "./ImageFactsPanel.jsx";
import { Button } from "../../../shared/ui/Button";

export default function OutfitWorkbench({
  resultFilter,
  setResultFilter,
  tasks,
  imageCount,
  switchView,
  addEvent,
  activeOutfitPageId,
  renameOutfitPage,
  activeOutfitPage,
  refreshHistory,
  openDirectoryModal,
  openSaveDirectory,
  topbarStatus,
  topbarStatusText,
  downloadSelected,
  selectedCompletedCount,
  downloadAll,
  deleteSelected,
  selectedCount,
  clearAll,
  clearNonResultImageCache,
  changeGalleryZoom,
  galleryZoom,
  galleryZoomPercent,
  visibleTasks,
  selectedTaskIds,
  downloadFeedbackIds,
  brokenTaskImages,
  resultReplaceTargetId,
  galleryCardMin,
  taskGridRef,
  settings,
  isWhiteRefineWorkflow,
  isOutfitWorkflow,
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
  copyText,
  uploadLabels,
  editUploadLabel,
  modelImages,
  addImages,
  removeImage,
  toggleImage,
  reorderImage,
  replaceImage,
  clearImageGroup,
  setCropTarget,
  openLocalEdit,
  isDesignDraftWorkflow,
  setActiveUploadGroup,
  modelBulkMode,
  applyGroupPreprocess,
  clothingImages,
  clothingBulkMode,
  fixedClothingId,
  setMasterClothing,
  isBackgroundChangeWorkflow,
  selectedGarmentParts,
  selectedGarmentComposition,
  applyGarmentPartPreset,
  toggleGarmentPart,
  outfitIntent,
  selectedFixedClothing,
  outfitIntentSummary,
  outfitRecognizedFacts,
  imageFactsAnalyzing,
  factsDetailOpen,
  setFactsDetailOpen,
  analyzeImageFacts,
  updateOutfitFact,
  referenceImages,
  referenceBulkMode,
  originalLibrary,
  removeOriginalImage,
  GARMENT_PART_PRESET_OPTIONS,
}) {
  return (
    <>
      <header className="topbar">
        <div className="resultTabs">
          <Button size="sm" active={resultFilter === "all"} type="button" onClick={() => setResultFilter("all")}>
            全部({tasks.length})
          </Button>
          <Button size="sm" active={resultFilter === "image"} type="button" onClick={() => setResultFilter("image")}>
            <Images size={14} />
            <span>图片({imageCount})</span>
          </Button>
          <Button size="sm" type="button" onClick={() => { setResultFilter("all"); switchView("quick"); addEvent("视频", "已打开快捷视频生成"); }}>
            <Video size={14} />
            <span>视频(0)</span>
          </Button>
          <button
            className="outfitPageNameChip"
            type="button"
            onDoubleClick={() => renameOutfitPage(activeOutfitPageId)}
            title="双击修改页面名称"
          >
            <Pencil size={13} />
            <span>{activeOutfitPage.name}</span>
          </button>
        </div>
        <div className="topActions">
          <Button size="sm" type="button" onClick={() => void refreshHistory()}>
            <RefreshCw size={15} />
            <span>刷新</span>
          </Button>
          <Button size="sm" type="button" onClick={openDirectoryModal}>
            <FolderOpen size={15} />
            <span>指定文件夹</span>
          </Button>
          <Button size="sm" type="button" onClick={() => void openSaveDirectory()}>
            <FolderOpen size={15} />
            <span>打开保存目录</span>
          </Button>
          <span className={`taskBadge task-${topbarStatus}`}>{topbarStatusText}</span>
          <Button size="sm" type="button" onClick={downloadSelected} disabled={selectedCompletedCount === 0}>
            <Download size={15} />
            <span>下载选中</span>
          </Button>
          <Button size="sm" type="button" onClick={downloadAll} disabled={imageCount === 0}>
            <Download size={15} />
            <span>下载全部</span>
          </Button>
          <Button size="sm" tone="danger" type="button" onClick={deleteSelected} disabled={selectedCount === 0}>
            <Trash2 size={15} />
            <span>删除选中</span>
          </Button>
          <Button size="sm" tone="danger" type="button" onClick={clearAll}>
            <Trash2 size={15} />
            <span>清空全部</span>
          </Button>
          <Button size="sm" type="button" onClick={() => void clearNonResultImageCache()}>
            <RefreshCw size={15} />
            <span>清缓存</span>
          </Button>
          <div className="zoomControl">
            <button type="button" onClick={() => changeGalleryZoom(-0.1)} disabled={galleryZoom <= 0.75} aria-label="缩小图库">
              <Minus size={14} />
            </button>
            <span style={{ "--zoom-fill": `${Math.max(0, Math.min(100, ((galleryZoom - 0.75) / 0.7) * 100))}%` }} />
            <button type="button" onClick={() => changeGalleryZoom(0.1)} disabled={galleryZoom >= 1.45} aria-label="放大图库">
              <Plus size={14} />
            </button>
            <strong>{galleryZoomPercent}%</strong>
          </div>
        </div>
      </header>

      <div className="outfitScrollArea">
        <ResultQueue
          visibleTasks={visibleTasks}
          selectedTaskIds={selectedTaskIds}
          downloadFeedbackIds={downloadFeedbackIds}
          brokenTaskImages={brokenTaskImages}
          resultReplaceTargetId={resultReplaceTargetId}
          galleryCardMin={galleryCardMin}
          taskGridRef={taskGridRef}
          settings={settings}
          activeOutfitPage={activeOutfitPage}
          resultFilter={resultFilter}
          isWhiteRefineWorkflow={isWhiteRefineWorkflow}
          isPoseRemixWorkflow={isPoseRemixWorkflow}
          isRandomBackgroundWorkflow={isRandomBackgroundWorkflow}
          isOutpaintWorkflow={isOutpaintWorkflow}
          isRecolorWorkflow={isRecolorWorkflow}
          isFaceSwapWorkflow={isFaceSwapWorkflow}
          renderSplitHalvesStrip={renderSplitHalvesStrip}
          toggleTaskSelected={toggleTaskSelected}
          retryTask={retryTask}
          downloadTask={downloadTask}
          rerunResultTask={rerunResultTask}
          deleteResultTask={deleteResultTask}
          setPreview={setPreview}
          setImageLightbox={setImageLightbox}
          handleResultReplaceDragOver={handleResultReplaceDragOver}
          handleResultReplaceDrop={handleResultReplaceDrop}
          setResultReplaceTargetId={setResultReplaceTargetId}
          markTaskImageBroken={markTaskImageBroken}
          beginTaskImageDrag={beginTaskImageDrag}
          clearResultDragState={clearResultDragState}
          openReferenceContextMenu={openReferenceContextMenu}
          beginReferenceImageDrag={beginReferenceImageDrag}
          copyText={copyText}
        />

        <section className="assetGrid">
        <UploadZone
          primary
          title={`图1：${uploadLabels.model.title}`}
          hint={uploadLabels.model.hint}
          slotPrefix="图1："
          titleText={uploadLabels.model.title}
          hintText={uploadLabels.model.hint}
          onEditTitle={() => editUploadLabel("model", "title")}
          onEditHint={() => editUploadLabel("model", "hint")}
          items={modelImages}
          onPick={(files) => addImages("model", files)}
          onRemove={(id) => removeImage("model", id)}
          onToggle={(id) => toggleImage("model", id)}
          onReorder={(fromId, toId, placement) => reorderImage("model", fromId, toId, placement)}
          onReplace={(id, file) => void replaceImage("model", id, file)}
          onClear={() => clearImageGroup("model")}
          onPreview={(item) => setImageLightbox({ title: item.name, src: item.previewUrl })}
          onOpenCrop={(item) => setCropTarget({ group: "model", item })}
          onOpenLocalEdit={(item) => openLocalEdit("model", item)}
          localEditEnabled={!isDesignDraftWorkflow && !isPoseRemixWorkflow && !isOutpaintWorkflow && !isWhiteRefineWorkflow && !isRandomBackgroundWorkflow}
          maxCount={MAX_UPLOAD_IMAGES}
          onLimit={(message) => addEvent("图1上传", message)}
          onActivate={() => setActiveUploadGroup("model")}
          bulkMode={modelBulkMode}
          onBulkModeChange={(mode) => void applyGroupPreprocess("model", mode)}
        />
        {/* 2026-09-26（按用户要求）：精修页不再需要图2 —— 图1 本身就是多图上传，
            所有图片一起合成一张成品图。所以精修页只渲染图1 这一个上传区。
            其它分区的图2 原样保留；这里只是不渲染，已有的 clothingImages 数据不动。 */}
        {!isOutpaintWorkflow && !isRandomBackgroundWorkflow && !isWhiteRefineWorkflow && <div className="assetSide">
          <UploadZone
            compact
            title={`图2：${uploadLabels.clothing.title}`}
            hint={uploadLabels.clothing.hint}
            slotPrefix="图2："
            titleText={uploadLabels.clothing.title}
            hintText={uploadLabels.clothing.hint}
            onEditTitle={() => editUploadLabel("clothing", "title")}
            onEditHint={() => editUploadLabel("clothing", "hint")}
            items={clothingImages}
            onPick={(files) => addImages("clothing", files)}
            onRemove={(id) => removeImage("clothing", id)}
            onToggle={(id) => toggleImage("clothing", id)}
            onReorder={(fromId, toId, placement) => reorderImage("clothing", fromId, toId, placement)}
            onReplace={(id, file) => void replaceImage("clothing", id, file)}
            onClear={() => clearImageGroup("clothing")}
            onSetFixed={isWhiteRefineWorkflow ? null : isPoseRemixWorkflow ? settings.pairingMode === "fixed" ? setMasterClothing : null : setMasterClothing}
            fixedId={isWhiteRefineWorkflow || (isPoseRemixWorkflow && settings.pairingMode !== "fixed") ? "" : fixedClothingId}
            fixedTitle={isPoseRemixWorkflow ? "设为固定母版" : isFaceSwapWorkflow ? "设为固定人脸" : isBackgroundChangeWorkflow ? "设为固定场景" : isOutpaintWorkflow ? "设为主扩图参考" : isRecolorWorkflow ? "设为主颜色参考" : "设为固定服装"}
            onPreview={(item) => setImageLightbox({ title: item.name, src: item.previewUrl })}
            onOpenCrop={(item) => setCropTarget({ group: "clothing", item })}
            maxCount={(isOutfitWorkflow || isPoseRemixWorkflow || isFaceSwapWorkflow) ? 2 : MAX_UPLOAD_IMAGES}
            onLimit={(message) => addEvent("图2上传", message)}
            onActivate={() => setActiveUploadGroup("clothing")}
            bulkMode={clothingBulkMode}
            onBulkModeChange={(mode) => void applyGroupPreprocess("clothing", mode)}
            footerControls={isRecolorWorkflow ? (
              <div className="garmentTransferControls" aria-label="图2改色范围设置">
                <div className="garmentPartPresetGroup" aria-label="图2常用改色范围">
                  {GARMENT_PART_PRESET_OPTIONS.map((preset) => {
                    const active = sameGarmentParts(selectedGarmentParts, preset.parts)
                      && selectedGarmentComposition === normalizeGarmentComposition(preset.composition, preset.parts);
                    return (
                      <button
                        className={active ? "active" : ""}
                        key={preset.value}
                        type="button"
                        onClick={() => applyGarmentPartPreset(preset)}
                        aria-pressed={active}
                        title={`改色范围：${preset.label}；当前按${garmentCompositionLabel(preset.composition)}理解图2服装结构`}
                      >
                        <Check size={13} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="garmentPartPicker" aria-label="图2改色部位">
                  {GARMENT_PART_OPTIONS.map((part) => {
                    const active = selectedGarmentParts.includes(part.value);
                    return (
                      <button
                        className={active ? "active" : ""}
                        key={part.value}
                        type="button"
                        onClick={() => toggleGarmentPart(part.value)}
                        aria-pressed={active}
                        title={`图2改色${part.label}`}
                      >
                        <Check size={13} />
                        <span>{part.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            sideControls={isOutfitWorkflow ? <ImageFactsPanel
              outfitIntent={outfitIntent}
              selectedFixedClothing={selectedFixedClothing}
              outfitIntentSummary={outfitIntentSummary}
              outfitRecognizedFacts={outfitRecognizedFacts}
              imageFactsAnalyzing={imageFactsAnalyzing}
              factsDetailOpen={factsDetailOpen}
              setFactsDetailOpen={setFactsDetailOpen}
              analyzeImageFacts={analyzeImageFacts}
              updateOutfitFact={updateOutfitFact}
            /> : null}
          />
          {!isWhiteRefineWorkflow && <UploadZone
            compact
            title={`图3：${uploadLabels.reference.title}`}
            hint={uploadLabels.reference.hint}
            slotPrefix="图3："
            titleText={uploadLabels.reference.title}
            hintText={uploadLabels.reference.hint}
            onEditTitle={() => editUploadLabel("reference", "title")}
            onEditHint={() => editUploadLabel("reference", "hint")}
            items={referenceImages}
            onPick={(files) => addImages("reference", files)}
            onRemove={(id) => removeImage("reference", id)}
            onToggle={(id) => toggleImage("reference", id)}
            onReorder={(fromId, toId, placement) => reorderImage("reference", fromId, toId, placement)}
            onReplace={(id, file) => void replaceImage("reference", id, file)}
            onClear={() => clearImageGroup("reference")}
            onPreview={(item) => setImageLightbox({ title: item.name, src: item.previewUrl })}
            onOpenCrop={(item) => setCropTarget({ group: "reference", item })}
            maxCount={MAX_UPLOAD_IMAGES}
            onLimit={(message) => addEvent("图3上传", message)}
            onActivate={() => setActiveUploadGroup("reference")}
            bulkMode={referenceBulkMode}
            onBulkModeChange={(mode) => void applyGroupPreprocess("reference", mode)}
          />}
        </div>}
        </section>

        {/* 2026-09-26（按用户要求）：换装设置已搬到下方提示词区的左半边，
            这里不再占一整块竖向空间，图1~图3 下面直接就是原图库。 */}

        <section className="originalLibraryPanel">
        <header>
          <div>
            <h3>原图库</h3>
            <span>保留你上传的原始图片，方便后续重新取细节。</span>
          </div>
          <span>{originalLibrary.length} 张</span>
        </header>
        <div className="originalLibraryGrid">
          {originalLibrary.map((item) => (
            <article className="originalLibraryCard" key={item.id}>
              <button type="button" onClick={() => setImageLightbox({ title: item.name, src: item.url })}>
                <img src={item.url} alt="" />
              </button>
              <div>
                <strong title={item.name}>{item.name}</strong>
                <span>{fileSize(item.size)}</span>
              </div>
              <button type="button" onClick={() => removeOriginalImage(item.id)}>
                <Trash2 size={13} />
              </button>
            </article>
          ))}
          {originalLibrary.length === 0 && (
            <div className="emptyOriginal">
              <Crop size={22} />
              <span>上传后会自动保留原图副本</span>
            </div>
          )}
        </div>
        </section>
      </div>
    </>
  );
}
