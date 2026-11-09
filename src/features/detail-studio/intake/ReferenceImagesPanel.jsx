// src/features/detail-studio/intake/ReferenceImagesPanel.jsx
// 阶段 2 §4：参考图上传 + 职责标注（product / visualStyle / contentStructure）+ 展示。
//
// 三类职责在 constants/workspace-contract.js#STUDIO_REFERENCE_ROLES 集中维护，与后端 store 同源校验。
// 图片文件复用现有上传端点（落 data/detail-studio/assets/<id>/，不进 data/results、不进 seed）。
// 组件零业务逻辑：上传经 state.uploadReferenceImage → api → 服务端；列表由 state.referenceImages 持有（带 url）。

import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { Field } from "../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";
import {
  STUDIO_REFERENCE_ROLES,
  STUDIO_REFERENCE_ROLE_DESCRIPTIONS,
  STUDIO_REFERENCE_ROLE_LABELS
} from "../constants/workspace-contract.js";

export function ReferenceImagesPanel({ state }) {
  const current = state.currentProject;
  const [role, setRole] = useState(STUDIO_REFERENCE_ROLES[0]);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);

  // 打开 / 切换到另一个项目时刷新列表（state.referenceImages 由 hook 维护，带 url）。
  useEffect(() => {
    if (current) state.loadReferenceImages(current.id);
    // 仅在项目切换时刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  async function handleUpload() {
    if (!file) return;
    const ok = await state.uploadReferenceImage(file, role, label);
    if (ok) {
      setLabel("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const images = Array.isArray(state.referenceImages) ? state.referenceImages : [];

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<ImagePlus size={15} />}
        title="参考图"
        subtitle="商品图 / 视觉风格 / 内容结构，按职责标注"
      />

      <Field label="参考图职责">
        <select
          className="detailStudioSelect"
          value={role}
          disabled={state.busy}
          onChange={(event) => setRole(event.target.value)}
        >
          {STUDIO_REFERENCE_ROLES.map((r) => (
            <option key={r} value={r}>{STUDIO_REFERENCE_ROLE_LABELS[r]}（{r}）</option>
          ))}
        </select>
      </Field>
      <p className="detailStudioNote">{STUDIO_REFERENCE_ROLE_DESCRIPTIONS[role]}</p>

      <Field label="标注（可选）">
        <input
          className="detailStudioInput"
          value={label}
          placeholder="例如：官网主图 / 期望色调参考"
          onChange={(event) => setLabel(event.target.value)}
        />
      </Field>

      <Field label="选择图片">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="detailStudioFile"
          onChange={(event) => setFile(event.target.files && event.target.files[0] ? event.target.files[0] : null)}
        />
      </Field>

      <Toolbar align="end">
        <Button size="sm" tone="primary" loading={state.busy} disabled={!file} onClick={handleUpload}>
          <span>上传并标注</span>
        </Button>
      </Toolbar>

      <div className="detailStudioReferenceGrid">
        {images.length === 0 ? (
          <p className="detailStudioEmpty">暂无参考图，上传后按职责分类展示。</p>
        ) : images.map((img) => (
          <div className="detailStudioReferenceCard" key={img.id || img.filename}>
            <img className="detailStudioReferenceThumb" src={img.url} alt={img.label || img.role} />
            <div className="detailStudioReferenceMeta">
              <span className={"detailStudioReferenceRole detailStudioReferenceRole_" + (img.role || "")}>
                {STUDIO_REFERENCE_ROLE_LABELS[img.role] || img.role}
              </span>
              <span className="detailStudioReferenceLabel">{img.label || "（无标注）"}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default ReferenceImagesPanel;
