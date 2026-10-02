// 前端「块级克隆」探测（V11-RF-055，advisory 档；只报不记账）。
//
// ── 为什么需要它 ──────────────────────────────────────────────
// D-2 的块级清单是一次性审计（基于快照 9cfa54b），下次排产又要重做一遍，
// 且旧快照清单会过期（缺陷 ⑨e：#1 已被 RF-051 收口，直接排产会搬空）。
// ⇒ 把它固化成常驻档：**每次排产前跑一次即得清单**，也能发现新溜进来的块级复制。
//
// ── 判据（沿用 §7.2 已锁定的排产口径，不自创）─────────────────────
//   1. 阈值 **≥10 行**的连续块（`MIN_BLOCK_LINES`）。
//   2. 先剔除：空行 / 注释行（`//`、`/* */` 含跨行）/** import 块**（含多行 import）。
//      ⇒ 剔除后剩下的叫「有效行」，行号一律用**原始文件行号**，便于人工按图索骥。
//   3. 双层匹配：
//        L1 = 空白归一化（trim + 折叠连续空白）
//        L2 = 在 L1 基础上**标识符按首次出现序号归一 + 字符串/数字/正则抹成 S/N/R**
//             （复用 lib/rename-clone.mjs 的 tokenizer 与归一化，与 RF-046 advisory 同口径）
//      ⇒ L2 专抓**改名克隆**；因为「L1 相同 ⇒ L2 相同」，L2 是 L1 的超集。
//   4. **贪心取最长公共连续段**：先用长度 = ANCHOR_LEN 的滚动哈希找锚点窗口，
//      再向左右**容差扩展**（最多连续 MAX_CONSEC_MISS 行不同，见常量注释）到不能再扩，
//      两端各裁掉差异行，得到极大公共段；
//      同一对文件内按段长降序**贪心接受互不重叠**的段。
//      （哈希只用来找候选，命中后逐行复核 ⇒ 哈希碰撞不会产生假阳性。）
//   5. 三类预判统一按 **L1 逐行比对**定档：
//        A = 逐字节一致（diff 0）／ B = 差 1–2 行／ C = 差 ≥3 行。
//
// ── 🔴 已知盲区 / 局限（§0.9 第 11/17 条：凡是过滤都要写清过滤掉了什么）──
//   1. **L1 相同 ≠ 语义等价**（本条最危险，与 RF-046 同源）：
//      只比行的形状，不比标识符指向什么。实证反例：`loadPromptCategories` 两侧 L1
//      完全相同，但兜底常量不同源（main 写死 5 项 vs outfit 动态聚合）。
//      ⇒ 本档输出**只能当线索，不能当"可搬"依据**，必须人工判一遍。
//   2. **不做近似匹配**：扩展是**等长对齐**的（两侧同步前进），
//      ⇒ 中间被**插入/删除**了整行的克隆只能吃到差异点之前/之后的半段，
//         （连续 2 行不同即停，不会把错位后的垃圾一起吞进来）。
//      这是与 rename-clone「不做 LCS 相似度」一致的取舍：宁可漏，不可误报淹没清单。
//   3. 只剔整行注释，**行尾注释不在剔除之列** ⇒ 两条仅差行尾注释的块会被判 B/C。
//   4. 高度重复的样板（同一 10 行窗口在某文件里出现 > REPEAT_SKIP 次）会被跳过，
//      否则扩展阶段会退化成 O(n²)。这类样板本身也不是"复制粘贴债务"。
//
// ── 只报不记账 ────────────────────────────────────────────────
//   本模块**不参与 ok 判定、不写进 duplicateCount、不进基线、不影响 lint 棘轮**。
//   ⚠️ 上线后必然报 ~74 块 / 1342 行（§6.10）：那是**在册债务，不是回归**。

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { tokenize, normalize } from "./rename-clone.mjs";

/** 阈值：连续块至少这么多有效行才进清单（§7.2 排产口径）。 */
export const MIN_BLOCK_LINES = 10;

/**
 * 锚点窗口长度（实现细节，不是排产阈值）。
 * 为什么不用 minLines 直接当锚点：实测那样会把"中间夹着 1 行差异"的克隆整块漏掉 ——
 * 例如 saveEditingPrompt（30 行、只有 `makeResultId()` vs `makeId("prompt")` 一行不同），
 * 任何 10 行窗口都含那一行 ⇒ 锚不上 ⇒ 完全不进清单。
 * ⇒ 用较短的锚点定位，再**容差扩展**（见 MAX_CONSEC_MISS）。
 */
export const ANCHOR_LEN = 5;

/**
 * 扩展时最多容忍几个**连续**不同的行。
 * 0 = 严格要求逐行相同（会漏掉所有"差几行"的克隆）；
 * 2 = 允许孤立的差异行被吸收，遇到连续 2 行不同就停（插入/删除整行会立刻停住）。
 * 取 2 的依据：JS 里连续两行"碰巧相同"的概率极低，不会把无关区域粘起来。
 */
