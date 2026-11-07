#!/usr/bin/env node
/**
 * V178（UI-A4 · T1-b2 前置段）：四主题语义令牌覆盖护栏。
 *
 * 静态、零依赖叶子：只 import Node 内置（node:fs / node:path / node:process），
 * 只读 src/styles/tokens.css，不启动服务、不读浏览器、不取 getComputedStyle、
 * 不碰 data/、不写任何文件、不扫 .jsx 内联 style、不扫其它 CSS。
 *
 * 断言：
 *  ① 四个主题块（:root 默认暗色 + jade / graphite / mist 三套浅色）都解析到；
 *  ② 以 :root 的颜色语义令牌键集合为基准，三套浅色块键集合逐字一致
 *     （缺一键 / 多一键都判红，输出 missing / extra 明细）；
 *  ③ 每个颜色令牌值非空、非 var() 自引用。
 *
 * 颜色语义令牌判据：值中含 `#` 或 `rgba(` 或 `color-mix(`。
 * 尺寸 / 层级 / 动效 / 断点类令牌值不含上述记号，天然排除，不硬编码白名单。
 *
 * 注意：本脚本只覆盖「令牌键集合是否齐全」，不覆盖「配色是否正确 / 是否好看」。
 * 配色的最终闸门仍是换装/设置页 4 主题 A/B 截图 + Owner 目视。
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exit } from "node:process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const TOKENS_PATH = resolve(REPO_ROOT, "src/styles/tokens.css");

const COLOR_RE = /#|rgba\(|color-mix\(/i;
const THEME_ATTR_RE = /^:root\[data-theme="([\w-]+)"\]$/;
const REQUIRED = ["dark", "jade", "graphite", "mist"];

/**
 * 提取顶层规则块（depth 0 的 `{ ... }`）。
 * 不处理嵌套块：`@media` 内的 `:root` 不会被单独拆出，其选择器不会命中下面
 * 的 `:root` / `:root[data-theme=...]` 匹配，从而被安全忽略。
 */
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

/**
 * 把「上一块结束到本块 `{` 之间的原文」规整成选择器：
 * 去掉块注释与空白，取最后一行非空文本（跨 token 引用 / 前置注释不影响判定）。
 */
function normalizeSelector(raw) {
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, " ");
  const lines = noComments.split("\n").map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractDeclarations(inner) {
  const tokens = new Map();
  for (const seg of inner.split(";")) {
    const m = /(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(seg);
    if (m && !tokens.has(m[1])) tokens.set(m[1], m[2]);
  }
  return tokens;
}

function colorKeysOf(body) {
  const open = body.indexOf("{");
  const close = body.lastIndexOf("}");
  const inner = open >= 0 && close > open ? body.slice(open + 1, close) : "";
  const tokens = extractDeclarations(inner);
  const keys = [];
  for (const [name, value] of tokens) {
    if (COLOR_RE.test(value)) keys.push(name);
  }
  return keys.sort();
}

function main() {
  const src = readFileSync(TOKENS_PATH, "utf8");
  const blocks = extractTopLevelBlocks(src);
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
    if (!byTheme[t]) {
      problems.push(
        `缺主题块: ${t === "dark" ? ":root" : `:root[data-theme="${t}"]`}`
      );
    }
  }

  const colorKeys = {};
  for (const t of REQUIRED) {
    if (!byTheme[t]) continue;
    const keys = colorKeysOf(byTheme[t]);
    colorKeys[t] = keys;
    const open = byTheme[t].indexOf("{");
    const close = byTheme[t].lastIndexOf("}");
    const inner = open >= 0 && close > open ? byTheme[t].slice(open + 1, close) : "";
    const tokens = extractDeclarations(inner);
    for (const name of keys) {
      const value = (tokens.get(name) || "").trim();
      if (!value) {
        problems.push(`${t} 的颜色令牌 ${name} 值为空`);
      } else if (new RegExp(`^var\\(\\s*--${escapeRegex(name)}\\s*\\)$`, "i").test(value)) {
        problems.push(`${t} 的颜色令牌 ${name} 自引用 var(${name})`);
      }
    }
  }

  const result = { ok: true, baseKeys: 0, themes: {}, missing: [], extra: [] };
  if (colorKeys.dark) {
    result.baseKeys = colorKeys.dark.length;
    const base = new Set(colorKeys.dark);
    for (const t of ["jade", "graphite", "mist"]) {
      if (!colorKeys[t]) continue;
      result.themes[t] = colorKeys[t].length;
      const set = new Set(colorKeys[t]);
      for (const k of base) if (!set.has(k)) result.missing.push(`${t}:${k}`);
      for (const k of set) if (!base.has(k)) result.extra.push(`${t}:${k}`);
    }
  }
  result.themes.dark = colorKeys.dark ? colorKeys.dark.length : 0;

  if (problems.length || result.missing.length || result.extra.length) {
    result.ok = false;
    console.error("[theme-token-parity-check] 失败明细：");
    for (const p of problems) console.error("  - " + p);
    if (result.missing.length)
      console.error("  missing（浅色主题缺键，应补）: " + result.missing.join(", "));
    if (result.extra.length)
      console.error("  extra（浅色主题多键，应删）: " + result.extra.join(", "));
    console.log(JSON.stringify(result));
    exit(1);
  }

  console.log(JSON.stringify(result));
  exit(0);
}

main();
