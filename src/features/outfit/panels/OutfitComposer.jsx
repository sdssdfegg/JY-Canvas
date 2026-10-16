// src/features/outfit/panels/OutfitComposer.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出 composerPanel
// （换装/精修设置 + 通用换装提示词/补充 + 底部生成控制条 + 结果页签行）。
// 模式：原闭包捕获的 state / handler / 派生值 / 常量全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   子组件（OutfitIntentPanel / RetouchIntentPanel / OutfitPageRow / DebouncedTextarea）与图标（Loader2 / Play）直接 import；
//   props 漏项 = 运行期 undefined（vite build 验不出），由 eslint no-undef 兜底。
import { Loader2, Play } from "lucide-react";
import DebouncedTextarea from "../../../shared/DebouncedTextarea.jsx";
import { OutfitIntentPanel } from "./OutfitIntentPanel.jsx";
import { RetouchIntentPanel } from "./RetouchIntentPanel.jsx";
import { OutfitPageRow } from "./OutfitPageRow.jsx";

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
  handlePromptKeyDown
}) {
  return (
<section className="composerPanel">
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
        />
      </div>
    )}
    {/* 精修设置：三组选择排成一条，占满整行 —— 下面才是提示词 + 用户补充并排。 */}
    {isWhiteRefineWorkflow && (
      <div className="retouchSettingsRow">
        <RetouchIntentPanel
          retouchIntent={retouchIntent}
          patchRetouchIntent={patchRetouchIntent}
        />
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
          {isOutfitWorkflow && (
            <em className="composerFieldHint">会实时接到上面提示词的最后（只作为提示词正文的一部分，不再单独重复发给 API）</em>
          )}
          {isWhiteRefineWorkflow && (
            <em className="composerFieldHint">会实时并入上面提示词的【用户补充】段，不再单独重复发给 API</em>
          )}
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
        <button
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
        </button>
        <button className="generateButton" type="button" onClick={() => void startBatch()} disabled={running && !canAppendWhileRunning}>
          {running ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
          <span>生成</span>
        </button>
      </div>
    </div>
    <div className={`composerStatus${inlineMessage ? "" : " composerStatus--placeholder"}`}>{inlineMessage}</div>
  </div>
</section>
  );
}
