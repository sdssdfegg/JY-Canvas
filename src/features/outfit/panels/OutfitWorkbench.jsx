// src/features/outfit/panels/OutfitWorkbench.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出 outfit 主工作台（原 2655 起的内联巨石）。
// 内容（按执行单 §2.2 三段顺序搬，本文件逐步增长）：
//   ① topbar（结果筛选 tab + 工具栏：刷新/指定文件夹/打开保存目录/下载/删除/清空/清缓存/缩放）
//   ② outfitScrollArea（ResultQueue + assetGrid 上传区 + originalLibraryPanel 原图库）
//   ③ composerPanel（换装/精修设置 + 提示词/补充 + 底部生成控制条）
// 模式：原闭包捕获的 state / handler / 派生值全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   模块级常量（GARMENT_PART_OPTIONS 等）与 lucide 图标直接 import，不重复实现。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V68 §3.2 负向对照 + v68-free-idents 兜底。
import {
  Download,
  FolderOpen,
  Images,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Video
} from "lucide-react";

export default function OutfitWorkbench({
  resultFilter,
  setResultFilter,
  tasks,
  imageCount,
  switchView,
  addEvent,
  activeOutfitPageId,
  renameOutfitPage,
  activeOutfitPage,
  refreshHistory,
  openDirectoryModal,
  openSaveDirectory,
  topbarStatus,
  topbarStatusText,
  downloadSelected,
  selectedCompletedCount,
  downloadAll,
  deleteSelected,
  selectedCount,
  clearAll,
  clearNonResultImageCache,
  changeGalleryZoom,
  galleryZoom,
  galleryZoomPercent,
}) {
  return (
    <header className="topbar">
      <div className="resultTabs">
        <button className={`tabButton ${resultFilter === "all" ? "active" : ""}`} type="button" onClick={() => setResultFilter("all")}>
          全部({tasks.length})
        </button>
        <button className={`tabButton ${resultFilter === "image" ? "active" : ""}`} type="button" onClick={() => setResultFilter("image")}>
          <Images size={14} />
          <span>图片({imageCount})</span>
        </button>
        <button className="tabButton" type="button" onClick={() => { setResultFilter("all"); switchView("quick"); addEvent("视频", "已打开快捷视频生成"); }}>
          <Video size={14} />
          <span>视频(0)</span>
        </button>
        <button
          className="outfitPageNameChip"
          type="button"
          onDoubleClick={() => renameOutfitPage(activeOutfitPageId)}
          title="双击修改页面名称"
        >
          <Pencil size={13} />
          <span>{activeOutfitPage.name}</span>
        </button>
      </div>
      <div className="topActions">
        <button className="toolbarButton" type="button" onClick={() => void refreshHistory()}>
          <RefreshCw size={15} />
          <span>刷新</span>
        </button>
        <button className="toolbarButton" type="button" onClick={openDirectoryModal}>
          <FolderOpen size={15} />
          <span>指定文件夹</span>
        </button>
        <button className="toolbarButton" type="button" onClick={() => void openSaveDirectory()}>
          <FolderOpen size={15} />
          <span>打开保存目录</span>
        </button>
        <span className={`taskBadge task-${topbarStatus}`}>{topbarStatusText}</span>
        <button className="toolbarButton" type="button" onClick={downloadSelected} disabled={selectedCompletedCount === 0}>
          <Download size={15} />
          <span>下载选中</span>
        </button>
        <button className="toolbarButton" type="button" onClick={downloadAll} disabled={imageCount === 0}>
          <Download size={15} />
          <span>下载全部</span>
        </button>
        <button className="dangerButton" type="button" onClick={deleteSelected} disabled={selectedCount === 0}>
          <Trash2 size={15} />
          <span>删除选中</span>
        </button>
        <button className="dangerButton" type="button" onClick={clearAll}>
          <Trash2 size={15} />
          <span>清空全部</span>
        </button>
        <button className="toolbarButton" type="button" onClick={() => void clearNonResultImageCache()}>
          <RefreshCw size={15} />
          <span>清缓存</span>
        </button>
        <div className="zoomControl">
          <button type="button" onClick={() => changeGalleryZoom(-0.1)} disabled={galleryZoom <= 0.75} aria-label="缩小图库">
            <Minus size={14} />
          </button>
          <span style={{ "--zoom-fill": `${Math.max(0, Math.min(100, ((galleryZoom - 0.75) / 0.7) * 100))}%` }} />
          <button type="button" onClick={() => changeGalleryZoom(0.1)} disabled={galleryZoom >= 1.45} aria-label="放大图库">
            <Plus size={14} />
          </button>
          <strong>{galleryZoomPercent}%</strong>
        </div>
      </div>
    </header>
  );
}
