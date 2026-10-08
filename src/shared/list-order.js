// 列表顺序调整（纯函数，不碰 React、不碰 DOM）。
//
// 为什么单独建这个文件：
//   `moveItemByDrop` 原本定义在 `features/outfit/outfit-top.js` 里，但它是个通用数组工具，
//   跟"换装"这个业务域毫无关系。快捷生成侧要复用它做参考图排序时，如果直接从 upload 域
//   引 outfit-top，会把 2146 行换装域连带它的 14 个依赖拖进快捷生成的包里。
//   ⇒ 抽到这里，`outfit-top.js` 改为重新导出，旧的 import 路径一行都不用动。
//
// 用法：moveItemByDrop(items, fromId, toId, placement)
//   placement = "before" | "after"，相对 `toId` 这张卡片而言。

/**
 * 把 `fromId` 这张卡挪到 `toId` 的前面或后面。
 * - `items` 里的元素需要带稳定的 `id` 字段；
 * - fromId/toId 相同、或任一找不到时，原样返回入参（不入参也行，调用方无感）。
 */
export function moveItemByDrop(items, fromId, toId, placement) {
  if (!fromId || !toId || fromId === toId) return items;
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const targetIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || targetIndex < 0) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  // 摘掉之后下标会左移，所以必须在新的数组里重新定位 target。
  const normalizedTargetIndex = next.findIndex((item) => item.id === toId);
  next.splice(placement === "after" ? normalizedTargetIndex + 1 : normalizedTargetIndex, 0, moved);
  return next;
}
