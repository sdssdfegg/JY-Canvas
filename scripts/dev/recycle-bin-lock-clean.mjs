// 定向清理回收站中 safe-delete（软删除）工具遗留的 .lock 垃圾项。
//
// 背景（完整取证见 docs/回收站lock问题-定位与优化反馈.md）：
//   safe-delete 批量删除时会在 %TEMP%\codebuddy-safe-delete-bulk\<hash>\ 下建作业目录，
//   作业内文件带 .lock；作业结束把整个作业目录丢进回收站，.lock 项随之堆进
//   C:\$Recycle.Bin\<SID>\——包括 $I*.lock 索引文件、$R*.lock 数据文件，
//   以及 $R*.lock 空目录（被删的 .lock 目录本身）。用户要保留回收站
//   （误删恢复是刚需，「不将文件移到回收站」方案已被用户否决），
//   因此只能定向清这一种来源的垃圾。
//
// 安全设计（默认 dry-run，必须显式 --apply 才真删）：
//   1. 只处理 .lock 项；非 .lock 条目（用户的真实删除文件）一律只报告、绝不动；
//   2. 成对删除：仅当 $I 索引解码出的原路径包含 codebuddy-safe-delete-bulk 时，
//      才删对应的 $R + $I——删除动作一律 spawnSync("/usr/bin/rm") 调外部真二进制：
//      本脚本在 AI 会话的 node 进程里跑，fs.rmSync/rmdirSync 会被 safe-delete shim
//      拦截转存回收站（目标不在系统 temp 下），用 node 原生 API 删回收站条目会
//      "边删边涨"。$R 空目录用 rmdir（仅空可删，非空即报错，不递归删）；
//   3. 孤儿 $I 索引（数据已不在回收站）同样先解码验证来源再删；
//   4. 来源不符 / 无索引的 $R（文件或目录）/ 解码失败的项只报告不删；
//   5. 占比闸：可解码项中来源不符超过 5% 时拒绝 --apply（说明 ORIGIN_MARK 可能
//      已失效，需人工复核），确认无误后加 --force 重跑。
//
// 用法：
//   node scripts/dev/recycle-bin-lock-clean.mjs                 # 预演（只读）
//   node scripts/dev/recycle-bin-lock-clean.mjs --apply         # 执行清理
//   node scripts/dev/recycle-bin-lock-clean.mjs --apply --force # 占比闸告警仍强制执行
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const ORIGIN_MARK = "codebuddy-safe-delete-bulk";
const NAME_RE = /^\$([RI])([A-Za-z0-9]+)\.(.+)$/;
const FOREIGN_RATIO_LIMIT = 0.05;

// 默认扫描所有存在 $Recycle.Bin 的盘（仓库在 D:，safe-delete 删仓库文件会污染
// D 盘回收站；2026-10-16 实测当前只有 C: 有 .lock）。--root 可指定单个根目录（测试用）。
const rootArgIdx = argv.indexOf("--root");
if (rootArgIdx >= 0 && !argv[rootArgIdx + 1]) {
  console.error("--root 需要一个路径参数");
  process.exit(1);
}
let roots;
if (rootArgIdx >= 0) {
  roots = [argv[rootArgIdx + 1]];
} else {
  roots = [];
  for (let c = 67; c <= 90; c += 1) {
    // C..Z 逐个探，盘不存在或无权访问就跳过
    const p = `${String.fromCharCode(c)}:\\$Recycle.Bin`;
    try {
      if (fs.statSync(p).isDirectory()) roots.push(p);
    } catch {
      // 忽略：该盘不存在
    }
  }
}

const t = {
  lockIFile: 0,
  lockRFile: 0,
  lockRDir: 0,
  pairFile: 0,
  pairDir: 0,
  orphanI: 0,
  foreign: 0,
  orphanRFile: 0,
  orphanRDir: 0,
  decodeFail: 0,
  nonLockR: 0,
  nonLockI: 0,
  nonLockOther: 0,
  bytesToFree: 0,
  deleted: 0,
  deletedBytes: 0,
  deleteFailed: 0,
  minTime: null,
  maxTime: null
};
const actions = [];
const samples = [];
const foreignSamples = [];
const nonLockSamples = [];
const decodeFailSamples = [];
const originGroups = new Map();

function fmtTime(d) {
  if (!d || Number.isNaN(d.getTime())) return "（时间戳无效）";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 解码 Win10 v2 回收站 $I 索引：version(8) size(8) filetime(8) pathLen(4) path(UTF-16LE)
// pathLen 在偏移 24、路径从偏移 28 起；偏移 20 是 v1 格式的错解，别用。
function decodeIndex(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length < 28) return null;
    const pathLen = buf.readUInt32LE(24);
    if (!pathLen || pathLen > 4096 || 28 + pathLen * 2 > buf.length) return null;
    const decoded = buf.subarray(28, 28 + pathLen * 2).toString("utf16le");
    if (!/^([A-Za-z]:\\|\\\\)/.test(decoded)) return null;
    let deletedAt = null;
    try {
      const ft = buf.readBigUInt64LE(16);
      if (ft > 0n) deletedAt = new Date(Number(ft / 10000n) - 11644473600000);
    } catch {
      deletedAt = null; // 时间戳只用于报告，解不出不影响主流程
    }
    return { path: decoded, deletedAt };
  } catch {
    return null; // 文件可能在扫描瞬间被移除
  }
}

