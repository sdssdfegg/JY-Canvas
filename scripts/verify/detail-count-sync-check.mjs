// P1：一键详情手动分屏数量 ↔ 基础生图数量双向联动门禁（20 场景）。
// 纯函数级验证（detail-screen-id.js 零 Vite 依赖）+ 源码锚点（保证入口接线），不调用真实模型。
// 用法：node scripts/verify/detail-count-sync-check.mjs

import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
const M = await import("../../src/features/detail/detail-screen-id.js");
const stateSrc = readFileSync(new URL("../../src/features/detail/detail-state.js", import.meta.url), "utf8");
const groupSrc = readFileSync(new URL("../../src/features/detail/detail-group.js", import.meta.url), "utf8");
const manualSrc = readFileSync(new URL("../../src/features/detail/detail-manual-group.js", import.meta.url), "utf8");
const viewSrc = readFileSync(new URL("../../src/features/detail/DetailView.jsx", import.meta.url), "utf8");
const hookSrc = readFileSync(new URL("../../src/features/detail/detail-count-sync.js", import.meta.url), "utf8");

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass: Boolean(pass), detail: String(detail) });

const mkGroup = (screens, extra = {}) => ({
  id: "g1", kind: "manual", parkedPrompts: [],
  prompts: screens.map((s) => ({ screen: s, text: `T${s}`, enabled: true, status: "idle", results: [{ id: `r${s}` }], source: "manual" })),
  ...extra
});
const ids = (g) => g.prompts.map((p) => p.screen);
const texts = (g) => g.prompts.map((p) => p.text);
const parkedIds = (g) => (g.parkedPrompts || []).map((p) => p.screen);

// 1-5 任务书主链路
mem.clear();
let g = mkGroup([1, 2, 3, 4, 5]);
check("S1 手动建5屏→有效数5", M.effectiveDetailPrompts(g).length === 5);
g = M.applyCountToGroup(g, 3);
check("S2 数量改3→活动3、超出2进暂存", ids(g).join(",") === "1,2,3" && parkedIds(g).join(",") === "4,5", ids(g) + " parked=" + parkedIds(g));
g = M.applyCountToGroup(g, 5);
check("S3 新增2→5且原内容恢复", ids(g).join(",") === "1,2,3,4,5" && texts(g).join(",") === "T1,T2,T3,T4,T5", texts(g).join(","));
g = M.applyCountToGroup(g, 8);
check("S4 改8→补3个空白框", ids(g).length === 8 && g.prompts.slice(5).every((p) => p.text === ""), ids(g).join(","));
g = M.applyCountToGroup(g, 4);
check("S5 改4→活动4其余进暂存不丢", ids(g).length === 4 && parkedIds(g).length === 4 && parkedIds(g).every((s) => [5, 6, 7, 8].includes(s)), ids(g) + " parked=" + parkedIds(g));

// 6 暂存恢复保 ID/内容/结果
const beforeRestore = g.parkedPrompts.find((p) => p.screen === 6);
const restored = M.applyCountToGroup(g, 8).prompts.find((p) => p.screen === 6);
check("S6 扩容恢复暂存屏ID/内容/结果一致", restored && restored.screen === beforeRestore.screen && restored.text === beforeRestore.text && JSON.stringify(restored.results) === JSON.stringify(beforeRestore.results));

// 7 交替操作以最后一次为准
mem.clear();
let alt = mkGroup([1, 2, 3]);
alt = M.applyCountToGroup(alt, 6);
alt = M.applyCountToGroup(alt, 2);
alt = M.applyCountToGroup(alt, 4);
check("S7 交替操作最终=最后一次目标4", M.effectiveDetailPrompts(alt).length === 4, "eff=" + M.effectiveDetailPrompts(alt).length);

// 8 拖拽不改数量不串位（拖拽只重排数组，screen 是身份）
mem.clear();
const dragGroup = mkGroup([1, 2, 3, 4]);
const reordered = [...dragGroup.prompts].reverse();
const dragAfter = { ...dragGroup, prompts: reordered };
check("S8 拖拽不改数量且ID集合不变", M.effectiveDetailPrompts(dragAfter).length === 4 && ids({ ...dragAfter, prompts: reordered }).sort((a, b) => a - b).join(",") === "1,2,3,4");

// 9 空白框阻止批量（源码锚点：批量前统一检查）
const emptyCheck = hookSrc.includes("guardBatchEmpty") && hookSrc.includes("提示词为空，请补充或删除后再批量生成") && stateSrc.includes("guardBatchEmpty(group, detailForwardSort, setError, addEvent)");
check("S9 批量前统一检查空白并指出屏号", emptyCheck);

// 10 5有效框→5任务 n=1（源码锚点：enabledPrompts.length + 默认 count=1）
const batchN = stateSrc.includes("enabledPrompts.map((prompt, index) => generateDetailPrompt(group, prompt, index))") && stateSrc.includes("async function generateDetailPrompt(group, prompt, index = 0, count = 1)") && stateSrc.includes('form.set("n", String(clampCount(count)))');
check("S10 批量按有效框数提交且每任务n=1", batchN);

// 11 单屏提交1张
const singleN = viewSrc.includes("generateDetailPrompt(activeDetailGroup, prompt, prompt.screen)");
check("S11 单屏生成只传3参(n=1)", singleN);

