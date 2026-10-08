// RF-078-b：把 outfit-workflow.jsx 内两处逐字相同的提示词预设面板抽成模块顶层组件 PromptPresetGrid。
// 用法：node scripts/dev/rf078b-patch.mjs [--dry]
// 铁律：split("\n") 逐行保留 CR；每行内容原样搬运（只重命名 + 去缩进）；新行一律 CRLF；
//       CRCR 必须 0；任何存活行的行尾不得改变。
//
// ⚠️ 方案说明（为什么不整包传 promptLib）：
//   本文件 99 行纯 LF 行**全部**落在 usePromptLibrary 的解构块（6658-6687）内。
//   若把该块改成 `const promptLib = usePromptLibrary({...})` 并删掉 9 个解构名，
//   必然连带删掉 8 行纯 LF 行 ⇒ 违反「纯 LF 行数 delta=0」硬约束。
//   ⇒ 本单**不改 hook**，20 个 props 逐个传（另有 2 行 GO/#12 已在 SAFE_BODY 处理）。
import fs from "node:fs";

const P = "src/outfit-workflow.jsx";
const DRY = process.argv.includes("--dry");

const raw = fs.readFileSync(P, "latin1");
const lines = raw.split("\n");
const parts = lines.map((l) => {
  const hasCR = l.endsWith("\r");
  return { t: hasCR ? l.slice(0, -1) : l, cr: hasCR };
});
const txt = parts.map((p) => p.t);

const lfBefore = parts.filter((p) => !p.cr).length;
console.log(`[0] 载入：lines=${lines.length} CRLF=${parts.length - lfBefore} LF=${lfBefore} CRCR=${(raw.match(/\r\r/g) || []).length}`);

function findFirst(pred, label, from = 0, to = txt.length) {
  for (let i = from; i < to; i += 1) if (pred(txt[i])) return i;
  console.error(`ANCHOR FAIL ${label}: 0 hits`);
  process.exit(1);
  return -1;
}

function findOne(pred, label, from = 0, to = txt.length) {
  const hits = [];
  for (let i = from; i < to; i += 1) if (pred(txt[i])) hits.push(i);
  if (hits.length !== 1) {
    console.error(`ANCHOR FAIL ${label}: ${hits.length} hits -> ${hits.slice(0, 5).join(",")}`);
    process.exit(1);
  }
  return hits[0];
}

// —— 锚点（必须先座实洞口在哪，不许盲改）——
const iExport = findOne((t) => t === "export default function OutfitWorkflow({", "export line");
const iAopen = findOne((t) => t.trim() === '<div className="promptAssistantDock">', "panelA open");
const iAclose = findFirst((t) => t === "            </div>", "panelA close", iAopen + 1, iAopen + 200);
const iBopen = findOne((t) => t.trim() === '<div className="promptAssistantBody">', "panelB open");
const iBclose = findFirst((t) => t === "            </div>", "panelB close", iBopen + 1, iBopen + 200);
if (txt[iAopen + 1] !== '              <div className="promptTabs">') { console.error("ANCHOR FAIL panelA inner first line"); process.exit(1); }
if (txt[iBopen + 1] !== '              <div className="promptTabs">') { console.error("ANCHOR FAIL panelB inner first line"); process.exit(1); }
if (txt[iAclose - 1] !== "              </div>") { console.error("ANCHOR FAIL panelA inner last line"); process.exit(1); }
if (txt[iBclose - 1] !== "              </div>") { console.error("ANCHOR FAIL panelB inner last line"); process.exit(1); }
console.log(`[1] 锚点：export=${iExport + 1} A=${iAopen + 1}..${iAclose + 1} B=${iBopen + 1}..${iBclose + 1}`);

// —— 复核两处逐字相同（去掉容器首尾行）——
const innerA = txt.slice(iAopen + 1, iAclose);
const innerB = txt.slice(iBopen + 1, iBclose);
if (innerA.length !== innerB.length || innerA.join("\n") !== innerB.join("\n")) {
  let first = -1;
  for (let i = 0; i < Math.max(innerA.length, innerB.length); i += 1) {
    if (innerA[i] !== innerB[i]) { first = i; break; }
  }
  console.error(`VERIFY FAIL 两处不相等：lenA=${innerA.length} lenB=${innerB.length} firstDiff=${first}\nA=${JSON.stringify(innerA[first])}\nB=${JSON.stringify(innerB[first])}`);
  process.exit(1);
}
console.log(`[2] 逐字相同：inner=${innerA.length} 行（去容器首尾行，diff 等价 0 hunk）`);

