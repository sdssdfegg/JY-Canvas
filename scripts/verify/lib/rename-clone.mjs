// 前端「改名克隆 / 结构克隆」探测（V11-RF-046，供 frontend-duplication-check(019) 作 advisory 档用）。
//
// ── 为什么需要它 ──────────────────────────────────────────────
// 019 是**按名字比对**的棘轮，天然有两个反向盲区（§0.9 第 19 条）：
//   ① 改名克隆看不见：逻辑逐字节相同、只是名字不同（imageExtension ↔ imageExtensionFromMime）；
//   ② 同名不同义会误报：loadPromptCategories 两侧名字相同但语义不同（RF-040 已裁定改名不合并）。
// RF-032 实测：**62 组克隆里 53 组是组件内缩进函数** ⇒ 019 的「行首顶层」判据一条也看不见。
//   本模块因此**不按行首、不按名字**，改成"函数体 token 序列 + 两级归一化哈希"。
//
// ── 判据（务必与结论一起引用）──────────────────────────────────
//   抽取：自写 tokenizer → 抽出函数体（`function NAME(`、`const NAME = (…) => {`、
//         `const NAME = function (`），**含组件内/缩进的嵌套函数**。
//   归一化 L1：标识符按首次出现序号归一（v0/v1…），**保留**字符串/数字/正则字面量
//         ⇒ L1 命中 =「逐 token 等价，仅名字不同」= 高置信改名克隆。
//   归一化 L2：在 L1 基础上把字面量抹成 S/N/R
//         ⇒ L2 命中 =「结构等价、字面量不同」= 可能是改了默认值常量，也可能**文案已分叉**。
//   成组条件：跨**不同文件**（同文件内的相似不算克隆）、函数体 ≥ MIN_TOKENS 个 token。
//
// ── 🔴 已知盲区 / 局限（§0.9 第 11/17 条：凡是过滤都要写清过滤掉了什么）──
//   1. **L1 相同 ≠ 语义等价**（本条最危险）：只比 token 形状，不比标识符指向什么。
//      实证反例：`loadPromptCategories` 两侧 L1 完全相同，但兜底常量不同源
//      （main 写死 5 项 vs outfit 动态聚合）⇒ **任何"哈希相等就自动合并"都会在这里翻车**。
//      ⇒ 本模块的输出**只能当线索，不能当"可合并"依据**，必须人工判一遍。
//   2. 不看成段复制的**代码块**（那类由 scripts/dev/block-clone-lines.mjs 测），只看函数。
//   3. tokenizer 不解析 JSX 文本节点：JSX 里的英文撇号/引号可能把后续文本吞成"字符串 token"
//      （已加"撇号前若是标识符字符则不视为字符串起点"的缓解，但不彻底）⇒ 可能带来少量误报。
//   4. 不做近似匹配（不做 O(n²) 的 LCS 相似度）⇒ **改名后又改了结构的克隆抓不到**。
//
// ── 只报不记账 ────────────────────────────────────────────────
//   本模块**不参与 ok 判定、不写进 duplicateCount、不影响棘轮**；019 只把它作为 advisory 输出。
//
// 出处：逻辑取自 RF-032 的只读测量脚本 tmp/rf032-fnclone.mjs（tmp/ 被 .gitignore 忽略 ⇒ 按
// §0.5.4「已固化的可复用测量脚本」的同样理由复制进 scripts/verify/lib/ 入库，避免重复劳动）。

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";

/** 少于这个 token 数的函数体不参与成组（太短的函数"撞形状"没有意义）。 */
export const MIN_TOKENS = 8;

const KEYWORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do",
  "else", "export", "extends", "finally", "for", "function", "if", "import", "in", "instanceof",
  "let", "new", "of", "return", "super", "switch", "this", "throw", "try", "typeof", "var", "void",
  "while", "with", "yield", "async", "await", "static", "get", "set",
  "null", "undefined", "true", "false"
]);

/** 这些 token 出现在前面时，`/` 不是正则起点。 */
const NOT_REGEX_BEFORE = new Set([")", "]", "}", "++", "--"]);

// ---------------------------------------------------------------- tokenizer
/**
 * 极简 JS/JSX tokenizer：只保留比较形状需要的四类 token（kw / id / str / num / regex / punct）。
 * 不追求语法正确，只追求"同一段逻辑在任何文件里被切成同样的序列"。
 */
