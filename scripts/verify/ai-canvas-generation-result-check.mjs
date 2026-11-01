// scripts/verify/ai-canvas-generation-result-check.mjs
// V157 后续修复：画布生成节点「结果地址提取」无头验收。
//
// 根因：服务端 /api/images 返回的 images 是「图像对象」数组
//   （{type:"url", value} 或 {type:"b64_json", value}），
// 而 ai-canvas-generation.js 原先误读 first.url（扁平字段，恒为 undefined）→
// 抛「生成完成，但图片地址为空」，结果节点 src 为空、画布显示不出图（用户报"生图完成但图片不符地址为空"）。
//
// 验收：
//   1) imageSourceFromResult 对 {type:"url",value} / {type:"b64_json"} / 空对象 的提取符合契约；
//   2) ai-canvas-generation.js 已改用 imageSourceFromResult(first) 提取 resultUrl（钉桩防倒退）。
//
// 纯逻辑 + 源码静态断言 <1s，进提交钩子快速子集（--fast）。
// 用法：node scripts/verify/ai-canvas-generation-result-check.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// —— 1) imageSourceFromResult 契约（全 App 共用的真实取址函数）——
let srcOf;
try {
  const mod = await import(pathToFileURL(resolve(ROOT, "src/shared/models.js")).href);
  srcOf = mod.imageSourceFromResult;
} catch (err) {
  check("可导入 imageSourceFromResult（src/shared/models.js）", false, err?.message || String(err));
}
if (typeof srcOf === "function") {
  check("导入 imageSourceFromResult 成功", true);

  const urlImage = srcOf({ type: "url", value: "https://example.com/a.png" });
  check("url 图像取 value", urlImage === "https://example.com/a.png", urlImage);

  const b64Image = srcOf({ type: "b64_json", value: "BASE64DATA", mimeType: "image/png" });
  check("b64_json 拼 data: 前缀", b64Image === "data:image/png;base64,BASE64DATA", b64Image);

  const b64NoMime = srcOf({ type: "b64_json", value: "RAW" });
  check("b64_json 缺 mimeType 回退 image/png", b64NoMime === "data:image/png;base64,RAW", b64NoMime);

  const emptyObj = srcOf({});
  check("空对象返回空串（不再误读 .url）", emptyObj === "", JSON.stringify(emptyObj));

  const nullImage = srcOf(null);
  check("null 返回空串", nullImage === "", JSON.stringify(nullImage));
}

// —— 2) ai-canvas-generation.js 已改用 imageSourceFromResult 提取 resultUrl（钉桩）——
const genSrc = readFileSync(resolve(ROOT, "src/features/ai-canvas/ai-canvas-generation.js"), "utf8");

check("generation.js 导入 imageSourceFromResult",
  /import\s*\{\s*imageSourceFromResult\s*\}\s*from\s*["']\.\.\/\.\.\/shared\/models\.js["']/.test(genSrc),
  "应存在 from \"../../shared/models.js\" 的 imageSourceFromResult 导入");

check("generation.js 用 imageSourceFromResult(first) 取 resultUrl",
  /const\s+resultUrl\s*=\s*imageSourceFromResult\(first\)/.test(genSrc),
  "应出现 const resultUrl = imageSourceFromResult(first)");

check("generation.js 不再依赖 first.url 扁平字段（仅注释可提）",
  !/first\.url\s*[|)\]]/.test(genSrc),
  "源码中不应再出现 first.url 作为取值用法（已改为图像对象取址）");

// —— 汇总 ——
let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail && !r.pass ? " —— " + r.detail : ""}`);
}
console.log(`\n画布生成结果提取验收：失败 ${failed} / 共 ${results.length} 项`);
if (failed > 0) {
  process.exitCode = 1;
}
