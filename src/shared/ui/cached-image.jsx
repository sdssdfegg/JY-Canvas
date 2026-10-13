// 共享「带缓存 + 显示埋点」的结果图 <img>（V11-RF-043-1 抽取）。
//
// 为什么抽它：`src/shared/ui/README.md` 的修改规则第 1 条要求「两个以上页面长得一样或
// 行为一样，先抽到 src/shared/ui/」。本组件此前只存在于 `src/main.jsx`（V11-RF-043 分叉
// 审计实测：`src/outfit-workflow.jsx` 全仓 `CachedImage` 使用数为 0，它的参考图托盘用的是
// 原生 `<img>`），下一步 V11-RF-043-2 把 `ReferenceThumbTray` 抽到共享位后，两侧的缩略图
// 都要走本组件——先落共享位，避免 043-2 出现「批量侧从 main.jsx import」的反向依赖
// （契约硬约束：禁止 outfit-workflow.jsx 从 main.jsx import）。
//
// 抽取范围（刻意保守，**纯搬运**，行为一个字没改）：
//   - `CachedImage` / `preloadDisplayImageUrl` / `DISPLAY_IMAGE_CACHE` 从 src/main.jsx 逐字搬来，
//     缓存键（原始 src）、20s 预加载超时、失败时 delete 条目、
//     `client-result-display-ready` 埋点的全部字段（stage/endpoint/method/detail.*）都保持原样。
//   - 不做：不合并 outfit 侧的原生 `<img>`（那属于 RF-043-2 的分叉裁决范围）。
//
// V11-RF-048：并入 outfit 侧的改名克隆 `PreparedResultImage`（原 src/outfit-workflow.jsx:2470）。
//   两版逐项对照的裁决是「可统一，取超集」——outfit 侧从此**获得缓存**（放宽），
//   main 侧不丢缓存、不丢埋点。对 main 侧而言唯一变化是 detail 多一个 `workflowMode` 字段
//   （main 调用点不传 ⇒ 空串），以及 `<img>` 多一层 `{...rest}` 透传（main 调用点没有额外属性）。
//   被删掉的 outfit 侧私有件：`preloadImageUrl`（8000ms 默认值，唯一调用点固定传 20000 ⇒ 非真分叉）
//   与 `RESULT_IMAGE_PRELOAD_TIMEOUT_MS`（=20000，与共享版默认超时同值）。
//
// ⚠️ `DISPLAY_IMAGE_CACHE` 是**模块级可变 Map**：搬到本文件后仍是整个应用共享一份缓存。
//    它是「前端模块单例」，不是进程级单例 ⇒ **不在 `state-singleton-check` 的监视范围**
//    （该门禁复用 `listServerSourceFiles()`，只扫 `server/`）。本文件保持它有且仅有一处定义点。

import { useEffect, useRef, useState } from "react";
import { displayImageRequestUrl } from "../../api/assets.js";
import { emitClientDiagnosticEvent } from "../../api/client.js";
import { diagnosticImageSourceType } from "../result-image.js";

// V46.2: 容量上限 + LRU 淘汰，避免长会话内存无限增长。
// 注意：缓存只存 URL 字符串（不含解码位图），单条极省内存；
// 容量取稳妥值 300——过小则回看被逐图重新预加载（重现小幅卡顿），过大则失去约束意义。
const DISPLAY_IMAGE_CACHE_MAX = 300;
const DISPLAY_IMAGE_CACHE = new Map();
function cacheDisplayImageSet(key, value) {
  if (!DISPLAY_IMAGE_CACHE.has(key) && DISPLAY_IMAGE_CACHE.size >= DISPLAY_IMAGE_CACHE_MAX) {
    const oldest = DISPLAY_IMAGE_CACHE.keys().next().value;
    if (oldest !== undefined) DISPLAY_IMAGE_CACHE.delete(oldest);
  }
  DISPLAY_IMAGE_CACHE.set(key, value);
}
function cacheDisplayImageTouch(key) {
  const value = DISPLAY_IMAGE_CACHE.get(key);
  if (value !== undefined) {
    DISPLAY_IMAGE_CACHE.delete(key);
    DISPLAY_IMAGE_CACHE.set(key, value);
  }
}

// V46.5：离屏时把已解码位图替换成 1x1 透明占位，回收显存/内存（低端机长会话核心痛点）。
// 仅对经代理的 http(s) 外链生效；data:/blob: 本地资源不卸载（卸载即丢失且本就极小）。
// 真·「小图下载」缩略图需服务端缩放（受 🔴 G-6 约束，当前不做），本方案是零服务端改动的安全替代。
const OFFSCREEN_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// 找到最近的滚动容器作为 IntersectionObserver 的 root，
// 这样横向画廊（strip 内左右滚动）与纵向长列表都能正确判定离屏。
function findScrollRoot(el) {
  let node = el ? el.parentElement : null;
  while (node) {
    const overflow = typeof getComputedStyle === "function" ? getComputedStyle(node).overflow : "";
    if (/(auto|scroll|hidden)/.test(overflow || "")) return node;
    node = node.parentElement;
  }
  return null;
}

