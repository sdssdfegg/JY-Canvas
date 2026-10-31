// 浏览器侧探针：V157 画布生成节点「属性面板（Inspector）」可见性实测（真实浏览器，不打上游、不扣费）。
// 由 ai-canvas-inspector-browser-check.mjs 通过 tabbit 驱动，run() 单阶段：
//   进画布 → 新建生成节点 → 选中它 → 断言 Inspector 内 模型/渠道/尺寸/比例 四控件均可见
//   → 切换模型后渠道下拉选项数量变化 → 节点卡片 NodeBody 内不再含可编辑下拉（旧缺陷根因已消除）。
// 只动页面状态，不生成、不扣费。
export async function run() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const facts = { error: "" };
  try {
    await wait(800);
    // 1) 进入「AI 无限画布」
    const nav = [...document.querySelectorAll(".navItem")].find((b) => b.textContent.includes("无限画布"));
    if (nav) nav.click();
    for (let i = 0; i < 40 && !document.querySelector(".aiCanvasRoot"); i += 1) await wait(150);
    facts.canvasOpened = Boolean(document.querySelector(".aiCanvasRoot"));

    // 2) 新建生成节点
    const addBtn = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("title") || "") === "添加生成节点"
    );
    if (addBtn) addBtn.click();
    for (let i = 0; i < 40 && !document.querySelector("[data-node]"); i += 1) await wait(150);
    const nodeEl = document.querySelector("[data-node]");
    facts.nodeCreated = Boolean(nodeEl);

    // 3) 选中节点（触发 onNodePointerDown → selectNode）
    if (nodeEl) {
      nodeEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    }
    await wait(300);

    // 4) Inspector 可见 + 四控件几何断言
    const inspector = document.querySelector(".aiCanvasInspector");
    facts.inspectorVisible = Boolean(inspector);
    if (inspector) {
      const fields = [...inspector.querySelectorAll(".aiCanvasInspectorField")];
      const getSelect = (labelText) => {
        const f = fields.find((el) => el.querySelector(".aiCanvasInspectorLabel")?.textContent.trim() === labelText);
        return f ? f.querySelector("select") : null;
      };
      const modelSelect = getSelect("出图模型");
      const channelSelect = getSelect("出图渠道");
      const sizeSelect = getSelect("尺寸");
      const ratioSelect = getSelect("比例");
      facts.hasModel = Boolean(modelSelect);
      facts.hasChannel = Boolean(channelSelect);
      facts.hasSize = Boolean(sizeSelect);
      facts.hasRatio = Boolean(ratioSelect);

      const visible = (el) => {
        if (!el) return false;
        if (el.offsetParent === null) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const ir = inspector.getBoundingClientRect();
        // 控件矩形必须落在 Inspector 可见区内（未被祖先裁剪）
        return r.left >= ir.left - 1 && r.right <= ir.right + 1 && r.top >= ir.top - 1 && r.bottom <= ir.bottom + 1;
      };
      facts.modelVisible = visible(modelSelect);
      facts.channelVisible = visible(channelSelect);
      facts.sizeVisible = visible(sizeSelect);
      facts.ratioVisible = visible(ratioSelect);
      facts.channelCountBefore = channelSelect ? channelSelect.options.length : 0;

      // 5) 切换模型为 banana-2 → 渠道下拉选项数量应变化（按模型过滤）
      if (modelSelect) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
        setter.call(modelSelect, "banana-2");
        modelSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await wait(250);
        const ch2 = getSelect("出图渠道");
        facts.channelCountAfter = ch2 ? ch2.options.length : 0;
        facts.channelChanged = facts.channelCountBefore !== facts.channelCountAfter;
      }
    }

    // 6) 结构证明：节点卡片 NodeBody 内不再含可编辑下拉（旧缺陷根因——固定高度 + overflow 裁掉控件——已消除）
    const nodeBody = document.querySelector(".aiCanvasNodeBody");
    facts.nodeBodyHasSelect = Boolean(nodeBody && nodeBody.querySelector("select"));
  } catch (error) {
    facts.error = error instanceof Error ? error.message : String(error);
  }
  return facts;
}
