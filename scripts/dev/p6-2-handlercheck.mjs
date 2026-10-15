// scripts/dev/p6-2-handlercheck.mjs
// P6-2 §4 负向对照静态校验：父组件 useOutfitSaveHandlers 解构集 == 钩导出集。
// 绿：两者一致且父组件确有引用（prop/call）；红：漏导出 / 漏解构 / 未被引用 → EXIT=1。
// 运行：node scripts/dev/p6-2-handlercheck.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const parentPath = resolve(root, "src/outfit-workflow.jsx");
const hookPath = resolve(root, "src/features/outfit/handlers/outfit-save-handlers.js");

function read(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

const parent = read(parentPath);
const hook = read(hookPath);
if (!parent || !hook) {
  console.error("❌ 无法读取源文件：", { parentPath, hookPath });
  process.exit(1);
}

// 钩导出集：钩内 taskToDownloadItem 也有 `return { ... }; }`，不能从第一个 `return {` 匹配。
// 改为定位文件末尾的「最后一个 return {」（即导出块），再截取其后到 `};` 的键名列表。
function exportedNames(src) {
  const lastReturn = src.lastIndexOf("return {");
  if (lastReturn === -1) return null;
  const tail = src.slice(lastReturn);
  const m = tail.match(/return\s*\{([\s\S]*?)\}\s*;\s*\}/);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

// 父解构集：匹配本单注入的 `const { ... } = useOutfitSaveHandlers(`，
// 以唯一注释「P6-2」锚定，避免误吞前面的 `const {`（usePreviewDrag / useSaveDirectory / useOutfitRefHandlers 等）。
function destructuredNames(src) {
  const m = src.match(/P6-2[\s\S]*?const\s*\{([\s\S]*?)\}\s*=\s*useOutfitSaveHandlers\(/);
  if (!m) return null;
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

const exp = exportedNames(hook);
const des = destructuredNames(parent);
if (!exp || !des) {
  console.error("❌ 无法解析导出/解构集", { exp, des });
  process.exit(1);
}

const expSet = new Set(exp);
const desSet = new Set(des);

const missing = [...desSet].filter((n) => !expSet.has(n)); // 父解构但钩未导出
const orphan = [...expSet].filter((n) => !desSet.has(n)); // 钩导出但父未解构

let ok = true;
if (missing.length) {
  console.error("❌ 父组件解构但钩未导出：", missing);
  ok = false;
}
if (orphan.length) {
  console.error("❌ 钩导出但父组件未解构：", orphan);
  ok = false;
}

// 引用核验：每个解构名在父组件至少再出现一次（作为 prop 或调用，非仅解构处）。
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unreferenced = [...desSet].filter((n) => {
  const re = new RegExp(`\\b${escaped(n)}\\b`, "g");
  const count = (parent.match(re) || []).length;
  return count < 2; // 1 = 仅解构处本身
});
if (unreferenced.length) {
  console.error("❌ 钩 handler 在父组件未被引用（仅解构）：", unreferenced);
  ok = false;
}

if (!ok) {
  console.error(
    `P6-2 handlercheck 失败：导出集(${exp.join(",")}) / 解构集(${des.join(",")}) 不一致`
  );
  process.exit(1);
}

console.log(`✅ P6-2 handlercheck 通过：导出/解构一致（${exp.join(", ")}），均被父组件引用。`);
process.exit(0);
