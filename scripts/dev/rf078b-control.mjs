// RF-078-b 对照组：证明「两处提示词面板真的共用同一份组件，且 props 两侧完全同值」。
// 用法：node scripts/dev/rf078b-control.mjs
// 依赖真实实现（react / react-dom/server / lucide-react / eslint / esbuild），不 mock；
// 渲染产物落 tmp/rf078b-ctl/（不进 src/，避免污染 019 的 scannedFiles）。
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const FILE = "src/outfit-workflow.jsx";
const ABS = path.resolve(FILE);
const CACHE_DIR = ".vite-cache";
process.env.JINGYIN_VITE_CACHE_DIR = CACHE_DIR;

const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    if (detail && detail.ok === false) { results.push({ name, pass: false, note: detail.note }); return; }
    results.push({ name, pass: true, note: detail?.note || "" });
  } catch (e) {
    results.push({ name, pass: false, note: `EXCEPTION ${e && e.message}` });
  }
}

function gitShow(spec) {
  return new Promise((resolve, reject) => {
    const p = spawn("git", ["show", spec], { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`git show ${spec} 失败: ${err}`))));
    p.on("error", reject);
  });
}

const src = fs.readFileSync(FILE, "utf8");
const lines = src.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

// —— 定位组件与两处调用点 ——
function sliceComponent() {
  const start = lines.findIndex((l) => l === "function PromptPresetGrid(props) {");
  if (start < 0) throw new Error("找不到组件定义");
  let end = -1;
  for (let i = start + 1; i < lines.length; i += 1) if (lines[i] === "}") { end = i; break; }
  return { start, end, body: lines.slice(start, end + 1) };
}
function sliceCalls(linesArr) {
  const calls = [];
  for (let i = 0; i < linesArr.length; i += 1) {
    if (linesArr[i].trim() === "<PromptPresetGrid") {
      let j = i + 1;
      while (j < linesArr.length && linesArr[j].trim() !== "/>") j += 1;
      calls.push({ start: i, end: j, body: linesArr.slice(i, j + 1) });
      i = j;
    }
  }
  return calls;
}
const comp = sliceComponent();
const calls = sliceCalls(lines);
const iOutfit = lines.findIndex((l) => l === "export default function OutfitWorkflow({");
const iCompEndInFile = comp.end;
const callSitesInsideOutfit = calls.every((c) => c.start > lines.findIndex((l) => l === "function PromptPresetGrid(props) {") && c.start > iOutfit);

// —— props 解析 ——
function parseProps(callBody) {
  const props = {};
  for (const raw of callBody) {
    const t = raw.trim();
    if (!t || t === "<PromptPresetGrid" || t === "/>") continue;
    const re = /([A-Za-z][A-Za-z0-9_]*)=\{([^{}]*)\}/g;
    let m = null;
    while ((m = re.exec(t))) props[m[1]] = m[2].trim();
  }
  return props;
}
const propsA = calls[0] ? parseProps(calls[0].body) : {};
const propsB = calls[1] ? parseProps(calls[1].body) : {};

check("TOPOLOGY", () => {
  if (lines.filter((l) => l === "function PromptPresetGrid(props) {").length !== 1) return { ok: false, note: "组件定义不唯一" };
  if (lines[comp.start] !== "function PromptPresetGrid(props) {") return { ok: false, note: "组件不是列 0 起的顶层函数声明" };
  if (calls.length !== 2) return { ok: false, note: `调用点数量=${calls.length}，应为 2` };
  if (!(comp.start < iOutfit)) return { ok: false, note: "组件未定义在 OutfitWorkflow 之前" };
  if (!callSitesInsideOutfit) return { ok: false, note: "有调用点不在 OutfitWorkflow 之后" };
  return { note: `组件 ${comp.start + 1}-${iCompEndInFile + 1} 行（模块顶层）；调用点 ${calls.map((c) => `${c.start + 1}-${c.end + 1}`).join(" / ")}` };
});

check("PROPS-TEXT-EQUAL", () => {
  const ka = Object.keys(propsA).sort();
  const kb = Object.keys(propsB).sort();
  if (ka.join(",") !== kb.join(",")) return { ok: false, note: `prop 名集合不同：A=[${ka}] B=[${kb}]` };
  const diff = ka.filter((k) => propsA[k] !== propsB[k]);
  if (diff.length) return { ok: false, note: `同值不成立：${diff.map((k) => `${k}: ${propsA[k]} vs ${propsB[k]}`).join(" | ")}` };
  const sameRaw = calls[0].body.slice(1, -1).map((l) => l.trim()).join("\n") === calls[1].body.slice(1, -1).map((l) => l.trim()).join("\n");
  if (!sameRaw) return { ok: false, note: "去缩进后原文仍不等" };
  return { note: `${ka.length} 个 props 两侧逐项同值（含原文逐行相同）` };
});

