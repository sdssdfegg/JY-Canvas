// server/features/detail-studio/intake/mode-c.js
// 模式 C（完整提示词直接生成）纯函数：提示词整理与差异计算。
//
// 零依赖：不 import 任何 AI / planner / 模型链路，也不依赖 store，便于单测与前端复用同一口径。
// 模式 C 四条边界（见执行单 §3）：
//   - rawPrompt   只读：用户首次粘贴的完整提示词，落库后不可改。
//   - tidyVersion 可选，默认关闭：对 rawPrompt 做确定性规范化得到的「整理版」，生成可二选一。
//   - diff        可看可改：rawPrompt 与 tidyVersion 的行级差异，供用户在 UI 上核对整理结果。
//   - frozenPrompt 仅用户确认后写入：生成只认这一份，保证「所见即所生成」。

const MODE_C_TEXT_LIMIT = 60000;

function splitLines(text) {
  return String(text || "").split(/\r?\n/);
}

// 确定性整理：去首尾空白、合并连续空行、保留段落间隔、收尾去空行。
// 不做任何语义改写（那属于 AI 策划），只做排版归一，结果稳定可复现。
//
// P2 待补（本阶段不做）：分屏边界识别。当前 tidyPrompt 只做「纯排版归一」，
// 不识别「一屏 / 一镜」之间的边界（如空行分隔、序号标记、// 屏 N 等约定）。
// 后续若需让整理版在分屏处做结构对齐或边界标注，应在此函数内追加边界识别分支，
// 且必须保持「确定性、可复现、不改用户原意」三条不变式，并同步更新 computePromptDiff 的口径。
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

// 整理一次并算差异，供 /intake/mode-c/parse 端点返回。
export function parseModeCTidy(rawPrompt = "") {
  const tidy = tidyPrompt(rawPrompt);
  const diff = computePromptDiff(rawPrompt, tidy);
  return { rawPrompt: String(rawPrompt || "").slice(0, MODE_C_TEXT_LIMIT), tidyVersion: tidy, diff };
}
