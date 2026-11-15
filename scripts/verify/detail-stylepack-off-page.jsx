// 浏览器侧探针（V216-R2 改写）：详情页「Skill 版本 / 视觉风格包」两下拉已摘除的实测。
// 由 detail-stylepack-off-browser-check.mjs 通过 tabbit 驱动，两个阶段：
//   run()     —— 进详情页 → 断言两下拉确实不存在 → 用「输出语种(lang)」改值 → 保存预设
//   verify()  —— 刷新后进详情页 → 加载预设 → lang 回载持久化；再断一次两下拉仍不存在
// 只动页面状态与 localStorage 预设（隔离 origin），不生成、不扣费。

export async function run() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function navToDetail() {
    if (!document.querySelector(".detailWorkbench")) {
      const nav = [...document.querySelectorAll(".navItem")].find((btn) => btn.textContent.includes("一键详情"));
      if (nav) nav.click();
    }
    for (let i = 0; i < 40 && !document.querySelector(".detailWorkbench"); i += 1) await wait(150);
  }

  function findSelectByLabel(labelText) {
    const label = [...document.querySelectorAll("label")].find((el) => {
      const span = el.querySelector("span");
      return span && span.textContent.trim() === labelText;
    });
    return label ? label.querySelector("select") : null;
  }

  const facts = { error: "" };
  try {
    await wait(900);
    await navToDetail();
    await wait(600);

    // 1) 两下拉应已摘除（Skill 版本 / 视觉风格包 都不存在）
    facts.versionSelectGone = findSelectByLabel("Skill 版本") === null;
    facts.packSelectGone = findSelectByLabel("视觉风格包") === null;
    facts.bothSelectsRemoved = facts.versionSelectGone && facts.packSelectGone;

    // 2) 基础参数项仍完整：输出语种(lang) 输入仍在，用于后续持久化验证
    const langInput = [...document.querySelectorAll("label")].find((el) => {
      const span = el.querySelector("span");
      return span && span.textContent.trim() === "输出语种";
    })?.querySelector("input");
    facts.foundLangInput = Boolean(langInput);
    if (!facts.foundLangInput) {
      facts.error = "未找到输出语种输入框（参数区结构异常）";
      return facts;
    }

    // 3) 用 lang 改值触发 settings 变更（setter 走 React 受控输入）
    const testLang = "R2-persist-" + Date.now().toString(36);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(langInput, testLang);
    langInput.dispatchEvent(new Event("change", { bubbles: true }));
    langInput.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(400);
    facts.langChanged = langInput.value === testLang;
    facts.testLang = testLang;

    // 4) 保存预设（settings 含新 lang，localStorage 持久化）
    const saveBtn = [...document.querySelectorAll(".detailPresetRow button")].find((b) => b.textContent.includes("保存预设"));
    if (saveBtn) saveBtn.click();
    await wait(500);
    facts.presetSaved = Object.keys(localStorage).some((key) => {
      try { return JSON.stringify(JSON.parse(localStorage.getItem(key))).includes(`"lang":"${testLang}"`); }
      catch { return false; }
    });
  } catch (error) {
    facts.error = error instanceof Error ? error.message : String(error);
  }
  return facts;
}

export async function verify() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function navToDetail() {
    if (!document.querySelector(".detailWorkbench")) {
      const nav = [...document.querySelectorAll(".navItem")].find((btn) => btn.textContent.includes("一键详情"));
      if (nav) nav.click();
    }
    for (let i = 0; i < 40 && !document.querySelector(".detailWorkbench"); i += 1) await wait(150);
  }

  function findSelectByLabel(labelText) {
    const label = [...document.querySelectorAll("label")].find((el) => {
      const span = el.querySelector("span");
      return span && span.textContent.trim() === labelText;
    });
    return label ? label.querySelector("select") : null;
  }

  const facts = { error: "" };
  try {
    await wait(900);
    await navToDetail();
    await wait(600);

    // 刷新后 settings 回默认；打开「加载预设」弹窗，加载刚保存的带新 lang 的预设
    const loadBtn = [...document.querySelectorAll(".detailPresetRow button")].find((b) => b.textContent.includes("加载预设"));
    facts.foundLoadButton = Boolean(loadBtn);
    if (!loadBtn) {
      facts.error = "未找到「加载预设」按钮";
      return facts;
    }
    loadBtn.click();
    await wait(500);
    const items = document.querySelectorAll(".detailPresetItem");
    facts.presetItemCount = items.length;
    if (items.length === 0) {
      facts.error = "预设列表为空（保存未持久化？）";
      return facts;
    }
    const firstLoadBtn = items[0].querySelector("button");
    if (firstLoadBtn) firstLoadBtn.click();
    await wait(600);

    const langInput = [...document.querySelectorAll("label")].find((el) => {
      const span = el.querySelector("span");
      return span && span.textContent.trim() === "输出语种";
    })?.querySelector("input");
    facts.foundLangInputAfterReload = Boolean(langInput);
    if (!facts.foundLangInputAfterReload) {
      facts.error = "加载预设后未找到输出语种输入框";
      return facts;
    }

    // 5) 持久化：预设回载后 lang 仍为 run 阶段设的值（预设保存/回载链未断）
    facts.afterLoadLang = langInput.value;

    // 6) 加载预设后两下拉仍不应出现
    facts.versionStillGone = findSelectByLabel("Skill 版本") === null;
    facts.packStillGone = findSelectByLabel("视觉风格包") === null;
    facts.bothSelectsStillRemoved = facts.versionStillGone && facts.packStillGone;

    // 7) 网格列对齐未破：基础参数区仍是两列布局，参数项数量回落到 13（两下拉已摘除）
    const paramGrid = document.querySelector(".detailParamGrid");
    facts.paramGridExists = Boolean(paramGrid);
    facts.labelCount = paramGrid ? paramGrid.querySelectorAll(":scope > label").length : -1;
  } catch (error) {
    facts.error = error instanceof Error ? error.message : String(error);
  }
  return facts;
}
