#!/usr/bin/env node
// 前端「块级克隆」advisory 门禁档（V11-RF-055）。
//
// ── 这是什么 ──────────────────────────────────────────────────
// 把 D-2 的**一次性**块级审计固化成**常驻**档：
//   · 每次阶段 D 排产前跑一次即得最新清单（旧快照清单会过期，见缺陷 ⑨e）；
//   · 新溜进来的块级复制也会出现在清单里。
// 判据沿用 §7.2 已锁定的排产口径（≥10 行 / 剔空行注释 import / L1+L2 双层 / 贪心最长公共段），
// 实现在 lib/block-clone.mjs，本文件只负责取扫描范围 + 出报告。
//
// ── 🔴 只报不记账（advisory 纪律，同 RF-046）──────────────────────
//   本档**恒以 0 退出**：不参与 ok、不写进 duplicateCount、不进基线、不影响 lint 棘轮。
//   扫描异常一律 try/catch 降级（打印降级原因后仍退出 0）。
//   ⇒ 因此它被登记在 run-all.mjs 的 **TOOLS**（只读取证工具，不进断言顺序表），
//     需要时手工跑：`node scripts/verify/block-clone-advisory.mjs`。
//
// ── ⚠️ 上线后必然报 ~74 块 / 1342 行 ──────────────────────────
//   §6.10 明确写了：那是**在册债务，不是回归**。别把清单变长当成门禁变红。
//
// 用法（必须在仓库根目录跑，lib 用 process.cwd()）：
//   node scripts/verify/block-clone-advisory.mjs            # 人读报告
//   node scripts/verify/block-clone-advisory.mjs --json     # 机器可读
//   node scripts/verify/block-clone-advisory.mjs --min 5    # 调排产阈值（默认 10）
//   node scripts/verify/block-clone-advisory.mjs --top 20   # 只印前 N 项（计数仍是全量）
//   node scripts/verify/block-clone-advisory.mjs --anchor 3 --miss 6   # 调匹配灵敏度（见下）
//
// ── 灵敏度旋钮（默认值是保守档，理由写在 lib/block-clone.mjs 的常量注释里）──
//   --miss 调大 ⇒ 清单变大，但代价是 A 类（字节一致）会被"连坐"降级成 C：
//     实测（71c57d5）miss=2 → 54 块/845 行 A=10；miss=6 → 72 块/1253 行 **A=5**；
//     miss=10 → 79 块/1523 行 A=4。
//     ⇒ 排产要的就是 A/B 两类可直接裁决的块，把 A 吃掉等于把清单变成噪声。
//     若想复现 D-2 那次审计的量级（~74 块/1342 行），用 --miss 6 左右。

import process from "node:process";
import { FRONTEND_SCAN_SCOPE, listFrontendSourceFiles } from "./lib/frontend-sources.mjs";
import { scanBlockClones, MIN_BLOCK_LINES, ANCHOR_LEN, MAX_CONSEC_MISS } from "./lib/block-clone.mjs";

const args = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const asJson = args.includes("--json");
const minLines = flagValue("--min", MIN_BLOCK_LINES);
const anchorLen = flagValue("--anchor", ANCHOR_LEN);
const maxMiss = flagValue("--miss", MAX_CONSEC_MISS);
const top = flagValue("--top", 0);

const JUDGE =
  `阈值 ≥${minLines} 行连续块；先剔空行/注释行/import 块；` +
  "L1=空白归一化、L2=标识符按首次出现序号归一+字面量抹成 S/N/R（专抓改名克隆）；" +
  `滚动哈希锚定（锚长 ${anchorLen}）+ 左右容差扩展（最多连续 ${maxMiss} 行不同）取极大公共段，` +
  "同文件对内按段长降序贪心取互不重叠段；" +
  "三类预判统一按 L1 逐行比对：A=差 0 行 / B=差 1–2 行 / C=差 ≥3 行。";

const WARNING =
  "L1 相同 ≠ 语义等价：只比行的形状，不比标识符指向什么。" +
  "实证反例 loadPromptCategories 两侧 L1 完全相同但兜底常量不同源" +
  "（main 写死 5 项 vs outfit 动态聚合）⇒ 拿这份清单直接搬会在这里翻车，" +
  "每一块都必须人工判一遍。";

