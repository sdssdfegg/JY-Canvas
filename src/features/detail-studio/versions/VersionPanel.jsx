// src/features/detail-studio/versions/VersionPanel.jsx
// 阶段 5 · 单屏连续编辑与版本管理面板。
//
// 只做展示与触发：版本列表（图 + 当时提示词 + 修改说明）、版本对比、切换、
// 连续对话输入框、单屏重试 / 取消入口。业务逻辑（单屏隔离 / 版本落盘 / 切换指针 /
// 幂等键 / 出图）全在服务端 versions/ 与 generation/ 编排层。
// 复用 src/shared/ui/ + tokens.css，CSS 零 hex，沿用 V201 布局契约（纵向列表，不回退卡片墙）。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitCompare, GitBranch, ImageOff, Info, RefreshCw, RotateCw, X } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { TaskBadge } from "../../../shared/ui/TaskBadge.jsx";
import {
  cancelDetailStudioGenerationTask,
  editDetailStudioScreen,
  finalizeDetailStudioVersion,
  getDetailStudioGenerationStatus,
  getDetailStudioScreenVersions,
  switchDetailStudioVersion
} from "../../../api/detail-studio.js";

const STATUS_LABEL = {
  pending: "生成中",
  success: "成功",
  failed: "失败",
  needs_confirm: "待确认",
  cancelled: "已取消"
};

// 版本结果图是服务端绝对路径；URL 只取 basename，由新增的 generation/results 服务路由回送。
function versionImageUrl(projectId, imagePath) {
  if (!imagePath) return null;
  const name = String(imagePath).split(/[\\/]/).pop();
  if (!name) return null;
  return `/api/detail-studio/projects/${encodeURIComponent(projectId)}/generation/results/${encodeURIComponent(name)}`;
}

