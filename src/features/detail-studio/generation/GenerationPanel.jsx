// src/features/detail-studio/generation/GenerationPanel.jsx
// 阶段 4 · 批量生成与任务管理前端面板。
//
// 只做展示与触发：进度（整体 + 单屏）、任务列表、单屏重试 / 取消。
// 业务逻辑（排队 / 并发闸门 / 幂等 / 失败隔离 / 重试 / 恢复）全在服务端 orchestrator。
// 复用 src/shared/ui/Button + TaskBadge；CSS 语义令牌、零 hex。
// 遵循 V201 布局契约：本面板挂在右列「分屏规划」之后，按客户操作顺序。

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCw, X } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { TaskBadge } from "../../../shared/ui/TaskBadge.jsx";

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

export function GenerationPanel({ state }) {
  const { currentProject, apiKeyMissing, startGeneration, getDetailStudioGenerationStatus,
    retryDetailStudioGenerationTask, cancelDetailStudioGenerationTask } = state;
  const projectId = currentProject?.id;

  const [status, setStatus] = useState(null);
  const [localError, setLocalError] = useState("");
  const [starting, setStarting] = useState(false);
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
      await retryDetailStudioGenerationTask(projectId, taskId, {});
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
          disabled={apiKeyMissing}
          onClick={onStart}
        >
          <Play size={14} /> 开始批量生成（最多 20 屏）
        </Button>
      </header>

      {apiKeyMissing && (
        <div className="generationHint">请到设置页填写 API Key 后再生成（全画板只在设置页填一次）。</div>
      )}
      {localError && <div className="detailStudioBanner detailStudioBannerError">{localError}</div>}

      {counts && (
        <div className="generationProgress">
          <div className="generationProgressTrack">
            <div className="generationProgressFill" style={{ width: `${counts.percent}%` }} />
          </div>
          <div className="generationProgressText">
            成功 {counts.success} · 失败 {counts.failed} · 待确认 {counts.needs_confirm} · 已取消 {counts.cancelled} · 共 {counts.total}（{counts.percent}%）
          </div>
        </div>
      )}

      <ul className="generationTaskList">
        {tasks.length === 0 && (
          <li className="generationEmpty">尚无生成任务。完成分屏 / 冻结提示词后，点「开始批量生成」。</li>
        )}
        {tasks.map((t) => (
          <li key={t.task_id} className="generationTaskRow">
            <span className="generationTaskIndex">屏 {t.screenIndex}</span>
            <TaskBadge status={t.status}>{STATUS_LABEL[t.status] || t.status}</TaskBadge>
            {t.error?.message && <span className="generationTaskError">{t.error.message}</span>}
            <span className="generationTaskActions">
              {(t.status === "failed" || t.status === "needs_confirm") && (
                <Button size="sm" iconOnly title="重试该屏" onClick={() => onRetry(t.task_id)}>
                  <RotateCw size={14} />
                </Button>
              )}
              {(t.status === "queued" || t.status === "running") && (
                <Button size="sm" iconOnly title="取消该屏" onClick={() => onCancel(t.task_id)}>
                  <X size={14} />
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default GenerationPanel;
