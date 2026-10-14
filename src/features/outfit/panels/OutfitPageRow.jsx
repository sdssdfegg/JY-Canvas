// src/features/outfit/panels/OutfitPageRow.jsx
// V65 (P5-3) 2026-10-15：从 src/outfit-workflow.jsx renderOutfitPageRow（3113–3181，派发日实测）逐字搬出。
// 内容：composerFooter 左侧的批量生成页面行——提示词助手入口 / 页面 tab（单击切换、双击改名、拖拽排序）/
//   新建页 / 防误删锁 / 删除当前页。
// 模式：纯展示+交互壳，零生成逻辑。原函数内引用的 state/handler 全部改为 props（名字与搬出前一致，
//   保证 JSX 一行不动）；调用方 outfit-workflow.jsx 每次 render 重建传参，与搬出前行为一致。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V65 §3.2 负向对照兜底。
import { BookOpen, Lock, Move, Plus, Trash2, Unlock } from "lucide-react";

export function OutfitPageRow({
  showPromptButton = true,
  outfitPages,
  activeOutfitPageId,
  draggedPageId,
  pageDropTarget,
  setIsPromptAssistantOpen,
  switchOutfitPage,
  renameOutfitPage,
  updateOutfitPageDropTarget,
  setPageDropTarget,
  dropOutfitPage,
  endOutfitPageDrag,
  beginOutfitPageDrag,
  createOutfitPageFromCurrent,
  activePageDeleteLocked,
  toggleOutfitPageDeleteLock,
  deleteOutfitPage
}) {
  return (
    <div className="composerPageRow">
      {showPromptButton && (
        <div className="leftTools">
          <button className="smallButton" type="button" onClick={() => setIsPromptAssistantOpen(true)}>
            <BookOpen size={16} />
            <span>词</span>
          </button>
        </div>
      )}

      <div className="outfitPageDock" role="tablist" aria-label="批量生成页面">
        {outfitPages.map((page) => (
          <button
            className={`outfitPageTab ${page.id === activeOutfitPageId ? "active" : ""} ${draggedPageId === page.id ? "dragging" : ""} ${pageDropTarget?.id === page.id ? `drop-${pageDropTarget.placement}` : ""}`}
            type="button"
            key={page.id}
            role="tab"
            aria-selected={page.id === activeOutfitPageId}
            onClick={() => switchOutfitPage(page.id)}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              renameOutfitPage(page.id);
            }}
            onDragOver={(event) => updateOutfitPageDropTarget(event, page.id)}
            onDragLeave={() => setPageDropTarget((current) => current?.id === page.id ? null : current)}
            onDrop={(event) => dropOutfitPage(event, page.id)}
            onDragEnd={endOutfitPageDrag}
            title="单击切换，双击改名，拖拽排序"
          >
            <span
              className="outfitPageDragHandle"
              draggable
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onDragStart={(event) => beginOutfitPageDrag(event, page.id)}
              title="拖拽排序"
            >
              <Move size={12} />
            </span>
            <span>{page.name}</span>
          </button>
        ))}
        <button className="outfitPageAdd" type="button" onClick={createOutfitPageFromCurrent} title="新建批量生成页面">
          <Plus size={16} />
        </button>
        <button
          className={`outfitPageLock ${activePageDeleteLocked ? "locked" : ""}`}
          type="button"
          onClick={() => toggleOutfitPageDeleteLock(activeOutfitPageId)}
          aria-pressed={activePageDeleteLocked}
          title={activePageDeleteLocked ? "当前页已防误删，点击解除" : "锁定当前页删除，防止误删"}
        >
          {activePageDeleteLocked ? <Lock size={15} /> : <Unlock size={15} />}
        </button>
        <button
          className="outfitPageDelete"
          type="button"
          onClick={() => deleteOutfitPage(activeOutfitPageId)}
          title="删除当前页面"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
