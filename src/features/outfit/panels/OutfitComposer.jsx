// src/features/outfit/panels/OutfitComposer.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出 composerPanel
// （换装/精修设置 + 通用换装提示词/补充 + 底部生成控制条 + 结果页签行）。
// 模式：原闭包捕获的 state / handler / 派生值 / 常量全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   子组件（OutfitIntentPanel / RetouchIntentPanel / OutfitPageRow / DebouncedTextarea）与图标（Loader2 / Play）直接 import；
//   props 漏项 = 运行期 undefined（vite build 验不出），由 eslint no-undef 兜底。
import { Check, Loader2, Play } from "lucide-react";
import DebouncedTextarea from "../../../shared/DebouncedTextarea.jsx";
import { OutfitIntentPanel } from "./OutfitIntentPanel.jsx";
import { RetouchIntentPanel } from "./RetouchIntentPanel.jsx";
import { OutfitPageRow } from "./OutfitPageRow.jsx";
import { Button } from "../../../shared/ui/Button";
import { MAX_UPLOAD_IMAGES } from "../outfit-image-utils.js";
import { UploadZone } from "./OutfitUploadZone.jsx";
import { RECOLOR_PART_OPTIONS } from "../outfit-top.js";
import { UPPER_LAYER_OPTIONS } from "../../../shared/outfit-intent.js";

