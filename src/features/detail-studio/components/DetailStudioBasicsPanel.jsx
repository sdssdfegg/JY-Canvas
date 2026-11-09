// src/features/detail-studio/components/DetailStudioBasicsPanel.jsx
// 业务区①：当前项目基础信息查看与保存。局部表单状态自管，便于后续按业务区切割。

import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { Field } from "../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";
import { STUDIO_MODE_LABELS } from "../constants/workspace-contract.js";

export function DetailStudioBasicsPanel({ state }) {
  const [editName, setEditName] = useState("");
  const [editNote, setEditNote] = useState("");
  const current = state.currentProject;

  useEffect(() => {
    if (!current) return;
    setEditName(current.name || "");
    setEditNote(current.note || "");
  }, [current]);

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<Save size={15} />}
        title="当前项目"
        subtitle={current ? current.id : "尚未选择项目"}
      />
      {current ? (
        <>
          <Field label="项目名称">
            <input
              className="detailStudioInput"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
          </Field>
          <Field label="备注">
            <textarea
              className="detailStudioTextarea"
              value={editNote}
              onChange={(event) => setEditNote(event.target.value)}
            />
          </Field>
          <div className="detailStudioFacts">
            <div className="detailStudioFact">
              <span className="detailStudioFactLabel">创作模式（创建后不可变）</span>
              <span className="detailStudioFactValue">{STUDIO_MODE_LABELS[current.mode] || current.mode}</span>
            </div>
            <div className="detailStudioFact">
              <span className="detailStudioFactLabel">状态</span>
              <span className="detailStudioFactValue">{current.status}</span>
            </div>
            <div className="detailStudioFact">
              <span className="detailStudioFactLabel">创建时间</span>
              <span className="detailStudioFactValue">{current.createdAt}</span>
            </div>
            <div className="detailStudioFact">
              <span className="detailStudioFactLabel">最近更新</span>
              <span className="detailStudioFactValue">{current.updatedAt}</span>
            </div>
          </div>
          <Toolbar align="end" wrap>
            <Button size="sm" tone="ghost" loading={state.busy} onClick={() => state.refresh()}>
              <RefreshCw size={14} />
              <span>重新载入列表</span>
            </Button>
            <Button
              size="sm"
              tone="primary"
              loading={state.busy}
              onClick={() => state.saveProject({ name: editName, note: editNote })}
            >
              <Save size={14} />
              <span>保存基础信息</span>
            </Button>
          </Toolbar>
          <p className="detailStudioNote">
            保存后可从左侧列表再次打开，验证服务端持久化。项目数据只存本地服务端 data/，不进封装种子。
          </p>
        </>
      ) : (
        <p className="detailStudioEmpty">新建或点击左侧项目，查看并编辑基础信息。</p>
      )}
    </Panel>
  );
}
