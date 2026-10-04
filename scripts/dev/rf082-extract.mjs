// RF-082 施工提取器（重写版 v2）：基于 @babel 的词法作用域闭包提取。
//
// 用法：node scripts/dev/rf082-extract.mjs --batch <S0|S1S7|S2|S3S4|S5|S6|S8S9> [--dry|--write]
//
// 纪律：
//  - 保留 CRLF：以 CRLF 切分 main，内部用 LF 处理，最后统一回 CRLF，CRCR 必为 0。
//  - 逐字搬入 + 加 `export `（插入到声明关键字前，保留前导注释）。
//  - 同落点文件内的声明按「源码行号升序」排列，避免 const TDZ。
//  - 闭包自动拉入被引用的模块级 const（私有常量随域迁入）；不拉入被排除名/未计划的留存函数（否则停手）。
//  - 落点文件：新建 → 写 import 块 + 导出体；既有 → 合并 import（保留原有 + 新增）到顶部 + 末尾追加导出体。
//  - main：删定义 + 补回 re-import（合并到同名 import / 末尾新增）+ 清理孤儿 import；import 顺序与原文件一致，bare 模块名原样保留。

import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve, relative, basename } from "path";

const require = createRequire(import.meta.url);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const repoRoot = resolve(process.cwd());
const SRC_DIR = resolve("src");
const MAIN = resolve("src/main.jsx");
const SHARED_FILE = "src/shared/app-defaults.js";

const BATCH_CONST_SEEDS = {
  S0: [
    "STORAGE_PREFIX", "STORAGE_KEY", "PROMPT_LIBRARY_VERSION", "PROMPT_PRESETS_KEY", "PROMPT_CATEGORIES_KEY",
    "DETAIL_PRESETS_KEY", "DETAIL_GROUPS_KEY", "INFINITE_CANVAS_KEY", "ACTIVE_VIEW_KEY",
    "defaultState", "videoDefaults", "referenceDefaults", "detailDefaults", "builtinPrompts",
    "PUBLIC_RELEASE_MODE", "PUBLIC_RELEASE_ID", "PUBLIC_RELEASE_RESET_KEY"
  ]
};
const BATCH_FN_SEEDS = {
  S1S7: { file: "src/features/storage/storage-store.js", fns: ["openHistoryDb", "waitForTransaction", "loadHistoryResults", "saveHistoryResults", "removeHistoryResults", "sanitizeStoredImage", "normalizeActiveView", "loadActiveView", "loadState", "runPublicReleaseStorageReset", "deleteIndexedDbSafely", "formatStorageSize"] },
  S2: { file: "src/features/detail/detail-group.js", fns: ["sanitizeDetailResultForStorage", "sanitizeDetailGroupsForStorage", "loadDetailGroups", "hydrateDetailGroupsWithHistory", "normalizeDetailSettings", "clampDetailCount", "clampDetailModelUsage", "clampReverseScreens", "clampReferenceStrength", "loadDetailPresets"] },
  S3S4: { file: "src/features/upload/reference-upload.js", fns: ["referenceControlText", "referenceStrengthText", "buildReferenceRemixPrompt", "buildSmartReferencePrompt", "referenceMetaFromQuickRunItems", "referenceMetaFromFiles", "quickReferenceOriginalFile", "quickReferenceUploadFile", "quickReferenceHasLocalEdit", "quickReferenceUploadFiles", "quickReferenceRunUploadFile", "compressImageForChannel", "prepareImageFilesForChannel", "cropQuickReferenceViewportFile"] },
  S5: { file: "src/features/local-edit/crop-rect-resize.js", fns: ["composeQuickLocalEditBlob", "defaultQuickLocalEditCrop"] },
  S6: { file: "src/features/video/video-composer.js", fns: ["durationOptionsForVideoModel", "videoPromptPlaceholder", "videoPricePerSecond", "videoPriceLabel", "normalizeVideoSettingValue"] },
  S8S9: { file: "src/features/crop/quick-crop-panels.jsx", fns: ["QuickCropViewportModal", "DetailUploadZone"] }
};
const EXCLUDED = new Set([
  "normalizeGenerationErrorMessage", "fileToCompactJpegDataUrl", "ensureQuickUploadCanvasRatio",
  "shouldNormalizeQuickUploadForModel", "normalizeQuickReferenceItem", "clampCount", "makeResultId"
]);
const ALL_SEEDS = new Set([...BATCH_CONST_SEEDS.S0, ...Object.values(BATCH_FN_SEEDS).flatMap((b) => b.fns)]);

