// src/features/outfit/panels/ResultQueue.jsx
// V65 (P5-3) 2026-10-15：从 src/outfit-workflow.jsx renderResultQueue（3104–3295，派发日实测）逐字搬出。
// 内容：结果队列面板——任务卡网格（running/failed/success 三态）+ 预览卡引用 + 空态引导；
//   精修页专属的中线剪裁条 V78 起已归位到「精修设置」的正反行（见 RetouchIntentPanel）：
//   结果区不再渲染任何开关条，与「裁剪跟随正反联动」的语义一致。
// 模式：原函数内引用的 state/handler 全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   模块级工具几乎都已在 features/shared 导出（taskStatusLabel/taskDurationMs/canRerunTask 等），
//   面板直接 import，不重复实现；派生值（visibleTasks 等）由调用方算好传入（渲染期求值，无 TDZ 面）。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V65 §3.2 负向对照兜底。
// V5.0-006 (2026-10-24)：两张卡（TaskStatusCard / ResultCard）已抽为 React.memo 组件
//   （见 ./result-card.jsx，JSX 逐字搬运）。本文件只留容器 + 空态 + 三项稳定化工作：
//   ① 上游 16 个 handler 走「晚期绑定委托」收敛为稳定引用（否则 memo 被绕过）；
//   ② 整包集合改每卡派生：selected/isDownloaded/isReplaceTarget/brokenEntry（基元/单条，可浅比较）；
//   ③ activeOutfitPage 只用 .workflowMode ⇒ 派生为标量 workflowMode 传入，
//      规避 activeOutfitPage fallback 分支新建对象破 memo 的风险。
//   map 里只留 O(1) 集合查询，重活（durationMs/references/promptText/src/brokenReason…）已下沉卡内，
//   卡 bail 时这些开销一并省掉。
import { useMemo, useRef } from "react";
import { Sparkles } from "lucide-react";
import { ResultCard, TaskStatusCard } from "./result-card.jsx";

