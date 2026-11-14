// 一键详情「选择详情展示板块」弹窗（V214 P0）。
//
// 纯展示组件：只消费 detailApi 下发的状态与回调，自身不持有业务状态，
// 选择结果落在 src/features/detail/detail-state.js 的会话态 useState（不持久化）。
// 视觉约束：只用 src/shared/ui/ 组件 + 既有样式类，零新增 CSS 类、零 hex、
// 不引入任何新增样式类（含共享下拉类），避免撞既有全仓计数断言。
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, ModalHeader } from "../../shared/ui/Modal.jsx";
import { Button } from "../../shared/ui/Button";
import { SECTION_GROUPS, PRESET_SECTIONS, createCustomSection } from "./detail-sections.js";

export function DetailSectionsModal({
  onClose,
  selectedSections,
  onToggle,
  onMove,
  onAddCustom,
  onRemove,
  onClear
}) {
  const [draft, setDraft] = useState("");
  const [draggedId, setDraggedId] = useState(null);

  function addDraft() {
    const item = createCustomSection(draft);
    if (!item) return;
    onAddCustom(item);
    setDraft("");
  }

  function handleDrop(event, targetId) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    onMove(draggedId, targetId, placement);
    setDraggedId(null);
  }

  return (
    <Modal layerClassName="modalLayer" panelClassName="detailPresetModal" onClose={onClose}>
      <ModalHeader
        title="选择详情展示板块"
        subtitle="勾选你希望详情页重点展示的内容，可多选并调整顺序。"
        onClose={onClose}
        closeLabel="关闭"
      />
      <div className="detailPresetList">
        {SECTION_GROUPS.map((group) => (
          <section key={group.id}>
            <h4>{group.label}</h4>
            <div className="promptPresetGrid">
              {PRESET_SECTIONS.filter((section) => section.group === group.id).map((section) => (
                <label className="detailCheck" key={section.id}>
                  <input
                    type="checkbox"
                    checked={selectedSections.some((item) => item.id === section.id)}
                    onChange={() => onToggle(section)}
                  />
                  <span>{section.label}</span>
                </label>
              ))}
            </div>
          </section>
        ))}

        <h4>已选内容（拖动调整顺序）</h4>
        <div className="promptPresetGrid">
          {selectedSections.map((item, index) => (
            <div
              className={"promptChip" + (draggedId === item.id ? " dragging" : "")}
              key={item.id}
              draggable
              onDragStart={() => setDraggedId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, item.id)}
              onDragEnd={() => setDraggedId(null)}
            >
              <button className="promptChipMain" type="button" title="拖动调整顺序">
                {index + 1}. {item.label}
                {item.isCustom ? "（自定义）" : ""}
              </button>
              <button className="promptChipIcon" type="button" title="移除" onClick={() => onRemove(item.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {selectedSections.length === 0 && (
            <p className="promptEmpty">未选择板块，AI 将按商品图片与已填资料自主规划详情内容</p>
          )}
        </div>

        <label className="promptSearch">
          <Plus size={16} />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addDraft();
              }
            }}
            placeholder="输入自定义板块名称"
          />
        </label>
        <Button size="sm" onClick={addDraft}>添加自定义板块</Button>
      </div>
      <footer className="directoryModalActions">
        <div>
          <Button size="sm" onClick={onClear}>清空</Button>
          <Button size="sm" onClick={onClose}>取消</Button>
          <Button size="md" tone="primary" onClick={onClose}>确定</Button>
        </div>
      </footer>
    </Modal>
  );
}
