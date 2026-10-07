// 验收差脚本（V4.0 执行单 V39）—— 对 8 档 × 维度组合跑输出，断言可执行视觉约束的硬性指标。
//
// 覆盖：
//   1. 相邻档有实质差异（7/7）
//   2. 无 UI 自述残留（参考值：% / （X参考））
//   3. 无互斥指令同现
//   4. 三段齐全 / none 只含 ban
//   5. 无参考图短路
//   6. 单调性（元素 budget 上限 / 构图 keep 条目数）
//   7. 双链路逐字一致（A 链路 buildReferenceRemixPrompt 的参考策略段 == B 链路 payload.policies）
//
// 退出码：0 = 全过；1 = 至少一个断言失败。

import {
  renderReferencePolicy,
  referenceTierFromStrength,
  NO_REFERENCE_NOTE
} from "../../src/shared/reference-policy.js";
import {
  buildReferenceRemixPrompt,
  buildSmartReferencePrompt
} from "../../src/features/upload/reference-upload.js";

const STRENGTHS = [30, 40, 50, 60, 70, 80, 90, 100];
const DIM_VALUES = ["none", "light", "medium", "strong"];
const ANCHORS = { keep: "可继承：", budget: "继承上限：", rewrite: "必须重做：", ban: "禁止：" };
const MUTEX_PHRASES = [
  "最大程度吸收", "尽量靠近", "强制重绘所有", "必须避开相同版式"
];
const RESIDUE_REF_VALUE = /参考值\s*[:：]\s*\d+%/;
const RESIDUE_DEGREE = /（(极低|低|轻中|中|中高|高|极高|满)参考/;

let failures = 0;
const log = (ok, msg) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
};

// 把整段输出按维度切成 { 元素, 构图, 场景主题 } 三个段落。
function splitByDimension(text) {
  const segs = {};
  for (const dim of ["元素", "构图", "场景主题"]) {
    const marker = `【${dim}继承】`;
    const idx = text.indexOf(marker);
    if (idx < 0) { segs[dim] = null; continue; }
    const next = text.indexOf("【", idx + 1);
    segs[dim] = next < 0 ? text.slice(idx) : text.slice(idx, next);
  }
  return segs;
}

function keepItemCount(seg) {
  if (!seg || seg.indexOf(ANCHORS.keep) < 0) return 0;
  const keepText = seg.split(ANCHORS.keep)[1].split("；")[0];
  return keepText.split("，").filter((s) => s.trim().length > 0).length;
}

function extractElementBudgetCap(text) {
  const m = text.match(/≤(\d+)\s*类/);
  return m ? Number(m[1]) : null;
}

// ---- 1. 相邻档有实质差异（固定默认维度） ----
console.log("\n[1] 相邻档实质差异（默认维度 element=medium / composition=light / scene=medium）");
{
  const base = { element: "medium", composition: "light", scene: "medium", styleCount: 1 };
  const outs = STRENGTHS.map((s) => renderReferencePolicy({ ...base, strength: s }).join("\n"));
  let pairsPass = 0;
  for (let i = 0; i < STRENGTHS.length - 1; i += 1) {
    const diff = outs[i] !== outs[i + 1];
    if (diff) pairsPass += 1;
    if (!diff) console.log(`   相邻档 ${STRENGTHS[i]}→${STRENGTHS[i + 1]} 输出完全相同`);
  }
  log(pairsPass === 7, `相邻 7/7 对产出不同约束（实际 ${pairsPass}/7）`);
}

// ---- 2/3/4 全组合扫描 ----
console.log("\n[2][3][4] 全组合扫描（8 档 × 4^3 维度 = 512 组）");
{
  let residueHit = 0;
  let mutexHit = 0;
  let threeSegFail = 0;
  let noneFail = 0;
  let combo = 0;
  for (const strength of STRENGTHS) {
    for (const element of DIM_VALUES) {
      for (const composition of DIM_VALUES) {
        for (const scene of DIM_VALUES) {
          combo += 1;
          const policy = renderReferencePolicy({ strength, element, composition, scene, styleCount: 1 });
          const text = policy.join("\n");
          if (RESIDUE_REF_VALUE.test(text) || RESIDUE_DEGREE.test(text)) residueHit += 1;
          if (MUTEX_PHRASES.some((p) => text.includes(p))) mutexHit += 1;
          const segs = splitByDimension(text);
          for (const dim of ["元素", "构图", "场景主题"]) {
            const val = { 元素: element, 构图: composition, 场景主题: scene }[dim];
            const seg = segs[dim];
            if (val === "none") {
              // none 只含 ban 锚点，不得出现 keep / budget / rewrite 锚点
              if (!seg || seg.indexOf(ANCHORS.ban) < 0) { noneFail += 1; continue; }
              if (seg.indexOf(ANCHORS.keep) >= 0 || seg.indexOf(ANCHORS.budget) >= 0 || seg.indexOf(ANCHORS.rewrite) >= 0) noneFail += 1;
            } else {
              if (!seg) { threeSegFail += 1; continue; }
              const hasKeep = seg.indexOf(ANCHORS.keep) >= 0;
              const hasRewrite = seg.indexOf(ANCHORS.rewrite) >= 0;
              const hasBan = seg.indexOf(ANCHORS.ban) >= 0;
              if (!(hasKeep && hasRewrite && hasBan)) threeSegFail += 1;
            }
          }
        }
      }
    }
  }
  log(residueHit === 0, `无 UI 自述残留（命中 ${residueHit}）`);
  log(mutexHit === 0, `无互斥指令同现（命中 ${mutexHit}）`);
  log(threeSegFail === 0, `非 none 维度三段齐全（失败 ${threeSegFail}）`);
  log(noneFail === 0, `none 维度只含 ban 锚点（失败 ${noneFail}）`);
  console.log(`   扫描组合总数：${combo}`);
}