export const MAX_CONSEC_MISS = 2;

/** 同一文件的同一窗口出现次数超过这个数就跳过（见上面盲区第 4 条）。 */
export const REPEAT_SKIP = 128;

/** 单个哈希桶的成员上限（超过即跳过整桶，防扩展阶段退化成 O(n²)）。 */
export const MAX_BUCKET = 512;

const P = 31;

// ---------------------------------------------------------------- 有效行
/**
 * 剔除空行 / 注释行 / import 块，剩下的有效行。
 * @returns {Array<{ln:number,indent:number,l1:string,l2:string}>}
 *   ln = 原始文件行号（1 基）；indent = 原始行前导空白长度；l1/l2 = 两级归一化键。
 */
export function extractEffectiveLines(source) {
  const raw = String(source || "").split(/\r?\n/);
  const out = [];
  let inBlockComment = false;
  let inImport = false;

  for (let i = 0; i < raw.length; i += 1) {
    let text = raw[i];

    // 跨行块注释的续行
    if (inBlockComment) {
      const end = text.indexOf("*/");
      if (end < 0) continue;
      inBlockComment = false;
      text = text.slice(end + 2);
    }
    // 行内块注释（可能未闭合 ⇒ 进入跨行状态）
    for (;;) {
      const open = text.indexOf("/*");
      if (open < 0) break;
      const close = text.indexOf("*/", open + 2);
      if (close < 0) {
        inBlockComment = true;
        text = text.slice(0, open);
        break;
      }
      text = text.slice(0, open) + text.slice(close + 2);
    }

    const trimmed = text.trim();
    if (!trimmed) continue;                 // 空行
    if (trimmed.startsWith("//")) continue; // 整行注释

    const endsImport = /;\s*$/.test(trimmed)
      || /from\s+["'][^"']*["']\s*;?\s*$/.test(trimmed);
    if (inImport) {
      if (endsImport) inImport = false;
      continue;
    }
    if (/^import\b/.test(trimmed)) {
      inImport = !endsImport;
      continue;
    }

    const indent = /^[ \t]*/.exec(text)?.[0].length || 0;
    const l1 = trimmed.replace(/\s+/g, " ");
    out.push({ ln: i + 1, indent, l1, l2: l2Key(l1) });
  }
  return out;
}

function l2Key(l1) {
  return normalize(tokenize(l1), "L2").join("|");
}

