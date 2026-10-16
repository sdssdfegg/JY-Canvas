// 批量生成底栏高度一致性探针（真实浏览器，不打上游、不扣费）。
//
// 验收核心（执行单 F §4.2 / §4.3）：
//   1. 依次切换到各生图板块（换装 / 固定背景 / 随机背景 / 批量扩图 / 精修），再新建一个临时需求页，
//      逐页量 .rightTools 顶部的 getBoundingClientRect().top，断言各页差 ≤ 2px；
//   2. 切换过程中不再出现「已切换到「X」」提示（composerStatus 应为空占位）。
//
// 探针只读取真实 DOM 状态，不触发真实生成、不动上传、不写 history.json。
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function nameOf(tab) {
  const span = tab.querySelector("span:last-child");
  return span ? span.textContent.trim() : (tab.textContent || "").trim();
}

function relativeProbe() {
  const facts = {};
  const embed = document.querySelector(".outfitWorkflowEmbedded");
  facts.foundEmbed = Boolean(embed);

  const navBatch = [...document.querySelectorAll("button.navItem")]
    .find((n) => (n.textContent || "").includes("批量生成"));
  facts.navBatchClicked = Boolean(navBatch);
  if (navBatch) { navBatch.click(); }

  const clickTabByLabel = (label) => {
    const tab = [...document.querySelectorAll(".outfitPageTab")]
      .find((t) => nameOf(t) === label);
    if (!tab) return false;
    tab.click();
    return true;
  };
  const measure = () => {
    const rt = document.querySelector(".composerStickyControls .rightTools");
    const sc = document.querySelector(".composerStickyControls");
    const cs = document.querySelector(".composerStickyControls .composerStatus");
    const ib = document.querySelector(".composerStickyControls .outfitIntentBar");
    return {
      rightToolsTop: rt ? Math.round(rt.getBoundingClientRect().top) : null,
      stickyTop: sc ? Math.round(sc.getBoundingClientRect().top) : null,
      statusText: cs ? (cs.textContent || "").trim() : null,
      statusPlaceholder: cs ? cs.classList.contains("composerStatus--placeholder") : null,
      intentPlaceholder: ib ? ib.classList.contains("outfitIntentBar--placeholder") : null
    };
  };

  facts.pages = {};
  facts.switchToastSeen = false;
  const labels = ["换装", "固定背景", "随机背景", "批量扩图", "精修"];
  return { clickTabByLabel, measure, labels, facts };
}

export async function run() {
  const ctx = relativeProbe();
  const { clickTabByLabel, measure, labels, facts } = ctx;
  await wait(900);
  // 进入批量生成后，.outfitWorkflowEmbedded 才挂载到 DOM（首屏是落地页），故在此处再判。
  facts.foundEmbed = Boolean(document.querySelector(".outfitWorkflowEmbedded"));
  for (const label of labels) {
    const ok = clickTabByLabel(label);
    facts.pages[label] = { tabFound: ok };
    if (ok) {
      await wait(450);
      const m = measure();
      facts.pages[label].measure = m;
      if (m.statusText && m.statusText.includes("已切换到")) facts.switchToastSeen = true;
    }
  }

  // 新建临时需求页（"+" 按钮）
  const addBtn = document.querySelector(".outfitPageAdd");
  facts.addBtnFound = Boolean(addBtn);
  if (addBtn) {
    addBtn.click();
    await wait(450);
    const m = measure();
    facts.tempPage = m;
    const activeTab = document.querySelector(".outfitPageTab.active");
    facts.tempPageLabel = activeTab ? nameOf(activeTab) : null;
    if (m.statusText && m.statusText.includes("已切换到")) facts.switchToastSeen = true;
  }

  // 收集所有成功量到的 rightTools 顶部位，供外层算极差
  const tops = [];
  for (const label of labels) {
    const m = facts.pages[label]?.measure;
    if (m && typeof m.rightToolsTop === "number") tops.push(m.rightToolsTop);
  }
  if (facts.tempPage && typeof facts.tempPage.rightToolsTop === "number") tops.push(facts.tempPage.rightToolsTop);
  facts.rightToolsTops = tops;
  return facts;
}
