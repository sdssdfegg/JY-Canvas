// 局部编辑「选框浮层」共享组件（V11-RF-050 块④）。
//
// 来源：两侧**逐字相同**的 JSX（实测 33 行 / 0 差异）——
//   src/main.jsx:2203-2235 ↔ src/outfit-workflow.jsx:5273-5305（行号以 eb0a4be 为准）。
//   含三块挨在一起的浮层：① 笔刷光标 ② 选框 + 四个 resize 手柄 ③ 涂抹蒙版的「AI上下文」框。
//   JSX 主体由脚本从 git 原文生成（不手抄），逐字校验见 tmp/rf050-block4-verbatim.mjs。
//
// 拖拽处理函数直接 import 本目录的 crop-drag.js（块① 已抽出），
// 调用点只需把块① 建立的 cropDragCtx 传进来即可。

import { beginCropDrag, endCropDrag, moveCropDrag } from "./crop-drag.js";

export function LocalEditCropOverlay({
  isMaskMode,
  brushCursor,
  maskTool,
  brushCursorStyle,
  cropRect,
  displaySize,
  cropStyle,
  maskPainted,
  cropDragCtx
}) {
  return (
    <>
            {isMaskMode && brushCursor.visible && (
              <div
                className={`quickLocalBrushCursor ${maskTool === "eraser" ? "erase" : "paint"}`}
                style={brushCursorStyle}
              />
            )}
            {cropRect && displaySize.width > 0 && !isMaskMode && (
              <div
                className="quickLocalCropBox"
                style={cropStyle}
                onPointerDown={(event) => beginCropDrag(event, "move", cropDragCtx)}
                onPointerMove={(event) => moveCropDrag(event, cropDragCtx)}
                onPointerUp={(event) => endCropDrag(event, cropDragCtx)}
                onPointerCancel={(event) => endCropDrag(event, cropDragCtx)}
              >
                <span />
                {["nw", "ne", "sw", "se"].map((handle) => (
                  <i
                    className={`quickLocalCropHandle quickLocalCropHandle-${handle}`}
                    key={handle}
                    onPointerDown={(event) => beginCropDrag(event, `resize-${handle}`, cropDragCtx)}
                    onPointerMove={(event) => moveCropDrag(event, cropDragCtx)}
                    onPointerUp={(event) => endCropDrag(event, cropDragCtx)}
                    onPointerCancel={(event) => endCropDrag(event, cropDragCtx)}
                  />
                ))}
              </div>
            )}
            {cropRect && displaySize.width > 0 && isMaskMode && maskPainted && (
              <div className="quickLocalMaskContextBox" style={cropStyle}>
                <span>AI上下文</span>
              </div>
            )}
    </>
  );
}
