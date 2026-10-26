/**
 * 生成 P0-B 实验结果可视化对比看板（docs/ai-tryon/eval/gallery.html）。
 *
 * 用途：把 47 例生成结果与源图摆到一张页面上，让人用眼睛判断，
 * 而不是只对着分数表拍板（记忆 D-10：绝对分数不可跨批次比较）。
 *
 * 用法：node scripts/ai-tryon/build-eval-gallery.mjs
 * 零依赖叶子：仅 node:fs / node:path / node:url。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = path.resolve(HERE, "../../docs/ai-tryon/eval");
const RESULTS_DIR = path.join(EVAL_DIR, "results");
const SAMPLES_DIR = path.join(EVAL_DIR, "samples");
const OUT_FILE = path.join(EVAL_DIR, "gallery.html");

const MODEL_LABEL = {
  "tt-image-2.5": "TT 2.5（豆包）",
  "nano-banana-pro": "Nano Banana Pro",
};

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** 解析人工评分 score.md → { total, max, grade, dims, reason } */
function parseScore(md) {
  if (!md) return null;
  const totalMatch = md.match(/\*\*总分：\s*(\d+)\s*\/\s*(\d+)\s*[｜|]\s*分级：\s*([ABC])\s*级\*\*/);
  if (!totalMatch) return null;
  const dims = [];
  const dimRe = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\/\s*2\s*\|/gm;
  let m;
  while ((m = dimRe.exec(md)) !== null) {
    dims.push({ name: m[1].trim(), score: Number(m[2]) });
  }
  const reasonMatch = md.match(/##\s*依据\s*\n+([\s\S]+?)\n{2,}/);
  return {
    total: Number(totalMatch[1]),
    max: Number(totalMatch[2]),
    grade: totalMatch[3],
    dims,
    reason: reasonMatch ? reasonMatch[1].trim().replace(/\s*\n\s*/g, " ") : "",
  };
}

function collectCases() {
  const dirs = fs
    .readdirSync(RESULTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const cases = [];
  for (const caseId of dirs) {
    const meta = readJson(path.join(RESULTS_DIR, caseId, "meta.json"));
    const scoreMd = fs.existsSync(path.join(RESULTS_DIR, caseId, "score.md"))
      ? fs.readFileSync(path.join(RESULTS_DIR, caseId, "score.md"), "utf8")
      : null;
    const images = fs
      .readdirSync(path.join(RESULTS_DIR, caseId))
      .filter((f) => /^result-\d+\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
      .map((f) => `./results/${caseId}/${f}`);
    if (!meta) continue;
    cases.push({
      caseId,
      exp: meta.exp || "?",
      sample: meta.sample || "?",
      model: meta.model || "?",
      modelLabel: MODEL_LABEL[meta.model] || meta.model,
      mask: meta.mask || null,
      note: meta.note || "",
      prompt: meta.promptSource || "?",
      promptChars: meta.promptChars ?? null,
      ms: meta.ms ?? null,
      ok: meta.ok !== false,
      images,
      score: parseScore(scoreMd),
    });
  }
  return cases;
}

function collectSamples() {
  const out = {};
  if (!fs.existsSync(SAMPLES_DIR)) return out;
  for (const d of fs.readdirSync(SAMPLES_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(SAMPLES_DIR, d.name);
    const files = fs.readdirSync(dir);
    const a = files.find((f) => /^a\.(jpg|png|jpeg|webp)$/i.test(f));
    const b = files.find((f) => /^b\.(jpg|png|jpeg|webp)$/i.test(f));
    if (a && b) {
      out[d.name] = { a: `./samples/${d.name}/${a}`, b: `./samples/${d.name}/${b}` };
    }
  }
  return out;
}

const cases = collectCases();
const samples = collectSamples();
const scored = cases.filter((c) => c.score);
const failed = cases.filter((c) => !c.ok);

const stat = (list) => {
  if (!list.length) return null;
  const sum = list.reduce((s, c) => s + c.score.total, 0);
  return { n: list.length, avg: (sum / list.length).toFixed(2), a: list.filter((c) => c.score.grade === "A").length };
};

const e2 = stat(scored.filter((c) => c.exp === "E2"));
const e5 = stat(scored.filter((c) => c.exp === "E5"));
const e1 = stat(scored.filter((c) => c.exp === "E1"));
const e4 = stat(scored.filter((c) => c.exp === "E4"));

const payload = JSON.stringify({ cases, samples, stats: { E1: e1, E2: e2, E4: e4, E5: e5 } }, null, 0);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>P0-B 实验结果对比看板 · 静音AI画板换装</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#fff; --line:#e3e6ea; --ink:#1c2024; --sub:#5c6670;
    --accent:#2f6feb; --ok:#1a7f4b; --warn:#b7791f; --bad:#c0392b;
    --chip:#eef2f7;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;}
  .wrap{max-width:1400px;margin:0 auto;padding:24px 20px 80px}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:17px;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
  h3{font-size:15px;margin:20px 0 8px}
  .lead{color:var(--sub);margin:0 0 20px}
  .box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  .kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0 4px}
  .kpi div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
  .kpi b{display:block;font-size:20px;margin-top:2px}
  .kpi span{color:var(--sub);font-size:12px}
  .tag{display:inline-block;background:var(--chip);border-radius:5px;padding:1px 7px;font-size:12px;color:var(--sub);margin-right:4px}
  .gA{color:var(--ok);font-weight:700}.gB{color:var(--warn);font-weight:700}.gC{color:var(--bad);font-weight:700}
  .duel{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:14px;margin-bottom:14px}
  .duel .row{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}
  .cell{flex:0 0 auto;width:230px}
  .cell img{width:100%;height:230px;object-fit:cover;border:1px solid var(--line);border-radius:8px;background:#eee;display:block}
  .cell .cap{font-size:12px;color:var(--sub);margin-top:5px;line-height:1.45}
  .cell .cap b{color:var(--ink);font-size:13px}
  .src{width:170px}
  .src img{height:170px}
  button.f{background:var(--card);border:1px solid var(--line);border-radius:7px;padding:5px 11px;cursor:pointer;font-size:13px;color:var(--ink)}
  button.f.on{background:var(--accent);border-color:var(--accent);color:#fff}
  .filters{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:14px}
  .filters .lb{color:var(--sub);font-size:12px;margin-right:2px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  .card img{width:100%;height:250px;object-fit:cover;background:#eee;display:block;cursor:zoom-in}
  .card .body{padding:10px 12px}
  .card .id{font-weight:600;font-size:13px}
  .card .meta{font-size:12px;color:var(--sub);margin-top:3px}
  .card .sc{margin-top:6px;font-size:12px}
  .card .rs{font-size:12px;color:var(--sub);margin-top:6px;display:none}
  .card.open .rs{display:block}
  #lb{position:fixed;inset:0;background:rgba(12,14,18,.9);display:none;align-items:center;justify-content:center;z-index:99;cursor:zoom-out}
  #lb img{max-width:96vw;max-height:94vh;border-radius:6px}
  .warn{background:#fff8e6;border-color:#f0d68a}
  .do{background:#eef6ff;border-color:#c3dcfb}
  ol{margin:8px 0 0;padding-left:22px}ol li{margin:5px 0}
  code{background:var(--chip);border-radius:4px;padding:1px 5px;font-size:12px}
</style>
</head>
<body>
<div class="wrap">
  <h1>P0-B 实验结果对比看板</h1>
  <p class="lead">47 例生成结果 + 4 组源图，全部来自你投放的样本。分数只作参考，<b>请以你眼睛看到的为准</b>（跨批次评分存在漂移，绝对分数不可直接比）。点任意图片可放大。</p>

  <div class="box warn">
    <h3 style="margin-top:0">为什么这段时间前端什么都没变</h3>
    <ol>
      <li><b>P1 全是后端地基</b>（任务存储 / 能力三态 / 日志字段 / 状态机 / 统一执行入口 / 提示词模板系统），设计上就不产生任何新界面。</li>
      <li><b>唯一会影响出图内容的开关被我故意关着</b>：<code>DEFAULT_PROMPT_TEMPLATE_VERSION = null</code>，P1-7 默认不挂载模板，生产提示词与你原来逐字一致——当时没有实测证据，不敢动你的 P0 生命线。</li>
      <li><b>真正看得见的功能在 P2</b>（单图连续编辑 + 版本管理 + 服装档案），还没开工。</li>
    </ol>
  </div>

  <div class="box do">
    <h3 style="margin-top:0">你现在要做的，按顺序就三步</h3>
    <ol>
      <li><b>先看下面 4 个对决</b>（5 分钟，只有你能判）：尤其「提示词 A vs B」——这是唯一零成本的改进，我要不要默认打开它，取决于你看了觉得 B 是不是真的更好。</li>
      <li><b>拍两个板</b>：① 结构化提示词 v2 是否挂载上线；② 生产默认模型是否切 Nano Banana Pro。两个都能一键回滚。</li>
      <li><b>补最后一项</b>：E6 视觉分析，需要你在 app 里实跑一次带视觉分析的换装，看分析报告出不出来——这是 P0 唯一未闭合项。</li>
    </ol>
  </div>

  <h2>总体数据</h2>
  <div class="kpi">
    <div><span>成功生成</span><b>${cases.filter((c) => c.ok).length} / ${cases.length}</b></div>
    <div><span>已评分</span><b>${scored.length}</b></div>
    <div><span>E2 基线均分（提示词 A）</span><b>${e2 ? e2.avg : "-"} ｜ A级 ${e2 ? e2.a : 0}</b></div>
    <div><span>E5 结构化均分（提示词 B）</span><b>${e5 ? e5.avg : "-"} ｜ A级 ${e5 ? e5.a : 0}</b></div>
    <div><span>E1 Mask 三模式均分</span><b>${e1 ? e1.avg : "-"}</b></div>
    <div><span>E4 同参重复噪声（极差）</span><b>${e4 ? e4.avg : "-"} ±</b></div>
  </div>
  <p class="lead" style="margin-top:10px">口径提醒：E2（A 提示词）与 E5（B 提示词）分属不同批次，<b>+1.28 分是提示性证据不是定论</b>；请直接看下面的对决图，用眼睛复核这个差值是不是真的存在。</p>

  <h2>对决一览</h2>
  <div id="duels"></div>

  <h2>全部结果</h2>
  <div class="filters" id="filters"></div>
  <div class="grid" id="grid"></div>
</div>
<div id="lb"><img id="lbi" alt=""></div>
<script>
const DATA = ${payload};
const MODEL = ${JSON.stringify(MODEL_LABEL)};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = (id) => DATA.cases.find((c) => c.caseId === id);
const gradeCls = (g) => (g === "A" ? "gA" : g === "B" ? "gB" : "gC");

function cellFor(c, label) {
  if (!c) return '<div class="cell"><div class="cap">缺</div></div>';
  const img = c.images[0] || "";
  const s = c.score;
  return '<div class="cell">' +
    '<img loading="lazy" src="' + esc(img) + '" data-full="' + esc(img) + '" alt="' + esc(c.caseId) + '">' +
    '<div class="cap"><b>' + esc(label || c.caseId) + "</b><br>" +
    esc(c.modelLabel) + " · 提示词" + esc(c.prompt) +
    (s ? ' · <span class="' + gradeCls(s.grade) + '">' + s.total + "/12 " + s.grade + "级</span>" : " · 未评分") +
    (c.ms ? " · " + Math.round(c.ms / 1000) + "s" : "") +
    (c.note ? "<br>" + esc(c.note) : "") +
    (s && s.reason ? "<br><span title='" + esc(s.reason) + "'>" + esc(s.reason.slice(0, 42)) + (s.reason.length > 42 ? "…" : "") + "</span>" : "") +
    "</div></div>";
}
function srcCell(sample, which) {
  const s = DATA.samples[sample];
  if (!s) return "";
  const src = which === "a" ? s.a : s.b;
  return '<div class="cell src"><img loading="lazy" src="' + esc(src) + '" data-full="' + esc(src) + '" alt="">' +
    '<div class="cap"><b>' + esc(sample) + (which === "a" ? " 图A 模特" : " 图B 服装") + "</b></div></div>";
}
function duel(title, desc, rows) {
  let h = '<div class="duel"><h3 style="margin-top:0">' + esc(title) + '</h3><p class="lead" style="margin:0 0 10px">' + desc + "</p>";
  for (const r of rows) {
    h += '<div style="font-size:13px;color:var(--sub);margin:10px 0 4px">' + esc(r.title) + "</div>";
    h += '<div class="row">' + srcCell(r.sample, "a") + srcCell(r.sample, "b") +
      r.cells.map((c) => cellFor(c[0], c[1])).join("") + "</div>";
  }
  return h + "</div>";
}

const duels = [];
// 对决 1：提示词 A vs B（同模型同样本）
{
  const rows = [];
  for (const smp of ["s01", "s02", "s03"]) {
    for (const mdl of ["tt-image-2.5", "nano-banana-pro"]) {
      const a = DATA.cases.find((c) => c.exp === "E2" && c.sample === smp && c.model === mdl && c.ok);
      const b = DATA.cases.find((c) => c.exp === "E5" && c.sample === smp && c.model === mdl && c.ok);
      if (a && b) rows.push({ title: smp + " · " + (MODEL[mdl] || mdl), sample: smp, cells: [[a, "A 你原来的提示词"], [b, "B 结构化提示词"]] });
    }
  }
  duels.push(duel("对决 1 · 提示词：你原来的 A vs 结构化 B",
    "唯一零代码成本的改进。要看的是：<b>版型有没有被改成另一种衣服、图案细节有没有保留、有没有凭空多出部件</b>（例如毛领、腰封）。如果你觉得 B 更稳，我就把 v2 模板挂上去。", rows));
}
// 对决 2：模型
{
  const rows = [];
  for (const smp of ["s01", "s02", "s03", "s04"]) {
    const n = DATA.cases.find((c) => c.exp === "E2" && c.sample === smp && c.model === "nano-banana-pro" && c.ok);
    const t = DATA.cases.find((c) => c.exp === "E2" && c.sample === smp && c.model === "tt-image-2.5" && c.ok);
    if (n && t) rows.push({ title: smp, sample: smp, cells: [[t, "TT 2.5"], [n, "Nano Banana Pro"]] });
  }
  duels.push(duel("对决 2 · 模型：TT 2.5 vs Nano Banana Pro",
    "同为提示词 A。实验数据显示 Nano 更快（约 42s vs 117s）、更稳、画质更高；你看图确认是否认可这个排序。", rows));
}
// 对决 3：Mask
{
  const rows = [];
  for (const smp of ["s01", "s02", "s03", "s04"]) {
    const cells = [];
    for (const mk of ["none", "garment", "body"]) {
      const c = DATA.cases.find((x) => x.caseId === "e1-" + mk + "-" + smp && x.ok);
      if (c) cells.push([c, mk === "none" ? "无掩膜" : mk === "garment" ? "服装区掩膜" : "人体区掩膜"]);
    }
    if (cells.length) rows.push({ title: smp, sample: smp, cells });
  }
  duels.push(duel("对决 3 · Mask 到底有没有用",
    "三张图的差异如果<b>肉眼分辨不出来</b>，就印证结论：Mask 语义无效（差异 0.5 分 &lt; 同参重复噪声 1.0 分）。这条决定了 P3 要不要在掩膜上继续投入。", rows));
}
// 对决 4：同参重复噪声基线
{
  const rows = [];
  const reps = DATA.cases.filter((c) => c.exp === "E4" && /^e4-rep-/.test(c.caseId) && c.ok);
  if (reps.length) rows.push({ title: "同一套参数连跑三次（随机波动有多大）", sample: "s01", cells: reps.map((c, i) => [c, "第 " + (i + 1) + " 次"]) });
  const others = DATA.cases.filter((c) => c.exp === "E4" && !/^e4-rep-/.test(c.caseId) && c.ok);
  if (others.length) rows.push({ title: "尺寸 / 比例变化", sample: "s01", cells: others.map((c) => [c, c.note || c.caseId.replace("e4-", "")]) });
  duels.push(duel("对决 4 · 噪声基线（判断别的差异是不是真的）",
    "连跑三次都能差出这么多，那任何小于这个幅度的「改进」都不可信。<b>这是全表的标尺。</b>", rows));
}
document.getElementById("duels").innerHTML = duels.join("");

// 全部结果 + 筛选
const F = { exp: "ALL", sample: "ALL", model: "ALL", prompt: "ALL" };
function buildFilters() {
  const opts = (key, label) => {
    const vals = [...new Set(DATA.cases.map((c) => c[key]))].sort();
    return '<span class="lb">' + label + '</span><button class="f' + (F[key] === "ALL" ? " on" : "") + '" data-k="' + key + '" data-v="ALL">全部</button>' +
      vals.map((v) => '<button class="f' + (F[key] === v ? " on" : "") + '" data-k="' + key + '" data-v="' + esc(v) + '">' + esc(v) + "</button>").join("");
  };
  document.getElementById("filters").innerHTML =
    opts("exp", "实验") + opts("sample", "样本") + opts("model", "模型") + opts("prompt", "提示词");
  document.querySelectorAll("#filters button").forEach((b) => {
    b.onclick = () => { F[b.dataset.k] = b.dataset.v; buildFilters(); render(); };
  });
}
function render() {
  const list = DATA.cases.filter((c) =>
    (F.exp === "ALL" || c.exp === F.exp) && (F.sample === "ALL" || c.sample === F.sample) &&
    (F.model === "ALL" || c.model === F.model) && (F.prompt === "ALL" || c.prompt === F.prompt));
  document.getElementById("grid").innerHTML = list.map((c) => {
    const s = c.score;
    return '<div class="card' + (s ? "" : "") + '">' +
      '<img loading="lazy" src="' + esc(c.images[0] || "") + '" data-full="' + esc(c.images[0] || "") + '" alt="' + esc(c.caseId) + '">' +
      '<div class="body"><div class="id">' + esc(c.caseId) + (c.ok ? "" : ' <span class="gC">失败</span>') + "</div>" +
      '<div class="meta">' + esc(c.exp) + " · " + esc(c.sample) + " · " + esc(c.modelLabel) + " · 提示词" + esc(c.prompt) +
      (c.mask ? " · mask:" + esc(c.mask) : "") + (c.ms ? " · " + Math.round(c.ms / 1000) + "s" : "") + "</div>" +
      (s ? '<div class="sc"><span class="' + gradeCls(s.grade) + '">' + s.total + "/" + s.max + " " + s.grade + "级</span> · " +
        s.dims.map((d) => d.name + " " + d.score).join(" / ") + "</div>" : '<div class="sc">未评分</div>') +
      (s && s.reason ? '<div class="rs">' + esc(s.reason) + "</div>" : "") +
      "</div></div>";
  }).join("");
  document.querySelectorAll("#grid img").forEach((im) => {
    im.onclick = () => { document.getElementById("lbi").src = im.dataset.full; document.getElementById("lb").style.display = "flex"; };
  });
}
buildFilters(); render();
document.getElementById("lb").onclick = () => { document.getElementById("lb").style.display = "none"; };
document.addEventListener("click", (e) => {
  const im = e.target.closest("img[data-full]");
  if (im && !im.closest("#lb")) { document.getElementById("lbi").src = im.dataset.full; document.getElementById("lb").style.display = "flex"; }
});
</script>
</body>
</html>
`;
fs.writeFileSync(OUT_FILE, html, "utf8");
console.log("gallery.html written:", OUT_FILE);
console.log("cases:", cases.length, "scored:", scored.length, "failed:", failed.length);
console.log("stats:", JSON.stringify({ E1: e1, E2: e2, E4: e4, E5: e5 }));
