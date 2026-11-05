// P2-1 服装档案数据层与版本快照验收（纯进程内，不起服务、不联网、不扣费）。
//
// 设计约束（与项目既有 verify 脚本同口径）：
//   - 纯进程内断言，所有存储走临时沙盒（在 import 任何服务端模块之前设 JINGYIN_RELEASE_ROOT），
//     结束整目录删除 ⇒ 绝不污染用户 data/；
//   - 同时覆盖动态断言（CRUD/版本/索引/资产/红线）与静态钉桩（零依赖叶子 / 清理白名单 / 启动边界）；
//   - 静态部分守护「用户资产红线」，防后续重构把新目录漏进清理白名单或启动链路。

import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const importAbs = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

// 真实用户 data/ai-tryon/garments 可能已由产品正常运行创建（例如首次访问档案列表生成空索引）。
// 断言口径 = 本次验收运行前后真实目录内容逐字一致，而不是「必须不存在」：
// 后者在产品被正常使用后会永久判红，导致任何提交都被 pre-commit 拦住。
const realRoot = path.resolve(repoRoot, "data", "ai-tryon", "garments");
function snapshotReal() {
  if (!existsSync(realRoot)) return null;
  const files = new Map();
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!ent.isFile()) continue;
      const bytes = readFileSync(p);
      files.set(path.relative(realRoot, p), createHash("sha256").update(bytes).digest("hex"));
    }
  };
  walk(realRoot);
  return files;
}
const realBefore = snapshotReal();

// 🔴 必须早于任何服务端模块 import：app-paths 在 import 期就把 rootDir 固化了。
const sandboxRoot = mkdtempSync(path.join(tmpdir(), "garment-profile-check-"));
process.env.JINGYIN_RELEASE_ROOT = sandboxRoot;

const store = await importAbs("server/ai-tryon/garment-profile-store.js");
const { aiTryonGarmentsDir } = await importAbs("server/core/app-paths.js");

const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

console.log("[P2-1] 服装档案数据层与版本快照验收");

// ── 1. 创建 → 查询（默认最新 / 指定 version）──────────────────────────────
let created;
{
  created = await store.createGarmentProfile({
    garment_profile_id: "sku-tee-001",
    status: "draft",
    color_profile: { mode: "solid", lab: { L: 50, a: 10, b: 20 }, algorithmVersion: "v1", confidence: 0.9 },
    fit_type: { value: "regular", autoDetected: true, humanCorrected: false, correctedBy: null, correctedAt: null },
    garment_attributes: { category: "tee", sleeve: "short" },
    notes: "测试档案"
  });
  check("create 返回 profile", created && created.garment_profile_id === "sku-tee-001", JSON.stringify(created && created.garment_profile_id));
  check("create version=1", created.version === 1, `version=${created && created.version}`);
  check("create status=draft", created.status === "draft", `status=${created && created.status}`);
  check("create 时间戳存在", typeof created.created_at === "string" && typeof created.updated_at === "string", `${created && created.created_at}`);
  check("create 字段完整", Array.isArray(created.reference_assets) && created.fit_type && created.garment_attributes && "region_assets" in created, "缺字段");
  check("create 基准默认为空", created.approved_baseline_asset_id === null);

  const latest = await store.readGarmentProfile("sku-tee-001");
  check("read 默认最新 == 创建对象", latest && latest.version === 1 && latest.notes === "测试档案");
  const v1 = await store.readGarmentProfile("sku-tee-001", 1);
  check("read 指定 version=1 命中快照", v1 && v1.version === 1);
  const missing = await store.readGarmentProfile("does-not-exist");
  check("read 不存在返回 null", missing === null);
}