// —— 渲染：真实 React + 真实 lucide 图标 ——
const VALUES = {
  categories: '["全部", "女装", "男装"]',
  activeCategory: '"女装"',
  onSelectCategory: '() => {}',
  dropCategory: '"男装"',
  onDropCategoryChange: '() => {}',
  search: '"夏"',
  onSearchChange: '() => {}',
  presets: '[{ id: "p1", title: "标题甲", content: "内容甲" }, { id: "p2", title: "标题乙", content: "内容乙" }]',
  draggedId: '"p1"',
  onApplyPreset: '() => {}',
  onRenamePreset: '() => {}',
  onRenameCategory: '() => {}',
  onDropPresetToCategory: '() => {}',
  onAddCategory: '() => {}',
  onCreatePreset: '() => {}',
  onBeginDrag: '() => {}',
  onEndDrag: '() => {}',
  onDropPresetToPreset: '() => {}',
  onEditPreset: '() => {}',
  onDeletePreset: '() => {}'
};

function iconImports(body) {
  const used = new Set();
  for (const name of ["Search", "Plus", "Pencil", "Trash2"]) {
    if (body.some((l) => new RegExp(`<${name}\\b`).test(l))) used.add(name);
  }
  return `import { ${[...used].sort().join(", ")} } from "lucide-react";`;
}

async function renderBoth(mutate = null, overrideProps = null, overrideValues = {}) {
  const ctlDir = path.resolve("tmp/rf078b-ctl");
  fs.mkdirSync(ctlDir, { recursive: true });
  let body = comp.body.slice();
  if (mutate) body = body.map((l) => mutate(l));
  const bodyText = body.join("\n");
  const mod = `${iconImports(body)}\n${bodyText}\nexport { PromptPresetGrid };\n`;
  // props 的值一律取自 VALUES 表（key→字面量表达式）；extra 用于负向对照改写某个值
  const propsOf = (p, extra = {}) => `{ ${Object.keys(p).sort().map((k) => `${k}: ${extra[k] ?? VALUES[k]}`).join(", ")} }`;
  const entry = [
    'import { renderToStaticMarkup } from "react-dom/server";',
    'import { PromptPresetGrid } from "./mod.jsx";',
    `export const propsA = ${propsOf(propsA)};`,
    `export const propsB = ${propsOf(propsB)};`,
    overrideProps ? `export const propsX = ${propsOf(overrideProps, overrideValues)};` : "",
    "export function renderA() { return renderToStaticMarkup(<PromptPresetGrid {...propsA} />); }",
    "export function renderB() { return renderToStaticMarkup(<PromptPresetGrid {...propsB} />); }",
    overrideProps ? "export function renderX() { return renderToStaticMarkup(<PromptPresetGrid {...propsX} />); }" : ""
  ].filter(Boolean).join("\n");
  fs.writeFileSync(path.join(ctlDir, "mod.jsx"), mod, "utf8");
  fs.writeFileSync(path.join(ctlDir, "entry.jsx"), entry, "utf8");
  const { build } = await import("esbuild");
  const tag = mutate ? "mut" : overrideProps ? "probe" : "base";
  await build({
    entryPoints: [path.join(ctlDir, "entry.jsx")],
    outfile: path.join(ctlDir, `bundle-${tag}.mjs`),
    bundle: true,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    jsxImportSource: "react",
    packages: "external",
    logLevel: "silent"
  });
  const m = await import(pathToFileURL(path.join(ctlDir, `bundle-${tag}.mjs`)).href);
  return { a: m.renderA(), b: m.renderB(), x: m.renderX ? m.renderX() : null };
}

let rendered = null;
try {
  rendered = await renderBoth(null);
  results.push({ name: "RENDER-EQUAL", pass: rendered.a === rendered.b && rendered.a.includes("promptTabs") && rendered.a.includes("promptPresetGrid"), note: `静态标签 ${rendered.a.length} 字符，两侧完全一致；含 promptTabs/promptPresetGrid` });

  // 单一来源反证：改组件内 placeholder，两处渲染都必须变
  const mutated = await renderBoth((l) => l.replace('placeholder="搜索标题或内容..."', 'placeholder="ZZZRF078B"'));
  const changedA = mutated.a !== rendered.a && mutated.a.includes("ZZZRF078B");
  const changedB = mutated.b !== rendered.b && mutated.b.includes("ZZZRF078B");
  results.push({ name: "SINGLE-SOURCE", pass: changedA && changedB && mutated.a === mutated.b, note: `改组件内 placeholder ⇒ 调用点A变化=${changedA} 调用点B变化=${changedB}（且两者仍互相一致）` });
} catch (e) {
  results.push({ name: "RENDER-EQUAL", pass: false, note: `渲染链路异常 ${e.message}` });
  results.push({ name: "SINGLE-SOURCE", pass: false, note: "渲染链路异常，未执行" });
}

