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
  // V51：原实现只放行队头，一个放不下的重任务会堵死后面放得下的轻任务（头部阻塞）。
  // 改为从头扫描第一个放得下的：跳过当前放不下的，不跳过永远放得下的。
  // 权衡（有意接受）：持续轻任务负载下重任务可能被多次跳过而延迟——本地单用户工具队列深度有限，
  // 且重任务在 active 归零后必然被放行，不会饿死；不做复杂公平算法，避免过度设计。
  for (let index = 0; index < imageRequestQueue.length;) {
    const next = imageRequestQueue[index];
    if (activeImageRequestCount + next.weight <= IMAGE_CONCURRENCY_LIMIT) {
      imageRequestQueue.splice(index, 1);
      next.grant();
    } else {
      index += 1;
    }
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
