// V143：画布**导入 / 导出**验收（纯逻辑）。
//
// 重点在**导入**：外部 JSON 是不可信输入。格式不对、版本更新、节点类型不认识、
// 连线指向不存在的节点、字段缺失……要么整体拒绝、要么丢掉并报告，绝不能让脏数据
// 把画布搞崩（"导入后画布打不开"是最难排查的一类故障）。
//
// 覆盖：导出→导入往返、七类拒绝、脏节点/悬空边丢弃与统计、id 重生成防撞车、体量上限。

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  TRANSFER_FORMAT,
  TRANSFER_VERSION,
  parseProjectFile,
  serializeProject
} from "../../src/features/ai-canvas/ai-canvas-transfer.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

const node = (id, type, data = {}) => ({ id, type, x: 10, y: 20, w: 240, h: 130, data });
const fixture = () => ({
  name: "换装链路",
  viewport: { x: 5, y: 6, zoom: 0.8 },
  nodes: [
    node("a", "image", { src: "data:image/png;base64,AAA" }),
    node("b", "prompt", { text: "换成红色连衣裙" }),
    node("c", "generation", { prompt: "保持背景", status: "idle" })
  ],
  edges: [{ from: "a", to: "c" }, { from: "b", to: "c" }]
});

// —— 1) 导出 → 导入 往返 ——
const exported = serializeProject(fixture());
const roundTrip = parseProjectFile(exported);
check("导出的文件能被原样解析回来",
  roundTrip.ok === true && roundTrip.project?.name === "换装链路",
  `${roundTrip.ok} ${roundTrip.error}`);
check("往返保留节点数与节点内容",
  roundTrip.project?.nodes?.length === 3
    && roundTrip.project.nodes[1].data.text === "换成红色连衣裙"
    && roundTrip.project.nodes[0].data.src === "data:image/png;base64,AAA",
  JSON.stringify(roundTrip.project?.nodes?.map((n) => n.type)));
check("往返保留连线（2 条）",
  roundTrip.project?.edges?.length === 2,
  JSON.stringify(roundTrip.project?.edges));
check("往返保留视口",
  roundTrip.project?.viewport?.zoom === 0.8,
  JSON.stringify(roundTrip.project?.viewport));
check("往返没有丢任何数据",
  roundTrip.stats.droppedNodes === 0 && roundTrip.stats.droppedEdges === 0,
  JSON.stringify(roundTrip.stats));
check("导出带格式与版本标记",
  (() => {
    const payload = JSON.parse(exported);
    return payload.format === TRANSFER_FORMAT && payload.version === TRANSFER_VERSION;
  })(),
  "");

// —— 2) 七类不可信输入 → 一律拒绝，绝不放进画布 ——
const rejections = [
  ["空内容", ""],
  ["非字符串", 12345],
  ["超大文件", "x".repeat(21 * 1024 * 1024)],
  ["不是 JSON", "{ 这不是 json"],
  ["JSON 但不是对象", "123"],
  ["别人家的格式", JSON.stringify({ format: "some-other-app", version: 1, project: {} })],
  ["版本比当前新", JSON.stringify({ format: TRANSFER_FORMAT, version: TRANSFER_VERSION + 1, project: {} })]
];
rejections.forEach(([label, input]) => {
  const result = parseProjectFile(input);
  check(`拒绝：${label}`, result.ok === false && result.project === null && !!result.error, result.error || "(无原因)");
});

// —— 3) 脏节点与悬空边：丢掉并报告，不让画布崩 ——
const dirty = JSON.stringify({
  format: TRANSFER_FORMAT,
  version: TRANSFER_VERSION,
  project: {
    name: "脏数据",
    nodes: [
      node("a", "image", { src: "d" }),
      { id: "", type: "image" },          // 无 id → 丢
      { id: "weird", type: "飞船" },       // 不认识的类型 → 丢
      node("b", "prompt", { text: "ok" })
    ],
    edges: [
      { from: "a", to: "b" },
      { from: "a", to: "不存在" },         // 悬空 → 丢
      { from: "b", to: "b" }               // 自环 → 丢
    ]
  }
});
const dirtyResult = parseProjectFile(dirty);
check("脏数据仍可导入（保留能用的部分）", dirtyResult.ok === true, dirtyResult.error);
check("丢掉无效节点并计数",
  dirtyResult.project?.nodes?.length === 2 && dirtyResult.stats.droppedNodes === 2,
  JSON.stringify(dirtyResult.stats));
check("丢掉悬空边与自环并计数",
  dirtyResult.project?.edges?.length === 1 && dirtyResult.stats.droppedEdges === 2,
  JSON.stringify(dirtyResult.stats));
check("一个可用节点都没有时整体拒绝",
  parseProjectFile(JSON.stringify({
    format: TRANSFER_FORMAT, version: TRANSFER_VERSION, project: { nodes: [{ id: "x", type: "飞船" }] }
  })).ok === false,
  "");

// —— 4) id 重生成：避免与现有画布撞车 ——
const first = parseProjectFile(exported, { idPrefix: "imp1" });
const second = parseProjectFile(exported, { idPrefix: "imp2" });
const firstIds = new Set(first.project.nodes.map((n) => n.id));
check("导入的节点 id 被重生成（不再是文件里的原始 id）",
  !first.project.nodes.some((n) => ["a", "b", "c"].includes(n.id)),
  JSON.stringify(first.project.nodes.map((n) => n.id)));
check("两次导入不会 id 撞车",
  !second.project.nodes.some((n) => firstIds.has(n.id)),
  JSON.stringify(second.project.nodes.map((n) => n.id)));
check("连线跟着新 id 一起被重映射（不指向旧 id）",
  first.project.edges.every((edge) => first.project.nodes.some((n) => n.id === edge.from)
    && first.project.nodes.some((n) => n.id === edge.to)),
  JSON.stringify(first.project.edges));

// —— 5) 体量上限：防止超大文件把画布拖死 ——
const huge = JSON.stringify({
  format: TRANSFER_FORMAT,
  version: TRANSFER_VERSION,
  project: {
    name: "巨大",
    nodes: Array.from({ length: 500 }, (_, i) => node(`n${i}`, "prompt", { text: "x" })),
    edges: []
  }
});
const hugeResult = parseProjectFile(huge);
check("节点数超过上限时截断到 400（不无限吃内存）",
  hugeResult.ok === true && hugeResult.project.nodes.length === 400,
  String(hugeResult.project?.nodes?.length));

// —— 6) 缺字段也能安全兜底 ——
const minimal = parseProjectFile(JSON.stringify({
  format: TRANSFER_FORMAT, version: TRANSFER_VERSION, project: { nodes: [node("a", "image")] }
}));
check("缺少 name / viewport / edges 时兜底为默认值",
  minimal.ok === true
    && minimal.project.viewport.zoom === 1
    && Array.isArray(minimal.project.edges)
    && typeof minimal.project.name === "string",
  JSON.stringify(minimal.project?.viewport));

// —— 7) 源码钉桩：store 真的接上了导入 ——
const storeSource = readFileSync(
  path.join(process.cwd(), "src", "features", "ai-canvas", "ai-canvas-store.js"),
  "utf8"
);
check("store 提供 IMPORT_PROJECT 与 importProject（导入链路真的接上）",
  /IMPORT_PROJECT/.test(storeSource) && /importProject:/.test(storeSource),
  "");

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
