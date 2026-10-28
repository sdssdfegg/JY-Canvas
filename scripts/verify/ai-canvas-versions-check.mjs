// V143 MVP-6（生成结果版本管理）无头验收。
//
// 覆盖：追加版本（首版 / 多版 / 超出上限丢最旧）、空地址判失败、当前下标越界夹取、
// 切换版本（含越界夹取 / 空列表不改数据）、版本摘要（是否有上一版 / 下一版），
// 以及一条**源码钉桩**：store 的成功分支必须走 appendVersion，不能退化成直接覆盖 resultUrl
// （一覆盖，版本管理就名存实亡了）。
//
// 纯逻辑、不起服务、不联网、不扣费。

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  MAX_VERSIONS,
  appendVersion,
  currentVersionIndex,
  selectVersion,
  versionList,
  versionSummary
} from "../../src/features/ai-canvas/ai-canvas-versions.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

const url = (n) => `http://relay/r${n}.png`;

// —— 1) 首版 ——
const v1 = appendVersion({}, { url: url(1), usedModel: "tt-image-2", prompt: "第一版提示词" });
check("首版：写入 1 版且当前指向 0",
  versionList(v1).length === 1 && v1.currentIndex === 0 && v1.resultUrl === url(1),
  JSON.stringify({ len: versionList(v1).length, index: v1.currentIndex, url: v1.resultUrl }));
check("首版：状态成功、模型与提示词都留档",
  v1.status === "success" && v1.usedModel === "tt-image-2" && versionList(v1)[0].prompt === "第一版提示词",
  JSON.stringify({ status: v1.status, usedModel: v1.usedModel }));

// —— 2) 连续追加：当前指向始终跟着最新 ——
let data = v1;
for (let i = 2; i <= 3; i += 1) data = appendVersion(data, { url: url(i), usedModel: "tt-image-2", prompt: `第${i}版` });
check("连追两版：共 3 版且当前指向最新（下标 2）",
  versionList(data).length === 3 && data.currentIndex === 2 && data.resultUrl === url(3),
  JSON.stringify({ len: versionList(data).length, index: data.currentIndex, url: data.resultUrl }));
check("旧版本没有被覆盖（仍可取回第 1 版）",
  versionList(data)[0].url === url(1) && versionList(data)[1].url === url(2),
  JSON.stringify(versionList(data).map((item) => item.url)));

// —— 3) 超出上限：丢最旧的一版 ——
let many = {};
for (let i = 1; i <= MAX_VERSIONS + 3; i += 1) many = appendVersion(many, { url: url(i), usedModel: "m", prompt: "" });
check(`超过上限只保留 ${MAX_VERSIONS} 版（丢最旧）`,
  versionList(many).length === MAX_VERSIONS && many.currentIndex === MAX_VERSIONS - 1,
  `len=${versionList(many).length} index=${many.currentIndex}`);
check("被丢掉的正是最早那几版",
  !versionList(many).some((item) => item.url === url(1))
    && versionList(many)[versionList(many).length - 1].url === url(MAX_VERSIONS + 3),
  JSON.stringify(versionList(many).map((item) => item.url)));

// —— 4) 空地址 → 判失败，不产生版本 ——
const empty = appendVersion({ results: [], status: "running" }, { url: "", usedModel: "m", prompt: "" });
check("结果地址为空时判失败并给出中文原因",
  empty.status === "failed" && /结果地址为空/.test(empty.error || ""),
  JSON.stringify({ status: empty.status, error: empty.error }));
check("失败时不写入任何版本", versionList(empty).length === 0, String(versionList(empty).length));

// —— 5) 当前下标越界一律夹取（旧存档 / 手改数据都可能越界）——
check("下标超出上界夹到最后一版",
  currentVersionIndex({ results: [{ url: url(1) }, { url: url(2) }], currentIndex: 99 }) === 1,
  String(currentVersionIndex({ results: [{ url: url(1) }, { url: url(2) }], currentIndex: 99 })));
check("下标为负夹到第一版",
  currentVersionIndex({ results: [{ url: url(1) }, { url: url(2) }], currentIndex: -5 }) === 0,
  String(currentVersionIndex({ results: [{ url: url(1) }, { url: url(2) }], currentIndex: -5 })));
check("没有 currentIndex 时默认最后一版（兼容只看 resultUrl 的旧数据）",
  currentVersionIndex({ results: [{ url: url(1) }, { url: url(2) }] }) === 1,
  String(currentVersionIndex({ results: [{ url: url(1) }, { url: url(2) }] })));

// —— 6) 切换版本 ——
const three = appendVersion(appendVersion(appendVersion({}, { url: url(1), usedModel: "mA" }), { url: url(2), usedModel: "mB" }), { url: url(3), usedModel: "mC" });
const back = selectVersion(three, 0);
check("切回第 1 版：resultUrl 与 usedModel 同步回到该版",
  back.currentIndex === 0 && back.resultUrl === url(1) && back.usedModel === "mA",
  JSON.stringify({ index: back.currentIndex, url: back.resultUrl, model: back.usedModel }));
check("切换不改动版本列表本身",
  versionList(back).length === 3,
  String(versionList(back).length));
check("切换下标越界被夹取（不会指向空）",
  selectVersion(three, 99).currentIndex === 2 && selectVersion(three, -3).currentIndex === 0,
  `${selectVersion(three, 99).currentIndex} / ${selectVersion(three, -3).currentIndex}`);
check("没有版本时切换是安全的（原样返回）",
  selectVersion({}, 3).resultUrl === undefined,
  JSON.stringify(selectVersion({}, 3)));

// —— 7) 版本摘要（驱动 UI 的上一版 / 下一版按钮）——
check("单版时没有上一版也没有下一版",
  (() => {
    const s = versionSummary({ results: [{ url: url(1) }], currentIndex: 0 });
    return s.total === 1 && s.index === 0 && s.hasPrev === false && s.hasNext === false;
  })(),
  JSON.stringify(versionSummary({ results: [{ url: url(1) }], currentIndex: 0 })));
check("停在中间时上下都可切",
  (() => {
    const s = versionSummary({ results: [{ url: url(1) }, { url: url(2) }, { url: url(3) }], currentIndex: 1 });
    return s.hasPrev === true && s.hasNext === true;
  })(),
  "");
check("停在最后一版时没有下一版",
  versionSummary(three).hasNext === false && versionSummary(three).hasPrev === true,
  JSON.stringify(versionSummary(three)));
check("还没有任何结果时摘要为空（不显示版本条）",
  versionSummary({}).total === 0 && versionSummary({}).index === -1,
  JSON.stringify(versionSummary({})));

// —— 8) 源码钉桩：store 成功分支必须走 appendVersion ——
const storeSource = readFileSync(
  path.join(process.cwd(), "src", "features", "ai-canvas", "ai-canvas-store.js"),
  "utf8"
);
check("store 的成功分支用 appendVersion 追加版本（不是直接覆盖 resultUrl）",
  /appendVersion\(/.test(storeSource)
    && !/status:\s*"success",\s*resultUrl:\s*action\.resultUrl/.test(storeSource),
  "");
check("store 暴露了切换版本的 action",
  /SELECT_GENERATION_VERSION/.test(storeSource) && /selectVersion:\s*\(id,\s*index\)/.test(storeSource),
  "");

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
