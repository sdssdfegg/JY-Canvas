// 出图并发槽位与排队（从 server/index.js 搬出，保持逐字节等价）。
//
// 进程级单例：activeImageRequestCount / imageRequestQueue 只此一份，
// 禁止路由各持一份 Map/数组（后续单若自建第二份会被 state-singleton-check 抓红）。
// 外部一律通过 imageQueueSnapshot() 只读快照拿 { active, queued }，不得直接读内部状态。
import { IMAGE_CONCURRENCY_LIMIT } from "./runtime-config.js";

let activeImageRequestCount = 0;
const imageRequestQueue = [];

function imageSlotWeight(value) {
  return Math.max(1, Math.min(IMAGE_CONCURRENCY_LIMIT, Number.parseInt(value, 10) || 1));
}

function drainImageQueue() {
  while (
    imageRequestQueue.length > 0
    && activeImageRequestCount + imageRequestQueue[0].weight <= IMAGE_CONCURRENCY_LIMIT
  ) {
    const next = imageRequestQueue.shift();
    next.grant();
  }
}

function acquireImageSlot(weight = 1) {
  const slotWeight = imageSlotWeight(weight);
  return new Promise((resolve) => {
    const grant = () => {
      activeImageRequestCount += slotWeight;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        activeImageRequestCount = Math.max(0, activeImageRequestCount - slotWeight);
        queueMicrotask(drainImageQueue);
      });
    };

    if (activeImageRequestCount + slotWeight <= IMAGE_CONCURRENCY_LIMIT) {
      grant();
    } else {
      imageRequestQueue.push({ weight: slotWeight, grant });
    }
  });
}

/** 只读快照：每次返回新对象，绝不把内部数组/变量本身外泄。 */
function imageQueueSnapshot() {
  return { active: activeImageRequestCount, queued: imageRequestQueue.length };
}

export { acquireImageSlot, imageSlotWeight, imageQueueSnapshot };
