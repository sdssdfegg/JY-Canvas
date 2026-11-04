// 批量生成底栏高度一致性验收（P1-001）。
//
// 两路验证：
//   A. 源码级（不打浏览器）：切换成功提示已删、拦截提示保留、三个布局固定点已落地（min-height + 占位）。
//   B. 浏览器级（真实页面）：5 档窗口尺寸 × 动态枚举的所有功能页，
//      逐页量 .composerPanel 高度/顶/底、.composerStickyControls 的 top/bottom、.rightTools 顶、
//      .generateBtn 可见性；断言切页不跳动（各量档内极差 ≤ 2px）、生成按钮不被遮挡/隐藏、
//      真实滚动容器数 ≤ 2、无整页滚动。
//
// 服务与浏览器走独立端口（8822）/ 独立 origin，不影响用户 8787 实例，也不写 history.json。
// 用法：node scripts/verify/composer-stable-height-check.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { installExitCleanup, stopChild } from "./lib/sandbox.mjs";

const ROOT = process.cwd();
const NODE = path.join(ROOT, "runtime", "node", "node.exe");
const APP_PORT = 8822;
const CLI = path.join(process.env.LOCALAPPDATA || "", "Tabbit", "LocalAgent", "bin", "tabbit-cli.exe");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// ---------------------------------------------------------------- A. 源码级
const pagesSrc = readFileSync(path.join(ROOT, "src", "features", "outfit", "use-outfit-pages.js"), "utf8");
const composerSrc = readFileSync(path.join(ROOT, "src", "features", "outfit", "panels", "OutfitComposer.jsx"), "utf8");
const intentCssSrc = readFileSync(path.join(ROOT, "src", "features", "outfit", "outfit-intent.css"), "utf8");
const workflowCssSrc = readFileSync(path.join(ROOT, "src", "outfit-workflow.css"), "utf8");

check("源码：切换成功提示已删除（use-outfit-pages.js 不再含「已切换到」）",
  !pagesSrc.includes("已切换到"), "已切换到");
check("源码：生成中拦截提示保留（use-outfit-pages.js 仍含「当前正在生成，完成后再切换页面」）",
  pagesSrc.includes("当前正在生成，完成后再切换页面"), "拦截提示");
