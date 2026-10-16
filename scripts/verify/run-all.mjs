// 一键跑完全部验证脚本（`npm test` / `pnpm test` 的入口）。
//
// 为什么需要它：这些脚本以前只能手工逐个敲，等于"测试写了但没人跑"。
// 现在有一个统一入口：顺序执行、汇总结果、任何一个失败就以非 0 退出（能被 CI 拦住）。
//
// 用法：
//   node scripts/verify/run-all.mjs                 # 全部
//   node scripts/verify/run-all.mjs --only history  # 只跑名字含 history 的
//   node scripts/verify/run-all.mjs --skip-launcher # 跳过启动器检查（会起子进程，较慢）
//   node scripts/verify/run-all.mjs --json          # 输出机器可读结果
//   node scripts/verify/run-all.mjs --list          # 只打印这次会跑哪些脚本，不执行
//   node scripts/verify/run-all.mjs --fast          # 只跑纯源码/逻辑快速子集（给提交前钩子用，
//                                                   #   避开需起服务/VAE/网络 mock 的慢脚本）
//
// 注意：部分脚本需要本地 8787 在跑才能验证浏览器行为；不在跑时会自行跳过浏览器部分，
// 不影响整体通过（会在结果里标注 skipped）。

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const VERIFY_DIR = path.join(ROOT, "scripts", "verify");
const NODE = process.execPath; // 用当前运行时，保证与跑脚本的是同一个 node

/**
 * 执行顺序有意设计：先便宜且纯逻辑的，再跑要起进程/浏览器、较慢的，
 * 这样出错时能最快给出反馈。
 *
 * 说明：`crop-geometry-page.js` 与 `error-boundary-page.jsx` 是**浏览器侧模块**
 * （由其它脚本或手工 import 到页面里跑），不是可独立执行的脚本，因此不在本列表内。
 *
 * 每个脚本都自带测试实例（自己起服务、自己的沙盒数据目录、跑完自己收），
 * 所以这里顺序执行即可，不依赖你本机 8787 上是否开着开发服务。
 */