// ---------------------------------------------------------------- 归属函数名
const HEADER_FN = /^([ \t]*)(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)\s*\(/;
const HEADER_VAR = /^([ \t]*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function\s*)?\(/;

/**
 * 给块起名字，三级兜底（启发式，不是语法解析）：
 *   ① 块内**第一个函数头**的名字最好用 —— 因为剔空行后相邻函数会被并进同一段，
 *      "这段的第一个函数"才是对排产有意义的标识（多个函数时加 `+N` 提示是合并段）。
 *   ② 块内没有函数头 ⇒ 向上找最近的、缩进更小的函数头（最多回看 60 行）。
 *   ③ 都没有 ⇒ 退化成「首行特征」（前 56 字符）。
 */
export function blockLabel(rawLines, blockLines) {
  let inner = "";
  let extra = 0;
  for (const bl of blockLines) {
    const text = rawLines[bl.ln - 1] ?? "";
    const mFn = HEADER_FN.exec(text);
    const mVar = mFn ? null : HEADER_VAR.exec(text);
    const name = mFn ? mFn[2] : mVar ? mVar[2] : "";
    if (!name) continue;
    if (!inner) inner = name;
    else if (name !== inner) extra += 1;
  }
  if (inner) return extra > 0 ? `${inner}(+${extra})` : inner;

  const startLn = blockLines[0].ln;
  const indent = blockLines[0].indent;
  for (let ln = startLn - 1; ln >= Math.max(1, startLn - 60); ln -= 1) {
    const text = rawLines[ln - 1] ?? "";
    const mFn = HEADER_FN.exec(text);
    if (mFn && mFn[1].length < indent) return mFn[2];
    const mVar = HEADER_VAR.exec(text);
    if (mVar && mVar[1].length < indent) return mVar[2];
  }
  return `首行:${String(blockLines[0].l1 || "").slice(0, 56)}`;
}

// ---------------------------------------------------------------- 匹配
function matchLevel(docs, level, minLines, anchorLen, maxMiss) {
  const ids = new Map();
  const idOf = (key) => {
    let v = ids.get(key);
    if (v === undefined) { v = ids.size + 1; ids.set(key, v); }
    return v;
  };

  let pow = 1;
  for (let k = 1; k < anchorLen; k += 1) pow = Math.imul(pow, P) >>> 0;

  // 1) 全库收集长度 = anchorLen 的滚动哈希窗口
  const buckets = new Map();
  for (let d = 0; d < docs.length; d += 1) {
    const lines = docs[d].lines;
    if (lines.length < anchorLen) continue;
    let h = 0;
    for (let i = 0; i < anchorLen; i += 1) h = (Math.imul(h, P) + idOf(lines[i][level])) >>> 0;
    pushBucket(buckets, h, d, 0);
    for (let i = anchorLen; i < lines.length; i += 1) {
      const outId = idOf(lines[i - anchorLen][level]);
      const inId = idOf(lines[i][level]);
      h = (Math.imul((h - Math.imul(outId, pow)) >>> 0, P) + inId) >>> 0;
      pushBucket(buckets, h, d, i - anchorLen + 1);
    }
  }

  // 2) 只对"跨 ≥2 个文件"的桶做左右容差扩展
  const seen = new Map(); // 去重键 -> match
  for (const bucket of buckets.values()) {
    if (bucket.length < 2 || bucket.length > MAX_BUCKET) continue;
    const byDoc = new Map();
    for (const [d, pos] of bucket) {
      if (!byDoc.has(d)) byDoc.set(d, []);
      byDoc.get(d).push(pos);
    }
    const docIds = [...byDoc.keys()].sort((a, b) => a - b);
    if (docIds.length < 2) continue;
    for (let x = 0; x < docIds.length; x += 1) {
      const da = docIds[x];
      if (byDoc.get(da).length > REPEAT_SKIP) continue;
      for (let y = x + 1; y < docIds.length; y += 1) {
        const db = docIds[y];
        if (byDoc.get(db).length > REPEAT_SKIP) continue;
        const A = docs[da].lines;
        const B = docs[db].lines;
        for (const a0 of byDoc.get(da)) {
          for (const b0 of byDoc.get(db)) {
            const m = extend(A, B, a0, b0, anchorLen, level, maxMiss);
            if (m === null || m.len < minLines) continue;
            const key = `${da}:${m.aStart}|${db}:${m.bStart}|${m.len}`;
            if (!seen.has(key)) seen.set(key, { da, db, ...m });
          }
        }
      }
    }
  }

  // 3) 同一对文件内：按段长降序贪心接受互不重叠的段
  const byPair = new Map();
  for (const m of seen.values()) {
    const pairKey = `${m.da}|${m.db}`;
    if (!byPair.has(pairKey)) byPair.set(pairKey, []);
    byPair.get(pairKey).push(m);
  }
  const picked = [];
  for (const list of byPair.values()) {
    list.sort((a, b) => b.len - a.len || a.aStart - b.aStart);
    const usedA = [];
    const usedB = [];
    for (const m of list) {
      if (overlaps(usedA, m.aStart, m.len) || overlaps(usedB, m.bStart, m.len)) continue;
      usedA.push([m.aStart, m.aStart + m.len]);
      usedB.push([m.bStart, m.bStart + m.len]);
      picked.push(m);
    }
  }
  return picked;
}

function pushBucket(buckets, hash, doc, pos) {
  let arr = buckets.get(hash);
  if (!arr) { arr = []; buckets.set(hash, arr); }
  arr.push([doc, pos]);
}

/**
 * 从锚点窗口 [a0, a0+w) 出发左右**容差**扩展，再裁掉两端差异行。
 * 返回 {aStart,bStart,len}；不足 minLines 时返回 null（由调用方过滤）。
 */
function extend(A, B, a0, b0, w, level, maxMiss) {
  let aStart = a0;
  let bStart = b0;
  let aEnd = a0 + w; // 开区间
  let bEnd = b0 + w;

  // 向左：允许孤立的差异行，连续 maxMiss+1 行不同即停
  let missL = 0;
  while (aStart > 0 && bStart > 0) {
    if (A[aStart - 1][level] === B[bStart - 1][level]) missL = 0;
    else {
      missL += 1;
      if (missL > maxMiss) break;
    }
    aStart -= 1;
    bStart -= 1;
  }
  // 向右（同上）
  let missR = 0;
  while (aEnd < A.length && bEnd < B.length) {
    if (A[aEnd][level] === B[bEnd][level]) missR = 0;
    else {
      missR += 1;
      if (missR > maxMiss) break;
    }
    aEnd += 1;
    bEnd += 1;
  }

  // 裁掉两端的差异行（扩展时为了"够长"可能多吃了几行）
  while (aEnd - aStart > 0 && A[aStart][level] !== B[bStart][level]) { aStart += 1; bStart += 1; }
  while (aEnd - aStart > 0 && A[aEnd - 1][level] !== B[bEnd - 1][level]) { aEnd -= 1; bEnd -= 1; }

  const len = aEnd - aStart;
  if (len <= 0) return null;
  return { aStart, bStart, len };
}

function overlaps(ranges, start, len) {
  const end = start + len;
  return ranges.some(([s, e]) => start < e && s < end);
}

function classify(aLines, bLines) {
  let diff = 0;
  for (let i = 0; i < aLines.length; i += 1) {
    if (aLines[i].l1 !== bLines[i].l1) diff += 1;
  }
  return { diff, kind: diff === 0 ? "A" : diff <= 2 ? "B" : "C" };
}

// ---------------------------------------------------------------- 主入口
/**
 * @param {string[]} files 相对仓库根的前端源码路径（通常传 listFrontendSourceFiles()）
 * @param {{minLines?:number, rawSources?:Map<string,string>}} [options]
 */
export function scanBlockClones(files, options = {}) {
  const root = process.cwd();
  const minLines = options.minLines ?? MIN_BLOCK_LINES;
  const anchorLen = Math.min(options.anchorLen ?? ANCHOR_LEN, minLines);
  const maxMiss = options.maxMiss ?? MAX_CONSEC_MISS;
  const startedAt = Date.now();

  const docs = [];
  let scannedFiles = 0;
  let effectiveLines = 0;

  for (const rel of files) {
    let source;
    try {
      source = readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    scannedFiles += 1;
    const lines = extractEffectiveLines(source);
    effectiveLines += lines.length;
    docs.push({ file: rel, lines, raw: source.split(/\r?\n/) });
  }

  // L1 先跑（置信度最高），L2 后跑并剔除与 L1 重叠的段
  // 键名用小写（与 extractEffectiveLines 的字段名一致）；外层 "L1"/"L2" 只是报告标签。
  const l1Hits = matchLevel(docs, "l1", minLines, anchorLen, maxMiss);
  const claimed = new Map(); // pairKey -> ranges[]
  const side = (m, which) => (which === 0 ? [m.aStart, m.aStart + m.len] : [m.bStart, m.bStart + m.len]);
  for (const m of l1Hits) {
    const key = `${m.da}|${m.db}`;
    if (!claimed.has(key)) claimed.set(key, [[], []]);
    claimed.get(key)[0].push(side(m, 0));
    claimed.get(key)[1].push(side(m, 1));
  }
  const l2Raw = matchLevel(docs, "l2", minLines, anchorLen, maxMiss);
  const l2Hits = l2Raw.filter((m) => {
    const key = `${m.da}|${m.db}`;
    const ranges = claimed.get(key);
    if (!ranges) return true;
    return !ranges.some((list) => list.some(([s, e]) => m.aStart < e && s < m.aStart + m.len))
      && !ranges[1].some(([s, e]) => m.bStart < e && s < m.bStart + m.len);
  });

  const shape = (level) => (m) => {
    const da = docs[m.da];
    const db = docs[m.db];
    const aSlice = da.lines.slice(m.aStart, m.aStart + m.len);
    const bSlice = db.lines.slice(m.bStart, m.bStart + m.len);
    const { diff, kind } = classify(aSlice, bSlice);
    const diffRatio = Math.round((diff / m.len) * 100) / 100;
    return {
      level,
      kind,
      diffLines: diff,
      diffRatio,
      lines: m.len,
      a: {
        file: da.file,
        startLn: aSlice[0].ln,
        endLn: aSlice[aSlice.length - 1].ln,
        name: blockLabel(da.raw, aSlice),
      },
      b: {
        file: db.file,
        startLn: bSlice[0].ln,
        endLn: bSlice[bSlice.length - 1].ln,
        name: blockLabel(db.raw, bSlice),
      },
    };
  };

  const items = [...l1Hits.map(shape("L1")), ...l2Hits.map(shape("L2"))]
    .sort((a, b) => b.lines - a.lines || a.level.localeCompare(b.level));

  const byKind = { A: 0, B: 0, C: 0 };
  let totalLines = 0;
  for (const it of items) { byKind[it.kind] += 1; totalLines += it.lines; }

  const byPair = new Map();
  for (const it of items) {
    const key = `${it.a.file} ↔ ${it.b.file}`;
    const cur = byPair.get(key) || { pair: key, blocks: 0, lines: 0 };
    cur.blocks += 1;
    cur.lines += it.lines;
    byPair.set(key, cur);
  }

  return {
    scannedFiles,
    effectiveLines,
    minLines,
    anchorLen,
    maxMiss,
    elapsedMs: Date.now() - startedAt,
    blockCount: items.length,
    cloneLines: totalLines,
    byKind,
    l1Count: l1Hits.length,
    l2Count: l2Hits.length,
    pairs: [...byPair.values()].sort((a, b) => b.lines - a.lines),
    blocks: items,
  };
}
