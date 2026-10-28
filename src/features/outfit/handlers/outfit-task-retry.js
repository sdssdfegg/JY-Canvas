// 模式：V5.0-011——任务重试/重刷域整块迁入本 hook。
// 域 = 原 src/outfit-workflow.jsx 的两个 async 函数（retryTask → rerunResultTask），按原声明顺序逐字迁移。
// 行为契约：零行为变化（纯迁移）——两个函数体逐字不动。
// 调用点约束：调用方须将 useOutfitTaskRetry 置于 useOutfitBatchExecution 之后
//   （ctx 消费 runSingleTask / beginGenerationRun / endGenerationRun，均来自该 hook）；
//   消费方仅 JSX（OutfitWorkbench props → ResultQueue → result-card 的
//   .assetRetryButton / .assetRerunButton），无其他时序约束；
//   本 hook 是纯函数工厂（内部无任何 React hook）⇒ 无 hook 顺序影响。
import {
  taskRuntimeStageLabel,
  summarizeGenerationError,
  revokeResultImageRuntimeCache,
  canRerunTask,
  buildRerunReplacementTask
} from "../outfit-task.js";
import { sanitizeErrorText } from "../../../shared/generation-errors.js";

export function useOutfitTaskRetry(ctx) {
  const {
    running, canAppendWhileRunning,
    beginGenerationRun, endGenerationRun,
    runSingleTask,
    tasksRef, setTasks,
    addEvent
  } = ctx;

  async function retryTask(task) {
    if (running && !canAppendWhileRunning) return;
    beginGenerationRun();
    try {
      await runSingleTask({ ...task, status: "queued", error: "", result: null });
    } catch (error) {
      const latestTask = tasksRef.current.find((item) => item.id === task.id);
      const stageDetail = taskRuntimeStageLabel(latestTask);
      const errorDetail = [
        stageDetail ? `失败阶段：${stageDetail}` : "",
        sanitizeErrorText(error instanceof Error ? error.message : String(error))
      ].filter(Boolean).join("\n");
      setTasks((current) => current.map((item) => item.id === task.id ? {
        ...item,
        status: "failed",
        error: summarizeGenerationError(error),
        errorDetail,
        runtimeStage: "失败",
        runtimeDetail: stageDetail || "",
        runtimeUpdatedAt: Date.now(),
        qualityCheck: item.qualityCheckEnabled
          ? { status: "skipped", summary: "生成失败，未质检" }
          : null
      } : item));
    } finally {
      endGenerationRun();
    }
  }

  async function rerunResultTask(task) {
    if (!task?.result || task.status !== "success") return;
    if (!canRerunTask(task)) {
      addEvent("重刷", "这张历史结果缺少原始上传图，请重新上传后再生成");
      return;
    }
    const previousTask = task;
    const runnableTask = {
      ...buildRerunReplacementTask(task),
      localEditBatchMode: task.localEdit?.cropFile && task.localEdit?.cropRect ? "rerun-controlled-1" : "rerun"
    };
    setTasks((current) => current.map((item) => item.id === task.id ? runnableTask : item));
    beginGenerationRun();
    addEvent("重刷", `#${task.order || ""} 已开始原位重刷`);
    try {
      await runSingleTask(runnableTask);
      revokeResultImageRuntimeCache(previousTask.result);
      addEvent("重刷完成", `#${task.order || ""} 已用新结果覆盖原图`);
    } catch (error) {
      setTasks((current) => current.map((item) => item.id === runnableTask.id ? {
        ...previousTask,
        error: "",
        errorDetail: "",
        runtimeStage: "重刷失败",
        runtimeDetail: summarizeGenerationError(error),
        runtimeUpdatedAt: Date.now(),
        rerunCandidate: false
      } : item));
      addEvent("重刷失败", `${summarizeGenerationError(error)}；已保留原结果图`);
    } finally {
      endGenerationRun();
    }
  }

  async function annotateRerunResultTask(task, annotationFile, instruction = "") {
    if (!task?.result || task.status !== "success") return;
    if (!(annotationFile instanceof Blob)) {
      addEvent("标注编辑失败", "缺少标注参考图，无法提交");
      return;
    }
    if (!canRerunTask(task)) {
      addEvent("标注编辑", "这张历史结果缺少原始上传图，请重新上传后再生成");
      return;
    }
    const previousTask = task;
    // 标注参考图作为一条「额外参考图」随本次重刷发出（runSingleTask 已通用上传 referenceItems，
    // 无需改动上传分支）；指令走任务级 annotationPrompt 覆盖（缺省回落到全局 settings.prompt）。
    const annotationItem = {
      id: `anno_ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: `标注参考图-${(task.id || "").slice(-8)}.png`,
      file: annotationFile
    };
    const runnableTask = {
      ...buildRerunReplacementTask(task),
      localEditBatchMode: task.localEdit?.cropFile && task.localEdit?.cropRect ? "rerun-controlled-1" : "rerun",
      annotationPrompt: String(instruction || "").trim(),
      referenceItems: [...(task.referenceItems || []), annotationItem]
    };
    setTasks((current) => current.map((item) => item.id === task.id ? runnableTask : item));
    beginGenerationRun();
    addEvent("标注编辑", `#${task.order || ""} 已带标注参考图原位重刷`);
    try {
      await runSingleTask(runnableTask);
      revokeResultImageRuntimeCache(previousTask.result);
      addEvent("标注编辑完成", `#${task.order || ""} 已用新结果覆盖原图`);
    } catch (error) {
      setTasks((current) => current.map((item) => item.id === runnableTask.id ? {
        ...previousTask,
        error: "",
        errorDetail: "",
        runtimeStage: "标注编辑失败",
        runtimeDetail: summarizeGenerationError(error),
        runtimeUpdatedAt: Date.now(),
        rerunCandidate: false
      } : item));
      addEvent("标注编辑失败", `${summarizeGenerationError(error)}；已保留原结果图`);
    } finally {
      endGenerationRun();
    }
  }

  return { retryTask, rerunResultTask, annotateRerunResultTask };
}
