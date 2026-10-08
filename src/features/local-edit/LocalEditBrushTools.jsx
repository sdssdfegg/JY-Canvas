// 局部编辑「蒙版笔刷工具条 / 区域大小滑杆」共享组件（V11-RF-050 块③）。
//
// 来源：两侧**逐字相同**的 JSX 块（实测 0 差异）——
//   src/main.jsx:2272-2325 与 src/outfit-workflow.jsx:5338-5391，各 54 行。
//   （行号以抽取前 HEAD 250aa8d 为准。）
//
// 形态：原来是 `{isMaskMode ? (<div className="quickLocalBrushTools">…</div>) : (<label>区域大小…</label>)}`。
//   抽成组件后改成早返回，渲染出的 DOM 与原来完全一致：
//   · 涂抹蒙版模式 → 白笔 / 黑笔 / 笔刷大小 / 透明度 / 清空
//   · 框选区域模式 → 区域大小滑杆（走 changeCropScale）
//
// 之所以两个分支放在同一个组件里：原块本身就是这一个三元表达式，
// 拆成两个组件会让调用点出现 `{isMaskMode ? <A/> : <B/>}`，等于没消重复。
//
// `clampLocalEditBrushSize` / `clampLocalEditMaskOpacity` 来自 src/shared/local-edit-mask.js，
// 属共享层 ⇒ 组件内部直接 import，不再当 props 传。

import { clampLocalEditBrushSize, clampLocalEditMaskOpacity } from "../../shared/local-edit-mask.js";

export function LocalEditBrushTools({
  isMaskMode,
  maskTool,
  setMaskTool,
  brushSize,
  setBrushSize,
  maskOpacity,
  setMaskOpacity,
  clearMask,
  maskPainted,
  cropPercent,
  onCropScaleChange
}) {
  if (isMaskMode) {
    return (
      <div className="quickLocalBrushTools">
        <button
          className={maskTool === "brush" ? "active" : ""}
          type="button"
          onClick={() => setMaskTool("brush")}
          title="白笔添加"
        >
          <span className="quickLocalBrushSwatch white" />
          <span>白笔</span>
        </button>
        <button
          className={maskTool === "eraser" ? "active" : ""}
          type="button"
          onClick={() => setMaskTool("eraser")}
          title="黑笔擦除"
        >
          <span className="quickLocalBrushSwatch black" />
          <span>黑笔</span>
        </button>
        <label>
          <span>笔刷 {brushSize}</span>
          <input
            type="range"
            min="8"
            max="160"
            value={brushSize}
            onChange={(event) => setBrushSize(clampLocalEditBrushSize(event.target.value))}
          />
        </label>
        <label>
          <span>透明度 {maskOpacity}%</span>
          <input
            type="range"
            min="10"
            max="100"
            value={maskOpacity}
            onChange={(event) => setMaskOpacity(clampLocalEditMaskOpacity(event.target.value))}
          />
        </label>
        <button type="button" onClick={clearMask} disabled={!maskPainted}>清空</button>
      </div>
    );
  }
  return (
    <label>
      <span>区域大小</span>
      <input
        type="range"
        min="12"
        max="100"
        value={Math.max(12, Math.min(100, cropPercent))}
        onChange={onCropScaleChange}
      />
    </label>
  );
}
