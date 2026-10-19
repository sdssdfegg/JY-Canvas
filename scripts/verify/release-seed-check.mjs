// release-seed-check.mjs —— V121 封装种子机制静态门禁（纯进程内、不 spawn、不依赖运行服务）。
//
// 覆盖执行单 §1.6 的五条静态断言：
//   1) src/shared/release-seed.js 导出 importReleaseSeed / buildReleaseSeed / downloadReleaseSeed；
//   2) storage-store.js 的 publicReleaseStorageResetPromise 链路含 importReleaseSeed；
//   3) 白名单/剥凭据字段清单与 §1.2 一致（pages 禁项 6 个、prompt 5 字段、凭据 3 键）；
//   4) 种子导入的「仅空库」守卫 + 一次性标记键格式存在（防回归成覆盖式导入）；
//   4b) 网络出口收口：release-seed.js 无裸 fetch，种子读取走 src/api/assets.js 的 fetchSeedManifest
//       （V121-R1 统筹裁决，P7-6「网络出口只此一处」口径，防止用基线豁免重开已决问题的口子）；
//   5) secure-win-release.mjs 含 JINGYIN_SEED_FILE 且复制点早于 generate-static-assets。
//
// 退出码：通过 0 / 失败 1。

import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const releaseSeedPath = path.join(repoRoot, "src/shared/release-seed.js");
const storageStorePath = path.join(repoRoot, "src/features/storage/storage-store.js");
const schemaPath = path.join(repoRoot, "src/shared/release-seed-schema.js");
const buildScriptPath = path.join(repoRoot, "scripts/secure-win-release.mjs");

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

console.log("[release-seed-check] 仓库根推断: " + repoRoot);

// ---- 1) release-seed.js 存在且导出三个函数 ----
console.log("[1] src/shared/release-seed.js 导出 importReleaseSeed / buildReleaseSeed / downloadReleaseSeed");
assert(existsSync(releaseSeedPath), "release-seed.js 存在", "未找到 " + releaseSeedPath);
const seedSrc = existsSync(releaseSeedPath) ? readText(releaseSeedPath) : "";
assert(/export\s+(async\s+)?function\s+importReleaseSeed\b/.test(seedSrc), "导出 importReleaseSeed", "未在 release-seed.js 找到 export importReleaseSeed");
assert(/export\s+(async\s+)?function\s+buildReleaseSeed\b/.test(seedSrc), "导出 buildReleaseSeed", "未在 release-seed.js 找到 export buildReleaseSeed");
assert(/export\s+(async\s+)?function\s+downloadReleaseSeed\b/.test(seedSrc), "导出 downloadReleaseSeed", "未在 release-seed.js 找到 export downloadReleaseSeed");

// ---- 2) storage-store.js 链路含 importReleaseSeed ----
console.log("[2] storage-store.js 的 publicReleaseStorageResetPromise 链路含 importReleaseSeed");
const storeSrc = readText(storageStorePath);
assert(/publicReleaseStorageResetPromise\s*=.*\.then\(\(\)\s*=>\s*importReleaseSeed\(\)\)/s.test(storeSrc),
  "reset 之后链式调用 importReleaseSeed()",
  "未找到 `runPublicReleaseStorageReset().then(() => importReleaseSeed())` 形态");
assert(/import\s*\{[^}]*importReleaseSeed[^}]*\}\s*from\s*["']\.\.\/\.\.\/shared\/release-seed\.js["']/.test(storeSrc),
  "storage-store.js import 了 importReleaseSeed",
  "storage-store.js 未从 ../../shared/release-seed.js 导入 importReleaseSeed");

// ---- 3) 白名单/剥凭据字段清单与 §1.2 一致（从单一实现 release-seed-schema.js 抓取比对）----
console.log("[3] 白名单/剥凭据字段清单与 §1.2 一致（pages 禁项 6 / prompt 5 / 凭据 3）");
const schema = await import(pathToFileURL(schemaPath).href + "?t=" + Date.now());
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
assert(eq(schema.CREDENTIAL_FIELDS, ["apiKey", "baseUrl", "channelId"]),
  "凭据剥除字段 = [apiKey, baseUrl, channelId]", JSON.stringify(schema.CREDENTIAL_FIELDS));
