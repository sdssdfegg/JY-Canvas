// src/features/outfit/panels/ImageVersionList.jsx
// P2-4（2026-11-05）：生成出口真实轮次 + 最小版本列表的**只读**前端展示。
//
// 设计约束（执行单 §1.2 / §3.1 / §4）：
//   - 纯只读：只拉取服务端版本列表并展示「当前编辑对象 + 版本列表（序号 / 状态 / 创建时间）」；
//     不新增持久化键、不改 dock 布局、不改既有中文文案、不新增弹窗组件（Modal）。
//   - 复用 src/shared/ui 的 Panel / ModuleHeader / Button；文案中文。
//   - 数据一律经 src/api/image-version.js（api-layering 门禁，禁裸 fetch）。
//   - 本组件为纯 props 只读渲染，不提升状态、不引入渲染期 TDZ 面。
import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Button } from "../../../shared/ui/Button.jsx";
import { listImageVersions, imageVersionAssetUrl } from "../../../api/image-version.js";

const STATUS_LABEL = { succeeded: "成功", failed: "失败", pending: "处理中" };

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ImageVersionList({ taskId }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listImageVersions(taskId || undefined);
      setVersions(Array.isArray(data.versions) ? data.versions : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = versions.find((v) => v.status === "succeeded" && v.has_result);

  return (
    <Panel padding="md" className="image-version-panel">
      <ModuleHeader
        icon={<History size={16} />}
        title="编辑历史"
        subtitle={loading ? "加载中…" : `共 ${versions.length} 个版本`}
        action={
          <Button size="sm" tone="ghost" iconOnly title="刷新" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} />
          </Button>
        }
      />
      {error && <div className="image-version-error">{error}</div>}
      {!error && versions.length === 0 && (
        <div className="image-version-empty">暂无编辑记录。生成结果后将自动记录为版本。</div>
      )}
      {current && (
        <div className="image-version-current" style={{ marginTop: 12 }}>
          <span className="image-version-current__label" style={{ display: "block", marginBottom: 6, opacity: 0.7, fontSize: 12 }}>
            当前编辑对象
          </span>
          <img
            className="image-version-current__img"
            src={imageVersionAssetUrl(current.version_id)}
            alt="当前编辑对象"
            loading="lazy"
            style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, objectFit: "contain", display: "block" }}
          />
        </div>
      )}
      {versions.length > 0 && (
        <ul className="image-version-list" style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
          {versions.map((v) => (
            <li
              key={v.version_id}
              className="image-version-row"
              style={{ display: "flex", gap: 12, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(128,128,128,0.18)", fontSize: 13 }}
            >
              <span className="image-version-row__seq" style={{ minWidth: 40, opacity: 0.85 }}>#{v.version}</span>
              <span className="image-version-row__status" style={{ minWidth: 48 }}>{STATUS_LABEL[v.status] || v.status || "未知"}</span>
              <span className="image-version-row__time" style={{ marginLeft: "auto", opacity: 0.7 }}>{formatTime(v.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
