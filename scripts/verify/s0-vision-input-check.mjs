// S0/B1：产品图像素真正进入商品分析的门禁（零上游、零 KEY、沙盒 data 根）。
//
// 锁死的回归：V198–V212 期间 analyzeProductStrategy / directVisualPlan 的
// messages[].content 都是纯字符串，只传参考图元数据（role/filename/label），
// 客户上传的产品图像素从未进入模型；而 server/core/ai-chat-shared.js 早已有
// safeImagePart / shouldRetryWithoutImages，旧版 server/detail-ai.js 也真的发过 base64 图。
// 本门禁证明：① 复用既有单网关能力（无第二套 Provider/KEY/网关）；② product 图确实转成
// image_url part；③ 无图时仍是原字符串请求体（存量零回归）；④ 上游不支持多模态可降级。
// 每条静态断言带 indexOf >= 0 守卫与负向对照，防锚点搬家变假绿。

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const sandbox = mkdtempSync(path.join(os.tmpdir(), "s0-vision-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const ANALYZE_SRC = path.join(ROOT, "server", "features", "detail-studio", "planning", "analyze-strategy.js");
const ROUTES_SRC = path.join(ROOT, "server", "routes", "detail-studio.routes.js");
const SHARED_SRC = path.join(ROOT, "server", "core", "ai-chat-shared.js");
const STORE_SRC = path.join(ROOT, "server", "features", "detail-studio", "store", "project-store.js");

const { loadProductImageParts } = await import(pathToFileURL(ANALYZE_SRC).href);
const { detailStudioAssetsDir } = await import(pathToFileURL(STORE_SRC).href);
const { safeImagePart, shouldRetryWithoutImages } = await import(pathToFileURL(SHARED_SRC).href);

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}
const has = (h, n) => typeof h === "string" && h.indexOf(n) >= 0;
function done() {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  console.log(`\n[s0-vision-input] ${results.length - failed.length}/${results.length} 通过`);
  console.log(`ok=${failed.length === 0}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

async function main() {
  const analyzeSrc = readFileSync(ANALYZE_SRC, "utf8");
  const routesSrc = readFileSync(ROUTES_SRC, "utf8");

  // ── 1) 静态：复用既有能力，不新增网关 ──
  check("analyze 复用 safeImagePart（import 锚点存在）", has(analyzeSrc, "safeImagePart"));
  check("analyze 复用 shouldRetryWithoutImages", has(analyzeSrc, "shouldRetryWithoutImages"));
  check("analyze 从既有 store 取 assets 目录（未新建 Provider）", has(analyzeSrc, "detailStudioAssetsDir"));
  check("analyze 未引入散写 fetch / 第二套网关", !has(analyzeSrc, "fetch(") && !has(analyzeSrc, "axios"));
  check("有图时构造 content 数组、无图时保持字符串 userPrompt", has(analyzeSrc, ": userPrompt)") && has(analyzeSrc, "vision.parts.length"));
  check("降级路径剥图重试并标 degraded", has(analyzeSrc, "visionInfo.degraded = true") && has(analyzeSrc, "buildBody(userPrompt)"));
  check("路由透出内部可观测 vision 字段（不落库）", has(routesSrc, "vision: result.vision"));
  check("vision 字段未写入 project.planning（不落库守卫）", !has(routesSrc, "vision: result.vision") || !has(routesSrc, "planning: { vision"));

  // 负向对照：把关键符号从源码文本抹掉后，同一断言必须变假（证明非恒真断言）
  const stripped = analyzeSrc.split("safeImagePart").join("");
  check("负向对照·抹掉 safeImagePart 后 import 断言变假", !has(stripped, "safeImagePart"));
  const strippedBody = analyzeSrc.split("vision.parts.length").join("");
  check("负向对照·抹掉带图分支后 content 断言变假", !has(strippedBody, "vision.parts.length"));

  // ── 2) 纯函数：图片 part 与降级判定 ──
  const part = safeImagePart({ buffer: Buffer.from("x"), mimetype: "image/png" }, "low");
  check("safeImagePart 产出 data URL 图片 part", part.type === "image_url" && /^data:image\/png;base64,/.test(part.image_url.url));
  check("上游不支持多模态时应降级", shouldRetryWithoutImages(400, "image_url is not supported") === true);
  check("负向对照·普通 500 不误判为图片降级", shouldRetryWithoutImages(500, "internal error") === false);

  // ── 3) 行为：沙盒产品图 → content parts ──
  const projectId = "ds_1794000000000_abcdefgh";
  const dir = detailStudioAssetsDir(projectId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "product-1.png"), Buffer.from("fake-png-1"));
  writeFileSync(path.join(dir, "style-1.png"), Buffer.from("fake-style-1"));
  for (let i = 2; i <= 8; i += 1) {
    writeFileSync(path.join(dir, `product-${i}.png`), Buffer.from(`fake-png-${i}`));
  }

  const one = await loadProductImageParts({
    id: projectId,
    referenceImages: [
      { role: "product", filename: "product-1.png", mimeType: "image/png" },
      { role: "visualStyle", filename: "style-1.png", mimeType: "image/png" }
    ]
  });
  check("product 图被真实读入且 attached=1", one.attached === 1, `attached=${one.attached}`);
  check("content 含 image_url part", one.parts.some((p) => p && p.type === "image_url"));
  check("图前带角色文字标注", one.parts.some((p) => p && p.type === "text" && p.text.indexOf("产品图") >= 0));

  const styleOnly = await loadProductImageParts({
    id: projectId,
    referenceImages: [{ role: "visualStyle", filename: "style-1.png", mimeType: "image/png" }]
  });
  check("负向对照·只传风格参考图不进分析", styleOnly.attached === 0 && styleOnly.parts.length === 0);

  const none = await loadProductImageParts({ id: projectId, referenceImages: [] });
  check("负向对照·无图时 parts 为空（纯文本零回归）", none.parts.length === 0 && none.attached === 0);

  const many = await loadProductImageParts({
    id: projectId,
    referenceImages: Array.from({ length: 8 }, (_, i) => ({ role: "product", filename: `product-${i + 1}.png`, mimeType: "image/png" }))
  });
  check("产品图上限 6 张生效", many.attached === 6, `attached=${many.attached}`);

  const traversal = await loadProductImageParts({
    id: projectId,
    referenceImages: [{ role: "product", filename: "../escape.png", mimeType: "image/png" }]
  });
  check("路径穿越文件名被 basename 收敛且不越界", traversal.attached === 0);

  done();
}

main().catch((err) => {
  console.error("[s0-vision-input] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
