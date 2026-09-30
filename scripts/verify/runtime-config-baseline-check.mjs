// 运行时配置基线检查：守住 server/core/runtime-config.js 的所有默认值。
//
// 为什么需要它：
//   那些常量不是普通参数 —— 它们是历史实测调校出来的出图行为
//   （一次请求最多等多久、结果缓存留几天、最多几个并发、多久触发一次清理）。
//   有人顺手把 IMAGE_CONCURRENCY_LIMIT 改成 20，代码照样能跑、
//   lint 照样是绿的，但客户机器上可能直接卡成 PPT。
//   这类"改了不报错、只改行为"的地方，必须有机器盯着。
//
// 用法：
//   node scripts/verify/runtime-config-baseline-check.mjs          检查
//   node scripts/verify/runtime-config-baseline-check.mjs --update 重写基线
//
// 有意调参时：跑 --update 更新基线，并在提交信息里写清为什么要改。
// 退出码：0 = 与基线一致；1 = 发生漂移

import path from "node:path";
import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const baselineFile = path.join(projectRoot, "scripts", "verify", "runtime-config-baseline.json");
const wantUpdate = process.argv.includes("--update");
const jsonMode = process.argv.includes("--json");

const config = await import(
  `file://${path.join(projectRoot, "server", "core", "runtime-config.js").replace(/\\/g, "/")}`
);

/** 常量名在业务里的含义，写进基线里，漂移报告能直接说清"改的是什么"。 */
const LABELS = {
  PORT: "本地服务监听端口",
  PORT_FALLBACK_LIMIT: "端口被占用时的重试上限",
  IMAGE_REQUEST_TIMEOUT_MS: "单次图片请求总超时",
  IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS: "单个渠道重试的超时",
  LOCAL_HTTP_TIMEOUT_MS: "本地 HTTP 请求超时",
  IMAGE_PROXY_TIMEOUT_MS: "图片代理下载超时",
  RESULT_DISPLAY_CACHE_TIMEOUT_MS: "结果图展示缓存有效期",
  RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS: "展示缓存的最长阻塞等待",
  GATEWAY_COMPRESSION_MIN_BYTES: "网关响应启用压缩的最小体积",
  DOWNLOAD_CHUNK_BYTES: "下载分块大小",
  RESULT_URL_DOWNLOAD_CHUNK_BYTES: "结果 URL 下载分块大小",
  RESULT_URL_DOWNLOAD_RETRIES: "结果 URL 下载重试次数",
  IMAGE_CONCURRENCY_LIMIT: "单机图片请求并发上限（直接影响卡顿体感）",
  RESULT_CACHE_TTL_DAYS: "结果缓存保留天数",
  RESULT_CACHE_TTL_MS: "结果缓存保留毫秒数",
  RESULT_CACHE_MAX_DISK_USAGE_RATIO: "结果缓存可占用的磁盘比例上限",
  RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS: "磁盘压力下可被清理的最小文件年龄",
  RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS: "写缓存后延迟触发清理的时间",
  RESULT_CACHE_CLEANUP_INTERVAL_MS: "缓存定期清理间隔",
  VIDEO_BILLING_GATEWAY_REQUIRED: "视频是否强制走计费网关",
  VIDEO_ROUTE_SESSION_TTL_MS: "视频路由会话有效期",
  RESULT_CACHE_CONTROL: "结果图的 Cache-Control 响应头",
  GENERATION_LOG_MAX_BYTES: "生成日志单文件上限",
  RUNTIME_LOG_MAX_BYTES: "运行时日志单文件上限",
  ASSET_LOG_MAX_BYTES: "资源日志单文件上限"
};

const current = Object.fromEntries(
  Object.keys(config).sort().map((key) => [key, config[key]])
);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (wantUpdate) {
  const next = {
    _说明: "server/core/runtime-config.js 的默认值基线。改动请用 node scripts/verify/runtime-config-baseline-check.mjs --update 更新，并在提交信息里说明理由。",
    常量: Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, { 值: value, 含义: LABELS[key] || "" }])
    )
  };
  writeFileSync(baselineFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`基线已写入 ${Object.keys(current).length} 个常量：${path.relative(projectRoot, baselineFile)}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
} catch {
  fail(`读不到基线文件 ${baselineFile}\n先跑一次：node scripts/verify/runtime-config-baseline-check.mjs --update`);
}

const expected = baseline.常量 || {};
const failures = [];
const rows = [];

for (const key of Object.keys(expected)) {
  const want = expected[key]?.值;
  const got = current[key];
  const same = Object.is(want, got);
  if (!same) failures.push({ key, want, got, label: expected[key]?.含义 || "" });
  rows.push(`  ${same ? "✓" : "✗"} ${key.padEnd(44)} 基线=${String(want)}  当前=${String(got)}${expected[key]?.含义 ? `   ${expected[key].含义}` : ""}`);
}
for (const key of Object.keys(current)) {
  if (!(key in expected)) failures.push({ key, want: "(基线里没有)", got: current[key], label: LABELS[key] || "" });
}

if (jsonMode) {
  console.log(JSON.stringify({
    ok: failures.length === 0,
    total: Object.keys(expected).length,
    failed: failures.length,
    failures
  }, null, 2));
} else {
  console.log(`运行时配置基线检查：比对 ${Object.keys(expected).length} 个常量，漂移 ${failures.length} 个`);
  console.log(rows.join("\n"));
  if (failures.length > 0) {
    console.log("\n以下常量的默认值发生了变化：");
    for (const item of failures) {
      console.log(`  ✗ ${item.key}${item.label ? `（${item.label}）` : ""}`);
      console.log(`      基线=${String(item.want)}  现在=${String(item.got)}`);
    }
    console.log("\n如果是有意调参，请跑：node scripts/verify/runtime-config-baseline-check.mjs --update");
    console.log("并在提交信息里写清为什么改 —— 这些值都是历史实测调校出来的。");
  }
}

process.exit(failures.length === 0 ? 0 : 1);