export default function OutfitComposer({
  isOutfitWorkflow,
  isWhiteRefineWorkflow,
  isOutpaintWorkflow,
  isRandomBackgroundWorkflow,
  isPoseRemixWorkflow,
  isFaceSwapWorkflow,
  isBackgroundChangeWorkflow,
  outfitIntent,
  outfitLayer,
  outfitPreview,
  outfitWearingFieldList,
  wearingDetailOpen,
  setWearingDetailOpen,
  toggleOutfitPart,
  patchOutfitIntent,
  updateOutfitWearingValue,
  wearingFieldValue,
  retouchIntent,
  patchRetouchIntent,
  // V78：中线裁剪开关随「正反」归位到精修设置区（原在结果区头部）。
  splitHalves,
  onToggleSplitHalves,
  splitNote,
  promptFieldRef,
  promptFieldTitle,
  promptFieldPlaceholder,
  outfitPromptHandEditedRef,
  retouchPromptHandEditedRef,
  updateSetting,
  settings,
  OUTFIT_AUTO_PROMPT_CHAR_LIMIT,
  outfitAutoPrompt,
  addEvent,
  RETOUCH_AUTO_PROMPT_CHAR_LIMIT,
  retouchPreview,
  retouchAutoPrompt,
  productNoteFieldTitle,
  productNotePlaceholder,
  outfitIntentSummary,
  outfitPages,
  activeOutfitPageId,
  draggedPageId,
  pageDropTarget,
  activePageDeleteLocked,
  setIsPromptAssistantOpen,
  switchOutfitPage,
  renameOutfitPage,
  updateOutfitPageDropTarget,
  setPageDropTarget,
  dropOutfitPage,
  endOutfitPageDrag,
  beginOutfitPageDrag,
  createOutfitPageFromCurrent,
  toggleOutfitPageDeleteLock,
  deleteOutfitPage,
  models,
  outfitChannels,
  ratios,
  outfitSizes,
  globalBulkMode,
  applyGlobalPreprocess,
  preprocessModeLabel,
  normalizeRandomBackgroundFocus,
  PREPROCESS_OPTIONS,
  RANDOM_BACKGROUND_FOCUS_OPTIONS,
  generationCount,
  GENERATION_COUNT_OPTIONS,
  plannedGenerationCount,
  running,
  canAppendWhileRunning,
  inlineMessage,
  startBatch,
  handlePromptKeyDown,
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
  isCustomWorkflow,
  recolorPart,
  onSelectRecolorPart,
  recolorUpperLayer,
  onSelectRecolorUpperLayer,
  clothingImages,
  /* V77 Park：统一处理/新上传默认停用，但数据流保留 —— 以下 4 个 props 仍由父级按原名传入，
     本地别名成 _ 前缀（eslint 允许的未使用参数命名）。恢复 = 去掉 _ 前缀并传回 UploadZone。 */
  clothingBulkMode: _clothingBulkMode,
  setMasterClothing,
  fixedClothingId,
  referenceImages,
  referenceBulkMode: _referenceBulkMode,
  setActiveUploadGroup,
  modelBulkMode: _modelBulkMode,
  applyGroupPreprocess: _applyGroupPreprocess,
  setImageLightbox
}) {
  // V124（用户要求）：上装层级仅当「更换部位=上装」时可编辑；其余部位时整组置灰、不可选。
  const upperLayerDisabled = recolorPart !== "upper";
  return (
<section className="composerPanel">
  <section className="assetGrid">
    <UploadZone
      compact
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
      columns={4}
      /* V77（用户要求·停用）：统一处理/新上传默认停用；数据流与 handler 保留，
         恢复时传回 bulkMode={modelBulkMode}、onBulkModeChange={(mode) => void applyGroupPreprocess("model", mode)} */
    />
    {/* 2026-09-26（按用户要求）：精修页不再需要图2 —— 图1 本身就是多图上传，
        所有图片一起合成一张成品图。所以精修页只渲染图1 这一个上传区。
        其它分区的图2 原样保留；这里只是不渲染，已有的 clothingImages 数据不动。 */}
    {/* V76（用户要求·暂时隐藏）：图2服装事实面板停止渲染；数据/handler/组件文件保留，恢复时传回 sideControls */}
    {!isOutpaintWorkflow && !isRandomBackgroundWorkflow && !isWhiteRefineWorkflow && (
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
        fixedTitle={isPoseRemixWorkflow ? "设为固定母版" : isFaceSwapWorkflow ? "设为固定人脸" : isBackgroundChangeWorkflow ? "设为固定场景" : isOutpaintWorkflow ? "设为主扩图参考" : "设为固定服装"}
        onPreview={(item) => setImageLightbox({ title: item.name, src: item.previewUrl })}
        onOpenCrop={(item) => setCropTarget({ group: "clothing", item })}
        maxCount={(isOutfitWorkflow || isPoseRemixWorkflow || isFaceSwapWorkflow) ? 2 : MAX_UPLOAD_IMAGES}
        onLimit={(message) => addEvent("图2上传", message)}
        onActivate={() => setActiveUploadGroup("clothing")}
        /* V77（用户要求·停用）：统一处理/新上传默认停用；数据流与 handler 保留，
           恢复时传回 bulkMode={clothingBulkMode}、onBulkModeChange={(mode) => void applyGroupPreprocess("clothing", mode)} */
        /* V115：UploadZone 的 footerControls 插槽保留（通用组件能力）；旧 recolor「改色范围」UI 已随旧机制退役 */
        footerControls={null}
        sideControls={null}
      />
    )}
    {!isOutpaintWorkflow && !isRandomBackgroundWorkflow && !isWhiteRefineWorkflow && (
      <UploadZone
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
        /* V77（用户要求·停用）：统一处理/新上传默认停用；数据流与 handler 保留，
           恢复时传回 bulkMode={referenceBulkMode}、onBulkModeChange={(mode) => void applyGroupPreprocess("reference", mode)} */
      />
    )}
  </section>
  <div className="composerHeader">
    <div className="composerTabs">
      <button className="active" type="button">图片换装</button>
    </div>
  </div>

  {/* 2026-09-26（按用户要求）：换装设置内容不多，搬到提示词左边这半边的空位里，
      原来在图1~图3下面占的那一整块竖向空间就省出来了。
      左边 = 换装设置；右边 = 通用换装提示词 + 补充提示词。
      精修页后来又按用户要求压成两行：第一行三组设置排成一条，第二行提示词 + 用户补充并排。 */}
  <div className={`composerBody ${isOutfitWorkflow ? "withIntent" : ""} ${isWhiteRefineWorkflow ? "withRetouch" : ""}`}>
    {isOutfitWorkflow && (
      <div className="composerIntentCol">
        <OutfitIntentPanel
          outfitIntent={outfitIntent}
          outfitLayer={outfitLayer}
          outfitPreview={outfitPreview}
          outfitWearingFieldList={outfitWearingFieldList}
          wearingDetailOpen={wearingDetailOpen}
          setWearingDetailOpen={setWearingDetailOpen}
          toggleOutfitPart={toggleOutfitPart}
          patchOutfitIntent={patchOutfitIntent}
          updateOutfitWearingValue={updateOutfitWearingValue}
          wearingFieldValue={wearingFieldValue}
          maskMode={settings.maskMode}
          onMaskModeChange={(value) => updateSetting("maskMode", value)}
        />
      </div>
    )}
    {/* 精修设置：三组选择排成一条，占满整行 —— 下面才是提示词 + 用户补充并排。 */}
    {isWhiteRefineWorkflow && (
      <div className="retouchSettingsRow">
        <RetouchIntentPanel
          retouchIntent={retouchIntent}
          patchRetouchIntent={patchRetouchIntent}
          splitHalves={splitHalves}
          onToggleSplitHalves={onToggleSplitHalves}
          splitNote={splitNote}
        />
      </div>
    )}

    {/* V120（用户要求）：按 V119 的参考图布局，改色页头部行 = 「更换部位 + chips ｜ 上装层级 + chips」一条紧凑行
        （左对齐流式，flex + gap:6px 16px，不复用 space-between）。
        标题「通用改色提示词」已归位到下方 composerField 的 label（与换装/精修页同渲染路径、同字号）；
        原「恢复默认模板」按钮按用户要求删除——手写提示词继续受保护：无部位词不联动 + 可见提示，但不提供一键恢复入口。 */}
    {isCustomWorkflow && (
      <div className="outfitIntentRow recolorPartRow recolorPromptHeaderRow">
        <span className="outfitIntentRowTitle">更换部位</span>
        <div className="outfitIntentChips">
          {RECOLOR_PART_OPTIONS.map((part) => {
            const active = recolorPart === part.value;
            return (
              <button
                className={active ? "active" : ""}
                key={part.value}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectRecolorPart(part.value)}
                title={`改色部位：${part.label}`}
              >
                {active && <Check size={13} />}
                <span>{part.label}</span>
              </button>
            );
          })}
        </div>
        <span className={upperLayerDisabled ? "outfitIntentRowTitle recolorUpperLayerRow is-disabled" : "outfitIntentRowTitle recolorUpperLayerRow"}>
          上装层级
        </span>
        <div className={upperLayerDisabled ? "outfitIntentChips is-disabled" : "outfitIntentChips"}>
          {UPPER_LAYER_OPTIONS.map((option) => {
            const active = !upperLayerDisabled && recolorUpperLayer === option.value;
            return (
              <button
                className={active ? "active" : ""}
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={upperLayerDisabled}
                onClick={() => onSelectRecolorUpperLayer(option.value)}
                title={upperLayerDisabled ? "仅更换部位为「上装」时可选择上装层级" : `上装层级：${option.label}`}
              >
                {active && <Check size={13} />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    )}

    <div className="composerPromptCol">
      <label className="composerField" ref={promptFieldRef}>
        <span>
          {promptFieldTitle}
          {isOutfitWorkflow && (
            <em className="composerFieldHint">按换装设置自动生成，也可以直接手改</em>
          )}
          {isWhiteRefineWorkflow && (
            <em className="composerFieldHint">按精修设置自动生成，也可以直接手改</em>
          )}
        </span>
        {/* 换装 / 精修：这个框就是**真正发送的内容**。
            它由「设置 + 补充」自动生成；用户可以随手调整/增删，
            点设置按钮时会按设置重新生成一遍。 */}
        <DebouncedTextarea
          className={isOutfitWorkflow ? "outfitPromptLive" : isWhiteRefineWorkflow ? "retouchPromptLive" : undefined}
          value={settings.prompt}
          onChange={(value) => {
            // 手改提示词：先记下来，别让自动生成立刻盖掉用户写的东西。
            if (isOutfitWorkflow) outfitPromptHandEditedRef.current = true;
            if (isWhiteRefineWorkflow) retouchPromptHandEditedRef.current = true;
            updateSetting("prompt", value);
          }}
          onKeyDown={handlePromptKeyDown}
          placeholder={promptFieldPlaceholder}
        />
        {isOutfitWorkflow && (
          <div className="outfitPromptMeta">
            <span>
              共 {String(settings.prompt || "").length} 字（其中自动内容 {outfitPreview.autoChars}/{OUTFIT_AUTO_PROMPT_CHAR_LIMIT} 字）
            </span>
            <button
              className="outfitPromptClear"
              type="button"
              onClick={() => {
                updateSetting("prompt", outfitAutoPrompt);
                addEvent("换装设置", "已按当前换装设置重新生成提示词");
              }}
              title="把上面这个框恢复成按当前换装设置生成的内容"
            >
              按设置重新生成
            </button>
          </div>
        )}
        {isWhiteRefineWorkflow && (
          <div className="outfitPromptMeta">
            <span>
              共 {String(settings.prompt || "").length} 字（其中自动内容 {retouchPreview.autoChars}/{RETOUCH_AUTO_PROMPT_CHAR_LIMIT} 字
              {retouchPreview.userChars > 0 ? `、用户补充 ${retouchPreview.userChars} 字` : ""}）
            </span>
            <button
              className="outfitPromptClear"
              type="button"
              onClick={() => {
                retouchPromptHandEditedRef.current = false;
                updateSetting("prompt", retouchAutoPrompt);
                addEvent("精修设置", "已按当前精修设置重新生成提示词");
              }}
              title="把上面这个框恢复成按当前精修设置生成的内容"
            >
              按设置重新生成
            </button>
          </div>
        )}
      </label>

      <label className="composerField composerNote">
        <span>
          {productNoteFieldTitle}
          {/* V77（用户要求·§3.5 已确认删）：两条「会实时接到/并入提示词…API」长说明删除（换装 + 精修变体同删）。 */}
        </span>
        <DebouncedTextarea
          value={settings.productNote}
          onChange={(value) => {
            // 补充提示词本身就是最终提示词正文的一部分：改它就重新拼一次，
            // 保证"实时并进去"这件事在手改过提示词之后也照样成立。
            if (isOutfitWorkflow) outfitPromptHandEditedRef.current = false;
            if (isWhiteRefineWorkflow) retouchPromptHandEditedRef.current = false;
            updateSetting("productNote", value);
          }}
          onKeyDown={handlePromptKeyDown}
          placeholder={productNotePlaceholder}
        />
      </label>
    </div>
  </div>

  <div className="composerStickyControls">
    {/* 提交按钮旁的一行摘要（完整提示词在「通用换装提示词」下面常显，不用再点开）。 */}
    <div className={`outfitIntentBar${isOutfitWorkflow ? "" : " outfitIntentBar--placeholder"}`}>
      {isOutfitWorkflow && (
        <>
          <span className="outfitIntentBarText">
            本次替换：<b>{outfitIntentSummary.replaceText}</b>
            <em>｜</em>保持：{outfitIntentSummary.keepText}
            <em>｜</em>穿法：{outfitIntentSummary.wearingText}
          </span>
          <span className="outfitIntentBarChars">{outfitPreview.autoChars}/{OUTFIT_AUTO_PROMPT_CHAR_LIMIT} 字</span>
        </>
      )}
    </div>
    <div className="composerFooter">
      <OutfitPageRow
        showPromptButton
        outfitPages={outfitPages}
        activeOutfitPageId={activeOutfitPageId}
        draggedPageId={draggedPageId}
        pageDropTarget={pageDropTarget}
        activePageDeleteLocked={activePageDeleteLocked}
        setIsPromptAssistantOpen={setIsPromptAssistantOpen}
        switchOutfitPage={switchOutfitPage}
        renameOutfitPage={renameOutfitPage}
        updateOutfitPageDropTarget={updateOutfitPageDropTarget}
        setPageDropTarget={setPageDropTarget}
        dropOutfitPage={dropOutfitPage}
        endOutfitPageDrag={endOutfitPageDrag}
        beginOutfitPageDrag={beginOutfitPageDrag}
        createOutfitPageFromCurrent={createOutfitPageFromCurrent}
        toggleOutfitPageDeleteLock={toggleOutfitPageDeleteLock}
        deleteOutfitPage={deleteOutfitPage}
      />

      <div className="rightTools">
        <select value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
          {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
        </select>
        {/* 线路选择：请求必须带 canonical channelId；旧线路不会出现在这里，服务端也会拒绝。
            2026-09-26：批量页保持原来的下拉框样式（和旁边模型/比例/尺寸同级），
            只让"当前选中的渠道"用快捷生成那套金色 #fbbf24 显示，其余样式不变。 */}
        <select
          className="channelSelect"
          value={outfitChannels.some((channel) => channel.id === settings.channelId) ? settings.channelId : (outfitChannels[0]?.id || "")}
          onChange={(event) => updateSetting("channelId", event.target.value)}
          title="当前模型的可用线路"
        >
          {outfitChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.label}{Number(channel.price || 0) > 0 ? ` ¥${Number(channel.price).toFixed(2)}/张` : ""}
            </option>
          ))}
        </select>
        <select value={settings.aspectRatio} onChange={(event) => updateSetting("aspectRatio", event.target.value)}>
          {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
        </select>
        <select value={settings.imageSize} onChange={(event) => updateSetting("imageSize", event.target.value)}>
          {outfitSizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <select className={globalBulkMode === "mixed" ? "mixed" : ""} value={globalBulkMode} onChange={(event) => void applyGlobalPreprocess(event.target.value)}>
          <option value="mixed" disabled>混合状态</option>
          {globalBulkMode === "crop" && <option value="crop" disabled>{preprocessModeLabel("crop")}</option>}
          {PREPROCESS_OPTIONS.filter((option) => option.value !== "crop").map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {isOutpaintWorkflow || isRandomBackgroundWorkflow ? (
          <select value="fixed" disabled>
            <option value="fixed">{isRandomBackgroundWorkflow ? "按场景补充生成" : "图1向下扩图"}</option>
          </select>
        ) : (
          <select value={settings.pairingMode} onChange={(event) => updateSetting("pairingMode", event.target.value)}>
            <option value="fixed">{isPoseRemixWorkflow ? "固定母版" : isFaceSwapWorkflow ? "固定人脸" : isBackgroundChangeWorkflow ? "固定场景" : "固定服装"}</option>
            <option value="sequence">{isPoseRemixWorkflow ? "母版一一对应" : isFaceSwapWorkflow ? "人脸一一对应" : isBackgroundChangeWorkflow ? "人物场景一一对应" : "按顺序一一对应"}</option>
            <option value="cycle">{isPoseRemixWorkflow ? "母版循环配对" : isFaceSwapWorkflow ? "人脸循环配对" : isBackgroundChangeWorkflow ? "场景循环配对" : "服装循环配对"}</option>
          </select>
        )}
        {isRandomBackgroundWorkflow && (
          <select
            value={normalizeRandomBackgroundFocus(settings.randomBackgroundFocus)}
            onChange={(event) => updateSetting("randomBackgroundFocus", event.target.value)}
            title="随机背景视觉重点"
          >
            {RANDOM_BACKGROUND_FOCUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
        <select value={generationCount} onChange={(event) => updateSetting("generationCount", event.target.value)}>
          {GENERATION_COUNT_OPTIONS.map((count) => (
            <option key={count} value={count}>{count === "auto" ? `数量(${plannedGenerationCount})` : `数量 ${count}`}</option>
          ))}
        </select>
        {/* V77（用户要求·停用）：「常规文本/智能文本」开关与「AI质检」开关停止渲染（Park 纪律：
            smartIntervention/qualityCheck state 与持久化不动、仍可被其他逻辑读取，恢复 = 去掉本注释）。 */}
        {/* <button
          className={`smartInterventionSwitch ${!isPoseRemixWorkflow && !isOutpaintWorkflow && !isRandomBackgroundWorkflow && settings.smartIntervention ? "on" : ""}`}
          type="button"
          onClick={() => {
            if (isPoseRemixWorkflow) {
              addEvent("批量姿态", "该页按图1姿态和图2母版直接生成，暂不启用锁图1人物的智能文本");
              return;
            }
            if (isOutpaintWorkflow) {
              addEvent("批量扩图", "该页使用前端扩图画布和独立扩图 SKILL，不启用额外智能文本");
              return;
            }
            if (isRandomBackgroundWorkflow) {
              addEvent("随机背景", "该页按场景补充和随机背景 SKILL 直接生成，暂不启用额外智能文本");
              return;
            }
            updateSetting("smartIntervention", !settings.smartIntervention);
          }}
          aria-pressed={!isPoseRemixWorkflow && !isOutpaintWorkflow && !isRandomBackgroundWorkflow && settings.smartIntervention}
          title={isPoseRemixWorkflow ? "批量姿态页暂不启用锁图1人物的智能文本" : isOutpaintWorkflow ? "批量扩图页使用固定扩图文本" : isRandomBackgroundWorkflow ? "随机背景页使用场景补充和固定 SKILL" : "切换文本模型介入"}
        >
          <span>{isPoseRemixWorkflow || isOutpaintWorkflow || isRandomBackgroundWorkflow ? "常规文本" : settings.smartIntervention ? "智能文本" : "常规文本"}</span>
          <i aria-hidden="true"><b /></i>
        </button>
        <button
          className={`qualityCheckSwitch ${settings.qualityCheck ? "on" : ""}`}
          type="button"
          onClick={() => updateSetting("qualityCheck", !settings.qualityCheck)}
          aria-pressed={settings.qualityCheck}
          title="生成完成后调用 AI质检员标记合格/不合格"
        >
          <span>AI质检</span>
          <i aria-hidden="true"><b /></i>
        </button> */}
        <Button className="generateBtn" size="lg" tone="primary" type="button" onClick={() => void startBatch()} disabled={running && !canAppendWhileRunning}>
          {running ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
          <span>生成</span>
        </Button>
      </div>
    </div>
    <div className={`composerStatus${inlineMessage ? "" : " composerStatus--placeholder"}`}>{inlineMessage}</div>
  </div>
</section>
  );
}