// 12 组类型隔离：AI 组不因 prompt.source=manual 误判
mem.clear();
const aiGroup = { id: "ai", prompts: [{ screen: 1, text: "x", source: "manual" }, { screen: 2, text: "y" }] };
const legacyGroup = { id: "old", prompts: [{ screen: 1, text: "x" }] };
check("S12 AI组/历史组不误判为手动组", !M.isManualDetailGroup(aiGroup) && !M.isManualDetailGroup(legacyGroup) && M.isManualDetailGroup(mkGroup([1])));

// 13 历史组兼容（无 kind/parked 不崩）
mem.clear();
const legacyApply = M.applyCountToGroup({ id: "old", prompts: [{ screen: 1, text: "a" }, { screen: 2, text: "b" }] }, 1);
check("S13 历史组兼容不丢内容", legacyApply.prompts.length === 1 && (legacyApply.parkedPrompts || []).length === 1);

// 14 连续快速改数量=最后一次
mem.clear();
let fast = mkGroup([1]);
for (const n of [7, 2, 9, 4, 6]) fast = M.applyCountToGroup(fast, n);
check("S14 连续快改最终=最后一次6", M.effectiveDetailPrompts(fast).length === 6, "eff=" + M.effectiveDetailPrompts(fast).length);

// 15 禁用分屏：有效数减1，禁用屏保留可恢复
mem.clear();
let dis = mkGroup([1, 2, 3, 4]);
dis = { ...dis, prompts: dis.prompts.map((p, i) => i === 1 ? { ...p, enabled: false } : p) };
check("S15 禁用1屏→有效3且禁用屏仍在", M.effectiveDetailPrompts(dis).length === 3 && ids(dis).length === 4);
const reenabled = { ...dis, prompts: dis.prompts.map((p) => p.screen === 2 ? { ...p, enabled: true } : p) };
check("S15b 重新启用→有效4", M.effectiveDetailPrompts(reenabled).length === 4);

// 16 暂存屏异步结果写回原 ID
mem.clear();
const runGroup = mkGroup([1, 2, 3]);
const movedRun = M.applyCountToGroup(runGroup, 2); // 屏3进暂存
const located = M.findDetailScreenLocation([movedRun], "g1", 3);
const written = located && located.parked
  ? M.updateDetailScreenById([movedRun], "g1", 3, { status: "success", results: [{ id: "LATE" }] })
  : null;
const parkedWritten = written?.[0]?.parkedPrompts?.find((p) => p.screen === 3);
check("S16 暂存屏旧异步结果按原ID写回", Boolean(parkedWritten && parkedWritten.status === "success" && parkedWritten.results[0].id === "LATE"));

// 17 暂存恢复后内容/ID/结果保持（同S6但独立断言状态字段）
const st = movedRun.parkedPrompts[0];
const rb = M.applyCountToGroup(movedRun, 3).prompts.find((p) => p.screen === st.screen);
check("S17 暂存恢复保留提示词/结果/ID/状态", rb && rb.text === st.text && rb.status === st.status && rb.screen === st.screen && JSON.stringify(rb.results) === JSON.stringify(st.results));

// 18 暂存不触发 retire（源码锚点：pruneDeletedScreen 只在删除调用，applyCountToGroup 不含 retire）
const noRetire = !groupSrc.includes("retireDetailScreenId") && stateSrc.includes("pruneDeletedScreen(detailGroupsRef.current, groupId, screen)") && !stateSrc.includes("retireDetailScreenId(");
check("S18 暂存缩减不retire、仅明确删除retire", noRetire);

// 19 明确删除仍永久删除（源码锚点）
const hardDelete = stateSrc.includes("用户明确点 X = 永久删除") && stateSrc.includes("pruneDeletedScreen(detailGroupsRef.current, groupId, screen)");
check("S19 明确X删除走永久删除+retire", hardDelete);

// 20 AI组有manual来源特殊屏仍不误判（同S12强化）
const mixed = { id: "ai2", prompts: [{ screen: 1, source: "manual" }, { screen: 2, source: "manual" }] };
check("S20 AI组含manual屏不误判整组", !M.isManualDetailGroup(mixed));

// 接线锚点：统一入口/组类型/暂存白名单/界面显示
const wiring = {
  "统一入口定义(hook)": hookSrc.includes("function applyCountSync(groupId, targetCount, origin)"),
  "count走统一入口": stateSrc.includes('applyCountSync(activeDetailGroupId, next.count, "setting")'),
  "新增屏走统一入口": stateSrc.includes('applyCountSync(targetGroupId, effectiveDetailPrompts(group).length + 1, "setting")'),
  "禁用走同步": hookSrc.includes("function toggleAndSync") && viewSrc.includes("toggleDetailPromptAndSync(activeDetailGroup.id, prompt.screen)"),
  "批量空检查封装": hookSrc.includes("function guardBatchEmpty") && stateSrc.includes("guardBatchEmpty(group, detailForwardSort, setError, addEvent)"),
  "组类型白名单": groupSrc.includes('"kind", "parkedPrompts"'),
  "手动工厂标记kind": manualSrc.includes('kind: "manual"') && manualSrc.includes("parkedPrompts: []"),
  "界面显示有效数": viewSrc.includes("activeEffectiveCount") && viewSrc.includes("有效")
};
for (const [name, pass] of Object.entries(wiring)) check("W " + name, pass);

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(JSON.stringify({
  ok: failed === 0, total: results.length, passed, failureCount: failed,
  failures: results.filter((r) => !r.pass)
}, null, 2));
process.exitCode = failed === 0 ? 0 : 1;
