// 手动分屏空分组工厂（阶段最终验收配套）：从 useDetailState 抽出，保持业务实现不变。
// 纯函数，不调用任何 AI 策划接口；无激活分组时由本工厂产出本地空分组。

export function createManualDetailGroup({ detailSettings, detailProductFiles, detailReferenceFiles }) {
  const createdAt = Date.now();
  const id = `detail_manual_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    label: `${new Date(createdAt).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })} | 手动分屏`,
    name: "手动分屏",
    createdAt,
    status: "ready",
    params: {
      workflow: detailSettings.workflow,
      model: detailSettings.model,
      ratio: detailSettings.ratio,
      imageSize: detailSettings.imageSize,
      count: detailSettings.count,
      copywriting: detailSettings.copywriting,
      lang: detailSettings.lang
    },
    productFiles: [...detailProductFiles],
    referenceFiles: [...detailReferenceFiles],
    prompts: []
  };
}