export function VersionPanel({ state }) {
  const { currentProject, apiKey, apiKeyMissing } = state;
  const projectId = currentProject?.id;

  const screens = useMemo(() => {
    const list = currentProject?.planning?.screens;
    return Array.isArray(list) ? list : [];
  }, [currentProject]);

  const frozenPrompts = useMemo(() => {
    const fp = currentProject?.planning?.frozenPrompts;
    return fp && typeof fp === "object" ? fp : {};
  }, [currentProject]);

  const [screenIndex, setScreenIndex] = useState(0);
  const [versions, setVersions] = useState([]);
  const [currentVersionId, setCurrentVersionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const [editPrompt, setEditPrompt] = useState("");
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [compareIds, setCompareIds] = useState([]); // 最多 2 个，用于版本对比
  const finalizeRef = useRef(false);

  const loadVersions = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLocalError("");
    try {
      const res = await getDetailStudioScreenVersions(projectId, screenIndex);
      const list = Array.isArray(res.versions) ? res.versions : [];
      setVersions(list);
      setCurrentVersionId(res.currentVersionId || null);
      const cur = list.find((v) => v.versionId === res.currentVersionId) || list[list.length - 1];
      const base = (cur && cur.prompt) || frozenPrompts[String(screenIndex)] || "";
      setEditPrompt(base);
      setInstruction("");
      setCompareIds([]);
    } catch {
      setLocalError("读取版本失败");
    } finally {
      setLoading(false);
    }
  }, [projectId, screenIndex, frozenPrompts]);

  // 打开项目 / 切换屏 → 拉取该屏版本链。
  useEffect(() => {
    setVersions([]);
    setCurrentVersionId(null);
    loadVersions();
    return () => {
      finalizeRef.current = false;
    };
  }, [projectId, screenIndex, loadVersions]);

  // 生成完成后补齐版本图片：轮询 generation 状态，命中终态任务即 finalize 并刷新。
  const finalizePending = useCallback(async () => {
    if (!projectId || finalizeRef.current) return;
    finalizeRef.current = true;
    try {
      const res = await getDetailStudioGenerationStatus(projectId);
      const tasks = res && Array.isArray(res.tasks) ? res.tasks : [];
      for (const v of versions) {
        if (v.status !== "pending" || !v.sourceTaskId) continue;
        const t = tasks.find((x) => x.task_id === v.sourceTaskId);
        if (t && t.status !== "queued" && t.status !== "running") {
          await finalizeDetailStudioVersion(projectId, v.versionId).catch(() => {});
        }
      }
      await loadVersions();
    } catch {
      // 状态拉取失败不阻断主流程
    } finally {
      finalizeRef.current = false;
    }
  }, [projectId, versions, loadVersions]);

  useEffect(() => {
    if (versions.some((v) => v.status === "pending" && v.sourceTaskId)) {
      const timer = setTimeout(finalizePending, 2500);
      return () => clearTimeout(timer);
    }
    return () => {};
  }, [versions, finalizePending]);

  const triggerEdit = useCallback(async (prompt, note) => {
    if (!projectId) return;
    if (apiKeyMissing) {
      setLocalError("请到设置页填写 API Key（全画板只在设置页填一次）后再生成");
      return;
    }
    if (!String(prompt || "").trim()) {
      setLocalError("请提供生成提示词");
      return;
    }
    setSubmitting(true);
    setLocalError("");
    try {
      const res = await editDetailStudioScreen(projectId, screenIndex, {
        frozenPrompt: prompt,
        editNote: note || "",
        userInstruction: note || prompt,
        apiKey
      });
      if (res && res.version && res.taskId) {
        await finalizePending();
      } else {
        await loadVersions();
      }
    } catch (err) {
      setLocalError(err?.message || "单屏编辑失败");
    } finally {
      setSubmitting(false);
    }
  }, [projectId, screenIndex, apiKey, apiKeyMissing, finalizePending, loadVersions]);

  const onSubmitEdit = () => {
    triggerEdit(editPrompt, instruction);
  };

  const onSwitch = async (versionId) => {
    try {
      await switchDetailStudioVersion(projectId, screenIndex, versionId);
      await loadVersions();
    } catch (err) {
      setLocalError(err?.message || "切换版本失败");
    }
  };

  const onRetry = (v) => {
    triggerEdit(v.prompt, "重试：" + (v.editNote || ""));
  };

  const onCancel = async (v) => {
    if (!v.sourceTaskId) return;
    try {
      await cancelDetailStudioGenerationTask(projectId, v.sourceTaskId);
      await finalizeDetailStudioVersion(projectId, v.versionId).catch(() => {});
      await loadVersions();
    } catch (err) {
      setLocalError(err?.message || "取消任务失败");
    }
  };

  const toggleCompare = (versionId) => {
    setCompareIds((prev) => {
      if (prev.includes(versionId)) return prev.filter((x) => x !== versionId);
      if (prev.length >= 2) return [prev[1], versionId];
      return [...prev, versionId];
    });
  };

  if (!currentProject) return null;

  const compareVersions = compareIds
    .map((id) => versions.find((v) => v.versionId === id))
    .filter(Boolean);
  const noScreens = screens.length === 0;

  return (
    <section className="detailStudioPanel versionPanel">
      <header className="versionPanelHead">
        <h3>单屏连续编辑与版本管理</h3>
        <Button size="sm" iconOnly title="刷新版本" onClick={loadVersions} disabled={loading}>
          <RefreshCw size={14} />
        </Button>
      </header>

      {apiKeyMissing && (
        <div className="generationHint">请到设置页填写 API Key 后再生成（全画板只在设置页填一次）。</div>
      )}
      {localError && <div className="detailStudioBanner detailStudioBannerError">{localError}</div>}

      {/* 屏选择：客户操作顺序，先选屏再操作该屏版本链 */}
      <div className="versionScreenTabs">
        {noScreens ? (
          <div className="versionScreenEmpty">尚未分屏（请先完成策划 / 分屏 / 冻结提示词）。仍可编辑第 0 屏。</div>
        ) : (
          screens.map((s) => {
            const idx = Number(s.screenIndex);
            const current = idx === screenIndex;
            return (
              <button
                key={idx}
                type="button"
                className={"versionScreenTab" + (current ? " isCurrent" : "")}
                onClick={() => setScreenIndex(idx)}
              >
                <span className="versionScreenIndex">屏 {idx}</span>
                {s.title ? <span className="versionScreenTitle">{s.title}</span> : null}
              </button>
            );
          })
        )}
      </div>

      {/* 版本对比：选中两个版本并排 */}
      {compareVersions.length === 2 && (
        <div className="versionCompare">
          <div className="versionCompareHead">
            <span><GitCompare size={13} /> 版本对比</span>
            <Button size="sm" iconOnly title="退出对比" onClick={() => setCompareIds([])}>
              <X size={14} />
            </Button>
          </div>
          <div className="versionCompareGrid">
            {compareVersions.map((v) => (
              <div key={v.versionId} className="versionCompareCol">
                <VersionThumb projectId={projectId} version={v} />
                <div className="versionCompareMeta">
                  <TaskBadge status={mapBadgeStatus(v.status)}>{STATUS_LABEL[v.status] || v.status}</TaskBadge>
                  {v.isCurrent ? <span className="versionCurrentTag">当前</span> : null}
                </div>
                <pre className="versionPromptText">{v.prompt}</pre>
                {v.editNote ? <p className="versionEditNote">{v.editNote}</p> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 版本列表：图 + 当时提示词 + 修改说明 + 切换 / 对比 / 重试 / 取消 */}
      <ul className="versionList">
        {!loading && versions.length === 0 && (
          <li className="versionEmpty">该屏尚无版本。在下方输入框修改提示词或补充指令，点「生成新版本」即可基于上一版继续编辑。</li>
        )}
        {versions.map((v) => (
          <li key={v.versionId} className={"versionRow" + (v.versionId === currentVersionId ? " isCurrent" : "")}>
            <VersionThumb projectId={projectId} version={v} />
            <div className="versionRowBody">
              <div className="versionRowMeta">
                <TaskBadge status={mapBadgeStatus(v.status)}>{STATUS_LABEL[v.status] || v.status}</TaskBadge>
                {v.versionId === currentVersionId ? <span className="versionCurrentTag">当前版本</span> : null}
                {v.parentVersionId ? <span className="versionParentTag">续 {String(v.parentVersionId).slice(-6)}</span> : null}
              </div>
              <pre className="versionPromptText">{v.prompt}</pre>
              {v.editNote ? <p className="versionEditNote">{v.editNote}</p> : null}
              {v.error && v.error.message ? <p className="versionError">{v.error.message}</p> : null}
              <div className="versionRowActions">
                <Button
                  size="sm"
                  tone={v.versionId === currentVersionId ? "ghost" : "primary"}
                  disabled={v.versionId === currentVersionId}
                  onClick={() => onSwitch(v.versionId)}
                >
                  <GitBranch size={14} /> 切换
                </Button>
                <Button size="sm" iconOnly title="加入对比" onClick={() => toggleCompare(v.versionId)}>
                  <GitCompare size={14} />
                </Button>
                {(v.status === "failed" || v.status === "needs_confirm") && (
                  <Button size="sm" iconOnly title="重试该版本" onClick={() => onRetry(v)}>
                    <RotateCw size={14} />
                  </Button>
                )}
                {v.status === "pending" && v.sourceTaskId && (
                  <Button size="sm" iconOnly title="取消该生成任务" onClick={() => onCancel(v)}>
                    <X size={14} />
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* 连续对话输入：修改提示词 + 本轮指令 → 基于上一版继续编辑 */}
      <div className="versionEditBox">
        <label className="versionEditTextareaLabel">
          本屏生成提示词（也可直接改为新的画面要求）
          <textarea
            className="versionEditTextarea"
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={5}
            placeholder="编辑提示词以生成新版本……"
          />
        </label>
        <label className="versionEditInputLabel">
          本轮修改指令（连续对话意图，永久留痕）
          <input
            className="versionEditInput"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：把背景换成清晨光线、文案再精简一句"
          />
        </label>
        <div className="versionEditActions">
          <Button
            size="md"
            tone="primary"
            loading={submitting}
            disabled={apiKeyMissing || !String(editPrompt).trim()}
            onClick={onSubmitEdit}
          >
            <GitBranch size={14} /> 生成新版本
          </Button>
          {instruction && (
            <span className="versionEditHint">
              <Info size={13} /> 将基于当前版本继续编辑（{instruction}）
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// 缩略图：成功且有图才显示；其余状态给占位。
function VersionThumb({ projectId, version }) {
  const url = version.status === "success" ? versionImageUrl(projectId, version.imagePath) : null;
  if (!url) {
    return (
      <div className="versionThumb versionThumbEmpty">
        <ImageOff size={18} />
      </div>
    );
  }
  return (
    <div className="versionThumb">
      <img src={url} alt="版本结果图" loading="lazy" />
    </div>
  );
}

// 版本状态 → 通用徽章状态（TaskBadge 文案由调用方 children 提供）。
function mapBadgeStatus(status) {
  if (status === "success") return "success";
  if (status === "failed" || status === "cancelled") return "failed";
  if (status === "needs_confirm") return "needs_confirm";
  return "running";
}

export default VersionPanel;
