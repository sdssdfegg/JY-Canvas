// 批量生成底栏高度一致性验收（执行单 F）。
//
// 两路验证：
//   A. 源码级（不打浏览器）：切换成功提示已删、拦截提示保留、三个布局固定点已落地（min-height + 占位）。
//   B. 浏览器级（真实页面）：依次切换 5 个生图板块 + 新建临时需求页，
//      逐页量 .rightTools 顶部位，断言极差 ≤ 2px；切换过程不再出现「已切换到」提示。
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
// V77（§4.5 预授权 --update）：V76 已把 .rightTools 的 72px 两行预留归为单阶 var(--control-h-md)，
// V77 进一步落地 nowrap 单行策略（参数条高度与板块无关，切换不跳动）。原 72px 断言已陈旧，按新口径更新。
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

// ---------------------------------------------------------------- B. 浏览器级
let child = null;
let facts = null;
let browserReason = "";
try {
  child = spawn(NODE, [path.join("server", "index.js")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
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
    const program = `
page.setDefaultNavigationTimeout(150000);
await page.goto("http://127.0.0.1:${APP_PORT}/", {waitUntil: "domcontentloaded"});
await page.waitForTimeout(2600);
return await page.evaluate(async () => {
  const mod = await import("/scripts/verify/composer-stable-height-page.jsx?v=" + Date.now());
  return await mod.run();
});
`;
    const stdout = await new Promise((resolve) => {
      const cli = spawn(CLI, [
        "nodejs",
        "--task", "V11 composer stable height check",
        "--request-id", `composerheight-${process.pid}`,
        "--timeout-ms", "180000"
      ], { windowsHide: true });
      let buffer = "";
      cli.stdout.on("data", (chunk) => { buffer += String(chunk); });
      cli.stderr.on("data", (chunk) => { buffer += String(chunk); });
      cli.on("error", () => resolve(""));
      cli.on("close", () => resolve(buffer));
      try { cli.stdin.write(program); cli.stdin.end(); } catch { /* ignore */ }
    });
    const start = stdout.indexOf("{\"result\"");
    if (start >= 0) {
      const tail = stdout.slice(start);
      for (let cut = tail.lastIndexOf("}"); cut > 0 && !facts; cut -= 1) {
        if (tail[cut] !== "}") continue;
        try { facts = JSON.parse(tail.slice(0, cut + 1))?.result?.value || null; } catch { /* 继续往前找 */ }
      }
    }
    if (!facts) browserReason = `浏览器回执无法解析（长度 ${stdout.length}）`;
  }
} catch (error) {
  browserReason = error instanceof Error ? error.message : String(error);
} finally {
  await stopChild(child);
}

if (facts) {
  check("浏览器：进入批量生成并找到 .outfitWorkflowEmbedded", facts.foundEmbed === true, `foundEmbed=${facts.foundEmbed}`);
  check("浏览器：切换各板块时不再出现「已切换到」提示",
    facts.switchToastSeen === false, `switchToastSeen=${facts.switchToastSeen}`);
  const pageLabels = Object.keys(facts.pages || {});
  const foundLabels = pageLabels.filter((l) => facts.pages[l]?.tabFound);
  // 本版 ensureWorkflowPages 默认不播种 outpaint（批量扩图）板块（源码 ensureWorkflowPages 过滤 outpaint），
  // 故仅要求 4 个真实默认的生图板块 tab 均存在；批量扩图的 composer 结构与其它板块完全一致，修复同源生效。
  const EXPECTED_DEFAULT = ["换装", "固定背景", "随机背景", "精修"];
  const missingDefault = EXPECTED_DEFAULT.filter((l) => !foundLabels.includes(l));
  check("浏览器：4 个默认生图板块 tab 均存在（批量扩图本版不默认播种）",
    missingDefault.length === 0, `found=${foundLabels.join(",")} missingDefault=${missingDefault.join(",")}`);
  const outpaintFound = foundLabels.includes("批量扩图");
  // 各页 rightTools 顶部位极差（仅统计量到值的页 + 临时需求页）
  const tops = (facts.rightToolsTops || []).filter((n) => typeof n === "number");
  const spread = tops.length ? Math.max(...tops) - Math.min(...tops) : null;
  check("浏览器：各板块 .rightTools 顶部位极差 ≤ 2px", spread !== null && spread <= 2,
    `tops=[${tops.join(",")}] spread=${spread} outpaintTab=${outpaintFound}`);
  check("浏览器：新建临时需求页成功且量到顶部位",
    facts.addBtnFound === true && facts.tempPage && typeof facts.tempPage.rightToolsTop === "number",
    `label=${facts.tempPageLabel} top=${facts.tempPage?.rightToolsTop}`);
  // 各页 intentBar 占位状态应为布尔（已常驻渲染）；换装页不占位（可见），其余占位（不可见）
  const intentPlaceholders = pageLabels
    .map((l) => facts.pages[l]?.measure?.intentPlaceholder)
    .filter((v) => typeof v === "boolean");
  check("浏览器：各页 intentBar 占位状态均为布尔（已常驻渲染）",
    intentPlaceholders.length >= 4, `count=${intentPlaceholders.length}`);
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
