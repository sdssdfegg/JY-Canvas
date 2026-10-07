// 逐个、串行地跑 scripts/verify 下的全部校验脚本，汇总退出码与失败数。
//
// 为什么必须有它：
//   run-all.mjs 是并发跑的，而本环境里含 spawn/端口的脚本并发会**假 FAIL**
//   （两次跑出来的失败名单还不重叠）⇒ 批处理结果不能当结论，必须串行定性。
//   手工一个一个敲又慢又容易漏，故固化成脚本。
//
// 跳过的：
//   run-all / run-all-check（自身是调度器，跑它们等于递归）、
//   __ 开头（测试夹具，默认不参与门禁）、
//   speed-investigation 等只读取证工具（恒返回 0，不参与断言）
//
// ⚠️ 2026-10-06 查实（不再悬案）：曾经跑全套稳定报 10 项假 FAIL，逐个单跑却全绿。
//   根因链条：vite.config.js 把 process.env.PORT 读进配置 ⇒ 每个脚本端口不同 ⇒ 配置哈希每次都变
//   ⇒ 每次起服务都 Re-optimizing ⇒ 要删掉 51 个文件的 deps，而当时所有脚本共用
//   tmp/vite-cache-verify ⇒ 命中沙箱 safe-delete 守卫（count:51 threshold:50 scope:"turn"）
//   ⇒ createServer 抛异常、服务永不 listen ⇒ waitForHealth 30s 超时（这就是那清一色的 ~31s）。
//   已修：每个脚本改用按端口命名的缓存目录（tmp/vite-cache-verify-<PORT>），配置哈希稳定
//   ⇒ 不再重新预构建 ⇒ 不再触发批量删除。修复后同一套跑 12 项失败降到 7 项（其中 2 项是
//   spawnSync 恒 EBUSY 的环境阻断，与代码无关）。
//   ⇒ 但仍然保留复验机制：非 0 退出会隔 SETTLE_MS 单跑一次，以复验为准。
//   ⇒ 结论仍以「手工单跑」为准；本工具只用来缩小范围，不能替代定性。
//
// ⚠️ 冷启动：每个端口第一次跑要自己预构建一遍依赖（实测 60~130s），TIMEOUT_MS 必须留够，
//   否则会被误杀成 exit=null，看起来像失败。
//
// 用法：node scripts/dev/verify-sweep.mjs            # 全部
//       node scripts/dev/verify-sweep.mjs history    # 只跑名字含 history 的
import { spawn, execSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "scripts", "verify");
const NODE = process.execPath;
// 冷启动某个端口的首次依赖预构建实测要 60~130s，180s 太紧会被误杀成 exit=null。
const TIMEOUT_MS = 420000;
const SETTLE_MS = 3000;
const filter = process.argv[2] || "";

// 从 run-all.mjs 里读出 TOOLS（只读取证工具），与门禁口径保持一致
const runAllSrc = existsSync(path.join(DIR, "run-all.mjs"))
  ? readFileSync(path.join(DIR, "run-all.mjs"), "utf8")
  : "";
const toolsBody = /const TOOLS = \[([\s\S]*?)\n\];/.exec(runAllSrc)?.[1] || "";
const tools = [...toolsBody.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);

const SKIP = new Set(["run-all", "run-all-check", ...tools]);

// V36：起步先确保 dist/ 已构建。verify 套件靠把 NODE_ENV=production 注入被调脚本，
// 让每个 server 实例命中 server/app.js 的 hasDiskFrontend 静态托管分支（不再 import vite），
// 从而根除 vite 配置哈希随端口变化引发的串跑抖动 / 冷启动假 FAIL。
// dist 不存在则构建一次，产物即当前 src 的真行为，保证测的是源码而非过时的预构建。
const DIST_INDEX = path.join(ROOT, "dist", "index.html");
if (!existsSync(DIST_INDEX)) {
  console.log("[verify-sweep] dist/index.html 不存在，先 vite build 一次（测的是当前 src 真行为）...");
  const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  execSync(`"${process.execPath}" "${viteBin}" build`, { cwd: ROOT, stdio: "inherit" });
}

