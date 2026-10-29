// V143 MVP-4（画布自动工作流引擎）无头验收。
//
// 覆盖：拓扑排序（线性链 / 菱形 / 互不相连 / 重复边 / 悬空边 / 自环 / 环检测）、
// 运行计划只挑生成节点且按拓扑序、有环时拒绝执行（绝不猜顺序、绝不无限循环），
// 以及 gen → gen 链式多轮的输入解析（上游已成功的生成节点算作输入图）。
//
// 全部 import **真实源码**，不起服务、不联网、不扣费。
// 用法：node scripts/verify/ai-canvas-workflow-check.mjs

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
// 只 import 零 import 的纯逻辑模块：ai-canvas-generation.js 会连带读到
// app-defaults.js 的 import.meta.env（Vite 专属），纯 node 下会崩，进不了无头断言。
import {
  chainedUpstreamResults,
  planWorkflowRuns,
  topoSortNodes,
  workflowInputsWithChain
} from "../../src/features/ai-canvas/ai-canvas-workflow.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

const node = (id, type = "image", data = {}) => ({ id, type, data });
const edge = (from, to) => ({ from, to });

// —— 1) 线性链 ——
const linear = topoSortNodes(
  [node("a"), node("b"), node("c")],
  [edge("a", "b"), edge("b", "c")]
);
check("线性链 a→b→c 排序正确",
  linear.order.join(",") === "a,b,c" && linear.cycle.length === 0,
  `order=${linear.order} cycle=${linear.cycle}`);