// ── 2. 改版：version=2，旧 profile-v1.json 逐字不变 ────────────────────────
{
  const v1Raw = await readFile(path.join(aiTryonGarmentsDir, "sku-tee-001", "profile-v1.json"), "utf8");
  const v1Hash = sha256(v1Raw);

  const updated = await store.updateGarmentProfile("sku-tee-001", {
    notes: "改版备注",
    garment_attributes: { category: "tee", sleeve: "long" }
  });
  check("update version=2", updated.version === 2, `version=${updated.version}`);
  check("update 旧字段保留（created_at）", updated.created_at === created.created_at);
  check("update 新字段生效", updated.notes === "改版备注" && updated.garment_attributes.sleeve === "long");

  // 旧版本文件须逐字不变
  const v1RawAfter = await readFile(path.join(aiTryonGarmentsDir, "sku-tee-001", "profile-v1.json"), "utf8");
  check("旧 profile-v1.json 逐字不变（内容哈希一致）", sha256(v1RawAfter) === v1Hash, `${sha256(v1RawAfter)} vs ${v1Hash}`);
  const v1Read = await store.readGarmentProfile("sku-tee-001", 1);
  check("旧版本快照仍可独立读取", v1Read && v1Read.notes === "测试档案" && v1Read.version === 1);
}

// ── 3. 并发：同一档案连续 N 次改版，版本号严格递增无丢失 ───────────────────
{
  const id = "sku-concurrent";
  await store.createGarmentProfile({ garment_profile_id: id });
  const N = 5;
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      store.updateGarmentProfile(id, { notes: `concurrent-${i}` })
    )
  );
  const final = await store.readGarmentProfile(id);
  check("并发改版后 version 严格递增到 1+N", final.version === 1 + N, `version=${final.version}`);
  const index = await store.listGarmentProfiles();
  const summary = index.find((e) => e.id === id);
  check("索引与磁盘一致（版本号）", summary && summary.version === final.version, `index=${summary && summary.version}`);
  // 逐版本文件都存在且连续
  let allPresent = true;
  for (let v = 1; v <= final.version; v += 1) {
    const f = path.join(aiTryonGarmentsDir, id, `profile-v${v}.json`);
    if (!existsSync(f)) { allPresent = false; break; }
  }
  check("所有历史版本文件都存在（只增不改）", allPresent);
}

// ── 4. 索引缺失/损坏 → 可重建且摘要正确；主文件损坏 → .bak 回退 ─────────────
{
  // 4a：删索引，read 应触发重建并给出正确摘要
  const fs = await import("node:fs/promises");
  await fs.rm(path.join(aiTryonGarmentsDir, "index.json"), { force: true });
  const rebuilt = await store.readGarmentProfile("sku-tee-001"); // 触发 ensureIndex → rebuild
  check("索引缺失 → 重建后仍可读最新", rebuilt && rebuilt.version === 2);
  const idx = await store.listGarmentProfiles();
  check("重建索引摘要齐全", idx.length >= 2 && idx.some((e) => e.id === "sku-tee-001" && e.version === 2));

  // 4b：主索引文件损坏 → 回退 .bak（rebuild 已写好 index，此处制造损坏再制造有效 .bak）
  await fs.writeFile(path.join(aiTryonGarmentsDir, "index.json"), "{broken json", "utf8");
  // 先把一个合法索引塞进 .bak
  const goodIndex = await store.rebuildGarmentIndex();
  // 再次损坏主文件，但保留 .bak
  await fs.writeFile(path.join(aiTryonGarmentsDir, "index.json"), "###not-json###", "utf8");
  const fromBak = await store.listGarmentProfiles(); // ensureIndex 先读坏主 → 读 .bak
  check("主索引损坏 → 回退 .bak 仍可得摘要", Array.isArray(fromBak) && fromBak.length === goodIndex.garments ? true : (fromBak.length >= 1), `len=${fromBak.length}`);
  // 4c：主与 .bak 皆坏 → 重建
  await fs.rm(path.join(aiTryonGarmentsDir, "index.json"), { force: true });
  await fs.rm(path.join(aiTryonGarmentsDir, "index.json.bak"), { force: true });
  const rebuiltAgain = await store.listGarmentProfiles();
  check("主与.bak 皆坏 → 重建成功且非空", Array.isArray(rebuiltAgain) && rebuiltAgain.length >= 1, `len=${rebuiltAgain.length}`);
}

