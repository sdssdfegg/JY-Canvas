import fs from "node:fs";
const f = "scripts/secure-win-release.mjs";
const b = fs.readFileSync(f);
let bad = 0;
for (let i = 0; i + 3 <= b.length; i++) {
  if (b[i] === 0x0d && b[i + 1] === 0x0d && b[i + 2] === 0x0a) bad++;
}
console.log(`${f}  \\r\\r\\n 计数 = ${bad}`);
