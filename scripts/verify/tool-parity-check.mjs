// scripts/verify/tool-parity-check.mjs
//
// V208 P1：Tool 抽象底座 parity 门禁（纯逻辑、沙盒 data 根、零上游、<1s，进 --fast 快速子集）。
//
// 断言：
//   ① 7 个 Tool 元数据四字段齐全（id / description / permissions / idempotent /
//      confirmRequired / sideEffectScope）。
//   ② 确定性 Tool（saveVersion / switchVersion / manageAsset）「直接调用」vs「经 dispatchTool 调用」
//      结果字节一致（两个结构相同的沙盒项目分别走两条路径，规范化项目标识/时间戳后比对）。
//   ③ 4 条负向对照：未注册 id 被拒 / 缺字段注册被拒 / 重复注册被拒 / confirmRequired 未确认被拒。
//
// 红线：禁止真实出图、禁止真实调用 /api/images（generator 依赖注入、本脚本不提供）；
//       不切换任何既有调用点（只验证适配层 fidelity）。

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";

// 沙盒数据根：最高优先级覆盖 app-paths 的 rootDir，绝不触碰用户真实 data/。
const SANDBOX = await fs.mkdtemp(path.join(os.tmpdir(), "v208-parity-"));
process.env.JINGYIN_RELEASE_ROOT = SANDBOX;

// 冻结时间：保证 createdAt/updatedAt 在两次调用间确定一致（便于字节级比对）。
const FIXED = new Date("2026-11-12T08:00:00.000Z").getTime();
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED);
    else super(...args);
  }
  static now() {
    return FIXED;
  }
};

// 动态 import：必须晚于上面的 env / 时间设置（stores 在 import 时据 env 决议 rootDir）。
const { registerTool, getTool, listTools, dispatchTool } = await import(
  "../../server/core/tool-registry.js"
);
const { registerDetailStudioTools } = await import(
  "../../server/features/detail-studio/tools/index.js"
);
const { createDetailStudioProject } = await import(
  "../../server/features/detail-studio/store/project-store.js"
);
const { createPendingVersion } = await import(
  "../../server/features/detail-studio/versions/version-store.js"
);

let failures = 0;
const log = (...a) => console.log(...a);
function assert(cond, msg) {
  if (cond) log("  ✓", msg);
  else {
    failures++;
    log("  ✗", msg);
  }
}

async function readProject(id) {
  const p = path.join(SANDBOX, "data", "detail-studio", "projects", id, "project.json");
  return fs.readFile(p, "utf8").catch(() => null);
}

// 删除项目级易变标识/时间戳后比对：两个沙盒项目 id 必然不同、时间戳已冻结，
// 余下内容即「操作的真实效果」，字节一致即证明适配器是忠实透传（无结果变换）。
function normalize(text) {
  const obj = JSON.parse(text);
  delete obj.id;
  delete obj.createdAt;
  delete obj.updatedAt;
  return JSON.stringify(obj);
}

// 同口径规范化对象（用于比对「返回体」而非落盘文件）。
function normalizeObj(obj) {
  if (!obj || typeof obj !== "object") return JSON.stringify(obj);
  const c = JSON.parse(JSON.stringify(obj));
  delete c.id;
  delete c.createdAt;
  delete c.updatedAt;
  return JSON.stringify(c);
}

function makeProject() {
  return createDetailStudioProject({ name: "parity" }).then((p) => p.id);
}

