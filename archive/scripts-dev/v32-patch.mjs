// V32 渠道上传约束收口 —— 锚点打补丁（严格保 CRLF / LF）
// 仅本单内部使用，不入库。
import fs from "node:fs";

const ROOT = process.cwd();

// 读：utf8 解码（保中文）+ 检测原始行尾，按原始行尾切分/回写。
function load(filePath) {
  const abs = filePath.startsWith("/") || /^[A-Za-z]:/.test(filePath) ? filePath : `${ROOT}/${filePath}`;
  const text = fs.readFileSync(abs, "utf8");
  const sep = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(sep);
  return { abs, lines, sep, text };
}
function save({ abs, lines, sep }) {
  fs.writeFileSync(abs, lines.join(sep), "utf8");
}

// 在 lines 中定位「整行等于 target」的下标（精确匹配，命中必须 == 1）
function idxExact(lines, target, label) {
  const hits = [];
  lines.forEach((l, i) => { if (l === target) hits.push(i); });
  if (hits.length !== 1) throw new Error(`[${label}] 精确命中数=${hits.length}（期望 1）: ${JSON.stringify(target).slice(0, 80)}`);
  return hits[0];
}
// 定位「startsWith prefix」的下标（命中必须 == 1）
function idxStarts(lines, prefix, label) {
  const hits = [];
  lines.forEach((l, i) => { if (l.startsWith(prefix)) hits.push(i); });
  if (hits.length !== 1) throw new Error(`[${label}] startsWith 命中数=${hits.length}（期望 1）: ${prefix.slice(0, 80)}`);
  return hits[0];
}

// ---------------------------------------------------------------- §4.1 image-input.js (LF)
{
  const f = load("src/shared/image-input.js");
  const j = idxStarts(f.lines, "/** 文件是否算", "image-input 锚点");
  const block = [
    "// 渠道上传约束：发图到上游之前，把图压到什么规格。",
    "//",
    "// 这三个值**不是产品选择，是上游渠道的客观限制** —— 服务端图片渠道只有一条管线",
    "// （`server/core/image-channel-candidates.js` 里的备用渠道只做当次故障兜底），",
    "// 因此它们必须全站单一真源：批量侧与快捷侧共用同一组值，上游调整时一起变。",
    "//",
    "// ⚠️ 本次只收口「约束值」。两侧的压缩算法（`compressOriginalImageFile` 与",
    "// `compressImageForChannel`）已经各自演化，不要顺手合并 —— 那是另一笔单。",
    "export const CHANNEL_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;",
    "export const CHANNEL_UPLOAD_TARGET_BYTES = 3.75 * 1024 * 1024;",
    "export const CHANNEL_UPLOAD_MAX_SIDE = 3072;"
  ];
  // 在第 17 行（文件头注释与正文之间的空行）之后插入 ⇒ 即插在正文首行 /** 之前。
  f.lines.splice(j, 0, ...block);
  save(f);
  console.log("✓ image-input.js 插入完成");
}

// ---------------------------------------------------------------- §4.2 outfit-panels.jsx (CRLF)
{
  const f = load("src/features/outfit/outfit-panels.jsx");
  // 改一：删除第 74-76 行三个常量（连续三行）
  const c1 = idxExact(f.lines, "export const CHANNEL_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;", "panels const1");
  if (f.lines[c1 + 1] !== "export const CHANNEL_UPLOAD_TARGET_BYTES = 3.75 * 1024 * 1024;")
    throw new Error("[panels] const2 不在预期位置");
  if (f.lines[c1 + 2] !== "export const CHANNEL_UPLOAD_MAX_SIDE = 3072;")
    throw new Error("[panels] const3 不在预期位置");
  f.lines.splice(c1, 3);
  // 删完：VIDEO_REFERENCE_MAX_BYTES 之后应直接是 PREPROCESS_OPTIONS（无连续空行）
  const after = f.lines[c1];
  if (!after.startsWith("export const PREPROCESS_OPTIONS"))
    throw new Error(`[panels] 删常量后下一行异常: ${after.slice(0, 60)}`);

  // 改二：把三个名字并入 image-input 这个 import 块（在 import { 之后插入）
  const close = idxExact(f.lines, '} from "../../shared/image-input.js";', "panels import close");
  // 向前找最近的 import {
  let open = close;
  while (open >= 0 && f.lines[open] !== "import {") open -= 1;
  if (open < 0) throw new Error("[panels] 找不到 import {");
  f.lines.splice(open + 1, 0,
    "  CHANNEL_UPLOAD_LIMIT_BYTES,",
    "  CHANNEL_UPLOAD_MAX_SIDE,",
    "  CHANNEL_UPLOAD_TARGET_BYTES,");
  save(f);
  console.log("✓ outfit-panels.jsx 删除常量 + 并入 import 完成");
}

