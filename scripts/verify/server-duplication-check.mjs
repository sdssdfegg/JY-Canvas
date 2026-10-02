// 服务端同名函数重复门禁（V11-RF-016 交付物）。
//
// 与前端跨文件同名组件门禁 shared-ui-duplication-check.mjs 同款思路，但针对【服务端函数】：
// 断言「顶层函数声明」在整个服务端源码里只允许 1 处定义文件——
// 跨文件同名 = 漂移源（复制薄包装、同名两份实现早晚分叉，V11-RF-106→110 就是这么来的）。
//
// 为什么是棘轮：存量（若有）记账，新增即失败；抽到共享模块消掉后跑 --update 划掉。
//
// 源码范围严格复用 V11-RF-010 的 listServerSourceFiles()：
//   server/index.js + server/core/** + server/routes/** + server/shared/**
// 天然排除 server/skill-baselines/**（历史同名副本大量存在，必须排除）、
// server/features/**、生成物。
//
// 只认「行首（列 0）」的 `function NAME(` 与 `async function NAME(`：
// 不扫缩进的内层函数 / 箭头函数（局部同名是正常作用域，全扫会大量误报）。
//
// 退出码：通过 0 / 失败 1。JSON 输出含每个重复名的「文件:行号」清单（点名两处）。
// 用法：
//   node scripts/verify/server-duplication-check.mjs            # 检查
//   node scripts/verify/server-duplication-check.mjs --update   # 刷新基线（去重后执行）
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { listServerSourceFiles } from "./lib/server-sources.mjs"

const ROOT = process.cwd()
const BASELINE = path.join(ROOT, "scripts", "verify", "server-duplication-baseline.json")
const UPDATE = process.argv.includes("--update")

// 只认「行首（列 0）」的函数声明：不扫缩进的内层函数 / 箭头函数（局部同名是正常作用域，全扫会大量误报）。
//
// 🔴 V11-RF-026 修正（2026-10-02）：原正则漏掉 `export function`
//   - 旧：`/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm`
//   - 新：`/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm`
//   实测（tmp/scan-def-forms.mjs，门禁范围内 50 文件）：行首顶层函数声明**合计 205 个**，
//   其中 `export function` 118 + `export async function` 41 = **159 个（77.6%）旧判据看不见**，
//   旧判据只命中 46 个 ⇒ **「门禁全绿」只等于「在旧判据下没有重复」，不等于「没有重复」**（§0.9 第 17 条）。
//   活证据：`createAbortSignal` 在 `server/core/http-client.js:15` 是 `export function`、
//   在 `server/billing-gateway.js:153` 是裸 `function` —— 旧判据只点名后者。
//   本行只修「函数声明族」；箭头函数常量（`const NAME = (`）**仍不收**（服务端该形式极少，
//   收进来只改变基数），若要收另开工单并在 commit 说明。⚠️ 前端 019 的第一条正则**同病**
//   （`lib/frontend-sources.mjs` 的 TOP_LEVEL_DEF_RES[0]），是否修正见 RF-026 汇报。
const DEF = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm

const files = listServerSourceFiles().sort()
const found = new Map() // name -> [{ file, line }]
const intraFile = []    // 同文件内重名（异常，但本门禁不拦）

for (const file of files) {
  let source
  try { source = readFileSync(file, "utf8") } catch { continue }
  const rel = path.relative(ROOT, file).replace(/\\/g, "/")
  const seenInFile = new Set()
  const re = new RegExp(DEF)
  let m = null
  while ((m = re.exec(source)) !== null) {
    const name = m[1]
    const line = source.slice(0, m.index).split(/\r?\n/).length
    if (!found.has(name)) found.set(name, [])
    found.get(name).push({ file: rel, line })
    if (seenInFile.has(name)) intraFile.push({ name, file: rel, line })
    seenInFile.add(name)
  }
}

// 跨文件同名（同一个名字出现在 2+ 个不同文件）
const duplicates = [...found.entries()]
  .filter(([, entries]) => new Set(entries.map((e) => e.file)).size > 1)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([name, entries]) => {
    const filesForName = [...new Set(entries.map((e) => e.file))].sort()
    return {
      name,
      fileCount: filesForName.length,
      files: filesForName,
      locations: entries.map((e) => `${e.file}:${e.line}`).sort()
    }
  })

// ---------------------------------------------------------------- 棘轮比对
const currentMap = Object.fromEntries(duplicates.map((d) => [d.name, d.files]))

function sameList(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
}

function locationsOf(name) {
  return (duplicates.find((d) => d.name === name)?.locations) || []
}

const payload = {
  note: "服务端跨文件同名函数基线：记录当前已存在的跨文件同名顶层函数，只用来拦「新增」。抽到共享模块（server/core 或 server/shared）消掉后跑一次 --update 把它从账单里划掉。",
  generatedAt: new Date().toISOString().slice(0, 10),
  duplicates: currentMap
}

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8")
  console.log("[server-dup-ratchet] 基线已刷新：" + Object.keys(currentMap).length + " 个跨文件同名函数")
  for (const d of duplicates) console.log("  " + d.name + " -> " + d.files.join(" | "))
  process.exit(0)
}

let baseline = null
if (existsSync(BASELINE)) {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"))
} else {
  console.error("[server-dup-ratchet] 找不到基线 scripts/verify/server-duplication-baseline.json")
  console.error("  首次接入请跑：node scripts/verify/server-duplication-check.mjs --update")
  process.exit(1)
}

const regressions = []
const improved = []

for (const [name, filesNow] of Object.entries(currentMap)) {
  const before = baseline.duplicates?.[name]
  if (before === undefined) {
    regressions.push({ name, kind: "new", files: filesNow, locations: locationsOf(name), hint: "新增的跨文件同名函数，应抽到共享模块而不是复制一份" })
    continue
  }
  const added = filesNow.filter((f) => !before.includes(f))
  if (added.length > 0) {
    regressions.push({ name, kind: "spread", files: filesNow, added, locations: locationsOf(name), hint: "原有同名又扩散到新文件" })
    continue
  }
  if (!sameList(filesNow, before)) improved.push({ name, before, now: filesNow })
}
for (const name of Object.keys(baseline.duplicates || {})) {
  if (!(name in currentMap)) improved.push({ name, before: baseline.duplicates[name], now: [] })
}

const ok = regressions.length === 0

console.log(JSON.stringify({
  ok,
  scannedFiles: files.length,
  scannedFunctions: [...found.values()].reduce((n, arr) => n + arr.length, 0),
  duplicateCount: duplicates.length,
  regressions,
  improved,
  intraFileDuplicates: intraFile,
  duplicates,
  baselineGeneratedAt: baseline.generatedAt,
  note: ok
    ? (intraFile.length ? `没有新增跨文件同名函数；但发现 ${intraFile.length} 处同文件内重名（见 intraFileDuplicates），属异常但不拦` : "没有跨文件同名函数，也没有新增")
    : `新增了 ${regressions.length} 处跨文件同名函数，请改为抽到共享模块后再跑；确实要接受就 --update 并说明原因`
}, null, 2))

process.exit(ok ? 0 : 1)