// ---------- 辅助 ----------
function parseStr(src) { return parser.parse(src, { sourceType: "module", plugins: ["jsx"] }); }
function readAbs(p) { return readFileSync(p, "utf8"); }
function buildLineStarts(src) { const s = [0]; for (let i = 0; i < src.length; i++) if (src[i] === "\n") s.push(i + 1); return s; }
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function relImport(fromFile, toFile) { let r = relative(dirname(fromFile), dirname(toFile)).replace(/\\/g, "/"); if (r === "") r = "."; if (!r.startsWith(".")) r = "./" + r; return `${r}/${basename(toFile)}`; }
function repoRelOf(absOrRel) { const abs = absOrRel.startsWith(".") ? resolve(SRC_DIR, absOrRel) : resolve(absOrRel); return relative(repoRoot, abs).replace(/\\/g, "/"); }
function resolveToAbs(repoRel) { return resolve(repoRoot, repoRel); }
function absOfSource(targetRepoRel, sourceSpecifier) {
  // sourceSpecifier: bare (react) / relative (./x) / repoRel (src/x)
  // 相对路径基于「目录」解析（targetRepoRel 是文件路径，path.resolve 会把它当一层目录，故先用 dirname）。
  if (sourceSpecifier.startsWith(".")) return resolve(dirname(resolveToAbs(targetRepoRel)), sourceSpecifier);
  if (sourceSpecifier.startsWith("/")) return resolve(sourceSpecifier);
  if (sourceSpecifier.includes("/")) return resolveToAbs(sourceSpecifier);
  return resolve(repoRoot, sourceSpecifier);
}
function emitImportLine(targetRepoRel, sourceSpecifier, specs) {
  const arr = [...specs].sort();
  let rel;
  if (sourceSpecifier.startsWith(".") || sourceSpecifier.startsWith("/")) rel = sourceSpecifier;
  else if (sourceSpecifier.includes("/")) rel = relImport(resolveToAbs(targetRepoRel), resolveToAbs(sourceSpecifier));
  else rel = sourceSpecifier; // bare 模块名，原样保留
  return `import { ${arr.join(", ")} } from "${rel}";`;
}

function collectExports(relFile) {
  const full = resolve(repoRoot, relFile);
  if (!existsSync(full)) return new Set();
  const a = parseStr(readAbs(full));
  const names = new Set();
  traverse(a, { Program(p) { p.get("body").forEach((c) => {
    if (c.isFunctionDeclaration() && c.node.id) names.add(c.node.id.name);
    else if (c.isVariableDeclaration()) c.node.declarations.forEach((d) => { if (d.id && d.id.type === "Identifier") names.add(d.id.name); });
    else if (c.isClassDeclaration() && c.node.id) names.add(c.node.id.name);
    else if (c.isExportNamedDeclaration()) {
      c.node.specifiers.forEach((s) => { if (s.local) names.add(s.local.name); });
      const d = c.node.declaration;
      if (d) {
        if (d.id) names.add(d.id.name);
        else if (d.type === "VariableDeclaration" && d.declarations) d.declarations.forEach((x) => { if (x.id && x.id.type === "Identifier") names.add(x.id.name); });
      }
    }
  }); } });
  return names;
}