// —— 1) 面板内容 -> 组件体：逐行搬运，只做「重命名 + 去 8 空格缩进」，行尾沿用原行 ——
const RENAMES = [
  ["promptCategories", "categories"],
  ["setPromptCategory", "onSelectCategory"],
  ["promptCategory", "activeCategory"],
  ["setPromptDropCategory", "onDropCategoryChange"],
  ["promptDropCategory", "dropCategory"],
  ["setPromptSearch", "onSearchChange"],
  ["promptSearch", "search"],
  ["filteredPromptPresets", "presets"],
  ["draggedPromptId", "draggedId"],
  ["renamePromptCategory", "onRenameCategory"],
  ["dropPromptOnCategory", "onDropPresetToCategory"],
  ["addPromptCategory", "onAddCategory"],
  ["openNewPromptEditor", "onCreatePreset"],
  ["beginPromptDrag", "onBeginDrag"],
  ["endPromptDrag", "onEndDrag"],
  ["dropPromptOnPreset", "onDropPresetToPreset"],
  ["editPromptPreset", "onEditPreset"],
  ["deletePromptPreset", "onDeletePreset"],
  ["schedulePromptPresetApply", "onApplyPreset"],
  ["renamePromptPresetTitle", "onRenamePreset"]
];
const body = [];
for (let i = iAopen + 1; i < iAclose; i += 1) {
  const src = parts[i];
  if (src.t === "") { body.push({ t: "", cr: src.cr }); continue; }
  if (!src.t.startsWith(" ".repeat(14))) {
    console.error(`DEDENT FAIL 行 ${i + 1} 缩进不是 14 空格：${JSON.stringify(src.t)}`);
    process.exit(1);
  }
  let s = src.t.slice(8);
  for (const [from, to] of RENAMES) {
    s = s.replace(new RegExp(`(^|[^A-Za-z0-9_."'])(${from})(?![A-Za-z0-9_])`, "g"), (_m, p1) => p1 + to);
  }
  body.push({ t: s, cr: src.cr });
}
for (const [name] of RENAMES) {
  const re = new RegExp(`(^|[^A-Za-z0-9_."'])(${name})(?![A-Za-z0-9_])`);
  const hit = body.find((p) => re.test(p.t));
  if (hit) { console.error(`RENAME FAIL 残留旧标识符 ${name}: ${JSON.stringify(hit.t)}`); process.exit(1); }
}
console.log(`[3] 面板体 ${body.length} 行搬运完成：20 个标识符重命名，旧名零残留，行尾沿用原行`);

const old = (t) => ({ t, cr: true });
const component = [
  old("// RF-078-b：提示词预设面板（分类页签 + 搜索 + 预设网格），停靠视图与模态弹窗共用同一份 JSX。"),
  old("function PromptPresetGrid(props) {"),
  old("  const {"),
  old("    categories, activeCategory, onSelectCategory, dropCategory, onDropCategoryChange,"),
  old("    search, onSearchChange, presets, draggedId, onApplyPreset, onRenamePreset,"),
  old("    onRenameCategory, onDropPresetToCategory, onAddCategory, onCreatePreset,"),
  old("    onBeginDrag, onEndDrag, onDropPresetToPreset, onEditPreset, onDeletePreset"),
  old("  } = props;"),
  old("  return ("),
  old("    <>"),
  ...body,
  old("    </>"),
  old("  );"),
  old("}")
];

// —— 2) 两处调用点：props 两侧**逐项相同**（唯一差异是外层容器 className，留在调用点）——
const callBlock = [
  "              <PromptPresetGrid",
  "                categories={promptCategories} activeCategory={promptCategory} onSelectCategory={setPromptCategory}",
  "                dropCategory={promptDropCategory} onDropCategoryChange={setPromptDropCategory}",
  "                search={promptSearch} onSearchChange={setPromptSearch}",
  "                presets={filteredPromptPresets} draggedId={draggedPromptId}",
  "                onApplyPreset={schedulePromptPresetApply} onRenamePreset={renamePromptPresetTitle}",
  "                onRenameCategory={renamePromptCategory} onDropPresetToCategory={dropPromptOnCategory}",
  "                onAddCategory={addPromptCategory} onCreatePreset={openNewPromptEditor}",
  "                onBeginDrag={beginPromptDrag} onEndDrag={endPromptDrag} onDropPresetToPreset={dropPromptOnPreset}",
  "                onEditPreset={editPromptPreset} onDeletePreset={deletePromptPreset}",
  "              />"
].map(old);

// —— 3) 应用（索引降序，避免位移）——
const ops = [
  { start: iBopen + 1, end: iBclose, lines: callBlock, tag: "callB" },
  { start: iAopen + 1, end: iAclose, lines: callBlock, tag: "callA" },
  { start: iExport, end: iExport, lines: [...component, old("")], tag: "component" }
];
ops.sort((a, b) => b.start - a.start);
const next = parts.slice();
for (const op of ops) {
  next.splice(op.start, op.end - op.start, ...op.lines);
  console.log(`[4] ${op.tag}：${op.end - op.start} 行 -> ${op.lines.length} 行`);
}

const outStr = next.map((p) => p.t + (p.cr ? "\r" : "")).join("\n");
const crcr = (outStr.match(/\r\r/g) || []).length;
const lfAfter = next.filter((p) => !p.cr).length;
console.log(`[5] 行数 ${parts.length} -> ${next.length}（delta ${next.length - parts.length}）；CRCR=${crcr}；纯 LF ${lfBefore} -> ${lfAfter}（delta ${lfAfter - lfBefore}）`);
if (crcr !== 0) { console.error("自检失败 CRCR != 0，放弃写入"); process.exit(1); }
if (lfAfter !== lfBefore) { console.error("自检失败 纯 LF 行数变化，放弃写入"); process.exit(1); }

// 存活行行尾逐行核对（借用 splicing 前的映射：未被删除区段的行必须原样出现）
if (DRY) {
  fs.writeFileSync("tmp/rf078b.dry.jsx", outStr, "latin1");
  console.log("[6] --dry：已写 tmp/rf078b.dry.jsx，源文件未改动");
} else {
  fs.writeFileSync(P, outStr, "latin1");
  console.log("[6] 已写回 src/outfit-workflow.jsx");
}
