// V212-R1 P2/P3：详情创作生图 FormData 字段集同构 + 数据边界 + 结果可见性门禁。
//
// 锁死三件 V212 复核发现的问题：
//   ① 「deferAutoSave=1」只写在注释里、form 从未设置 ⇒ 结果污染全局画板 history；
//   ② 工作区请求从不带 baseUrl / 旧私有 form 缺 dispatchMode / referenceMeta ⇒ 两套字段集；
//   ③ 单屏编辑（local-images-generator）仍用私有字段集，且 referenceRoles 在 runTask 丢失。
// 另锁住 P0 的结果可见性与结果目录隔离，防止后续重构回退。
//
// 纯源码静态断言 + Node 原生 FormData 动态构造，零上游、零 KEY、不碰用户 data/。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const SHARED = "src/features/detail/detail-image-form.js";
const OLD_PAGE = "src/features/detail/detail-state.js";
const STUDIO_API = "src/api/detail-studio.js";
const LOCAL_GEN = "server/features/detail-studio/generation/local-images-generator.js";
const ORCH = "server/features/detail-studio/generation/orchestrator.js";
const PANEL = "src/features/detail-studio/generation/GenerationPanel.jsx";
const STITCH = "src/features/detail-studio/generation/StitchPreview.jsx";
const RESULT_IMAGE = "src/features/detail-studio/generation/result-image.js";
const IMAGES_ROUTES = "server/routes/images.routes.js";
const APP_PATHS = "server/core/app-paths.js";
const ROUTING = "src/shared/routing.js";
const GENERATE = "src/features/detail-studio/generation/detail-studio-generate.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}
function formKeys(src) {
  const keys = new Set();
  const re = /form\.(?:set|append)\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  return keys;
}
function diff(a, b) {
  return [...a].filter((k) => !b.has(k));
}
function sameSet(a, b) {
  return a.size === b.size && diff(a, b).length === 0;
}