// ---------------------------------------------------------------- §4.3 reference-upload.js (CRLF)
{
  const f = load("src/features/upload/reference-upload.js");
  // 改一：删除三个常量及其穿插空行，只保留一个空行分隔到 referenceControlText
  const fnIdx = idxStarts(f.lines, "export function referenceControlText", "ref fn");
  let i = fnIdx - 1;
  while (i >= 0 && (f.lines[i].trim() === "" || f.lines[i].startsWith("export const CHANNEL_UPLOAD_"))) i -= 1;
  // i 指向最后一个要保留的行（工厂 `}`）；把 i+1..fnIdx-1 整段替换为单一空行
  const regionStart = i + 1;
  const regionEnd = fnIdx - 1; // 含
  f.lines.splice(regionStart, regionEnd - regionStart + 1, "");
  // 校验：fnIdx 现位置前一行为空，且前一行的再前一行是工厂 `}`
  const newFnIdx = f.lines.findIndex((l) => l.startsWith("export function referenceControlText"));
  if (f.lines[newFnIdx - 1] !== "")
    throw new Error(`[ref] fn 前应为单一空行，实际: ${JSON.stringify(f.lines[newFnIdx - 1])}`);

  // 改二：单行 import 并入三个名字
  const impIdx = idxExact(f.lines,
    'import { addFilesByRole, imageBitmapFromFile, imageExtension, imageFilesFromList, removeFilesByRole } from "../../shared/image-input.js";',
    "ref import");
  f.lines[impIdx] = 'import { CHANNEL_UPLOAD_LIMIT_BYTES, CHANNEL_UPLOAD_MAX_SIDE, CHANNEL_UPLOAD_TARGET_BYTES, addFilesByRole, imageBitmapFromFile, imageExtension, imageFilesFromList, removeFilesByRole } from "../../shared/image-input.js";';
  save(f);
  console.log("✓ reference-upload.js 删除常量 + 并入 import 完成");
}

// ---------------------------------------------------------------- §4.4 outfit-top.js (CRLF)
{
  const f = load("src/features/outfit/outfit-top.js");
  // 改一：从 ./outfit-panels.jsx 摘掉三个名字
  const pIdx = idxExact(f.lines,
    'import { CHANNEL_UPLOAD_LIMIT_BYTES, CHANNEL_UPLOAD_MAX_SIDE, CHANNEL_UPLOAD_TARGET_BYTES, DEFAULT_PREPROCESS_MODE, MAX_UPLOAD_IMAGES, compressOriginalImageFile, constrainLocalEditRect, loadImageFromUrl, makeId, padImageFile, processImageFile, ratioParts, resolveCropSourceRect } from "./outfit-panels.jsx";',
    "top panels import");
  f.lines[pIdx] = 'import { DEFAULT_PREPROCESS_MODE, MAX_UPLOAD_IMAGES, compressOriginalImageFile, constrainLocalEditRect, loadImageFromUrl, makeId, padImageFile, processImageFile, ratioParts, resolveCropSourceRect } from "./outfit-panels.jsx";';
  // 改二：落到 image-input.js 这一行
  const iIdx = idxExact(f.lines,
    'import { imageBitmapFromBlob, imageBitmapFromFile, imageExtension } from "../../shared/image-input.js";',
    "top image-input import");
  f.lines[iIdx] = 'import { CHANNEL_UPLOAD_LIMIT_BYTES, CHANNEL_UPLOAD_MAX_SIDE, CHANNEL_UPLOAD_TARGET_BYTES, imageBitmapFromBlob, imageBitmapFromFile, imageExtension } from "../../shared/image-input.js";';
  save(f);
  console.log("✓ outfit-top.js 两处 import 调整完成");
}

