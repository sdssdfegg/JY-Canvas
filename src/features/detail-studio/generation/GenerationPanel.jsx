// src/features/detail-studio/generation/GenerationPanel.jsx
// 阶段 4 · 批量生成与任务管理前端面板。
//
// 只做展示与触发：进度（整体 + 单屏）、任务列表、单屏重试 / 取消。
// 业务逻辑（排队 / 并发闸门 / 幂等 / 失败隔离 / 重试 / 恢复）全在服务端 orchestrator。
// 复用 src/shared/ui/Button + TaskBadge + Modal；CSS 语义令牌、零 hex。
// 遵循 V201 布局契约：本面板挂在右列「分屏规划」之后，按客户操作顺序。

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCw, X } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { TaskBadge } from "../../../shared/ui/TaskBadge.jsx";
import { Modal, ModalHeader } from "../../../shared/ui/Modal.jsx";
import { ElapsedTimer } from "../../../shared/ui/elapsed-timer.jsx";
import { formatMs } from "../../../lib/format/index.js";
import { StitchPreview } from "./StitchPreview.jsx";
import { resultImageSrc } from "./result-image.js";

const STATUS_LABEL = {
  queued: "排队中",
  running: "生成中",
  success: "成功",
  failed: "失败",
  cancelled: "已取消",
  needs_confirm: "待确认"
};

function isActive(counts) {
  return counts && (counts.queued + counts.running) > 0;
}

// 已完成（成功/失败/待确认/取消）任务的耗时（毫秒）。
// 起算 = 任务创建（入队）时刻；止算 = finished_at 或 updated_at（终态写入时刻）。
// 注意：命名为 generationTaskDurationMs 以避开 outfit-task.js 的同名顶层函数
//（两者读取的字段不同：本函数用 ISO 字符串 created_at/finished_at，outfit 版用数字 startedAt/finishedAt），
// 语义不可互换，故不复用，仅改名消歧义。
function generationTaskDurationMs(task) {
  const end = Date.parse(task?.finished_at || task?.updated_at);
  const start = Date.parse(task?.created_at);
  if (Number.isNaN(end) || Number.isNaN(start)) return null;
  const d = end - start;
  return d >= 0 ? d : null;
}

