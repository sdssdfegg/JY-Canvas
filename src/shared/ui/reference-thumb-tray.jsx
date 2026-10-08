// 共享「参考图缩略条」（V11-RF-043-2 抽取）。
//
// 为什么抽它：`src/shared/ui/README.md` 的"必须优先共用的 UI"表里早就写着
// 「参考图缩略条 | 快捷、批量、详情结果都可能用 | ReferenceThumbTray.jsx」。
// 抽取前 `src/main.jsx` 与 `src/outfit-workflow.jsx` 各持一份同名组件，**已分叉**。
//
// 基底取 **main 版**（V11-RF-043 分叉审计 + 统筹裁决）：
//   - main 侧 4 个调用点 vs outfit 侧 1 个调用点；
//   - main 版是**真超集** 3 处：① missing + 白名单双重过滤 ② 空态多条件 ③ 空态二分支文案。
// 补 outfit 版**独有的 1 处真超集**：
//   - key 兜底 `reference.name || "reference"`（main 版写 `${reference.name}-${index}`，
//     name 为空时会退化成 `undefined-0`，outfit 版更稳）⇒ 取 outfit 版。
//
// 🔴 调用约定（统筹裁定统一，只认这一种）：
//     `onOpen(reference, index, items)` —— 第一个实参是**被点击的那一张**，不是整组。
//     抽取前 main 版是 `onOpen(items, index)`、outfit 版是 `onOpen(reference, index, items)`，
//     两侧调用方已各自按自己的约定实现 ⇒ 统一为 outfit 版后：
//       · outfit 侧 1 个调用点 `(reference) => setImageLightbox(...)` **天然兼容，零改动**；
//       · main 侧 `openReferencePreview` 的第一个实参期望数组，若不管会静默失效
//         （`Array.isArray` 为 false ⇒ 直接 return，点了没反应）⇒ 已同步改签名为
//         `(reference, index = 0, items = [])`，行为与改前等价（见 main.jsx 该处注释）。
//
// ⚠️ 相对 outfit 旧版的**行为收窄**（统一口径的必然结果，已报备统筹）：
//   - 缩略图过滤：outfit 旧版只看 `referenceSource(reference)` 有值；统一版多了
//     `!reference.missing && isAllowedReferenceImage(...)` ⇒ 归档丢失/来源不白名单的不再渲染。
//   - 数量口径：outfit 旧版 `Math.max(count, items.length)`；统一版用 `items.length`（main 口径）。
//   ⇒ 连带影响：outfit 侧右键菜单 `openReferenceContextMenu` 的第 4 个实参 `items`
//     只用于 `count: items.length`，张数会随过滤口径变小（菜单文案里的张数更准了）。
//   - 渲染元素：outfit 旧版用原生 `<img>`；统一版用 `CachedImage`（V11-RF-043-1 已落共享位）
//     ⇒ 批量侧缩略图从此带缓存与显示埋点，不再每次重新拉图。
//
// `max` 参数**必须保留、默认值 5**：main 侧显式传过 max=5 / max=6，outfit 侧全靠默认值。

import { CachedImage } from "./cached-image.jsx";
import { isAllowedReferenceImage, referenceSource } from "../result-image.js";

export function ReferenceThumbTray({ references, count = 0, className = "", max = 5, onOpen, onContextMenu, onImageDragStart }) {
  const allItems = Array.isArray(references) ? references.filter(Boolean) : [];
  // P1：统一图片地址校验 + 归档缺失标记。
  // 归档已丢失（服务端标记 missing），或地址不在白名单（旧中转站/预签名链接等），
  // 都不再渲染、不再请求，避免每次打开页面 404/502。用数量提示告诉用户当时用了几张参考图。
  const items = allItems.filter((reference) => (
    !reference?.missing && isAllowedReferenceImage(reference, referenceSource)
  ));
  const missingCount = allItems.length - items.length;
  const visibleItems = items.slice(0, max);
  if (visibleItems.length === 0 && (count > 0 || missingCount > 0)) {
    const total = count || allItems.length;
    return (
      <div
        className={`referenceThumbTray ${className}`}
        title={missingCount > 0
          ? `${missingCount} 张参考图缩略图不可用（归档文件不存在或地址不在允许来源），不再重复请求`
          : "旧记录只保存了参考图数量，没有保存缩略图"}
      >
        <span className="referenceCountPill">{total} 张参考</span>
      </div>
    );
  }
  if (visibleItems.length === 0) return null;
  return (
    <div className={`referenceThumbTray ${className}`} title={`本张图使用了 ${items.length} 张参考图`}>
      {visibleItems.map((reference, index) => {
        const src = referenceSource(reference);
        return (
          <span
            className="referenceMiniThumb"
            key={reference.id || `${reference.name || "reference"}-${index}`}
            title={reference.name || `参考图 ${index + 1}`}
            onContextMenu={onContextMenu ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(event, reference, index, items);
            } : undefined}
          >
            {src && (
              <CachedImage
                src={src}
                alt=""
                loading="lazy"
                draggable={Boolean(onImageDragStart)}
                role={onOpen ? "button" : undefined}
                tabIndex={onOpen ? 0 : undefined}
                onDragStart={onImageDragStart ? (event) => onImageDragStart(event, reference, index, items) : undefined}
                onClick={onOpen ? (event) => {
                  event.stopPropagation();
                  onOpen(reference, index, items);
                } : undefined}
                onKeyDown={onOpen ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpen(reference, index, items);
                  }
                } : undefined}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                  event.currentTarget.parentElement?.classList.add("missing");
                }}
              />
            )}
          </span>
        );
      })}
      {items.length > max && <span className="referenceMoreThumb">+{items.length - max}</span>}
    </div>
  );
}