async function main() {
  const sharedSrc = read(SHARED);
  const oldSrc = read(OLD_PAGE);
  const apiSrc = read(STUDIO_API);
  const localSrc = read(LOCAL_GEN);
  const orchSrc = read(ORCH);
  const panelSrc = read(PANEL);
  const stitchSrc = read(STITCH);
  const resultImageSrc = read(RESULT_IMAGE);
  const imagesSrc = read(IMAGES_ROUTES);
  const pathsSrc = read(APP_PATHS);
  const routingSrc = read(ROUTING);
  const generateSrc = read(GENERATE);

  // ── 1) 字段集同构：共享构造器 / 一键详情 / 服务端单屏编辑 ──
  const sharedKeys = formKeys(sharedSrc);
  // 旧页只取「含 baseUrl 的那一处」生图 form 构造（同一文件还有别处 FormData，
  // 用 baseUrl 锚点 + lastIndexOf 精确定位，indexOf >= 0 守卫防锚点搬家变假绿）。
  const baseIdx = oldSrc.indexOf('form.set("baseUrl"');
  const oldStart = baseIdx >= 0 ? oldSrc.lastIndexOf("const form = new FormData();", baseIdx) : -1;
  const oldEnd = baseIdx >= 0 ? oldSrc.indexOf("generateImages(form)", baseIdx) : -1;
  check("一键详情 form 构造段可定位", oldStart >= 0 && oldEnd > oldStart, `start=${oldStart} end=${oldEnd}`);
  const oldKeys = oldStart >= 0 && oldEnd > oldStart
    ? formKeys(oldSrc.slice(oldStart, oldEnd)) : new Set();
  const localKeys = formKeys(localSrc);

  const expectedBase = [
    "baseUrl", "apiKey", "model", "channelId", "dispatchMode", "prompt",
    "imageSize", "aspectRatio", "n", "source", "referenceMeta", "image"
  ];
  check("共享构造器含 12 个基础字段", expectedBase.every((k) => sharedKeys.has(k)),
    [...sharedKeys].join(","));
  check("一键详情字段集 ⊆ 共享构造器", diff(oldKeys, sharedKeys).length === 0,
    "旧页多出: " + diff(oldKeys, sharedKeys).join(","));
  const sharedOnly = diff(sharedKeys, oldKeys);
  check("共享构造器相对旧页只多 deferAutoSave（负向对照）",
    sharedOnly.length === 1 && sharedOnly[0] === "deferAutoSave", sharedOnly.join(","));
  check("服务端单屏编辑字段集与共享构造器完全一致", sameSet(localKeys, sharedKeys),
    `本地=${[...localKeys].sort().join(",")} 共享=${[...sharedKeys].sort().join(",")}`);
  check("负向对照·漏 dispatchMode 会被字段集断言拦下",
    !sameSet(new Set(expectedBase.filter((k) => k !== "dispatchMode")), sharedKeys));

  // ── 2) deferAutoSave 真正落地（V212 只有注释） ──
  const setIdx = sharedSrc.indexOf('if (deferAutoSave) form.set("deferAutoSave", "1");');
  check("共享构造器真正设置 deferAutoSave=1", setIdx >= 0, `idx=${setIdx}`);
  check("buildDetailStudioImageForm 传 deferAutoSave: true",
    apiSrc.indexOf("deferAutoSave: true") >= 0);
  check("负向对照·一键详情不设置 deferAutoSave（旧页行为不变）",
    !oldSrc.includes('form.set("deferAutoSave"'));
  check("服务端单屏编辑也保持 deferAutoSave=1",
    localSrc.includes('form.set("deferAutoSave", "1")'));
  check("注释与实现口径一致（不再声称但未设置）",
    apiSrc.indexOf("deferAutoSave=1") >= 0 && setIdx >= 0);

  // ── 3) baseUrl / dispatchMode / referenceMeta 不再缺失 ──
  check("共享构造器总是发送 baseUrl（不再是 if (baseUrl)）",
    sharedSrc.indexOf('form.set("baseUrl", String(baseUrl ?? ""));') >= 0
    && sharedSrc.indexOf("if (baseUrl) form.set") < 0);
  check("服务端单屏编辑发送 baseUrl", localSrc.includes('form.set("baseUrl", "")'));
  check("共享构造器发送 dispatchMode", sharedSrc.includes('form.set("dispatchMode", fields.dispatchMode)'));
  check("服务端单屏编辑发送 dispatchMode=manual", localSrc.includes('form.set("dispatchMode", "manual")'));
  check("routingFields 当前口径为 manual（锚点搬家判红）",
    routingSrc.indexOf('dispatchMode: "manual"') >= 0);
  check("服务端单屏编辑构造 referenceMeta", localSrc.includes('form.set("referenceMeta", JSON.stringify('));
  check("共享构造器构造 referenceMeta", sharedSrc.includes('form.set("referenceMeta", JSON.stringify(meta))'));
  check("runTask 透传 referenceRoles（此前角色丢失）", orchSrc.includes("referenceRoles: current.referenceRoles || []"));
  check("前端还原参考图真实文件名（Blob 无 name 的修复）",
    generateSrc.indexOf("new File([blob], filename") >= 0);

  // ── 4) 动态构造 FormData：确认字段与值真实存在，而非只写在源码里 ──
  const { buildDetailImageForm } = await import("../../src/features/detail/detail-image-form.js");
  const studioForm = await buildDetailImageForm({
    apiKey: "  test-key  ", prompt: "冻结提示词", model: "tt-image-2.6",
    channelId: "", source: "detail-studio", deferAutoSave: true
  });
  check("动态·工作区 form 有 deferAutoSave=1", studioForm.get("deferAutoSave") === "1",
    String(studioForm.get("deferAutoSave")));
  check("动态·工作区 form 有 baseUrl 字段", studioForm.get("baseUrl") === "",
    String(studioForm.get("baseUrl")));
  check("动态·dispatchMode 为 manual", studioForm.get("dispatchMode") === "manual");
  check("动态·prompt 与冻结提示词字节一致", studioForm.get("prompt") === "冻结提示词");
  check("动态·apiKey 经 normalizeApiKeyInput 归一化", studioForm.get("apiKey") === "test-key",
    String(studioForm.get("apiKey")));
  const oldForm = await buildDetailImageForm({ apiKey: "k", prompt: "p", source: "detail-main" });
  check("负向对照·detail-main form 不含 deferAutoSave", oldForm.get("deferAutoSave") === null);
  check("负向对照·detail-main form 仍含 baseUrl", oldForm.get("baseUrl") === "");

  // ── 5) deferAutoSave 下结果图 URL 仍可显示（display-cache 与 autoSave 解耦） ──
  const deferIdx = imagesSrc.indexOf("const deferAutoSave =");
  const displayIdx = imagesSrc.indexOf("historyItemForImmediateDisplay(", deferIdx + 1);
  const autoSaveIdx = imagesSrc.indexOf("if (!deferAutoSave)", deferIdx + 1);
  check("images.routes 的 deferAutoSave 锚点可定位", deferIdx >= 0 && displayIdx >= 0 && autoSaveIdx >= 0,
    `defer=${deferIdx} display=${displayIdx} autoSave=${autoSaveIdx}`);
  check("display-cache 落盘在 autoSave 分支之外（deferAutoSave 仍有 /api/history-image URL）",
    displayIdx > deferIdx && autoSaveIdx > displayIdx);
  check("autoSavePending 受 deferAutoSave 控制", imagesSrc.includes("autoSavePending: !deferAutoSave"));

  // ── 6) 结果目录隔离 + 结果可见性（P0 成果不回退） ──
  check("结果图落工作区独立目录", orchSrc.includes("detailStudioGenerationResultsDir"));
  check("app-paths 独立目录位于 detail-studio/generation 下",
    pathsSrc.indexOf('path.join(detailStudioGenerationDir, "results")') >= 0
    || pathsSrc.indexOf('"detail-studio", "generation", "results"') >= 0);
  check("负向对照·独立目录不是 7 天 TTL 的 data/results",
    pathsSrc.indexOf("detailStudioGenerationResultsDir") >= 0
    && orchSrc.indexOf("resultDir") < 0);
  check("GenerationPanel 渲染结果图 <img>", panelSrc.includes("<img"));
  check("GenerationPanel 复用共享 resultImageSrc", panelSrc.includes("resultImageSrc"));
  check("共享 helper 兼容 resultRef.localUrl / value 相对 URL",
    resultImageSrc.includes("ref.localUrl || ref.value") && resultImageSrc.includes("task.resultRef"));
  check("拼图预览为客户端 canvas（不依赖服务端 sharp）",
    stitchSrc.includes("canvas") || stitchSrc.includes("drawImage"));
  check("负向对照·结果可见性断言不是空壳", panelSrc.indexOf("<img") >= 0 && panelSrc.includes("STATUS_LABEL"));
}

try {
  await main();
} catch (err) {
  check("门禁运行无异常", false, err && err.message ? err.message : String(err));
} finally {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  }
  console.log(`\n[detail-studio-image-form-parity] ${results.length - failed.length}/${results.length} 通过`);
  console.log(`ok=${failed.length === 0}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}