// 收集一个文件现有的 import 条目（按原顺序），用于「既有文件」合并时保留原 import。
function collectImportEntries(content) {
  const a = parseStr(content);
  const entries = [];
  traverse(a, { Program(p) { p.get("body").forEach((c) => {
    if (c.isImportDeclaration()) {
      const source = c.node.source.value;
      let def = null; const named = new Set();
      for (const s of c.node.specifiers) {
        if (s.type === "ImportDefaultSpecifier") def = s.local.name;
        else if (s.type === "ImportSpecifier") {
          const imported = s.imported.name || s.imported.value; const local = s.local.name;
          named.add(imported === local ? local : `${imported} as ${local}`);
        }
      }
      entries.push({ source, def, named });
    }
  }); } });
  return entries;
}
function importSourceFor(targetRepoRel, repoRel) {
  // repoRel 是 bare 模块名（react / lucide-react）或 repo 相对路径。
  if (!repoRel.startsWith(".") && !repoRel.includes("/")) return repoRel; // bare 模块名原样保留
  return relImport(resolveToAbs(targetRepoRel), resolveToAbs(repoRel));
}
function mergeImports(targetRepoRel, entries, newImports) {
  // newImports: Map<repoRel, Set<specString>>
  for (const [repoRel, specs] of newImports) {
    const target = resolveToAbs(repoRel);
    let entry = entries.find((e) => absOfSource(targetRepoRel, e.source) === target);
    if (!entry) {
      entry = { source: importSourceFor(targetRepoRel, repoRel), def: null, named: new Set() };
      entries.push(entry);
    }
    specs.forEach((s) => entry.named.add(s));
  }
  return entries;
}
function emitImportBlock(entries) {
  const lines = [];
  for (const e of entries) {
    if (!e.def && !e.named.size) continue;
    const arr = [...e.named].sort();
    if (e.def && arr.length) lines.push(`import ${e.def}, { ${arr.join(", ")} } from "${e.source}";`);
    else if (e.def) lines.push(`import ${e.def} from "${e.source}";`);
    else lines.push(emitImportLine(targetRepoRelPlaceholder, e.source, e.named));
  }
  return lines;
}
const targetRepoRelPlaceholder = "src/__placeholder__.jsx"; // 仅用于 emitImportLine 的 bare/relative 判定（absolute 分支用不到）

// ---------- 解析 main ----------
const raw = readAbs(MAIN);
const EOL = raw.includes("\r\n") ? "\r\n" : "\n";
const ast = parseStr(raw);
let programScope = null;
const topPaths = new Map();      // name -> NodePath（顶层声明）
const importSources = new Map(); // local -> { source, imported, local }

traverse(ast, { Program(p) {
  programScope = p.scope;
  p.get("body").forEach((child) => {
    if (child.isFunctionDeclaration() && child.node.id) topPaths.set(child.node.id.name, child);
    else if (child.isVariableDeclaration()) child.node.declarations.forEach((d) => { if (d.id && d.id.type === "Identifier") topPaths.set(d.id.name, child); });
    else if (child.isClassDeclaration() && child.node.id) topPaths.set(child.node.id.name, child);
    else if (child.isImportDeclaration()) {
      const src = child.node.source.value;
      child.node.specifiers.forEach((spec) => {
        const local = spec.local.name;
        const imported = spec.imported ? (spec.imported.name || spec.imported.value) : local;
        importSources.set(local, { source: src, imported, local });
      });
    }
  });
}});

const exportedByFile = new Map();
for (const f of [SHARED_FILE, ...Object.values(BATCH_FN_SEEDS).map((b) => b.file)]) {
  collectExports(f).forEach((n) => exportedByFile.set(n, f));
}

// ---------- 主参数 ----------
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const WRITE = args.includes("--write");
const batchArgIdx = args.findIndex((a) => a.startsWith("--batch"));
let BATCH = null;
if (batchArgIdx >= 0) {
  const a = args[batchArgIdx];
  if (a.includes("=")) BATCH = a.split("=")[1];
  else if (args[batchArgIdx + 1]) BATCH = args[batchArgIdx + 1];
}
if (!BATCH) { console.error("需要 --batch <S0|S1S7|S2|S3S4|S5|S6|S8S9>"); process.exit(2); }

