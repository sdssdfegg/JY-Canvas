// release-seed-sync-check.mjs —— V123 封装自动同步机制静态门禁（纯进程内、不 spawn、不依赖运行服务）。
//
// 覆盖执行单 §1.6 的四条静态断言：
//   a) src/api/ 存在 seed 薄封装（syncSeedManifest / fetchSeedSyncStatus），且 src/shared/release-seed.js
//      无裸 fetch（P7-1 / V121-R1 口径延伸：网络出口只此一处）；
//   b) server/routes/seed.routes.js 存在「非 public 模式」守卫（process.env.NODE_ENV === "production" return），
//      且 server/app.js 注册了 registerSeedRoutes（保证 public 打包经 esbuild define 死代码消除）；
//   c) scripts/secure-win-release.mjs 含 seed/manifest.json 默认读取分支（仓库真相源，缺失硬失败）；
//   d) 若仓库已存在 seed/manifest.json：Node 侧过 schema 校验（entry id 合法 + 无凭据字段 +
//      无生图记录字段（V126 红线②）+ sanitize 后与落盘逐字一致 + seedId 重算一致）——防手编坏文件入 git。
//
// 退出码：通过 0 / 失败 1。

import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const seedApiPath = path.join(repoRoot, "src/api/seed.js");
const releaseSeedPath = path.join(repoRoot, "src/shared/release-seed.js");
const seedRoutePath = path.join(repoRoot, "server/routes/seed.routes.js");
const appPath = path.join(repoRoot, "server/app.js");
const buildScriptPath = path.join(repoRoot, "scripts/secure-win-release.mjs");
const schemaPath = path.join(repoRoot, "src/shared/release-seed-schema.js");
const repoSeedPath = path.join(repoRoot, "seed", "manifest.json");

const failures = [];
function assert(cond, label, detail) {
  if (cond) {
    console.log("  ok   " + label);
  } else {
    failures.push({ label, detail });
    console.log("  FAIL " + label + "  =>  " + detail);
  }
}
function readText(p) {
  return readFileSync(p, "utf8");
}

console.log("[release-seed-sync-check] 仓库根推断: " + repoRoot);

// ---- a) src/api/ 存在 seed 薄封装 + release-seed.js 无裸 fetch ----
console.log("[a] src/api/seed.js 薄封装存在 + release-seed.js 无裸 fetch");
assert(existsSync(seedApiPath), "src/api/seed.js 存在", "未找到 " + seedApiPath);
const seedApiSrc = existsSync(seedApiPath) ? readText(seedApiPath) : "";
assert(/export\s+(async\s+)?function\s+syncSeedManifest\b/.test(seedApiSrc),
  "seed.js 导出 syncSeedManifest", "未在 src/api/seed.js 找到 export syncSeedManifest");
assert(/export\s+(async\s+)?function\s+fetchSeedSyncStatus\b/.test(seedApiSrc),
  "seed.js 导出 fetchSeedSyncStatus", "未在 src/api/seed.js 找到 export fetchSeedSyncStatus");