// ---------------------------------------------------------------- §4.5 verify script (CRLF)
{
  const f = load("scripts/verify/local-edit-base-file-check.mjs");
  // 改一：在 REFERENCE_UPLOAD_FILE 行之后加 SHARED_IMAGE_INPUT_FILE
  const rIdx = idxExact(f.lines,
    'const REFERENCE_UPLOAD_FILE = path.join(ROOT, "src", "features", "upload", "reference-upload.js");',
    "verify ref file");
  f.lines.splice(rIdx + 1, 0,
    'const SHARED_IMAGE_INPUT_FILE = path.join(ROOT, "src", "shared", "image-input.js");');
  // 改二：在 referenceUploadSrc 读取行之后加 imageInputSrc 读取
  const rsIdx = idxExact(f.lines,
    'const referenceUploadSrc = readFileSync(REFERENCE_UPLOAD_FILE, "utf8");',
    "verify ref src");
  f.lines.splice(rsIdx + 1, 0,
    'const imageInputSrc = readFileSync(SHARED_IMAGE_INPUT_FILE, "utf8");');
  // 改三：替换旧 check 块
  const oldStart = idxStarts(f.lines, "// 这个常量现在有**两份**", "verify old check start");
  // 旧块止于 `  "3072");`
  let oldEnd = oldStart;
  while (oldEnd < f.lines.length && !f.lines[oldEnd].startsWith('  "3072");')) oldEnd += 1;
  if (oldEnd >= f.lines.length) throw new Error("[verify] 未找到旧 check 块结束");
  const newBlock = [
    "// V32 收口：这组约束已并入 `src/shared/image-input.js` 单一真源。",
    "// 断言拆成三段而不是一段：",
    "//   ① 真源处的值仍是 3072（探针反例尺寸必须跟着线上压缩走，这是这条断言存在的理由）；",
    "//   ② 两个消费方**不再**留本地定义 —— 防止将来有人觉得\"少个 import 麻烦\"又复制回去；",
    "//   ③ 两个消费方确实还在引用这个名字 —— 证明删完仍然接线，不是\"删了但没人用\"。",
    "check(\"上传副本长边上限仍是 3072（探针反例尺寸与线上压缩一致）\",",
    "  /export const CHANNEL_UPLOAD_MAX_SIDE = 3072;/.test(imageInputSrc)",
    "    && !/export const CHANNEL_UPLOAD_MAX_SIDE\\b/.test(outfitPanelsSrc)",
    "    && !/export const CHANNEL_UPLOAD_MAX_SIDE\\b/.test(referenceUploadSrc)",
    "    && /CHANNEL_UPLOAD_MAX_SIDE\\b/.test(outfitPanelsSrc)",
    "    && /CHANNEL_UPLOAD_MAX_SIDE\\b/.test(referenceUploadSrc),",
    "  \"3072\");"
  ];
  f.lines.splice(oldStart, oldEnd - oldStart + 1, ...newBlock);
  save(f);
  console.log("✓ verify 脚本更新完成");
}

// ---------------------------------------------------------------- 终检：不得出现 \r\r\n
function scanCrCr(path) {
  const buf = fs.readFileSync(path);
  let count = 0;
  for (let i = 0; i + 3 <= buf.length; i += 1) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0d && buf[i + 2] === 0x0a) count += 1;
  }
  return count;
}
const targets = [
  "src/shared/image-input.js",
  "src/features/outfit/outfit-panels.jsx",
  "src/features/upload/reference-upload.js",
  "src/features/outfit/outfit-top.js",
  "scripts/verify/local-edit-base-file-check.mjs"
];
let bad = 0;
for (const t of targets) {
  const c = scanCrCr(`${ROOT}/${t}`);
  if (c !== 0) { bad += 1; console.error(`✗ ${t} 含 \\r\\r\\n = ${c}`); }
}
if (bad === 0) console.log("✓ 五个文件 \\r\\r\\n 计数均为 0");
else { console.error("CRCR 异常，中止"); process.exit(1); }
console.log("全部补丁完成。");
