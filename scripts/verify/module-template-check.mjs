#!/usr/bin/env node
/**
 * V195（UI-A21 · T6 第一刀 · 其余模块契约与棘轮护栏固化）：
 * 把规划稿 §8 `:678`「其余模块按模板接入 + 棘轮收敛」（T6）的防反弹判据落成机器可判的静态护栏。
 *
 * 静态、零依赖叶子：只 import Node 内置（node:fs / node:path / node:url），
 * 只读 src/ 下五个模块 JSX、src/styles.css、scripts/verify/*.json 两份基线、
 * scripts/verify/hardcoded-color-check.mjs、scripts/verify/legacy-button-ratchet-check.mjs、
 * scripts/verify/token-contract-check.mjs、docs/设计令牌跨应用契约.md、
 * scripts/verify/run-all.mjs、docs/V4.0-前端UI全局规范方案.md，
 * 不启动服务、不读浏览器、不取 getComputedStyle、不碰 data/、不写任何文件。
 *
 * 断言一律用文本包含 / 正则匹配，🔴 严禁写死行号（V190 / V191 行号漂移教训）。
 * 断言总数 ≥16，按四组：
 *   A 组 · 棘轮终值与防反弹（5）：hardcoded-color-baseline 八文件且 hex 合计=159 /
 *       legacy-button-baseline 11 类全 0 且 cssDefinitions 空 / 规范 §11.2 含「不再发布任何 CSS hex 收敛单」
 *       +「G 类」+「永久排除」/ hardcoded-color-check 只扫 .css 且含 --update 分支 /
 *       legacy-button-ratchet 含「只拦新增」语义。
 *   B 组 · 五模块现状对照（6）：五模块均存在且各含共享 <Button 用法 / 全仓 .ui-result-card 四文件（V187 有界偏离、V196 闭环）/
 *       全仓 .ui-select 五文件（V196 接入 4 个含 select 模块）/ styles.css 含 .assetCard 基类且被 VideoView·ReferenceRemix 引用 /
 *       五模块不新增 xxxButton 一次性类名（白名单外判红）/ 五模块 JSX 无新增硬编码 hex（canvas fillStyle 动态色除外）。
 *   C 组 · 契约与登记自证（4）：契约文档含 ## 12. 且 §12 含「视觉 CSS 0 行」「只降不升」「V196」「挂起」/
 *       run-all.mjs ORDER 与 FAST_ORDER 均含 module-template-check / token-contract-check 仍以 text.includes 包含式判定且
 *       未注入 §12 锚点（新增 §12 不判红）/ 规范 §11.1 含 V195 行。
 *   D 组 · 反向自测（1）：删契约 ## 12. 片段应判红，证明护栏非虚设。
 *
 * 输出：统一 { ok, total, passed, failed, checks, failureCount } JSON，失败退出码 1。
 * 纯文本静态断言、无子进程（<1s），进 run-all 的 ORDER + FAST_ORDER（提交钩子 --fast 子集）。
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");

const MODULES = [
  "src/features/detail/DetailView.jsx",
  "src/features/prompt/PromptAssistantView.jsx",
  "src/features/reference-remix/ReferenceRemixView.jsx",
  "src/features/video/VideoView.jsx",
  "src/image-editor.jsx",
];
const STYLES_CSS = resolve(REPO_ROOT, "src/styles.css");
const COLOR_BASELINE = resolve(REPO_ROOT, "scripts/verify/hardcoded-color-baseline.json");
const BUTTON_BASELINE = resolve(REPO_ROOT, "scripts/verify/legacy-button-baseline.json");
const COLOR_CHECK = resolve(REPO_ROOT, "scripts/verify/hardcoded-color-check.mjs");
const BUTTON_CHECK = resolve(REPO_ROOT, "scripts/verify/legacy-button-ratchet-check.mjs");
const TOKEN_CONTRACT_CHECK = resolve(REPO_ROOT, "scripts/verify/token-contract-check.mjs");
const CONTRACT = resolve(REPO_ROOT, "docs/设计令牌跨应用契约.md");
const RUN_ALL = resolve(REPO_ROOT, "scripts/verify/run-all.mjs");
const SPEC = resolve(REPO_ROOT, "docs/V4.0-前端UI全局规范方案.md");

// 五模块里既有的、被棘轮记账锁定的一次性 Button 类名（V196 接入后存量；新增即判红）。
const BUTTON_CLASS_WHITELIST = [
  "editorDeleteButton",
  "editorSaveButton",
  "assetDownloadButton",
];

const checks = [];
function addCheck(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
}

/** 提取 markdown 中某个二级标题节（如 "## 12."）到下一个同级或更高标题之前的文本。 */
function extractSection(src, heading) {
  const re = new RegExp("^" + heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b[^\n]*\n([\\s\\S]*?)(?=^#{1,3} |$)", "m");
  const m = re.exec(src);
  return m ? m[1] : "";
}

function main() {
  // ---- 文件存在性 ----
  const styles = existsSync(STYLES_CSS) ? readFileSync(STYLES_CSS, "utf8") : "";
  const colorBaselineRaw = existsSync(COLOR_BASELINE) ? readFileSync(COLOR_BASELINE, "utf8") : "";
  const buttonBaselineRaw = existsSync(BUTTON_BASELINE) ? readFileSync(BUTTON_BASELINE, "utf8") : "";
  const colorCheck = existsSync(COLOR_CHECK) ? readFileSync(COLOR_CHECK, "utf8") : "";
  const buttonCheck = existsSync(BUTTON_CHECK) ? readFileSync(BUTTON_CHECK, "utf8") : "";
  const tokenContractCheck = existsSync(TOKEN_CONTRACT_CHECK) ? readFileSync(TOKEN_CONTRACT_CHECK, "utf8") : "";
  const contract = existsSync(CONTRACT) ? readFileSync(CONTRACT, "utf8") : "";
  const runAll = existsSync(RUN_ALL) ? readFileSync(RUN_ALL, "utf8") : "";
  const spec = existsSync(SPEC) ? readFileSync(SPEC, "utf8") : "";

  if (!styles) addCheck("src/styles.css 存在", false, "src/styles.css 不存在");
  if (!colorBaselineRaw) addCheck("hardcoded-color-baseline.json 存在", false, "基线文件不存在");
  if (!buttonBaselineRaw) addCheck("legacy-button-baseline.json 存在", false, "基线文件不存在");
  if (!colorCheck) addCheck("hardcoded-color-check.mjs 存在", false, "脚本不存在");
  if (!buttonCheck) addCheck("legacy-button-ratchet-check.mjs 存在", false, "脚本不存在");
  if (!tokenContractCheck) addCheck("token-contract-check.mjs 存在", false, "脚本不存在");
  if (!contract) addCheck("契约文档存在", false, "docs/设计令牌跨应用契约.md 不存在");
  if (!runAll) addCheck("run-all.mjs 存在", false, "scripts/verify/run-all.mjs 不存在");
  if (!spec) addCheck("规范文档存在", false, "docs/V4.0-前端UI全局规范方案.md 不存在");

  // ============ A 组 · 棘轮终值与防反弹（5）============
  // A1：hardcoded-color-baseline.json 含八文件且 hex 合计 = 159（正则求和，不写死顺序）
  let colorBaseline = null;
  try { colorBaseline = JSON.parse(colorBaselineRaw); } catch { /* 下方判红 */ }
  const a1files = colorBaseline && colorBaseline.files && typeof colorBaseline.files === "object"
    ? Object.keys(colorBaseline.files).length : 0;
  const a1sum = colorBaseline && colorBaseline.files
    ? Object.values(colorBaseline.files).reduce((a, b) => a + (Number(b) || 0), 0) : -1;
  const a1 = a1files === 8 && a1sum === 159;
  addCheck("A1 hardcoded-color-baseline 八文件且 hex 合计=159", a1,
    a1 ? "全仓 hex 终值 159（T1-b3 收官）" : `文件数 ${a1files}/期望8、合计 ${a1sum}/期望159`);

  // A2：legacy-button-baseline.json 含 11 类、jsxUsage 全 0、cssDefinitions 空对象
  let buttonBaseline = null;
  try { buttonBaseline = JSON.parse(buttonBaselineRaw); } catch { /* 下方判红 */ }
  const a2classes = buttonBaseline && buttonBaseline.jsxUsage
    ? Object.keys(buttonBaseline.jsxUsage).length : 0;
  const a2allZero = buttonBaseline && buttonBaseline.jsxUsage
    ? Object.values(buttonBaseline.jsxUsage).every((v) => v === 0) : false;
  const a2emptyDef = buttonBaseline && buttonBaseline.cssDefinitions
    ? Object.keys(buttonBaseline.cssDefinitions).length === 0 : false;
  const a2 = a2classes === 11 && a2allZero && a2emptyDef;
  addCheck("A2 legacy-button-baseline 11 类全 0 且 cssDefinitions 空", a2,
    a2 ? "旧按钮类存量归零、只拦新增" : `类数 ${a2classes}/期望11、全0 ${a2allZero}、定义空 ${a2emptyDef}`);

  // A3：规范 §11.2 含「不再发布任何 CSS hex 收敛单」「G 类」「永久排除」
  const spec112Idx = spec.indexOf("### 11.2");
  const spec112 = spec112Idx >= 0 ? spec.slice(spec112Idx) : "";
  const a3 = spec112.includes("不再发布任何 CSS hex 收敛单") &&
    spec112.includes("G 类") &&
    spec112.includes("永久排除");
  addCheck("A3 规范 §11.2 含「不再发布任何 CSS hex 收敛单」「G 类」「永久排除」", a3,
    a3 ? "hex 收敛终点已固化、G 类永久排除" : "§11.2 缺失关键口径");

  // A4：hardcoded-color-check.mjs 只扫 .css 且含 --update 分支
  const a4 = colorCheck.includes('endsWith(".css")') && colorCheck.includes("--update");
  addCheck("A4 hardcoded-color-check 只扫 .css 且含 --update 分支", a4,
    a4 ? "扫描范围限定 css、刷新基线分支存在" : "扫描范围或 --update 分支缺失");

  // A5：legacy-button-ratchet-check.mjs 含「只拦新增」语义
  const a5 = buttonCheck.includes("只拦新增");
  addCheck("A5 legacy-button-ratchet-check 含「只拦新增」语义", a5,
    a5 ? "旧按钮类存量记账、只拦新增" : "缺失只拦新增语义");

  // ============ B 组 · 五模块现状对照（6）============
  // B1：五模块均存在且各自含共享 <Button 用法（import 或 <Button 标签）
  let b1ok = MODULES.length === 5;
  const b1details = [];
  for (const rel of MODULES) {
    const p = resolve(REPO_ROOT, rel);
    if (!existsSync(p)) { b1ok = false; b1details.push(`${rel}: 不存在`); continue; }
    const src = readFileSync(p, "utf8");
    if (!src.includes("<Button")) { b1ok = false; b1details.push(`${rel}: 无共享 <Button 用法`); }
  }
  addCheck("B1 五模块均存在且各含共享 <Button 用法", b1ok,
    b1ok ? "参考/详情/视频/图片编辑/提示词助手均消费共享 Button 规格" : b1details.join("；"));

  // B2：全仓 .ui-result-card 消费仅 quick-gallery-card.jsx / result-card.jsx / VideoView.jsx / ReferenceRemixView.jsx（V187 有界偏离，V196 闭环）
  const rcGrep = execGrepRepo(REPO_ROOT, "ui-result-card");
  const b2 = rcGrep.length === 4 &&
    rcGrep.includes("src/features/main-app/panels/quick-gallery-card.jsx") &&
    rcGrep.includes("src/features/outfit/panels/result-card.jsx") &&
    rcGrep.includes("src/features/video/VideoView.jsx") &&
    rcGrep.includes("src/features/reference-remix/ReferenceRemixView.jsx");
  addCheck("B2 全仓 .ui-result-card 仅 quick-gallery-card.jsx / result-card.jsx / VideoView.jsx / ReferenceRemixView.jsx", b2,
    b2 ? "V187 有界偏离已由 V196 闭环，视频 / 参考已接入" : `命中 ${rcGrep.length} 个文件：${rcGrep.join("，")}`);

  // B3：全仓 .ui-select 消费仅 OutfitComposer.jsx + 参考 / 详情 / 视频 / 提示词助手（image-editor.jsx 无 select 不列入）
  const selGrep = execGrepRepo(REPO_ROOT, "ui-select");
  const b3 = selGrep.length === 5 &&
    selGrep.includes("src/features/outfit/panels/OutfitComposer.jsx") &&
    selGrep.includes("src/features/reference-remix/ReferenceRemixView.jsx") &&
    selGrep.includes("src/features/detail/DetailView.jsx") &&
    selGrep.includes("src/features/video/VideoView.jsx") &&
    selGrep.includes("src/features/prompt/PromptAssistantView.jsx");
  addCheck("B3 全仓 .ui-select 仅 OutfitComposer.jsx + 参考 / 详情 / 视频 / 提示词助手", b3,
    b3 ? "已扩散到 4 个含 select 的模块" : `命中 ${selGrep.length} 个文件：${selGrep.join("，")}`);

  // B4：styles.css 含 .assetCard 基类且被 VideoView.jsx / ReferenceRemixView.jsx 引用
  const videoSrc = readFileSafe(resolve(REPO_ROOT, "src/features/video/VideoView.jsx"));
  const refSrc = readFileSafe(resolve(REPO_ROOT, "src/features/reference-remix/ReferenceRemixView.jsx"));
  const b4 = styles.includes(".assetCard") &&
    videoSrc.includes("assetCard") &&
    refSrc.includes("assetCard");
  addCheck("B4 styles.css 含 .assetCard 基类且被 VideoView/ReferenceRemix 引用", b4,
    b4 ? "有界偏离已由叠加契约类闭环" : "assetCard 基类或被引用侧缺失");

  // B5：五模块不新增 xxxButton 一次性类名（白名单外判红）
  let b5ok = true;
  const b5violations = [];
  const btnRe = /className\s*=\s*["']([^"']*)["']/g;
  for (const rel of MODULES) {
    const p = resolve(REPO_ROOT, rel);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    let m;
    while ((m = btnRe.exec(src))) {
      const token = m[1];
      if (/\w*Button\w*/i.test(token) && !BUTTON_CLASS_WHITELIST.includes(token)) {
        b5ok = false;
        b5violations.push(`${rel}: ${token}`);
      }
    }
  }
  addCheck("B5 五模块不新增 xxxButton 一次性类名（白名单外判红）", b5ok,
    b5ok ? `锁定存量 ${BUTTON_CLASS_WHITELIST.length} 个、无新增` : b5violations.join("；"));

  // B6：五模块 JSX 内无新增硬编码 hex（canvas fillStyle 动态色例外，按 hardcoded-color-check 同口径排除）
  let b6ok = true;
  const b6details = [];
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  for (const rel of MODULES) {
    const p = resolve(REPO_ROOT, rel);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, "utf8").split("\n");
    let count = 0;
    for (const line of lines) {
      if (line.includes("fillStyle")) continue; // canvas 动态色合法
      if (hexRe.test(line)) { count++; }
      hexRe.lastIndex = 0;
    }
    if (count > 0) { b6ok = false; b6details.push(`${rel}: ${count} 处非 fillStyle hex`); }
  }
  addCheck("B6 五模块 JSX 无新增硬编码 hex（canvas fillStyle 除外）", b6ok,
    b6ok ? "五模块零非动态 hex" : b6details.join("；"));

  // ============ C 组 · 契约与登记自证（4）============
  // C1：契约文档含 ## 12. 且 §12 含「视觉 CSS 0 行」「只降不升」「V196」「挂起」
  const sec12Idx = contract.indexOf("## 12.");
  const sec12 = sec12Idx >= 0 ? contract.slice(sec12Idx) : "";
  const c1 = sec12Idx >= 0 &&
    sec12.includes("视觉 CSS 0 行") &&
    sec12.includes("只降不升") &&
    sec12.includes("V196") &&
    sec12.includes("挂起");
  addCheck("C1 契约含 ## 12. 且 §12 含「视觉 CSS 0 行」「只降不升」「V196」「挂起」", c1,
    c1 ? "§12 其余模块模板接入契约已固化" : "契约文档缺 §12 或缺失关键词");

  // C2：run-all.mjs 的 ORDER 与 FAST_ORDER 均含 module-template-check
  const orderMatch = runAll.match(/const ORDER = \[([\s\S]*?)\];/);
  const fastMatch = runAll.match(/const FAST_ORDER = \[([\s\S]*?)\];/);
  const c2 = orderMatch && fastMatch &&
    orderMatch[1].includes("module-template-check") &&
    fastMatch[1].includes("module-template-check");
  addCheck("C2 run-all.mjs ORDER 与 FAST_ORDER 均含 module-template-check", c2,
    c2 ? "新脚本已双登记" : "ORDER/FAST_ORDER 漏登记（--fast 会静默不跑）");

  // C3：token-contract-check.mjs 仍以 text.includes 包含式判定（10 锚点经循环），且未注入 §12 锚点（新增 §12 不判红）
  const c3 = tokenContractCheck.includes("text.includes") &&
    !tokenContractCheck.includes("## 12.") &&
    !tokenContractCheck.includes("V195");
  addCheck("C3 token-contract-check 仍 text.includes 且未注入 §12 锚点（§12 不判红）", c3,
    c3 ? "10 锚点包含式、未改脚本" : "token-contract-check 被改或已注入 §12 锚点");

  // C4：规范 §11.1 含 V195 行（台账已预置）
  const c4 = spec.includes("### 11.1") && spec.includes("V195");
  addCheck("C4 规范 §11.1 含 V195 行", c4,
    c4 ? "UI 变更记录已登记 V195" : "§11.1 未登记 V195");

  // ============ D 组 · 反向自测（1）：删 §12 整节应判红 ============
  // 直接截断 §12（含其 ### 12.x 子节），验证 C1 对「契约缺 §12」判红，证明护栏非虚设。
  const sec12Start = contract.indexOf("## 12.");
  const sec12Mutated = sec12Start >= 0 ? contract.slice(0, sec12Start) : contract;
  const c1Mutated = sec12Mutated.indexOf("## 12.") >= 0 &&
    sec12Mutated.slice(sec12Mutated.indexOf("## 12.")).includes("视觉 CSS 0 行") &&
    sec12Mutated.slice(sec12Mutated.indexOf("## 12.")).includes("只降不升") &&
    sec12Mutated.slice(sec12Mutated.indexOf("## 12.")).includes("V196") &&
    sec12Mutated.slice(sec12Mutated.indexOf("## 12.")).includes("挂起");
  addCheck("反向自测·C1 删 §12 整节应判红（护栏非虚设）", c1 && !c1Mutated,
    c1 && !c1Mutated ? "真实源码判绿、删节后判红 ⇒ 断言有效" : "反向自测失败");

  // ---- 汇总 ----
  const failureCount = checks.filter((c) => !c.ok).length;
  const passed = checks.length - failureCount;
  const total = checks.length;
  const ok = failureCount === 0;
  const result = { ok, total, passed, failed: failureCount, checks, failureCount };
  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

/** 只读当前工作树源码，扫描 src/** 下含目标串的 .js/.jsx 文件相对路径（不写文件、不起服务）。 */
function execGrepRepo(repoRoot, needle) {
  const out = [];
  const walk = (dir) => {
    const entries = readDirSafe(dir);
    for (const e of entries) {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
        walk(full);
      } else if (/\.(js|jsx)$/i.test(e.name)) {
        const s = readFileSafe(full);
        if (s.includes(needle)) {
          let rel = full.startsWith(repoRoot) ? full.slice(repoRoot.length) : full;
          rel = rel.replace(/^[\\/]/, "").split("\\").join("/");
          out.push(rel);
        }
      }
    }
  };
  walk(resolve(repoRoot, "src"));
  return out;
}

function readDirSafe(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
}

function readFileSafe(p) {
  try { return readFileSync(p, "utf8"); } catch { return ""; }
}

main();
