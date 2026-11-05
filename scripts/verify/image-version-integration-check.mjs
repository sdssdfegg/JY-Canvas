// P2-4 图片版本「生成出口 + 固化 + 只读 API」集成验收（纯进程内，不起服务、不联网、不扣费）。
//
// 设计约束（与 image-version-check.mjs 同口径）：
//   - 纯进程内断言，所有存储走临时沙盒（在 import 任何服务端模块之前设 JINGYIN_RELEASE_ROOT），
//     结束整目录删除 => 绝不污染用户 data/；
//   - 覆盖动态断言（固化落盘 / 成功+失败均写版本 / 敏感零写入 / 真实目录快照逐字一致）
//     与静态钉桩（前端 API 走 client.js 准入层 / 组件不新增 Modal / 出口响应体 tryonTaskId 不变 /
//     新路由只读无写接口）；
//   - 静态部分守护 P0 生命线与用户资产红线，防后续重构把出口写错或把资产目录漏进清理白名单。

import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const importAbs = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

// 真实用户 data/ai-tryon/{image-versions,image-version-assets} 可能已由产品正常运行创建。
// 断言口径 = 本次验收运行前后真实目录内容逐字一致，而不是必须不存在（否则产品被正常使用后会永久判红）。
function snapshotDir(realRoot) {
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
const realImageVersions = snapshotDir(path.resolve(repoRoot, "data", "ai-tryon", "image-versions"));
const realImageVersionAssets = snapshotDir(path.resolve(repoRoot, "data", "ai-tryon", "image-version-assets"));

// 必须早于任何服务端模块 import：app-paths 在 import 期就把 rootDir 固化了。
const sandboxRoot = mkdtempSync(path.join(tmpdir(), "image-version-integration-"));
process.env.JINGYIN_RELEASE_ROOT = sandboxRoot;

const bridge = await importAbs("server/ai-tryon/image-version-bridge.js");
const store = await importAbs("server/ai-tryon/image-version-store.js");
const { aiTryonImageVersionsDir, aiTryonImageVersionAssetsDir, resultDir } = await importAbs("server/core/app-paths.js");

const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    console.log("  ok - " + name);
  } else {
    failures.push(name + (detail ? " - " + detail : ""));
    console.log("  FAIL - " + name + (detail ? " - " + detail : ""));
  }
}

console.log("[P2-4] 图片版本生成出口 + 固化 + 只读 API 集成验收");

// 1. 成功出口：本地结果文件固化进永久目录，并写一条 succeeded 版本记录
let succeeded;
{
  // 在沙盒 resultDir 放一个假结果图（模拟已落盘的 HZ-*.png）
  await mkdirSync(resultDir, { recursive: true });
  const fakeName = "HZ-test-1.png";
  await writeFileSync(path.join(resultDir, fakeName), Buffer.from("fake-png-bytes"), "utf8");

  succeeded = await bridge.recordOutfitImageVersion({
    taskId: "task-int-001",
    requestId: "req-001",
    ok: true,
    model: "nano",
    channel: "tt25",
    displayImage: { localUrl: `/api/result/${fakeName}` },
    files: [{ originalname: "model.png", size: 123 }, { originalname: "garment.png", size: 456 }],
    userInstruction: "make red dress",
    modelAndVersions: { model: "nano", channel: "tt25" },
    executionParams: { workflowMode: "outfit", imageSize: "1024x1024", apiKey: "sk-secret" }
  });
  check("成功出口返回版本记录", succeeded && typeof succeeded.version_id === "string" && succeeded.version_id.length > 0);
  check("成功出口 status=succeeded", succeeded && succeeded.status === "succeeded");
  check("成功出口 parent_version_id 为 null（根）", succeeded && succeeded.parent_version_id === null);
  check("成功出口写入固化资产引用（result_asset_ref 非空）", succeeded && typeof succeeded.result_asset_ref === "string" && succeeded.result_asset_ref.length > 0);
  // 固化文件真实存在
  const assetPath = succeeded && path.join(aiTryonImageVersionAssetsDir, succeeded.result_asset_ref);
  check("固化资产文件真实落盘", assetPath && existsSync(assetPath) && readFileSync(assetPath, "utf8") === "fake-png-bytes");
  // input_asset_refs 只存名字/大小，不存 buffer
  check("成功出口 input_asset_refs 归一（2 条）", succeeded && Array.isArray(succeeded.input_asset_refs) && succeeded.input_asset_refs.length === 2);
  // 敏感键 apiKey 被剥离（红线）
  const ep = succeeded && (succeeded.execution_params || {});
  check("成功出口 execution_params 剥离 apiKey", ep && !("apiKey" in ep) && ep.workflowMode === "outfit");
  // 版本文件与索引已落盘
  check("成功出口版本文件落盘", succeeded && existsSync(path.join(aiTryonImageVersionsDir, succeeded.version_id + ".json")));
}