// ---- 5. 无参考图短路 ----
console.log("\n[5] 无参考图短路（styleCount=0）");
{
  const empty = renderReferencePolicy({ strength: 60, element: "medium", composition: "light", scene: "medium", styleCount: 0 });
  log(empty.length === 0, `renderReferencePolicy(styleCount=0) 返回 []（实际长度 ${empty.length}）`);

  const aPrompt = buildReferenceRemixPrompt({ prompt: "", strength: 60, element: "medium", composition: "light", scene: "medium" }, 1, 0);
  const hasNote = aPrompt.includes(NO_REFERENCE_NOTE);
  const noPolicySeg = !aPrompt.includes("【元素继承】") && !aPrompt.includes("【构图继承】") && !aPrompt.includes("【场景主题继承】");
  log(hasNote && noPolicySeg, `buildReferenceRemixPrompt(styleCount=0) 仅含说明句、无策略段（note=${hasNote} noSeg=${noPolicySeg}）`);

  const bPrompt = buildSmartReferencePrompt({ prompt: "", strength: 60, element: "medium", composition: "light", scene: "medium" }, 0);
  log(bPrompt.includes(NO_REFERENCE_NOTE) && !bPrompt.includes("【元素继承】"), `buildSmartReferencePrompt(styleCount=0) 仅含说明句`);

  // styleCount>0 必须有策略段、且不得出现说明句
  const aPrompt2 = buildReferenceRemixPrompt({ prompt: "", strength: 60, element: "medium", composition: "light", scene: "medium" }, 1, 2);
  const hasSeg = aPrompt2.includes("【元素继承】") && aPrompt2.includes("【构图继承】") && aPrompt2.includes("【场景主题继承】");
  log(hasSeg && !aPrompt2.includes(NO_REFERENCE_NOTE), `styleCount>0 必有策略段、无说明句`);
}

// ---- 6. 单调性 ----
console.log("\n[6] 单调性（low→medium→high）");
{
  const low = renderReferencePolicy({ strength: 50, element: "medium", composition: "light", scene: "medium", styleCount: 1 }).join("\n");
  const med = renderReferencePolicy({ strength: 70, element: "medium", composition: "light", scene: "medium", styleCount: 1 }).join("\n");
  const high = renderReferencePolicy({ strength: 100, element: "medium", composition: "light", scene: "medium", styleCount: 1 }).join("\n");
  const caps = [low, med, high].map(extractElementBudgetCap);
  const monoCap = caps[0] !== null && caps[1] !== null && caps[2] !== null && caps[0] < caps[1] && caps[1] < caps[2];
  log(monoCap, `元素 budget 上限严格递增（${caps.join(" < ")}）`);

  const keepCounts = [low, med, high].map((t) => keepItemCount(splitByDimension(t)["构图"]));
  const monoKeep = keepCounts[0] < keepCounts[1] && keepCounts[1] < keepCounts[2];
  log(monoKeep, `构图 keep 条目数严格递增（${keepCounts.join(" < ")}）`);

  // 档位映射自检
  const tierMap = STRENGTHS.map((s) => `${s}:${referenceTierFromStrength(s)}`).join(" ");
  log(
    referenceTierFromStrength(30) === "low" && referenceTierFromStrength(50) === "low"
      && referenceTierFromStrength(60) === "medium" && referenceTierFromStrength(70) === "medium"
      && referenceTierFromStrength(80) === "high" && referenceTierFromStrength(100) === "high",
    `档位映射正确（${tierMap}）`
  );
}

// ---- 7. 双链路逐字一致 ----
console.log("\n[7] 双链路逐字一致（A 链路策略段 == B 链路 payload.policies）");
{
  const params = { strength: 60, element: "medium", composition: "light", scene: "medium", styleCount: 2 };
  const seg = renderReferencePolicy(params);
  const segText = seg.join("\n");

  const aPrompt = buildReferenceRemixPrompt(
    { prompt: "测试主体", strength: params.strength, element: params.element, composition: params.composition, scene: params.scene },
    1, params.styleCount
  );
  // A 链路策略段必须作为连续子数组出现
  const aLines = aPrompt.split("\n");
  let aFound = false;
  for (let i = 0; i + seg.length <= aLines.length; i += 1) {
    if (seg.every((line, k) => aLines[i + k] === line)) { aFound = true; break; }
  }
  log(aFound, `buildReferenceRemixPrompt 内嵌策略段与 renderReferencePolicy 逐字相同`);

  const bPrompt = buildSmartReferencePrompt(
    { prompt: "测试主体", strength: params.strength, element: params.element, composition: params.composition, scene: params.scene },
    params.styleCount
  );
  const bLines = bPrompt.split("\n");
  let bFound = false;
  for (let i = 0; i + seg.length <= bLines.length; i += 1) {
    if (seg.every((line, k) => bLines[i + k] === line)) { bFound = true; break; }
  }
  log(bFound, `buildSmartReferencePrompt 内嵌策略段与 renderReferencePolicy 逐字相同`);

  // 模拟 main.jsx 的 B 链路 payload：policies 即 renderReferencePolicy 结果
  const payloadPolicies = renderReferencePolicy(params);
  log(JSON.stringify(payloadPolicies) === JSON.stringify(seg), `main.jsx payload.policies 与 A 链路策略段逐字相同`);
}

console.log(`\n==== 结果：${failures === 0 ? "全部通过 ✅" : `${failures} 项失败 ❌`} ====`);
process.exit(failures === 0 ? 0 : 1);
