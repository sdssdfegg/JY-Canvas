// src/features/outfit/use-outfit-settings-intent.js
// V64 (P5-2) 2026-10-15：从 src/outfit-workflow.jsx（1156–1484，派发日偏移后实测）整块搬出的「设置与意图」handler 钩。
// 内容：updateSetting / enableGenerationCountAutoLink / analyzeImageFacts / setMasterClothing /
//   换装意图 patch 簇（patchOutfitIntent / toggleOutfitPart / updateOutfitWearingValue / updateOutfitFact /
//   wearingFieldValue）/ 精修意图（patchRetouchIntent）/ 改色部位（toggleGarmentPart / applyGarmentPartPreset）/
//   连接测试闭包壳 runConnectionTest / openSettings / saveSettings / usePromptLibrary 接线及 preset 三函数 /
//   事件日志 addEvent / 任务运行时 updateTaskRuntime / 生成轮次 begin/endGenerationRun。
// 模式：沿用 features/savedir/save-directory.js 的 deps 注入薄壳——每次 render 由调用方重建 deps 对象
//   传入，钩内不记忆化，handler 每次 render 重建，与搬出前（组件内函数声明）行为完全一致。
//   ⚠️ deps 漏项 = 运行期 undefined（vite build 验不出），由 V64 §3.2 负向对照兜底。
import { useRef } from "react";
import { testApiConnection, normalizeApiKeyInput } from "../auth/api-key.js";
import { testConnection, formatConnectionResult } from "../../api/connection.js";
import { analyzeOutfitMasterFit } from "../../api/outfit.js";
import { recognizedFactKeys, normalizeOutfitIntent } from "../../shared/outfit-intent.js";
import { normalizeRetouchIntent } from "../../shared/retouch-intent.js";
import { usePromptLibrary } from "../../shared/prompt-library.js";
import { convergeSettingsForModel, channelsForModel } from "../../shared/routing.js";
import { normalizeGenerationCount, normalizeSmartIntervention, normalizeGarmentParts, normalizeGarmentComposition, GENERATION_COUNT_AUTOLINK_MIGRATION_KEY } from "./outfit-top.js";
import { normalizeQualityCheck, publishOutfitLiveRun } from "./outfit-task.js";
import { makeId } from "./outfit-panels.jsx";
export function useOutfitSettingsIntent(deps) {
  const {
    settings, setSettings,
    config,
    isDesignDraftWorkflow,
    imageFactsAnalyzing, setImageFactsAnalyzing,
    effectiveApiKey,
    selectedFixedClothing,
    outfitIntent,
    outfitIntentSummary,
    fixedClothingId, setFixedClothingId,
    outfitPromptHandEditedRef,
    retouchPromptHandEditedRef,
    setIsConnectionTesting, setConnectionState, setConnectionStatus,
    embeddedMode, onOpenHostSettings,
    apiKeyDraft, setApiKeyDraft, setApiSaveStatus, setIsSettingsOpen,
    promptCategories, setPromptCategories,
    promptCategory, setPromptCategory,
    setPromptPresets,
    editingPrompt, setEditingPrompt,
    draggedPromptId, setDraggedPromptId,
    setPromptDropCategory,
    setIsPromptAssistantOpen,
    promptClickTimerRef,
    setInlineMessage, setEvents,
    tasksRef,
    setTasks,
    runningGenerationCountRef,
    setRunning,
    startBatchRef
  } = deps;

  // 比例联动（前端专项E）：记录「正反」开启前的出图比例，关闭时原样恢复（含 16:9 等非默认值）。
  const previousAspectRatioRef = useRef(settings?.aspectRatio || "3:4");

  function updateSetting(key, value) {
    if (key === "model") {
      // 切换模型时按新模型的 capabilities 重新收敛比例 / 尺寸 / 生成数量 / 线路。
      setSettings((current) => convergeSettingsForModel(
        { ...current, model: value },
        config.routing || config
      ));
      return;
    }
    if (key === "channelId") {
      const channels = channelsForModel(settings.model, config.routing || config);
      setSettings((current) => ({
        ...current,
        channelId: channels.some((channel) => channel.id === value) ? value : (channels[0]?.id || "")
      }));
      return;
    }
    const normalizeValue = (current) => {
      if (key === "generationCount") return normalizeGenerationCount(value);
      if (key === "smartIntervention") return normalizeSmartIntervention(value);
      if (key === "qualityCheck") return normalizeQualityCheck(value);
      if (key === "garmentParts") return normalizeGarmentParts(value);
      if (key === "garmentComposition") return normalizeGarmentComposition(value, current.garmentParts);
      if (key === "outfitIntent") return normalizeOutfitIntent(value);
      return value;
    };
    setSettings((current) => {
      const next = {
        ...current,
        [key]: normalizeValue(current)
      };
      if (key === "generationCount") next[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] = true;
      return next;
    });
  }

  function enableGenerationCountAutoLink() {
    if (isDesignDraftWorkflow) return;
    setSettings((current) => current.generationCount === "auto"
      ? current
      : {
          ...current,
          generationCount: "auto",
          [GENERATION_COUNT_AUTOLINK_MIGRATION_KEY]: true
        });
  }

  // 中文注释：把图2分析结果（结构化服装事实）写进当前页面的 outfitIntent。
  // 分析失败只提示，不清空用户已有的手动选择，也不让整批失效。
  async function analyzeImageFacts() {
    if (imageFactsAnalyzing) return;
    if (!effectiveApiKey) {
      addEvent("图2分析", "请先填写 API Key");
      openSettings();
      return;
    }
    const source = selectedFixedClothing;
    if (!source?.file) {
      addEvent("图2分析", "请先上传并选中一张图2服装图");
      return;
    }
    if (outfitIntent.parts.length === 0) {
      addEvent("图2分析", "请先在「更换部位」里至少选择一个部位，分析才会只提取相关事实");
      return;
    }

    setImageFactsAnalyzing(true);
    addEvent("图2分析", `正在按【${outfitIntentSummary.replaceText}】读取图2服装事实`);
    try {
      const form = new FormData();
      form.append("payload", JSON.stringify({
        apiKey: effectiveApiKey,
        model: settings.model,
        imageSize: settings.imageSize,
        aspectRatio: settings.aspectRatio,
        // 分析只认结构化意图（部位 + 上装层级），与最终提示词编译器读的是同一份数据。
        outfitIntent,
        prompt: settings.prompt,
        productNote: settings.productNote
      }));
      form.append("image", source.file, `clothing_${source.name || "image2.jpg"}`);
      const payload = await analyzeOutfitMasterFit(form);
      const facts = normalizeOutfitIntent({ ...outfitIntent, facts: payload.facts }).facts;
      if (recognizedFactKeys(facts).length === 0) throw new Error("服务端没有返回可识别的图2服装事实");
      setSettings((current) => {
        const currentIntent = normalizeOutfitIntent(current.outfitIntent);
        return {
          ...current,
          outfitIntent: {
            ...currentIntent,
            facts,
            factsSource: { mode: "auto", sourceId: source.id, analyzedAt: Date.now() }
          }
        };
      });
      addEvent("图2分析", `已提取 ${recognizedFactKeys(facts).length} 项服装事实（可展开修改后再生成）`);
    } catch (error) {
      // 分析失败：保留用户已选部位与手动事实，批次照样可以生成。
      addEvent("图2分析失败", error instanceof Error ? error.message : String(error));
    } finally {
      setImageFactsAnalyzing(false);
    }
  }

  // 中文注释：切换固定图2时不覆盖用户已手动修改的图2事实，只标记事实来源已过期。
  // （旧实现在这里清母版锁并弹提示；现在事实是否过期由 factsSource.sourceId 判断，UI 会显示提示。）
  function setMasterClothing(id) {
    if (id === fixedClothingId) return;
    setFixedClothingId(id);
  }

  // 中文注释：以下是唯一改动结构化换装意图的入口。所有写入都经过 normalizeOutfitIntent，
  // 保证枚举合法、字段完整；界面只改这一份数据，请求与提示词都从它派生。
  function patchOutfitIntent(patch) {
    // 改换装设置 = 重新按设置生成「通用换装提示词」（用户手改过也让位给这次重算）。
    outfitPromptHandEditedRef.current = false;
    setSettings((current) => {
      const currentIntent = normalizeOutfitIntent(current.outfitIntent);
      const nextPatch = typeof patch === "function" ? patch(currentIntent) : patch;
      return { ...current, outfitIntent: normalizeOutfitIntent({ ...currentIntent, ...nextPatch }) };
    });
  }

  // 中文注释：更换部位互斥规则——连衣裙是一件式，和分体（上装/下装）不能同时选。
  // 选「连衣裙」时清掉上装/下装；选「上装」或「下装」时清掉连衣裙。鞋子独立，不受互斥影响。
  function toggleOutfitPart(part) {
    const isAdding = !outfitIntent.parts.includes(part);
    let nextParts;
    if (!isAdding) {
      nextParts = outfitIntent.parts.filter((item) => item !== part);
    } else if (part === "dress") {
      nextParts = [...outfitIntent.parts.filter((item) => item !== "upper" && item !== "lower"), "dress"];
    } else if (part === "upper" || part === "lower") {
      nextParts = [...outfitIntent.parts.filter((item) => item !== "dress"), part];
    } else {
      nextParts = [...outfitIntent.parts, part];
    }
    patchOutfitIntent({ parts: nextParts });
    if (nextParts.length === 0) addEvent("换装设置", "请至少选择一个更换部位");
  }

  function updateOutfitWearingValue(key, value) {
    patchOutfitIntent((current) => ({
      wearing: { ...current.wearing, values: { ...current.wearing.values, [key]: value } }
    }));
  }

  function updateOutfitFact(key, value) {
    patchOutfitIntent((current) => ({
      facts: { ...current.facts, [key]: value },
      // 用户手改过事实后标记为 manual：来源图2换了也不清空用户手工内容。
      factsSource: { ...current.factsSource, mode: current.factsSource.mode === "auto" ? "manual" : current.factsSource.mode || "manual" }
    }));
  }

  function wearingFieldValue(key) {
    return outfitIntent.wearing.values[key] || "";
  }

  // 精修：唯一改动结构化精修意图的入口（同一个 normalize，保证枚举合法、字段完整）。
  function patchRetouchIntent(patch) {
    // 改精修设置 = 按设置重新生成「通用白底精修提示词」（用户手改过也让位给这次重算）。
    retouchPromptHandEditedRef.current = false;
    setSettings((current) => {
      const currentIntent = normalizeRetouchIntent(current.retouchIntent);
      const nextPatch = typeof patch === "function" ? patch(currentIntent) : patch;
      const nextIntent = normalizeRetouchIntent({ ...currentIntent, ...nextPatch });

      // 比例联动（前端专项E）：正反 off→on 时切到 4:3 并记录开启前的比例；
      // on→off 时恢复记录的比例（含 16:9 等非默认值）。其它字段改动不动比例。
      let aspectRatio = current.aspectRatio;
      if (Object.prototype.hasOwnProperty.call(nextPatch, "frontback")) {
        if (nextIntent.frontback === "on" && currentIntent.frontback !== "on") {
          previousAspectRatioRef.current = current.aspectRatio;
          aspectRatio = "4:3";
        } else if (nextIntent.frontback === "off" && currentIntent.frontback === "on") {
          aspectRatio = previousAspectRatioRef.current || current.aspectRatio;
        }
      }

      return { ...current, retouchIntent: nextIntent, aspectRatio };
    });
  }

  // 中文注释：批量改色的改色范围（只有 recolor 还在用这套旧机制）。
  function toggleGarmentPart(part) {
    const currentParts = normalizeGarmentParts(settings.garmentParts);
    const nextParts = currentParts.includes(part)
      ? currentParts.filter((item) => item !== part)
      : [...currentParts, part];
    if (nextParts.length === 0) {
      addEvent("图2部位", "至少保留一个改色部位");
      return;
    }
    setSettings((current) => ({
      ...current,
      garmentParts: nextParts,
      garmentComposition: normalizeGarmentComposition(current.garmentComposition, nextParts)
    }));
  }

  function applyGarmentPartPreset(preset) {
    const nextParts = normalizeGarmentParts(preset?.parts);
    const nextComposition = normalizeGarmentComposition(preset?.composition || preset?.value, nextParts);
    setSettings((current) => ({
      ...current,
      garmentParts: nextParts,
      garmentComposition: nextComposition
    }));
  }

  /**
   * 连接测试：对齐 3.0 `/api/providers/test-connection` 的做法 —— 只探测 /v1/models。
   * 不发提示词、不上传图片、不调用生图接口，所以既不会出图也不会扣费。
   */
  // 连通性测试的实现在 src/features/auth/api-key.js（两侧同一份，23 行逐字节一致）。
  // 这里只保留闭包绑定壳：每次 render 重建，捕获最新的 settings / config 与各 setter。
  const runConnectionTest = () => testApiConnection({
    setIsConnectionTesting,
    setConnectionState,
    setConnectionStatus,
    settings,
    config,
    testConnection,
    formatConnectionResult,
    addEvent
  });

  function openSettings() {
    if (embeddedMode) {
      // 批量页嵌在快捷生成里时，设置面板由宿主页面渲染；连接测试也在宿主面板里。
      onOpenHostSettings();
      return;
    }
    setApiKeyDraft(settings.apiKey || "");
    setApiSaveStatus("");
    setIsSettingsOpen(true);
  }

  function saveSettings() {
    const nextKey = normalizeApiKeyInput(apiKeyDraft);
    setApiKeyDraft(nextKey);
    updateSetting("apiKey", nextKey);
    setApiSaveStatus("已保存");
    window.setTimeout(() => setApiSaveStatus(""), 1200);
  }

  const {
    applyPromptPreset,
    editPromptPreset,
    addPromptCategory,
    renamePromptCategory,
    deletePromptPreset,
    beginPromptDrag,
    endPromptDrag,
    dropPromptOnCategory,
    dropPromptOnPreset,
    openNewPromptEditor,
    updateEditingPrompt,
    saveEditingPrompt
  } = usePromptLibrary({
    categories: promptCategories,
    setCategories: setPromptCategories,
    activeCategory: promptCategory,
    setActiveCategory: setPromptCategory,
    setPresets: setPromptPresets,
    editing: editingPrompt,
    setEditing: setEditingPrompt,
    draggedId: draggedPromptId,
    setDraggedId: setDraggedPromptId,
    setDropCategory: setPromptDropCategory,
    promptText: settings.prompt.trim(),
    updateSetting,
    makePresetId: () => makeId("prompt"),
    notify: addEvent,
    onApplyPreset: () => setIsPromptAssistantOpen(false)
  });

  function schedulePromptPresetApply(preset) {
    if (promptClickTimerRef.current) window.clearTimeout(promptClickTimerRef.current);
    promptClickTimerRef.current = window.setTimeout(() => {
      promptClickTimerRef.current = null;
      applyPromptPreset(preset);
    }, 180);
  }

  function renamePromptPresetTitle(preset) {
    if (promptClickTimerRef.current) {
      window.clearTimeout(promptClickTimerRef.current);
      promptClickTimerRef.current = null;
    }
    const input = window.prompt("修改提示词标题", preset.title);
    const title = String(input || "").trim();
    if (!title || title === preset.title) return;
    setPromptPresets((current) => current.map((item) => (
      item.id === preset.id ? { ...item, title } : item
    )));
    addEvent("提示词", `标题已改为「${title}」`);
  }

  function handlePromptKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void startBatchRef.current?.();
    }
  }

  function addEvent(title, detail) {
    const time = Date.now();
    const text = detail ? `${title}：${detail}` : title;
    setInlineMessage(text);
    setEvents((current) => [{ id: makeId("event"), title, detail: detail || "", time }, ...current].slice(0, 6));
  }

  function updateTaskRuntime(taskId, runtimeStage, runtimeDetail = "") {
    if (!taskId) return;
    const runtimeUpdatedAt = Date.now();
    setTasks((current) => current.map((item) => item.id === taskId ? {
      ...item,
      runtimeStage,
      runtimeDetail,
      runtimeUpdatedAt
    } : item));
    // 同步进跨挂载周期账本：用户切走页面后，重挂载回来的卡片也能看到实时阶段
    // （本地预处理 / 等待中转站返回 / 模型已返回 …），而不是停在开始那一刻的"准备任务"。
    const latest = tasksRef.current.find((item) => item.id === taskId);
    if (latest) publishOutfitLiveRun({ ...latest, runtimeStage, runtimeDetail, runtimeUpdatedAt });
  }

  function beginGenerationRun() {
    runningGenerationCountRef.current += 1;
    if (runningGenerationCountRef.current === 1) {
      setRunning(true);
    }
  }

  function endGenerationRun() {
    runningGenerationCountRef.current = Math.max(0, runningGenerationCountRef.current - 1);
    if (runningGenerationCountRef.current === 0) {
      setRunning(false);
    }
  }


  return {
    updateSetting,
    enableGenerationCountAutoLink,
    analyzeImageFacts,
    setMasterClothing,
    patchOutfitIntent,
    toggleOutfitPart,
    updateOutfitWearingValue,
    updateOutfitFact,
    wearingFieldValue,
    patchRetouchIntent,
    toggleGarmentPart,
    applyGarmentPartPreset,
    runConnectionTest,
    openSettings,
    saveSettings,
    editPromptPreset,
    addPromptCategory,
    renamePromptCategory,
    deletePromptPreset,
    beginPromptDrag,
    endPromptDrag,
    dropPromptOnCategory,
    dropPromptOnPreset,
    openNewPromptEditor,
    updateEditingPrompt,
    saveEditingPrompt,
    schedulePromptPresetApply,
    renamePromptPresetTitle,
    handlePromptKeyDown,
    addEvent,
    updateTaskRuntime,
    beginGenerationRun,
    endGenerationRun
  };
}
