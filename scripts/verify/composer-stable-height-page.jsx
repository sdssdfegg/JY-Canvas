// 批量生成 / 快捷生成两模块底栏高度一致性探针（真实浏览器，不打上游、不扣费）。
//
// 验收核心（P1-001 交付报告 §8.3）：
//   1. 动态枚举 .outfitPageTab（不再硬编码 5 页），逐页量底栏各项 rect；
//   2. 量测 .composerPanel 的高度/顶/底（dock 外框是否恒定）、
//      .composerStickyControls 的 top/bottom（操作条相对视口是否恒定）、
//      .rightTools 的 top、.generateBtn 的可见性/是否被遮挡；
//   3. 切页前后断言上述量差 ≤ 2px（不跳动）；
//   4. 统计真实滚动容器数（≤2：结果区 + 配置区），断言无整页滚动；
//   5. 断言 .generateBtn 在视口内、不被遮挡、未隐藏。
//
// V192（T4 第三刀 · T4 收官单）：探针扩展到两模块——
//   批量侧：.outfitWorkflowEmbedded（点「批量生成」进入，全量动态页 .outfitPageTab）；
//   快捷侧：首屏默认视图（.canvasBoard / .composer / .composerFooter / .rightTools / 生成按钮），
//           无动态页签，以「切到批量再切回快捷」的模块切换断言替代 tabCount>0。
// 探针只读取真实 DOM 状态，不触发真实生成、不动上传、不写 history.json，
// 也【不创建任何临时需求页】（避免污染用户态标签页，见项目记忆纪律）。
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForSelector(sel, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (document.querySelector(sel)) return true;
    await wait(200);
  }
  return false;
}

function clickNavByText(text) {
  const nav = [...document.querySelectorAll("button.navItem")]
    .find((n) => (n.textContent || "").includes(text));
  if (nav) nav.click();
  return !!nav;
}

function nameOf(tab) {
  const span = tab.querySelector("span:last-child");
  return span ? span.textContent.trim() : (tab.textContent || "").trim();
}

// 批量侧量测（保持既有四项语义逐字不动）
function measureBatch() {
  const panel = document.querySelector(".outfitWorkflowEmbedded .composerPanel");
  const sc = document.querySelector(".composerStickyControls");
  const rt = document.querySelector(".composerStickyControls .rightTools");
  const gb = document.querySelector(".composerStickyControls .generateBtn");
  const pr = panel ? panel.getBoundingClientRect() : null;
  const sr = sc ? sc.getBoundingClientRect() : null;
  let btn = null;
  if (gb) {
    const r = gb.getBoundingClientRect();
    const inViewport = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const topEl = (r.width > 0 && r.height > 0) ? document.elementFromPoint(cx, cy) : null;
    const covered = !(gb === topEl || gb.contains(topEl) || (topEl && gb.contains(topEl)));
    const style = getComputedStyle(gb);
    btn = {
      inViewport,
      covered,
      hidden: style.visibility === "hidden" || style.display === "none"
    };
  }
  return {
    panelHeight: pr ? Math.round(pr.height) : null,
    stickyTop: sr ? Math.round(sr.top) : null,
    stickyBottom: sr ? Math.round(sr.bottom) : null,
    rightToolsTop: rt ? Math.round(rt.getBoundingClientRect().top) : null,
    btn
  };
}

// 快捷侧量测（V192 新增：.canvasBoard / .composer / .composerFooter / .rightTools / 生成按钮）
function measureQuick() {
  const canvas = document.querySelector(".canvasBoard");
  const composer = document.querySelector(".composer");
  const rt = document.querySelector(".composerFooter .rightTools");
  const gb = document.querySelector(".composerFooter .rightTools button");
  const cr = canvas ? canvas.getBoundingClientRect() : null;
  const pr = composer ? composer.getBoundingClientRect() : null;
  const rr = rt ? rt.getBoundingClientRect() : null;
  let btn = null;
  if (gb) {
    const r = gb.getBoundingClientRect();
    const inViewport = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const topEl = (r.width > 0 && r.height > 0) ? document.elementFromPoint(cx, cy) : null;
    const covered = !(gb === topEl || gb.contains(topEl) || (topEl && gb.contains(topEl)));
    const style = getComputedStyle(gb);
    btn = {
      inViewport,
      covered,
      hidden: style.visibility === "hidden" || style.display === "none"
    };
  }
  return {
    foundCanvas: !!(canvas && cr && cr.width > 0 && cr.height > 0),
    composerVisible: pr ? pr.bottom <= window.innerHeight + 1 : false,
    composerBottom: pr ? Math.round(pr.bottom) : null,
    rightToolsTop: rr ? Math.round(rr.top) : null,
    btn
  };
}