let movedSet = new Set();
let primaryFile = null;
if (BATCH === "S0") { BATCH_CONST_SEEDS.S0.forEach((n) => movedSet.add(n)); primaryFile = SHARED_FILE; }
else { const cfg = BATCH_FN_SEEDS[BATCH]; primaryFile = cfg.file; cfg.fns.forEach((n) => movedSet.add(n)); }

// ---------- 闭包扩展 ----------
function topLevelRefs(declPath) {
  const names = new Set();
  declPath.traverse({ Identifier(p) {
    if (!p.isReferencedIdentifier()) return;
    const b = p.scope.getBinding(p.node.name);
    if (b && (b.kind === "const" || b.kind === "let" || b.kind === "var" || b.kind === "function" || b.kind === "class") && b.scope === programScope) names.add(p.node.name);
  } });
  return names;
}
let changed = true, guard = 0;
while (changed && guard++ < 80) {
  changed = false;
  for (const name of [...movedSet]) {
    if (!topPaths.has(name)) continue;
    const refs = topLevelRefs(topPaths.get(name));
    for (const r of refs) {
      if (EXCLUDED.has(r)) { console.error(`❌ 闭包试图拉入被排除名 ${r}（被 ${name} 引用）—— 停手！`); process.exit(3); }
      if (topPaths.has(r)) {
        const isFunc = topPaths.get(r).node.type === "FunctionDeclaration";
        if (isFunc && !ALL_SEEDS.has(r)) { console.error(`❌ 待搬函数 ${name} 引用了未列入计划的留存函数 ${r} —— 停手！`); process.exit(4); }
        if (!movedSet.has(r)) { movedSet.add(r); changed = true; }
      }
    }
  }
}

// ---------- 收集声明节点（按源码行号升序） ----------
const entries = [];
for (const name of movedSet) {
  const path = topPaths.get(name);
  if (!path) continue;
  const node = path.node;
  let sliceStart = node.start;
  if (node.leadingComments && node.leadingComments.length) sliceStart = Math.min(sliceStart, ...node.leadingComments.map((c) => c.start));
  entries.push({ name, node, sliceStart, sliceEnd: node.end });
}
entries.sort((a, b) => a.sliceStart - b.sliceStart);

// ---------- 分析引用 ----------
function analyzeDecl(declPath) {
  const moduleImports = new Map();
  const crossFileRefs = new Set();
  declPath.traverse({ Identifier(p) {
    if (!p.isReferencedIdentifier()) return;
    const name = p.node.name;
    const b = p.scope.getBinding(name);
    if (!b) return;
    if (b.kind === "module") {
      const spec = b.path.node;
      const imported = spec.imported ? (spec.imported.name || spec.imported.value) : spec.local.name;
      const local = spec.local.name;
      const source = b.path.parentPath.node.source.value;
      moduleImports.set(local, { source, imported, local });
    } else if (b.scope === programScope) {
      if (exportedByFile.has(name) || movedSet.has(name)) crossFileRefs.add(name);
    }
  } });
  return { moduleImports, crossFileRefs };
}

const targetImports = new Map(); // repoRel -> Set<specString>
function addImport(repoRel, specString) { if (!targetImports.has(repoRel)) targetImports.set(repoRel, new Set()); targetImports.get(repoRel).add(specString); }

for (const e of entries) {
  const { moduleImports, crossFileRefs } = analyzeDecl(topPaths.get(e.name));
  for (const info of moduleImports.values()) {
    const repoRel = repoRelOf(info.source);
    const spec = info.imported === info.local ? info.local : `${info.imported} as ${info.local}`;
    addImport(repoRel, spec);
  }
  for (const name of crossFileRefs) {
    let src = exportedByFile.get(name);
    if (!src) src = movedSet.has(name) ? primaryFile : null;
    if (!src) { console.error(`⚠️ 跨文件引用 ${name} 找不到落点，跳过 import`); continue; }
    if (src === primaryFile || src === repoRelOf(primaryFile)) continue;
    addImport(src, name);
  }
}

