// 浏览器探针：验证「正反」开关的 UI 联动（前端专项E）。
//
// 在真实浏览器上下文执行（由 retouch-frontback-check.mjs 通过 tabbit 驱动），只验 UI 行为：
//   1. 切到精修页并找到「正反」toggle（.retouchFrontbackSwitch）；
//   2. 点开 → 预览首行出现【正反视图】段，比例下拉变 4:3；
//   3. 再点关 → 段消失，比例恢复到开启前的原值（默认 3:4）。
//
// 不依赖 tabbit 工具链之外的任何东西；纯 DOM 读取，不扣费、不打上游。
export async function run() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const facts = {
    navSwitched: false,
    panelFound: false,
    toggleFound: false,
    ratioBefore: null,
    ratioOn: null,
    ratioOff: null,
    ratioRestored: false,
    previewBeforeHasFrontback: false,
    previewOnStartsWithFrontback: false,
    previewOnHasText: false,
    previewOffHasFrontback: false,
    error: ""
  };
  const navTo = (label) => {
    const candidates = Array.from(document.querySelectorAll("button, [role=\"tab\"], .pageTab, .outfitPageTab, .navItem"));
    const target = candidates.find((el) => el.textContent && el.textContent.trim().includes(label));
    if (target) { target.click(); return true; }
    return false;
  };
  const getPreview = () => {
    const el = document.querySelector("textarea.retouchPromptLive");
    return el ? String(el.value || "") : "";
  };
  const findRatioSelect = () => {
    // 只认「精修设置区」右侧工具条里的比例下拉（.rightTools 内唯一的 ratio 型 select），
    // 避免误读页面里其它带比例选项的 select（如视频/局部编辑等）。
    const root = document.querySelector(".rightTools") || document;
    const selects = Array.from(root.querySelectorAll("select"));
    return selects.find((sel) => Array.from(sel.options).some((opt) => /^\d+:\d+$/.test(String(opt.value || ""))));
  };
  try {
    facts.navSwitched = navTo("精修");
    await wait(1600);
    const panel = document.querySelector(".retouchIntentPanel");
    facts.panelFound = Boolean(panel);
    const toggle = document.querySelector(".retouchFrontbackSwitch");
    facts.toggleFound = Boolean(toggle);
    if (!toggle) { facts.error = "未找到 .retouchFrontbackSwitch（精修页未进入或面板未渲染）"; return facts; }

    const ratioSelect = findRatioSelect();
    facts.ratioBefore = ratioSelect ? ratioSelect.value : null;
    const previewBefore = getPreview();
    facts.previewBeforeHasFrontback = previewBefore.includes("【正反视图】");

    // 点开
    toggle.click();
    await wait(1300);
    const previewOn = getPreview();
    facts.previewOnStartsWithFrontback = previewOn.startsWith("【正反视图】");
    facts.previewOnHasText = previewOn.includes("把图1和图2服装正反平铺俯视图电商白底精修");
    facts.ratioOn = ratioSelect ? ratioSelect.value : null;

    // 再点关
    toggle.click();
    await wait(1300);
    const previewOff = getPreview();
    facts.previewOffHasFrontback = previewOff.includes("【正反视图】");
    facts.ratioOff = ratioSelect ? ratioSelect.value : null;
    facts.ratioRestored = facts.ratioOff === facts.ratioBefore;
  } catch (error) {
    facts.error = error instanceof Error ? error.message : String(error);
  }
  return facts;
}
