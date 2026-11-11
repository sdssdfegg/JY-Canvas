// V204 阶段 5 · 单屏隔离门禁（纯逻辑、零上游、沙盒 data 根，进 --fast 快速子集）。
//
// 负向对照（执行单 §7-1 / §3 红线）：
//   - 编辑第 5 屏 → 只产生该屏 1 个任务，其他屏 task 数不变（不自动重生成其它屏）；
//   - planning.frozenPrompts 字节不变（B1 分析 / B2 导演 / B3 编译 / B4 质检不重跑）；
//   - 缺 versionId 的非法单屏编辑被拒（塞违法内容能判红）；
//   - 同屏同 versionId 重复编辑 → 幂等跳过（不二次扣费）。

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// 先设沙盒 data 根，再动态 import 任何 server 模块（app-paths 在模块求值期读该 env）。
const sandbox = mkdtempSync(path.join(os.tmpdir(), "v204-iso-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

let pass = 0;
function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  pass += 1;
  console.log("  ok -", msg);
}

const { createDetailStudioProject, updateDetailStudioProject, getDetailStudioProject } =
  await import("../../server/features/detail-studio/store/project-store.js");
const { submitSingleScreen, getBatchStatus } =
  await import("../../server/features/detail-studio/generation/orchestrator.js");
const { generationTaskStore } =
  await import("../../server/features/detail-studio/generation/task-store.js");

function makeGen() {
  return async () => ({ ok: true, image: { url: "file:///tmp/v204-iso-" + Date.now() + ".png" } });
}
async function waitTerminal(projectId, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { counts } = await getBatchStatus(projectId);
    if (counts.queued + counts.running === 0) return counts;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timeout waiting for terminal");
}

try {
  const project = await createDetailStudioProject({ name: "iso-proj", mode: "direct" });
  const id = project.id;
  const fps = {};
  for (let i = 0; i < 6; i++) fps[String(i)] = "FROZEN-PROMPT-SCREEN-" + i;
  await updateDetailStudioProject(id, {
    planning: {
      screens: Object.keys(fps).map((k) => ({ screenIndex: Number(k), title: "屏" + k })),
      frozenPrompts: fps
    }
  });
  const snapshot = JSON.stringify((await getDetailStudioProject(id)).planning.frozenPrompts);

  // 编辑第 5 屏（带 versionId）
  const r1 = await submitSingleScreen(
    {
      projectId: id,
      apiKey: "k",
      screen: { screenIndex: 5, frozenPrompt: fps["5"], versionId: "ver_a", referenceRoles: [], model: "m", channelId: "c", imageSize: "2K", aspectRatio: "3:4" }
    },
    { generator: makeGen(), backoffBaseMs: 5 }
  );
  await waitTerminal(id);

  const { tasks } = await getBatchStatus(id);
  assert(r1.created.length === 1 && r1.skipped.length === 0, "编辑第 5 屏：创建 1 个任务");
  assert(tasks.length === 1 && tasks[0].screenIndex === 5, "隔离：仅第 5 屏 1 个任务，其它屏 task 数不变（=0）");
  const allTasks = await generationTaskStore.listTasks();
  assert(allTasks.length === 1, "账本：只有 1 条任务（无其它屏自动生成）");

  const afterFp = JSON.stringify((await getDetailStudioProject(id)).planning.frozenPrompts);
  assert(afterFp === snapshot, "planning.frozenPrompts 字节不变（B1/B2/B3/B4 未重跑）");

  // 负向：缺 versionId → 必须被拒
  let rejected = false;
  try {
    await submitSingleScreen(
      {
        projectId: id,
        apiKey: "k",
        screen: { screenIndex: 2, frozenPrompt: fps["2"], referenceRoles: [], model: "m", channelId: "c", imageSize: "2K", aspectRatio: "3:4" }
      },
      { generator: makeGen(), backoffBaseMs: 5 }
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "塞违法内容（缺 versionId）→ 被拒（判红）");

  // 负向：同屏同 versionId 重复编辑 → 幂等跳过（不二次扣费）
  const r2 = await submitSingleScreen(
    {
      projectId: id,
      apiKey: "k",
      screen: { screenIndex: 5, frozenPrompt: fps["5"], versionId: "ver_a", referenceRoles: [], model: "m", channelId: "c", imageSize: "2K", aspectRatio: "3:4" }
    },
    { generator: makeGen(), backoffBaseMs: 5 }
  );
  assert(r2.created.length === 0 && r2.skipped.length === 1, "同屏同 versionId 重复编辑 → 幂等跳过（不重复生成）");

  for (const t of tasks) await generationTaskStore.writeTask({ ...t, status: "cancelled" }).catch(() => {});
  console.log(`\n✅ 单屏隔离门禁通过（${pass} 项断言）`);
} catch (err) {
  console.error("❌", err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