// 2. 失败出口：写一条 failed 版本记录，无固化资产（避免「只有成功才有历史」）
let failedRec;
{
  failedRec = await bridge.recordOutfitImageVersion({
    taskId: "task-int-001",
    requestId: "req-002",
    ok: false,
    model: "nano",
    channel: "tt25",
    error: "upstream 502"
  });
  check("失败出口返回版本记录", failedRec && typeof failedRec.version_id === "string");
  check("失败出口 status=failed", failedRec && failedRec.status === "failed");
  check("失败出口无固化资产（result_asset_ref=null）", failedRec && failedRec.result_asset_ref === null);
  check("失败出口 error 字段记录", failedRec && failedRec.error === "upstream 502");
}

// 3. 列表可读：两条记录都在，按序号倒序
{
  const list = await store.listImageVersions();
  check("列表含 2 条（成功+失败）", Array.isArray(list) && list.length === 2, "len=" + (list && list.length));
  const okRec = await store.readImageVersion(succeeded.version_id);
  check("成功记录可独立读回", okRec && okRec.status === "succeeded" && typeof okRec.result_asset_ref === "string");
}

// 4. 无 taskId 跳过记录（版本必须绑定真实任务）
{
  const skipped = await bridge.recordOutfitImageVersion({ ok: true });
  check("无 taskId 时不写版本（返回 null）", skipped === null);
}

// 5. 静态钉桩：前端 API 走 client.js 准入层（禁裸 fetch）；组件不新增 Modal；出口响应体未被改
{
  // 先剥注释，避免注释里的示例文字（如「裸写 fetch」「不新增 <Modal>」）造成误判。
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
  const apiSrc = stripComments(readFileSync(path.join(repoRoot, "src/api/image-version.js"), "utf8"));
  check("前端 API 只经 client.js（含 apiJson 导入）", /from\s+["']\.\/client\.js["']/.test(apiSrc) && /apiJson/.test(apiSrc));
  check("前端 API 无裸 fetch", !apiSrc.includes("fetch("));

  const compSrc = stripComments(readFileSync(path.join(repoRoot, "src/features/outfit/panels/ImageVersionList.jsx"), "utf8"));
  check("版本列表组件无新增 <Modal", !/<Modal/.test(compSrc));
  check("版本列表组件无裸 fetch", !compSrc.includes("fetch("));

  const routeSrc = stripComments(readFileSync(path.join(repoRoot, "server/routes/outfit.routes.js"), "utf8"));
  check("出口响应体 tryonTaskId 仍在（未被改）", routeSrc.includes("tryonTaskId"));
  const calls = (routeSrc.match(/recordOutfitImageVersionInBackground\s*\(/g) || []).length;
  check("三个出口均挂载版本写入（≥3）", calls >= 3, "次数=" + calls);

  const ivRoute = stripComments(readFileSync(path.join(repoRoot, "server/routes/image-version.routes.js"), "utf8"));
  check("新路由只读（无 POST/PUT/DELETE）", !/\b(app\.(post|put|delete))\s*\(/.test(ivRoute));
  check("新路由仅 app.get 注册", (ivRoute.match(/app\.get\s*\(/g) || []).length >= 2);
}

// 6. 新固化资产目录未进入清理白名单（红线：否则 /api/storage/clean 会误删用户资产）
{
  const cleanupFiles = ["server/routes/storage.routes.js", "server/core/storage-usage.js", "server/core/result-cache.js"];
  let clean = true;
  const offenders = [];
  for (const rel of cleanupFiles) {
    const p = path.join(repoRoot, rel);
    if (!existsSync(p)) continue;
    const s = readFileSync(p, "utf8");
    if (/image-version-assets|aiTryonImageVersionAssetsDir/.test(s)) { clean = false; offenders.push(rel); }
  }
  check("固化资产目录未进入清理白名单（storage/usage/cache）", clean, "命中:" + offenders.join(","));
}

// 7. 真实 data/ai-tryon/{image-versions,image-version-assets} 未被创建/改动（沙盒隔离）
{
  rmSync(sandboxRoot, { recursive: true, force: true });
  const afterImageVersions = snapshotDir(path.resolve(repoRoot, "data", "ai-tryon", "image-versions"));
  const afterImageVersionAssets = snapshotDir(path.resolve(repoRoot, "data", "ai-tryon", "image-version-assets"));
  const unchanged = (before, after) => before === null
    ? after === null
    : after !== null && before.size === after.size && [...before].every(([rel, hash]) => after.get(rel) === hash);
  const ok1 = unchanged(realImageVersions, afterImageVersions);
  const ok2 = unchanged(realImageVersionAssets, afterImageVersionAssets);
  const detail = (before) => before === null ? "原本不存在，运行后仍不存在" : `原本 ${before.size} 个文件，内容逐字未变`;
  check("真实 data/ai-tryon/image-versions 未被创建/改动", ok1, detail(realImageVersions));
  check("真实 data/ai-tryon/image-version-assets 未被创建/改动", ok2, detail(realImageVersionAssets));
}

console.log("");
console.log("[P2-4] " + (failures.length === 0 ? "全部通过" : failures.length + " 项失败"));
if (failures.length > 0) {
  console.error("失败项:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("image-version-integration-check 全部通过（固化落盘/成功+失败均写/敏感零写入/列表可读/无taskId跳过/前端API准入/无Modal/响应体未改/新路由只读/清理白名单/真实目录快照）");
