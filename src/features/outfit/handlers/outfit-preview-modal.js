// 模式：V5.0-012（NEXT.md 候选①）——预览弹窗域整块迁入本 hook。
// 域 = 原 src/outfit-workflow.jsx 1053–1070 的三个函数，按原声明顺序逐字迁移
//   （closePreviewModal → navigatePreview → zoomPreviewByWheel）。
// 行为契约：零行为变化（纯迁移）——三个函数体逐字不动。
// 调用点约束：调用方须将 useOutfitPreviewModal 置于 useOutfitPageSwitch 块之后、
//   useOutfitEffects 之前——navigatePreview 的 ctx 依赖 resultPreviewTasks 派生值，
//   而 useOutfitEffects 的 E28 keydown 闭包在渲染期消费 navigatePreview /
//   closePreviewModal，两个约束的唯一交集即该区间；本 hook 是纯函数工厂
//   （内部无 React hook）⇒ 区间内任意位置零 hook 顺序影响。
//   usePreviewDrag（组件上部，早于本调用点）的 closePreview 入参经 closePreviewRef
//   晚绑定注入（调用方刷新点紧随本 hook 解构，每渲染刷新）——usePreviewDrag
//   仅在 endPreviewDrag 指针事件里调用 closePreview，事件期读取恒新。

export function useOutfitPreviewModal(ctx) {
  const {
    preview,
    resultPreviewTasks,
    setPreview,
    setImageLightbox,
    setPreviewZoom
  } = ctx;

  function closePreviewModal() {
    setPreview(null);
    setImageLightbox(null);
  }

  function navigatePreview(direction) {
    if (!preview || resultPreviewTasks.length <= 1) return;
    const currentIndex = resultPreviewTasks.findIndex((task) => task.id === preview.id);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + resultPreviewTasks.length) % resultPreviewTasks.length;
    setPreview(resultPreviewTasks[nextIndex]);
  }

  function zoomPreviewByWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    setPreviewZoom((current) => Math.max(0.35, Math.min(5, Number((current + delta).toFixed(2)))));
  }

  return { closePreviewModal, navigatePreview, zoomPreviewByWheel };
}
