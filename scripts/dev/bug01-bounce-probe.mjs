// BUG-01 验收探针：局部回帖选框缩放「回弹」。
//
// 用真实模块跑 §5 复现轨迹（200 帧，每帧鼠标仅动 ~1-2px，叠加 ±1px 抖动模拟手抖），
// 对 resizeRectFromCornerLocked / resizeRectFromCenterLocked 分别给出三组对比：
//   1) 旧逻辑（复刻修复前的分段函数）        —— 应复现 41px 跳变；
//   2) 新默认（drivingAxis=undefined 连续投影）—— 裸函数直接连续；
//   3) 新锁轴（模拟 crop-drag 死区 3px 锁定）  —— 真实交互路径，单次拖拽不翻转。
//
// 判据（修复单 §5）：修复后 最大单帧宽度跳变 ≤6px、比例失真 0、越界 0。
//
// 用法：node scripts/dev/bug01-bounce-probe.mjs
import { parseRatioParts, snapSizeToRatio } from "../../src/shared/local-edit-geometry.js";
import { resizeRectFromCornerLocked, resizeRectFromCenterLocked } from "../../src/shared/local-edit-geometry.js";

const sourceRect = { x: 200, y: 300, width: 400, height: 600 };
const RATIO = "2:3";
const IW = 1200, IH = 1800;

// ---- 旧逻辑复刻（修复前分段函数）----
function oldCorner(sr, handle, dX, dY, ratio, iw, ih) {
  const directionX = handle.includes("e") ? 1 : -1;
  const directionY = handle.includes("s") ? 1 : -1;
  const anchorX = directionX > 0 ? sr.x : sr.x + sr.width;
  const anchorY = directionY > 0 ? sr.y : sr.y + sr.height;
  const maxWidth = Math.max(1, directionX > 0 ? iw - anchorX : anchorX);
  const maxHeight = Math.max(1, directionY > 0 ? ih - anchorY : anchorY);
  const desiredWidth = Math.max(1, sr.width + dX * directionX);
  const desiredHeight = Math.max(1, sr.height + dY * directionY);
  const { width: rw, height: rh } = parseRatioParts(ratio);
  const widthFromHeight = (desiredHeight * rw) / rh;
  const driven = Math.abs(dX) >= Math.abs(dY) ? Math.max(1, desiredWidth) : Math.max(1, widthFromHeight);
  const size = snapSizeToRatio(driven, 0, ratio, maxWidth, maxHeight);
  return { x: directionX > 0 ? anchorX : anchorX - size.width, y: directionY > 0 ? anchorY : anchorY - size.height, width: size.width, height: size.height };
}
function oldCenter(sr, handle, dX, dY, ratio, iw, ih) {
  const directionX = handle.includes("e") ? 1 : -1;
  const directionY = handle.includes("s") ? 1 : -1;
  const centerX = sr.x + sr.width / 2;
  const centerY = sr.y + sr.height / 2;
  const maxWidth = Math.max(1, Math.min(centerX, iw - centerX) * 2);
  const maxHeight = Math.max(1, Math.min(centerY, ih - centerY) * 2);
  const desiredWidth = Math.max(1, sr.width + dX * directionX * 2);
  const desiredHeight = Math.max(1, sr.height + dY * directionY * 2);
  const { width: rw, height: rh } = parseRatioParts(ratio);
  const widthFromHeight = (desiredHeight * rw) / rh;
  const driven = Math.abs(dX) >= Math.abs(dY) ? Math.max(1, desiredWidth) : Math.max(1, widthFromHeight);
  const size = snapSizeToRatio(driven, 0, ratio, maxWidth, maxHeight);
  return { x: centerX - size.width / 2, y: centerY - size.height / 2, width: size.width, height: size.height };
}

function trajectory() {
  const pts = [];
  for (let i = 0; i < 200; i++) {
    const t = i / 199;
    const base = -120 * t;
    const jitter = i % 2 === 0 ? 1 : -1;
    pts.push({ dX: base + jitter, dY: base - jitter });
  }
  return pts;
}

function measure(fn, axisMode) {
  const pts = trajectory();
  let prev = null, maxJump = 0, ratioBad = 0, outOfBounds = 0;
  let locked = undefined;
  for (const { dX, dY } of pts) {
    // 模拟 crop-drag 死区锁定：累计位移首超 3px 时定轴，之后不翻转。
    if (axisMode === "lock" && locked === undefined && Math.hypot(dX, dY) >= 3) {
      locked = Math.abs(dX) >= Math.abs(dY) ? "x" : "y";
    }
    const axis = axisMode === "lock" ? locked : undefined;
    const r = fn(sourceRect, "se", dX, dY, RATIO, IW, IH, axis);
    if (Math.abs(r.width / r.height - 2 / 3) > 0.02) ratioBad++;
    if (r.x < 0 || r.y < 0 || r.x + r.width > IW + 0.5 || r.y + r.height > IH + 0.5) outOfBounds++;
    if (prev !== null) maxJump = Math.max(maxJump, Math.abs(r.width - prev));
    prev = r.width;
  }
  return { maxJump, ratioBad, outOfBounds };
}

const cases = [
  { name: "resizeRectFromCornerLocked", fn: resizeRectFromCornerLocked, old: oldCorner },
  { name: "resizeRectFromCenterLocked", fn: resizeRectFromCenterLocked, old: oldCenter }
];

const report = [];
for (const c of cases) {
  const oldR = measure(c.old, "none");
  const newDefault = measure(c.fn, "none");
  const newLock = measure(c.fn, "lock");
  report.push({ fn: c.name, old: oldR, newDefault, newLock });
  console.log(`\n=== ${c.name} ===`);
  console.log(`  旧逻辑         maxJump=${oldR.maxJump}px  ratioBad=${oldR.ratioBad}  outOfBounds=${oldR.outOfBounds}`);
  console.log(`  新·默认(连续)  maxJump=${newDefault.maxJump}px  ratioBad=${newDefault.ratioBad}  outOfBounds=${newDefault.outOfBounds}`);
  console.log(`  新·锁轴(交互)  maxJump=${newLock.maxJump}px  ratioBad=${newLock.ratioBad}  outOfBounds=${newLock.outOfBounds}`);
}

const allPass = report.every((r) =>
  r.newDefault.maxJump <= 6 && r.newDefault.ratioBad === 0 && r.newDefault.outOfBounds === 0 &&
  r.newLock.maxJump <= 6 && r.newLock.ratioBad === 0 && r.newLock.outOfBounds === 0
);
console.log(`\n结论：修复后（默认/锁轴）最大跳变均 ≤6px 且比例/越界失真=0 → ${allPass ? "PASS ✅" : "FAIL ❌"}`);
if (!allPass) process.exitCode = 1;
