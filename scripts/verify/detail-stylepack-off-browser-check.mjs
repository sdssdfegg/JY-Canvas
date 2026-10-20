// 详情 v2 视觉风格包「关闭（off）」选项的浏览器实测（真实浏览器，不打上游、不扣费）。
//
// 覆盖执行单「详情v2-1b」§5.5/§5.6：
//   1. v1 默认下视觉风格包下拉禁用（行为不变）
//   2. 切 v2 后下拉可用，且含「关闭视觉风格」选项（auto + off + S1–S8 = 10 项）
//   3. 选中 off → 保存预设 → 刷新页面 → 加载预设：stylePackId 仍为 off（:289 归一闸门不放行回落 auto）
//   4. 切回 v1 下拉仍禁用；再切 v2 off 仍在
// 分组头角标（·S1）随 stylePack 缺省为空的断言在 detail-stylepack-off-check.mjs（C7/C8 源码钉桩
// + B1 中间件实测 stylePack 缺省），浏览器侧不重复造分组（生成需打上游）。
//
// 实例说明同 modal-shell-check：自带端口 + 独立 origin（http://127.0.0.1:8811），
// 浏览器存储与用户 8787 互不影响；data/ 共享，前后比对 history.json 指纹。
//
// 用法：node scripts/verify/detail-stylepack-off-browser-check.mjs
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { installExitCleanup, stopChild } from "./lib/sandbox.mjs";

const ROOT = process.cwd();
const NODE = path.join(ROOT, "runtime", "node", "node.exe");
const APP_PORT = 8811;
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
      "--task", "detail stylepack off check",
      "--request-id", `stylepackoff-${process.pid}`,
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
let selectFacts = null;
let verifyFacts = null;
let browserReason = "";
const historyBefore = hashOf(HISTORY_FILE);
try {
  child = spawn(NODE, [path.join("server", "index.js")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      // 显式 dev：dist/.release-mode（secure-win-release.mjs:208 构建时写入）会经 server/index.js:13-21 把实例强制成 production，测试实例必须免疫（V122）
      NODE_ENV: "development",
      // 按端口分目录：vite 配置哈希里含 PORT，所有脚本共用一份缓存会让配置哈希每次都变
      // ⇒ 每次起服务都重新预构建 ⇒ 触发沙盒批量删除守卫而崩（2026-10-06 实测）
      JINGYIN_VITE_CACHE_DIR: path.join(process.cwd(), "tmp", `vite-cache-verify-${APP_PORT}`),
      PORT: String(APP_PORT),
      JINGYIN_PORT_FALLBACK_LIMIT: "0",
      JINGYIN_NO_BROWSER: "1"
      // 故意不设 JINGYIN_RELEASE_ROOT：Vite 的 root 就是它，设了模块就取不到了
    }
  });
  installExitCleanup({ getChild: () => child });
  if (!(await waitForHealth(APP_PORT))) throw new Error("V11 测试实例未起来");

  if (!existsSync(CLI)) {
    browserReason = "tabbit-cli 不存在，跳过浏览器部分";
  } else {
    const program = `
// vite 冷启动（依赖预构建）常 >30s，playwright 默认导航超时会抛错 ⇒ 本行必须保留
page.setDefaultNavigationTimeout(150000);
await page.goto("http://127.0.0.1:${APP_PORT}/", {waitUntil: "domcontentloaded"});
await page.waitForTimeout(2600);
const phase1 = await page.evaluate(async () => {
  const mod = await import("/scripts/verify/detail-stylepack-off-page.jsx?v=" + Date.now());
  return await mod.run();
});
await page.reload({waitUntil: "domcontentloaded"});
await page.waitForTimeout(2600);
const phase2 = await page.evaluate(async () => {
  const mod = await import("/scripts/verify/detail-stylepack-off-page.jsx?v=" + Date.now());
  return await mod.verify();
});
return { phase1, phase2 };
`;
    const payload = await driveBrowser(program);
    if (payload) {
      selectFacts = payload.phase1 || null;
      verifyFacts = payload.phase2 || null;
    } else {
      browserReason = "浏览器回执无法解析";
    }
  }
} catch (error) {
  browserReason = error instanceof Error ? error.message : String(error);
} finally {
  await stopChild(child);
}

if (selectFacts) {
  const f = selectFacts;
  check("浏览器：详情页找到 Skill 版本 / 视觉风格包 两个下拉", f.foundBothSelects === true, f.error || "");
  check("浏览器：v1 默认下视觉风格包下拉禁用（行为不变）", f.v1DefaultDisabled === true, String(f.v1DefaultDisabled));
  check("浏览器：切 v2 后下拉可用", f.v2Enabled === true, String(f.v2Enabled));
  check("浏览器：下拉含「关闭视觉风格」选项", f.offOption === true, String(f.offOption));
  check("浏览器：选项共 10 项（auto + off + S1–S8）", f.optionCount === 10, String(f.optionCount));
  check("浏览器：选中「关闭视觉风格」生效", f.offSelected === true, String(f.offSelected));
  check("浏览器：含 off 的设置已存入预设（localStorage 持久化）", f.presetSaved === true, String(f.presetSaved));
} else {
  check("浏览器探针（选择 off 阶段）未执行", false, browserReason || "未知原因");
}

if (verifyFacts) {
  const f = verifyFacts;
  check("浏览器：刷新后找到「加载预设」按钮", f.foundLoadButton === true, f.error || "");
  check("浏览器：预设列表非空（含刚保存的 off 预设）", f.presetItemCount >= 1, String(f.presetItemCount));
  check("浏览器：加载预设后 stylePackId 仍为 off（:289 未回落 auto）",
    f.afterLoadStylePackId === "off", String(f.afterLoadStylePackId));
  check("浏览器：加载预设后 Skill 版本随预设回 v2 且下拉可用",
    f.afterLoadVersion === "v2" && f.afterLoadEnabled === true, `${f.afterLoadVersion} enabled=${f.afterLoadEnabled}`);
  check("浏览器：切回 v1 视觉风格包下拉仍禁用", f.v1DisabledAfterOff === true, String(f.v1DisabledAfterOff));
  check("浏览器：再切 v2 off 选择仍在", f.stillOffAfterToggle === true, String(f.stillOffAfterToggle));
} else {
  check("浏览器探针（刷新回载阶段）未执行", false, browserReason || "未知原因");
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
  browser: selectFacts ? "ran" : `skipped: ${browserReason}`,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
