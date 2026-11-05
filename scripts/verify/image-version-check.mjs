// P2-3 图片版本数据层验收（纯进程内，不起服务、不联网、不扣费）。
//
// 设计约束（与 garment-profile-check.mjs 同口径）：
//   - 纯进程内断言，所有存储走临时沙盒（在 import 任何服务端模块之前设 JINGYIN_RELEASE_ROOT），
//     结束整目录删除 => 绝不污染用户 data/；
//   - 同时覆盖动态断言（创建/查询/子版本/剥离/敏感零写入/净化/并发/索引容错）与静态钉桩
//     （零依赖叶子 / 清理白名单 / 启动边界 / 用户资产红线）；
//   - 静态部分守护用户资产红线，防后续重构把新目录漏进清理白名单或启动链路。

import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const importAbs = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

// 真实用户 data/ai-tryon/image-versions 可能已由产品正常运行创建。
// 断言口径 = 本次验收运行前后真实目录内容逐字一致，而不是必须不存在（否则产品被正常使用后会永久判红）。
const realRoot = path.resolve(repoRoot, "data", "ai-tryon", "image-versions");
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

// 必须早于任何服务端模块 import：app-paths 在 import 期就把 rootDir 固化了。
const sandboxRoot = mkdtempSync(path.join(tmpdir(), "image-version-check-"));
process.env.JINGYIN_RELEASE_ROOT = sandboxRoot;

const store = await importAbs("server/ai-tryon/image-version-store.js");
const { aiTryonImageVersionsDir } = await importAbs("server/core/app-paths.js");

const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    console.log("  ok - " + name);
  } else {
    failures.push(name + (detail ? " - " + detail : ""));
    console.log("  FAIL - " + name + (detail ? " - " + detail : ""));
  }
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

console.log("[P2-3] 图片版本数据层验收");

// 1. 创建根版本 -> 读回 13 字段齐全、version_id/created_at 为服务端生成值
let root;
{
  root = await store.appendImageVersion({
    task_id: "task-001",
    input_asset_refs: [{ type: "image", ref: "ref-a", name: "a.png", bytes: 10 }],
    result_asset_ref: "res-1",
    user_instruction: "make red dress",
    structured_edit_goal: { region: "dress", goal: "red" },
    model_and_versions: { model: "nano", template: "t1", strategy: "s1" },
    execution_params: { model: "nano", steps: 30 },
    status: "succeeded"
  });
  const fields = ["version_id", "task_id", "parent_version_id", "input_asset_refs", "result_asset_ref", "user_instruction", "structured_edit_goal", "model_and_versions", "execution_params", "created_at", "status", "error", "user_accepted"];
  const missing = fields.filter((f) => !(f in root));
  check("创建根版本 13 字段齐全", missing.length === 0, "缺:" + missing.join(","));
  check("创建根版本 version 序号=1", root.version === 1, "version=" + root.version);
  check("创建根版本 version_id 服务端生成（非空）", typeof root.version_id === "string" && root.version_id.length > 0);
  check("创建根版本 created_at 服务端生成", typeof root.created_at === "string" && root.created_at.includes("T"));
  check("创建根版本 parent 为 null（根）", root.parent_version_id === null);
  check("创建根版本 input_asset_refs 归一", Array.isArray(root.input_asset_refs) && root.input_asset_refs[0].ref === "ref-a");
  check("创建根版本 user_accepted 默认 false", root.user_accepted === false);
  const reread = await store.readImageVersion(root.version_id);
  check("读回根版本一致", reread && reread.version_id === root.version_id && reread.status === "succeeded");
}

// 2. 追加子版本 -> parent_version_id 正确、version 递增、父文件 sha256 前后不变（只增不改）
let child;
{
  const rootRaw = await readFile(path.join(aiTryonImageVersionsDir, root.version_id + ".json"), "utf8");
  const rootHash = sha256(rootRaw);
  child = await store.appendImageVersion({ parent_version_id: root.version_id, user_instruction: "tweak color" });
  check("子版本 parent_version_id 正确", child.parent_version_id === root.version_id);
  check("子版本 version 递增", child.version === 2, "version=" + child.version);
  // 父版本文件须逐字不变
  const rootRawAfter = await readFile(path.join(aiTryonImageVersionsDir, root.version_id + ".json"), "utf8");
  check("父版本文件逐字不变（内容哈希一致）", sha256(rootRawAfter) === rootHash);
  const childRead = await store.readImageVersion(child.version_id);
  check("子版本可独立读取", childRead && childRead.user_instruction === "tweak color");
}

