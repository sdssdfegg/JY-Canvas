// V57（P3-2）：主画板提示词助手弹窗（纯 JSX，零逻辑）。
// 所有状态 / handler 来自 usePromptAssistantState（App 下发 promptApi）。
// 共享数据 presets / categories 由 App() 持有并下发；isOpen / onClose 控制显隐。
import { X, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../../shared/ui/Modal";

export function PromptAssistantView({ isOpen, categories, onClose, promptApi }) {
  if (!isOpen) return null;
  const {
    filteredPromptPresets,
    editingPrompt,
    setEditingPrompt,
    promptCategory,
    setPromptCategory,
    promptSearch,
    setPromptSearch,
    draggedPromptId,
    promptDropCategory,
    setPromptDropCategory,
    draggedPromptCategory,
    promptCategoryDropTarget,
    setPromptCategoryDropTarget,
    renamePromptCategory,
    beginPromptCategoryDrag,
    endPromptCategoryDrag,
    dragPromptCategoryOver,
    dropOnPromptCategory,
    deletePromptCategory,
    addPromptCategory,
    openNewPromptEditor,
    beginPromptDrag,
    dropPromptOnPreset,
    endPromptDrag,
    applyPromptPreset,
    editPromptPreset,
    deletePromptPreset,
    updateEditingPrompt,
    saveEditingPrompt
  } = promptApi;

  return (
    <>
      <Modal layerClassName="modalLayer promptLayer" panelClassName="promptAssistantModal" onClose={onClose}>
          <header>
            <h2>提示词助手</h2>
            <Button size="sm" iconOnly aria-label="关闭" onClick={onClose}>
              <X size={18} />
            </Button>
          </header>
          <div className="promptAssistantBody">
            <div className="promptTabs">
              {categories.map((category) => (
                <span className="promptCategoryItem" key={category}>
                  <Button
                    size="sm"
                    active={promptCategory === category}
                    className={[
                      promptDropCategory === category ? "dropTarget" : "",
                      draggedPromptCategory === category ? "categoryDragging" : "",
                      promptCategoryDropTarget?.category === category ? `categoryDrop-${promptCategoryDropTarget.edge}` : ""
                    ].filter(Boolean).join(" ")}
                    draggable={category !== "全部"}
                    onClick={() => setPromptCategory(category)}
                    onDoubleClick={(event) => {
                      if (category === "全部") return;
                      event.preventDefault();
                      event.stopPropagation();
                      renamePromptCategory(category);
                    }}
                    onDragStart={(event) => beginPromptCategoryDrag(event, category)}
                    onDragEnd={endPromptCategoryDrag}
                    onDragOver={(event) => dragPromptCategoryOver(event, category)}
                    onDragLeave={() => {
                      setPromptDropCategory("");
                      setPromptCategoryDropTarget(null);
                    }}
                    onDrop={(event) => dropOnPromptCategory(event, category)}
                    title={category === "全部" ? "全部分类" : "双击改名，按住拖动调整顺序"}
                  >
                    {category}
                  </Button>
                  {category !== "全部" && (
                    <button
                      className="promptCategoryDelete"
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deletePromptCategory(category);
                      }}
                      title={`删除分类「${category}」`}
                      aria-label={`删除分类${category}`}
                    >
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
              <Button size="sm" className="promptCategoryAdd" onClick={addPromptCategory} title="新建分类">
                <Plus size={13} />
                <span>新建</span>
              </Button>
            </div>
            <label className="promptSearch">
              <Search size={16} />
              <input
                value={promptSearch}
                onChange={(event) => setPromptSearch(event.target.value)}
                placeholder="搜索标题或内容..."
              />
            </label>
            <Button size="sm" className="promptNewCta" onClick={openNewPromptEditor}>
              <Plus size={15} />
              <span>新建提示词</span>
            </Button>
            <div className="promptPresetGrid">
              {filteredPromptPresets.map((preset) => (
                <div
                  className={`promptChip ${draggedPromptId === preset.id ? "dragging" : ""}`}
                  key={preset.id}
                  draggable
                  onDragStart={(event) => beginPromptDrag(event, preset.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropPromptOnPreset(event, preset.id)}
                  onDragEnd={endPromptDrag}
                >
                  <button
                    className="promptChipMain"
                    type="button"
                    onClick={() => applyPromptPreset(preset)}
                    title={preset.content}
                  >
                    {preset.title}
                  </button>
                  <button className="promptChipIcon" type="button" onClick={() => editPromptPreset(preset)} title="编辑提示词">
                    <Pencil size={14} />
                  </button>
                  <button className="promptChipIcon" type="button" onClick={() => deletePromptPreset(preset)} title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {filteredPromptPresets.length === 0 && <p className="promptEmpty">没有找到匹配的提示词</p>}
            </div>
          </div>
      </Modal>

      {editingPrompt && (
        <Modal layerClassName="modalLayer promptEditorLayer" panelClassName="promptEditorModal" onClose={() => setEditingPrompt(null)}>
            <header>
              <h2>编辑提示词</h2>
              <Button size="sm" iconOnly aria-label="关闭" onClick={() => setEditingPrompt(null)}>
                <X size={18} />
              </Button>
            </header>
            <div className="promptEditorBody">
              <label className="editorField">
                <span>分类</span>
                <select
                  value={editingPrompt.category}
                  onChange={(event) => updateEditingPrompt("category", event.target.value)}
                >
                  {categories.filter((category) => category !== "全部").map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="editorField">
                <span>标题</span>
                <input
                  value={editingPrompt.title}
                  onChange={(event) => updateEditingPrompt("title", event.target.value)}
                  placeholder="输入标题"
                />
              </label>
              <label className="editorField">
                <span>提示词内容</span>
                <textarea
                  value={editingPrompt.content}
                  onChange={(event) => updateEditingPrompt("content", event.target.value)}
                  placeholder="输入提示词内容"
                />
              </label>
            </div>
            <footer>
              <Button size="sm" tone="danger" className="editorDeleteButton" onClick={() => deletePromptPreset(editingPrompt)}>
                删除
              </Button>
              <div>
                <Button size="sm" onClick={() => setEditingPrompt(null)}>取消</Button>
                <Button size="md" tone="primary" className="editorSaveButton" onClick={saveEditingPrompt}>保存</Button>
              </div>
            </footer>
        </Modal>
      )}
    </>
  );
}
