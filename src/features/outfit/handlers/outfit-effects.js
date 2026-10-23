// 模式：V5.0-008（R1「状态就近」收官项）——outfit-workflow.jsx 的 effect 簇整块迁入本 hook。
// 域 = 原 outfit-workflow.jsx 654–1045 行的 28 个 useEffect，按原声明顺序逐字迁移
//   （原 952–957 的三个 useRef 留在组件内、声明于调用点之前，经 ctx 注入）。
// 行为契约：零行为变化（纯迁移）——effect 主体与依赖数组逐字不动；唯一改写是 E11 的
//   refreshSaveDirectory 晚绑定（见文件末「晚绑定说明」）。顺序对照表见执行单 §4。
// 调用点约束：必须置于组件内三个 ref（promptFieldRef / outfitPromptHandEditedRef /
//   retouchPromptHandEditedRef）声明之后，且早于全部下游 handler hook 的调用点
//   ⇒ 28 个 effect 的相对顺序、与下游 hook effect 的相对顺序均不变。
import { useEffect } from "react";
import { getAppConfig } from "../../../api/config.js";
import { normalizeApiKeyInput } from "../../auth/api-key.js";
import { convergeSettingsForModel } from "../../../shared/routing.js";
import { writeJsonStorage } from "../../../lib/storage/json-storage.js";
import {
  cacheableResultImageSource,
  cacheResultImageBlob,
  hydrateTasksWithUploadReferences,
  imageSource,
  mergeOutfitLiveRuns,
  mergeOutfitTasksWithHistory,
  outfitLiveRunsForPage,
  persistTaskHistory,
  readTaskHistoryAsync,
  resultImageCacheKey,
  revokeRestorableTaskResultImageCaches,
  sanitizeTaskHistoryItem,
  subscribeOutfitLiveRuns
} from "../outfit-task.js";
import { RETOUCH_GOAL_TEXT, isBuiltinRetouchPrompt } from "../../../shared/retouch-intent.js";
import { OUTFIT_PAGES_KEY, PROMPT_CATEGORIES_KEY, PROMPT_PRESETS_KEY, STORAGE_KEY } from "../outfit-storage-keys.js";
import { normalizeTheme, readSettings } from "../outfit-top.js";
import {
  ensureWorkflowPages,
  loadOutfitDraftState,
  persistOutfitDraftState,
  serializeOutfitPage
} from "../outfit-page-actions.js";

// 2026-09-26 批量结果恢复：区分「浏览器整页刷新/首次打开」和「应用内切换左侧页面」。
// 左侧导航切走会把 OutfitWorkbench 整个卸载（main.jsx 是条件渲染），再切回来是**组件重挂载**，
// 不是页面刷新。模块级变量随 JS 文档一起重建，所以：
//   - 本文档里第一次挂载 = 真的刚刚加载/刷新过页面；
//   - 之后再挂载 = 应用内切换页面。
// 只有前者才允许把"当时还在跑"的任务写成"刷新中断"。
// （原 outfit-workflow.jsx:118 模块级变量，随 effect 簇一同迁入本文件；语义不变。）
let outfitWorkflowDocumentBooted = false;