export function GenerationPanel({ state }) {
  const { currentProject, apiKeyMissing, startGeneration, getDetailStudioGenerationStatus,
    retryGeneration, cancelDetailStudioGenerationTask, error } = state;
  const projectId = currentProject?.id;

  const [status, setStatus] = useState(null);
  const [localError, setLocalError] = useState("");
  const [starting, setStarting] = useState(false);
  const [zoom, setZoom] = useState(null); // { src, index }
  const pollRef = useRef(null);

  const loadStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await getDetailStudioGenerationStatus(projectId);
      setStatus(res);
    } catch {
      // 状态拉取失败不阻断主流程（如项目尚无任何任务）
    }
  }, [projectId, getDetailStudioGenerationStatus]);

  // 打开项目即拉取历史任务（验收 §8.6：重新打开能看到历史任务与结果）。
  useEffect(() => {
    setStatus(null);
    setLocalError("");
    setZoom(null);
    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [projectId, loadStatus]);

  // 存在未终态任务时每 3s 轮询；全部终态则停。
  const active = isActive(status);
  useEffect(() => {
    if (active) {
      if (!pollRef.current) pollRef.current = setInterval(loadStatus, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {};
  }, [active, loadStatus]);

  const onStart = async () => {
    if (!projectId) return;
    setStarting(true);
    setLocalError("");
    try {
      const res = await startGeneration(projectId, {});
      if (res && Array.isArray(res.created) && res.created.length === 0 &&
          Array.isArray(res.skipped) && res.skipped.length > 0) {
        setLocalError("该批屏已生成成功（幂等复用，未重复提交上游）");
      }
      await loadStatus();
    } catch (err) {
      setLocalError(err?.message || "启动批量生成失败");
    } finally {
      setStarting(false);
    }
  };

  const onRetry = async (taskId) => {
    try {
      await retryGeneration(taskId);
      await loadStatus();
    } catch (err) {
      setLocalError(err?.message || "重试失败");
    }
  };

  const onCancel = async (taskId) => {
    try {
      await cancelDetailStudioGenerationTask(projectId, taskId);
      await loadStatus();
    } catch (err) {
      setLocalError(err?.message || "取消失败");
    }
  };

  if (!currentProject) return null;

  // ── P0 前置可见性（V211）：冻结前 / 未配置时给用户明确原因，不再「点了没反应」──
  const modelConfig = currentProject?.modelConfig || {};
  const requestedImageModel = String(modelConfig.imageModel || "").trim();
  const requestedChannelId = String(modelConfig.channelId || "").trim();
  const modelConfigMissing = !requestedImageModel || !requestedChannelId;

  const planning = currentProject?.planning || {};
  const frozenPrompts = planning.frozenPrompts || {};
  const frozenAorB = Object.keys(frozenPrompts).length > 0;
  const frozenModeC = currentProject?.mode === "direct"
    && String(currentProject?.modeC?.frozenPrompt || "").trim().length > 0;
  const frozen = frozenAorB || frozenModeC;

  const blocked = apiKeyMissing || !frozen;
  const blockReason = apiKeyMissing
    ? "请到设置页填写 API Key 后再生成（全画板只在设置页填一次）。"
    : !frozen
      ? "请先编译并冻结提示词（冻结成功后才能开始批量生成）。"
      : "";

  const counts = status?.counts;
  const tasks = status?.tasks || [];

  return (
    <section className="detailStudioPanel generationPanel">
      <header className="generationPanelHead">
        <h3>批量生成与任务管理</h3>
        <Button
          size="sm"
          tone="primary"
          loading={starting}
          disabled={blocked}
          onClick={onStart}
        >
          <Play size={14} /> 开始批量生成（最多 20 屏）
        </Button>
      </header>

      {blockReason && (
        <div className="generationHint">{blockReason}</div>
      )}
      {modelConfigMissing && !blocked && (
        <div className="generationHint generationHintInfo">
          未配置生图模型 / 渠道，生成时将使用推荐默认（tt-image-2.6 / laoye），可在左列「模型与渠道配置」中修改。
        </div>
      )}
      {error && <div className="detailStudioBanner detailStudioBannerError">{error}</div>}
      {localError && <div className="detailStudioBanner detailStudioBannerError">{localError}</div>}

      {counts && (
        <div className="generationProgress">
          <div className="generationProgressTrack">
            <div className="generationProgressFill" style={{ width: `${counts.percent}%` }} />
          </div>
          <div className="generationProgressText">
            运行中 {counts.running} · 排队中 {counts.queued} · 成功 {counts.success} · 失败 {counts.failed} · 待确认 {counts.needs_confirm} · 已取消 {counts.cancelled} · 共 {counts.total}（{counts.percent}%）
          </div>
        </div>
      )}

      <ul className="generationTaskList">
        {tasks.length === 0 && (
          <li className="generationEmpty">尚无生成任务。完成分屏 / 冻结提示词后，点「开始批量生成」。</li>
        )}
        {tasks.map((t) => {
          const imgSrc = resultImageSrc(t);
          const isRunning = t.status === "queued" || t.status === "running";
          const durationMs = isRunning ? null : generationTaskDurationMs(t);
          const canRetry = t.status === "failed" || t.status === "needs_confirm";
          const canCancel = isRunning;
          return (
            <li key={t.task_id} className="generationTaskRow">
              <div className="generationTaskHead">
                <span className="generationTaskIndex">屏 {t.screenIndex}</span>
                <TaskBadge status={t.status}>{STATUS_LABEL[t.status] || t.status}</TaskBadge>
                {isRunning ? (
                  <span className="generationTaskElapsed">已等待 <ElapsedTimer startedAt={t.created_at} /></span>
                ) : durationMs != null ? (
                  <span className="generationTaskElapsed">完成用时 {formatMs(durationMs)}</span>
                ) : null}
                <span className="generationTaskActions">
                  {canRetry && (
                    <Button size="sm" iconOnly title="重试该屏" onClick={() => onRetry(t.task_id)}>
                      <RotateCw size={14} />
                    </Button>
                  )}
                  {canCancel && (
                    <Button size="sm" iconOnly title="取消该屏" onClick={() => onCancel(t.task_id)}>
                      <X size={14} />
                    </Button>
                  )}
                </span>
              </div>

              {imgSrc && (
                <button
                  type="button"
                  className="generationThumbBtn"
                  title="点击放大查看"
                  onClick={() => setZoom({ src: imgSrc, index: t.screenIndex })}
                >
                  <img
                    className="generationThumb"
                    src={imgSrc}
                    alt={`屏 ${t.screenIndex} 生成结果`}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              )}

              {t.error?.message && (
                <div className="generationTaskErrorBlock">
                  <span className="generationTaskErrorLabel">失败原因</span>
                  <span className="generationTaskErrorMessage">{t.error.message}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <StitchPreview tasks={tasks} />

      {zoom && (
        <Modal layerClassName="modalLayer" panelClassName="detailStudioZoomModal" onClose={() => setZoom(null)}>
          <ModalHeader
            title={`屏 ${zoom.index} 结果图`}
            subtitle="点击遮罩或右上角关闭"
            onClose={() => setZoom(null)}
            closeLabel="关闭预览"
          />
          <img className="detailStudioZoomImg" src={zoom.src} alt={`屏 ${zoom.index} 结果图放大预览`} />
        </Modal>
      )}
    </section>
  );
}

export default GenerationPanel;
