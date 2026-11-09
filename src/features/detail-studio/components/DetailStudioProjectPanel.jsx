// src/features/detail-studio/components/DetailStudioProjectPanel.jsx
// 业务区①：项目列表 + 新建项目。局部表单状态自管，便于后续按业务区切割。

import { useState } from "react";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { Field } from "../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";
import {
  STUDIO_MODE_DESCRIPTIONS,
  STUDIO_MODE_LABELS,
  STUDIO_MODES
} from "../constants/workspace-contract.js";

export function DetailStudioProjectPanel({ state }) {
  const [draftName, setDraftName] = useState("");
  const [draftMode, setDraftMode] = useState("guided");
  const [draftNote, setDraftNote] = useState("");

  const { projects, currentProject, busy } = state;

  async function handleCreate() {
    if (!draftName.trim()) return;
    const project = await state.createProject({ name: draftName, mode: draftMode, note: draftNote });
    if (project) {
      setDraftName("");
      setDraftNote("");
    }
  }

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<FolderOpen size={15} />}
        title="项目"
        subtitle="服务端持久化，重新打开可继续"
      />
      <div className="detailStudioList">
        {projects.length === 0 ? (
          <p className="detailStudioEmpty">暂无项目，先在下方新建一个。</p>
        ) : projects.map((item) => (
          <button
            type="button"
            key={item.id}
            className={
              "detailStudioProjectRow" +
              (currentProject && currentProject.id === item.id ? " detailStudioProjectRowActive" : "")
            }
            onClick={() => state.openProject(item.id)}
          >
            <span className="detailStudioProjectMeta">
              <span className="detailStudioProjectName">{item.name}</span>
              <span className="detailStudioProjectSub">
                {STUDIO_MODE_LABELS[item.mode] || item.mode} · {item.status}
              </span>
            </span>
            <span className="detailStudioProjectSub">{String(item.updatedAt || "").slice(0, 10)}</span>
          </button>
        ))}
      </div>

      <ModuleHeader icon={<Plus size={15} />} title="新建项目" />
      <Field label="项目名称">
        <input
          className="detailStudioInput"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="例如：秋季针织开衫详情"
        />
      </Field>
      <Field
        label="创作模式"
        hint={"阶段 1 仅登记不可变字段；" + (STUDIO_MODE_DESCRIPTIONS[draftMode] || "")}
      >
        <select
          className="detailStudioSelect"
          value={draftMode}
          onChange={(event) => setDraftMode(event.target.value)}
        >
          {STUDIO_MODES.map((mode) => (
            <option key={mode} value={mode}>{STUDIO_MODE_LABELS[mode]}</option>
          ))}
        </select>
      </Field>
      <Field label="备注">
        <textarea
          className="detailStudioTextarea"
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
          placeholder="商品 / 需求 / 方向的简要说明"
        />
      </Field>
      <Toolbar align="end">
        <Button tone="primary" size="sm" loading={busy} disabled={!draftName.trim()} onClick={handleCreate}>
          <Plus size={14} />
          <span>新建并保存</span>
        </Button>
      </Toolbar>
    </Panel>
  );
}