const spread = (arr) => {
  const n = (arr || []).filter((x) => typeof x === "number");
  return n.length ? Math.max(...n) - Math.min(...n) : null;
};

export async function run() {
  // ---- 快捷侧（首屏默认视图）先量 ----
  clickNavByText("快捷生成");
  await wait(450);
  const quickBefore = measureQuick();

  // ---- 切到批量侧（点「批量生成」进入 embed）----
  clickNavByText("批量生成");
  const foundEmbed = await waitForSelector(".outfitWorkflowEmbedded");

  // 枚举必须等 embed 挂载后再做（冷启动先枚举会拿到 0 个 tab）
  const tabEls = [...document.querySelectorAll(".outfitPageTab")];
  const labels = tabEls.map(nameOf).filter(Boolean);

  const panelHeights = [];
  const stickyTops = [];
  const stickyBottoms = [];
  const rightToolsTops = [];
  let btnBad = 0;
  for (const label of labels) {
    try {
      const tab = [...document.querySelectorAll(".outfitPageTab")]
        .find((t) => nameOf(t) === label);
      if (!tab) continue;
      tab.click();
      await wait(450);
      const m = measureBatch();
      if (typeof m.panelHeight === "number") panelHeights.push(m.panelHeight);
      if (typeof m.stickyTop === "number") stickyTops.push(m.stickyTop);
      if (typeof m.stickyBottom === "number") stickyBottoms.push(m.stickyBottom);
      if (typeof m.rightToolsTop === "number") rightToolsTops.push(m.rightToolsTop);
      if (m.btn) {
        if (m.btn.hidden || !m.btn.inViewport || m.btn.covered) btnBad += 1;
      }
    } catch {
      // 单页量测失败不影响整体，其余页照常统计
    }
  }

  // ---- 切回快捷侧（模块切换断言：切到批量再切回来，.canvasBoard 仍可见）----
  clickNavByText("快捷生成");
  const canvasVisible = await waitForSelector(".canvasBoard");
  await wait(450);
  const quickAfter = measureQuick();

  // P1-001：全仓真实滚动容器统计（overflow-y:auto/scroll 且内容溢出者）
  const overflowEls = [...document.querySelectorAll("*")].filter((el) => {
    const s = getComputedStyle(el);
    const oy = s.overflowY;
    return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
  });
  const se = document.scrollingElement;
  const pageScroll = se ? se.scrollHeight > se.clientHeight + 1 : false;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const dpr = window.devicePixelRatio;
  // dock 整块贴底可见（底边 ≤ 视口高）
  const composerVisible = stickyBottoms.filter((b) => typeof b === "number").every((b) => b <= vh + 1);

  return {
    foundEmbed,
    tabCount: labels.length,
    vw,
    vh,
    dpr,
    panelSpread: spread(panelHeights),
    stickyTopSpread: spread(stickyTops),
    stickyBottomSpread: spread(stickyBottoms),
    rightToolsSpread: spread(rightToolsTops),
    scrollContainerCount: overflowEls.length,
    pageScroll,
    composerVisible,
    btnBad,
    // V192：快捷侧等价字段（与批量侧同强度；模块切换断言必设）
    quickFoundCanvas: quickBefore.foundCanvas,
    quickComposerVisible: quickBefore.composerVisible,
    quickComposerBottom: quickBefore.composerBottom,
    quickRightToolsSpread: spread([quickBefore.rightToolsTop, quickAfter.rightToolsTop]),
    quickBtnBad: (quickBefore.btn && (quickBefore.btn.hidden || !quickBefore.btn.inViewport || quickBefore.btn.covered)) ? 1 : 0,
    switchBackCanvasVisible: canvasVisible
  };
}
