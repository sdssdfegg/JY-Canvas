#!/usr/bin/env node
/**
 * V194（UI-A20 · T5-b 侧栏折叠交互契约固化与静态护栏）：
 * 把规划稿 §5.3.1 七条侧栏折叠交互契约落成机器可判的静态护栏。
 *
 * 静态、零依赖叶子：只 import Node 内置（node:fs / node:path / node:url），
 * 只读 src/main.jsx、src/styles.css、src/styles/tokens.css、src/shared/ui/AppSidebar.jsx、
 * scripts/verify/ 下 7 个页面脚本、docs/设计令牌跨应用契约.md、
 * scripts/verify/run-all.mjs、docs/V4.0-前端UI全局规范方案.md，
 * 不启动服务、不读浏览器、不取 getComputedStyle、不碰 data/、不写任何文件。
 *
 * 断言一律用文本包含 / 正则匹配，🔴 严禁写死行号（V190 / V191 行号漂移教训）。
 * 断言总数 ≥16，按四组：
 *   A 组 · 主应用状态与无障碍（7）：sidebarCollapsed / useState(false) / matchMedia 760 窄屏禁用 /
 *       setSidebarCollapsed 函数式翻转 / .avatar 按钮 type=button+aria / is-sidebar-collapsed+
 *       data-collapsed / 折叠逻辑零 localStorage·sessionStorage·indexedDB。
 *   B 组 · CSS 折叠形态与断点（8）：--sidebar-w:56px / @media 761 折叠块 border-radius:50% /
 *       .avatar border-radius:8px+rgba(255,255,255,1) / @media 760 --sidebar-w:166px /
 *       prefers-reduced-motion transition:none / 折叠段 var(--dur-fast) var(--ease-standard) /
 *       折叠段 span clip/clip-path 而非 display:none / tokens.css --sidebar-w:166px + --bp-compact。
 *   C 组 · 组件契约与 7 页面选择器（3）：AppSidebar navList/navItem/settingsEntry+type=button /
 *       7 个页面脚本存在且各含侧栏选择器 / tokens.css 不含 [data-theme= （单主题）。
 *   D 组 · 契约与登记自证（3）：契约文档含 ## 11. 且 §11 含「单主题」「hover tooltip」「挂起」/
 *       run-all.mjs ORDER 与 FAST_ORDER 均含 sidebar-collapse-check / 规范 §3.1 不再出现 :root[data-theme=。
 *   + 反向自测（1）：删 main.jsx 关键片段应判红，证明护栏非虚设。
 *
 * 输出：统一 { ok, total, passed, failed, checks, failureCount } JSON，失败退出码 1。
 * 纯文本静态断言、无子进程（<1s），进 run-all 的 ORDER + FAST_ORDER（提交钩子 --fast 子集）。
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

const MAIN_JSX = resolve(REPO_ROOT, "src/main.jsx");
const STYLES_CSS = resolve(REPO_ROOT, "src/styles.css");
const TOKENS_CSS = resolve(REPO_ROOT, "src/styles/tokens.css");
const APP_SIDEBAR = resolve(REPO_ROOT, "src/shared/ui/AppSidebar.jsx");
const CONTRACT = resolve(REPO_ROOT, "docs/设计令牌跨应用契约.md");
const RUN_ALL = resolve(REPO_ROOT, "scripts/verify/run-all.mjs");
const SPEC = resolve(REPO_ROOT, "docs/V4.0-前端UI全局规范方案.md");

const PAGE_SCRIPTS = [
  "ai-canvas-inspector-page.jsx",
  "composer-stable-height-page.jsx",
  "detail-stylepack-off-page.jsx",
  "error-boundary-page.jsx",
  "modal-shell-page.jsx",
  "resize-long-edge-page.jsx",
  "retouch-frontback-page.jsx",
];

const checks = [];
function addCheck(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
}

/** 提取规则选择器后的块体（平衡括号），不包含选择器与外层 `{` `}`。 */
function extractRuleBody(src, selector) {
  const re = new RegExp(escapeRegExp(selector) + "\\s*\\{");
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length - 1; // 指向 '{'
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(m.index + m[0].length, i);
}

/** 提取所有 @media 块：返回 { condition, body } 数组（平衡括号，兼容块内嵌套规则）。 */
function extractMediaBlocks(src) {
  const out = [];
  const re = /@media[^{]*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    const braceStart = start + m[0].length - 1; // 指向 '{'
    let depth = 0;
    let i = braceStart;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const condition = m[0].slice(6, -1).trim();
    out.push({ condition, body: src.slice(braceStart + 1, i) });
  }
  return out;
}