// 3. patch/更新强制剥离不可变字段；显式设置 user_accepted 才生效
{
  const upd = await store.updateImageVersion(root.version_id, {
    version_id: "hacked-id",
    version: 99,
    created_at: "1999-01-01T00:00:00Z",
    parent_version_id: "foreign",
    user_accepted: true,
    status: "failed",
    error: "boom"
  });
  check("更新剥离 version_id（新 id 生成）", upd.version_id !== "hacked-id");
  check("更新剥离 version（序号由索引推导）", typeof upd.version === "number" && upd.version >= 3);
  check("更新剥离 created_at（服务端生成）", upd.created_at !== "1999-01-01T00:00:00Z" && upd.created_at.includes("T"));
  check("更新剥离 parent_version_id（指向被更新版本）", upd.parent_version_id === root.version_id);
  check("更新剥离 user_accepted（不被补丁覆盖）", upd.user_accepted === false);
  check("更新可变字段 status 生效", upd.status === "failed");
  check("更新可变字段 error 生效", upd.error === "boom");
  const acc = await store.setUserAccepted(upd.version_id, true);
  check("setUserAccepted 显式生效 true", acc.user_accepted === true);
  const acc2 = await store.setUserAccepted(upd.version_id, false);
  check("setUserAccepted 显式生效 false", acc2.user_accepted === false);
}

// 4. 敏感信息零写入：execution_params 含 API Key / 口令 / 私钥 / token 类键名时须被剥离
{
  const v = await store.appendImageVersion({
    execution_params: { model: "nano", apiKey: "sk-secret", password: "p", privateKey: "pk", token: "t", accessKey: "ak" }
  });
  const ep = v.execution_params || {};
  check("敏感键 apiKey 被剥离", !("apiKey" in ep));
  check("敏感键 password 被剥离", !("password" in ep));
  check("敏感键 privateKey 被剥离", !("privateKey" in ep));
  check("敏感键 token 被剥离", !("token" in ep));
  check("敏感键 accessKey 被剥离", !("accessKey" in ep));
  check("非敏感键 model 保留", ep.model === "nano");
  const reread = await store.readImageVersion(v.version_id);
  const ep2 = reread.execution_params || {};
  check("重读敏感键仍零命中", !("apiKey" in ep2) && !("password" in ep2) && !("token" in ep2));
}

// 5. version_id 净化：含 /、..、绝对路径、空字节、空串一律显式抛错拒绝
{
  const badCases = ["a/b", "..", "../x", "/abs/path", "", String.fromCharCode(0) + "x", "a" + String.fromCharCode(0) + "b"];
  let allRejected = true;
  const offenders = [];
  for (const id of badCases) {
    let threw = false;
    try { await store.appendImageVersion({ version_id: id }); } catch { threw = true; }
    if (!threw) { allRejected = false; offenders.push(JSON.stringify(id)); }
  }
  check("非法 version_id 全部被拒", allRejected, "未拒:" + offenders.join(","));
}

// 6. 并发 N 次追加 -> 无丢失、无覆盖（Promise 链单写入器）
{
  const before = (await store.listImageVersions()).length;
  const id = "concurrent-root";
  await store.appendImageVersion({ version_id: id });
  const N = 6;
  await Promise.all(Array.from({ length: N }, (_, i) => store.appendImageVersion({ parent_version_id: id, user_instruction: "c" + i })));
  const list = await store.listImageVersions();
  check("并发追加后总数增量 = 1 + N（无丢失/无覆盖）", list.length === before + 1 + N, "len=" + list.length + " before=" + before);
  const chain = await store.readParentChain(id);
  check("并发追加父链可读（根为自身）", chain.length === 1 && chain[0].version_id === id);
}

