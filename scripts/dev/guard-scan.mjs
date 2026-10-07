// 普查：scripts/verify 里「取了切片但没加命中守卫」的锚点。
// 这类 anchor 一旦因搬家失效（indexOf 返回 -1），slice 退化成空串，
// 负向断言（"不该有 X"）就会恒 PASS —— 门禁变假绿，比 FAIL 更危险。
//
// 用法：node scripts/dev/guard-scan.mjs
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "scripts", "verify");
let hits = 0;

for (const file of fs.readdirSync(DIR).filter((name) => name.endsWith(".mjs"))) {
  const source = fs.readFileSync(path.join(DIR, file), "utf8");
  const lines = source.split(/\r?\n/);

  // 1) 收集所有 indexOf 锚点变量
  const anchors = [];
  lines.forEach((line, index) => {
    const matched = line.match(/const\s+(\w+)\s*=\s*\w+\.indexOf\(/);
    if (matched) anchors.push({ name: matched[1], line: index + 1, text: line.trim().slice(0, 90) });
  });
  if (anchors.length === 0) continue;

  // 2) 该变量有没有在别处被 >= 0 / > 0 / !== -1 守卫过
  const guarded = new Set();
  for (const line of lines) {
    for (const found of line.match(/(\w+)\s*(?:>=|>|!==)\s*(?:0|-1)/g) || []) {
      guarded.add(found.split(/\s*[><!=]+\s*/)[0]);
    }
    for (const found of line.match(/if\s*\(\s*(\w+)\s*\)/g) || []) {
      guarded.add(found.replace(/if\s*\(\s*/, "").replace(/\s*\)\s*$|^\)/, "").trim());
    }
  }

  const risky = anchors.filter((item) => !guarded.has(item.name));
  if (risky.length === 0) continue;

  hits += risky.length;
  console.log(`### ${file}`);
  for (const item of risky) console.log(`   L${item.line}  [${item.name}]  ${item.text}`);
}

console.log(hits === 0 ? "\n无风险锚点。" : `\n合计 ${hits} 处无守卫锚点需人工判是否存在负向断言。`);
