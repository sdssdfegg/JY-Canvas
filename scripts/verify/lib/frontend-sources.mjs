// 前端源码「真相源」统一收集器（V11-RF-019）。
//
// 为什么有这个文件：与 lib/server-sources.mjs（V11-RF-010）同款动机——
// 「去哪找前端源码 / 怎么算一个顶层函数定义」如果散落在各个脚本里，
// 每加一个脚本就多一份正则，口径迟早各自漂移。
// 现实教训：评估报告初版用「逐行 exec、无行首锚定」的正则扫出 104 处跨文件同名，
// 改用本文件的「行首顶层」判据后是 22 处——多出来的 82 个全是缩进的内层函数
// （done / viewLeft / deltaX 之类，跨文件同名属正常作用域，不是复制粘贴）。
// 所以：**提取逻辑只能有一份，就在这里。**
//
// 判定口径（三选一，务必写清楚，否则数字会互相打架）：
//   1) 行首锚定（本文件采用）：只有列 0 的声明算顶层，缩进的内层函数不扫。
//   2) 两种声明形式都收：`function NAME(` / `async function NAME(`，
//      以及 `const NAME = (` / `const NAME = async (`。
//      —— 前端工具函数大量写成箭头函数常量，只认 function 会留下盲区。
//      实测：本仓库当前两种形式的跨文件同名名单完全一致（都是 22 条），
//      收 const= 不会引入误报，只是让未来不再漏。
//   3) 名字长度 >= 4 才计入：过滤 done/map/foo 这类极短名带来的噪声。
//
// 排除范围（刻意不纳入，避免稀释语义或引入历史快照/生成物）：
//   node_modules / dist / skill-baselines / tmp / .codex-artifacts

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** 扫描口径。门禁会把运行时口径与本对象比对，不一致即判「范围漂移」。 */
export const FRONTEND_SCAN_SCOPE = {
  root: "src/",
  extensions: [".js", ".jsx"],
  excludes: ["node_modules", "dist", "skill-baselines", "tmp", ".codex-artifacts"],
};

/**
 * 唯一一份「顶层函数定义」正则。
 * 门禁、审计脚本、任何工具都必须 import 本常量，禁止再抄一份（抄了就会漂移）。
 * 两个捕获组：1 = function 形式，2 = const 箭头函数形式。
 */
export const TOP_LEVEL_DEF_RES = [
  /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
  /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/gm,
];

/** 计入的最短函数名（短于此值忽略，避免 done/map 之类噪声） */
export const MIN_NAME_LENGTH = 4;

/** 返回前端源码文件的相对路径列表（posix 风格，已排序）。目录不存在时安全返回空数组。 */
export function listFrontendSourceFiles() {
  const root = process.cwd();
  const srcDir = path.join(root, "src");
  const out = [];
  if (!existsSync(srcDir)) return out;

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (FRONTEND_SCAN_SCOPE.excludes.includes(entry.name)) continue;
        walk(full);
      } else if (
        entry.isFile() &&
        FRONTEND_SCAN_SCOPE.extensions.some((ext) => entry.name.endsWith(ext))
      ) {
        out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  walk(srcDir);
  return out.sort();
}

/**
 * 从给定的相对路径文件列表里，抽出所有「行首顶层函数定义」。
 * @returns {{ found: Map<string, Array<{file:string,line:number}>>, intraFile: Array, totalDefs: number }}
 *   found     —— name -> 出现位置（跨文件/同文件混在一起，调用方自行判重）
 *   intraFile —— 同一个文件内重名（属异常，本门禁只报告不拦）
 */
export function collectTopLevelDefs(files) {
  const root = process.cwd();
  const found = new Map();
  const intraFile = [];
  let totalDefs = 0;

  for (const rel of files) {
    let source;
    try {
      source = readFileSync(path.join(root, rel), "utf8");
    } catch {
      continue;
    }
    const seenInFile = new Set();
    for (const re of TOP_LEVEL_DEF_RES) {
      const matcher = new RegExp(re.source, re.flags);
      let match = null;
      while ((match = matcher.exec(source)) !== null) {
        const name = match[1] || match[2];
        if (!name || name.length < MIN_NAME_LENGTH) continue;
        totalDefs += 1;
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        if (!found.has(name)) found.set(name, []);
        found.get(name).push({ file: rel, line });
        if (seenInFile.has(name)) intraFile.push({ name, file: rel, line });
        seenInFile.add(name);
      }
    }
  }
  return { found, intraFile, totalDefs };
}

/** 把 found 转成「跨文件同名」的排序清单（含 fileCount / files / locations）。 */
export function crossFileDuplicates(found) {
  return [...found.entries()]
    .filter(([, entries]) => new Set(entries.map((e) => e.file)).size > 1)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, entries]) => {
      const filesForName = [...new Set(entries.map((e) => e.file))].sort();
      return {
        name,
        fileCount: filesForName.length,
        files: filesForName,
        locations: entries
          .map((e) => `${e.file}:${e.line}`)
          .sort(),
      };
    });
}
