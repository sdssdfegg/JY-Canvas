// 服务端源码「真相源」统一收集器（V11-RF-010）。
//
// 为什么有这个文件：Phase 1 拆分后 server/index.js 已不是唯一真相源；
// 每拆一次（搬到 server/core、server/routes、server/shared）就改一遍各验证脚本，
// 清单一定会腐烂（routes/shared 一出现就会漏）。把所有"去哪找服务端源码"的逻辑收口到这里，
// 后续搬家脚本只需 import 本模块，不用逐个改。
//
// 纳入范围：
//   - server/index.js
//   - server/core/**/*.js
//   - server/routes/**/*.js   （当前还不存在，见下方存在性过滤）
//   - server/shared/**/*.js   （当前还不存在，见下方存在性过滤）
// 排除范围（刻意不纳入，避免稀释逐文件语义或引入历史快照/生成物）：
//   - server/features/**        —— KEY 清洗有自己的 parity 脚本
//   - server/skill-baselines/** —— V3 历史对照副本，禁止修改
//   - server/static-assets.generated.js —— 生成物
// 实现上只遍历上面点名的三个子目录 + index.js，因此上述排除项天然不会被纳入。
//
// 关键契约：任何目录不存在都安全跳过（返回空数组 / 跳过该文件），绝不抛异常。
// 否则 routing-check 直接读文件会在 routes/shared 尚不存在时崩溃。

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SERVER_DIR = path.join(ROOT, "server");

// 只在这三个子目录里递归收集 .js；features / skill-baselines / 顶层生成物
// 不在这三个目录内，因此天然被排除（不会被纳入）。
const INCLUDE_DIRS = ["core", "routes", "shared"];

function collectJsIn(dir, out) {
  if (!existsSync(dir)) return; // 目录不存在：安全跳过
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsIn(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
}

/** 返回服务端源码文件的绝对路径列表（index.js + core/routes/shared 下所有 .js）。
 *  任何纳入目录不存在都安全跳过，不会抛异常。 */
export function listServerSourceFiles() {
  const out = [];
  const indexJs = path.join(SERVER_DIR, "index.js");
  if (existsSync(indexJs)) out.push(indexJs);
  for (const dir of INCLUDE_DIRS) {
    collectJsIn(path.join(SERVER_DIR, dir), out);
  }
  return out;
}

/** 把上述范围读成一份整体文本（单个文件读失败 / 不存在时跳过该文件）。 */
export function readServerSources() {
  return listServerSourceFiles()
    .map((file) => {
      try {
        return readFileSync(file, "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}
