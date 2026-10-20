// 浏览器验证「正反」开关 UI 联动（前端专项E）。真实浏览器，不打上游、不扣费。
//
// 与 modal-shell-check 同一套 tabbit 驱动范式：起一个独立端口的 Vite 测试实例，浏览器加载后
// 在页面上下文 import retouch-frontback-page.jsx 并跑 run()，把 DOM 事实拿回来判门禁。
//
// 用法：node scripts/verify/retouch-frontback-check.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { installExitCleanup, stopChild } from "./lib/sandbox.mjs";

const ROOT = process.cwd();
const NODE = path.join(ROOT, "runtime", "node", "node.exe");
const APP_PORT = 8821;
const CLI = path.join(process.env.LOCALAPPDATA || "", "Tabbit", "LocalAgent", "bin", "tabbit-cli.exe");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

async function waitForHealth(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch { /* 还没起来 */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

let child = null;
let facts = null;
let reason = "";
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
  if (!(await waitForHealth(APP_PORT))) throw new Error("V11 测试实例未起来");

  if (!existsSync(CLI)) {
    reason = "tabbit-cli 不存在，跳过浏览器部分";
  } else {
    const program = `
page.setDefaultNavigationTimeout(150000);
await page.goto("http://127.0.0.1:${APP_PORT}/", {waitUntil: "domcontentloaded"});
await page.waitForTimeout(2600);
return await page.evaluate(async () => {
  const mod = await import("/scripts/verify/retouch-frontback-page.jsx?v=" + Date.now());
  return await mod.run();
});
`;
    const stdout = await new Promise((resolve) => {
      const cli = spawn(CLI, [
        "nodejs",
        "--task", "V11 retouch frontback check",
        "--request-id", `retouchfb-${process.pid}`,
        "--timeout-ms", "180000"
      ], { windowsHide: true });
      let buffer = "";
      cli.stdout.on("data", (chunk) => { buffer += String(chunk); });
      cli.stderr.on("data", (chunk) => { buffer += String(chunk); });
      cli.on("error", () => resolve(""));
      cli.on("close", () => resolve(buffer));
      try { cli.stdin.write(program); cli.stdin.end(); } catch { /* ignore */ }
    });
    let payload = null;
    const start = stdout.indexOf('{"result"');
    if (start >= 0) {
      const tail = stdout.slice(start);
      for (let cut = tail.lastIndexOf("}"); cut > 0 && !payload; cut -= 1) {
        if (tail[cut] !== "}") continue;
        try { payload = JSON.parse(tail.slice(0, cut + 1))?.result?.value || null; } catch { /* 继续往前找 */ }
      }
    }
    if (payload) facts = payload;
    else reason = `浏览器回执无法解析（长度 ${stdout.length}）`;
  }
} catch (error) {
  reason = error instanceof Error ? error.message : String(error);
} finally {
  await stopChild(child);
}

if (facts) {
  // 进入 white-refine 的判定：要么 navTo("精修") 成功切过去，要么页面默认就在 white-refine
  //（精修面板只在 isWhiteRefineWorkflow 时渲染，panelFound=true 即已证明进入）。
  check("浏览器：进入精修页（white-refine）", facts.navSwitched === true || facts.panelFound === true, `navSwitched=${facts.navSwitched} panel=${facts.panelFound}`);
  check("浏览器：精修面板与正反开关渲染到位", facts.panelFound === true && facts.toggleFound === true, `panel=${facts.panelFound} toggle=${facts.toggleFound}`);
  check("浏览器：默认（关）预览不含【正反视图】段", facts.previewBeforeHasFrontback === false, `before=${facts.previewBeforeHasFrontback}`);
  check("浏览器：开启后预览首行为【正反视图】且含用户固定文案", facts.previewOnStartsWithFrontback === true && facts.previewOnHasText === true,
    `starts=${facts.previewOnStartsWithFrontback} text=${facts.previewOnHasText}`);
  check("浏览器：开启后比例联动为 4:3", facts.ratioOn === "4:3", `ratioOn=${facts.ratioOn}`);
  check("浏览器：关闭后预览不再含【正反视图】段", facts.previewOffHasFrontback === false, `off=${facts.previewOffHasFrontback}`);
  check("浏览器：关闭后比例恢复到开启前原值", facts.ratioRestored === true, `before=${facts.ratioBefore} off=${facts.ratioOff}`);
} else {
  check("浏览器探针（正反开关）未执行", false, reason || "未知原因");
}

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  browser: facts ? "ran" : `skipped: ${reason}`,
  facts,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
