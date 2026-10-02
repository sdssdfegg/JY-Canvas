// 线 B 领域切分测量：统计两个主组件内「按域关键词归类的 handler」行数
import { readFileSync } from "node:fs";

const AREAS = {
  "详情页(detail)": /detail|stitch/i,
  "参考图(reference)": /reference/i,
  "无限画布(canvas)": /canvas/i,
  "视频(video)": /video/i,
  "提示词库(prompt)": /prompt|preset|categor/i,
  "保存目录(directory)": /directory|saveDir/i,
  "局部编辑(localEdit)": /localEdit|mask|brush|crop/i,
  "存储/历史(storage)": /storage|history|clean/i,
  "设置/连接(settings)": /settings|connection|apiKey|config/i,
  "上传(upload)": /upload|drop|file/i,
  "预览/灯箱(preview)": /preview|lightbox|zoom|pan/i,
  "结果队列(result)": /result|task|download|gallery/i,
};

function grabInner(file, start) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const out = [];
  for (let i = start - 1; i < lines.length; i++) {
    const l = lines[i];
    const m = /^(\s+)(?:async\s+)?function\s+([A-Za-z0-9_]+)/.exec(l);
    const c = /^(\s+)const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/.exec(l);
    const hit = m || c;
    if (!hit) continue;
    const indent = hit[1].length;
    if (indent === 0) continue; // 顶层，不属于主组件
    if (m && /^function\s+[A-Z]/.test(l.trim())) continue; // 子组件
    // 用大括号配对找函数体结束（handler 与主组件体同缩进，不能用缩进回退判断）
    let depth = 0;
    let started = false;
    let end = i;
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
      if (depth > 0) started = true;
      if (started && depth === 0) { end = j; break; }
      end = j;
    }
    out.push({ ln: i + 1, end: end + 1, name: hit[2], len: end + 1 - i });
    i = end;
  }
  return out;
}

const targets = [
  { file: "src/main.jsx", comp: "App", start: 2248, end: 8164 },
  { file: "src/outfit-workflow.jsx", comp: "OutfitWorkflow", start: 6248, end: 10828 },
];

for (const t of targets) {
  const fns = grabInner(t.file, t.start);
  const inRange = fns.filter((f) => f.end <= t.end + 5);
  console.log(`\n══════ ${t.file} :: ${t.comp}  ${t.start}-${t.end} (${t.end - t.start} 行)`);
  console.log(`主组件内 handler/常量函数 ${inRange.length} 个，合计 ${inRange.reduce((a, b) => a + b.len, 0)} 行`);
  const bucket = {};
  for (const [k, re] of Object.entries(AREAS)) bucket[k] = [];
  const rest = [];
  for (const f of inRange) {
    let hit = false;
    for (const [k, re] of Object.entries(AREAS)) {
      if (re.test(f.name)) { bucket[k].push(f); hit = true; break; }
    }
    if (!hit) rest.push(f);
  }
  const rows = Object.entries(bucket)
    .map(([k, v]) => [k, v.length, v.reduce((a, b) => a + b.len, 0), v.length ? Math.min(...v.map((x) => x.ln)) : 0, v.length ? Math.max(...v.map((x) => x.end)) : 0])
    .sort((a, b) => b[2] - a[2]);
  console.log("域".padEnd(24) + "函数数  行数   行区间");
  for (const [k, n, len, lo, hi] of rows) {
    console.log(k.padEnd(24) + String(n).padStart(4) + String(len).padStart(7) + `   ${lo}-${hi}`);
  }
  console.log("未归类".padEnd(24) + String(rest.length).padStart(4) + String(rest.reduce((a, b) => a + b.len, 0)).padStart(7));
}