// ctx = 组件作用域值薄壳注入（每次 render 重建，同 use-outfit-pages.js / outfit-selection.js 模式）。
// 纯函数与常量在本文件直接 import，不经 ctx。清单见执行单 §3（62 项）。
export function useOutfitEffects(ctx) {
  const {
    view, hostTheme, hostApiKey,
    setActiveView,
    tasks, setTasks,
    settings, setSettings, setConfig,
    outfitPages, setOutfitPages, activeOutfitPageId, setActiveOutfitPageId,
    uploadLabels,
    modelImages, clothingImages, referenceImages, fixedClothingId,
    originalLibrary, activeUploadGroup,
    promptPresets, promptCategories,
    ratios, preview, imageLightbox, isSettingsOpen, activeView,
    isOutfitWorkflow, isWhiteRefineWorkflow,
    outfitPromptWithNote, retouchAutoPrompt,
    visibleTasks, resultPreviewTasks, galleryCardMin,
    activeOutfitPage, historyReady, draftReady,
    setHistoryReady, setDraftReady,
    setApiKeyDraft, setApiSaveStatus,
    setPreviewZoom, setPreviewPan, setPreview,
    tasksRef, visibleTaskIdsRef, outfitMountedRef,
    pendingDraftSnapshotRef, resultImageCacheInFlightRef,
    historyHydratingRef, draftHydratingRef, previewDragRef,
    promptFieldRef, outfitPromptHandEditedRef, retouchPromptHandEditedRef,
    taskGridRef, refreshSaveDirectoryRef,
    loadOutfitPage, buildCurrentOutfitPageSnapshot,
    navigatePreview, closePreviewModal
  } = ctx;

  /* ============================================================================
   * V5.0-008 迁移说明（为什么 effects 区域整块禁用 exhaustive-deps）：
   *   以下 28 个 effect 的依赖数组是「原组件语义逐字保留」。在组件作用域内时，
   *   react-hooks/exhaustive-deps 认识 useState setter / useRef 的稳定性，不要求它们入列；
   *   迁入本 hook 后这些值改经 ctx 注入，规则既不再认识其稳定性（对 setter/ref 误报缺依赖），
   *   也无法判断哪些必须保持缺列（E7/E8/E15/E28 的 images/闭函数——补入会改变重跑时机）。
   *   两种走向都与「依赖数组逐字不动」的迁移契约冲突，故对 effects 区域整块禁用；
   *   依赖数组的正确性由执行单 §4 顺序对照表 + 逐字 diff 验收保证。
   *   新增 effect 请写在本禁用区之外，让规则继续守护新代码。
   * ========================================================================== */
  /* eslint-disable react-hooks/exhaustive-deps */

  // E1（原 654–658）：view → activeView 同步。
  useEffect(() => {
    if (view === "outfit" || view === "resize") {
      setActiveView(view);
    }
  }, [view]);

  // E2（原 660–663）：tasksRef / visibleTaskIdsRef 刷新。
  useEffect(() => {
    tasksRef.current = tasks;
    visibleTaskIdsRef.current = new Set(tasks.map((task) => task.id));
  }, [tasks]);

  // E3（原 665–673）
  // 订阅跨挂载周期的生成账本：切走又切回来时，这一轮跑完的那一刻能把结果推给当前页面。
  useEffect(() => {
    const listener = (liveTask) => {
      setTasks((current) => (current.some((task) => task.id === liveTask.id)
        ? mergeOutfitLiveRuns(current, [liveTask])
        : current));
    };
    return subscribeOutfitLiveRuns(listener);
  }, []);

  // E4（原 675–683）
  // 卸载清理（2026-09-26 修正）：
  //   1) 只释放"已经有可恢复地址"的结果的对象 URL —— 这类结果切页面回来后用 /api/result
  //      或上传引用就能重新显示，blob: 可以立刻释放，不会越切越占内存；
  //   2) 只靠 blob: 临时地址的结果**不 revoke**，否则"切页面再切回来"这张图就没了。
  // 结果的真正释放走 clearAll / 删除 / 原位重刷那几条路径。
  useEffect(() => () => {
    outfitMountedRef.current = false;
    revokeRestorableTaskResultImageCaches(tasksRef.current);
  }, []);

  // E5（原 685–692）：hostTheme/hostApiKey → settings。
  useEffect(() => {
    setSettings((current) => {
      const nextTheme = normalizeTheme(hostTheme || current.theme);
      const nextApiKey = hostApiKey ? normalizeApiKeyInput(hostApiKey) : current.apiKey;
      if (current.theme === nextTheme && current.apiKey === nextApiKey) return current;
      return { ...current, theme: nextTheme, apiKey: nextApiKey };
    });
  }, [hostTheme, hostApiKey]);

  // E6（原 694–705）：getAppConfig 目录加载 + capabilities 归一。
  useEffect(() => {
    getAppConfig()
      .then((payload) => {
        if (payload?.models?.length) {
          setConfig(payload);
          // 目录加载完成后再按 capabilities 归一化一次；目录没回来之前不动用户存档。
          const routingCatalog = payload.routing || payload;
          setSettings((current) => convergeSettingsForModel(current, routingCatalog));
        }
      })
      .catch(() => {});
  }, []);

  // E7（原 707–732）：异步历史 hydration。
  useEffect(() => {
    let cancelled = false;
    historyHydratingRef.current = true;
    readTaskHistoryAsync()
      .then((history) => {
        if (cancelled || !history.length) return;
        const hydratedHistory = hydrateTasksWithUploadReferences(history, {
          modelImages,
          clothingImages,
          referenceImages
        });
        // 2026-09-26：不再"草稿里有结果就丢掉整份历史"。
        // 按任务 id 合并：历史里已经成功的结果优先，页面切换/重挂载后不会再退回成"刷新中断"。
        setTasks((current) => mergeOutfitTasksWithHistory(current, hydratedHistory));
      })
      .finally(() => {
        if (!cancelled) {
          historyHydratingRef.current = false;
        setHistoryReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // E8（原 734–765）：草稿 hydration（documentBoot 判定）。
  useEffect(() => {
    let cancelled = false;
    draftHydratingRef.current = true;
    // 2026-09-26：只有"真正的整页刷新/首次打开"才允许把还停在 running/queued 的任务
    // 标成刷新中断。左侧导航切走再切回来只是组件重挂载，同一个文档里的 blob: 地址还有效，
    // 不能按刷新处理（那正是用户看到的"页面已刷新，结果请到保存目录确认"误报来源）。
    const documentBoot = !outfitWorkflowDocumentBooted;
    outfitWorkflowDocumentBooted = true;
    loadOutfitDraftState({ detachReason: documentBoot ? "reload" : "page-switch" })
      .then((draft) => {
        if (cancelled || !draft?.pages?.length) return;
        const pages = ensureWorkflowPages(draft.pages, readSettings());
        const activePage = pages.find((page) => page.id === draft.activeId) || pages[0];
        setOutfitPages(pages);
        setActiveOutfitPageId(activePage.id);
        loadOutfitPage(activePage);
        // 2026-09-26：接上跨挂载周期的生成账本。
        // 切走又很快切回来时，草稿里这一条还是 running/queued；账本里如果它还在跑就继续
        // 显示"生成中"，已经跑完就直接收敛成结果 —— 不再误判成"切换页面时这一轮还没返回结果"。
        setTasks((current) => mergeOutfitLiveRuns(current, outfitLiveRunsForPage(activePage.name)));
      })
      .finally(() => {
        if (!cancelled) {
          draftHydratingRef.current = false;
        setDraftReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // E9（原 767–775）：任务历史持久化（success 截 500）。
  useEffect(() => {
    if (!historyReady || !draftReady || historyHydratingRef.current || draftHydratingRef.current) return;
    const persisted = tasks
      .filter((task) => task.status === "success" && imageSource(task.result))
      .map(sanitizeTaskHistoryItem)
      .filter(Boolean)
      .slice(-500);
    void persistTaskHistory(persisted);
  }, [tasks, historyReady, draftReady]);

  // E10（原 777–820）：结果图 blob 缓存（并发 2）。
  useEffect(() => {
    if (!historyReady) return undefined;
    const inFlight = resultImageCacheInFlightRef.current;
    const targets = tasks
      .map((task) => ({ task, key: resultImageCacheKey(task.result) || task.id }))
      .filter(({ task, key }) => (
        task.status === "success"
        && task.result
        && cacheableResultImageSource(task.result)
        && !task.result.cachedUrl
        && key
        && !inFlight.has(key)
      ))
      .slice(0, 2);
    if (targets.length === 0) return undefined;

    let cancelled = false;
    targets.forEach(({ key }) => inFlight.add(key));
    Promise.all(targets.map(async ({ task, key }) => {
      try {
        return {
          id: task.id,
          result: await cacheResultImageBlob(task.result)
        };
      } finally {
        inFlight.delete(key);
      }
    })).then((cachedItems) => {
      if (cancelled) return;
      const resultById = new Map(cachedItems
        .filter((item) => item.result?.cachedUrl)
        .map((item) => [item.id, item.result]));
      if (resultById.size === 0) return;
      setTasks((current) => current.map((task) => {
        const result = resultById.get(task.id);
        if (!result || task.result?.cachedUrl) return task;
        return { ...task, result };
      }));
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [tasks, historyReady]);

  // E11（原 822–825）：挂载刷新保存目录。
  // 晚绑定说明：refreshSaveDirectory 来自 useSaveDirectory（组件内调用点晚于本 hook），
  // 不能直接进 ctx（构造期 TDZ）⇒ 经 refreshSaveDirectoryRef 在 effect 体内读取。
  // effect 后于整棵 render 执行，届时 ref 必已在 useSaveDirectory 解构后刷新。
  useEffect(() => {
    void refreshSaveDirectoryRef.current?.();
  }, []);

  // E12（原 827–832）：settings 防抖落盘（260ms）。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeJsonStorage(STORAGE_KEY, settings);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [settings]);

  // E13（原 834–838）：活动页 id 有效性校正。
  useEffect(() => {
    if (!outfitPages.length) return;
    if (outfitPages.some((page) => page.id === activeOutfitPageId)) return;
    setActiveOutfitPageId(outfitPages[0].id);
  }, [outfitPages, activeOutfitPageId]);

  // E14（原 840–856）：outfitPages 持久化。
  useEffect(() => {
    const nextPages = outfitPages.map((page) => (
      page.id === activeOutfitPageId
        ? {
            ...page,
            settings,
            uploadLabels
          }
        : page
    ));
    writeJsonStorage(OUTFIT_PAGES_KEY, nextPages.map(serializeOutfitPage));
  }, [
    outfitPages,
    activeOutfitPageId,
    settings,
    uploadLabels
  ]);

  // E15（原 858–885）：页面草稿防抖落盘（350ms）+ 待落快照。
  useEffect(() => {
    if (!draftReady || draftHydratingRef.current) return undefined;
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    const pages = ensureWorkflowPages(outfitPages.map((page) => (
      page.id === activeOutfitPageId ? currentSnapshot : page
    )), settings);
    // 记下最近一次待落盘的快照：卸载时用它补一次立即落盘（见下面的 unmount flush）。
    pendingDraftSnapshotRef.current = { pages, activeId: activeOutfitPageId };
    const timer = window.setTimeout(() => {
      pendingDraftSnapshotRef.current = null;
      void persistOutfitDraftState(pages, activeOutfitPageId);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    draftReady,
    outfitPages,
    activeOutfitPageId,
    settings,
    uploadLabels,
    modelImages,
    clothingImages,
    referenceImages,
    fixedClothingId,
    tasks,
    originalLibrary,
    activeUploadGroup
  ]);

  // E16（原 887–897）：卸载立即补写草稿。
  // 2026-09-26 结果丢失修复：
  // 上面那个效果是 350ms 防抖，原来卸载时只 clearTimeout —— 也就是"最近 350ms 内的状态全部丢掉"。
  // 批量刚生成完就点左侧导航切页面时，这条刚好把"已完成"抹掉，草稿里留在"运行中"，
  // 切回来就被判成"刷新中断 / 请到保存目录确认"。
  // 组件重挂载并不会丢内存状态的机会，所以这里在卸载时把待落盘快照立刻补写一次。
  useEffect(() => () => {
    const snapshot = pendingDraftSnapshotRef.current;
    if (!snapshot) return;
    pendingDraftSnapshotRef.current = null;
    void persistOutfitDraftState(snapshot.pages, snapshot.activeId);
  }, []);

  // E17（原 899–901）：提示词预设持久化。
  useEffect(() => {
    writeJsonStorage(PROMPT_PRESETS_KEY, promptPresets);
  }, [promptPresets]);

  // E18（原 903–905）：提示词分类持久化。
  useEffect(() => {
    writeJsonStorage(PROMPT_CATEGORIES_KEY, promptCategories.filter((category) => category !== "全部"));
  }, [promptCategories]);

  // E19（原 907–911）：aspectRatio 合法性归一。
  useEffect(() => {
    if (!ratios.includes(settings.aspectRatio)) {
      setSettings((current) => ({ ...current, aspectRatio: ratios[0] || "3:4" }));
    }
  }, [ratios, settings.aspectRatio]);

  // E20（原 913–918）：设置打开时重置 apiKeyDraft。
  useEffect(() => {
    if (isSettingsOpen) {
      setApiKeyDraft(settings.apiKey || "");
      setApiSaveStatus("");
    }
  }, [isSettingsOpen, settings.apiKey]);

  // E21（原 920–925）：预览打开重置 zoom/pan。
  useEffect(() => {
    if (!preview && !imageLightbox) return;
    setPreviewZoom(1);
    setPreviewPan({ x: 0, y: 0 });
    previewDragRef.current = null;
  }, [preview, imageLightbox]);

  // E22（原 927–935）：preview 跟随 tasks 最新/注销。
  useEffect(() => {
    if (!preview?.id) return;
    const latestPreview = tasks.find((task) => task.id === preview.id);
    if (latestPreview && latestPreview !== preview) {
      setPreview(latestPreview);
    } else if (!latestPreview) {
      setPreview(null);
    }
  }, [tasks, preview]);

  // E23（原 938–950）：结果区自动滚动可见。
  useEffect(() => {
    if (activeView !== "outfit") return;
    window.requestAnimationFrame(() => {
      const grid = taskGridRef.current;
      if (!grid) return;
      // 2026-09-26：结果网格不再自己滚动（整页只有一条滚动条），
      // 所以"自动看到最新结果"改成把外层滚动容器调到让结果区底部对齐可视区底部。
      const scroller = grid.closest(".outfitScrollArea");
      if (!scroller) return;
      const delta = grid.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
      if (delta > 0) scroller.scrollTop += delta;
    });
  }, [activeView, visibleTasks.length, tasks.length, galleryCardMin]);

  // E24（原 958–962）
  // 切页视为没有手改（换回这一页时按当前设置重新生成）。
  useEffect(() => {
    outfitPromptHandEditedRef.current = false;
    retouchPromptHandEditedRef.current = false;
  }, [activeOutfitPageId]);

  // E25（原 964–976）：换装提示词自动生成（手改保护）。
  // 2026-09-26（按用户要求）：批量换装的「通用换装提示词」由换装设置 + 图2事实 + 补充提示词自动生成。
  // - 换装部位/层级/穿法/图2事实一变，就按新设置重新生成一遍（"再点服装部位还是这套逻辑"）；
  // - 下面的补充提示词改写时，实时接到这一框的最后面；
  // - 用户直接手改这一框时，手改内容保留，不会被自动生成立刻盖掉；
  // - 依赖里带上 settings.prompt 是必须的：草稿加载会把存档里的旧提示词写回来，
  //   只靠 outfitPromptWithNote 变化会漏掉这一拍，导致页面上留着旧的手写文案（已实测踩过）。
  useEffect(() => {
    if (!isOutfitWorkflow) return;
    if (outfitPromptHandEditedRef.current) return;
    setSettings((current) => (String(current.prompt || "") === outfitPromptWithNote
      ? current
      : { ...current, prompt: outfitPromptWithNote }));
  }, [isOutfitWorkflow, outfitPromptWithNote, settings.prompt]);

  // E26（原 978–1007）：精修提示词自动生成 + 一次性迁移。
  // 精修：和换装完全同一套逻辑 ——「通用白底精修提示词」由「精修设置 + 用户补充」自动生成，
  // 也可以直接手改；点对称/衣摆/版型或改用户补充就按新设置重新生成。
  useEffect(() => {
    if (!isWhiteRefineWorkflow) return;
    if (retouchPromptHandEditedRef.current) return;
    setSettings((current) => {
      const currentPrompt = String(current.prompt || "");
      const currentNote = String(current.productNote || "");
      // 2026-09-26 一次性迁移：以前用户是在「通用白底精修提示词」里手写整段要求的
      //（那时这一框就是唯一提示词）。现在这一框变成"自动结果"，所以先把用户**自己写的**内容
      // 搬进「用户补充」，再由编译器合并回去 —— 保证原来写的东西一个字都不丢。
      //
      // ⚠️ 必须排除"这一框里已经是编译器产出"的情况（含固定目标段），否则自动生成的结果会被
      //    当成用户手写内容反复搬进用户补充，越滚越长（这个坑已经踩过一次）。
      const looksCompiled = currentPrompt.includes(RETOUCH_GOAL_TEXT);
      const userWritten = currentPrompt.trim()
        && !looksCompiled
        && !isBuiltinRetouchPrompt(currentPrompt)
        && currentPrompt.length <= 6000
        && currentNote.length <= 20000;
      if (userWritten && !currentNote.includes(currentPrompt.trim())) {
        return {
          ...current,
          productNote: [currentNote, currentPrompt].filter((item) => String(item || "").trim()).join("\n"),
          prompt: retouchAutoPrompt
        };
      }
      return currentPrompt === retouchAutoPrompt ? current : { ...current, prompt: retouchAutoPrompt };
    });
  }, [isWhiteRefineWorkflow, retouchAutoPrompt, settings.prompt]);

  // E27（原 1009–1024）
  // 提示词框按内容自撑高度（**只给换装**）：整页只保留一条滚动条，框内不出现第二条。
  // 精修页按用户要求改成"定高 + 框内滑动"（提示词长了用滑轮看），所以不在这里撑高。
  useEffect(() => {
    if (!isOutfitWorkflow) return;
    const el = promptFieldRef.current?.querySelector("textarea.outfitPromptLive");
    if (!el) return;
    const supportsFieldSizing = typeof CSS !== "undefined"
      && typeof CSS.supports === "function"
      && CSS.supports("field-sizing", "content");
    if (supportsFieldSizing) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
  }, [isOutfitWorkflow, settings.prompt]);

  // E28（原 1026–1045）：预览浮层键盘（←/→/Esc）。
  useEffect(() => {
    if (!preview) return undefined;
    function handleKeyDown(event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigatePreview(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigatePreview(1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePreviewModal();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview, resultPreviewTasks]);
  /* eslint-enable react-hooks/exhaustive-deps */
}
