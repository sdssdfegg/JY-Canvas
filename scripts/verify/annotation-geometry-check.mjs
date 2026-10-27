// 标注式 AI 编辑：坐标内核验收（纯逻辑、<1s、无子进程、不碰 ROOT/data）。
//
// 验收点（对应任务 §九 验收 5/6/7/8）：
//   - 归一化坐标换算正确（client→normalized→natural 往返一致）；
//   - 缩放 / 弹窗尺寸变化后，同一显示点映射到的原图自然坐标不变（坐标不随显示尺寸漂移）；
//   - 矩形 / 圆形 / 箭头 / 画笔 四种形状在 canvas 上的绘制坐标正确；
//   - 越界坐标被夹紧到 [0,1]，不会画出图外。
//
// 直接 import 源码叶子（src/shared/annotation-geometry.js），该文件无 DOM 顶层依赖，
// 可在 Node 里直接单测。

import {
  clamp01,
  clientPointToNormalized,
  normalizedToNatural,
  normalizeRect,
  arrowHeadPoints,
  arrowHeadLength,
  drawAnnotationOnContext
} from "../../src/shared/annotation-geometry.js";

let failures = 0;
let passed = 0;

function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${msg}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${msg}`);
  }
}

function approx(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

// 记录型 stub ctx，capture 所有绘制调用。
function makeStubCtx() {
  const calls = [];
  return {
    calls,
    save() {},
    restore() {},
    beginPath() { calls.push(["beginPath"]); },
    moveTo(x, y) { calls.push(["moveTo", x, y]); },
    lineTo(x, y) { calls.push(["lineTo", x, y]); },
    closePath() { calls.push(["closePath"]); },
    strokeRect(x, y, w, h) { calls.push(["strokeRect", x, y, w, h]); },
    stroke() { calls.push(["stroke"]); },
    fill() { calls.push(["fill"]); },
    arc(x, y, r) { calls.push(["arc", x, y, r]); },
    ellipse(x, y, rx, ry) { calls.push(["ellipse", x, y, rx, ry]); },
    set strokeStyle(_) {},
    set fillStyle(_) {},
    set lineWidth(_) {},
    set lineJoin(_) {},
    set lineCap(_) {}
  };
}

console.log("annotation-geometry-check:");

// 1. clamp01
assert(clamp01(0.5) === 0.5, "clamp01 中间值不变");
assert(clamp01(-2) === 0, "clamp01 下界夹紧");
assert(clamp01(3) === 1, "clamp01 上界夹紧");
assert(clamp01(NaN) === 0, "clamp01 NaN→0");

// 2. clientPointToNormalized（显示盒 100,50 / 200×400）
const box = { left: 100, top: 50, width: 200, height: 400 };
{
  const p0 = clientPointToNormalized(100, 50, box);
  assert(approx(p0.nx, 0) && approx(p0.ny, 0), "左上角 → (0,0)");
  const p1 = clientPointToNormalized(300, 450, box);
  assert(approx(p1.nx, 1) && approx(p1.ny, 1), "右下角 → (1,1)");
  const mid = clientPointToNormalized(200, 250, box);
  assert(approx(mid.nx, 0.5) && approx(mid.ny, 0.5), "中心 → (0.5,0.5)");
  const over = clientPointToNormalized(-50, 999, box);
  assert(over.nx === 0 && over.ny === 1, "越界夹紧到 [0,1]");
}

// 3. normalizedToNatural（800×600）
{
  const n = normalizedToNatural(0.5, 0.25, 800, 600);
  assert(n.x === 400 && n.y === 150, "归一化 (0.5,0.25) → 自然 (400,150)");
  const n2 = normalizedToNatural(1.2, -0.1, 800, 600);
  assert(n2.x === 800 && n2.y === 0, "越界归一化夹紧到自然边界");
}

// 4. 缩放 / 弹窗尺寸变化不变性：同一「图像内 25% 横向 / 25% 纵向」点，
//    在不同显示尺寸下 client 坐标不同，但归一化坐标必须相同，且映射回自然坐标也相同。
{
  const natural = { w: 1024, h: 768 };
  const cases = [
    { left: 0, top: 0, width: 200, height: 150 },
    { left: 40, top: 80, width: 512, height: 384 },
    { left: 300, top: 200, width: 256, height: 192 }
  ];
  const expectedNx = 0.25;
  const expectedNy = 0.25;
  for (const c of cases) {
    // 该归一化点对应的 client 坐标：
    const clientX = c.left + expectedNx * c.width;
    const clientY = c.top + expectedNy * c.height;
    const norm = clientPointToNormalized(clientX, clientY, c);
    assert(approx(norm.nx, expectedNx, 1e-9) && approx(norm.ny, expectedNy, 1e-9),
      `显示盒 ${c.width}×${c.height} 下归一化坐标不变 (${norm.nx.toFixed(3)},${norm.ny.toFixed(3)})`);
    const nat = normalizedToNatural(norm.nx, norm.ny, natural.w, natural.h);
    assert(nat.x === Math.round(expectedNx * natural.w) && nat.y === Math.round(expectedNy * natural.h),
      `显示盒 ${c.width}×${c.height} 下自然坐标一致 (${nat.x},${nat.y})`);
  }
}

// 5. normalizeRect（方向无关）
{
  const r = normalizeRect(0.8, 0.9, 0.1, 0.2);
  assert(approx(r.x, 0.1) && approx(r.y, 0.2) && approx(r.w, 0.7) && approx(r.h, 0.7),
    "对角点自动排序夹紧 → 归一化矩形");
}

// 6. 箭头头部
{
  const [h1, h2] = arrowHeadPoints(0, 0, 1, 0, 0.2);
  assert(approx(h1.x, 0.82, 1e-3) && approx(h2.x, 0.82, 1e-3) && approx(h1.y + h2.y, 0, 1e-9) && approx(Math.abs(h1.y), 0.0868, 1e-3),
    "水平箭头头部两点对称分布在终点两侧");
  const len = arrowHeadLength(0, 0, 1, 0);
  assert(len > 0.012 && len <= 0.06, "箭头头部长度落在合理区间");
}

// 6b. 箭头方向：方向 = 起点→终点，反向拖拽不得被翻转
// 回归背景：曾在提交时用 normalizeRect 归一化 w/h，把符号吃掉 ⇒ 箭头方向反转且只能朝右下。
{
  const drag = { x: 0.9, y: 0.2, w: -0.8, h: 0.6 }; // 从右上往左下拖
  const endX = drag.x + drag.w;
  const endY = drag.y + drag.h;
  assert(approx(endX, 0.1) && approx(endY, 0.8), "反向拖拽：终点 = 拖拽结束点（w/h 保留符号，方向不被翻转）");
  const [h1] = arrowHeadPoints(drag.x, drag.y, endX, endY, 0.1);
  const dStart = Math.hypot(h1.x - drag.x, h1.y - drag.y);
  const dEnd = Math.hypot(h1.x - endX, h1.y - endY);
  assert(dEnd < dStart, "箭头头部靠近终点而非起点");

  const left = { x: 0.9, y: 0.5, w: -0.8, h: 0 }; // 纯向左拖
  assert(approx(left.x + left.w, 0.1), "向左拖拽终点 x = 0.1（保持向左，不是被翻成向右）");
  const [l1] = arrowHeadPoints(left.x, left.y, left.x + left.w, left.y, 0.1);
  assert(l1.x > 0.1 && l1.x < 0.9, "向左箭头头部回钩朝向起点（终点右侧）");
}

// 6c. 箭头头部在等比空间计算（非等比 viewBox 用 aspect 换算后映射回来，头部不变形）
{
  const aspect = 0.75; // 3:4 竖图
  const ax = 0.2, ay = 0.2, bx = 0.8, by = 0.8;
  const hl = arrowHeadLength(ax * aspect, ay, bx * aspect, by, 0.012, 0.06, 0.22);
  const [p1, p2] = arrowHeadPoints(ax * aspect, ay, bx * aspect, by, hl);
  const h1 = { x: p1.x / aspect, y: p1.y };
  const h2 = { x: p2.x / aspect, y: p2.y };
  // 映射回归一化空间后，两个倒钩到终点的「等比距离」应相等（否则屏幕上就是歪的）
  const d1 = Math.hypot((h1.x - bx) * aspect, h1.y - by);
  const d2 = Math.hypot((h2.x - bx) * aspect, h2.y - by);
  assert(approx(d1, d2, 1e-9) && d1 > 0, "箭头两倒钩在等比空间到终点等距（宽高比换算未变形）");
}

// 7. drawAnnotationOnContext —— 矩形（800×600，标注 x0.25 y0.25 w0.5 h0.5）
{
  const ctx = makeStubCtx();
  drawAnnotationOnContext(ctx, { type: "rect", x: 0.25, y: 0.25, w: 0.5, h: 0.5, color: "#f00" }, 800, 600);
  const r = ctx.calls.find((c) => c[0] === "strokeRect");
  assert(r && r[1] === 200 && r[2] === 150 && r[3] === 400 && r[4] === 300,
    "矩形绘制坐标 = 自然像素 (200,150,400,300)");
}

// 8. drawAnnotationOnContext —— 圆形（归一化包围盒 → 椭圆）
{
  const ctx = makeStubCtx();
  drawAnnotationOnContext(ctx, { type: "circle", x: 0.25, y: 0.25, w: 0.5, h: 0.5, color: "#0f0" }, 800, 600);
  const e = ctx.calls.find((c) => c[0] === "ellipse");
  assert(e && e[1] === 400 && e[2] === 300 && e[3] === 200 && e[4] === 150,
    "圆形绘制坐标 = 椭圆中心(400,300) 半径(200,150)");
}

// 9. drawAnnotationOnContext —— 箭头
{
  const ctx = makeStubCtx();
  drawAnnotationOnContext(ctx, { type: "arrow", x: 0.1, y: 0.1, w: 0.8, h: 0.8, color: "#00f" }, 1000, 1000);
  const move = ctx.calls.find((c) => c[0] === "moveTo");
  const line = ctx.calls.find((c) => c[0] === "lineTo");
  assert(move && move[1] === 100 && move[2] === 100, "箭头起点 = 自然 (100,100)");
  assert(line && line[1] === 900 && line[2] === 900, "箭头终点 = 自然 (900,900)");
  assert(ctx.calls.some((c) => c[0] === "fill"), "箭头头部已填充");
}

// 10. drawAnnotationOnContext —— 画笔（自由路径）
{
  const ctx = makeStubCtx();
  drawAnnotationOnContext(ctx, {
    type: "brush",
    color: "#fff",
    points: [{ nx: 0.1, ny: 0.2 }, { nx: 0.3, ny: 0.4 }, { nx: 0.5, ny: 0.6 }]
  }, 1000, 1000);
  const moves = ctx.calls.filter((c) => c[0] === "moveTo" || c[0] === "lineTo");
  assert(moves.length === 3, "画笔 3 个点产生 3 次路径指令");
  assert(moves[0][1] === 100 && moves[0][2] === 200, "画笔首点 = 自然 (100,200)");
  assert(moves[2][1] === 500 && moves[2][2] === 600, "画笔末点 = 自然 (500,600)");
}

// 11. 越界标注绘制夹紧（不画出图外）
{
  const ctx = makeStubCtx();
  drawAnnotationOnContext(ctx, { type: "rect", x: -0.2, y: -0.1, w: 0.5, h: 0.5, color: "#f00" }, 800, 600);
  const r = ctx.calls.find((c) => c[0] === "strokeRect");
  assert(r && r[1] >= 0 && r[2] >= 0, "越界矩形起点被夹紧到非负自然坐标");
}

console.log(`\n结果：${passed} 通过 / ${failures} 失败`);
if (failures > 0) {
  process.exit(1);
}