// 渲染比较器的负向对照：把 search 换成别的值 ⇒ 渲染输出必须变化（证明比较器不是恒真）
try {
  const probe = await renderBoth(null, Object.assign({}, propsB, { search: "ZZZPROBE" }), { search: '"ZZZPROBE"' });
  const differs = probe.x !== probe.a && probe.x.includes("ZZZPROBE");
  results.push({ name: "NEG-RENDER-SENSITIVE", pass: differs, note: `把 search 改写成 ZZZPROBE ⇒ 渲染输出变化=${differs}（渲染比较器有效，非恒真）` });
} catch (e) {
  results.push({ name: "NEG-RENDER-SENSITIVE", pass: false, note: `EXCEPTION ${e.message}` });
}

// —— 零分叉反证 ——
check("NO-BRANCH", () => {
  const bodyText = comp.body.join("\n");
  const bannedSide = /(^|[^A-Za-z0-9_])(mode|isDock|isModal|dockMode|modalMode|variant|displayMode)($|[^A-Za-z0-9_])/i;
  const flags = ["isDock", "isModal", "dockMode", "modalMode", "variant", "displayMode", "mode"]
    .filter((k) => new RegExp(`\\b${k}\\b`, "i").test(bodyText));
  if (flags.length) return { ok: false, note: `组件体内出现侧别旗标：${flags.join(",")}` };
  // 抽出全部「判断条件」：if (...) 的圆括号内 / 三元问号左侧
  const conditions = [];
  for (const m of bodyText.matchAll(/\bif\s*\(([^\n]*?)\)/g)) conditions.push(m[1]);
  for (const m of bodyText.matchAll(/([^\n?]{0,120})\?/g)) conditions.push(m[1]);
  const side = conditions.filter((c) => bannedSide.test(c));
  if (side.length) return { ok: false, note: `组件体内存在区分两侧的分支：${side.slice(0, 3).map((s) => s.trim()).join(" | ")}` };
  return {
    note: `${conditions.length} 处判断条件全为「数据比较」（如 category === "全部" / promptTab active / dropTarget），条件中无 mode|isDock|isModal|variant 之类侧别旗标`
  };
});

// —— ESLint 进程内检查 ——
const { ESLint } = await import(pathToFileURL(path.resolve("node_modules/eslint/lib/api.js")).href);
const eslint = new ESLint({ cwd: process.cwd() });

function synthetic(bodyArr) {
  return `${iconImports(bodyArr)}\n${bodyArr.join("\n")}\nexport { PromptPresetGrid };\n`;
}
async function lint(code) {
  const rs = await eslint.lintText(code, { filePath: ABS });
  return rs[0].messages.map((m) => ({ ruleId: m.ruleId, severity: m.severity, line: m.line, message: m.message }));
}

const cleanMsgs = await lint(synthetic(comp.body));
check("NO-UNDEF-CLEAN", () => {
  const bad = cleanMsgs.filter((m) => m.ruleId === "no-undef");
  if (bad.length) return { ok: false, note: `未声明标识符：${bad.map((m) => `${m.ruleId} ${m.message}`).join(" | ")}` };
  const unused = cleanMsgs.filter((m) => m.ruleId === "no-unused-vars");
  if (unused.length) return { ok: false, note: `存在未使用标识符（prop 传多了）：${unused.map((m) => m.message).join(" | ")}` };
  return { note: `组件体（含真实 lucide import）共 ${cleanMsgs.length} 条消息，no-undef/no-unused-vars 均为 0` };
});

// 负向对照 1：删掉一个必传 prop 的解构 ⇒ 必须报 no-undef
const mutatedBody = comp.body.map((l) => l.replace("    search, onSearchChange, presets, draggedId, onApplyPreset, onRenamePreset,", "    presets, draggedId, onApplyPreset, onRenamePreset,"));
if (mutatedBody.join("\n") === comp.body.join("\n")) {
  results.push({ name: "NEG-MISSING-PROP", pass: false, note: "注入未生效，脚本失效" });
} else {
  const msgs = await lint(synthetic(mutatedBody));
  const hit = msgs.filter((m) => m.ruleId === "no-undef" && /search|onSearchChange/.test(m.message));
  results.push({ name: "NEG-MISSING-PROP", pass: hit.length >= 2, note: `删掉 search/onSearchChange 解构 ⇒ 命中 ${hit.length} 条 no-undef（期望≥2）：${hit.map((m) => m.message).join(" | ")}` });
}

