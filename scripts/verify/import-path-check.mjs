// 相对导入路径存在性门禁（V11-RF-018 的硬性交付物，不是可选项）。
//
// 为什么有这个脚本（血案直接解药）：
//   V11-RF-116 把 app-bootstrap.js 搬进 server/core/ 后，相对导入写成了
//   `./static-assets.generated.js`（该生成物实际在 server/ 根目录），
//   启动直接 ERR_MODULE_NOT_FOUND —— 整个软件起不来；
//   而 run-all 从 36/36 掉到 21/36，15 个失败全是"测试实例没起来"的连坐。
//   这类错逃得过当时所有门禁：node --check 只看语法不解析 import；
//   ESLint 当时没开 import 解析规则；duplication / singleton / routing 都只看符号与文本；
//   而"沙盒全绿"因为不起服务，盲区正好盖住它。
//   本门禁要把"相对导入写错"变成一跑就红、且零副作用的静态断言。
//
// 🔴 边界声明（防误用，改动前先读完）：
//   1. 只覆盖【源码里写死的 import / export / import() 字面量说明符】，
//      **不覆盖运行期拼出来的路径**（例如 path.resolve(runtimeDir, "..")、
//      或 `import(` + 变量 + `)`）——那类错是 RF-011 app-paths.js 那一档，
//      需要值级复核，本门禁抓不到，别指望它兜。
//   2. **不扫 src/**：前端由 Vite 解析（允许省略扩展名、.jsx/.css 混用、
//      alias、?raw 等后缀），朴素的存在性判断会大量误报。
//      将来若要覆盖前端，另开工单，不要顺手把 src 塞进来。
//
// 实现要点：
//   - 源码范围复用 V11-RF-010 的 listServerSourceFiles()：index.js + core/routes/shared 下所有 .js，
//     将来 server/routes/**、server/shared/** 新增文件自动被覆盖，不用回头改本脚本。
//   - 只扫相对说明符（./ 与 ../ 开头）；裸包名（express、node:fs、#alias 等）一律跳过。
//   - 解析判定：以【该文件所在目录】为基准拼绝对路经，existsSync 判 existence；
//     带扩展名、目录形式（解析到 dir/index.js）两种写法都覆盖。不做 URL 解码之类的花活。
//   - 违规输出必须点名三样：文件:行号 + 说明符 + 解析后的绝对路径，否则定位还要二次翻查。
//   - 无基线、无棘轮：坏路径在任何时刻都是错（不存在"历史存量"要记账），
//     所以直接 ok = 违规数 === 0，不提供 --update。
//   - 本脚本不 spawn、不起服务、不 import 任何业务模块（尤其不要 import 被测文件本身，
//     那会执行副作用），因此可以在任何时候安全地跑。
//
// 退出码：通过 0 / 失败 1。输出 JSON：ok / scannedFiles / scannedSpecifiers / violations[]。
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { listServerSourceFiles } from "./lib/server-sources.mjs";

const ROOT = process.cwd();

// 去掉注释，避免注释里举例的字符串被当成真实导入；
// 但要保留行数（块注释按字符替换成空格），否则下面的行号会错位。
function stripCommentsKeepLines(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/(?!\/)[^\n]*/g, "$1");
}

// 三种字面量导入形式。
// 说明：都在 `gm` 模式下匹配，`^`/前导空白保证从语句开头起算，行号才准；
// 中间允许跨行（多行 import 列表），用惰性量词限长避免跨语句粘连。
// `d`（hasIndices）用来拿到【说明符本身】的精确下标 —— 否则行号会落在前导字符
// （上一行末尾的 `;`）那一行，报出来差一行。
const SPECIFIER_PATTERNS = [
  // import/export … from "./x.js"（含多行列表）
  { re: /(?:^|[\s;{}()])(?:import|export)\b[\s\S]{0,800}?\bfrom\s*["']([^"']+)["']/gmd, kind: "static" },
  // 副作用式裸导入：import "./x.js"
  { re: /(?:^|[\s;{}()])\bimport\s+["']([^"']+)["']/gmd, kind: "bare" },
  // 动态导入：await import("./x.js")
  { re: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gmd, kind: "dynamic" }
];

/** 抽出源码里所有 import 说明符，按出现顺序返回（含字符下标，用于算行号）。 */
function collectSpecifiers(source) {
  const found = [];
  for (const { re, kind } of SPECIFIER_PATTERNS) {
    let m;
    while ((m = re.exec(source)) !== null) {
      // d 标志给出捕获组的精确下标；老运行时没有就退回"在整段匹配里最后一次出现"的位置。
      const specIndex = m.indices?.[1]?.[0] ?? m.index + m[0].lastIndexOf(m[1]);
      found.push({ specifier: m[1], index: specIndex, kind });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** 相对说明符才算；裸包名（包名 / node: 内置 / # 别名）跳过。 */
function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

/** 以文件所在目录为基准解析；依次尝试原样、补 .js、目录形式（dir/index.js）。 */
function resolveTarget(file, specifier) {
  const base = path.resolve(path.dirname(file), specifier);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    if (existsSync(candidate)) return { resolved: candidate, exists: true };
  }
  return { resolved: base, exists: false };
}

const files = listServerSourceFiles();
const violations = [];
let scannedSpecifiers = 0;
let scannedFiles = 0;

for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue; // 读不到就跳过，不因为这崩掉整套门禁
  }
  scannedFiles += 1;
  const stripped = stripCommentsKeepLines(source);
  for (const { specifier, index } of collectSpecifiers(stripped)) {
    if (!isRelativeSpecifier(specifier)) continue;
    scannedSpecifiers += 1;
    const line = stripped.slice(0, index).split("\n").length;
    const { resolved, exists } = resolveTarget(file, specifier);
    if (!exists) {
      violations.push({
        file: path.relative(ROOT, file).split(path.sep).join("/"),
        line,
        specifier,
        resolved
      });
    }
  }
}

const ok = violations.length === 0;
console.log(JSON.stringify({ ok, scannedFiles, scannedSpecifiers, violations }, null, 2));
process.exit(ok ? 0 : 1);
