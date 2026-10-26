#!/usr/bin/env node
/**
 * P0 实验探针（V128 §1.5）——高保真换装能力体系阶段 0 模型能力实验工具
 *
 * 零依赖（Node 22 内置 fetch/FormData/zlib）。用途：
 *   --dry-run                校验配置/样本/预算，不发起任何调用
 *   --make-coarse-mask <ID>  为样本生成躯干椭圆粗掩膜（mask-garment/mask-body）
 *   --report                 汇总 eval/results 下已跑结果
 *   --budget-status          查看配额消耗
 *   --only <EXP>             只跑指定实验组（如 --only E1）
 *
 * 红线（封装规则框架①）：
 *   - KEY 只从环境变量 JINGYIN_PROBE_API_KEY 读取，仅在内存中随请求传出；
 *   - 任何日志/结果文件/meta.json 一律不含 KEY（sanitize 深删 + 字段白名单）；
 *   - 预算硬顶：budget-state.json 中 used >= cap 时拒绝发起调用（触顶即停）。
 *
 * 用法示例：
 *   node scripts/ai-tryon/p0-probe.mjs --dry-run
 *   node scripts/ai-tryon/p0-probe.mjs --make-coarse-mask s01
 *   JINGYIN_PROBE_API_KEY=... node scripts/ai-tryon/p0-probe.mjs --only E1
 */
import { mkdir, writeFile, rename, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const EVAL_DIR = join(REPO, "docs/ai-tryon/eval");
const SAMPLES_DIR = join(EVAL_DIR, "samples");
const RESULTS_DIR = join(EVAL_DIR, "results");
const CASES_FILE = join(EVAL_DIR, "p0-cases.json");
const BUDGET_FILE = join(EVAL_DIR, "budget-state.json");

const DEFAULT_BASE = "http://127.0.0.1:8787";
const DEFAULT_TIMEOUT_MS = 240000;
// P0-B 探针补丁：服务端强制要求 channelId（server/channel.js:199 missing_channel），
// 而用例未带 channel。按「与 app 默认渠道一致」解析——各模型取配置里排第一的公开渠道（云枢）。
const DEFAULT_CHANNEL_BY_MODEL = {
  "tt-image-2.5": "silent-tt25-line-06",   // Origin（TT2.5 第二线路，¥0.10；用户裁定不用云枢）
  "nano-banana-pro": "silent-pro-line-01", // 云枢（香蕉Pro 默认首线路，¥0.14）
};
const REDACT_KEYS = new Set(["apikey", "key", "token", "authorization", "secret", "password"]);

// ---------- CLI ----------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const dryRun = flag("--dry-run");
const wantReport = flag("--report");
const wantBudget = flag("--budget-status");
const coarseMaskFor = opt("--make-coarse-mask");
const onlyExp = opt("--only");
const base = (opt("--base", process.env.P0_PROBE_BASE || DEFAULT_BASE)).replace(/\/+$/, "");
const timeoutMs = Number(opt("--timeout", process.env.P0_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

// ---------- 小工具 ----------
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? "<redacted>" : sanitize(v);
    }
    return out;
  }
  return value;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** 灰度 PNG 编码（8bit，color type 0） */
function encodeGrayPng(width, height, gray /* Uint8Array w*h */) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0; // filter none
    gray.subarray(y * width, (y + 1) * width).forEach((v, x) => { raw[y * (width + 1) + 1 + x] = v; });
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off < buf.length - 9) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      const segLen = buf.readUInt16BE(off + 2);
      off += 2 + segLen;
    }
  }
  throw new Error("无法解析图片尺寸（仅支持 PNG/JPEG）");
}

function ellipseMask(width, height, cx, cy, rx, ry, invert = false) {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
      gray[y * width + x] = (inside !== invert) ? 255 : 0;
    }
  }
  return gray;
}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || "");
  return m ? m[1].toLowerCase() : "png";
}

// ---------- 预算 ----------
async function loadBudget(cap) {
  const state = await readJson(BUDGET_FILE, null);
  if (!state || typeof state.used !== "number") {
    return { cap, used: 0, runs: [] };
  }
  state.cap = cap;
  return state;
}

