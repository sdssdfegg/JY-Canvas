import fs from "node:fs";
const f = "scripts/secure-win-release.mjs";
let s = fs.readFileSync(f, "utf8");
const LQ = String.fromCharCode(0x201c);
const RQ = String.fromCharCode(0x201d);
const before = s;
// 把被误写成字面转义序列的 \u201c / \u201d 还原为真实弯引号（仅应出现在使用说明那一行）
s = s.split("\\u201c").join(LQ).split("\\u201d").join(RQ);
if (s === before) {
  console.error("未找到字面 \\u201c/\\u201d 序列，无需替换");
  process.exit(2);
}
fs.writeFileSync(f, s);
console.log("已将字面转义还原为真实弯引号");
