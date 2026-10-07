// RF-074 的 ESLint 消息集比对：BASE(5635b04) vs 改后（工作区），判据 = 0 新增 / 0 消失。
// 另做负向对照：注入一个未使用变量，必须被点名 ⇒ 证明比对不是恒真断言。
// 用法: ./runtime/node/node.exe scripts/dev/rf074-lint-compare.mjs
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const TARGET = "src/main.jsx";
const BASE_REV = "5635b04";
const FACTORY_REL = "src/features/result-queue/quick-result-replace.js";

function gitShow(rev, path) {
  return new Promise((resolve, reject) => {
    const p = spawn("git", ["show", `${rev}:${path}`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `git show exit ${code}`))));
  });
}

// 抹掉行号/列号：同一条告警因代码整体位移导致的行号变化不应计为新增/消失
const key = (m) => `${m.ruleId}|${String(m.message || "").replace(/at line \d+/gu, "at line N").replace(/\b\d+\s*屏\b/gu, "N屏")}`;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const { ESLint } = await import(pathToFileURL(`${ROOT}/node_modules/eslint/lib/api.js`).href);
const eslint = new ESLint();
const absTarget = `${ROOT}/${TARGET}`;

const baseText = await gitShow(BASE_REV, TARGET);
const nowText = readFileSync(absTarget, "utf8");

const lintOne = async (text) => {
  const [res] = await eslint.lintText(text, { filePath: absTarget });
  return res.messages;
};

console.log("== ESLint 消息集比对（src/main.jsx） ==");
const baseMsgs = await lintOne(baseText);
const nowMsgs = await lintOne(nowText);
console.log(`  BASE(${BASE_REV}) = ${baseMsgs.length} 条；改后 = ${nowMsgs.length} 条`);

const bag = (msgs) => {
  const map = new Map();
  for (const m of msgs) map.set(key(m), (map.get(key(m)) || 0) + 1);
  return map;
};
const b = bag(baseMsgs);
const n = bag(nowMsgs);
const added = [];
const gone = [];
for (const [k, c] of n) if ((b.get(k) || 0) < c) added.push(`${k} (+${c - (b.get(k) || 0)})`);
for (const [k, c] of b) if ((n.get(k) || 0) < c) gone.push(`${k} (-${c - (n.get(k) || 0)})`);

for (const m of nowMsgs) console.log(`    [now] ${m.ruleId} ${m.line}:${m.column} ${String(m.message || "").slice(0, 60)}`);
check("lint:no-new-messages", added.length === 0, added.join(" ; "));
check("lint:no-lost-messages", gone.length === 0, gone.join(" ; "));
const [factoryRes] = await eslint.lintText(readFileSync(`${ROOT}/${FACTORY_REL}`, "utf8"), { filePath: `${ROOT}/${FACTORY_REL}` });
check("lint:factory-file-clean", factoryRes.messages.length === 0, `工厂文件消息数=${factoryRes.messages.length}`);

console.log("== 负向对照：注入未使用变量必须被点名 ==");
const lines = nowText.split("\n");
const probeA = `  const zzzUnusedA = 1;`;
const inject = [...lines.slice(0, 3042), probeA, ...lines.slice(3042)].join("\n");
const injMsgs = await lintOne(inject);
const hits = injMsgs.filter((m) => m.ruleId === "no-unused-vars" && /zzzUnusedA/u.test(String(m.message)));
check("neg:unused-var-detected", hits.length > 0, `命中 ${hits.length} 条（${hits.map((h) => h.line).join(",")} 行）`);
// 第二阶段再注入一处 ⇒ 计数应再多一条（证明是按处点名，不是只报一次）
const inject2 = [...lines.slice(0, 3042), probeA, ...lines.slice(3042, 3800), "  const zzzUnusedB = 2;", ...lines.slice(3800)].join("\n");
const inj2 = (await lintOne(inject2)).filter((m) => m.ruleId === "no-unused-vars" && /zzzUnused[AB]/u.test(String(m.message)));
check("neg:second-injection-adds-hit", inj2.length === hits.length + 1, `一次=${hits.length} 两次=${inj2.length}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n比对结果: ${failed.length === 0 ? "ALL PASS" : `FAILURES=${failed.length}`} (共 ${results.length} 项)`);
process.exit(failed.length ? 1 : 0);