const ORDER = [
  "run-node-check",
  "image-host-allowlist-check",
  // 2026-09-30：把 `V11维护文档/02-重复功能同步登记表.md` 里可机器判定的两条搬进门禁。
  // 两个都是纯源码/纯逻辑检查，跑得很快，所以排在起进程的那批脚本之前。
  // shared-ui-duplication：跨文件同名组件的棘轮（存量记账、新增即失败；
  //   另外额外报告同名两份实现是否已经分叉）。
  "shared-ui-duplication-check",
  // V4.0 规范（2026-10-13）：文档绝对路径卫生 —— 扫描 README / docs / 根目录 md
  // 里写死的本机绝对路径，任何在本机不存在的都判红，杜绝「文档引用失效/错误位置」漂移。
  // 纯文本扫描，跑得飞快，排在起进程的那批之前。
  "docs-path-check",
  // V11-RF-019 交付物：前端跨文件同名**顶层函数**棘轮（camelCase 函数，与上面组件的
  //   PascalCase 判据互补；两者允许重叠，如 ReferenceThumbTray 两边都命中，重叠不代表冲突）。
  //   提取逻辑收在 lib/frontend-sources.mjs，与审计脚本共用一份，避免两套正则各自漂移。
  //   额外带「扫描范围漂移」自检：基线口径与当前口径不一致即判红（98/104/22 三次数字反复
  //   的根因就是口径漂移静默改了结论）。存量 22 条记账、新增即失败。纯源码检查，跑得快。
  "frontend-duplication-check",
  // P7-1（2026-10-16）：API 分层门禁 —— AGENTS.md 第 5 条「不要在页面组件里散写 fetch」
  // 的机器版。扫 src/** 里绕过 src/api/** 准入层的裸 `fetch(` 调用，基线棘轮
  // （存量 9 条记账、新增即失败、修好了不刷基线判 stale）。纯源码扫描，跑得飞快，
  // 与上面两个 duplication 检查同族，排在同一梯队。
  "api-layering-check",
  // P7-2（2026-10-16）：死导出门禁 —— 挑出「写了却没人用」的导出
  // （无人具名 import、模块没被整包引入、自己文件里也没在用）。同样走基线棘轮，
  // 存量 11 条记账、新增即失败、清理了不刷基线判 stale。纯源码扫描（复用
  // lib/frontend-sources.mjs 的文件列表，口径与 019 一致），无子进程，跑得飞快。
  "dead-export-check",
  // P7-3（2026-10-16）：体量棘轮 —— 给「文件行数」和「单函数行数」装只许降、不许升的闸。
  // Perf/体量退化此前是全仓唯一没有门禁亮灯的维度：加功能时在某个大文件里多写 80 行，
  // 评审看不出来，半年后又是一颗巨石。上升判红（逼你确认一次，必要就 --update 写明理由），
  // 下降只报告。超过绝对上限（文件 2500 / 函数 600 行）进 overBudget **只报告不拦**：
  // 那是「要不要开拆分单」的决策信息，不该冒充回归。纯源码扫描，无子进程。
  "size-ratchet-check",
  // P7-5（2026-10-16）：依赖方向白名单 —— 回答「板块 A 能不能 import 板块 B」。
  // 与上面几条同属静态解析，但不重复做环检测（那是 source-hygiene 的活儿）：
  // 环检测是底线（出环就崩），方向门禁管的是"合法却该被审视"的边 ——
  // `outfit → auth`、`reference-remix → detail` 这类不会崩，但会把板块长期焊死。
  // 存量 24 个方向记账、出现新方向判红（必须写明 reason）、方向消失判 stale。
  // `src/shared/**` 不计（共享层本就给所有 feature 用）。
  "dependency-direction-check",
  // P7-4（2026-10-16）：产物体积预算 —— 给 vite build 产物设硬上限（单 chunk ≤ 300 kB、
  // 合计 ≤ 1120 kB）。体量棘轮管的是源码行数，这条管的是"打包后要下多少字节"：
  // 误引入一个大依赖时光看源码 diff 是看不出来的，只有产物 size 会说话。
  // **刻意不进 --fast / pre-commit**：它依赖 dist/ 构建产物，而 dist/ 不入库 ——
  // 提交前若刚改完源码没重新 build，量到的就是过期数字（脚本会标注 staleBuild），
  // 拿过期数字卡提交既不负责也容易被人当成噪声关掉。归全量 `npm test` / CI
  // （CI 里先 build 再 check，顺序天然正确）。dist 不存在时跳过且退出 0。
  "bundle-budget-check",
  // 2026-10-03 新增：源码字节卫生（NUL / 控制字符 / 非法 UTF-8）。
  // 起因是 RF-078-b 给 outfit-workflow.jsx 的注释混进二进制垃圾 —— 运行无感
  // （build/ESLint 全绿）却让 grep 把整块巨石判为 binary，审计能力静默失效。
  // 无基线无棘轮，纯字节扫描，跑得飞快。
  "source-hygiene-check",
  // BUG02（2026-10-16）：渲染期 TDZ 门禁 —— 用 espree 扫 App() 渲染期前向引用（const/let），
  // 拦住「build 通过但首次渲染必崩」的合入。纯解析、无子进程、无基线（门槛 0），进提交钩子。
  "main-render-tdz-check",
  // auth-key-parity：前后端 KEY 清洗规则逐用例一致（登记表第 13 行"后续可抽共享测试用例"）。
  // runtime-config-baseline：守住 server/core/runtime-config.js 的默认值
  // （超时 / 并发 / 缓存策略都是历史实测调校出来的，改了不报错、只改出图行为，
  //   所以必须能被自动发现）。跑得很快，排在起进程的那批之前。
  "runtime-config-baseline-check",
  "auth-key-parity-check",
  // V11-RF-101 硬性交付物：出图并发状态只能各有一处定义点（在 server/core/image-concurrency.js 内）；
  // 复用 V11-RF-010 的真相源收集器，将来 routes/** 自建第二份会被自动抓红。纯源码检查，跑得快。
  "state-singleton-check",
  // V11-RF-016 交付物：服务端跨文件同名顶层函数棘轮（存量记账、新增即失败、违规点名两处文件:行号）；
  // 复用 V11-RF-010 的真相源收集器，将来 routes/shared/** 复制一份会被自动抓红。纯源码检查，跑得快。
  "server-duplication-check",
  // V11-RF-011 交付物：app-paths 的 rootDir 在源码兜底分支必须等于仓库根，
  // 且 dataDir/日志目录/uploadTempDir 都落在 rootDir 下；JINGYIN_RELEASE_ROOT 仍最高优先。
  // 纯进程内断言（不 spawn），跑得快，排在起进程的那批之前。
  "app-paths-check",
  // V11-RF-018 交付物：相对导入路径存在性门禁（血案直接解药 ——
  // RF-116 把 app-bootstrap 搬进 core/ 后写成 ./static-assets.generated.js，
  // 启动直接 ERR_MODULE_NOT_FOUND，而当时所有门禁都抓不到）。
  // 只扫 server/** 源码里写死的 import/export/import() 字面量说明符，
  // 复用 RF-010 的真相源收集器，将来 server/routes/** 写错同样自动点名。
  // 无基线无棘轮：坏路径任何时刻都是错。纯源码检查，跑得很快。
  "import-path-check",
  "canvas-asset-check",
  "history-repair-check",
  "history-integrity-check",
  "local-edit-ratio-check",
  "local-edit-base-file-check",
  "resize-long-edge-check",
  "generation-error-check",
  "reference-gate-check",
  // 2026-10-07：V39 引入的参考生图策略验收脚本，纯逻辑、跑得快，需登记进顺序表，
  // 否则 run-all-check 的「顺序表覆盖所有磁盘脚本」断言会点名漏登。
  "reference-policy-verify",
  "batch-prompt-passthrough-check",
  "connection-test-check",
  "http-mock-check",
  "generation-failure-path-check",
  "outfit-defer-autosave-check",
  "pro-wire-check",
  "error-boundary-check",
  // 2026-09-29：TT Image 2.5 的 Subdirect 线路改走 JSON + image_urls
  // （中转计费表达式只解析 JSON 请求体，multipart 读不到 channelId 会落默认档）。
  // 该脚本是这条链路的请求形状断言，之前漏登记在顺序表里，run-all-check 会点名。
  "tt25-subdirect-wire-check",
  "routing-check",
  "ui-duplication-check",
  "modal-shell-check",
  "quickgen-prompt-passthrough-check",
  // 2026-09-26：批量换装结构化意图 + 唯一精简提示词编译器。
  // 前者是纯逻辑断言（七种部位组合 / 层级 / 穿法 / 事实过滤 / 字符数）；
  // 后者用本地 mock 上游钉住"结构化意图真的进了发给模型的最终提示词"。
  "outfit-intent-check",
  "outfit-intent-request-check",
  // 2026-09-26：精修页「结果图中线剪裁成两张」（3.0 同口径的开关 + 两张半图真的落盘）。
  "white-refine-split-check",
  // 2026-09-26：服装精修结构化意图（对称/衣摆/版型/用户补充）+ 唯一精简提示词编译器。
  "retouch-intent-check",
  "retouch-intent-request-check",
  "lint-ratchet-check",
  "run-all-check",
  "check-launcher"
];