// 负向对照 2：人为让一侧 props 不同 ⇒ 比较器必须 FAIL
check("NEG-PROPS-DIFF", () => {
  const fake = Object.assign({}, propsB, { activeCategory: "FAKE_SIDE_VALUE" });
  const ka = Object.keys(propsA).sort();
  const diff = ka.filter((k) => propsA[k] !== fake[k]);
  if (!diff.length) return { ok: false, note: "比较器不灵敏：注入差异却判定同值" };
  return { note: `注入一侧 activeCategory 差异 ⇒ 比较器报出 ${diff.length} 项不同（比较器有效，非恒真）` };
});

// —— ESLint 全集比对：HEAD 版 ↔ 工作区版 ——
try {
  const headSrc = await gitShow("HEAD:src/outfit-workflow.jsx");
  const headMsgs = await eslint.lintText(headSrc, { filePath: ABS }).then((rs) => rs[0].messages);
  const nowMsgs = await eslint.lintText(src, { filePath: ABS }).then((rs) => rs[0].messages);
  const key = (m) => `${m.ruleId}|${String(m.message).replace(/at line \d+/g, "at line N")}`;
  const setA = new Map(); const setB = new Map();
  for (const m of headMsgs) setA.set(key(m), m);
  for (const m of nowMsgs) setB.set(key(m), m);
  const added = [...setB.keys()].filter((k) => !setA.has(k));
  const gone = [...setA.keys()].filter((k) => !setB.has(k));
  results.push({ name: "LINT-SET-EQUAL", pass: added.length === 0 && gone.length === 0, note: `HEAD ${setA.size} 条 / 改后 ${setB.size} 条；新增 ${added.length} 消失 ${gone.length}${added.concat(gone).length ? " :: " + added.concat(gone).join(" | ") : ""}` });

  // 文件内注入负向对照（不改磁盘文件）：必须正好命中 no-unused-vars + no-undef
  const injected = src.replace("export default function OutfitWorkflow({", "const zzzUnused = notDefinedAnywhere;\n\nexport default function OutfitWorkflow({");
  const injMsgs = await eslint.lintText(injected, { filePath: ABS }).then((rs) => rs[0].messages);
  const hits = injMsgs.filter((m) => /zzzUnused|notDefinedAnywhere/.test(m.message));
  results.push({ name: "NEG-LINT-SENSITIVE", pass: hits.length === 2, note: `注入 zzzUnused/notDefinedAnywhere ⇒ 命中 ${hits.length} 条（期望 2）：${hits.map((m) => m.ruleId).join(",")}` });
} catch (e) {
  results.push({ name: "LINT-SET-EQUAL", pass: false, note: `EXCEPTION ${e.message}` });
}

// —— BASE 切块逐字相同（异步）——
try {
  const headSrc = await gitShow("HEAD:src/outfit-workflow.jsx");
  const hl = headSrc.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const ao = hl.findIndex((l) => l.trim() === '<div className="promptAssistantDock">');
  let ac = -1; for (let i = ao + 1; i < ao + 200; i += 1) if (hl[i] === "            </div>") { ac = i; break; }
  const bo = hl.findIndex((l) => l.trim() === '<div className="promptAssistantBody">');
  let bc = -1; for (let i = bo + 1; i < bo + 200; i += 1) if (hl[i] === "            </div>") { bc = i; break; }
  const A = hl.slice(ao + 1, ac); const B = hl.slice(bo + 1, bc);
  let first = -1;
  for (let i = 0; i < Math.max(A.length, B.length); i += 1) if (A[i] !== B[i]) { first = i; break; }
  results.push({
    name: "BASE-SLICE-EQUAL",
    pass: A.length === B.length && first === -1 && A.length > 0,
    note: `HEAD 版两处：A ${ao + 2}-${ac} 行 / B ${bo + 2}-${bc} 行，inner 各 ${A.length}/${B.length} 行，首个差异索引=${first}`
  });
} catch (e) {
  results.push({ name: "BASE-SLICE-EQUAL", pass: false, note: `EXCEPTION ${e.message}` });
}

console.log("\n=== RF-078-b 对照组 ===");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} :: ${r.note}`);
const failed = results.filter((r) => !r.pass);
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
console.log(failed.length === 0 ? "ALL PASS" : "HAS FAILURE");