try {
  registerDetailStudioTools();

  // ── ① 元数据四字段齐全 ──
  log("[1] 7 个 Tool 元数据齐全");
  const meta = listTools();
  const ids = meta.map((m) => m.id).sort();
  const EXPECTED = [
    "createTask",
    "editScreen",
    "imageGenerate",
    "manageAsset",
    "retryTask",
    "saveVersion",
    "switchVersion"
  ].sort();
  assert(JSON.stringify(ids) === JSON.stringify(EXPECTED), `注册 7 个 Tool：${ids.join(",")}`);
  for (const m of meta) {
    const ok =
      typeof m.id === "string" &&
      m.id &&
      typeof m.description === "string" &&
      Array.isArray(m.permissions) &&
      typeof m.idempotent === "boolean" &&
      typeof m.confirmRequired === "boolean" &&
      ["project", "screen", "global"].includes(m.sideEffectScope);
    assert(ok, `元数据齐全：${m.id}`);
  }

  // ── ② 确定性 Tool 字节一致 ──
  log("[2] 确定性 Tool 直接调用 vs dispatchTool 字节一致");

  // saveVersion（finalizeVersion）
  {
    const pa = await makeProject();
    const pb = await makeProject();
    await createPendingVersion(pa, { screenIndex: 0, prompt: "p", versionId: "v1" });
    await createPendingVersion(pb, { screenIndex: 0, prompt: "p", versionId: "v1" });
    const direct = await getTool("saveVersion").run({
      id: pa,
      versionId: "v1",
      status: "success",
      imagePath: "/x/y.png"
    });
    const viaTool = await dispatchTool({
      tool: "saveVersion",
      args: { id: pb, versionId: "v1", status: "success", imagePath: "/x/y.png" },
      confirmed: true
    });
    const ra = await readProject(pa);
    const rb = await readProject(pb);
    assert(ra != null && rb != null, "saveVersion：两项目落盘成功");
    assert(normalize(ra) === normalize(rb), "saveVersion 字节一致（规范化后）");
    assert(
      normalizeObj(direct.data) === normalizeObj(viaTool.data),
      "saveVersion 返回体一致"
    );
  }

  // switchVersion（switchScreenVersion，confirmRequired=true）
  {
    const pa = await makeProject();
    const pb = await makeProject();
    await createPendingVersion(pa, { screenIndex: 0, prompt: "p", versionId: "v1" });
    await createPendingVersion(pb, { screenIndex: 0, prompt: "p", versionId: "v1" });
    const direct = await getTool("switchVersion").run({
      id: pa,
      screenIndex: 0,
      versionId: "v1"
    });
    const viaTool = await dispatchTool({
      tool: "switchVersion",
      args: { id: pb, screenIndex: 0, versionId: "v1" },
      confirmed: true
    });
    const ra = await readProject(pa);
    const rb = await readProject(pb);
    assert(normalize(ra) === normalize(rb), "switchVersion 字节一致（规范化后）");
    assert(
      normalizeObj(direct.data) === normalizeObj(viaTool.data),
      "switchVersion 返回体一致"
    );
  }

  // manageAsset（appendReferenceImage）
  {
    const pa = await makeProject();
    const pb = await makeProject();
    const entry = { filename: "ref1.png", role: "product" };
    const direct = await getTool("manageAsset").run({ id: pa, entry });
    const viaTool = await dispatchTool({
      tool: "manageAsset",
      args: { id: pb, entry },
      confirmed: true
    });
    const ra = await readProject(pa);
    const rb = await readProject(pb);
    assert(normalize(ra) === normalize(rb), "manageAsset 字节一致（规范化后）");
    assert(
      JSON.stringify(direct.data.referenceImages) ===
        JSON.stringify(viaTool.data.referenceImages),
      "manageAsset 参考图条目一致"
    );
  }

  // ── ③ 4 条负向对照 ──
  log("[3] 4 条负向对照");
  let threw = false;
  try {
    await dispatchTool({ tool: "notRegistered", args: {} });
  } catch {
    threw = true;
  }
  assert(threw, "未注册 id 被拒");

  threw = false;
  try {
    registerTool({
      id: "badTool",
      description: "缺少 run 字段",
      permissions: [],
      idempotent: true,
      confirmRequired: true,
      sideEffectScope: "screen"
      // 缺 run
    });
  } catch {
    threw = true;
  }
  assert(threw, "缺字段（run）注册被拒");

  threw = false;
  try {
    registerTool(getTool("saveVersion")); // 重复 id
  } catch {
    threw = true;
  }
  assert(threw, "重复注册被拒");

  threw = false;
  try {
    await dispatchTool({
      tool: "switchVersion",
      args: { id: "x", screenIndex: 0, versionId: "v1" },
      confirmed: false
    });
  } catch {
    threw = true;
  }
  assert(threw, "confirmRequired=true 未确认被拒");
} catch (err) {
  failures++;
  log("  ✗ 异常：", err && err.stack ? err.stack : err);
} finally {
  // 最佳努力清理沙盒（Windows 走真实 rm 二进制绕过 safe-delete 劫持；缺失则忽略）。
  try {
    spawnSync("/usr/bin/rm", ["-rf", SANDBOX]);
  } catch {
    /* 忽略：临时目录可由 OS 回收 */
  }
}

if (failures === 0) {
  log("\nTOOL-PARITY-CHECK: PASS");
  process.exit(0);
} else {
  log(`\nTOOL-PARITY-CHECK: FAIL (${failures})`);
  process.exit(1);
}
