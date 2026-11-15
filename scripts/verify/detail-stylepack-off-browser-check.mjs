// 详情页「Skill 版本 / 视觉风格包」两下拉摘除的浏览器实测（V216-R2 改写；不打上游、不扣费）。
//
// 覆盖执行单 V216 §18：
//   1. 详情页基础参数区不再出现「Skill 版本 / 视觉风格包」两个下拉
//   2. 用「输出语种(lang)」改值 → 保存预设 → 刷新 → 加载预设：lang 回载持久化（预设链未断）
//   3. 参数区两列网格不破、参数项数回落到 13；加载预设后两下拉仍不出现
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
  check("浏览器：Skill 版本下拉已摘除", f.versionSelectGone === true, f.error || "");
  check("浏览器：视觉风格包下拉已摘除", f.packSelectGone === true, String(f.packSelectGone));
  check("浏览器：两下拉均已移除", f.bothSelectsRemoved === true, String(f.bothSelectsRemoved));
  check("浏览器：输出语种(lang) 输入框仍在（参数区结构完整）", f.foundLangInput === true, String(f.foundLangInput));
  check("浏览器：lang 值修改生效", f.langChanged === true, String(f.langChanged));
  check("浏览器：测试 lang 已生成", typeof f.testLang === "string" && f.testLang.length > 0, String(f.testLang));
  check("浏览器：含新 lang 的设置已存入预设（localStorage 持久化）", f.presetSaved === true, String(f.presetSaved));
} else {
  check("浏览器探针（摘除+保存阶段）未执行", false, browserReason || "未知原因");
}

if (verifyFacts) {
  const f = verifyFacts;
  check("浏览器：刷新后找到「加载预设」按钮", f.foundLoadButton === true, f.error || "");
  check("浏览器：预设列表非空（含刚保存的预设）", f.presetItemCount >= 1, String(f.presetItemCount));
  check("浏览器：加载预设后 lang 回载持久化（预设链未断）",
    typeof f.afterLoadLang === "string" && f.afterLoadLang.startsWith("R2-persist-"), String(f.afterLoadLang));
  check("浏览器：加载预设后输出语种输入框仍在", f.foundLangInputAfterReload === true, String(f.foundLangInputAfterReload));
  check("浏览器：加载预设后两下拉仍不出现", f.bothSelectsStillRemoved === true,
    `ver=${f.versionStillGone} pack=${f.packStillGone}`);
  check("浏览器：基础参数区两列网格存在", f.paramGridExists === true, String(f.paramGridExists));
  check("浏览器：基础参数项回落到 13 项（两下拉已摘除）", f.labelCount === 13, String(f.labelCount));
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