// ---------- 生成各落点文件内容 ----------
function exportText(name) {
  const e = entries.find((x) => x.name === name);
  const slice = raw.slice(e.sliceStart, e.sliceEnd);
  const rel = e.node.start - e.sliceStart;
  return slice.slice(0, rel) + "export " + slice.slice(rel);
}
const bodies = entries.map((e) => exportText(e.name)).join(EOL + EOL);

const isNew = !existsSync(resolve(repoRoot, primaryFile));
let existingContent = isNew ? null : readAbs(resolve(repoRoot, primaryFile));
let importEntries = collectImportEntries(existingContent || "");
importEntries = mergeImports(primaryFile, importEntries, targetImports);
const importBlockLines = emitImportBlock(importEntries);
const importBlock = importBlockLines.length ? importBlockLines.join(EOL) + EOL + EOL : "";

let targetContent;
if (isNew) {
  const header = `// ${basename(primaryFile)} —— RF-082 从 src/main.jsx 逐字抽出（加 export），未改逻辑。\n`;
  targetContent = header + importBlock + bodies + EOL;
} else {
  // 去掉现有 import 节点，保留其余（顺序不变）
  const a = parseStr(existingContent);
  const importNodes = [];
  traverse(a, { Program(p) { p.get("body").forEach((c) => { if (c.isImportDeclaration()) importNodes.push(c.node); }); } });
  const ranges = importNodes.map((n) => [n.start, n.end]).sort((x, y) => y[0] - x[0]);
  let body = existingContent;
  for (const [s, e] of ranges) body = body.slice(0, s) + body.slice(e);
  body = body.replace(/^[\r\n]+/, "");
  targetContent = importBlock + body + (body.endsWith(EOL) ? "" : EOL) + EOL + bodies + EOL;
}
targetContent = targetContent.split(/\r?\n/).join(EOL);

// ---------- 修改 main.jsx：偏移切片删定义 + 补 re-import + 清孤儿 ----------
const cutRanges = entries.map((e) => ({ s: e.sliceStart, e: e.sliceEnd })).sort((a, b) => a.s - b.s);
let newMain = "";
let cursor = 0;
for (const r of cutRanges) { newMain += raw.slice(cursor, r.s); cursor = r.e; }
newMain += raw.slice(cursor);

// 计算 main 仍需 re-import 的 moved 名
const mainRefNames = new Set();
try {
  const a2 = parseStr(newMain);
  traverse(a2, { Program(p) { p.traverse({ Identifier(id) { if (!id.isReferencedIdentifier()) return; mainRefNames.add(id.node.name); } }); } });
} catch (e) {
  mkdirSync(resolve(repoRoot, "scripts/dev/.rf082-dry"), { recursive: true });
  writeFileSync(resolve(repoRoot, "scripts/dev/.rf082-dry/main-broken.txt"), newMain, "utf8");
  const linesN = newMain.split("\n");
  console.error("PARSE newMain FAILED:", e.message.split("\n")[0]);
  console.error("CONTEXT:", linesN.slice(190, 205).join("\n"));
  process.exit(9);
}
const needed = new Map(); // repoRel -> Set<name>
for (const name of mainRefNames) {
  if (!movedSet.has(name) && !(BATCH === "S0" && BATCH_CONST_SEEDS.S0.includes(name))) continue;
  let src = exportedByFile.get(name);
  if (!src) src = (BATCH === "S0" && BATCH_CONST_SEEDS.S0.includes(name)) ? SHARED_FILE : primaryFile;
  if (!src) continue;
  if (!needed.has(src)) needed.set(src, new Set());
  needed.get(src).add(name);
}

