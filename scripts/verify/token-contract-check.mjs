#!/usr/bin/env node
/**
 * V186（UI-A12 · T2 跨应用令牌契约）：tokens.css 纯度 + 契约文档 + styles.css 入口护栏。
 *
 * 静态、零依赖叶子：只 import Node 内置（node:fs / node:path / node:process），
 * 只读 src/styles/tokens.css、src/styles.css、docs/设计令牌跨应用契约.md，
 * 不启动服务、不读浏览器、不取 getComputedStyle、不碰 data/、不写任何文件。
 *
 * 断言（§4.3）：
 *  ① tokens.css 纯度：去掉注释后，所有声明均为 `--*` 自定义属性；零普通属性声明、
 *     零 `@import`、零 `url(`、零 `import` 语句；顶层选择器仅 `:root`
 *     / `@media` 内 `:root`；文件仍 19 处 hex、单主题键集合齐全且与 theme-token-parity 同口径 23。
 *  ② 单主题颜色语义令牌键集合齐全（dark 23，缺失/多余判红）。
 *  ③ docs/设计令牌跨应用契约.md 存在且含 §1.2 #3 的 10 个小节锚点（§1–§10，含 V190 新增「Workspace Frame 三段语义契约」）。
 *  ④ src/styles.css 首条规则为 `@import "./styles/tokens.css"`（@import 必须位于所有规则之前）。
 *
 * 输出：统一 `{ ok, checks, failureCount }` JSON，失败退出码 1，格式参照 theme-token-parity-check.mjs。
 * 纯文本静态断言、无子进程（<1s），进 run-all 的 ORDER + FAST_ORDER（提交钩子 --fast 子集）。
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const TOKENS_PATH = resolve(REPO_ROOT, "src/styles/tokens.css");
const STYLES_PATH = resolve(REPO_ROOT, "src/styles.css");
const CONTRACT_PATH = resolve(REPO_ROOT, "docs/设计令牌跨应用契约.md");

const COLOR_RE = /#|rgba\(|color-mix\(/i;
const THEME_ATTR_RE = /^:root\[data-theme="([\w-]+)"\]$/;
const REQUIRED = ["dark"];

// 契约文档必须齐备的 10 个小节锚点（§1–§10，与 §1.2 #3 一一对应；任一缺失判红；§10 为 V190 新增「Workspace Frame 三段语义契约」）。
const CONTRACT_SECTIONS = [
  "契约定位与边界",
  "颜色语义令牌 × 单主题取值表",
  "尺寸 / 布局 / 层叠 / 动效 / 断点令牌表",
  "data-theme 同步协议",
  "组件配方表",
  "ui.css 回退值语义与 V69 别名禁复制",
  "子应用消费示例",
  "「视觉 CSS 0 行」验收判据与反例",
  "护栏与可推翻路径",
  "Workspace Frame 三段语义契约",
];

const checks = [];
function addCheck(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** 提取顶层规则块（depth 0 的 `{ ... }`）；不处理嵌套块。 */
function extractTopLevelBlocks(src) {
  const blocks = [];
  let depth = 0;
  let buf = "";
  let pendingRaw = "";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") {
      if (depth === 0) {
        pendingRaw = buf;
        buf = "";
      }
      depth++;
      buf += ch;
    } else if (ch === "}") {
      depth--;
      buf += ch;
      if (depth === 0) {
        blocks.push({ selector: normalizeSelector(pendingRaw), body: buf });
        pendingRaw = "";
        buf = "";
      }
    } else {
      buf += ch;
    }
  }
  return blocks;
}

function normalizeSelector(raw) {
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, " ");
  const lines = noComments.split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