/**
 * 快速子集（`--fast`）：只跑纯源码 / 纯逻辑、用 `spawn`（非 `spawnSync`）且不需要起本地服务、
 * 不做 VAE / 网络 mock 的脚本。用于提交前钩子——全量 run-all 在本仓库要跑 ~8 分钟
 * （generation-failure-path / pro-wire / http-mock / connection-test 等会起子进程或做重活），
 * 不适合卡在每次 commit 上；而且 `lint-ratchet-check` / `run-all-check` 内部走 `spawnSync`，
 * 在个别环境（含本沙箱）会偶发 EBUSY，故不放进提交钩子，改由完整 `npm run check` / CI 覆盖。
 * 这里的每一项都是「改完代码立刻能发现回归」的廉价门禁；慢脚本与 lint/元检查留给 CI。
 * 注意：FAST_ORDER 只挑快且稳定的脚本，新增快速脚本时同步加进来。
 */
const FAST_ORDER = [
  "run-node-check",
  "image-host-allowlist-check",
  "shared-ui-duplication-check",
  "frontend-duplication-check",
  // P7-1 API 分层门禁：纯源码扫描 + 基线棘轮，无子进程、无需起服务（<1s），
  // 改一行 fetch 就能立刻发现，正合提交钩子的定位。
  "api-layering-check",
  // P7-2 死导出门禁：同样是纯源码扫描 + 基线棘轮，无子进程（<1s）。api-layering 拦的是
  // 「绕过准入层」，这条拦的是「导出没人用」，两者都是靠自律撑不住的规则，一起进提交钩子。
  "dead-export-check",
  // P7-3 体量棘轮：同样是纯源码扫描（行数 + 花括号配平），无子进程。进提交钩子是有意的——
  // 「只许降不许升」只有卡在写代码的那一刻才有约束力，攒到 CI 再报就已经长回去了。
  "size-ratchet-check",
  // P7-5 依赖方向：静态解析 import 说明符 + 白名单比对，无子进程（<1s）。
  // 它的价值窗口就是"写那行新 import 的一刻"——等到 CI 再报，横向依赖已经落地一个月了。
  "dependency-direction-check",
  "source-hygiene-check",
  // BUG02 渲染期 TDZ 门禁：纯解析、无子进程（<1s），改一行就崩的 TDZ 立刻发现，正合提交钩子。
  "main-render-tdz-check",
  "runtime-config-baseline-check",
  "auth-key-parity-check",
  "state-singleton-check",
  "server-duplication-check",
  "app-paths-check",
  "import-path-check",
  "docs-path-check",
  "reference-gate-check",
  "reference-policy-verify",
  "tt25-subdirect-wire-check",
  "routing-check",
  "ui-duplication-check",
  "quickgen-prompt-passthrough-check",
  "outfit-intent-check",
  "retouch-intent-check",
  "generation-error-check",
  "history-integrity-check",
  "local-edit-ratio-check",
  "white-refine-split-check"
];

