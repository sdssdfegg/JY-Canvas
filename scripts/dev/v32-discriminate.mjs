// V32 §5 负向判别力对照（受控版，不污染仓库）
// 从真实 verify 脚本提取「上传副本长边上限仍是 3072」那条 check 的 5 个真实正则，
// 对三种场景验证判别力：
//   A 当前真实文件            → 断言应 PASS
//   B image-input 3072→3073   → 断言应 FAIL（段①：真源值变了）
//   C panels 加回本地定义      → 断言应 FAIL（段②：消费方仍留本地定义）
import fs from "node:fs";
const ROOT = process.cwd();

// 1) 从 verify 脚本提取真实正则
const verify = fs.readFileSync(`${ROOT}/scripts/verify/local-edit-base-file-check.mjs`, "utf8");
const nameIdx = verify.indexOf('check("上传副本长边上限仍是 3072');
if (nameIdx < 0) throw new Error("找不到目标 check");
const tail = verify.slice(nameIdx);
// 取到 `  "3072");` 之前
const endIdx = tail.indexOf('  "3072");');
if (endIdx < 0) throw new Error("找不到 check 结束");
const block = tail.slice(0, endIdx);
// 按行提取每个 /.../.test(变量)，并据本行是否含 ! 判定取反
const ordered = [];
for (const line of block.split("\n")) {
  const t = /\/([^/\n]*)\/\.test\((\w+)\)/.exec(line);
  if (!t) continue;
  ordered.push({ pattern: t[1], src: t[2], neg: line.includes("!") });
}
console.log(`提取到 ${ordered.length} 个子判断：`);
for (const o of ordered) console.log(`  ${o.neg ? "!" : " "} /${o.pattern}/  .test(${o.src})`);

// 2) 读真实源码
const read = (p) => fs.readFileSync(`${ROOT}/${p}`, "utf8");
const srcs = {
  imageInputSrc: read("src/shared/image-input.js"),
  outfitPanelsSrc: read("src/features/outfit/outfit-panels.jsx"),
  referenceUploadSrc: read("src/features/upload/reference-upload.js")
};
function evalAssert(s) {
  return ordered.every((o) => {
    const hit = new RegExp(o.pattern).test(s[o.src]);
    return o.neg ? !hit : hit;
  });
}

// 3) 三种场景
const A = evalAssert(srcs);
const Bsrcs = { ...srcs, imageInputSrc: srcs.imageInputSrc.replace("3072", "3073") };
const B = evalAssert(Bsrcs);
const Csrcs = { ...srcs, outfitPanelsSrc: srcs.outfitPanelsSrc + "\nexport const CHANNEL_UPLOAD_MAX_SIDE = 3072;\n" };
const C = evalAssert(Csrcs);

console.log("\n场景 A（当前真实文件）            ：", A ? "PASS ✅（应为真）" : "FAIL ❌（异常）");
console.log("场景 B（真源 3072→3073）         ：", B ? "PASS ❌（应判红，判别力失效）" : "FAIL ✅（段①有判别力）");
console.log("场景 C（panels 加回本地定义）     ：", C ? "PASS ❌（应判红，判别力失效）" : "FAIL ✅（段②有判别力）");

if (A && !B && !C) { console.log("\n✓ 判别力对照通过：5 个子判断均非摆设"); process.exit(0); }
else { console.error("\n✗ 判别力对照未通过"); process.exit(1); }