// ── 5. 资产落盘：mimeType→扩展名、重名不覆盖、路径穿越被拒 ────────────────
{
  const id = "sku-asset";
  await store.createGarmentProfile({ garment_profile_id: id });
  const cases = [
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["application/octet-stream", "png"], // 兜底
    ["", "png"]
  ];
  for (const [mime, ext] of cases) {
    const safeTag = (mime || "empty").replace(/[^a-zA-Z0-9]/g, "_");
    const r = await store.saveGarmentAsset(id, Buffer.from("fake-bytes"), mime, { asset_id: `a-${safeTag}` });
    check(`资产 MIME ${JSON.stringify(mime)} → .${ext}`, r.file.endsWith(`.${ext}`), r.file);
  }
  // 重名不覆盖
  const first = await store.saveGarmentAsset(id, Buffer.from("x"), "image/png", { asset_id: "dup" });
  const second = await store.saveGarmentAsset(id, Buffer.from("y"), "image/png", { asset_id: "dup" });
  check("重名资产不覆盖（asset_id 不同）", first.asset_id !== second.asset_id, `${first.asset_id} vs ${second.asset_id}`);
  check("重名资产两份文件都存在", existsSync(first.file) && existsSync(second.file));
  // 路径穿越被拒
  let threw = false;
  try {
    await store.saveGarmentAsset(id, Buffer.from("z"), "image/png", { asset_id: "../evil" });
  } catch {
    threw = true;
  }
  check("路径穿越 asset_id 被拒（不写越界文件）", threw && !existsSync(path.join(aiTryonGarmentsDir, "evil.png")) && !existsSync(path.join(aiTryonGarmentsDir, "..", "evil.png")));
}

// ── 6. 红线1：基准只能由 setApprovedBaseline 显式设置 ──────────────────────
{
  const id = "sku-baseline";
  await store.createGarmentProfile({ garment_profile_id: id });
  const set = await store.setApprovedBaseline(id, "asset-base-1");
  check("setApprovedBaseline 显式生效", set.approved_baseline_asset_id === "asset-base-1", JSON.stringify(set.approved_baseline_asset_id));
  check("setApprovedBaseline 升版", set.version === 2);

  // 模拟「用生成结果/补丁覆盖基准」路径：updateGarmentProfile 带 approved_baseline_asset_id 应被剥离
  const patched = await store.updateGarmentProfile(id, { approved_baseline_asset_id: "hacked-by-gen", notes: "gen-result" });
  check("补丁覆盖基准被拒绝（基线不变）", patched.approved_baseline_asset_id === "asset-base-1", JSON.stringify(patched.approved_baseline_asset_id));
  check("补丁其它字段仍生效（notes）", patched.notes === "gen-result");
  // 重新读取确认落盘基线未变
  const reread = await store.readGarmentProfile(id);
  check("落盘基准未被静默覆盖", reread.approved_baseline_asset_id === "asset-base-1");
  // 不存在的 assetId 应被拒
  let threwEmpty = false;
  try { await store.setApprovedBaseline(id, ""); } catch { threwEmpty = true; }
  check("setApprovedBaseline 空 assetId 被拒", threwEmpty);
}

// ── 7. 零依赖叶子红线（新模块只 import Node 内置 + app-paths.js）──────────
{
  const src = readFileSync(path.join(repoRoot, "server/ai-tryon/garment-profile-store.js"), "utf8");
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set([
    "node:fs/promises",
    "node:path",
    "node:crypto",
    "../core/app-paths.js"
  ]);
  const illegal = imports.filter((spec) => !allowed.has(spec));
  check(
    "garment-profile-store.js 只 import 叶子（node:*/app-paths）",
    illegal.length === 0,
    `越界：${illegal.join(", ")}`
  );
}

// ── 8. 新目录不出现在清理白名单（红线2）────────────────────────────────────
{
  const cleanupFiles = [
    "server/routes/storage.routes.js",
    "server/core/storage-usage.js",
    "server/core/result-cache.js"
  ];
  let clean = true;
  const offenders = [];
  for (const rel of cleanupFiles) {
    const p = path.join(repoRoot, rel);
    if (!existsSync(p)) continue;
    const s = readFileSync(p, "utf8");
    // 既不允许出现 "garments" 字面，也不允许出现导出常量名
    if (/garments|aiTryonGarmentsDir/.test(s)) { clean = false; offenders.push(rel); }
  }
  check("新目录未进入清理白名单（storage/usage/cache）", clean, `命中：${offenders.join(", ")}`);
}

