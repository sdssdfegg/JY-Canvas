import { readFileSync } from "node:fs";
const pick = (file, name) => {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const re = new RegExp("function " + name + "\\s*\\(");
  const i = lines.findIndex(l => re.test(l));
  if (i < 0) return null;
  const out = [];
  let depth = 0, started = false;
  for (let j = i; j < lines.length; j++) {
    out.push(lines[j]);
    depth += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
    if (depth > 0) started = true;
    if (started && depth === 0) break;
  }
  return out.map(l => l.replace(/^ {2}/, "")).join("\n");
};
const names = ["safeDownloadFileName","padDragDownloadNumber","dragDownloadDateStamp","absoluteDownloadUrl","beginImageDownloadDrag","dataUrlFromBlob"];
for (const n of names) {
  const a = pick("src/main.jsx", n), b = pick("src/outfit-workflow.jsx", n);
  if (!a || !b) { console.log(n + ": 缺失 (main=" + !!a + " outfit=" + !!b + ")"); continue; }
  const same = a === b;
  console.log(n + ": " + (same ? "字节一致 OK" : "有差异 DIFF") + "  (main " + a.split("\n").length + " 行 / outfit " + b.split("\n").length + " 行)");
  if (!same) {
    const al = a.split("\n"), bl = b.split("\n");
    for (let i = 0; i < Math.max(al.length, bl.length); i++) if (al[i] !== bl[i]) console.log("   L" + (i+1) + "\n     main  : " + al[i] + "\n     outfit: " + bl[i]);
  }
}