export function ResultQueue({
  visibleTasks,
  selectedTaskIds,
  downloadFeedbackIds,
  brokenTaskImages,
  resultReplaceTargetId,
  galleryCardMin,
  taskGridRef,
  settings,
  activeOutfitPage,
  resultFilter,
  isPoseRemixWorkflow,
  isRandomBackgroundWorkflow,
  isOutpaintWorkflow,
  isFaceSwapWorkflow,
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
  copyText
}) {
  // V5.0-006：下游两卡已 React.memo；上游 16 个 handler 由 OutfitWorkbench 透传、每次重渲染都重建闭包，
  // 若直接透传则 memo 被绕过、批量结果区仍全树重渲染。此处用「晚期绑定委托」收敛为稳定引用：
  // ref 每渲染刷新指向最新闭包，委托函数仅在首渲染经 useMemo([]) 创建一次，调用时经 ref 转发到最新实现，
  // 零陈旧闭包、零依赖管理、零触及上游工厂与主链路。沿用本仓 handlerLateRef 同款手法（同 V5.0-002）。
  const cardHandlersRef = useRef(null);
  cardHandlersRef.current = {
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
    copyText
  };
  const cardHandlers = useMemo(() => {
    const ref = cardHandlersRef;
    return {
      toggleTaskSelected: (...args) => ref.current.toggleTaskSelected(...args),
      retryTask: (...args) => ref.current.retryTask(...args),
      downloadTask: (...args) => ref.current.downloadTask(...args),
      rerunResultTask: (...args) => ref.current.rerunResultTask(...args),
      deleteResultTask: (...args) => ref.current.deleteResultTask(...args),
      setPreview: (...args) => ref.current.setPreview(...args),
      setImageLightbox: (...args) => ref.current.setImageLightbox(...args),
      handleResultReplaceDragOver: (...args) => ref.current.handleResultReplaceDragOver(...args),
      handleResultReplaceDrop: (...args) => ref.current.handleResultReplaceDrop(...args),
      setResultReplaceTargetId: (...args) => ref.current.setResultReplaceTargetId(...args),
      markTaskImageBroken: (...args) => ref.current.markTaskImageBroken(...args),
      beginTaskImageDrag: (...args) => ref.current.beginTaskImageDrag(...args),
      clearResultDragState: (...args) => ref.current.clearResultDragState(...args),
      openReferenceContextMenu: (...args) => ref.current.openReferenceContextMenu(...args),
      beginReferenceImageDrag: (...args) => ref.current.beginReferenceImageDrag(...args),
      copyText: (...args) => ref.current.copyText(...args)
    };
  }, []);
  // activeOutfitPage 只在卡的 diagnostic 里用 .workflowMode ⇒ 派生为标量，规避对象引用波动。
  const workflowMode = activeOutfitPage?.workflowMode || "";

  return (
    <section className="resultPanel queuePanel" id="result-archive-section">
      <div className="taskGrid" ref={taskGridRef} style={{ "--asset-card-min": `${galleryCardMin}px` }}>
        {visibleTasks.map((task, taskIndex) => {
          // V5.0-006：整包集合改每卡派生布尔/单条——单张选中/下载/拖拽高亮只翻转该卡对应值，
          // 其余卡取值不变（基元相等）→ React.memo 跳过，杜绝全树重渲染。
          const selected = selectedTaskIds.has(task.id);
          const isDownloaded = downloadFeedbackIds.has(task.id);
          const isReplaceTarget = resultReplaceTargetId === task.id;
          const brokenEntry = brokenTaskImages[task.id] || task.resultMissing;
          if (task.status !== "success") {
            return (
              <TaskStatusCard
                key={task.id}
                task={task}
                selected={selected}
                settings={settings}
                toggleTaskSelected={cardHandlers.toggleTaskSelected}
                retryTask={cardHandlers.retryTask}
              />
            );
          }
          return (
            <ResultCard
              key={task.id}
              task={task}
              taskIndex={taskIndex}
              selected={selected}
              isDownloaded={isDownloaded}
              isReplaceTarget={isReplaceTarget}
              brokenEntry={brokenEntry}
              settings={settings}
              workflowMode={workflowMode}
              toggleTaskSelected={cardHandlers.toggleTaskSelected}
              downloadTask={cardHandlers.downloadTask}
              rerunResultTask={cardHandlers.rerunResultTask}
              deleteResultTask={cardHandlers.deleteResultTask}
              setPreview={cardHandlers.setPreview}
              setImageLightbox={cardHandlers.setImageLightbox}
              handleResultReplaceDragOver={cardHandlers.handleResultReplaceDragOver}
              handleResultReplaceDrop={cardHandlers.handleResultReplaceDrop}
              setResultReplaceTargetId={cardHandlers.setResultReplaceTargetId}
              markTaskImageBroken={cardHandlers.markTaskImageBroken}
              beginTaskImageDrag={cardHandlers.beginTaskImageDrag}
              clearResultDragState={cardHandlers.clearResultDragState}
              openReferenceContextMenu={cardHandlers.openReferenceContextMenu}
              beginReferenceImageDrag={cardHandlers.beginReferenceImageDrag}
              copyText={cardHandlers.copyText}
            />
          );
        })}
        {visibleTasks.length === 0 && (
          <div className="emptyTasks">
            <Sparkles size={28} />
            <span>{resultFilter === "video" ? "视频模块暂未接入。" : isPoseRemixWorkflow ? "上传图1姿态参考图和图2固定母版成片后，点击生成。" : isRandomBackgroundWorkflow ? "上传图1人物图，并在场景补充里写大概场景后，点击生成。" : isOutpaintWorkflow ? "上传图1半身照后，点击生成向下扩图。" : isFaceSwapWorkflow ? "上传图1目标人物图和图2人脸参考图后，点击生成。" : "上传模特图和服装图后，点击生成。"}</span>
          </div>
        )}
      </div>
    </section>
  );
}
