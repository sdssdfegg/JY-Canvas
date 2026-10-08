/**
 * 浏览器 DOM 侧的小动作：剪贴板写入、拖拽落文件的默认行为拦截。
 *
 * 2026-10-03 建立（V11-RF-060 阶段 3，统筹授权新建，见工单 §6.15）：
 *   - `copyText`：main/outfit 各一份，剥离缩进后逐字节一致（20 行）。
 *   - `preventFileDropNavigation`：image-editor/outfit 各一份，逐字节一致（5 行）。
 * 两者都是纯 DOM 动作，与业务无关，落这里不牵扯任何 state。
 *
 * ⚠️ 只放 DOM 动作，不放业务语义（提示文案由调用方传）。
 */

/**
 * 复制文本到剪贴板，失败时走 textarea 兜底。
 *
 * @param {string} text 待复制内容；空值直接返回（与旧实现一致：不提示、不报错）。
 * @param {object} options
 * @param {string} [options.successMessage] 成功提示文案
 * @param {(title:string, detail:string)=>void} options.notify 提示回调（两侧各自的 addEvent）
 *   🔴 必传：不给默认值是有意为之 —— 忘了传会立刻 TypeError 暴露，
 *      好过默认成空函数让提示静默消失（收窄，违反 §0.9 原则 1）。
 */
export async function copyTextToClipboard(text, { successMessage = "已复制", notify }) {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      document.body.removeChild(field);
    }
    notify("复制", successMessage);
  } catch {
    notify("复制失败", "浏览器没有允许剪贴板权限");
  }
}

/**
 * 阻止浏览器把拖进来的文件当成导航（否则会直接打开图片、丢掉当前编辑状态）。
 * 只在拖拽内容含 Files 时拦截，不影响页面内的其他拖拽。
 */
export function preventFileDropNavigation(event) {
  const types = Array.from(event.dataTransfer?.types || []);
  if (!types.includes("Files")) return;
  event.preventDefault();
}
