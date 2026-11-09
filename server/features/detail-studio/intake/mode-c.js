// server/features/detail-studio/intake/mode-c.js
// 模式 C（完整提示词直接生成）纯函数：提示词整理、分屏边界识别与差异计算。
//
// 零依赖：不 import 任何 AI / planner / 模型链路，也不依赖 store，便于单测与前端复用同一口径。
// 模式 C 四条边界（见执行单 §3）：
//   - rawPrompt   只读：用户首次粘贴的完整提示词，落库后不可改。
//   - tidyVersion 可选，默认关闭：对 rawPrompt 做确定性规范化得到的「整理版」，生成可二选一。
//   - diff        可看可改：rawPrompt 与 tidyVersion 的行级差异，供用户在 UI 上核对整理结果。
//   - frozenPrompt 仅用户确认后写入：生成只认这一份，保证「所见即所生成」。
// 分屏边界识别（splitIntoScreens，见下方）：阶段 2「解析」范畴，只识别不生成；批量生成留阶段 4。

const MODE_C_TEXT_LIMIT = 60000;

function splitLines(text) {
  return String(text || "").split(/\r?\n/);
}

// 确定性整理：去首尾空白、合并连续空行、保留段落间隔、收尾去空行。
// 不做任何语义改写（那属于 AI 策划），只做排版归一，结果稳定可复现。
// 三条不变式（阶段 2 口径）：确定性、可复现、不改用户原意。
//
// 分屏边界识别（阶段 2 解析范畴，属「识别」不属「生成」；批量生成留阶段 4）：
// 见下方 splitIntoScreens —— 纯函数，按「空行 / 序号 / /// 屏 N」等约定切出 screens[]，
// 原文不改、不调 AI、不 import planner，结果仅用于向用户展示屏结构与后续切独立任务。
export function tidyPrompt(rawPrompt = "") {
  const lines = splitLines(rawPrompt).map((line) => line.replace(/^\s+/, "").replace(/\s+$/, ""));
  const out = [];
  let prevBlank = false;
  for (const line of lines) {
    const blank = line.length === 0;
    if (blank) {
      if (prevBlank) continue; // 合并连续空行
      out.push("");
      prevBlank = true;
    } else {
      out.push(line);
      prevBlank = false;
    }
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  while (out.length && out[0] === "") out.shift();
  return out.join("\n").slice(0, MODE_C_TEXT_LIMIT);
}

// 行级 LCS 差异：返回逐行 diff 与汇总计数。
// type: "equal" | "add" | "remove" | "change"（change 在相邻 remove/add 归并时可选，这里保留原始 add/remove 以保真）。
export function computePromptDiff(rawPrompt = "", tidyPromptText = "") {
  const a = splitLines(rawPrompt);
  const b = splitLines(tidyPromptText);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS 长度(a[i..], b[j..])
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: "equal", raw: a[i], tidy: b[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "remove", raw: a[i], tidy: null });
      i++;
    } else {
      lines.push({ type: "add", raw: null, tidy: b[j] });
      j++;
    }
  }
  while (i < n) {
    lines.push({ type: "remove", raw: a[i], tidy: null });
    i++;
  }
  while (j < m) {
    lines.push({ type: "add", raw: null, tidy: b[j] });
    j++;
  }

  let add = 0;
  let remove = 0;
  let equal = 0;
  for (const line of lines) {
    if (line.type === "add") add++;
    else if (line.type === "remove") remove++;
    else equal++;
  }
  return { lines, summary: { add, remove, equal } };
}

