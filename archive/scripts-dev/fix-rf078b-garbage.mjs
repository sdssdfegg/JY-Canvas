// 一次性修复：清除 RF-078-b 提交混进 src/outfit-workflow.jsx 的二进制垃圾注释行。
//
// 教训（别再犯）：本文件是 UTF-8，但含非法字节 ⇒ **不能用 utf8 读再整体写回**
// （非法字节会被替换成 U+FFFD，污染其余 1 万行）；也不能用 latin1 写中文
// （中文被当单字节落盘，同样破坏编码）。⇒ 只在**字节层面**切除脏行、
// 插入用 UTF-8 显式编码的新 Buffer，其余字节原样不动。
import fs from "node:fs";

const FILE = "src/outfit-workflow.jsx";
const TARGET = 5727; // 1-based 脏行行号

const buf = fs.readFileSync(FILE);

// 按 \n 切出字节偏移，定位第 TARGET 行的 [start, endExclusive)
const starts = [0];
for (let i = 0; i < buf.length; i += 1) if (buf[i] === 0x0a) starts.push(i + 1);
const lineStart = starts[TARGET - 1];
const lineEnd = starts[TARGET]; // 含换行符本身

if (lineStart === undefined || lineEnd === undefined) {
  console.error("✗ 行号越界");
  process.exit(1);
}
const raw = buf.slice(lineStart, lineEnd);
if (!raw.toString("latin1").startsWith("// RF-078-b")) {
  console.error(`✗ 行 ${TARGET} 不是预期的脏注释：${JSON.stringify(raw.toString("latin1").slice(0, 40))}`);
  process.exit(1);
}
const crlf = raw.length >= 2 && raw[raw.length - 2] === 0x0d;
console.log(`命中行 ${TARGET}：${raw.length} 字节，行尾 = ${crlf ? "CRLF" : "LF"}`);

const eol = crlf ? "\r\n" : "\n";
const REPLACEMENT = [
  "// RF-078-b：提示词预设面板 JSX 在「停靠视图」与「模态弹窗」两处逐字重复，这里抽成共用组件。",
  "//必须定义在模块顶层（本文件全局作用域），严禁挪进 OutfitWorkflow 组件体内 ——",
  "//    否则每次 render 都会重建组件类型，React 卸载重挂整棵子树，导致搜索框失焦、拖拽态重置。",
];
// 第二条补回 emoji 说明符（单独写，避免在数组里塞 emoji 造成编码歧义）
REPLACEMENT[1] = "// 🔴 必须定义在模块顶层（本文件全局作用域），严禁挪进 OutfitWorkflow 组件体内 ——";

const insert = Buffer.from(REPLACEMENT.map((s) => s + eol).join(""), "utf8");
const out = Buffer.concat([buf.slice(0, lineStart), insert, buf.slice(lineEnd)]);
fs.writeFileSync(FILE, out);

const after = fs.readFileSync(FILE);
const t = after.toString("latin1");
const total = t.split("\n").length - 1;
console.log(`✓ 已修复：${total} 行，脏字节 ${after.includes(0) ? "仍有" : "已清零"}，CRLF=${(t.match(/\r\n/g) || []).length}`);
try {
  new TextDecoder("utf-8", { fatal: true }).decode(after);
  console.log("✓ UTF-8 解码：OK");
} catch (e) {
  console.error("✗ UTF-8 解码仍失败：", e.message);
  process.exitCode = 1;
}
