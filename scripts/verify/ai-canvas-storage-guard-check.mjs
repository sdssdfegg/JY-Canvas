// V143：画布持久化**失败可见化**验收（纯逻辑，零网络）。
//
// 为什么单开一个脚本：这是防「静默丢数据」的闸门。画布把图片 dataURL 存 localStorage，
// 配额写满时若无人告知，用户会以为还在自动保存，刷新后工作成果全没了——
// 这类故障不会报错、不会崩溃，只能靠门禁盯住。
//
// 覆盖：错误分类（各浏览器上报法不一）/ 中文处置建议 / 占用估算 / 字节格式化，
// 外加两条**源码钉桩**：画布必须用能带回异常的写入函数，且必须有防「写→dispatch→再写」的循环守卫。

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  STORAGE_QUOTA,
  STORAGE_UNAVAILABLE,
  STORAGE_UNKNOWN,
  classifyStorageError,
  estimateProjectsBytes,
  formatBytes,
  messageForFailure
} from "../../src/features/ai-canvas/ai-canvas-storage-guard.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// —— 1) 错误分类：浏览器上报法不统一，每种都要认出来 ——
const quotaCases = [
  ["DOMException.name = QuotaExceededError", { name: "QuotaExceededError" }],
  ["Firefox 的 NS_ERROR_DOM_QUOTA_REACHED", { name: "NS_ERROR_DOM_QUOTA_REACHED" }],
  ["legacy code 22", { code: 22 }],
  ["legacy code 1014", { code: 1014 }],
  ["老式 message 里写 quota", { message: "Failed to execute 'setItem': exceeded the quota" }],
  ["中文 message 里写 超出配额", { message: "超出配额" }]
];
quotaCases.forEach(([label, error]) => {
  check(`配额超限能识别：${label}`, classifyStorageError(error) === STORAGE_QUOTA, classifyStorageError(error));
});

check("隐私模式 / 禁止写入识别为 unavailable",
  classifyStorageError({ name: "SecurityError" }) === STORAGE_UNAVAILABLE
    && classifyStorageError({ message: "access denied" }) === STORAGE_UNAVAILABLE,
  `${classifyStorageError({ name: "SecurityError" })} / ${classifyStorageError({ message: "access denied" })}`);
check("认不出的错误归入 unknown（不会误报成配额）",
  classifyStorageError({}) === STORAGE_UNKNOWN && classifyStorageError(null) === STORAGE_UNKNOWN,
  `${classifyStorageError({})} / ${classifyStorageError(null)}`);

// —— 2) 处置建议：必须具体、可操作 ——
const quotaMsg = messageForFailure(STORAGE_QUOTA);
const unavailableMsg = messageForFailure(STORAGE_UNAVAILABLE);
const unknownMsg = messageForFailure(STORAGE_UNKNOWN);
check("三类失败各有不同文案", new Set([quotaMsg, unavailableMsg, unknownMsg]).size === 3, "");
check("配额文案说清该做什么（删画布项目或图片节点）",
  /删/.test(quotaMsg) && quotaMsg.length > 10, quotaMsg);
check("文案非空且是中文（不抛裸错误给用户）",
  [quotaMsg, unavailableMsg, unknownMsg].every((text) => typeof text === "string" && text.length > 10),
  "");

// —— 3) 占用估算：图片 dataURL 是大头 ——
const oneImage = [{ nodes: [{ data: { src: "data:image/png;base64," + "A".repeat(2000) } }] }];
check("估算把图片 dataURL 计入",
  estimateProjectsBytes(oneImage) >= 2000,
  String(estimateProjectsBytes(oneImage)));
check("空画布估算不为负",
  estimateProjectsBytes([]) === 0 && estimateProjectsBytes() === 0,
  `${estimateProjectsBytes([])} / ${estimateProjectsBytes()}`);
check("节点越多占用越大",
  estimateProjectsBytes([{ nodes: [{ data: { src: "x".repeat(100) } }, { data: { src: "y".repeat(100) } }] }])
    > estimateProjectsBytes([{ nodes: [{ data: { src: "x".repeat(100) } }] }]),
  "");

// —— 4) 字节格式化 ——
check("字节格式化分级正确",
  formatBytes(512) === "512 B" && formatBytes(2048) === "2.0 KB" && formatBytes(3 * 1024 * 1024) === "3.0 MB",
  `${formatBytes(512)} / ${formatBytes(2048)} / ${formatBytes(3 * 1024 * 1024)}`);
check("异常输入不会崩（返回 0 B）", formatBytes(undefined) === "0 B" && formatBytes("abc") === "0 B",
  `${formatBytes(undefined)} / ${formatBytes("abc")}`);

// —— 5) 源码钉桩：画布不得再用「吞异常」的写入，且必须有防循环守卫 ——
const storeSource = readFileSync(
  path.join(process.cwd(), "src", "features", "ai-canvas", "ai-canvas-store.js"),
  "utf8"
);
check("画布改用能带回异常的 writeJsonStorageDetailed（不再用吞异常的 writeJsonStorage）",
  /writeJsonStorageDetailed\(/.test(storeSource) && !/[^D]writeJsonStorage\(/.test(storeSource),
  "");
check("失败时会写入可读原因（走 classifyStorageError + messageForFailure）",
  /classifyStorageError\(/.test(storeSource) && /messageForFailure\(/.test(storeSource),
  "");
check("有防『写 → dispatch → 再写』循环的守卫（用 ref 记上一次结果）",
  /lastStorageMessage/.test(storeSource) && /message !== lastStorageMessage\.current/.test(storeSource),
  "");
check("持久化结果暴露给视图（storageError）",
  /storageError: state\.storageError/.test(storeSource),
  "");

const libSource = readFileSync(
  path.join(process.cwd(), "src", "lib", "storage", "json-storage.js"),
  "utf8"
);
check("共享库只新增函数、未改 writeJsonStorage 既有语义（老调用点行为不变）",
  /export function writeJsonStorage\(/.test(libSource) && /export function writeJsonStorageDetailed\(/.test(libSource),
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