// ── 分屏边界识别（阶段 2 · 解析范畴，纯函数）──
// 按约定识别「一屏 / 一镜」边界并切成独立 screens[]；原文不改、不调 AI、不 import planner。
// 约定优先级（按行扫描、确定性）：
//   1) 显式标记：行首 `// 屏 N` / `/// 屏幕 N` / `/// screen 2`（/ 或全角 ／，N 为数字或中文数字），
//      整行作为该屏标题，其下内容归此屏（标记行本身不计入 lines）。
//   2) 序号标题：行首 `N.` / `N、` / `N：` / `N:`（N 为正整数）且后接非空文本，作为该屏起始
//      （序号与首行一并计入该屏 lines，title 取去序号后的文本）。
//   3) 空行：一个空行结束上一屏，下一非空行起新屏（多屏提示词常见「屏间空行」约定）。
// 返回 [{ index, number, title, lines, raw }]：number 为识别到的屏号（无则 null），raw 为该屏原文字节串。
// 注意：tidyPrompt 会合并空行，故 tidy 版切出的屏数可能少于原文——属「结构差异」，由 parseModeCTidy 一并
//       返回供 UI 提示（让用户知晓以整理版生成时屏边界会变）。
const SCREEN_MARKER_RE = /^\s*[/／]{2,}\s*(?:屏|屏幕|screen)\s*(\d+|[零一二三四五六七八九十百]+)(?=\s|$)\s*(.*)$/i;
const SCREEN_HEADING_RE = /^\s*(\d{1,3})[.、．:：)）]\s+\S/;
const SCREEN_HEADING_STRIP_RE = /^\s*\d{1,3}[.、．:：)）]\s*/;

function parseScreenNumber(token) {
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  const zh = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100 };
  let value = 0;
  for (const ch of String(token)) value = value * 10 + (zh[ch] != null ? zh[ch] : 0);
  return value || null;
}

function detectScreenMeta(line) {
  const marker = SCREEN_MARKER_RE.exec(line);
  if (marker) {
    return { kind: "marker", number: parseScreenNumber(marker[1]), title: String(marker[2] || "").trim() };
  }
  const heading = SCREEN_HEADING_RE.exec(line);
  if (heading) {
    return { kind: "heading", number: parseInt(heading[1], 10), title: line.replace(SCREEN_HEADING_STRIP_RE, "").trim() };
  }
  return null;
}

function finalizeScreen(screen) {
  screen.raw = screen.lines.join("\n");
  return screen;
}

export function splitIntoScreens(rawPrompt = "") {
  const lines = splitLines(rawPrompt);
  const screens = [];
  let current = null;

  function startScreen(meta, firstLine) {
    current = { index: screens.length + 1, number: meta ? meta.number : null, title: meta ? meta.title : "", lines: [] };
    if (firstLine != null) current.lines.push(firstLine);
  }

  for (const line of lines) {
    const meta = detectScreenMeta(line);
    const isBlank = line.trim().length === 0;
    if (meta && (meta.kind === "marker" || meta.kind === "heading")) {
      if (current) screens.push(finalizeScreen(current));
      startScreen(meta, meta.kind === "marker" ? null : line);
    } else if (isBlank) {
      if (current) {
        screens.push(finalizeScreen(current));
        current = null;
      }
    } else if (current) {
      current.lines.push(line);
    } else {
      startScreen(null, line);
    }
  }
  if (current) screens.push(finalizeScreen(current));

  const result = screens.filter((s) => s.lines.length > 0);
  result.forEach((s, i) => { s.index = i + 1; });
  return result;
}

// 整理一次并算差异，供 /intake/mode-c/parse 端点返回。
// 额外返回 screens（基于原文切分，生成切独立任务用）+ tidyScreens/structure（结构差异提示用）。
export function parseModeCTidy(rawPrompt = "") {
  const tidy = tidyPrompt(rawPrompt);
  const diff = computePromptDiff(rawPrompt, tidy);
  const screens = splitIntoScreens(rawPrompt);
  const tidyScreens = splitIntoScreens(tidy);
  const rawScreenCount = screens.length;
  const tidyScreenCount = tidyScreens.length;
  return {
    rawPrompt: String(rawPrompt || "").slice(0, MODE_C_TEXT_LIMIT),
    tidyVersion: tidy,
    diff,
    screens,
    tidyScreens,
    structure: { rawScreenCount, tidyScreenCount, boundaryShift: rawScreenCount !== tidyScreenCount }
  };
}