function noteTime(when) {
  if (!when || Number.isNaN(when.getTime())) return;
  if (!t.minTime || when < t.minTime) t.minTime = when;
  if (!t.maxTime || when > t.maxTime) t.maxTime = when;
}

function groupOrigin(originPath) {
  const key = originPath.replace(/codebuddy-safe-delete-bulk\\[0-9a-f]+/gi, `${ORIGIN_MARK}\\<HASH>`);
  originGroups.set(key, (originGroups.get(key) || 0) + 1);
}

function removeOne(entry) {
  // 自指陷阱：本脚本在 AI 会话的 node 进程里跑，fs.rmSync/rmdirSync 会被
  // safe-delete shim 拦截转存回收站（目标不在系统 temp 下）——"删回收站里的
  // .lock"会变成"把 .lock 再移入回收站"，边删边涨。必须调外部真二进制。
  // $R 空目录用 rmdir（仅空可删）；$R/$I 文件用 rm -f。
  try {
    const args = entry.dir ? [entry.full] : ["-f", entry.full];
    const r = spawnSync("/usr/bin/rm", args, { stdio: ["ignore", "ignore", "pipe"] });
    if (r.status !== 0) throw new Error(r.stderr ? r.stderr.toString().trim() : `exit=${r.status}`);
    t.deleted += 1;
    t.deletedBytes += entry.size;
  } catch (err) {
    t.deleteFailed += 1;
    console.error(`[删除失败] ${entry.full}: ${err.message}`);
  }
}

function scanSidDir(dir) {
  const rFile = new Map(); // $R*.lock 文件：hash -> {full, size, name}
  const rDir = new Map(); // $R*.lock 空目录：hash -> {full, name}
  const iFile = new Map(); // $I*.lock 索引文件：hash -> {full, size, name}
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return { error: err.code || err.message };
  }
  for (const e of entries) {
    const m = NAME_RE.exec(e.name);
    if (!m) {
      if (e.isFile()) t.nonLockOther += 1;
      continue;
    }
    const full = path.join(dir, e.name);
    if (m[3].toLowerCase() !== "lock") {
      // 非 .lock 的 $R/$I：用户的真实删除文件，只记账 + 抽样解码，绝不动
      if (e.isFile()) {
        if (m[1] === "R") t.nonLockR += 1;
        else t.nonLockI += 1;
        if (nonLockSamples.length < 5 && m[1] === "I") {
          const decoded = decodeIndex(full);
          if (decoded) nonLockSamples.push(decoded.path);
        }
      }
      continue;
    }
    if (e.isDirectory()) {
      if (m[1] === "R") rDir.set(m[2], { full, name: e.name });
      continue;
    }
    if (!e.isFile()) continue;
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      // 忽略：文件可能在扫描瞬间被移除，按 0 字节计
    }
    const entry = { full, size, name: e.name };
    if (m[1] === "R") rFile.set(m[2], entry);
    else iFile.set(m[2], entry);
  }
  t.lockRFile += rFile.size;
  t.lockRDir += rDir.size;
  t.lockIFile += iFile.size;
  return { rFile, rDir, iFile };
}

function countLocks(dirs) {
  let n = 0;
  for (const dir of dirs) {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (name.toLowerCase().endsWith(".lock")) n += 1;
      }
    } catch {
      // 忽略：无权目录跳过
    }
  }
  return n;
}

const sidDirs = [];
for (const root of roots) {
  try {
    const dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(root, e.name));
    sidDirs.push(...dirs);
  } catch (err) {
    console.log(`[跳过] ${root}（${err.code || err.message}）`);
  }
}
if (sidDirs.length === 0) {
  console.error(`未找到可扫描的回收站目录（roots=${roots.join(", ")}）`);
  process.exit(1);
}

