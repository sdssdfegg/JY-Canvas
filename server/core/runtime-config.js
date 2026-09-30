// 运行时配置层：所有可由环境变量调节的阈值、超时、并发上限、缓存策略。
//
// 从 server/index.js 原样搬来（原第 125~186 行），**没有任何逻辑改动**，
// 连默认值和 clamp 边界都保持逐字一致。
//
// 为什么要单独成文件：
//   这些常量散落在原文件中间，和 5000 行路由代码混在一起时，
//   "一次出图最多等多久""结果缓存留几天""最多几个并发"这类一切都查不到。
//   集中之后，调参只需看这一个文件，不动任何业务代码。
//
// 约定：
//   - 全部导出为具名常量（不是配置对象），保持调用点写法不变，降低搬运风险；
//   - 计算顺序有意义（后者依赖前者），新增常量请追加在依赖它之后；
//   - 默认值来自历史实测调校，**改默认值等于改出图行为**，务必谨慎。

const IMAGE_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.IMAGE_REQUEST_TIMEOUT_MS || "900000", 10);
const IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(IMAGE_REQUEST_TIMEOUT_MS, Number.parseInt(process.env.IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS || "360000", 10) || 360_000)
);
const LOCAL_HTTP_TIMEOUT_MS = Number.parseInt(process.env.LOCAL_HTTP_TIMEOUT_MS || "960000", 10);
const IMAGE_PROXY_TIMEOUT_MS = Number.parseInt(process.env.IMAGE_PROXY_TIMEOUT_MS || "180000", 10);
const RESULT_DISPLAY_CACHE_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.RESULT_DISPLAY_CACHE_TIMEOUT_MS || "45000", 10) || 45000);
const RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS = Math.max(
  1500,
  Math.min(
    RESULT_DISPLAY_CACHE_TIMEOUT_MS,
    Number.parseInt(process.env.RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS || "8000", 10) || 8000
  )
);
const GATEWAY_COMPRESSION_MIN_BYTES = Number.parseInt(process.env.GATEWAY_COMPRESSION_MIN_BYTES || "1024", 10);
const DOWNLOAD_CHUNK_BYTES = Math.max(64 * 1024, Number.parseInt(process.env.DOWNLOAD_CHUNK_BYTES || "262144", 10) || 262144);
const RESULT_URL_DOWNLOAD_CHUNK_BYTES = Math.max(128 * 1024, Number.parseInt(process.env.RESULT_URL_DOWNLOAD_CHUNK_BYTES || String(1024 * 1024), 10) || 1024 * 1024);
const RESULT_URL_DOWNLOAD_RETRIES = Math.max(1, Math.min(5, Number.parseInt(process.env.RESULT_URL_DOWNLOAD_RETRIES || "3", 10) || 3));
const IMAGE_CONCURRENCY_LIMIT = Math.max(1, Math.min(24, Number.parseInt(process.env.IMAGE_CONCURRENCY_LIMIT || "5", 10) || 5));
const RESULT_CACHE_TTL_DAYS = Math.max(1, Math.min(365, Number.parseInt(process.env.RESULT_CACHE_TTL_DAYS || "7", 10) || 7));
const RESULT_CACHE_TTL_MS = RESULT_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
const RESULT_CACHE_MAX_DISK_USAGE_RATIO = Math.max(
  0.5,
  Math.min(0.98, Number.parseFloat(process.env.RESULT_CACHE_MAX_DISK_USAGE_RATIO || "0.8") || 0.8)
);
const RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS = Math.max(
  0,
  Number.parseInt(process.env.RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS || String(30 * 60 * 1000), 10) || 30 * 60 * 1000
);
const RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS = Math.max(
  5000,
  Number.parseInt(process.env.RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS || "30000", 10) || 30000
);
const RESULT_CACHE_CLEANUP_INTERVAL_MS = Math.max(
  60 * 60 * 1000,
  Number.parseInt(process.env.RESULT_CACHE_CLEANUP_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10) || 6 * 60 * 60 * 1000
);
const VIDEO_BILLING_GATEWAY_REQUIRED = /^(1|true|on|yes)$/i.test(String(process.env.JINGYIN_REQUIRE_VIDEO_BILLING_GATEWAY || "0"));
const VIDEO_ROUTE_SESSION_TTL_MS = Math.max(
  10 * 60 * 1000,
  Number.parseInt(process.env.VIDEO_ROUTE_SESSION_TTL_MS || String(4 * 60 * 60 * 1000), 10) || 4 * 60 * 60 * 1000
);
const RESULT_CACHE_CONTROL = `public, max-age=${Math.floor(RESULT_CACHE_TTL_MS / 1000)}, immutable`;
const GENERATION_LOG_MAX_BYTES = Math.max(
  1024 * 1024,
  Number.parseInt(process.env.JINGYIN_GENERATION_LOG_MAX_BYTES || String(8 * 1024 * 1024), 10) || 8 * 1024 * 1024
);
const RUNTIME_LOG_MAX_BYTES = Math.max(
  512 * 1024,
  Number.parseInt(process.env.JINGYIN_RUNTIME_LOG_MAX_BYTES || String(4 * 1024 * 1024), 10) || 4 * 1024 * 1024
);
const ASSET_LOG_MAX_BYTES = Math.max(
  512 * 1024,
  Number.parseInt(process.env.JINGYIN_ASSET_LOG_MAX_BYTES || String(4 * 1024 * 1024), 10) || 4 * 1024 * 1024
);

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const PORT_FALLBACK_LIMIT = Math.max(
  0,
  Math.min(20, Number.parseInt(process.env.JINGYIN_PORT_FALLBACK_LIMIT || (process.env.PORT ? "0" : "10"), 10) || 0)
);

export {
  ASSET_LOG_MAX_BYTES,
  DOWNLOAD_CHUNK_BYTES,
  GATEWAY_COMPRESSION_MIN_BYTES,
  GENERATION_LOG_MAX_BYTES,
  IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS,
  // 每台电脑默认最多 5 个图片请求同时等待中转站，避免本机和网关一起被瞬时批量压满。
  IMAGE_CONCURRENCY_LIMIT,
  IMAGE_PROXY_TIMEOUT_MS,
  IMAGE_REQUEST_TIMEOUT_MS,
  LOCAL_HTTP_TIMEOUT_MS,
  PORT,
  PORT_FALLBACK_LIMIT,
  RESULT_CACHE_CLEANUP_INTERVAL_MS,
  RESULT_CACHE_CONTROL,
  RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS,
  RESULT_CACHE_MAX_DISK_USAGE_RATIO,
  RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS,
  RESULT_CACHE_TTL_DAYS,
  RESULT_CACHE_TTL_MS,
  RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS,
  RESULT_DISPLAY_CACHE_TIMEOUT_MS,
  RESULT_URL_DOWNLOAD_CHUNK_BYTES,
  RESULT_URL_DOWNLOAD_RETRIES,
  RUNTIME_LOG_MAX_BYTES,
  VIDEO_BILLING_GATEWAY_REQUIRED,
  VIDEO_ROUTE_SESSION_TTL_MS
};
