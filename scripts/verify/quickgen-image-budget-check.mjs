// V206（2026-11-11）· 快捷生成切换 OOM 修复门禁（静态源码断言 + 负向对照）。
//
// 为什么是静态断言而不是浏览器探针：
//   首屏图片上限 / 预加载门控属于「代码形态」约束，纯源码扫描即可锁定，且能进提交钩子快速子集
//   （--fast，<1s，不依赖起服务 / 浏览器 / 网络）。运行时浏览器预算由 P3 的 public 首启冒烟单独覆盖，
//   二者互补、互不替代。
//
// 防复发要点：
//   1. CachedImage 必须「视口门控 + 全局并发上限」预加载（禁止一次性 new Image() 解码大量大图）；
//   2. 必须去掉 preload 路径的强制 image.decode()（只靠 onload）；
//   3. 画廊渲染必须限量（首屏只渲最近 N 张 + 「加载更多」），且不得截断数据层
//      （loadHistoryResults / storage-store / 服务端 /api/history 不得做 slice 截断）。
//   4. 负向对照：检测逻辑必须对「旧坏写法」判红、对「干净写法」判绿，否则扫描空区域会假绿。
//
// 用法：node scripts/verify/quickgen-image-budget-check.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CACHED_IMAGE = path.join(ROOT, "src", "shared", "ui", "cached-image.jsx");
const BOARD = path.join(ROOT, "src", "features", "main-app", "panels", "main-canvas-board.jsx");

// 剥掉 /* */ 块注释与 // 行注释（保留 :// 不被误删，避免剥掉协议 URL），
// 这样「文档注释里提到 image.decode()」不会让 noForcedDecode 误判。
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/[^\n]*/g, "");
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// ---- 检测逻辑（抽成纯函数，供负向对照复用）----
// 断言 CachedImage 已门控预加载：有并发上限常量 + 队列/调度 + 仅在视口内（!isOffscreen）才入队。
function cachedImagePreloadGated(src) {
  const cap = /MAX_CONCURRENT_PRELOADS\s*=\s*(\d+)/.exec(src);
  const capOk = cap && Number(cap[1]) >= 1 && Number(cap[1]) <= 8;
  const hasQueue = /preloadQueue/.test(src) && /activePreloads/.test(src);
  const viewportGated = /isOffscreen/.test(src) && /enqueuePreload/.test(src);
  // 不得再调用强制 decode（旧 preloadDisplayImageUrl 的 image.decode()）
  const noForcedDecode = !/\.decode\(\s*\)/.test(src);
  return capOk && hasQueue && viewportGated && noForcedDecode;
}
// 断言画廊渲染限量：有 visibleTail 状态 + 对 quickGalleryItems 做 slice 限量 + 有「加载更多」入口。
function boardRenderLimited(src) {
  const hasState = /visibleTail/.test(src) && /setVisibleTail/.test(src);
  const hasSlice = /quickGalleryItems\.slice\(/.test(src);
  const hasLoadMore = /quickLoadMoreButton/.test(src);
  return hasState && hasSlice && hasLoadMore;
}
// 断言数据层未被截断：组件里不得出现对 loadHistoryResults / storage-store / /api/history 的 slice 截断。
function dataLayerNotTruncated(src) {
  // 允许「全量传入」(quickGalleryItems 来自 props) 与「渲染层 slice」；禁止在读取分支截断。
  const badSlice = /loadHistoryResults[\s\S]{0,400}slice\(/.test(src)
    || /storage-store[\s\S]{0,400}slice\(/.test(src)
    || /\/api\/history[\s\S]{0,400}slice\(/.test(src);
  return !badSlice;
}

// ---- 实际源码断言 ----
if (!existsSync(CACHED_IMAGE)) {
  check("源文件存在：src/shared/ui/cached-image.jsx", false, "文件缺失");
} else {
  const src = stripComments(readFileSync(CACHED_IMAGE, "utf8"));
  check("CachedImage：预加载已门控（并发上限 + 队列 + 视口门控，无强制 decode）",
    cachedImagePreloadGated(src),
    "需 MAX_CONCURRENT_PRELOADS(1..8) + preloadQueue/activePreloads + isOffscreen 门控 + 无 .decode()");
  check("CachedImage：保留 loading=lazy / decoding=async 默认值与 DISPLAY_IMAGE_CACHE 缓存",
    /loading\s*=\s*"lazy"/.test(src) && /decoding\s*=\s*"async"/.test(src) && /DISPLAY_IMAGE_CACHE/.test(src),
    "懒加载默认值与 LRU 缓存不得回退");
}

if (!existsSync(BOARD)) {
  check("源文件存在：main-canvas-board.jsx", false, "文件缺失");
} else {
  const src = stripComments(readFileSync(BOARD, "utf8"));
  check("画廊：渲染层限量（visibleTail + slice 限量 + 加载更多按钮）",
    boardRenderLimited(src), "首屏只渲最近 N 张，向上加载更多");
  check("数据层未截断（loadHistoryResults / storage-store / /api/history 无 slice 截断）",
    dataLayerNotTruncated(src), "历史记录全量保留，限量只发生在渲染层");
}

// ---- 负向对照：检测逻辑必须对坏写法判红、对干净写法判绿 ----
const BAD_CACHED = `
const MAX_CONCURRENT_PRELOADS = 999;
function preloadDisplayImageUrl(url) {
  const image = new Image();
  image.onload = () => {};
  image.src = url;
  if (typeof image.decode === "function") image.decode().then(() => {}, () => {});
}
useEffect(() => { preloadDisplayImageUrl(requestSrc); }, [src]);
`;
const GOOD_CACHED = `
const MAX_CONCURRENT_PRELOADS = 4;
let activePreloads = 0; const preloadQueue = [];
function enqueuePreload(url, onDone) { preloadQueue.push({ url, onDone }); pump(); }
useEffect(() => {
  if (isOffscreen) return;
  enqueuePreload(requestSrc, (u) => setDisplaySrc(u));
}, [src, isOffscreen]);
`;
const BAD_BOARD = `
{quickGalleryItems.map((galleryItem, index) => <Card key={galleryItem.key} />)}
`;
const GOOD_BOARD = `
const visibleTail = 30;
const renderItems = quickGalleryItems.slice(Math.max(0, quickGalleryItems.length - visibleTail));
<button className="quickLoadMoreButton" onClick={() => setVisibleTail(t => t + 30)}>加载更多</button>
{renderItems.map((galleryItem) => <Card key={galleryItem.key} />)}
`;

check("负向对照①：旧坏写法（无上限 + 强制 decode + 无门控）被判红",
  cachedImagePreloadGated(BAD_CACHED) === false, "检测器必须识别旧写法");
check("负向对照②：新好写法被判绿",
  cachedImagePreloadGated(GOOD_CACHED) === true, "检测器必须放行正确写法");
check("负向对照③：直接 map 全量渲染（无限量）被判红",
  boardRenderLimited(BAD_BOARD) === false, "检测器必须识别无限量渲染");
check("负向对照④：限量 + 加载更多写法被判绿",
  boardRenderLimited(GOOD_BOARD) === true, "检测器必须放行正确写法");

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results
}, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