export function tokenize(source) {
  const toks = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  let prev = null;
  let templateDepth = 0;

  const push = (t, v, ln) => {
    toks.push({ t, v, ln });
    prev = { t, v };
  };

  while (i < n) {
    const c = source[i];

    if (c === "\n") { line += 1; i += 1; continue; }
    if (c === " " || c === "\t" || c === "\r") { i += 1; continue; }

    // 注释（含 JSX 里的 {/* */}）
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }

    // 模板字符串（含 ${} 嵌套）：只记一个 T，内容不参与比较
    if (c === "`") {
      push("str", "T", line);
      i += 1;
      templateDepth += 1;
      while (i < n && templateDepth > 0) {
        const ch = source[i];
        if (ch === "\\") { i += 2; continue; }
        if (ch === "\n") { line += 1; i += 1; continue; }
        if (ch === "`" && source[i - 1] !== "\\") { templateDepth -= 1; i += 1; continue; }
        if (ch === "$" && source[i + 1] === "{") {
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === "{") depth += 1;
            else if (source[i] === "}") depth -= 1;
            else if (source[i] === "\n") line += 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      continue;
    }

    // 普通字符串
    if (c === '"' || c === "'") {
      const quote = c;
      // 缓解 JSX 文本里的撇号（don't / It's）：前面是标识符字符时不当作字符串起点
      if (quote === "'" && prev && prev.t === "id") { push("punct", "'", line); i += 1; continue; }
      let j = i + 1;
      let buf = "";
      while (j < n && source[j] !== quote) {
        if (source[j] === "\\") { buf += source[j] + source[j + 1]; j += 2; continue; }
        if (source[j] === "\n") break;
        buf += source[j];
        j += 1;
      }
      push("str", buf, line);
      i = j + 1;
      continue;
    }

    // 正则字面量（粗判：前一个 token 不是"值"类就可以当正则起点）
    if (c === "/" && isRegexStart(prev)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const ch = source[j];
        if (ch === "\\") { j += 2; continue; }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) break;
        else if (ch === "\n") break;
        j += 1;
      }
      push("regex", source.slice(i, j + 1), line);
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxXoObBeE._]/.test(source[j])) j += 1;
      push("num", source.slice(i, j), line);
      i = j;
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j += 1;
      const word = source.slice(i, j);
      push(KEYWORDS.has(word) ? "kw" : "id", word, line);
      i = j;
      continue;
    }

    if (/[{}()[\]]/.test(c)) { push("punct", c, line); i += 1; continue; }

    // 其余（, ; . = + - < > ! ? : & | % * ~ ^ 等）：合并连续同类符号，避免模板/JSX 噪声
    if (/[,;.=+\-<>!?:&|%*~^@#]/.test(c)) {
      let j = i;
      while (j < n && /[,;.=+\-<>!?:&|%*~^@#]/.test(source[j]) && !/[{}()[\]]/.test(source[j])) j += 1;
      push("punct", source.slice(i, j), line);
      i = j;
      continue;
    }

    i += 1;
  }
  return toks;
}

function isRegexStart(prev) {
  if (!prev) return true;
  if (prev.t === "kw") return !["this", "true", "false", "null", "undefined"].includes(prev.v);
  if (prev.t === "num" || prev.t === "str" || prev.t === "regex" || prev.t === "id") return false;
  if (prev.t === "punct") return !NOT_REGEX_BEFORE.has(prev.v);
  return true;
}

// ---------------------------------------------------------------- 函数抽取
function matchClose(toks, start, open, close) {
  let depth = 0;
  for (let k = start; k < toks.length; k += 1) {
    const t = toks[k];
    if (t.t !== "punct") continue;
    if (t.v === open) depth += 1;
    else if (t.v === close) {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/**
 * 抽出所有具名函数（含组件内/缩进的嵌套函数 —— 这正是 019 看不见的那一批）。
 * @returns {Array<{kind:string,name:string,start:number,end:number,line:number,endLine:number}>}
 */
export function extractFunctions(toks) {
  const fns = [];
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];

    // function NAME(...) { ... }
    if (t.t === "kw" && t.v === "function" && toks[i + 1]?.t === "id") {
      const name = toks[i + 1].v;
      const parenOpen = i + 2;
      if (toks[parenOpen]?.v !== "(") continue;
      const parenClose = matchClose(toks, parenOpen, "(", ")");
      if (parenClose < 0) continue;
      const bodyOpen = parenClose + 1;
      if (toks[bodyOpen]?.v !== "{") continue;
      const bodyClose = matchClose(toks, bodyOpen, "{", "}");
      if (bodyClose < 0) continue;
      fns.push({ kind: "function", name, start: i, end: bodyClose, line: t.ln, endLine: toks[bodyClose].ln });
      i = bodyClose;
      continue;
    }

    // const/let/var NAME = (…) => { … }   |   = function (…) { … }   |   = async (…) => { … }
    if (t.t === "kw" && (t.v === "const" || t.v === "let" || t.v === "var")
      && toks[i + 1]?.t === "id" && toks[i + 2]?.v === "=") {
      const name = toks[i + 1].v;
      let j = i + 3;
      while (toks[j]?.t === "kw" && (toks[j].v === "async" || toks[j].v === "function")) j += 1;
      if (toks[j]?.v !== "(") continue;
      const parenClose = matchClose(toks, j, "(", ")");
      if (parenClose < 0) continue;
      let k = parenClose + 1;
      if (toks[k]?.v !== "=>" && toks[k]?.v !== "{") continue;
      if (toks[k].v === "=>") k += 1;
      if (toks[k]?.v !== "{") continue;
      const bodyClose = matchClose(toks, k, "{", "}");
      if (bodyClose < 0) continue;
      fns.push({ kind: "arrow", name, start: j, end: bodyClose, line: t.ln, endLine: toks[bodyClose].ln });
      i = bodyClose;
    }
  }
  return fns;
}

// ---------------------------------------------------------------- 归一化 + 哈希
/**
 * @param {Array} toks
 * @param {"L1"|"L2"} level L1 保留字面量；L2 把字面量抹成占位符。
 */
export function normalize(toks, level) {
  const map = new Map();
  const out = [];
  for (const tk of toks) {
    if (tk.t === "kw" || tk.t === "punct") { out.push(tk.v); continue; }
    if (tk.t === "id") {
      if (!map.has(tk.v)) map.set(tk.v, map.size);
      out.push(`v${map.get(tk.v)}`);
      continue;
    }
    if (tk.t === "str") { out.push(level === "L1" ? `S:${tk.v}` : "S"); continue; }
    if (tk.t === "num") { out.push(level === "L1" ? `N:${tk.v}` : "N"); continue; }
    if (tk.t === "regex") { out.push(level === "L1" ? `R:${tk.v}` : "R"); continue; }
  }
  return out;
}

const sha = (arr) => createHash("sha1").update(arr.join("|")).digest("hex").slice(0, 16);

// ---------------------------------------------------------------- 主入口
/**
 * @param {string[]} files 相对仓库根的文件路径（通常传 listFrontendSourceFiles() 的结果）
 * @param {{minTokens?:number}} [options]
 * @returns {{
 *   scannedFiles:number, scannedFunctions:number, minTokens:number, elapsedMs:number,
 *   groups: Array<{level:string,tokens:number,renamed:boolean,hash:string,
 *                  members:Array<{name:string,file:string,line:number,endLine:number}>}>
 * }}
 */
export function scanRenameClones(files, options = {}) {
  const root = process.cwd();
  const minTokens = options.minTokens ?? MIN_TOKENS;
  const startedAt = Date.now();

  const fns = [];
  let scannedFiles = 0;

  for (const rel of files) {
    let source;
    try {
      source = readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    scannedFiles += 1;
    const toks = tokenize(source);
    for (const fn of extractFunctions(toks)) {
      const body = toks.slice(fn.start, fn.end + 1);
      if (body.length < minTokens) continue;
      fn.file = rel;
      fn.tokens = body.length;
      fn.l1 = sha(normalize(body, "L1"));
      fn.l2 = sha(normalize(body, "L2"));
      fns.push(fn);
    }
  }

  const groupBy = (keyOf) => {
    const buckets = new Map();
    for (const fn of fns) {
      const key = keyOf(fn);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(fn);
    }
    return [...buckets.entries()]
      .map(([hash, members]) => {
        const filesIn = new Set(members.map((m) => m.file));
        return {
          hash,
          members,
          crossFile: filesIn.size >= 2,
          renamed: new Set(members.map((m) => m.name)).size >= 2,
        };
      })
      .filter((g) => g.crossFile);
  };

  const l1Groups = groupBy((fn) => fn.l1);
  const l1Hashes = new Set(l1Groups.map((g) => g.hash));
  const l2Groups = groupBy((fn) => fn.l2).filter((g) => !l1Hashes.has(g.hash));

  const shape = (level) => (g) => ({
    level,
    tokens: Math.max(...g.members.map((m) => m.tokens)),
    renamed: g.renamed,
    hash: g.hash,
    members: g.members
      .map((m) => ({ name: m.name, file: m.file, line: m.line, endLine: m.endLine }))
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  });

  const groups = [
    ...l1Groups.map(shape("L1")),
    ...l2Groups.map(shape("L2")),
  ].sort((a, b) => b.tokens - a.tokens || a.level.localeCompare(b.level));

  return {
    scannedFiles,
    scannedFunctions: fns.length,
    minTokens,
    elapsedMs: Date.now() - startedAt,
    groups,
  };
}

/**
 * 在结果里查某一对（用于活样本自检）。
 * @returns {null | {level:string, members:Array}} 命中则返回所在组
 */
export function findPair(report, nameA, nameB) {
  for (const group of report.groups) {
    const names = new Set(group.members.map((m) => m.name));
    if (names.has(nameA) && names.has(nameB)) return group;
  }
  return null;
}
