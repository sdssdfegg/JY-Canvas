// V204 阶段 5 · 版本幂等门禁（纯逻辑、零上游、沙盒 data 根，进 --fast 快速子集）。
//
// 正向量（执行单 §1 / version-routes 关键不变量）：
//   - 同屏连续两次生成（同一 frozenPrompt，但携带**不同** versionId） → 必须产出
//     两任务 / 两版本 / 两图，绝不命中旧账本（idempotencyKey 绑定 versionId 维度）；
//   - 两个版本都落盘、都带独立图片路径，且不互相删除 / 覆盖。
// 负向（塞违法内容能判红）：
//   - 缺 versionId 的单屏编辑必须被拒（submitSingleScreen 抛错）。

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// 先设沙盒 data 根，再动态 import 任何 server 模块（app-paths 在模块求值期读该 env）。
const sandbox = mkdtempSync(path.join(os.tmpdir(), "v204-ver-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

let pass = 0;
function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  pass += 1;
  console.log("  ok -", msg);
}

const { createDetailStudioProject, updateDetailStudioProject } =
  await import("../../server/features/detail-studio/store/project-store.js");
const { submitSingleScreen, getBatchStatus } =
  await import("../../server/features/detail-studio/generation/orchestrator.js");
const {
  generationTaskStore
} = await import("../../server/features/detail-studio/generation/task-store.js");
const {
  createPendingVersion,
  finalizeVersion,
  getScreenVersions
} = await import("../../server/features/detail-studio/versions/version-store.js");

// mock generator：每次调用落一个真实存在的临时 PNG（仅 PNG 魔数字节），返回 file:// 路径，
// 使 orchestrator 的 persistResult 能复制出独立 resultPath（两图）。
const imgDir = mkdtempSync(path.join(os.tmpdir(), "v204-ver-imgs-"));
let imgSeq = 0;
function makeGen() {
  return async () => {
    const f = path.join(imgDir, `img-${imgSeq++}-${Date.now()}.png`);
    writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return { ok: true, image: { url: "file://" + f } };
  };
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

// 模拟 editDetailStudioScreen 路由的「创建版本 + 提交单屏 + 终态补图」完整链路。
async function editScreen(id, screenIndex, frozenPrompt, versionId) {
  await createPendingVersion(id, { screenIndex, prompt: frozenPrompt, versionId });
  const result = await submitSingleScreen(
    {
      projectId: id,
      apiKey: "k",
      screen: { screenIndex, frozenPrompt, versionId, referenceRoles: [], model: "m", channelId: "c", imageSize: "2K", aspectRatio: "3:4" }
    },
    { generator: makeGen(), backoffBaseMs: 5 }
  );
  await waitTerminal(id);
  const { tasks } = await getBatchStatus(id);
  const task = tasks.find((t) => t.versionId === versionId) || tasks[tasks.length - 1];
  if (task && task.status === "success") {
    await finalizeVersion(id, versionId, { status: "success", imagePath: task.resultPath, resultRef: task.resultRef });
  }
  return { result, task };
}

try {
  const project = await createDetailStudioProject({ name: "ver-proj", mode: "direct" });
  const id = project.id;
  const fps = {};
  for (let i = 0; i < 6; i++) fps[String(i)] = "FROZEN-PROMPT-SCREEN-" + i;
  await updateDetailStudioProject(id, {
    planning: {
      screens: Object.keys(fps).map((k) => ({ screenIndex: Number(k), title: "屏" + k })),
      frozenPrompts: fps
    }
  });

  // 同屏（屏 5）连续两次生成，同一 frozenPrompt，但不同 versionId → 各得独立任务/版本/图。
  const edit1 = await editScreen(id, 5, fps["5"], "ver_a");
  assert(edit1.result.created.length === 1 && edit1.result.skipped.length === 0, "第 1 次编辑（ver_a）：创建 1 个任务（未幂等跳过）");
  assert(edit1.task && edit1.task.versionId === "ver_a", "第 1 次任务绑定 ver_a");

  const edit2 = await editScreen(id, 5, fps["5"], "ver_b");
  assert(edit2.result.created.length === 1 && edit2.result.skipped.length === 0, "第 2 次编辑（ver_b，同提示词）：仍创建 1 个新任务（未命中旧账本）");
  assert(edit2.task && edit2.task.versionId === "ver_b", "第 2 次任务绑定 ver_b");

  const { tasks } = await getBatchStatus(id);
  const screen5Tasks = tasks.filter((t) => t.screenIndex === 5);
  assert(screen5Tasks.length === 2, "同屏连续两次生成 → 共 2 个任务");
  assert(new Set(screen5Tasks.map((t) => t.task_id)).size === 2, "两任务 task_id 互异");
  const imgPaths = screen5Tasks.map((t) => t.resultPath).filter(Boolean);
  assert(imgPaths.length === 2 && new Set(imgPaths).size === 2, "两任务各有独立图片路径（两图，未覆盖）");

  // 版本元数据：2 条版本、各自带图、最新版为 current。
  const { versions, currentVersionId } = await getScreenVersions(id, 5);
  assert(versions.length === 2, "同屏连续两次生成 → 共 2 个版本");
  assert(versions.every((v) => v.imagePath), "两个版本都落盘并带图片路径（未丢图）");
  assert(versions.some((v) => v.versionId === "ver_a") && versions.some((v) => v.versionId === "ver_b"), "版本链含 ver_a 与 ver_b");
  assert(currentVersionId === "ver_b", "当前版本指向最新一次编辑（ver_b）");

  // 负向：缺 versionId 的单屏编辑必须被拒（塞违法内容判红）。
  let rejected = false;
  try {
    await submitSingleScreen(
      {
        projectId: id,
        apiKey: "k",
        screen: { screenIndex: 5, frozenPrompt: fps["5"], referenceRoles: [], model: "m", channelId: "c", imageSize: "2K", aspectRatio: "3:4" }
      },
      { generator: makeGen(), backoffBaseMs: 5 }
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "塞违法内容（缺 versionId）→ 被拒（判红）");

  for (const t of tasks) await generationTaskStore.writeTask({ ...t, status: "cancelled" }).catch(() => {});
  console.log(`\n✅ 版本幂等门禁通过（${pass} 项断言）`);
} catch (err) {
  console.error("❌", err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  rmSync(sandbox, { recursive: true, force: true });
  rmSync(imgDir, { recursive: true, force: true });
}
