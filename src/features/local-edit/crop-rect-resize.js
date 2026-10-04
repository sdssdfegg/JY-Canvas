import { composeLocalPasteBlob, constrainCropRect as sharedConstrainCropRect, resizeRectFromCenterLocked, resizeRectFromCornerLocked } from "../../shared/local-edit-geometry.js";
import { imageBitmapFromBlob, imageBitmapFromFile } from "../../shared/image-input.js";
import { LOCAL_EDIT_MASK_MODE, createLocalEditAlphaMask, imageBitmapFromDataUrl } from "../../shared/local-edit-mask.js";

// 与 src/main.jsx 同源的纯函数（仅普通裁剪自由矩形分支使用）。RF-082 S5 迁入：原在 LocalEditModal.jsx，
// 为打破 crop-rect-resize ↔ LocalEditModal 循环依赖（LocalEditModal 改为重新导出）。
export function ratioValue(ratio) {
  const [rawW, rawH] = String(ratio || "1:1").split(":").map((part) => Number(part));
  const w = Number.isFinite(rawW) && rawW > 0 ? rawW : 1;
  const h = Number.isFinite(rawH) && rawH > 0 ? rawH : 1;
  return w / h;
}

// 局部编辑「选框缩放」共享实现（V11-RF-050 块②：角柄缩放 + Alt 中心缩放）。
//
// 来源：两侧同一个组件内函数逐字搬来 ——
//   `resizeCropRectFromCorner` / `resizeCropRectFromCenter` / `CROP_MIN_PIXEL_SIZE`
//   原在 src/main.jsx:1986-2030 与 src/outfit-workflow.jsx:5057-5101。
//
// 🔴 2026-09-25 对齐要求（沿用原注释）：「局部回贴选框必须跟随用户选定的比例」。
//   - 局部回贴 + 框选区域：角柄缩放 / Alt 中心缩放 / 区域大小滑杆全部锁定 activeRatio，
//     宽高始终精确满足比例（整数像素），且不越出原图。
//   - 普通裁剪：保持上一轮确定的自由矩形语义（拖多大就是多大）。
//   —— 这两句话对应本模块的 `ratioLocked` 开关，见下方参数说明。
//
// 🔴 **参数化的那处分叉**（V11-RF-050 裁决：参数化，两侧行为逐字不变）：
//   抽出前两侧的判断条件**不是同一个变量**：
//     · src/main.jsx 用 `ratioLocked` = `isLocalMode && !isMaskMode`
//       ⇒ main 存在「普通裁剪模式」（mode !== "local"），此时 ratioLocked=false 走自由缩放分支；
//     · src/outfit-workflow.jsx 用 `!isMaskMode`（outfit 无 isLocalMode，恒为局部回贴）
//       ⇒ 只要不是涂抹蒙版就锁比例。
//   因此本模块把该条件提升为入参 `ratioLocked`：
//     · main 调用点传 `ratioLocked`（原值）；
//     · outfit 调用点传 `!isMaskMode`（原值）。
//   两侧传进去的布尔值与抽出前**逐字相同** ⇒ 行为零变化，这不是"统一行为"，只是把不同取值变成实参。
//
// 锁比例分支的数学本身在 `src/shared/local-edit-geometry.js`（resizeRectFrom*Locked），
// 本模块只保留「锁 / 不锁」的两条外衣。



export const CROP_MIN_PIXEL_SIZE = 1;

/**
 * 角柄缩放选框。
 * @param {{ x: number, y: number, width: number, height: number }} sourceRect 起始选框（原图坐标）
 * @param {string} handle 手柄方位，形如 "nw" | "ne" | "sw" | "se"
 * @param {number} deltaX 指针位移（原图坐标）
 * @param {number} deltaY 指针位移（原图坐标）
 * @param {{ ratioLocked: boolean, activeRatio: any, imageWidth: number, imageHeight: number }} options
 */
export function resizeCropRectFromCorner(sourceRect, handle, deltaX, deltaY, { ratioLocked, activeRatio, imageWidth, imageHeight, drivingAxis }) {
  if (ratioLocked) {
    return resizeRectFromCornerLocked(
      sourceRect, handle, deltaX, deltaY, activeRatio, imageWidth, imageHeight, drivingAxis
    );
  }
  const directionX = handle.includes("e") ? 1 : -1;
  const directionY = handle.includes("s") ? 1 : -1;
  const anchorX = directionX > 0 ? sourceRect.x : sourceRect.x + sourceRect.width;
  const anchorY = directionY > 0 ? sourceRect.y : sourceRect.y + sourceRect.height;
  const maxWidth = Math.max(1, directionX > 0 ? imageWidth - anchorX : anchorX);
  const maxHeight = Math.max(1, directionY > 0 ? imageHeight - anchorY : anchorY);
  const nextWidth = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxWidth, sourceRect.width + deltaX * directionX));
  const nextHeight = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxHeight, sourceRect.height + deltaY * directionY));
  return {
    x: directionX > 0 ? anchorX : anchorX - nextWidth,
    y: directionY > 0 ? anchorY : anchorY - nextHeight,
    width: nextWidth,
    height: nextHeight
  };
}

/**
 * Alt 中心缩放选框（以选框中心为锚点，位移按 2 倍计入宽高）。
 * 参数含义同 {@link resizeCropRectFromCorner}。
 */