check("源码：composerStatus 改为常驻渲染（不再用 {inlineMessage && …}）",
  !/\{inlineMessage\s*&&\s*<div className="composerStatus"/.test(composerSrc)
    && composerSrc.includes('<div className={`composerStatus'), "常驻");
check("源码：outfitIntentBar 改为常驻渲染（不再用 {isOutfitWorkflow && …} 整段）",
  !/\{isOutfitWorkflow\s*&&\s*\(?\s*\n?\s*<div className="outfitIntentBar"/.test(composerSrc)
    && composerSrc.includes('<div className={`outfitIntentBar'), "常驻");
check("CSS：.rightTools 单阶 min-height: var(--control-h-md)（V76 归阶后口径）",
  /\.outfitWorkflowEmbedded \.rightTools\s*\{[^}]*min-height:\s*var\(--control-h-md\)/.test(workflowCssSrc), "var(--control-h-md)");
check("CSS：.rightTools nowrap 单行策略（V77 参数条高度与板块无关）",
  /\.outfitWorkflowEmbedded \.rightTools\s*\{[^}]*flex-wrap:\s*nowrap/.test(workflowCssSrc), "nowrap");
check("CSS：.composerStatus min-height 且含 --placeholder 不可见占位",
  /\.outfitWorkflowEmbedded \.composerStatus\s*\{[^}]*min-height:\s*36px/.test(workflowCssSrc)
    && workflowCssSrc.includes(".composerStatus--placeholder"), "36px+占位");
check("CSS：.outfitIntentBar min-height 且含 --placeholder 不可见占位",
  /\.outfitWorkflowEmbedded \.outfitIntentBar\s*\{[^}]*min-height:\s*32px/.test(intentCssSrc)
    && intentCssSrc.includes(".outfitIntentBar--placeholder"), "32px+占位");
// P1-001 A′-1：dock 是否取得确定高度预算（替代"只有 max-height"），操作条是否 margin-top:auto
check("CSS：.composerPanel 取得确定高度（height: clamp(...)）",
  /\.outfitWorkflowEmbedded \.composerPanel\s*\{[^}]*height:\s*clamp\(/.test(workflowCssSrc), "clamp 高度");
check("CSS：.composerStickyControls 加 margin-top: auto（内容不足时推底，置于 margin 简写之后）",
  /\.outfitWorkflowEmbedded \.composerStickyControls\s*\{[^}]*margin-top:\s*auto/.test(workflowCssSrc), "margin-top:auto");

// ---------------------------------------------------------------- B. 浏览器级
// P1-001 §8.2：4 档强制 + 1024×768 观察档（观察档不纳入强制失败，仅记录溢出/按钮可见性）
const FORCED_SIZES = [[1920, 1080], [1600, 900], [1366, 768], [1280, 720]];
const OBSERVE_SIZES = [[1024, 768]];

let child = null;
let facts = null;          // { "1920x1080": {...}, ... }
let browserReason = "";
try {
  child = spawn(NODE, [path.join("server", "index.js")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      // 显式 dev：dist/.release-mode（secure-win-release.mjs:208 构建时写入）会经 server/index.js:13-21 把实例强制成 production，测试实例必须免疫（V122）
      NODE_ENV: "development",
      JINGYIN_VITE_CACHE_DIR: path.join(process.cwd(), "tmp", `vite-cache-verify-${APP_PORT}`),
      PORT: String(APP_PORT),
      JINGYIN_PORT_FALLBACK_LIMIT: "0",
      JINGYIN_NO_BROWSER: "1"
    }
  });
  installExitCleanup({ getChild: () => child });
  const deadline = Date.now() + 30000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/health`);
      if (res.ok) { healthy = true; break; }
    } catch { /* 还没起来 */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!healthy) throw new Error("V11 测试实例未起来");

  if (!existsSync(CLI)) {
    browserReason = "tabbit-cli 不存在，跳过浏览器部分";
  } else {
    // P1-001：逐档尺寸分别发起一次 CLI 调用。每档独立进程、独立 playwright 实例，
    // 各自冷加载（dev 首次 Vite 编译 + React 挂载 + 标签页渲染），确保 tab 枚举完整。
    // 单档回执体量小（run() 已压缩为紧凑对象）可被 tabbit-cli 内联返回，解析稳定。
    // 注意：5 档合并进同一次 CLI 调用会触发 180s 硬超时被杀（EVALUATION_TIMEOUT）。
    const allSizes = [...FORCED_SIZES, ...OBSERVE_SIZES];
    const runSingle = async ([w, h]) => {
      const program = `
page.setDefaultNavigationTimeout(150000);
await page.goto("http://127.0.0.1:${APP_PORT}/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.setViewportSize({ width: ${w}, height: ${h} });
await page.goto("http://127.0.0.1:${APP_PORT}/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
return await page.evaluate(async () => {
  const mod = await import("/scripts/verify/composer-stable-height-page.jsx?v=" + Date.now());
  return await mod.run();
});
`;
      const stdout = await new Promise((resolve) => {
        const cli = spawn(CLI, [
          "nodejs",
          "--task", `V11 composer height ${w}x${h}`,
          "--request-id", `composerheight-${process.pid}-${w}x${h}`,
          "--timeout-ms", "180000"
        ], { windowsHide: true });
        let buffer = "";
        cli.stdout.on("data", (c) => { buffer += String(c); });
        cli.stderr.on("data", (c) => { buffer += String(c); });
        cli.on("error", () => resolve(""));
        cli.on("close", () => resolve(buffer));
        try { cli.stdin.write(program); cli.stdin.end(); } catch { resolve(""); }
      });
      const start = stdout.indexOf("{\"result\"");
      if (start < 0) return { sizeKey: `${w}x${h}`, raw: stdout.slice(0, 200) };
      const tail = stdout.slice(start);
      for (let cut = tail.lastIndexOf("}"); cut > 0; cut -= 1) {
        if (tail[cut] !== "}") continue;
        try {
          const v = JSON.parse(tail.slice(0, cut + 1))?.result?.value;
          return { sizeKey: `${w}x${h}`, value: v };
        } catch { /* 继续往前找 */ }
      }
      return { sizeKey: `${w}x${h}`, raw: stdout.slice(0, 200) };
    };
    const sizeFacts = {};
    for (const size of allSizes) {
      const r = await runSingle(size);
      if (r.value && typeof r.value === "object") sizeFacts[r.sizeKey] = r.value;
      else browserReason = `浏览器回执无法解析（${r.sizeKey}，${(r.raw || "空").trim()}）`;
    }
    facts = sizeFacts;
  }
} catch (error) {
  browserReason = error instanceof Error ? error.message : String(error);
} finally {
  await stopChild(child);
}

function assertSize(sizeKey, f, forced) {
  const tag = forced ? `[${sizeKey}-强制]` : `[${sizeKey}-观察]`;
  if (!f || typeof f !== "object") { check(`浏览器${tag}：探针未返回`, false, "无数据"); return; }
  const {
    foundEmbed, tabCount, panelSpread, stickyTopSpread, stickyBottomSpread,
    rightToolsSpread, scrollContainerCount, pageScroll, btnBad
  } = f;

  check(`浏览器${tag}：进入批量生成并找到 .outfitWorkflowEmbedded`, foundEmbed === true, `foundEmbed=${foundEmbed}`);
  check(`浏览器${tag}：动态枚举到功能页（共 ${tabCount} 页）`, tabCount > 0, `tabCount=${tabCount}`);

  check(`浏览器${tag}：切页 dock 高度恒定（.composerPanel.height 极差 ≤ 2px）`,
    panelSpread !== null && panelSpread <= 2, `spread=${panelSpread}`);
  check(`浏览器${tag}：切页操作条顶边恒定（.composerStickyControls.top 极差 ≤ 2px）`,
    stickyTopSpread !== null && stickyTopSpread <= 2, `spread=${stickyTopSpread}`);
  check(`浏览器${tag}：切页操作条底边恒定（.composerStickyControls.bottom 极差 ≤ 2px）`,
    stickyBottomSpread !== null && stickyBottomSpread <= 2, `spread=${stickyBottomSpread}`);
  check(`浏览器${tag}：切页 .rightTools 顶边恒定（极差 ≤ 2px）`,
    rightToolsSpread !== null && rightToolsSpread <= 2, `spread=${rightToolsSpread}`);

  check(`浏览器${tag}：各页 .generateBtn 在视口内、不被遮挡、未隐藏`,
    btnBad === 0, `btnBad=${btnBad}`);

  check(`浏览器${tag}：真实滚动容器数 ≤ 2（结果区 + 配置区）`,
    scrollContainerCount <= 2, `count=${scrollContainerCount}`);
  if (forced) {
    check(`浏览器${tag}：无整页滚动`, pageScroll === false, `pageScroll=${pageScroll}`);
  } else {
    // 观察档：横向溢出/双滚动条属预期，仅记录不判红；仅当生成按钮真正被隐藏/遮挡才算回归
    check(`浏览器${tag}：生成按钮仍可见（观察档允许横向溢出）`,
      btnBad === 0, `scrollContainerCount=${scrollContainerCount} pageScroll=${pageScroll} btnBad=${btnBad}`);
  }
}

if (facts) {
  for (const [w, h] of FORCED_SIZES) assertSize(`${w}x${h}`, facts[`${w}x${h}`], true);
  for (const [w, h] of OBSERVE_SIZES) assertSize(`${w}x${h}`, facts[`${w}x${h}`], false);
} else {
  check("浏览器探针未执行", false, browserReason || "未知原因");
}

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  browser: facts ? "ran" : `skipped: ${browserReason}`,
  results
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