function preloadDisplayImageUrl(url, timeoutMs = 20000) {
  if (!url || typeof Image !== "function") return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      resolve();
    };
    const timer = typeof window !== "undefined" ? window.setTimeout(done, timeoutMs) : null;
    image.onload = done;
    image.onerror = done;
    image.decoding = "async";
    image.src = url;
    if (typeof image.decode === "function") {
      image.decode().then(done, done);
    }
  });
}

// `...rest` 会原样透传给底层 `<img>`（V11-RF-048 放宽）。
// 原因：outfit 侧的改名克隆 `PreparedResultImage` 用的是 `{...props}` 整体透传，
// 调用点会传 `fetchPriority` / `onDragOver` / `onDrop` / `onDragEnd` 等本组件
// 没有显式声明的属性。`decoding` 已提升为显式参数（默认 async，V46.4 增加），
// 若统一后只保留显式清单，批量侧会**丢掉拖拽替换与加载优先级**（收窄）；
// 按 RF-043 定下的「放宽 > 收窄」判据，这里必须整体透传。
// V46.4：默认走浏览器原生懒加载 + 异步解码。离屏大图（结果图/画布图等）不进主线程
// 解码与绘制，直接削减低端机滚动/回看时的卡顿；这是「IntersectionObserver 懒加载」的
// 零风险实现，不触碰任何列表结构与拖拽重排（参考图托盘/结果图均为拖拽交互，真·虚拟化
// 会卸载离屏项从而破坏拖拽，故选懒加载分支）。调用方仍可用 loading/decoding 显式覆盖。
// V46.5：在 V46.4 基础上加「离屏卸载」——滚出视口的已解码位图换成 1x1 透明占位并释放，
// 滚回再还原（浏览器缓存使还原无网络开销）。配合 content-visibility:auto 双重削峰，
// 专治长会话内存暴涨；零服务端改动、不碰 🔴 G-6 代理约束、画廊在屏内清晰不变、拖拽源地址不受影响。
export function CachedImage({ src, alt = "", className = "", style, draggable = false, role, tabIndex, onDragStart, onClick, onKeyDown, onError, loading = "lazy", decoding = "async", diagnostic, ...rest }) {
  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src || "";
    const cached = DISPLAY_IMAGE_CACHE.get(src);
    return cached?.url || "";
  });
  const displayLogKeyRef = useRef("");
  // V46.5：离屏标记。为 true 时渲染占位图、释放已解码位图；不影响原始 src 与拖拽源地址。
  const imgRef = useRef(null);
  const [isOffscreen, setOffscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const emitDisplayReady = (shownSrc) => {
      const requestId = String(diagnostic?.requestId || diagnostic?.taskId || "").trim();
      if (!requestId) return;
      const key = `${requestId}|${diagnostic?.placement || ""}|${shownSrc || src || ""}`;
      if (displayLogKeyRef.current === key) return;
      displayLogKeyRef.current = key;
      emitClientDiagnosticEvent({
        requestId,
        stage: "client-result-display-ready",
        endpoint: diagnostic?.endpoint || "",
        method: "DISPLAY",
        ok: true,
        durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
        detail: {
          taskId: requestId,
          placement: diagnostic?.placement || "",
          module: diagnostic?.module || "",
          // V11-RF-048：outfit 侧克隆版多带一个 `workflowMode`。
          // 它只补数据、不参与任何判断分支 ⇒ 按「多出字段直接取超集」的判据并入。
          // main 侧调用点不传该字段 ⇒ 落空串，埋点输出与改前逐字一致。
          workflowMode: diagnostic?.workflowMode || "",
          sourceType: diagnosticImageSourceType(shownSrc || src),
          displayMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt)
        }
      });
    };
    if (!src) {
      setDisplaySrc("");
      return undefined;
    }
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      setDisplaySrc(src);
      emitDisplayReady(src);
      return undefined;
    }
    const requestSrc = displayImageRequestUrl(src);
    const cached = DISPLAY_IMAGE_CACHE.get(src);
    if (cached) cacheDisplayImageTouch(src);
    if (cached?.url) {
      setDisplaySrc(cached.url);
      emitDisplayReady(cached.url);
      return undefined;
    }
    const promise = cached?.promise || preloadDisplayImageUrl(requestSrc)
      .then(() => {
        cacheDisplayImageSet(src, { url: requestSrc });
        return requestSrc;
      });
    if (!cached?.promise) cacheDisplayImageSet(src, { promise });
    setDisplaySrc("");
    promise
      .then((url) => {
        if (!cancelled) {
          setDisplaySrc(url);
          emitDisplayReady(url);
        }
      })
      .catch((error) => {
        DISPLAY_IMAGE_CACHE.delete(src);
        if (!cancelled) {
          setDisplaySrc(src);
          onError?.(error);
        }
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // V46.5：离屏卸载已解码位图，削减长会话内存。
  // 仅对经代理的 http(s) 外链生效；data:/blob: 与无 IO 环境直接跳过。
  useEffect(() => {
    const el = imgRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setOffscreen(!entry.isIntersecting);
      },
      { root: findScrollRoot(el) || null, rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  return (
    <img
      ref={imgRef}
      className={className}
      src={isOffscreen ? OFFSCREEN_PLACEHOLDER : (displaySrc || undefined)}
      alt={alt}
      style={style}
      draggable={draggable}
      role={role}
      tabIndex={tabIndex}
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={onKeyDown}
      loading={loading}
      decoding={decoding}
      onError={onError}
      {...rest}
    />
  );
}