// 7. 索引损坏 -> .bak 回退；两者皆坏 -> 重建成功且不丢版本文件
{
  const fs = await import("node:fs/promises");
  // 7a：删索引，read 应触发重建并给出正确摘要
  await fs.rm(path.join(aiTryonImageVersionsDir, "index.json"), { force: true });
  const rebuilt = await store.readImageVersion(root.version_id);
  check("索引缺失 -> 重建后仍可读根版本", rebuilt && rebuilt.version_id === root.version_id);
  const idx = await store.listImageVersions();
  check("重建索引摘要齐全（>=7）", idx.length >= 7, "len=" + idx.length);
  // 7b：主索引损坏 -> 回退 .bak
  await fs.writeFile(path.join(aiTryonImageVersionsDir, "index.json"), "###not-json###", "utf8");
  await store.rebuildImageVersionIndex();
  await fs.writeFile(path.join(aiTryonImageVersionsDir, "index.json"), "###broken###", "utf8");
  const fromBak = await store.listImageVersions();
  check("主索引损坏 -> 回退 .bak 仍可得摘要", Array.isArray(fromBak) && fromBak.length >= 1, "len=" + fromBak.length);
  // 7c：主与 .bak 皆坏 -> 重建
  await fs.rm(path.join(aiTryonImageVersionsDir, "index.json"), { force: true });
  await fs.rm(path.join(aiTryonImageVersionsDir, "index.json.bak"), { force: true });
  const rebuiltAgain = await store.listImageVersions();
  check("主与.bak 皆坏 -> 重建成功且非空", Array.isArray(rebuiltAgain) && rebuiltAgain.length >= 1, "len=" + rebuiltAgain.length);
}

// 8. 零依赖叶子红线（新模块只 import Node 内置 + app-paths.js；无删除/裸 fetch/process.env）
{
  const src = readFileSync(path.join(repoRoot, "server/ai-tryon/image-version-store.js"), "utf8");
  const imports = [...src.matchAll(/from[ ]+"([^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(["node:fs/promises", "node:path", "node:crypto", "../core/app-paths.js"]);
  const illegal = imports.filter((spec) => !allowed.has(spec));
  check("image-version-store.js 只 import 叶子（node:*/app-paths）", illegal.length === 0, "越界:" + illegal.join(","));
  check("store 无删除接口（rmSync/unlink 零命中）", !src.includes("rmSync") && !src.includes("unlink"));
  check("store 无裸 fetch", !src.includes("fetch("));
  check("store 无 process.env 读取", !src.includes("process.env"));
}

// 9. 新目录不出现在清理白名单（红线）；真实 data 运行前后逐字一致
{
  const cleanupFiles = ["server/routes/storage.routes.js", "server/core/storage-usage.js", "server/core/result-cache.js"];
  let clean = true;
  const offenders = [];
  for (const rel of cleanupFiles) {
    const p = path.join(repoRoot, rel);
    if (!existsSync(p)) continue;
    const s = readFileSync(p, "utf8");
    if (/image-versions|aiTryonImageVersionsDir/.test(s)) { clean = false; offenders.push(rel); }
  }
  check("新目录未进入清理白名单（storage/usage/cache）", clean, "命中:" + offenders.join(","));

  rmSync(sandboxRoot, { recursive: true, force: true });
  const realAfter = snapshotReal();
  const unchanged = realBefore === null
    ? realAfter === null
    : realAfter !== null && realBefore.size === realAfter.size
      && [...realBefore].every(([rel, hash]) => realAfter.get(rel) === hash);
  const detail = realBefore === null
    ? (unchanged ? "原本不存在，运行后仍不存在" : "验收脚本创建了真实目录:" + realRoot)
    : (unchanged ? "原本存在 " + realBefore.size + " 个文件，内容逐字未变（用户数据未触碰）" : "真实目录内容被本次验收改动");
  check("真实 data/ai-tryon/image-versions 未被创建/改动", unchanged, detail);
}

console.log("");
console.log("[P2-3] " + (failures.length === 0 ? "全部通过" : failures.length + " 项失败"));
if (failures.length > 0) {
  console.error("失败项:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("image-version-check 全部通过（创建/子版本/剥离/敏感零写入/净化/并发/索引容错/静态钉桩/清理白名单/真实目录快照）");



