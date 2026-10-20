// V122（2026-10-20）：验证基建防复发门禁 —— 测试实例强制 dev 模式，隔绝构建产物污染。
//
// 事故：V121 统筹复核时为模拟 release 模式 `touch dist/.release-mode` 后遗留，
// 导致全量 6 个探针脚本（local-edit / resize / modal-shell / composer-stable-height /
// retouch-frontback / detail-stylepack-off-browser）整批失败——这些脚本的 program 用
// `page.evaluate(() => import("/scripts/verify/xxx-page.jsx"))` 动态拉前端模块，而 dist 里没有
// scripts/ 目录，请求被 SPA fallback 打进 index.html，浏览器报 Failed to fetch dynamically
// imported module。
//
// 根因链（详见 V4.0-执行单-V122）：server/index.js:13-21 在 NODE_ENV 未设置时，检测到
// dist/.release-mode（或 exe 旁同名标记）即强制 NODE_ENV=production；production 下走「磁盘前端」
// 分支（express.static + SPA fallback），不挂 vite dev middleware，于是动态 import 前端失败。
//
// 本门禁干两件事（静态、纯源码、<1s、不依赖运行服务）：
//   ① 凡 spawn/exec server/index.js 作为测试实例的脚本，必须显式声明 NODE_ENV: "development"
//      （放在 ...process.env 之后，覆盖继承值），使测试实例对 dist/.release-mode 免疫；
//   ② 反向断言 server/index.js 的「marker → production」逻辑仍在
//      （不许有人「顺手」把发布模式开关删了——它是发布链路的正常设计）。
//
// 用法：node scripts/verify/verify-dev-mode-check.mjs

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const VERIFY_DIR = path.join(ROOT, "scripts", "verify");

const results = [];
function check(label, pass, detail = "") {
  results.push({ label, pass, detail });
  const mark = pass ? "✓" : "✗";
  console.log(`[${mark}] ${label}${pass ? "" : " — " + detail}`);
}

/**
 * 判定某脚本源码是否在子进程里拉起了 server/index.js（作为测试实例）。
 * 覆盖形态：
 *   - path.join("server", "index.js")（本仓统一写法，含单/双/反引号与任意前缀路径变体）
 *   - 更宽松：spawn/exec/execFile/fork 的实参数组里出现 "server", "index.js" 相邻
 */
function spawnsServerIndex(src) {
  if (/path\.join\(\s*['"`]server['"`]\s*,\s*['"`]index\.js['"`]/.test(src)) return true;
  const re = /(?:spawn|exec|execFile|fork)\s*\(\s*\w+\s*,\s*\[([\s\S]*?)\]/g;
  let m;
  while ((m = re.exec(src))) {
    if (/['"`]server['"`]\s*,\s*['"`]index\.js['"`]/.test(m[1])) return true;
  }
  return false;
}

// 测试实例应当在 spawn 的 env 里显式 `NODE_ENV: "development"`（覆盖继承的 production）。
const DEV_ASSERTION = /NODE_ENV\s*:\s*['"]development['"]/;

const files = readdirSync(VERIFY_DIR).filter((name) => name.endsWith(".mjs"));
const offenders = [];
for (const name of files) {
  const abs = path.join(VERIFY_DIR, name);
  const src = readFileSync(abs, "utf8");
  if (!spawnsServerIndex(src)) continue;
  if (!DEV_ASSERTION.test(src)) offenders.push(name);
}

check(
  "所有 spawn server/index.js 的测试实例脚本均显式声明 NODE_ENV: \"development\"",
  offenders.length === 0,
  offenders.length === 0
    ? ""
    : `以下脚本起测试实例但未免疫 production（会被 dist/.release-mode 污染）：${offenders.join(", ")}`
);

// 反向断言：server/index.js 的「marker → production」逻辑必须还在。
const indexPath = path.join(ROOT, "server", "index.js");
const indexExists = existsSync(indexPath);
const indexSrc = indexExists ? readFileSync(indexPath, "utf8") : "";
check(
  "server/index.js 仍保留 marker→production 逻辑（dist/.release-mode 触发 NODE_ENV=production）",
  indexExists && /\.release-mode/.test(indexSrc) && /NODE_ENV\s*=\s*["']production["']/.test(indexSrc),
  indexExists ? "server/index.js 的发布模式开关被移除或改形（这是发布链路正常设计，勿删）" : "server/index.js 不存在"
);

if (offenders.length > 0) {
  console.error("\n[verify-dev-mode-check] 失败：上述脚本起 server 测试实例前需在 spawn 的 env 里补 `NODE_ENV: \"development\"`");
}

const ok = results.every((r) => r.pass);
console.log(`\n[verify-dev-mode-check] ok:${ok}`);
process.exitCode = ok ? 0 : 1;