for (const dir of sidDirs) {
  const scanned = scanSidDir(dir);
  if (scanned.error) {
    console.log(`[跳过] ${dir}（${scanned.error}）`);
    continue;
  }
  const { rFile, rDir, iFile } = scanned;

  for (const [hash, iEntry] of iFile) {
    const rF = rFile.get(hash);
    const rD = rDir.get(hash);
    if (!rF && !rD) {
      // 无 $R 配对：先解码验证来源，确认是 safe-delete 的孤儿索引才删
      const decoded = decodeIndex(iEntry.full);
      if (!decoded) {
        t.decodeFail += 1;
        if (decodeFailSamples.length < 2) decodeFailSamples.push(iEntry.name);
        continue;
      }
      if (!decoded.path.includes(ORIGIN_MARK)) {
        t.foreign += 1;
        if (foreignSamples.length < 5) foreignSamples.push(decoded.path);
        continue;
      }
      t.orphanI += 1;
      t.bytesToFree += iEntry.size;
      noteTime(decoded.deletedAt);
      groupOrigin(decoded.path);
      if (samples.length < 5) samples.push(`${decoded.path}（仅剩索引，数据已不在回收站）`);
      actions.push({ full: iEntry.full, size: iEntry.size });
      continue;
    }
    const decoded = decodeIndex(iEntry.full);
    if (!decoded) {
      t.decodeFail += 1;
      if (decodeFailSamples.length < 2) decodeFailSamples.push(iEntry.name);
      continue;
    }
    if (!decoded.path.includes(ORIGIN_MARK)) {
      t.foreign += 1;
      if (foreignSamples.length < 5) foreignSamples.push(decoded.path);
      continue;
    }
    noteTime(decoded.deletedAt);
    groupOrigin(decoded.path);
    if (samples.length < 5) samples.push(decoded.path);
    if (rF) {
      t.pairFile += 1;
      t.bytesToFree += rF.size + iEntry.size;
      actions.push({ full: rF.full, size: rF.size }, { full: iEntry.full, size: iEntry.size });
    } else {
      t.pairDir += 1;
      t.bytesToFree += iEntry.size;
      actions.push({ full: iEntry.full, size: iEntry.size }, { full: rD.full, size: 0, dir: true });
    }
  }

  for (const hash of rFile.keys()) {
    if (iFile.has(hash)) continue;
    t.orphanRFile += 1; // 无索引的 $R 文件：无法验证来源，保留
  }
  for (const hash of rDir.keys()) {
    if (iFile.has(hash)) continue;
    t.orphanRDir += 1; // 无索引的 $R 目录：无法验证来源，保留
  }
}

const decodable = t.pairFile + t.pairDir + t.orphanI + t.foreign;
const foreignRatio = decodable > 0 ? t.foreign / decodable : 0;
const cleanable = t.pairFile + t.pairDir + t.orphanI;

console.log(`模式：${APPLY ? "APPLY（真实删除）" : "dry-run（只读预演，未删任何文件）"}`);
console.log(`回收站根目录：${roots.join(" / ")}（SID 目录 ${sidDirs.length} 个）`);
console.log(`.lock 现存：$I 索引文件=${t.lockIFile}  $R 数据文件=${t.lockRFile}  $R 空目录=${t.lockRDir}`);
console.log(`可清理（来源确认为 ${ORIGIN_MARK}）：成对文件 ${t.pairFile} + 成对空目录 ${t.pairDir} + 孤儿索引 ${t.orphanI} = ${cleanable} 项 / ${t.bytesToFree} 字节`);
console.log(`保留不动：来源不符 ${t.foreign} / 无索引 $R 文件 ${t.orphanRFile} / 无索引 $R 目录 ${t.orphanRDir} / 解码失败 ${t.decodeFail}`);
console.log(`非 .lock 条目（真实删除文件）：$R=${t.nonLockR} $I=${t.nonLockI} 其他=${t.nonLockOther}——绝不触碰`);
if (t.minTime) console.log(`可清理项的产生时间范围：${fmtTime(t.minTime)} ~ ${fmtTime(t.maxTime)}（本地时间）`);
if (originGroups.size > 0) {
  console.log("按作业目录归组（Top 10）：");
  [...originGroups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, v]) => console.log(`  ${v}\t${k}`));
}
if (samples.length > 0) console.log(`来源确认样本：\n  - ${samples.join("\n  - ")}`);
if (foreignSamples.length > 0) console.log(`来源不符样本（保留）：\n  - ${foreignSamples.join("\n  - ")}`);
if (nonLockSamples.length > 0) console.log(`真实删除文件样本：\n  - ${nonLockSamples.join("\n  - ")}`);
if (decodeFailSamples.length > 0) console.log(`解码失败样本（保留）：${decodeFailSamples.join(", ")}`);

if (foreignRatio > FOREIGN_RATIO_LIMIT) {
  console.log(`[注意] 可解码项中来源不符占比 ${(foreignRatio * 100).toFixed(1)}%，超过 ${FOREIGN_RATIO_LIMIT * 100}% 警戒线——先人工复核来源不符样本，确认无误后加 --force 才会执行删除`);
}

if (APPLY) {
  if (!FORCE && foreignRatio > FOREIGN_RATIO_LIMIT) {
    console.error("[拒绝执行] 占比闸拦截：ORIGIN_MARK 可能已失效，勿强删");
    process.exit(1);
  }
  for (const a of actions) removeOne(a);
  const after = countLocks(sidDirs);
  console.log(`\n已删除 ${t.deleted} 个文件/目录（${t.deletedBytes} 字节），失败 ${t.deleteFailed} 个`);
  console.log(`复扫：剩余 .lock ${after} 个（清理前 ${t.lockIFile + t.lockRFile + t.lockRDir}）`);
} else {
  console.log(`\n以上为预演。确认无误后执行：node scripts/dev/recycle-bin-lock-clean.mjs --apply`);
}