export function resizeCropRectFromCenter(sourceRect, handle, deltaX, deltaY, { ratioLocked, activeRatio, imageWidth, imageHeight, drivingAxis }) {
  if (ratioLocked) {
    return resizeRectFromCenterLocked(
      sourceRect, handle, deltaX, deltaY, activeRatio, imageWidth, imageHeight, drivingAxis
    );
  }
  const directionX = handle.includes("e") ? 1 : -1;
  const directionY = handle.includes("s") ? 1 : -1;
  const centerX = sourceRect.x + sourceRect.width / 2;
  const centerY = sourceRect.y + sourceRect.height / 2;
  const maxWidth = Math.max(1, Math.min(centerX, imageWidth - centerX) * 2);
  const maxHeight = Math.max(1, Math.min(centerY, imageHeight - centerY) * 2);
  const nextWidth = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxWidth, sourceRect.width + deltaX * directionX * 2));
  const nextHeight = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxHeight, sourceRect.height + deltaY * directionY * 2));
  return {
    x: centerX - nextWidth / 2,
    y: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight
  };
}


export const LOCAL_EDIT_OUTPUT_TARGET_BYTES = 64 * 1024 * 1024;

export const LOCAL_EDIT_OUTPUT_JPEG_QUALITIES = [0.985, 0.975, 0.965, 0.95, 0.94];

// 选框几何统一走 src/shared/local-edit-geometry.js（批量侧 outfit-workflow.jsx 用同一份），
// 这里保留同名局部引用，调用点不用改。
export const constrainCropRect = sharedConstrainCropRect;

// 2026-09-25 对齐 3.0 新源码：删除了 expandLocalEditContextRect。
// 3.0 的局部回贴把用户选框以外的区域当作"不可改动"，上传给模型的局部图
// 就是选框本身（frontend/ecommerce/src/features/crop/cropImage.ts 里
// canvas 尺寸严格等于 sourceRect），不存在"多送一圈上下文"的概念。
// 这里保留一个同语义的显式说明，方便以后回溯为什么没有这个函数。

// canonical ID 是 banana-2；旧存档 nano-banana2 通过 canonicalModel 映射到同一支，
// 保证迁移后这两条「香蕉 2 专属」判断不会失配。
// （阶段 B 刀 2：本函数已收进 src/shared/routing.js，与那里逐字节等价，此处改为 import。）

/**
 * 把模型返回的局部结果**按原图坐标**贴回底图。
 *
 * 2026-09-25 对齐 3.0 新源码（frontend/ecommerce/src/shared/image/localPaste.ts:128-202
 * `composeLocalResult`）。3.0 的契约是：
 *   1. 画布 = 底图**完整尺寸**，先把底图画满；
 *   2. 全程**唯一一次**写入是
 *      `context.drawImage(local, rect.x, rect.y, rect.width, rect.height)`
 *      （返回图尺寸与选区不一致时按选区尺寸拉伸贴入，不做 cover 裁切）；
 *   3. **不做**羽化、自动对齐、颜色匹配、中性色调匹配、锐化、护脸/护身保护；
 *   4. 选框外的像素逐字节等于底图。
 *
 * 那一段的原文注释就是："刻意不做运行版的羽化/自动对齐/颜色匹配/护脸等后处理
 * （任务要求不得擅自增加美化、锐化或调色）——贴回就是贴回。"
 *
 * 所以这里删掉了 V11 原有的：
 *   - autoAlign（alignLocalEditPatchCanvas，会对结果做 ±maxShift 位移）
 *   - colorMatch（colorMatchLocalEditPatchCanvas，会改结果颜色）
 *   - protectSkinAndFace（protectSkinAndFaceFromLocalOutfitPatch，
 *     会用 destination-out 把"头顶 12%~34% 的肤色区域"挖掉，让原图盖回来）
 *   - feather（createFeatherMask，会让选框最外圈回退成原图）
 *
 * 涂抹蒙版（LOCAL_EDIT_MASK_MODE）保留：那是**用户自己画出来的选区**，
 * 不是自动保护。它按硬边（不羽化）裁剪，只有用户涂到的地方会被替换。
 *
 * `_options` 保留在签名里，老调用点不用改；其中的保护类参数一律不再生效。
 */
export async function composeQuickLocalEditBlob(originalFile, generatedBlob, cropRect, localEdit = null, _options = {}) {
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  let maskImage = null;
  let blendMask = null;
  try {
    const isMaskEdit = localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl;
    if (isMaskEdit) {
      // 用户涂抹的选区：按硬边（不羽化）裁剪，只替换涂到的像素。
      const rect = constrainCropRect(
        localEdit?.cropRect || cropRect,
        original.width || original.naturalWidth,
        original.height || original.naturalHeight
      );
      maskImage = await imageBitmapFromDataUrl(localEdit.maskDataUrl);
      blendMask = createLocalEditAlphaMask(maskImage, rect, 0);
    }
    // 实际贴回在 src/shared/local-edit-geometry.js（与批量侧同一份实现）。
    const composed = await composeLocalPasteBlob(original, generated, localEdit?.cropRect || cropRect, {
      maskImage: blendMask,
      targetBytes: LOCAL_EDIT_OUTPUT_TARGET_BYTES,
      qualities: LOCAL_EDIT_OUTPUT_JPEG_QUALITIES
    });
    return composed.blob;
  } finally {
    original.close?.();
    generated.close?.();
    maskImage?.close?.();
  }
}

export function defaultQuickLocalEditCrop(width, height, ratio) {
  // 2026-09-25：默认选框不再用外部比例去"裁"出一个形状，而是按图片自身比例
  // 取居中的 62% 区域。比例按钮仍然存在，点一下才会把选框整形到那个比例。
  // 这样"打开弹窗就变成正方形选框"不会再发生（除非原图本身就是正方形）。
  const imageRatio = height > 0 ? width / height : ratioValue(ratio);
  let cropWidth = width * 0.62;
  let cropHeight = cropWidth / imageRatio;
  if (cropHeight > height * 0.62) {
    cropHeight = height * 0.62;
    cropWidth = cropHeight * imageRatio;
  }
  return constrainCropRect({
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight
  }, width, height);
}