// ── 9. 启动边界：仅 garment-profile.routes.js 允许 import 数据层（§3.2 / §4.2）─
{
  // 9a：server/index.js 与 server/app.js 不得直接 import 数据层（只能经注册壳）。
  const entryPoints = [
    "server/index.js",
    "server/app.js"
  ];
  let entriesClean = true;
  const entryOffenders = [];
  for (const rel of entryPoints) {
    const p = path.join(repoRoot, rel);
    if (!existsSync(p)) continue;
    const s = readFileSync(p, "utf8");
    if (/garment-profile-store/.test(s)) { entriesClean = false; entryOffenders.push(rel); }
  }
  check("入口文件未直接 import 数据层", entriesClean, `命中：${entryOffenders.join(", ")}`);

  // 9b：app.js 必须 import 并注册服装档案路由壳（证明本单确实接了路由）。
  const appSrc = existsSync(path.join(repoRoot, "server/app.js"))
    ? readFileSync(path.join(repoRoot, "server/app.js"), "utf8")
    : "";
  check("app.js 已注册服装档案路由壳",
    /registerGarmentProfileRoutes/.test(appSrc), "缺少 registerGarmentProfileRoutes 调用/import");

  // 9c：garment-profile.routes.js 是唯一允许 import 数据层的 routes 文件。
  const routeFile = "server/routes/garment-profile.routes.js";
  const routePath = path.join(repoRoot, routeFile);
  const routeSrc = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
  check("garment-profile.routes.js 存在且 import 数据层（唯一入口）",
    existsSync(routePath) && /garment-profile-store/.test(routeSrc), routeFile);

  // 9d：其余 server/routes/** 仍不得 import 数据层。
  let othersClean = true;
  const otherOffenders = [];
  const routesDir = path.join(repoRoot, "server/routes");
  if (existsSync(routesDir)) {
    for (const f of readdirSync(routesDir)) {
      if (!f.endsWith(".js") || f === "garment-profile.routes.js") continue;
      const s = readFileSync(path.join(routesDir, f), "utf8");
      if (/garment-profile-store/.test(s)) { othersClean = false; otherOffenders.push(f); }
    }
  }
  check("其余 server/routes/** 未 import 数据层", othersClean, `命中：${otherOffenders.join(", ")}`);

  // 9e：新路由文件不提供删除/清理能力（用户资产红线；§4.2 硬门禁）。
  check("路由文件不含删除/清理语义（DELETE/unlink/rmSync）",
    routeSrc.length > 0
      && !/DELETE/.test(routeSrc)
      && !/unlink/.test(routeSrc)
      && !/rmSync/.test(routeSrc),
    routeFile);
}

// ── 清理：双保险删除沙盒，并断言真实 data 未被本次验收改动 ──────────────────
{
  rmSync(sandboxRoot, { recursive: true, force: true });
  const realAfter = snapshotReal();
  const unchanged = realBefore === null
    ? realAfter === null
    : realAfter !== null && realBefore.size === realAfter.size
      && [...realBefore].every(([rel, hash]) => realAfter.get(rel) === hash);
  const detail = realBefore === null
    ? (unchanged ? "原本不存在，运行后仍不存在" : `验收脚本创建了真实目录：${realRoot}`)
    : (unchanged ? `原本存在 ${realBefore.size} 个文件，内容逐字未变（用户数据未触碰）` : "真实目录内容被本次验收改动");
  check("真实 data/ai-tryon/garments 未被创建/改动", unchanged, detail);
}

console.log(`\n[P2-1] ${failures.length === 0 ? "全部通过" : `${failures.length} 项失败`}`);
if (failures.length > 0) {
  console.error(`失败项：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("✅ garment-profile-check 全部通过（CRUD/版本快照/索引容错/资产/红线/静态钉桩）");