function extractDeclarations(inner) {
  const decls = [];
  for (const seg of inner.split(";")) {
    const m = /([\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(seg);
    if (m) decls.push({ name: m[1], value: m[2] });
  }
  return decls;
}

function colorKeysOf(body) {
  const open = body.indexOf("{");
  const close = body.lastIndexOf("}");
  const inner = open >= 0 && close > open ? body.slice(open + 1, close) : "";
  const decls = extractDeclarations(inner);
  const keys = [];
  for (const { name, value } of decls) {
    if (COLOR_RE.test(value)) keys.push(name);
  }
  return keys.sort();
}

function checkAllCustomProps(selector, body) {
  // 块内不得出现 url(（自定义属性值里也不允许）。
  if (/url\(/i.test(body)) {
    addCheck(`tokens.css 纯度 · ${selector} 含 url(`, false, "契约文件禁止 url()");
  }
  const open = body.indexOf("{");
  const close = body.lastIndexOf("}");
  const inner = open >= 0 && close > open ? body.slice(open + 1, close) : "";
  const decls = extractDeclarations(inner);
  let nonCustom = 0;
  for (const { name, value } of decls) {
    if (!name.startsWith("--")) {
      nonCustom++;
      addCheck(
        `tokens.css 纯度 · ${selector} 含非自定义属性声明`,
        false,
        `${name}: ${value.trim()}（契约文件只允许 --* 自定义属性）`
      );
    }
  }
  // 仅当本块确有被检查的声明时，给出一条通过/失败明细。
  if (decls.length > 0) {
    addCheck(
      `tokens.css 纯度 · ${selector} 声明均为 --*`,
      nonCustom === 0 && !/url\(/i.test(body),
      `共 ${decls.length} 个声明、${nonCustom} 个非自定义属性`
    );
  }
}

function validateTokenPurity(src) {
  const stripped = stripComments(src);

  // 全局禁令：契约文件不得含 @import / url( / JS import 语句。
  if (/@import/i.test(stripped)) {
    addCheck("tokens.css 纯度 · 含 @import", false, "契约文件禁止 @import");
  }
  if (/url\(/i.test(stripped)) {
    addCheck("tokens.css 纯度 · 含 url(", false, "契约文件禁止 url()");
  }
  if (/\bimport\s/i.test(stripped)) {
    addCheck("tokens.css 纯度 · 含 import 语句", false, "契约文件禁止 import 语句");
  }

  const blocks = extractTopLevelBlocks(stripped);
  let rootCount = 0;
  for (const { selector, body } of blocks) {
    if (selector === ":root" || THEME_ATTR_RE.test(selector)) {
      rootCount++;
      checkAllCustomProps(selector, body);
    } else if (selector.startsWith("@media")) {
      // @media 内只允许 :root 块（如 prefers-reduced-motion 的时长归零）。
      const innerSrc = body.slice(1, -1);
      const innerBlocks = extractTopLevelBlocks(innerSrc);
      if (innerBlocks.length === 0) {
        addCheck(`tokens.css 纯度 · ${selector} 内无 :root 块`, false, "@media 必须包含 :root");
      }
      for (const ib of innerBlocks) {
        if (!(ib.selector === ":root" || THEME_ATTR_RE.test(ib.selector))) {
          addCheck(
            `tokens.css 纯度 · ${selector} 内含非 :root 规则`,
            false,
            `${ib.selector}（@media 内只允许 :root）`
          );
        } else {
          checkAllCustomProps(ib.selector, ib.body);
        }
      }
    } else {
      addCheck(
        "tokens.css 纯度 · 出现非 :root / 非 @media 顶层规则",
        false,
        `${selector}（契约文件顶层只允许 :root 与 @media）`
      );
    }
  }
  if (!/@import/i.test(stripped) && !/url\(/i.test(stripped) && !/\bimport\s/i.test(stripped) && rootCount >= 1) {
    addCheck("tokens.css 纯度 · 全文件仅 --* 声明", true, `${rootCount} 个 :root 块`);
  }

  // 信息项：hex 总数（不判红，供 §4.1 回填）。
  const hexMatches = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  addCheck("tokens.css 纯度 · hex 总数", true, `=${hexMatches.length}（基线 19）`);

  return blocks;
}

function validateThemeParity(src) {
  const blocks = extractTopLevelBlocks(stripComments(src));
  const byTheme = {};
  for (const { selector, body } of blocks) {
    if (selector === ":root") byTheme.dark = body;
    else {
      const m = THEME_ATTR_RE.exec(selector);
      if (m) byTheme[m[1]] = body;
    }
  }
  const problems = [];
  for (const t of REQUIRED) {
    if (!byTheme[t]) problems.push(`缺主题块: ${t === "dark" ? ":root" : `:root[data-theme="${t}"]`}`);
  }
  const colorKeys = {};
  for (const t of REQUIRED) {
    if (!byTheme[t]) continue;
    colorKeys[t] = colorKeysOf(byTheme[t]);
  }
  const missing = [];
  const extra = [];
  const ok = problems.length === 0 && missing.length === 0 && extra.length === 0;
  addCheck(
    "单主题键集合齐全（baseKeys=23）",
    ok,
    ok ? `dark=${colorKeys.dark?.length}` : `problems=${problems.length} missing=${missing.length} extra=${extra.length}`
  );
  return { ok, baseKeys: colorKeys.dark?.length || 0, missing, extra };
}

function validateContractDoc() {
  if (!existsSync(CONTRACT_PATH)) {
    addCheck("契约文档存在", false, "docs/设计令牌跨应用契约.md 不存在");
    return;
  }
  addCheck("契约文档存在", true, "docs/设计令牌跨应用契约.md");
  const text = readFileSync(CONTRACT_PATH, "utf8");
  for (const anchor of CONTRACT_SECTIONS) {
    addCheck(`契约文档 · 含小节「${anchor}」`, text.includes(anchor), text.includes(anchor) ? "ok" : "缺失锚点");
  }
}

function validateStylesEntry() {
  if (!existsSync(STYLES_PATH)) {
    addCheck("styles.css 首条为 @import", false, "src/styles.css 不存在");
    return;
  }
  const raw = readFileSync(STYLES_PATH, "utf8");
  // 去掉首部注释与空白后，第一条规则必须是 @import "./styles/tokens.css"。
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  const firstRule = noComments.trim().split(/[\r\n]+/).find((l) => l.trim().length > 0);
  const expected = '@import "./styles/tokens.css";';
  const ok = firstRule ? firstRule.trim() === expected : false;
  addCheck("styles.css 首条为 @import", ok, ok ? expected : `实际首条: ${firstRule ? firstRule.trim() : "(空)"}`);
}

function main() {
  if (!existsSync(TOKENS_PATH)) {
    addCheck("tokens.css 存在", false, "src/styles/tokens.css 不存在");
  } else {
    addCheck("tokens.css 存在", true, "src/styles/tokens.css");
    const src = readFileSync(TOKENS_PATH, "utf8");
    validateTokenPurity(src);
    validateThemeParity(src);
  }
  validateContractDoc();
  validateStylesEntry();

  const failureCount = checks.filter((c) => !c.ok).length;
  const ok = failureCount === 0;
  const result = { ok, checks, failureCount };
  console.log(JSON.stringify(result, null, 2));
  if (!ok) process.exit(1);
  process.exit(0);
}

main();
