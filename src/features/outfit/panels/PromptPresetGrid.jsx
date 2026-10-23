// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 2080–2167 行）。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：PromptPresetGrid 提示词预设网格（原 outfit-panels 的 G 区）。
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "../../../shared/ui/Button";

export function PromptPresetGrid(props) {
  const {
    categories, activeCategory, onSelectCategory, dropCategory, onDropCategoryChange,
    search, onSearchChange, presets, draggedId, onApplyPreset, onRenamePreset,
    onRenameCategory, onDropPresetToCategory, onAddCategory, onCreatePreset,
    onBeginDrag, onEndDrag, onDropPresetToPreset, onEditPreset, onDeletePreset
  } = props;
  return (
    <>
      <div className="promptTabs">
        {categories.map((category) => (
          <Button
            size="sm"
            active={activeCategory === category}
            className={dropCategory === category ? "dropTarget" : ""}
            key={category}
            onClick={() => onSelectCategory(category)}
            onDoubleClick={(event) => {
              if (category === "全部") return;
              event.preventDefault();
              event.stopPropagation();
              onRenameCategory(category);
            }}
            onDragOver={(event) => {
              if (category === "全部") return;
              event.preventDefault();
              onDropCategoryChange(category);
            }}
            onDragLeave={() => onDropCategoryChange("")}
            onDrop={(event) => onDropPresetToCategory(event, category)}
          >
            {category}
          </Button>
        ))}
        <Button size="sm" className="promptCategoryAdd" onClick={onAddCategory} title="新建分类">
          <Plus size={13} />
          <span>新建</span>
        </Button>
      </div>
      <label className="promptSearch">
        <Search size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索标题或内容..."
        />
      </label>
      <Button size="sm" className="promptNewCta" onClick={onCreatePreset}>
        <Plus size={15} />
        <span>新建提示词</span>
      </Button>
      <div className="promptPresetGrid">
        {presets.map((preset) => (
          <div
            className={`promptChip ${draggedId === preset.id ? "dragging" : ""}`}
            key={preset.id}
            draggable
            onDragStart={(event) => onBeginDrag(event, preset.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropPresetToPreset(event, preset.id)}
            onDragEnd={onEndDrag}
          >
            <button
              className="promptChipMain"
              type="button"
              onClick={() => onApplyPreset(preset)}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRenamePreset(preset);
              }}
              title={preset.content}
            >
              {preset.title}
            </button>
            <button className="promptChipIcon" type="button" onClick={() => onEditPreset(preset)} title="编辑提示词">
              <Pencil size={14} />
            </button>
            <button className="promptChipIcon" type="button" onClick={() => onDeletePreset(preset)} title="删除">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {presets.length === 0 && <p className="promptEmpty">没有找到匹配的提示词</p>}
      </div>
    </>
  );
}
