// 服务端源码「真相源」统一收集器（V11-RF-010）。
//
// 为什么有这个文件：Phase 1 拆分后 server/index.js 已不是唯一真相源；
// 每拆一次（搬到 server/core、server/routes、server/shared）就改一遍各验证脚本，
// 清单一定会腐烂（routes/shared 一出现就会漏）。把所有"去哪找服务端源码"的逻辑收口到这里，
// 后续搬家脚本只需 import 本模块，不用逐个改。
//
// 纳入范围：
//   - server/index.js
//   - server/app.js        —— V11-RF-220（2026-10-02）从 index.js 拆出的**装配层**，
//       是 index.js 的"另一半"，不是新写的模块。补录它的理由必须写清，否则后人会以为是随手加的：
//       **220 之前，app.js 里的这 552 行代码是包含在 server/index.js 内的，本就在本收集器的扫描范围内；
//       220 把它们搬进新文件后，若不补录，这 552 行会静默脱离 state-singleton / server-duplication /
//       routing 等全部门禁**——拆出动作本身反而削弱了护栏，这是 220 引入的真实盲区，故在此补上。
//       判定口径：凡"从 index.js 搬出去的装配层代码落在哪个文件，哪个文件就要进本清单"。
//       ⚠️ 未纳入的 server/ 顶层其余 .js（channel-config.js 等历史模块）：它们**从一开始就不在本范围内**，
//       纳入会改变既有门禁的判定基数（可能新增报红），需要单独评估，本次不做。这里不假装"顶层全纳入"。
//   - server/core/**/*.js
//   - server/routes/**/*.js  —— 批次 4（V11-RF-201 起）的新家：从 index.js 抽出的路由模块。
//       **2026-10-02 前不存在（当时注释写"当前还不存在"），201/202 落地后已存在**，本行随之更新。
//       约定（D4 契约）：每个文件导出 `registerXxxRoutes(app[, deps])`，由 index.js 在**原位置**调用；
//       依赖一律 import 自 `server/core/*` 或 `server/*.js`，禁止从 index.js 作用域隐式抓变量。
//       后续 12 张路由单会继续往这里加文件，本收集器自动纳入，无需再改清单。
//   - server/shared/**/*.js  （当前还不存在，见下方存在性过滤）
// 排除范围（刻意不纳入 —— **排除必须有理由，理由必须来自实测**，见 §0.9 第 11 条）：
//
//   - server/features/**  —— V11-RF-023 实测核实（2026-10-02）：该目录下 **3 个 .js 全部是活副本**，
//       被运行时真实引用，**一个都不是死代码**：
//         · auth/api-key.js
//             ← server/core/image-error-policy.js:25 import（运行时真实依赖）
//             ← scripts/verify/auth-key-parity-check.mjs:36 动态 import（前后端 parity 门禁）
//         · api-gateway/gateway-registry.js
//             ← server/channel-config.js:5 import（运行时真实依赖）
//         · api-gateway/gateways/jingyin-online.js
//             ← 被 gateway-registry.js:1 import（运行时，经 registry 间接依赖）
//             ← scripts/verify/routing-check.mjs:735 动态 import（路由契约门禁）
//       为什么不纳入：这些文件**各自有专属门禁守护**（KEY 清洗靠 auth-key-parity 做前后端比对、
//       网关靠 routing-check 钉契约）。若纳入 server-duplication-check，同一函数在前后端各有一份
//       （这是**设计如此**，不是复制粘贴）会被误报成"跨文件同名"，稀释逐文件语义。
//       ⚠️ 代价（必须知道）：本收集器的消费者（server-duplication-check、state-singleton-check）
//       **看不到 features/ 内部的改动**。改这些文件要靠上面两个专属脚本兜住，别以为"门禁全绿"就没事。
//
//   - server/skill-baselines/** —— **冻结的历史快照**（V3 时代的 main.jsx / server-index.js 整份副本）。
//       用途仅为取证对照（看"当时是什么样"），**禁止修改**；纳入扫描会让几乎每个函数都报重复，故排除。
//
//   - server/static-assets.generated.js —— **生成物**，由 scripts/generate-static-assets.mjs 产出，非手写源码。
//
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
// 排除理由与实测证据见文件头「排除范围」注释块（V11-RF-023）——改这里前先看那段。
const INCLUDE_DIRS = ["core", "routes", "shared"];

// server/ 顶层的手写入口文件。index.js 与 app.js 是同一份装配层的两半（见头部注释），
// 两者要么都在、要么都不在；**再拆出新的一半，必须同步加到本数组**，否则那部分代码会脱离门禁。
const INCLUDE_TOPLEVEL_FILES = ["index.js", "app.js"];

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
  for (const name of INCLUDE_TOPLEVEL_FILES) {
    const file = path.join(SERVER_DIR, name);
    if (existsSync(file)) out.push(file);
  }
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
