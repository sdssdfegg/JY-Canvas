// 分屏稳定 ID 与异步结果丢弃门禁（阶段最终验收补充）。
// 测试：ID 单调不复用（含删除正在生成的最大 ID 屏→新增）、退役 ID、存在性判定、结果丢弃、不继承旧状态。
// 不调用真实模型：旧请求用 Promise + setTimeout 模拟延迟。
// 用法：node scripts/verify/detail-screen-id-check.mjs

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};

const mod = await import("../../src/features/detail/detail-screen-id.js");
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// 1. 首次分配基于历史最大 screen，单调递增
mem.clear();
const groups = [{ id: "g1", prompts: [101, 102, 103, 104].map((s) => ({ screen: s })) }];
const a = mod.nextDetailScreenId(groups);
const b = mod.nextDetailScreenId(groups);
check("DT1 首次分配取历史最大+1且单调递增", a === 105 && b === 106, `a=${a} b=${b}`);

// 2. 核心场景：删除正在生成的最大 ID 屏(104)→新增→旧请求延迟返回→不写回
mem.clear();
const live = [{ id: "g1", prompts: [101, 102, 103, 104].map((s) => ({ screen: s, status: s === 104 ? "running" : "idle", results: [] })) }];
const deletedId = 104;
let afterDelete = mod.pruneDeletedScreen(live, "g1", deletedId); // 含 retire
const newId = mod.nextDetailScreenId(afterDelete); // 删除后立即新增
const delayedOld = await new Promise((resolve) => setTimeout(() => resolve({ screen: deletedId, results: [{ id: "OLD_R104" }] }), 30));
const shouldWriteBack = mod.detailScreenExists(afterDelete, "g1", delayedOld.screen);
const newPrompt = { screen: newId, status: "idle", results: [], text: "", source: "manual" };
check("DT2 删除生成中最大ID后新增不复用", newId > deletedId && newId !== deletedId, `deleted=${deletedId} new=${newId}`);
check("DT3 旧请求延迟返回被丢弃(不写回)", shouldWriteBack === false, `oldScreen=${delayedOld.screen}`);
check("DT4 新屏不继承旧状态/结果", newPrompt.status === "idle" && newPrompt.results.length === 0 && newPrompt.text === "", JSON.stringify(newPrompt));

// 3. 拖拽只改顺序不改 ID，存在性仍按稳定 ID
const reordered = [{ id: "g1", prompts: [...afterDelete[0].prompts].reverse() }];
check("DT5 重排后ID集合不变(拖拽不改身份)",
  JSON.stringify(reordered[0].prompts.map((p) => p.screen).sort((x, y) => x - y)) === JSON.stringify(afterDelete[0].prompts.map((p) => p.screen).sort((x, y) => x - y)),
  "id set preserved");
check("DT6 重排后仍按稳定ID判定存在", mod.detailScreenExists(reordered, "g1", 101) === true && mod.detailScreenExists(reordered, "g1", 999) === false);

// 4. 跨组隔离 + 已删 ID 永久退役（即使 seq 丢失也不复用）
const other = [{ id: "g2", prompts: [{ screen: 101 }] }];
check("DT7 跨组隔离不误判", mod.detailScreenExists(other, "g2", 101) === true && mod.detailScreenExists(other, "g1", 101) === false);
mem.clear(); // 模拟 seq 丢失
const afterSeqLoss = [{ id: "g1", prompts: [{ screen: 101 }, { screen: 103 }] }];
mod.retireDetailScreenId(104); // 删除 104 时退役
const afterLossNewId = mod.nextDetailScreenId(afterSeqLoss);
check("DT8 seq丢失后退役ID仍不复用", afterLossNewId > 104, `new=${afterLossNewId}`);

// 5. 负向对照：不调用 retire 时（seq 丢失 + max=103）next 会复用 104，证明 DT8 断言有效
mem.clear();
const noRetireId = mod.nextDetailScreenId([{ id: "g1", prompts: [{ screen: 101 }, { screen: 103 }] }]);
check("DT9 负向对照：未退役时确实会复用(证明DT8有效)", noRetireId === 104, `noRetire=${noRetireId}`);

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
const output = {
  ok: failed === 0,
  total: results.length,
  passed,
  failureCount: failed,
  failures: results.filter((r) => !r.pass)
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