assert(!/(?<![\w$.])fetch\s*\(/.test(seedApiSrc),
  "seed.js 无裸 fetch（走 client.js 准入层）", "src/api/seed.js 出现裸 fetch");

const seedSrc = existsSync(releaseSeedPath) ? readText(releaseSeedPath) : "";
assert(seedSrc.includes("api/seed.js"),
  "release-seed.js 经 src/api/seed.js 准入层同步", "release-seed.js 未 import ../api/seed.js");
assert(!/(?<![\w$.])fetch\s*\(/.test(seedSrc),
  "release-seed.js 无裸 fetch（V121-R1 口径延伸）", "release-seed.js 出现裸 fetch——同步应走 api/seed.js");
assert(/export\s+(async\s+)?function\s+syncReleaseSeed\b/.test(seedSrc),
  "release-seed.js 导出 syncReleaseSeed", "未在 release-seed.js 找到 export syncReleaseSeed");

// ---- b) server 路由非 public 模式守卫 + app.js 注册 ----
console.log("[b] server/routes/seed.routes.js 非 public 守卫 + app.js 注册");
const routeSrc = existsSync(seedRoutePath) ? readText(seedRoutePath) : "";
assert(existsSync(seedRoutePath), "server/routes/seed.routes.js 存在", "未找到 " + seedRoutePath);
assert(/process\.env\.NODE_ENV\s*===\s*"production"/.test(routeSrc),
  "路由含 NODE_ENV===\"production\" 守卫（public 打包死代码消除）",
  "seed.routes.js 未守卫 process.env.NODE_ENV===\"production\"（public 构建会泄漏该路由）");
assert(/\/api\/seed-sync/.test(routeSrc), "路由登记 /api/seed-sync", "seed.routes.js 未出现 /api/seed-sync");
assert(/export\s+function\s+registerSeedRoutes\b/.test(routeSrc),
  "导出 registerSeedRoutes", "seed.routes.js 未导出 registerSeedRoutes");
const appSrc = readText(appPath);
assert(/registerSeedRoutes/.test(appSrc), "server/app.js 注册 registerSeedRoutes", "app.js 未调用 registerSeedRoutes(app)");
assert(/import\s*\{[^}]*registerSeedRoutes[^}]*\}\s*from\s*["']\.\/routes\/seed\.routes\.js["']/.test(appSrc),
  "app.js import 了 seed.routes.js", "app.js 未 import ./routes/seed.routes.js");

// ---- c) secure-win-release.mjs 含 seed/manifest.json 默认读取分支 ----
console.log("[c] secure-win-release.mjs 含 seed/manifest.json 默认读取分支");
const buildSrc = readText(buildScriptPath);
assert(buildSrc.includes('"seed", "manifest.json"') || buildSrc.includes("seed/manifest.json"),
  "构建脚本默认读取仓库 seed/manifest.json", "secure-win-release.mjs 未默认读取 seed/manifest.json");
assert(buildSrc.includes("JINGYIN_SEED_ALLOW_MISSING"),
  "构建脚本支持 JINGYIN_SEED_ALLOW_MISSING 放行开关",
  "secure-win-release.mjs 未处理 JINGYIN_SEED_ALLOW_MISSING（缺失种子应硬失败，仅此开关放行）");

// ---- d) 若仓库存在 seed/manifest.json：Node 侧过 schema 校验 ----
console.log("[d] 仓库 seed/manifest.json（若存在）过 schema 校验");
if (!existsSync(repoSeedPath)) {
  console.log("  skip 仓库尚未生成 seed/manifest.json（开发者尚未点「同步到封装配置」）—— 不校验");
} else {
  const schema = await import(pathToFileURL(schemaPath).href + "?t=" + Date.now());
  let manifest;
  try {
    manifest = JSON.parse(readText(repoSeedPath));
  } catch (e) {
    assert(false, "seed/manifest.json 是合法 JSON", "解析失败：" + e.message);
    manifest = null;
  }
  if (manifest) {
    assert(manifest.version === 1, "version === 1", "version 应为 1，实际 " + JSON.stringify(manifest.version));
    const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
    assert(entries.length > 0, "entries 为非空数组", "entries 为空（手编坏文件？）");
    const badId = entries.find((e) => !schema.SEED_ENTRY_IDS.includes(e?.id));
    assert(!badId, "所有 entry id 合法", "非法 entry id：" + (badId?.id || "（无）"));
    assert(schema.containsCredentialFields(manifest) === false,
      "无凭据字段（apiKey/baseUrl/channelId）", "种子含凭据字段，违反红线①");
    assert(schema.containsImageRecords(manifest) === false,
      "无生图记录字段（图片名/图片槽位/任务历史，V126 红线②）", "种子含生图记录字段，违反红线②");
    // sanitize 后与落盘逐字一致 + seedId 重算一致（防手编坏文件）。
    // sanitize 管线与 server/routes/seed.routes.js 的 sanitizeManifestEntries 同口径（V126 起）：
    //   outfit-pages → sanitizeOutfitPage 映射；presets → sanitizePromptPreset 映射；
    //   outfit-settings → stripImageRecords∘stripCredentials；其余 → stripImageRecords。
    const sanitizeEntries = (ents) => ents.map((entry) => {
      const { id, value } = entry;
      if (id === "outfit-pages") {
        return { id, value: (Array.isArray(value) ? value.map(schema.sanitizeOutfitPage).filter(Boolean) : []) };
      }
      if (id === "main-prompt-presets" || id === "outfit-prompt-presets") {
        return { id, value: (Array.isArray(value) ? value.map(schema.sanitizePromptPreset).filter(Boolean) : []) };
      }
      if (id === "outfit-settings") {
        return { id, value: schema.stripImageRecords(schema.stripCredentials(value && typeof value === "object" ? value : {})) };
      }
      return { id, value: schema.stripImageRecords(value) };
    });
    const sanitized = sanitizeEntries(entries);
    assert(JSON.stringify(sanitized) === JSON.stringify(entries),
      "落盘 entries 经 sanitize 后逐字一致（未被手编污染）",
      "落盘 entries 与 sanitize 后不一致——可能手编坏文件");
    const recomputed = schema.fnv1a32Hex(JSON.stringify(sanitized));
    assert(String(manifest.seedId || "") === recomputed,
      "seedId 与 entries 重算一致", `seedId=${manifest.seedId} 但重算=${recomputed}`);
  }
}

if (failures.length > 0) {
  console.error("\n[release-seed-sync-check] 失败 " + failures.length + " 项：");
  for (const f of failures) {
    console.error("  - " + f.label + ": " + f.detail);
  }
  process.exit(1);
}
console.log("\n[release-seed-sync-check] ok:true");
process.exit(0);