// 重写 main imports（最小侵入）：保留所有现有 import 原文（含多行格式），仅「合并」needed 到同名 import、或「追加」新 import 行。
// 绝不删除任何现有 import（搬运任务不清理孤儿），绝不整体重建（避免多行压单行 + 误删 JSX 组件 import——isReferencedIdentifier 不命中 <Comp>）。
function rewriteMainImports(content, neededMap) {
  const a = parseStr(content);
  const importNodes = [];
  traverse(a, { Program(p) { p.get("body").forEach((c) => { if (c.isImportDeclaration()) importNodes.push(c.node); }); } });
  if (importNodes.length === 0) {
    const lines = [...neededMap.entries()].map(([repoRel, names]) =>
      `import { ${[...names].sort().join(", ")} } from "${relImport(MAIN, resolveToAbs(repoRel))}";`);
    return (lines.length ? lines.join(EOL) + EOL + EOL : "") + content;
  }
  const present = new Map(); // absTarget -> node
  for (const node of importNodes) present.set(absOfSource(repoRelOf(MAIN), node.source.value), node);
  const newLines = [];
  for (const [repoRel, names] of neededMap) {
    const target = resolveToAbs(repoRel);
    const node = present.get(target);
    if (node) node.__add = [...names];
    else newLines.push(`import { ${[...names].sort().join(", ")} } from "${relImport(MAIN, target)}";`);
  }
  const firstStart = importNodes[0].start;
  const lastEnd = importNodes[importNodes.length - 1].end;
  const before = content.slice(0, firstStart);
  let block = "";
  for (const node of importNodes) {
    if (node.__add) {
      const existing = [];
      for (const s of node.specifiers) {
        if (s.type === "ImportDefaultSpecifier") existing.push(s.local.name);
        else if (s.type === "ImportSpecifier") {
          const imported = s.imported.name || s.imported.value; const local = s.local.name;
          existing.push(imported === local ? local : `${imported} as ${local}`);
        }
      }
      const merged = [...new Set([...existing, ...node.__add])].sort();
      const def = node.specifiers.find((s) => s.type === "ImportDefaultSpecifier");
      block += def ? `import ${def.local.name}, { ${merged.join(", ")} } from "${node.source.value}";` : `import { ${merged.join(", ")} } from "${node.source.value}";`;
      block += EOL;
    } else {
      block += content.slice(node.start, node.end) + EOL;
    }
  }
  for (const nl of newLines) block += nl + EOL;
  const after = content.slice(lastEnd);
  return before + block + after;
}
newMain = rewriteMainImports(newMain, needed);
newMain = newMain.split(/\r?\n/).join(EOL);

// ---------- 报告 ----------
const report = {
  batch: BATCH, primaryFile, isNew,
  movedCount: movedSet.size, movedNames: [...movedSet].sort(),
  targetImports: [...targetImports.entries()].map(([s, sp]) => `${s} <- ${[...sp].sort().join(", ")}`),
  mainReImports: [...needed.entries()].map(([s, n]) => `${s} <- ${[...n].sort().join(", ")}`),
  targetLines: targetContent.split(EOL).length,
  crcr: newMain.includes("\r\r\n") ? "❌ 检测到 \\r\\r\\n" : "OK",
  removedCount: cutRanges.length
};

// ---------- 输出 ----------
if (DRY) {
  const dir = resolve(repoRoot, "scripts/dev/.rf082-dry");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, basename(primaryFile)), targetContent, "utf8");
  writeFileSync(resolve(dir, `main-after-${BATCH}.txt`), newMain, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`[DRY] 落点预览 -> ${resolve(dir, basename(primaryFile))}\n[DRY] main 预览 -> scripts/dev/.rf082-dry/main-after-${BATCH}.txt`);
} else if (WRITE) {
  if (isNew) mkdirSync(dirname(resolve(repoRoot, primaryFile)), { recursive: true });
  writeFileSync(resolve(repoRoot, primaryFile), targetContent, "utf8");
  writeFileSync(MAIN, newMain, "utf8");
  for (const name of movedSet) if (topPaths.has(name)) exportedByFile.set(name, primaryFile);
  console.log(JSON.stringify(report, null, 2));
  console.log(`[WRITE] 已写 ${primaryFile} 并修补 main.jsx`);
} else {
  console.log(JSON.stringify(report, null, 2));
  console.log("[INFO] 既非 --dry 也非 --write，仅打印报告");
}
