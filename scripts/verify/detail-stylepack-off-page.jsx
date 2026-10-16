// 浏览器侧探针：详情页「视觉风格包 — 关闭视觉风格(off)」选项实测。
// 由 detail-stylepack-off-browser-check.mjs 通过 tabbit 驱动，两个阶段：
//   run()     —— 进详情页 → v1 默认下拉禁用 → 切 v2 → 选「关闭视觉风格」→ 保存预设
//   verify()  —— 刷新后进详情页 → 加载预设（经 normalizeDetailSettings :289 闸门）→
//                stylePackId 仍为 off；切回 v1 下拉禁用；再切 v2 仍 off
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

  function setSelectValue(select, value) {
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  const facts = { error: "" };
  try {
    await wait(900);
    await navToDetail();
    await wait(600);

    const versionSelect = findSelectByLabel("Skill 版本");
    const packSelect = findSelectByLabel("视觉风格包");
    facts.foundBothSelects = Boolean(versionSelect && packSelect);
    if (!facts.foundBothSelects) {
      facts.error = "未找到 Skill 版本 / 视觉风格包 下拉";
      return facts;
    }

    // 1) 默认 v1：视觉风格包下拉禁用（行为不变）
    facts.v1DefaultDisabled = packSelect.disabled === true;

    // 2) 切到 v2：下拉可用，且出现「关闭视觉风格」选项
    setSelectValue(versionSelect, "v2");
    await wait(400);
    facts.v2Enabled = packSelect.disabled === false;
    facts.offOption = [...packSelect.options].some((o) => o.value === "off" && o.text.includes("关闭视觉风格"));
    facts.optionCount = packSelect.options.length; // 期望 10（auto + off + S1–S8）

    // 3) 选「关闭视觉风格」
    setSelectValue(packSelect, "off");
    await wait(400);
    facts.offSelected = packSelect.value === "off";

    // 4) 保存预设（settings 含 stylePackId:"off"，localStorage 持久化）
    const saveBtn = [...document.querySelectorAll(".detailPresetRow button")].find((b) => b.textContent.includes("保存预设"));
    if (saveBtn) saveBtn.click();
    await wait(500);
    facts.presetSaved = Object.keys(localStorage).some((key) => {
      try { return JSON.stringify(JSON.parse(localStorage.getItem(key))).includes('"stylePackId":"off"'); }
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

  function setSelectValue(select, value) {
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  const facts = { error: "" };
  try {
    await wait(900);
    await navToDetail();
    await wait(600);

    // 刷新后 settings 回默认（v1/auto）；打开「加载预设」弹窗，加载刚保存的 off 预设
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

    const versionSelect = findSelectByLabel("Skill 版本");
    const packSelect = findSelectByLabel("视觉风格包");
    facts.foundBothSelects = Boolean(versionSelect && packSelect);
    if (!facts.foundBothSelects) {
      facts.error = "加载预设后未找到下拉";
      return facts;
    }

    // 5) 持久化：预设回载后 stylePackId 仍为 off（未被 :289 回落 auto），版本随预设回 v2
    facts.afterLoadStylePackId = packSelect.value;
    facts.afterLoadVersion = versionSelect.value;
    facts.afterLoadEnabled = packSelect.disabled === false;

    // 6) 切回 v1：视觉风格包下拉仍禁用
    setSelectValue(versionSelect, "v1");
    await wait(400);
    facts.v1DisabledAfterOff = packSelect.disabled === true;

    // 7) 再切回 v2：off 选择仍在
    setSelectValue(versionSelect, "v2");
    await wait(400);
    facts.stillOffAfterToggle = packSelect.value === "off" && packSelect.disabled === false;
  } catch (error) {
    facts.error = error instanceof Error ? error.message : String(error);
  }
  return facts;
}
