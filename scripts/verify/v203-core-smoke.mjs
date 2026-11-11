// V203 P0 验证（常驻门禁，V204 任务 5 固化）：通用任务核心 task-store-core.js 六机制单测。
// 隔离临时目录，不影响真实数据（createTaskStore 显式传入 tmp tasksDir）。
import { createTaskStore } from "../../server/core/task-store-core.js";
import { mkdir, writeFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tasksDir = path.join(os.tmpdir(), "v203-core-test", "tasks");
await rm(tasksDir, { recursive: true, force: true });
await mkdir(tasksDir, { recursive: true });

const store = createTaskStore({ tasksDir });
let pass = 0;
function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  pass += 1;
  console.log("  ok -", msg);
}

// 1. 写入 + 索引登记
await store.writeTask({ task_id: "t1", status: "CREATED", foo: 1 });
let t = await store.readTask("t1");
assert(t && t.status === "CREATED" && t.foo === 1, "writeTask 创建并可读");
let idx = await store.listTasks();
assert(idx.length === 1 && idx[0].id === "t1", "index 登记 t1");

// 2. updateStatus 终态补 finished_at
await store.updateStatus("t1", "SUCCEEDED");
t = await store.readTask("t1");
assert(t.status === "SUCCEEDED" && typeof t.finished_at === "string", "updateStatus 终态补 finished_at");

// 3. 主文件损坏 → 回退 .bak（上一版好数据）。
const mainPath = path.join(tasksDir, "t1.json");
const bakExists = !!(await readdir(tasksDir)).includes("t1.json.bak");
assert(bakExists, ".bak 备份已生成（写前备份上一版好数据）");
await writeFile(mainPath, "garbage{not json", "utf8");
const rec = await store.readTask("t1");
assert(rec && rec.status === "CREATED" && rec.foo === 1, "主文件损坏回退 .bak（上一版好数据）");

// 4. appendAttempt（在回退恢复后的任务上追加，验证独立机制）
await store.appendAttempt("t1", { attempt_id: "a1", model: "tt-image-2.6" });
t = await store.readTask("t1");
assert(Array.isArray(t.attempts) && t.attempts.length === 1 && t.attempts[0].model === "tt-image-2.6", "appendAttempt 追加一次记录");

// 5. index 损坏/缺失 → 扫目录重建
await rm(path.join(tasksDir, "index.json"), { force: true });
for (const id of ["t2", "t3"]) {
  await store.writeTask({ task_id: id, status: "CREATED" });
}
const rebuilt = await store.listTasks();
assert(rebuilt.length === 3 && rebuilt.map((e) => e.id).sort().join(",") === "t1,t2,t3", "index 缺失后扫目录重建（含全部任务）");

// 6. 并发串行化：20 个任务并发写入不损坏；同 id 多次并发写串行
await Promise.all(
  Array.from({ length: 20 }, (_, i) => store.writeTask({ task_id: "c" + i, status: "CREATED" }))
);
const after = await store.listTasks();
assert(after.length === 23, "并发写入 20 任务无丢失（total=23）");
await Promise.all(
  Array.from({ length: 10 }, () => store.updateStatus("t1", "FAILED"))
);
const finalT1 = await store.readTask("t1");
assert(finalT1.status === "FAILED", "同 id 并发写串行化（终态 FAILED）");

// 7. 隔离性：每个 store 实例独立索引（不共用）
const store2 = createTaskStore({ tasksDir: path.join(os.tmpdir(), "v203-core-test", "tasks2") });
await store2.writeTask({ task_id: "x1", status: "CREATED" });
const s1 = await store.listTasks();
const s2 = await store2.listTasks();
assert(s1.length === 23 && s2.length === 1 && s2[0].id === "x1", "实例间索引隔离");

await rm(tasksDir, { recursive: true, force: true });
await rm(path.join(os.tmpdir(), "v203-core-test", "tasks2"), { recursive: true, force: true });
console.log(`\n✅ V203 P0 核心六机制全部通过（${pass} 项断言）`);