/**
 * 只读取证 / 诊断工具：**不做断言**、恒以 0 退出，输出取决于跑的时候日志里恰好有什么。
 * 它们不适合当回归门禁（永远绿，等于没测），所以不进 ORDER，也不由 run-all 执行。
 * 需要时直接跑：node scripts/verify/speed-investigation.mjs
 */
const TOOLS = [
  "speed-investigation",
  // V11-RF-055 交付物：前端「块级克隆」advisory 档（只报不记账，恒以 0 退出）。
  // 放在 TOOLS 而不是 ORDER，理由与上面一致：它**不做断言**（不参与 ok、不写进
  // duplicateCount、不进基线、不影响 lint 棘轮），进断言顺序表只会让每次 run-all
  // 多印 ~54 块在册债务的噪声，且会扰动"27/38"这个大家都在比对的基线计数。
  // 排产前手工跑：node scripts/verify/block-clone-advisory.mjs
  "block-clone-advisory"
];

/** 可直接执行的脚本（.mjs）；.js/.jsx 是浏览器侧模块，由脚本内部或手工加载。 */
function discoverRunnable() {
  if (!existsSync(VERIFY_DIR)) return [];
  return readdirSync(VERIFY_DIR)
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => name.replace(/\.mjs$/, ""));
}

/**
 * `__` 开头的是测试夹具 / 临时脚本（run-all-check 会临时丢一个必失败的夹具进来）。
 * 它们**默认不跑**：夹具是给元测试用的，不该进正式门禁；
 * 而且夹具清理失败时（Windows 句柄延迟）残留一个必失败文件，
 * 会把下一次 `npm test` 整体带崩——这种自毒效果必须避免。
 * 但 `--only __xxx` 明确点名时仍然可选中，否则元测试没法验证"失败会传播"。
 */
const isFixture = (name) => name.startsWith("__");

/**
 * run-all 自己永远不参与执行：`discoverRunnable()` 会扫到它，
 * 一旦当成普通脚本跑，就是 run-all 跑 run-all，再各自跑一遍全部脚本——
 * 递归爆炸（这个坑在接入时被 `--list` 抓到了）。`--only run-all` 也不放行。
 */
const isSelf = (name) => name === "run-all";

function orderScripts(all) {
  const runnable = all.filter((name) => !TOOLS.includes(name) && !isSelf(name));
  const known = ORDER.filter((name) => runnable.includes(name));
  const extra = runnable.filter((name) => !ORDER.includes(name));
  return [...known, ...extra];
}

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex > -1 ? String(args[onlyIndex + 1] || "").trim() : "";
const skipLauncher = args.includes("--skip-launcher");
const fast = args.includes("--fast");
const asJson = args.includes("--json");
const listOnly = args.includes("--list");