// ---------- 主流程 ----------
async function main() {
  const casesDoc = await readJson(CASES_FILE, null);
  if (!casesDoc) {
    warn(`未找到 cases 文件：${CASES_FILE}`);
    process.exitCode = 1;
    return;
  }
  const cap = Number(casesDoc.cap || 50);
  let cases = casesDoc.cases || [];
  if (onlyExp) cases = cases.filter((c) => c.exp === onlyExp);
  if (!cases.length) {
    warn(onlyExp ? `--only ${onlyExp} 无用例` : "cases 为空");
    process.exitCode = 1;
    return;
  }

  const budget = await loadBudget(cap);

  if (wantBudget) {
    log(`配额：${budget.used}/${budget.cap}（剩余 ${budget.cap - budget.used}）`);
    return;
  }
  if (wantReport) {
    await printReport();
    return;
  }

  if (coarseMaskFor) {
    await makeCoarseMask(coarseMaskFor);
    return;
  }

  // 样本与配置校验
  const problems = [];
  const neededSamples = [...new Set(cases.map((c) => c.sample))];
  for (const s of neededSamples) {
    const dir = join(SAMPLES_DIR, s);
    for (const f of ["a.jpg", "b.jpg"]) {
      if (!existsSync(join(dir, f))) problems.push(`缺样本文件：samples/${s}/${f}`);
    }
    for (const c of cases.filter((x) => x.sample === s && x.mask)) {
      if (!existsSync(join(dir, c.mask))) {
        problems.push(`缺掩膜：samples/${s}/${c.mask}（可用 --make-coarse-mask ${s} 生成）`);
      }
    }
  }
  if (String(casesDoc.prompts?.A || "").startsWith("TODO")) {
    problems.push("prompts.A 仍是 TODO——必须填入用户当前提示词原文（A 组基线=真现状）");
  }
  if (budget.used >= budget.cap) problems.push(`预算已用尽（${budget.used}/${budget.cap}），禁止再发起调用`);

  const remaining = budget.cap - budget.used;
  log(`基线地址：${base}`);
  log(`用例数：${cases.length} ｜ 配额：${budget.used}/${budget.cap}（剩余 ${remaining}）`);

  if (dryRun) {
    if (problems.length) {
      warn("dry-run 发现问题：");
      problems.forEach((p) => warn(`  - ${p}`));
      process.exitCode = 1;
      return;
    }
    log("dry-run 通过（未发起任何调用）。计划：");
    for (const c of cases) log(`  [${c.exp}] ${c.id}  sample=${c.sample}  model=${c.model}  mask=${c.mask || "-"}`);
    return;
  }

  if (problems.length) {
    warn("开跑前校验失败：");
    problems.forEach((p) => warn(`  - ${p}`));
    process.exitCode = 1;
    return;
  }
  if (cases.length > remaining) {
    warn(`用例数(${cases.length})超过剩余配额(${remaining})——已拒绝。请分批（--only）或提高预算后由用户重新批准。`);
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.JINGYIN_PROBE_API_KEY || "";
  if (!apiKey) {
    warn("缺少环境变量 JINGYIN_PROBE_API_KEY（运行时传入，禁落盘）。dry-run 不需要 KEY。");
    process.exitCode = 1;
    return;
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  let done = 0;
  for (const c of cases) {
    if (budget.used >= budget.cap) {
      warn(`触顶即停：${budget.used}/${budget.cap}，剩余用例未执行：${cases.slice(done).map((x) => x.id).join(", ")}`);
      break;
    }
    await runCase(c, casesDoc, budget);
    done++;
  }
  log(`\n完成 ${done}/${cases.length} ｜ 配额 ${budget.used}/${budget.cap}`);
  await printReport();
}

async function makeCoarseMask(sampleId) {
  const dir = join(SAMPLES_DIR, sampleId);
  const buf = await readFile(join(dir, "a.jpg"));
  const { width, height } = imageSize(buf);
  const garment = ellipseMask(width, height, width * 0.5, height * 0.6, width * 0.3, height * 0.28, false);
  const body = ellipseMask(width, height, width * 0.5, height * 0.6, width * 0.3, height * 0.28, true);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "mask-garment.png"), encodeGrayPng(width, height, garment));
  await writeFile(join(dir, "mask-body.png"), encodeGrayPng(width, height, body));
  log(`已生成粗掩膜（躯干椭圆，语义未定=实验对象）：samples/${sampleId}/mask-garment.png（椭圆内白）+ mask-body.png（椭圆内黑）`);
  warn("注意：粗掩膜只验证「模型是否遵守 mask 边界」，不代表解剖级精确；精确掩膜属 P3。");
}

