// 服务端源码「真相源」统一收集器（V11-RF-010）。
//
// 为什么有这个文件：Phase 1 拆分后 server/index.js 已不是唯一真相源；
// 每拆一次（搬到 server/core、server/routes、server/shared）就改一遍各验证脚本，
// 清单一定会腐烂（routes/shared 一出现就会漏）。把所有"去哪找服务端源码"的逻辑收口到这里，
// 后续搬家脚本只需 import 本模块，不用逐个改。
//
// 纳入范围：
//   - server/*.js（**顶层全部手写 .js**）—— V11-RF-027-5（2026-10-02）从「只点名
//       index.js / app.js」改为「顶层全纳」。此前顶层 13 个 .js（7 个 *-ai.js、
//       detail-middleware.js、billing-gateway.js、channel.js、channel-config.js、
//       video-config.js、detail-skills.js、outfit-skill.js）**从来没进过本收集器**，
//       它们的 import 路径不受 import-path-check 校验、同名函数不受 server-duplication-check
//       校验——与 §0.9 第 16 条（真实代码落在扫描范围外）是同一类洞，方向是"从来没进过"。
//       纳入时机：V11-RF-027-1~027-4b 已把这些文件里的跨文件同名函数消到 0
//       （实测 64 文件 duplicateCount=0），此刻纳视野**零新增报红**。
//   - server/index.js
//   - server/app.js        —— V11-RF-220（2026-10-02）从 index.js 拆出的**装配层**，
//       是 index.js 的"另一半"，不是新写的模块。补录它的理由必须写清，否则后人会以为是随手加的：
//       **220 之前，app.js 里的这 552 行代码是包含在 server/index.js 内的，本就在本收集器的扫描范围内；
//       220 把它们搬进新文件后，若不补录，这 552 行会静默脱离 state-singleton / server-duplication /
//       routing 等全部门禁**——拆出动作本身反而削弱了护栏，这是 220 引入的真实盲区，故在此补上。
//       判定口径：凡"从 index.js 搬出去的装配层代码落在哪个文件，哪个文件就要进本清单"。
//       ⚠️ 【本段已过时，2026-10-02 RF-027-5 推翻】此处原文写"顶层其余 .js 暂不纳入、
//       纳入会改变判定基数，本次不做"。该判断的问题在于：**不纳入本身就是洞**——
//       顶层 .js 的 import 路径与同名函数双双脱离门禁，而"改变判定基数"恰恰是应该暴露
//       而不是回避的。027-1~027-4b 已把那批重复消到 0，现在纳视野零新增报红，故已全纳。
//       保留这段原文是为了让后人知道**这里曾经有过一个相反的决定**，以及它是怎么被推翻的。
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
// 实现上遍历上面点名的三个子目录 + server/ 顶层手写 .js + prompts/server，
// 因此上述排除项（features / skill-baselines / 生成物）天然不会被纳入。
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

// prompts/server/**（V11-RF-024「部分纳」落地，2026-10-02）。
//
// 为什么要纳（**纳入也要写理由，与「排除要写理由」同等重要**，§0.9 第 11 条）：
//   `prompts/server/detail-skills.js` 与 `prompts/server/outfit-skill.js` **正是两个转发壳
//   （`server/detail-skills.js`、`server/outfit-skill.js`）背后的真实实现**——壳是活壳，
//   删除会让服务起不来（见 README.md:183）。也就是说：**真实代码落在了门禁扫描范围之外**：
//     - 它们的相对 import 不受 `import-path-check` 校验（写错路径不会变红）；
//     - 它们的同名函数不受 `server-duplication-check` 校验（复制漂移不会被点名）。
//   这与 §0.9 第 16 条（app.js 那次：`真实代码落在扫描范围外`）是同一类洞，只是方向相反：
//   那次是"拆出去导致脱离"，这次是"从来就没进过"。
//
// 纳入前实测（2026-10-02，RF-024 测量报告）：
//   - 现状：48 文件 / 195 说明符 / duplication 0 新增 / import-path 0 violations；
//   - **仅纳 prompts/server（模式 B）：50 文件 / 197 说明符 / 0 新增报红 / 0 violations，
//     且 state-singleton / routing 输出与纳入前逐字节一致** ⇒ **零成本纳入**；
//   - 若连 server/ 顶层其余 .js 一起纳（模式 A）：63 文件 / 206 说明符 / **16 条新增跨文件同名**，
//     全部来自顶层 7 个 `*-ai.js` + `detail-middleware.js` + `billing-gateway.js`。
//
// 🔴 【本段已过时，2026-10-02 RF-027-5 落地】此处原文写"只纳 prompts/server，顶层其余 .js
//   暂不纳入"。现在顶层已全纳（见文件头「纳入范围」第 1 条与下方 INCLUDE_TOPLEVEL_FILES）。
//   那条路线是对的：那 16 条确实没有用 `--update` 记账，而是由 V11-RF-027-1~027-4b 逐个
//   真抽走（`createAbortSignal` 8→1；`ai-chat-shared.js` 收 11 族；`compactPreserveNewlines`
//   2→1），实测 64 文件 duplicateCount=0。保留原文以留下"为什么当时不纳"的证据链。
const INCLUDE_PROMPT_SERVER_DIR = "prompts/server";

// server/ 顶层手写 .js —— V11-RF-027-5（2026-10-02）从「点名制」改为「目录扫描制」。
//
// 为什么改：点名制（`["index.js","app.js"]`）的失败模式已经发生过两次——
//   · 220 拆出 app.js 时忘了补 ⇒ 552 行静默脱离门禁（文件头有记录）；
//   · 顶层 13 个 .js 从建库起就没进过 ⇒ 7 个 *-ai.js 的同名函数长期不受约束。
// 每次"新拆出一个文件"都要记得改这个数组，本身就是腐烂点。改成扫描整个顶层目录后，
// 新文件自动进视野，不需要任何人记得。
//
// 排除（**排除必须有理由**，§0.9 第 11 条）：
//   static-assets.generated.js —— 生成物，由 scripts/generate-static-assets.mjs 产出，非手写源码。
//
// index.js 与 app.js 是同一份装配层的两半（见头部注释），目录扫描会自然包含它们，
// 不需要再点名；**若将来把装配层再拆出第三个文件，无需改本文件**。
const EXCLUDE_TOPLEVEL_FILES = ["static-assets.generated.js"];

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

/** 返回服务端源码文件的绝对路径列表：
 *  server/*.js（顶层手写，排除生成物）+ server/core/** + server/routes/**
 *  + server/shared/** + prompts/server/**。
 *  任何纳入目录不存在都安全跳过，不会抛异常。 */
export function listServerSourceFiles() {
  const out = [];
  // server/ 顶层：目录扫描制（V11-RF-027-5），新文件自动进视野，无需手工补名单。
  let topEntries = [];
  try {
    topEntries = readdirSync(SERVER_DIR, { withFileTypes: true });
  } catch {
    topEntries = []; // 目录不存在：安全跳过
  }
  for (const entry of topEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    if (EXCLUDE_TOPLEVEL_FILES.includes(entry.name)) continue;
    out.push(path.join(SERVER_DIR, entry.name));
  }
  for (const dir of INCLUDE_DIRS) {
    collectJsIn(path.join(SERVER_DIR, dir), out);
  }
  // prompts/server 不在 server/ 下，按 ROOT 定位（V11-RF-024 部分纳，理由见上方注释块）。
  // 目录不存在时 collectJsIn 安全跳过，不会抛异常。
  collectJsIn(path.join(ROOT, INCLUDE_PROMPT_SERVER_DIR), out);
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
