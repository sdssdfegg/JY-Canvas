// src/features/outfit/panels/PromptEditorModal.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出 promptEditor 浮层
// （编辑提示词弹窗：分类 / 标题 / 内容 + 取消 / 保存）。
// 模式：原闭包捕获的 state / handler 全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   图标 X / Save 直接 import；setEditingPrompt(null) 收敛为 onClose prop。
import { X, Save } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";

export default function PromptEditorModal({
  editingPrompt,
  promptCategories,
  onClose,
  updateEditingPrompt,
  saveEditingPrompt
}) {
  return (
<Modal layerClassName="modalLayer promptEditorLayer" panelClassName="promptEditorModal" onClose={() => onClose()}>
    <header>
      <h2>编辑提示词</h2>
      <Button size="md" iconOnly type="button" onClick={() => onClose()} title="关闭">
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
          {promptCategories.filter((category) => category !== "全部").map((category) => (
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
      <Button size="md" type="button" onClick={() => onClose()}>取消</Button>
      <Button size="md" tone="primary" type="button" onClick={saveEditingPrompt}>
        <Save size={16} />
        <span>保存</span>
      </Button>
    </footer>
</Modal>
  );
}