async function runCase(c, casesDoc, budget) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const outDir = join(RESULTS_DIR, c.id);
  await mkdir(outDir, { recursive: true });
  const meta = {
    caseId: c.id, exp: c.exp, sample: c.sample, model: c.model,
    mask: c.mask || null, note: c.note || "", startedAt,
    promptSource: c.prompt, promptChars: 0, aspectRatio: c.aspectRatio || null, imageSize: c.imageSize || null,
  };
  try {
    const sampleDir = join(SAMPLES_DIR, c.sample);
    const [aBuf, bBuf] = [await readFile(join(sampleDir, "a.jpg")), await readFile(join(sampleDir, "b.jpg"))];
    const prompt = String(casesDoc.prompts?.[c.prompt] || "");
    meta.promptChars = prompt.length;

    const defaults = casesDoc.defaults || {};
    const payload = {
      taskId: `p0-${c.id}`,
      apiKey: process.env.JINGYIN_PROBE_API_KEY,
      model: c.model,
      channelId: c.channelId || DEFAULT_CHANNEL_BY_MODEL[c.model] || "",
      dispatchMode: "manual",
      prompt,
      pageName: defaults.pageName || "批量换装",
      workflowMode: defaults.workflowMode || "outfit",
      uploadLabels: defaults.uploadLabels || ["模特A", "服装B"],
      smartIntervention: defaults.smartIntervention === true,
      imageSize: c.imageSize || defaults.imageSize || undefined,
      aspectRatio: c.aspectRatio || undefined,
      pairingMode: "sequential",
    };
    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    form.append("image", new File([aBuf], `a_${c.sample}.jpg`, { type: "image/jpeg" }));
    form.append("image", new File([bBuf], `b_${c.sample}.jpg`, { type: "image/jpeg" }));
    if (c.mask) {
      const maskBuf = await readFile(join(sampleDir, c.mask));
      form.append("mask", new File([maskBuf], `${c.sample}_${c.mask}`, { type: "image/png" }));
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${base}/api/generate-outfit`, { method: "POST", body: form, signal: ac.signal });
    clearTimeout(timer);
    meta.httpStatus = res.status;
    const text = await res.text();
    let payloadJson = null;
    try { payloadJson = JSON.parse(text); } catch { meta.rawHead = text.slice(0, 500); }
    if (payloadJson) {
      meta.ok = payloadJson.ok === true;
      meta.message = payloadJson.message || null;
      meta.imageCount = countImages(payloadJson);
      meta.imageRefs = extractImageRefs(payloadJson).slice(0, 20);
      await writeJsonAtomic(join(outDir, "response.json"), sanitize(payloadJson));
      await downloadImages(meta.imageRefs, outDir);
    } else {
      meta.ok = false;
    }
  } catch (err) {
    meta.ok = false;
    meta.error = String(err?.message || err).slice(0, 500);
  } finally {
    meta.ms = Date.now() - t0;
    meta.finishedAt = new Date().toISOString();
    await writeJsonAtomic(join(outDir, "meta.json"), meta);
    budget.used += 1;
    budget.runs.push({ ts: meta.finishedAt, caseId: c.id, exp: c.exp, sample: c.sample, model: c.model, ok: Boolean(meta.ok), ms: meta.ms });
    await writeJsonAtomic(BUDGET_FILE, budget);
    log(`  [${c.exp}] ${c.id} → ${meta.ok ? "ok" : "FAIL"}（${meta.ms}ms，http ${meta.httpStatus ?? "-"}）配额 ${budget.used}/${budget.cap}`);
  }
}

function walkStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => walkStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => walkStrings(v, out));
  return out;
}

function extractImageRefs(json) {
  return walkStrings(json).filter((s) => /^(https?:\/\/|\/|data:image\/)/.test(s) && !/\.(js|css|html)(\?|$)/i.test(s));
}

function countImages(json) {
  const refs = extractImageRefs(json);
  return new Set(refs).size;
}

async function downloadImages(refs, outDir) {
  let n = 0;
  for (const ref of refs) {
    try {
      let buf = null, ext = "png";
      if (ref.startsWith("data:image/")) {
        const m = /^data:image\/([a-z+]+);base64,(.*)$/i.exec(ref);
        if (!m) continue;
        ext = m[1] === "jpeg" ? "jpg" : m[1];
        buf = Buffer.from(m[2], "base64");
      } else {
        const url = ref.startsWith("http") ? ref : `${base}${ref}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") || "";
        ext = ct.includes("jpeg") ? "jpg" : ct.includes("webp") ? "webp" : extOf(url);
      }
      if (!buf?.length) continue;
      n++;
      await writeFile(join(outDir, `result-${n}.${ext}`), buf);
    } catch { /* 单图下载失败不阻断 */ }
  }
  return n;
}

async function printReport() {
  if (!existsSync(RESULTS_DIR)) {
    log("暂无结果目录");
    return;
  }
  const dirs = (await readdir(RESULTS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const rows = [];
  for (const d of dirs) {
    const meta = await readJson(join(RESULTS_DIR, d, "meta.json"), null);
    if (meta) rows.push(meta);
  }
  const budget = await loadBudget(Number((await readJson(CASES_FILE, { cap: 50 })).cap || 50));
  log(`\n===== P0 结果汇总（配额 ${budget.used}/${budget.cap}）=====`);
  log("case".padEnd(22), "exp".padEnd(5), "model".padEnd(17), "mask".padEnd(17), "ok".padEnd(5), "ms");
  for (const m of rows) {
    log(
      String(m.caseId).padEnd(22),
      String(m.exp).padEnd(5),
      String(m.model).padEnd(17),
      String(m.mask || "-").padEnd(17),
      String(m.ok).padEnd(5),
      String(m.ms)
    );
  }
  const byExp = {};
  for (const m of rows) {
    byExp[m.exp] = byExp[m.exp] || { n: 0, ok: 0 };
    byExp[m.exp].n++;
    if (m.ok) byExp[m.exp].ok++;
  }
  log("\n分组统计：");
  for (const [exp, v] of Object.entries(byExp)) log(`  ${exp}: ${v.ok}/${v.n} ok`);
  log("\n待办：按 eval/人工评分规则.md 对每个结果目录补 score.md，再回填 EVIDENCE.md 实验索引。");
}

main().catch((err) => {
  warn("探针异常：", err?.message || err);
  process.exitCode = 1;
});