const KNOWN_DEBT =
  "清单长 ≠ 门禁变红：本档只报不记账，恒以 0 退出。" +
  "§6.10 预估上线后会报 ~74 块 / 1342 行（D-2 一次性审计，快照 9cfa54b，用的是更模糊的相似度）；" +
  "⚠️ 2026-10-03 修复了 extractEffectiveLines 的「字符串里的块注释起始」吞行缺陷后，" +
  "基数变为有效行 21561（修复前 14812，盲区约 30%）、命中 98 块 / 1788 行 A=12 B=15 C=71。" +
  "修复前的 54 块 / 845 行是**下界**，勿再引用。" +
  "本档是**保守档**（--miss 2），宁可漏也不把 A 类连坐降级；" +
  "--miss 6 只作上界估计（A 类会从 12 掉到更少），不得用于排产。";

function emit(payload) {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const p = payload;
  if (p.error) {
    console.log(`[block-clone advisory] 扫描失败，已降级（只报不记账，恒退出 0）：${p.error}`);
    return;
  }
  const s = p.scan;
  console.log(
    `[block-clone advisory] 只报不记账 | 扫描文件=${s.scannedFiles} ` +
      `有效行=${s.effectiveLines} 阈值=${s.minLines} 耗时=${s.elapsedMs}ms`
  );
  console.log(`[block-clone advisory] 判据：${JUDGE}`);
  console.log(`[block-clone advisory] ⚠️ ${WARNING}`);
  console.log(`[block-clone advisory] ⚠️ ${KNOWN_DEBT}`);
  console.log(
    `[block-clone advisory] 命中 ${s.blockCount} 块 / ${s.cloneLines} 行 ` +
      `(L1=${s.l1Count} L2=${s.l2Count}) ｜ A=${s.byKind.A} B=${s.byKind.B} C=${s.byKind.C}`
  );
  if (p.pairs.length) {
    console.log("[block-clone advisory] 按文件对：");
    for (const pr of p.pairs.slice(0, 10)) {
      console.log(`  ${pr.pair}  ${pr.blocks} 块 / ${pr.lines} 行`);
    }
  }
  const shown = top > 0 ? p.blocks.slice(0, top) : p.blocks;
  if (shown.length) {
    console.log(`[block-clone advisory] 清单${top > 0 ? `（前 ${shown.length} / 共 ${p.blocks.length}）` : ""}：`);
    for (const b of shown) {
      console.log(
        `  [${b.kind}][${b.level}] ${b.lines} 行` +
          (b.diffLines ? `（差 ${b.diffLines} 行 / ${Math.round(b.diffRatio * 100)}%）` : "") +
          ` ${b.a.name}  ${b.a.file}:${b.a.startLn}-${b.a.endLn}` +
          ` ↔ ${b.b.name}  ${b.b.file}:${b.b.startLn}-${b.b.endLn}`
      );
    }
  }
}

try {
  const files = listFrontendSourceFiles();
  const scan = scanBlockClones(files, { minLines, anchorLen, maxMiss });
  emit({
    advisoryOnly: true,
    affectsOk: false,
    exitCodeAlwaysZero: true,
    generatedBy: "V11-RF-055",
    scope: { ...FRONTEND_SCAN_SCOPE, fileCount: files.length },
    judge: JUDGE,
    warning: WARNING,
    knownDebt: KNOWN_DEBT,
    scan: {
      scannedFiles: scan.scannedFiles,
      effectiveLines: scan.effectiveLines,
      minLines: scan.minLines,
      anchorLen: scan.anchorLen,
      maxMiss: scan.maxMiss,
      elapsedMs: scan.elapsedMs,
      blockCount: scan.blockCount,
      cloneLines: scan.cloneLines,
      l1Count: scan.l1Count,
      l2Count: scan.l2Count,
      byKind: scan.byKind,
    },
    pairs: scan.pairs,
    blocks: scan.blocks,
    note: "只报不记账：不参与 ok、不写进 duplicateCount、不进基线、不影响 lint 棘轮。",
  });
} catch (error) {
  emit({
    advisoryOnly: true,
    affectsOk: false,
    exitCodeAlwaysZero: true,
    generatedBy: "V11-RF-055",
    error: String(error?.message || error),
    note: "advisory 扫描失败已降级，不影响任何门禁的判定字段。",
  });
}

process.exit(0);
