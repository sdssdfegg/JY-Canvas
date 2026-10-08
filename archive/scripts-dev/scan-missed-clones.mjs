import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

// 扫描：shared 已导出的函数 vs 两巨石本地函数 —— 找「体一致/近一致但名字不同」的漏搬克隆。
// 动机：RF-064 / RF-065 两条都是 ≤10 行、advisory 档结构性盲区里的改名克隆，
//       靠「追调用链」才发现 ⇒ 这里做一次地毯式兜底，避免还有漏网。

function fns(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/.exec(lines[i]);
    if (!m) continue;
    const body = [];
    let d = 0, opened = false, end = i;
    for (let j = i; j < lines.length; j++) {
      body.push(lines[j].replace(/\r$/, "").replace(/^\s{2}/, ""));
      d += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
      if (d > 0) opened = true;
      if (opened && d === 0) { end = j; break; }
    }
    if (!opened) continue;
    out.push({ name: m[1], ln: i + 1, len: end - i + 1, text: body.join("\n") });
  }
  return out;
}

// L1 归一化：空白折叠（与 block-clone 档一致）
const L1 = (s) => s.replace(/\s+/g, " ").trim();
// 去掉函数名与 export 前缀后比体
const bodyOf = (t) => t.replace(/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*/, "");

async function read(p) {
  const { stdout } = await run("git", ["show", "HEAD:" + p], { maxBuffer: 1 << 26 });
  return stdout;
}

const allFiles = (await run("git", ["ls-files"], { maxBuffer: 1 << 24 })).stdout.split(/\r?\n/);
const sharedFiles = allFiles.filter((f) => f.startsWith("src/shared/") && f.endsWith(".js"));

const shared = [];
for (const f of sharedFiles) {
  for (const fn of fns(await read(f))) shared.push({ ...fn, file: f });
}
console.log(`shared 导出/定义函数 ${shared.length} 个（${sharedFiles.length} 文件）`);

const targets = ["src/main.jsx", "src/outfit-workflow.jsx", "src/image-editor.jsx"];
const hits = [];
for (const t of targets) {
  const local = fns(await read(t));
  for (const l of local) {
    if (l.len < 3) continue;
    const lb = L1(bodyOf(l.text));
    for (const s of shared) {
      if (s.name === l.name) continue;           // 同名已由 019 覆盖
      const sb = L1(bodyOf(s.text));
      if (sb.length < 20) continue;              // 太短的体不具判别力
      if (sb === lb) {
        hits.push({ kind: "字节一致", local: `${t}:${l.ln} ${l.name}(${l.len}行)`, shared: `${s.file}:${s.ln} ${s.name}(${s.len}行)` });
      }
    }
  }
}
if (!hits.length) {
  console.log("\n✅ 未发现「shared 已导出但巨石里还有等价本地定义」的漏搬克隆");
} else {
  console.log(`\n🔴 发现 ${hits.length} 处漏搬克隆：`);
  for (const h of hits) console.log(`  [${h.kind}] ${h.local}  ≡  ${h.shared}`);
}