/** 提取 markdown 中某个二级标题节（如 "### 3.1"）到下一个同级或更高标题之前的文本。 */
function extractSection(src, heading) {
  const re = new RegExp("^" + escapeRegExp(heading) + "\\b[^\n]*\n([\\s\\S]*?)(?=^#{1,3} |$)", "m");
  const m = re.exec(src);
  return m ? m[1] : "";
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  // ---- 文件存在性 ----
  const main = existsSync(MAIN_JSX) ? readFileSync(MAIN_JSX, "utf8") : "";
  const styles = existsSync(STYLES_CSS) ? readFileSync(STYLES_CSS, "utf8") : "";
  const tokens = existsSync(TOKENS_CSS) ? readFileSync(TOKENS_CSS, "utf8") : "";
  const appSidebar = existsSync(APP_SIDEBAR) ? readFileSync(APP_SIDEBAR, "utf8") : "";
  const contract = existsSync(CONTRACT) ? readFileSync(CONTRACT, "utf8") : "";
  const runAll = existsSync(RUN_ALL) ? readFileSync(RUN_ALL, "utf8") : "";
  const spec = existsSync(SPEC) ? readFileSync(SPEC, "utf8") : "";

  if (!main) addCheck("src/main.jsx 存在", false, "src/main.jsx 不存在");
  if (!styles) addCheck("src/styles.css 存在", false, "src/styles.css 不存在");
  if (!tokens) addCheck("src/styles/tokens.css 存在", false, "src/styles/tokens.css 不存在");
  if (!appSidebar) addCheck("src/shared/ui/AppSidebar.jsx 存在", false, "AppSidebar.jsx 不存在");
  if (!contract) addCheck("契约文档存在", false, "docs/设计令牌跨应用契约.md 不存在");
  if (!runAll) addCheck("run-all.mjs 存在", false, "scripts/verify/run-all.mjs 不存在");
  if (!spec) addCheck("规范文档存在", false, "docs/V4.0-前端UI全局规范方案.md 不存在");

  // ============ A 组 · 主应用状态与无障碍（7）============
  // A1：sidebarCollapsed 状态 + useState(false)
  const a1 = main.includes("sidebarCollapsed") && main.includes("useState(false)");
  addCheck("A1 main.jsx 含 sidebarCollapsed 与 useState(false)", a1,
    a1 ? "折叠状态以 useState(false) 初始化" : "缺失 sidebarCollapsed 或 useState(false)");

  // A2：toggleSidebar 用 matchMedia 拦截 ≤760px 窄屏并 return（禁用折叠）
  const a2 = main.includes('window.matchMedia("(max-width: 760px)")') &&
    main.includes(".matches) return;");
  addCheck("A2 toggleSidebar 含 matchMedia(≤760px) 且窄屏 return 禁用", a2,
    a2 ? "≤760px 强制展开态、不进入折叠" : "缺失窄屏禁用逻辑");

  // A3：setSidebarCollapsed 函数式翻转（(v) => !v）
  const a3 = main.includes("setSidebarCollapsed((v) => !v)");
  addCheck("A3 折叠切换用函数式翻转 (v) => !v", a3,
    a3 ? "避免闭包旧值" : "未用函数式 setState");

  // A4：.avatar 按钮含 type="button" / aria-expanded / aria-label
  const a4 = main.includes('className="avatar"') &&
    main.includes('type="button"') &&
    main.includes("aria-expanded") &&
    main.includes("aria-label");
  addCheck("A4 .avatar 按钮含 type=button / aria-expanded / aria-label", a4,
    a4 ? "可聚焦 + 无障碍名 + 状态可读" : "缺失按钮语义/无障碍属性");

  // A5：应用壳状态类 is-sidebar-collapsed + 侧栏 data-collapsed
  const a5 = main.includes("is-sidebar-collapsed") && main.includes("data-collapsed=");
  addCheck("A5 .appShell 含 is-sidebar-collapsed、.sidebar 含 data-collapsed", a5,
    a5 ? "状态类与 DOM 属性齐备" : "缺失折叠状态类或 data 属性");

  // A6：折叠逻辑零持久化（不碰用户态）
  const a6 = !main.includes("localStorage") &&
    !main.includes("sessionStorage") &&
    !main.includes("indexedDB");
  addCheck("A6 折叠逻辑不含 localStorage/sessionStorage/indexedDB（零持久化）", a6,
    a6 ? "main.jsx 全文件无用户态存储读写" : "main.jsx 出现用户态存储调用");

  // ============ B 组 · CSS 折叠形态与断点（8）============
  // B1：.appShell.is-sidebar-collapsed 折叠态 --sidebar-w: 56px
  const appShellCollapsed = extractRuleBody(styles, ".appShell.is-sidebar-collapsed");
  const b1 = !!appShellCollapsed && appShellCollapsed.includes("--sidebar-w: 56px");
  addCheck("B1 .appShell.is-sidebar-collapsed 折叠态 --sidebar-w: 56px", b1,
    b1 ? "收起 = 56px 图标条" : "折叠宽度未收敛到 56px");

  // B2：@media (min-width: 761px) 折叠块内含 border-radius: 50%（纯白方圆→正圆）
  const mediaBlocks = extractMediaBlocks(styles);
  const min761 = mediaBlocks.find(
    (b) => b.condition.includes("min-width: 761px") &&
      b.body.includes("is-sidebar-collapsed") &&
      b.body.includes("border-radius: 50%")
  );
  const b2 = !!min761;
  addCheck("B2 @media(min-width:761px) 折叠块含 border-radius: 50%", b2,
    b2 ? "展开态方圆、折叠态正圆" : "未找到 761px 断点内的正圆规则");

  // B3：.avatar 规则含 border-radius: 8px 与 rgba(255, 255, 255, 1)（纯白底）
  const avatarRule = extractRuleBody(styles, ".avatar");
  const b3 = !!avatarRule &&
    avatarRule.includes("border-radius: 8px") &&
    avatarRule.includes("rgba(255, 255, 255, 1)");
  addCheck("B3 .avatar 含 border-radius: 8px 与 rgba(255, 255, 255, 1)", b3,
    b3 ? "纯白方圆 LOGO 底" : "缺失纯白底/圆角");

  // B4：@media (max-width: 760px) 强制展开态横向导航（--sidebar-w: 166px）
  const max760 = mediaBlocks.find(
    (b) => b.condition.includes("max-width: 760px") && b.body.includes("--sidebar-w: 166px")
  );
  const b4 = !!max760;
  addCheck("B4 @media(max-width:760px) 块内 --sidebar-w: 166px（横向导航）", b4,
    b4 ? "≤760px 强制展开态" : "窄屏未强制展开");

  // B5：@media (prefers-reduced-motion: reduce) 块内 transition: none
  const reduced = mediaBlocks.find(
    (b) => b.condition.includes("prefers-reduced-motion: reduce") && b.body.includes("transition: none")
  );
  const b5 = !!reduced;
  addCheck("B5 prefers-reduced-motion 块内 transition: none", b5,
    b5 ? "尊重减少动态效果偏好" : "未对 reduced-motion 归零过渡");

  // B6：折叠段过渡使用令牌 var(--dur-fast) var(--ease-standard)
  const b6 = styles.includes("var(--dur-fast) var(--ease-standard)");
  addCheck("B6 折叠段过渡用 var(--dur-fast) var(--ease-standard)", b6,
    b6 ? "动效令牌化、160ms 受控" : "折叠过渡未用动效令牌");

  // B7：折叠段隐藏用 clip/clip-path 而非 display:none（保留可访问名）
  const clipBlock = mediaBlocks.find((b) => b.body.includes(".navItem span"));
  const b7 = !!clipBlock &&
    (clipBlock.body.includes("clip-path") || clipBlock.body.includes("clip: rect")) &&
    !clipBlock.body.includes("display: none");
  addCheck("B7 折叠段 span 用 clip/clip-path 而非 display:none（保留可访问名）", b7,
    b7 ? "文字裁切隐藏、可访问名保留" : "折叠段未用 clip 或误用 display:none");

  // B8：tokens.css 含 --sidebar-w: 166px 与 --bp-compact 断点令牌
  const b8 = tokens.includes("--sidebar-w: 166px") && tokens.includes("--bp-compact");
  addCheck("B8 tokens.css 含 --sidebar-w: 166px 与 --bp-compact 断点令牌", b8,
    b8 ? "侧栏宽度与断点上收令牌层" : "缺失 --sidebar-w / --bp-compact");

  // ============ C 组 · 组件契约与 7 页面选择器（3）============
  // C1：AppSidebar 含 navList / navItem / settingsEntry 与 type="button"
  const c1 = appSidebar.includes("navList") &&
    appSidebar.includes("navItem") &&
    appSidebar.includes("settingsEntry") &&
    appSidebar.includes('type="button"');
  addCheck("C1 AppSidebar 含 navList/navItem/settingsEntry 与 type=button", c1,
    c1 ? "类名与 DOM 结构齐备（V83 教训：零改动约束）" : "缺失侧栏类名或按钮语义");

  // C2：7 个页面脚本均存在且各含至少一个侧栏选择器（navList/navItem/settingsEntry）
  let pageOk = PAGE_SCRIPTS.length === 7;
  const pageDetails = [];
  for (const name of PAGE_SCRIPTS) {
    const p = resolve(REPO_ROOT, "scripts/verify", name);
    if (!existsSync(p)) {
      pageOk = false;
      pageDetails.push(`${name}: 不存在`);
      continue;
    }
    const src = readFileSync(p, "utf8");
    const has = src.includes("navList") || src.includes("navItem") || src.includes("settingsEntry");
    if (!has) {
      pageOk = false;
      pageDetails.push(`${name}: 无侧栏选择器`);
    }
  }
  addCheck("C2 7 个页面脚本存在且各含侧栏选择器", pageOk,
    pageOk ? `全部 ${PAGE_SCRIPTS.length} 个脚本含 navList/navItem/settingsEntry` : pageDetails.join("；"));

  // C3：tokens.css 不含 [data-theme= 选择器（单主题 dark）
  const c3 = !tokens.includes("[data-theme") && !tokens.includes("data-theme=");
  addCheck("C3 tokens.css 不含 [data-theme= 选择器（单主题）", c3,
    c3 ? "V193 后仅 :root 单主题" : "仍存在多主题消费块");

  // ============ D 组 · 契约与登记自证（3）============
  // D1：契约文档含 ## 11. 且 §11 文本含「单主题」「hover tooltip」「挂起」
  const sec11Idx = contract.indexOf("## 11.");
  const sec11 = sec11Idx >= 0 ? contract.slice(sec11Idx) : "";
  const d1 = sec11Idx >= 0 &&
    sec11.includes("单主题") &&
    sec11.includes("hover tooltip") &&
    sec11.includes("挂起");
  addCheck("D1 契约文档含 ## 11. 且含「单主题」「hover tooltip」「挂起」", d1,
    d1 ? "§11 侧栏折叠契约已固化" : "契约文档缺 §11 或缺失关键词");

  // D2：run-all.mjs 的 ORDER 与 FAST_ORDER 均含 sidebar-collapse-check
  const orderMatch = runAll.match(/const ORDER = \[([\s\S]*?)\];/);
  const fastMatch = runAll.match(/const FAST_ORDER = \[([\s\S]*?)\];/);
  const d2 = orderMatch && fastMatch &&
    orderMatch[1].includes("sidebar-collapse-check") &&
    fastMatch[1].includes("sidebar-collapse-check");
  addCheck("D2 run-all.mjs ORDER 与 FAST_ORDER 均含 sidebar-collapse-check", d2,
    d2 ? "新脚本已双登记" : "ORDER/FAST_ORDER 漏登记");

  // D3：规范 §3.1 单主题段落不再出现 :root[data-theme=
  // （V193 后仅 dark 单主题；全仓 grep 已确认规范文档零 :root[data-theme= 残留）
  const d3 = spec.includes("### 3.1") && !spec.includes(":root[data-theme");
  addCheck("D3 规范 §3.1 单主题段落不再出现 :root[data-theme=", d3,
    d3 ? "V193 后单主题口径一致" : "§3.1 仍残留多主题写法");

  // ============ 反向自测（1）：删片段应判红 ============
  const mutatedMain = main.replace(/sidebarCollapsed/g, "SIDEBAR_COLLAPSED_MUTATED");
  const a1Mutated = mutatedMain.includes("sidebarCollapsed") && mutatedMain.includes("useState(false)");
  addCheck("反向自测·A1 删关键片段应判红（护栏非虚设）", a1 && !a1Mutated,
    a1 && !a1Mutated ? "真实源码判绿、删去后判红 ⇒ 断言有效" : "反向自测失败");

  // ---- 汇总 ----
  const failureCount = checks.filter((c) => !c.ok).length;
  const passed = checks.length - failureCount;
  const total = checks.length;
  const ok = failureCount === 0;
  const result = { ok, total, passed, failed: failureCount, checks, failureCount };
  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

main();
