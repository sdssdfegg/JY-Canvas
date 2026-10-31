// 画布生成节点 Inspector 的浏览器实测（真实浏览器，不打上游、不扣费）。
//
// 覆盖执行单 V157 验收标准：选中生成节点后，右侧属性面板内 模型/渠道/尺寸/比例 四控件
// 均真实可见（offsetParent !== null 且 getBoundingClientRect 宽高 > 0，且未被祖先裁剪）；
// 切换模型后渠道下拉选项数量随之变化；节点卡片 NodeBody 内不再含可编辑下拉
// （旧缺陷根因——固定高度 + overflow:hidden 把控件裁掉——已消除）。
//
// 实例说明同 detail-stylepack-off-browser-check：自带端口 + 独立 origin（http://127.0.0.1:8813），
// 浏览器存储与用户 8787 互不影响；data/ 共享，前后比对 history.json 指纹。
// 浏览器类只进全量（run-all），不进 --fast（依赖起服务 + tabbit 真实浏览器）。
// 用法：node scripts/verify/ai-canvas-inspector-browser-check.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { installExitCleanup, stopChild } from "./lib/sandbox.mjs";

const ROOT = process.cwd();
const NODE = path.join(ROOT, "runtime", "node", "node.exe");
const APP_PORT = 8813;
const HISTORY_FILE = path.join(ROOT, "data", "history.json");
const CLI = path.join(process.env.LOCALAPPDATA || "", "Tabbit", "LocalAgent", "bin", "tabbit-cli.exe");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

function hashOf(file) {
  try { return existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16) : "(不存在)"; }
  catch { return "(读不到)"; }
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

async function driveBrowser(program, timeoutMs = 180000) {
  const stdout = await new Promise((resolve) => {
    const cli = spawn(CLI, [
      "nodejs",
      "--task", "ai canvas inspector check",
      "--request-id", `inspector-${process.pid}`,
      "--timeout-ms", String(timeoutMs)
    ], { windowsHide: true });
    let buffer = "";
    cli.stdout.on("data", (chunk) => { buffer += String(chunk); });
    cli.stderr.on("data", (chunk) => { buffer += String(chunk); });
    cli.on("error", () => resolve(""));
    cli.on("close", () => resolve(buffer));
    try {
      cli.stdin.write(program);
      cli.stdin.end();
    } catch { /* ignore */ }
  });
  const start = stdout.indexOf('{"result"');
  if (start < 0) return null;
  const tail = stdout.slice(start);
  for (let cut = tail.lastIndexOf("}"); cut > 0; cut -= 1) {
    if (tail[cut] !== "}") continue;
    try {
      const payload = JSON.parse(tail.slice(0, cut + 1));
      if (payload?.result?.value) return payload.result.value;
    } catch { /* 继续往前找 */ }
  }
  return null;
}

let child = null;
let facts = null;
let browserReason = "";
const historyBefore = hashOf(HISTORY_FILE);
try {
  child = spawn(NODE, [path.join("server", "index.js")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
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
    browserReason = "tabbit-cli 不存在，跳过浏览器部分";
  } else {
    const program = `
page.setDefaultNavigationTimeout(150000);
await page.goto("http://127.0.0.1:${APP_PORT}/", {waitUntil: "domcontentloaded"});
await page.waitForTimeout(2600);
const facts = await page.evaluate(async () => {
  const mod = await import("/scripts/verify/ai-canvas-inspector-page.jsx?v=" + Date.now());
  return await mod.run();
});
return { facts };
`;
    const payload = await driveBrowser(program);
    if (payload && payload.facts) facts = payload.facts;
    else browserReason = "浏览器回执无法解析";
  }
} catch (error) {
  browserReason = error instanceof Error ? error.message : String(error);
} finally {
  await stopChild(child);
}

if (facts) {
  const f = facts;
  check("浏览器：成功进入 AI 无限画布", f.canvasOpened === true, f.error || "");
  check("浏览器：成功新建生成节点", f.nodeCreated === true, "");
  check("浏览器：选中节点后属性面板可见", f.inspectorVisible === true, "");
  check("浏览器：属性面板含 模型/渠道/尺寸/比例 四个控件", f.hasModel && f.hasChannel && f.hasSize && f.hasRatio, JSON.stringify({ m: f.hasModel, c: f.hasChannel, s: f.hasSize, r: f.hasRatio }));
  check("浏览器：模型控件真实可见（未被裁剪）", f.modelVisible === true, String(f.modelVisible));
  check("浏览器：渠道控件真实可见（未被裁剪）", f.channelVisible === true, String(f.channelVisible));
  check("浏览器：尺寸控件真实可见（未被裁剪）", f.sizeVisible === true, String(f.sizeVisible));
  check("浏览器：比例控件真实可见（未被裁剪）", f.ratioVisible === true, String(f.ratioVisible));
  check("浏览器：切换模型后渠道下拉选项数量变化（按模型过滤）", f.channelChanged === true, `before=${f.channelCountBefore} after=${f.channelCountAfter}`);
  check("浏览器：节点卡片 NodeBody 内已无可选下拉（旧溢出裁剪缺陷已消除）", f.nodeBodyHasSelect === false, String(f.nodeBodyHasSelect));
} else {
  check("浏览器探针未执行", false, browserReason || "未知原因");
}

const historyAfter = hashOf(HISTORY_FILE);
check("真实 data/history.json 未被本次浏览器验证改动", historyBefore === historyAfter,
  `before=${historyBefore} after=${historyAfter}`);

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  browser: facts ? "ran" : `skipped: ${browserReason}`,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