// —— 2) 菱形：a 先、d 最后 ——
const diamond = topoSortNodes(
  [node("a"), node("b"), node("c"), node("d")],
  [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")]
);
check("菱形依赖：a 第一个、d 最后一个",
  diamond.order[0] === "a" && diamond.order[diamond.order.length - 1] === "d" && diamond.order.length === 4,
  diamond.order.join(","));

// —— 3) 互不相连的节点全部排入 ——
const islands = topoSortNodes([node("x"), node("y"), node("z")], []);
check("无连线的节点全部排入（不丢节点）",
  islands.order.length === 3 && islands.cycle.length === 0,
  islands.order.join(","));

// —— 4) 重复边不把入度算歪 ——
const dup = topoSortNodes([node("a"), node("b")], [edge("a", "b"), edge("a", "b"), edge("a", "b")]);
check("重复边只算一次入度（否则 b 排不出来）",
  dup.order.join(",") === "a,b" && dup.cycle.length === 0,
  `order=${dup.order} cycle=${dup.cycle}`);

// —— 5) 悬空边忽略 ——
const dangling = topoSortNodes([node("a"), node("b")], [edge("a", "b"), edge("幽灵", "a")]);
check("端点不存在的悬空边被忽略",
  dangling.order.join(",") === "a,b" && dangling.cycle.length === 0,
  `order=${dangling.order} cycle=${dangling.cycle}`);

// —— 6) 环检测：三节点环 ——
const ring = topoSortNodes(
  [node("a"), node("b"), node("c")],
  [edge("a", "b"), edge("b", "c"), edge("c", "a")]
);
check("三节点环被检出（order 排不完、cycle 非空）",
  ring.cycle.length === 3 && ring.order.length === 0,
  `order=${ring.order} cycle=${ring.cycle}`);

// —— 7) 自环 ——
// 语义（与 topoSortNodes 的注释一致）：cycle = 处在环里 **或被环堵住的下游**。
// 所以 a→a 时 a 排不出，依赖 a 的 b 同样排不出——两者都进 cycle，绝不能"漏跑成孤立执行"。
const blockedBySelfLoop = topoSortNodes([node("a"), node("b")], [edge("a", "a"), edge("a", "b")]);
check("自环被检出，且被它堵住的下游也一并标为不可排定",
  blockedBySelfLoop.order.length === 0 && blockedBySelfLoop.cycle.join(",") === "a,b",
  `order=${blockedBySelfLoop.order} cycle=${blockedBySelfLoop.cycle}`);
const selfLoop = topoSortNodes([node("a"), node("b"), node("c")], [edge("a", "a"), edge("b", "c")]);
check("自环不影响无关节点（b→c 照常排定）",
  selfLoop.cycle.join(",") === "a" && selfLoop.order.join(",") === "b,c",
  `order=${selfLoop.order} cycle=${selfLoop.cycle}`);

// —— 8) 运行计划：只挑生成节点、按拓扑序 ——
const plan = planWorkflowRuns(
  [
    node("i1", "image"),
    node("g1", "generation"),
    node("g2", "generation"),
    node("p1", "prompt")
  ],
  [edge("i1", "g1"), edge("g1", "g2"), edge("p1", "g2")]
);
check("运行计划只挑生成节点并按拓扑序（g1 在 g2 之前）",
  plan.runnable.join(",") === "g1,g2" && plan.cycle.length === 0,
  `runnable=${plan.runnable} reason=${plan.reason}`);

// —— 9) 没有生成节点 ——
const noGen = planWorkflowRuns([node("i1", "image"), node("p1", "prompt")], [edge("i1", "p1")]);
check("没有生成节点时不执行并给出中文原因",
  noGen.runnable.length === 0 && /没有.{0,6}生成节点/.test(noGen.reason),
  noGen.reason);

// —— 10) 有环时拒绝执行（这是防无限循环的关键闸门）——
const cyclePlan = planWorkflowRuns(
  [node("g1", "generation"), node("g2", "generation")],
  [edge("g1", "g2"), edge("g2", "g1")]
);
check("有环时拒绝执行（runnable 为空且给出原因）",
  cyclePlan.runnable.length === 0 && cyclePlan.cycle.length === 2 && /循环/.test(cyclePlan.reason),
  `runnable=${cyclePlan.runnable} reason=${cyclePlan.reason}`);

// —— 11) 排序稳定性：互不相关的节点按 nodes 原序 ——
const stable = planWorkflowRuns(
  [node("g3", "generation"), node("g1", "generation"), node("g2", "generation")],
  []
);
check("互不相关时顺序稳定（按画布里的节点顺序）",
  stable.runnable.join(",") === "g3,g1,g2",
  stable.runnable.join(","));

// —— 12) 链式多轮：上游已成功的生成节点算作输入图 ——
const chained = {
  nodes: [
    node("img1", "image", { src: "data:image/png;base64,AAA" }),
    node("gen1", "generation", { status: "success", resultUrl: "http://relay/r1.png" }),
    node("gen2", "generation", { status: "idle", prompt: "第二轮微调" }),
    node("p1", "prompt", { text: "提示词A" })
  ],
  edges: [edge("img1", "gen1"), edge("gen1", "gen2"), edge("p1", "gen2")]
};
const chainedOut = workflowInputsWithChain({ imageNodes: [], promptText: "提示词A" }, chained, chained.nodes[2]);
check("链式：上游已成功的生成节点被算作输入图",
  chainedOut.imageNodes.length === 1 && chainedOut.imageNodes[0].data.src === "http://relay/r1.png",
  JSON.stringify(chainedOut.imageNodes.map((item) => item.data.src)));
check("链式：提示词原样透传",
  chainedOut.promptText === "提示词A",
  chainedOut.promptText);

// —— 13) 上游生成节点未成功 / 还没跑 → 不能当输入 ——
const pending = {
  nodes: [
    node("gen1", "generation", { status: "failed", error: "上游报错" }),
    node("gen2", "generation", { status: "idle" })
  ],
  edges: [edge("gen1", "gen2")]
};
check("上游生成节点失败时不当作输入",
  chainedUpstreamResults(pending, pending.nodes[1]).length === 0,
  JSON.stringify(chainedUpstreamResults(pending, pending.nodes[1])));
const notRun = {
  nodes: [
    node("gen1", "generation", { status: "idle" }),
    node("gen2", "generation", { status: "idle" })
  ],
  edges: [edge("gen1", "gen2")]
};
check("上游生成节点还没跑时不当作输入",
  workflowInputsWithChain({ imageNodes: [], promptText: "" }, notRun, notRun.nodes[1]).imageNodes.length === 0,
  JSON.stringify(workflowInputsWithChain({ imageNodes: [], promptText: "" }, notRun, notRun.nodes[1]).imageNodes));

// —— 14) 回归：基础收集结果原样合并、不丢图 ——
const baseTwo = {
  imageNodes: [node("i1", "image", { src: "data:1" }), node("i2", "image", { src: "data:2" })],
  promptText: "换成红色连衣裙"
};
const merged = workflowInputsWithChain(baseTwo, { nodes: [], edges: [] }, node("g1", "generation"));
check("基础收集的图片与提示词原样合并（回归，未改坏原口径）",
  merged.imageNodes.length === 2 && merged.imageNodes[0].id === "i1" && merged.promptText === "换成红色连衣裙",
  JSON.stringify({ images: merged.imageNodes.map((n) => n.id), prompt: merged.promptText }));

// —— 15) 源码钉桩：生成模块必须委托到这里，防止两边各写一份解析逻辑 ——
const generationSource = readFileSync(
  path.join(process.cwd(), "src", "features", "ai-canvas", "ai-canvas-generation.js"),
  "utf8"
);
check("生成模块 collectWorkflowInputs 委托 workflowInputsWithChain（不另写一份解析）",
  /collectWorkflowInputs[\s\S]{0,220}workflowInputsWithChain/.test(generationSource),
  "");
check("委托时以 collectGenerationInputs 的结果为基底（口径叠加而非替换）",
  /workflowInputsWithChain\(collectGenerationInputs\(/.test(generationSource),
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