if (onlyIndex > -1 && !only) {
  console.error("--only 后面要跟名字片段，例如 --only history");
  process.exit(2);
}

const discovered = discoverRunnable();
// 默认只跑正式脚本（排除夹具）；`--only` 明确点名时可以选到夹具，
// 但无论如何都排除 run-all 自己（见 isSelf）。
let scripts = orderScripts(only ? discovered.filter((name) => !isSelf(name)) : discovered.filter((name) => !isFixture(name)));
if (only) scripts = scripts.filter((name) => name.includes(only));
if (skipLauncher) scripts = scripts.filter((name) => name !== "check-launcher");
// --fast：只保留 FAST_ORDER 里的快速脚本（提交前钩子用）。与 --only 可叠加。
if (fast) scripts = FAST_ORDER.filter((name) => scripts.includes(name));

if (scripts.length === 0) {
  console.error(`没有匹配的验证脚本（--only ${only || "-"}）`);
  process.exit(2);
}

// --list：只打印这次会跑哪些脚本，不执行。给人看，也让元测试能便宜地断言选择逻辑。
if (listOnly) {
  console.log(scripts.join("\n"));
  process.exit(0);
}

function runOne(name) {
  const file = path.join(VERIFY_DIR, `${name}.mjs`);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(NODE, [file], { cwd: ROOT, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      resolve({ name, ok: false, ms: Date.now() - startedAt, exitCode: -1, stdout, stderr: String(error?.message || error), summary: "" });
    });
    child.on("close", (code) => {
      resolve({
        name,
        ok: code === 0,
        ms: Date.now() - startedAt,
        exitCode: code,
        stdout,
        stderr,
        summary: summarize(name, stdout, stderr)
      });
    });
  });
}

/** 从脚本输出里摘一行摘要，方便一眼看出跑了多少项。 */
function summarize(name, stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  const jsonMatch = /"passed":\s*(\d+)[\s\S]{0,200}?"total":\s*(\d+)/.exec(text);
  if (jsonMatch) return `passed ${jsonMatch[1]}/${jsonMatch[2]}`;
  const countMatch = /失败 (\d+) 项 \/ 共 (\d+) 项/.exec(text);
  if (countMatch) return `失败 ${countMatch[1]} / 共 ${countMatch[2]} 项`;
  const targetMatch = /目标 (\d+) 个，失败 (\d+) 个/.exec(text);
  if (targetMatch) return `目标 ${targetMatch[1]} 个 / 失败 ${targetMatch[2]} 个`;
  const okFail = /"ok":\s*(true|false)/.exec(text);
  if (okFail) return `ok=${okFail[1]}`;
  if (/skipped/.test(text)) return "部分跳过（浏览器未运行）";
  return "";
}

const results = [];
const overallStart = Date.now();
for (const name of scripts) {
  process.stdout.write(`▶ ${name} … `);
  // 顺序执行便于定位失败点（且部分脚本要占用端口，不能并发）
  const result = await runOne(name);
  results.push(result);
  process.stdout.write(`${result.ok ? "通过" : "失败"} (${result.ms} ms)${result.summary ? "  " + result.summary : ""}\n`);
  if (!result.ok) {
    const tail = `${result.stdout}\n${result.stderr}`.split(/\r?\n/).filter(Boolean).slice(-14);
    process.stdout.write(`  失败详情（末 14 行）：\n${tail.map((line) => "    " + line).join("\n")}\n`);
  }
}

const failed = results.filter((item) => !item.ok);
const totalMs = Date.now() - overallStart;
const summaryLine = `[run-all] ${results.length} 个脚本：通过 ${results.length - failed.length}，失败 ${failed.length}，用时 ${(totalMs / 1000).toFixed(1)}s`;

if (asJson) {
  console.log(JSON.stringify({
    ok: failed.length === 0,
    scripts: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    totalMs,
    entries: results.map((item) => ({ name: item.name, ok: item.ok, ms: item.ms, summary: item.summary, exitCode: item.exitCode }))
  }, null, 2));
} else {
  console.log("");
  console.log(summaryLine);
  if (failed.length > 0) {
    console.log(`[run-all] 失败脚本：${failed.map((item) => item.name).join(", ")}`);
  }
}

process.exitCode = failed.length === 0 ? 0 : 1;
