// src/features/detail-studio/intake/ReferenceImageDropzone.jsx
// 阶段 2 §4 参考图批量上传组件（V201 Owner 意见 #4）：点击选择 / 拖拽 / 粘贴三种入口，多文件，
// 上传前缩略图预览，按角色分块展示。
//
// 组件零业务逻辑：上传一律经 props.state.uploadReferenceImage → api → 服务端；落盘复用现有端点
// （data/detail-studio/assets/<id>/），不改服务端。粘贴路由由父级 ReferenceImagesPanel 统一派发
// （active 标记当前聚焦的角色块），本组件仅在 active 时挂 window paste 监听，避免多块重复处理。
//
// @internal 保留原因：阶段 2 §4 参考图三类角色（product / visualStyle / contentStructure）的模块化上传 UI。

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";

export function ReferenceImageDropzone({ role, roleLabel, required, state, active, onActivate }) {
  const [pending, setPending] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  // 记录所有已创建的预览 URL，卸载时统一释放，避免内存泄漏。
  const createdUrls = useRef([]);

  // 已上传的该角色参考图（带 url，由 state.referenceImages 持有）。
  const images = Array.isArray(state.referenceImages) ? state.referenceImages : [];
  const existing = images.filter((img) => (img.role || "") === role);

  function addFiles(fileList) {
    const next = Array.from(fileList || []).filter((f) => f && f.type && f.type.startsWith("image/"));
    if (next.length === 0) return;
    const created = next.map((file) => {
      const url = URL.createObjectURL(file);
      createdUrls.current.push(url);
      return {
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        url
      };
    });
    setPending((prev) => prev.concat(created));
  }

  function removePending(id) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target && target.url) {
        URL.revokeObjectURL(target.url);
        createdUrls.current = createdUrls.current.filter((u) => u !== target.url);
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  // 仅当本块为当前激活角色时监听全局粘贴（截图粘贴）。
  useEffect(() => {
    if (!active) return undefined;
    function onPaste(event) {
      const items = event.clipboardData && event.clipboardData.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === "file" && item.type && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        event.preventDefault();
        addFiles(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active]);

  // 卸载时释放所有预览 object URL，避免内存泄漏。
  useEffect(() => {
    return () => {
      createdUrls.current.forEach((u) => URL.revokeObjectURL(u));
      createdUrls.current = [];
    };
  }, []);

  async function handleUpload() {
    if (pending.length === 0 || !state.currentProject) return;
    for (const item of pending) {
      // 标签留空：角色已由块确定，无需逐图标注。
      await state.uploadReferenceImage(item.file, role, "");
    }
    pending.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    createdUrls.current = [];
    setPending([]);
  }

  return (
    <div
      className={"detailStudioDropzoneBlock" + (required ? " detailStudioDropzoneBlockRequired" : "")}
      onFocus={onActivate}
      onMouseDown={onActivate}
    >
      <div className="detailStudioDropzoneHead">
        <span className="detailStudioDropzoneRole">{roleLabel}</span>
        <span className={"detailStudioDropzoneBadge" + (required ? " detailStudioDropzoneBadgeRequired" : "")}>
          {required ? "必传" : "可选"}
        </span>
        {required && existing.length === 0 ? (
          <span className="detailStudioDropzoneHint">（建议至少上传一张，不传也可继续）</span>
        ) : null}
      </div>

      <div
        className={"detailStudioDropzone" + (dragOver ? " detailStudioDropzoneOver" : "")}
        tabIndex={0}
        role="button"
        onClick={() => inputRef.current && inputRef.current.click()}
        onFocus={onActivate}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          onActivate && onActivate();
          addFiles(event.dataTransfer.files);
        }}
      >
        <ImagePlus size={18} className="detailStudioDropzoneIcon" />
        <span className="detailStudioDropzoneText">
          点击选择 / 拖拽 / 粘贴截图
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="detailStudioFileHidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 ? (
        <div className="detailStudioDropzonePending">
          {pending.map((item) => (
            <div className="detailStudioDropzoneThumb" key={item.id}>
              <img src={item.url} alt={item.file.name} />
              <button
                type="button"
                className="detailStudioDropzoneRemove"
                onClick={(event) => {
                  event.stopPropagation();
                  removePending(item.id);
                }}
                aria-label="移除"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <Toolbar align="end">
        <Button
          size="sm"
          tone="primary"
          loading={state.busy}
          disabled={pending.length === 0 || !state.currentProject}
          onClick={(event) => {
            event.stopPropagation();
            handleUpload();
          }}
        >
          <Upload size={14} />
          <span>上传（{pending.length}）</span>
        </Button>
      </Toolbar>

      {existing.length > 0 ? (
        <div className="detailStudioReferenceGrid">
          {existing.map((img) => (
            <div className="detailStudioReferenceCard" key={img.id || img.filename}>
              <img className="detailStudioReferenceThumb" src={img.url} alt={img.label || img.role} />
              <div className="detailStudioReferenceMeta">
                <span className="detailStudioReferenceLabel">{img.label || "（无标注）"}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ReferenceImageDropzone;
