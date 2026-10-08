// 漂移检测：跨文件同名组件/函数、CSS 类重复定义、模块级可变状态
//
// 本文件由 tmp/drift-audit.mjs 转正而来（V11-RF-021），**只读取证工具**：
//   - 不进门禁、不登记 run-all 的 ORDER（门禁是 scripts/verify/frontend-duplication-check.mjs）；
//   - 用途是人工取证/排查，跑法：node scripts/dev/frontend-duplication-audit.mjs [--json]
//   - 与门禁共用同一份提取逻辑 lib/frontend-sources.mjs，禁止在本文件再写正则。
import fs from 'node:fs';
import path from 'node:path';
// 提取逻辑只有一份（与 frontend-duplication-check.mjs 共用），禁止在本文件再写正则
// 注意：本文件已从 tmp/ 搬到 scripts/dev/，相对层级随之变化（tmp/ -> ../scripts/verify/）
import {
  FRONTEND_SCAN_SCOPE,
  listFrontendSourceFiles,
  collectTopLevelDefs,
  crossFileDuplicates,
} from '../verify/lib/frontend-sources.mjs';

// --json 模式：静默所有文本输出，保证 stdout 只有纯 JSON（否则基线文件会被文本污染而不可解析）
const JSON_MODE = process.argv.includes('--json');
const rawLog = console.log.bind(console);
if (JSON_MODE) console.log = () => {};

const ROOT = 'D:/源码开发/静音AI画板v4.0源码';
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(p, 'utf8');

// ---------- 1. 跨文件同名顶层函数/组件 ----------
// 🔴 口径修正过两次，两次都要记住：
//   ① 初版只扫 3 个前端文件，漏掉 src/shared/ 里的第 4 份 canvasToBlob
//      （src/shared/local-edit-geometry.js:248）。统筹实测指出后改为「扫全 src/」。
//   ② 更隐蔽的一次：初版正则**逐行 exec 且没有行首锚定**，把缩进的内层函数也算进来了，
//      得出 104 条；其中 82 条是组件内部的局部函数（done / viewLeft / deltaX …），
//      跨文件同名属正常作用域，不是复制粘贴。改用行首锚定判据后是 **22 条**。
//   现在提取逻辑**只有一份**：scripts/verify/lib/frontend-sources.mjs。
//   本脚本与 frontend-duplication-check.mjs 都 import 它 —— 禁止再各写一份正则。
//   ⚠️ 因此必须在项目根目录运行（lib 用 process.cwd()）。
const FE = listFrontendSourceFiles();
rawLog(
  `扫描范围（root=${FRONTEND_SCAN_SCOPE.root} ext=${FRONTEND_SCAN_SCOPE.extensions.join(',')} ` +
    `excludes=${FRONTEND_SCAN_SCOPE.excludes.join(',')}）: ${FE.length} 个文件`
);
rawLog('判据：行首顶层函数声明（function 与 const 箭头函数），缩进的内层函数不纳入');
const { found: defs } = collectTopLevelDefs(FE);
const dupList = crossFileDuplicates(defs);
rawLog('=== 跨文件同名顶层函数/组件（重复实现候选） ===');
let dupCount = 0;
const dups = [];
for (const d of dupList) {
  dupCount++;
  // 基线要全量（不是前 30 条），门禁比对依赖它
  dups.push({
    name: d.name,
    fileCount: d.fileCount,
    occurrences: d.locations.map((l) => {
      const cut = l.lastIndexOf(':');
      return { file: l.slice(0, cut), line: Number(l.slice(cut + 1)) };
    }),
  });
  if (dupCount <= 30) {
    rawLog(` ⚠ ${d.name}  => ${d.files.join(' | ')}  (${d.locations.map((l) => l.split(':').pop()).join(',')})`);
  }
}
rawLog('跨文件同名定义总数:', dupCount);

// ---------- 1b. --json：产出 RF-019 基线（与门禁共用同一套提取逻辑，避免两套正则漂移） ----------
if (process.argv.includes('--json')) {
  const out = {
    schema: 'rf019-frontend-duplication-baseline/v1',
    generatedAt: new Date().toISOString(),
    generator: 'tmp/drift-audit.mjs --json',
    // 口径自检三件套：范围/排除/文件数。任一变了，基线即失效，必须重生成。
    scanScope: {
      ...FRONTEND_SCAN_SCOPE,
      fileCount: FE.length,
      files: FE.slice().sort(),
    },
    rule: '行首顶层函数（function 与 const 箭头函数；函数名长度 >= 4 才计入）',
    baselineCount: dupCount,
    entries: dups,
  };
  rawLog(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ---------- 2. CSS 类重复定义 ----------
const cssFiles = ['src/styles.css', 'src/outfit-workflow.css', 'src/features/outfit/outfit-intent.css',
  'src/features/outfit/retouch-intent.css', 'src/features/outfit/white-refine-split.css'];
const classMap = new Map();
for (const f of cssFiles) {
  if (!fs.existsSync(path.join(ROOT, f))) continue;
  const t = read(path.join(ROOT, f));
  const ln = t.split('\n');
  ln.forEach((l, i) => {
    const m = /^\s*\.([a-zA-Z][\w-]*)\s*(?:,|\{|\s|$)/.exec(l);
    if (m) {
      const c = m[1];
      if (!classMap.has(c)) classMap.set(c, []);
      classMap.get(c).push({ file: f, line: i + 1 });
    }
  });
}
console.log('\n=== 同名 CSS 类被多个文件定义（改一处可能不生效 / 互相覆盖） ===');
let cssDup = 0;
for (const [c, arr] of [...classMap].sort()) {
  const files = new Set(arr.map((a) => a.file));
  if (files.size > 1) {
    cssDup++;
    if (cssDup <= 25) console.log(` ⚠ .${c} => ${[...files].map(f => f.replace('src/', '')).join(' | ')}`);
  }
}
console.log('跨文件重复定义的 CSS 类总数:', cssDup, ' 总类名数:', classMap.size);

// ---------- 3. 模块级可变状态（跨请求共享的隐患） ----------
const SRV = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'skill-baselines', 'features'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) SRV.push(p);
  }
}
walk(path.join(ROOT, 'server'));
console.log('\n=== server 模块级可变状态（let/Map/计数器） ===');
const stateRe = /^(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=/;
let stateCount = 0;
for (const p of SRV) {
  const lines = read(p).split('\n');
  const hits = [];
  lines.forEach((l, i) => {
    const m = stateRe.exec(l);
    if (m && !/^\s*\/\//.test(l)) hits.push(`${m[1]}@${i + 1}`);
  });
  if (hits.length) {
    stateCount += hits.length;
    console.log(`  ${rel(p)}: ${hits.slice(0, 6).join(', ')}${hits.length > 6 ? ' …' : ''}`);
  }
}
console.log('模块级可变变量总数:', stateCount);

// ---------- 4. 两份大 CSS 与 JSX 的耦合：JSX 里用了多少 className 字面量 ----------
for (const f of FE) {
  const t = read(path.join(ROOT, f));
  const m = t.match(/className=/g);
  console.log(`\n${f}: className 出现 ${m ? m.length : 0} 次`);
}