const scripts = readdirSync(DIR)
  .filter((n) => n.endsWith(".mjs") && !n.startsWith("__"))
  .map((n) => n.replace(/\.mjs$/, ""))
  .filter((n) => !SKIP.has(n))
  .filter((n) => !filter || n.includes(filter))
  .sort();

const runOne = (name, timeoutMs) => new Promise((resolve) => {
  // V36：注入 NODE_ENV=production，使被调脚本再 spawn server/index.js 时（其 env 以 ...process.env 打底）
  // 命中 hasDiskFrontend 静态托管 dist，运行时不再拉 vite dev server ⇒ 根除串跑抖动。
  const child = spawn(NODE, [path.join(DIR, `${name}.mjs`)], {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, NODE_ENV: "production" }
  });
  let out = "";
  let err = "";
  const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* 已退出 */ } }, timeoutMs);
  child.stdout.on("data", (d) => { out += d; });
  child.stderr.on("data", (d) => { err += d; });
  child.on("close", (code) => {
    clearTimeout(timer);
    resolve({ code, out, err });
  });
  child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
});

const summaryOf = (out) => {
  const patterns = [
    /失败\s*(\d+)\s*项\s*\/\s*共\s*(\d+)\s*项/,
    /"failed":\s*(\d+)[^]*?"total":\s*(\d+)/,
    /"total":\s*(\d+)[^]*?"failed":\s*(\d+)/
  ];
  for (const re of patterns) {
    const m = re.exec(out);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      return re === patterns[0] ? { failed: a, total: b } : { failed: a, total: b };
    }
  }
  return null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rows = [];
for (const name of scripts) {
  const started = Date.now();
  const { code, out, err } = await runOne(name, TIMEOUT_MS);
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  const s = summaryOf(out) || summaryOf(err);
  const tail = (out || err || "").trim().split(/\r?\n/).slice(-1)[0] || "(无输出)";
  await sleep(SETTLE_MS);

  let verdict = code === 0 ? "PASS" : "FAIL";
  let retryCode = null;
  if (code !== 0) {
    // 复验：隔 SETTLE_MS 后单跑一次。批处理里的 FAIL 可能是跨脚本污染，复验才作数。
    const again = await runOne(name, TIMEOUT_MS);
    retryCode = again.code;
    verdict = again.code === 0 ? "CONTAM" : "FAIL";
    await sleep(SETTLE_MS);
  }
  rows.push({ name, code, retryCode, verdict, sec, failed: s ? s.failed : null, total: s ? s.total : null, tail: tail.slice(0, 70) });
  const num = s ? `failed=${s.failed}/${s.total}` : "(无计数)";
  const retryNote = retryCode === null ? "" : `  复验exit=${retryCode}`;
  console.log(`${verdict.padEnd(7)} ${name.padEnd(34)} exit=${String(code).padEnd(4)} ${String(sec).padStart(6)}s  ${num}${retryNote}`);
}

const bad = rows.filter((r) => r.verdict === "FAIL");
const contam = rows.filter((r) => r.verdict === "CONTAM");
console.log(`\n==== 合计 ${rows.length} 个脚本：通过 ${rows.filter((r) => r.verdict === "PASS").length}，` +
  `复验转绿（判定为批处理污染） ${contam.length}，真失败 ${bad.length} ====`);
if (contam.length) console.log(`\n复验转绿 ${contam.length} 个：${contam.map((r) => r.name).join(", ")}`);
if (bad.length) {
  console.log("\n真失败（复验仍非 0，需人工定性：真回归 / 环境阻断）：");
  for (const r of bad) console.log(`  · ${r.name}  exit=${r.code} 复验=${r.retryCode}  ${r.failed !== null ? `failed=${r.failed}/${r.total}` : ""}  ${r.tail}`);
}
