// 提取两侧同名/异名函数体 → 剥缩进 → 逐行比对 + 列出自由标识符（判断能否搬）
import { readFileSync } from "node:fs";

const grab = (file, name) => {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const re = new RegExp("function\\s+" + name + "\\s*\\(");
  const i = lines.findIndex((l) => re.test(l));
  if (i < 0) return null;
  const out = [];
  let depth = 0, started = false;
  for (let j = i; j < lines.length; j++) {
    out.push(lines[j]);
    depth += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
    if (depth > 0) started = true;
    if (started && depth === 0) break;
  }
  return out.map((l) => l.replace(/^ {2}/, ""));
};

const pairs = [
  ["runConnectionTest", "runConnectionTest"],
  ["cropQuickLocalEditFile", "cropOutfitLocalEditFile"],
  ["copyText", "copyText"],
  ["openDirectoryModal", "openDirectoryModal"],
  ["pickSaveDirectory", "pickSaveDirectory"],
];

const MAIN = "src/main.jsx";
const OUTFIT = "src/outfit-workflow.jsx";

for (const [a, b] of pairs) {
  const A = grab(MAIN, a), B = grab(OUTFIT, b);
  console.log("\n========== " + a + " ↔ " + b + " ==========");
  if (!A || !B) { console.log("  缺失 main=" + !!A + " outfit=" + !!B); continue; }
  const same = A.join("\n") === B.join("\n");
  console.log("  行数 main=" + A.length + " outfit=" + B.length + " | 剥缩进后 " + (same ? "字节一致 ✅" : "有差异 ❌"));
  if (!same) {
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      if (A[i] !== B[i]) console.log("    L" + (i + 1) + "\n      main  : " + A[i] + "\n      outfit: " + B[i]);
    }
  }
  // 自由标识符粗筛（块内未声明的大写开头 / setX / ref / onX / useX）
  const body = A.join("\n");
  const declared = new Set([...body.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const params = new Set([...A[0].matchAll(/([A-Za-z_$][\w$]*)\s*[=,)]/g)].map((m) => m[1]));
  const ids = new Set([...body.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]));
  const suspect = [...ids].filter((x) => {
    if (declared.has(x) || params.has(x)) return false;
    if (/^(const|let|var|function|return|if|else|await|async|new|try|catch|finally|throw|typeof|for|of|in|null|true|false|undefined|this|break|continue|Math|JSON|Object|Array|String|Number|Boolean|Promise|Date|Error|File|Blob|URL|document|window|navigator|console|RegExp|Map|Set)\b/.test(x)) return false;
    return /^[A-Z_][A-Z0-9_]*$/.test(x) || /^(set|on|use)[A-Z]/.test(x) || /Ref$/.test(x);
  });
  console.log("  ⚠️ 需关注的自由标识符: " + (suspect.length ? suspect.join(", ") : "无"));
  console.log("  首行: " + A[0].trim());
}
