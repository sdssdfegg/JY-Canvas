// HOTFIX-04：输入法组字期间绝不回灌 value，并把上一版注释改成准确表述
import { readFileSync, writeFileSync } from "node:fs";

const file = "src/shared/DebouncedTextarea.jsx";
const from = [
  "  // 外部值回灌。⚠️ 这里必须挡住一个时序陷阱（2026-10-05 用户实测的「光标跳到末尾」）：",
  "  // 提交是防抖的（默认 260ms）：commit() 把文本交给父组件后，父组件要重渲染才把新 value 传回来；",
  "  // 而本项目父组件是 App / OutfitWorkflow 这种几千行的巨物，重渲染可能耗时上百毫秒。",
  "  // 用户在这段窗口里继续打字时 draft 已经领先于 value —— 无条件回灌就会抹掉刚敲的字符、",
  "  // 并把光标甩到末尾（用户看到的就是「打字打到一半突然跳到最后一个位置」）。",
  "  // 判据：value 等于「我们自己最后提交出去的那一份」⇒ 只是父组件的回声，不回灌。",
  "  useEffect(() => {",
  '    const next = String(value ?? "");',
  "    if (next === latestCommittedRef.current) return;",
  "    latestCommittedRef.current = next;",
  "    setDraft((current) => (current === next ? current : next));",
  "  }, [value]);"
];
const to = [
  "  // 外部值回灌。⚠️ 用户输入过程中**任何一次回灌**都是有害的，这里挡两道（2026-10-05 实测「光标跳末尾」）：",
  "  //",
  "  // ① 输入法组字期间一律不回灌。组字中写 value 会打断组字：候选框消失、光标被甩到末尾，",
  "  //    而**已经上屏的字一个都不会少** —— 这正是现象签名（只跳光标、不丢字）。",
  "  // ② value 恰等于「我们自己最后提交出去的那一份」时也不回灌：那只是父组件的回声。",
  "  //    提交是防抖的（默认 260ms），而父组件（App / OutfitWorkflow 这种几千行的巨物）",
  "  //    重渲染可达上百毫秒；用户在这段窗口继续打字时 draft 已领先于 value，",
  "  //    无条件回灌会把刚敲的字符抹掉、并把光标甩到末尾。",
  "  //",
  "  // 真外部变更（换装/精修的「按设置重新算」、草稿加载回写）其值既不等于最后一次提交、",
  "  // 也不发生在组字中，照旧正常回灌，行为不变。",
  "  useEffect(() => {",
  '    const next = String(value ?? "");',
  "    if (composingRef.current) return;",
  "    if (next === latestCommittedRef.current) return;",
  "    latestCommittedRef.current = next;",
  "    setDraft((current) => (current === next ? current : next));",
  "  }, [value]);"
];

const buf = readFileSync(file);
if (buf.includes(0)) throw new Error("NUL in " + file);
const lines = buf.toString("utf8").split("\n");
const crs = lines.map((l) => l.endsWith("\r"));
const body = lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

const hit = [];
for (let i = 0; i + from.length <= body.length; i++) {
  if (from.every((f, k) => body[i + k] === f)) hit.push(i);
}
if (hit.length !== 1) throw new Error("锚点命中数 = " + hit.length + "（必须为 1）");

const at = hit[0];
const delta = to.length - from.length;
const next = [...body.slice(0, at), ...to, ...body.slice(at + from.length)];
const out = next.map((l, i) => {
  const cr = i >= at && i < at + to.length ? crs[at] : crs[i < at ? i : i - delta];
  return cr ? l + "\r" : l;
}).join("\n");

if (/\r\r\n/.test(out)) throw new Error("CRCR 出现");
writeFileSync(file, Buffer.from(out, "utf8"), "utf8");

const back = readFileSync(file).toString("utf8");
console.log("OK", file,
  "| 行 " + lines.length + "→" + back.split("\n").length,
  "| U+FFFD=" + (back.match(/\uFFFD/g) || []).length,
  "| CRCR=" + (back.match(/\r\r\n/g) || []).length);