assert(eq(schema.PROMPT_PRESET_ALLOWED_FIELDS, ["id", "title", "category", "content", "custom"]),
  "提示词白名单 = [id, title, category, content, custom]", JSON.stringify(schema.PROMPT_PRESET_ALLOWED_FIELDS));
assert(eq(schema.OUTFIT_PAGE_FORBIDDEN_FIELDS, ["modelImages", "clothingImages", "referenceImages", "originalLibrary", "fixedClothingId", "tasks"]),
  "页面禁项 = 6 个 C 类字段", JSON.stringify(schema.OUTFIT_PAGE_FORBIDDEN_FIELDS));

// ---- 4) 「仅空库」守卫 + 一次性标记键格式 ----
console.log("[4] 种子导入的仅空库守卫 + 一次性标记键格式存在");
assert(seedSrc.includes("seed-imported-"), "一次性标记键含 seed-imported- 前缀", "未找到 seed-imported- 前缀（应为 STORAGE_PREFIX-seed-imported- 形态）");
assert(/readJsonStorage\(markerKey,\s*null\)\s*===\s*seedId/.test(seedSrc),
  "已导过同 seedId 的种子则跳过", "未找到一次性标记等值比对");
assert(seedSrc.includes("isEmpty"), "存在「仅空库才写入」的 isEmpty 守卫", "未找到 isEmpty 守卫变量");
assert(/if\s*\(isEmpty\)\s*\{[\s\S]*writeJsonStorage\(targetKey,\s*entry\.value\)/.test(seedSrc),
  "非空目标键（回头客已有数据）不覆盖", "未找到 `if (isEmpty) { writeJsonStorage(targetKey, entry.value) }` 守卫");

// ---- 4b) 网络出口收口（V121-R1 统筹裁决：P7-6「网络出口只此一处」，不许在共享模块裸 fetch）----
console.log("[4b] release-seed.js 不裸 fetch，种子读取走 src/api/ 准入层");
assert(!/(?<![\w$.])fetch\s*\(/.test(seedSrc),
  "release-seed.js 无裸 fetch 调用", "release-seed.js 出现裸 fetch——种子读取应走 api/assets.js 的 fetchSeedManifest（V121-R1 裁决）");
const assetsSrc = readText(path.join(repoRoot, "src/api/assets.js"));
assert(/export\s+async\s+function\s+fetchSeedManifest\b/.test(assetsSrc),
  "api/assets.js 导出 fetchSeedManifest", "未在 src/api/assets.js 找到 fetchSeedManifest（网络出口唯一收口点）");
assert(seedSrc.includes("fetchSeedManifest"),
  "release-seed.js 经准入层读种子", "release-seed.js 未引用 fetchSeedManifest");

// ---- 5) secure-win-release.mjs 含 JINGYIN_SEED_FILE 且复制点早于 generate-static-assets ----
console.log("[5] secure-win-release.mjs 含 JINGYIN_SEED_FILE 且复制点早于 generate-static-assets");
const buildSrc = readText(buildScriptPath);
assert(buildSrc.includes("JINGYIN_SEED_FILE"), "构建脚本读取 JINGYIN_SEED_FILE", "未找到 JINGYIN_SEED_FILE");
assert(buildSrc.includes("dist/seed/manifest.json"), "种子复制为 dist/seed/manifest.json", "未找到 dist/seed/manifest.json 复制点");
assert(buildSrc.includes("release-seed-schema.js"), "构建校验复用 release-seed-schema.js（单一实现）", "构建脚本未 import release-seed-schema.js");
const seedCopyIdx = buildSrc.indexOf("dist/seed/manifest.json");
const genIdx = buildSrc.indexOf("generate-static-assets.mjs");
assert(seedCopyIdx >= 0 && genIdx >= 0 && seedCopyIdx < genIdx,
  "种子复制点早于 generate-static-assets（保证随 SEA 内嵌）",
  `seedCopyIdx=${seedCopyIdx}, genIdx=${genIdx}`);

if (failures.length > 0) {
  console.error("\n[release-seed-check] 失败 " + failures.length + " 项：");
  for (const f of failures) {
    console.error("  - " + f.label + ": " + f.detail);
  }
  process.exit(1);
}
console.log("\n[release-seed-check] ok:true");
process.exit(0);
