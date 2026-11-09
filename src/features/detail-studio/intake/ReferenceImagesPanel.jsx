// src/features/detail-studio/intake/ReferenceImagesPanel.jsx
// 阶段 2 §4：参考图上传 + 职责标注（product / visualStyle / contentStructure）+ 分块展示。
//
// 三类职责在 constants/workspace-contract.js#STUDIO_REFERENCE_ROLES 集中维护，与后端 store 同源校验。
// 图片文件复用现有上传端点（落 data/detail-studio/assets/<id>/，不进 data/results、不进 seed）。
// 组件零业务逻辑：上传经 state.uploadReferenceImage → api → 服务端；列表由 state.referenceImages 持有（带 url）。
// V201 整改：三类角色各自一个 ReferenceImageDropzone，支持点击 / 拖拽 / 粘贴；product 标必传、其余标可选。

import { useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import {
  STUDIO_REFERENCE_ROLES,
  STUDIO_REFERENCE_ROLE_LABELS
} from "../constants/workspace-contract.js";
import { ReferenceImageDropzone } from "./ReferenceImageDropzone.jsx";

export function ReferenceImagesPanel({ state }) {
  // 粘贴路由：全局 paste 事件派发给当前激活（聚焦 / 最近交互）的角色块，默认 product。
  const [activeRole, setActiveRole] = useState(STUDIO_REFERENCE_ROLES[0]);

  // 打开 / 切换到另一个项目时重置激活角色并刷新列表（state.referenceImages 由 hook 维护，带 url）。
  useEffect(() => {
    if (state.currentProject) state.loadReferenceImages(state.currentProject.id);
    // 仅在项目切换时刷新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentProject?.id]);

  if (!state.currentProject) {
    return (
      <Panel className="detailStudioPanel">
        <ModuleHeader
          icon={<ImagePlus size={15} />}
          title="参考图"
          subtitle="商品图 / 视觉风格 / 内容结构，按职责标注"
        />
        <p className="detailStudioEmpty">请先在左侧创建或打开一个详情项目，再上传参考图。</p>
      </Panel>
    );
  }

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<ImagePlus size={15} />}
        title="参考图"
        subtitle="商品图 / 视觉风格 / 内容结构，按职责标注"
      />
      <p className="detailStudioNote">
        先填商品资料，上传至少一张产品图，其余可跳过。三类参考图均支持点击选择 / 拖拽 / 粘贴截图。
      </p>

      <div className="detailStudioDropzoneList">
        {STUDIO_REFERENCE_ROLES.map((role) => (
          <ReferenceImageDropzone
            key={role}
            role={role}
            roleLabel={STUDIO_REFERENCE_ROLE_LABELS[role] || role}
            required={role === "product"}
            state={state}
            active={activeRole === role}
            onActivate={() => setActiveRole(role)}
          />
        ))}
      </div>
    </Panel>
  );
}

export default ReferenceImagesPanel;
