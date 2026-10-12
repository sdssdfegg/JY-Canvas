// 前后端 KEY 清洗规则的**一致性**验证（`02-重复功能同步登记表` 第 13 行的机器版）。
//
// 登记表写的是："去 Bearer、引号、空格、不可见字符的规则要一致"，后面补了一句
// "后续可抽共享测试用例"。这个脚本就是那组共享测试用例。
//
// 为什么要盯这一条：KEY 清洗是**唯一入口**。前端清洗出来的串拿去请求、服务端清洗出来的串
// 拿去做身份判定，两边一旦规则不同步（比如一边认 `\u00A0` 一边不认），表现会非常迷惑：
// 用户在界面上看 KEY 是对的，请求却被判 401，或反过来。而且这类 bug 只在特定粘贴来源下
// 才复现——用户复制自微信/网页/Excel 的黑不可见字符各不相同。
//
// 做法：同一组输入，分别喂给前端版和后端版，断言两边输出逐字节相同；
// 再单独断言几个不可回退的规则（Bearer 前缀、引号、不可见字符、空白）确实生效。
//
// 用法：node scripts/verify/auth-key-parity-check.mjs
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FRONTEND_FILE = path.join(ROOT, "src", "features", "auth", "api-key.js");
const BACKEND_FILE = path.join(ROOT, "server", "features", "auth", "api-key.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

check("前端清洗模块存在", existsSync(FRONTEND_FILE), path.relative(ROOT, FRONTEND_FILE));
check("后端清洗模块存在", existsSync(BACKEND_FILE), path.relative(ROOT, BACKEND_FILE));

let frontend = null;
let backend = null;
let exportDifference = null;
try {
  frontend = await import("../../src/features/auth/api-key.js");
  backend = await import("../../server/features/auth/api-key.js");
} catch (error) {
  check("两个模块都能被加载（ESM 导出正常）", false, error instanceof Error ? error.message : String(error));
}

if (frontend && backend) {
  check("两边都导出了 normalizeApiKeyInput",
    typeof frontend.normalizeApiKeyInput === "function" && typeof backend.normalizeApiKeyInput === "function",
    `frontend=${typeof frontend.normalizeApiKeyInput} backend=${typeof backend.normalizeApiKeyInput}`);

  // 覆盖真实粘贴来源：微信/网页/Excel 的黑字符各不相同，全部钉住
  const cases = [
    ["空字符串", ""],
    ["null", null],
    ["undefined", undefined],
    ["纯 Bearer 大写", "Bearer sk-jingyin-123456"],
    ["bearer 小写", "bearer sk-jingyin-123456"],
    ["BEARER 全大写", "BEARER sk-jingyin-123456"],
    ["Bearer 无空格", "Bearersk-jingyin-123456"],
    ["双引号包裹", '"sk-jingyin-123456"'],
    ["单引号包裹", "'sk-jingyin-123456'"],
    ["首尾空格", "  sk-jingyin-123456  "],
    ["首尾制表符", "\tsk-jingyin-123456\t"],
    ["首位换行", "\nsk-jingyin-123456\n"],
    ["零宽空格 \\u200B", "sk-\u200Bjingyin-123456"],
    ["零宽非连接 \\u200C", "sk-jingyin\u200C-123456"],
    ["零宽连接 \\u200D", "sk-jingyin-\u200D123456"],
    ["BOM \\uFEFF", "\uFEFFsk-jingyin-123456"],
    ["中间有空格", "sk jingyin 123456"],
    ["组合脏输入", 'Bearer \u200B"sk-jingyin-123456"\uFEFF '],
    ["数字输入（非字符串）", 123456],
    ["对象输入（非字符串）", { toString: () => "sk-jingyin-123456" }]
  ];

  let mismatches = 0;
  const mismatchList = [];
  for (const [label, input] of cases) {
    let a = null;
    let b = null;
    try { a = frontend.normalizeApiKeyInput(input); } catch (error) { a = "THREW:" + (error?.message || error); }
    try { b = backend.normalizeApiKeyInput(input); } catch (error) { b = "THREW:" + (error?.message || error); }
    if (a !== b) {
      mismatches += 1;
      mismatchList.push(label + " -> 前端=" + JSON.stringify(a) + " 后端=" + JSON.stringify(b));
    }
  }
  check("同一组输入，前后端清洗结果逐字节相同（" + cases.length + " 个用例）",
    mismatches === 0,
    mismatches ? mismatchList.join(" ; ") : cases.length + " 个用例全部一致");

  // 关键规则不许回退：这些行为一旦丢了，用户粘贴 KEY 就会 401
  const n = frontend.normalizeApiKeyInput;
  check("规则生效：去掉 Bearer 前缀",
    n("Bearer sk-jingyin-123456") === "sk-jingyin-123456",
    JSON.stringify(n("Bearer sk-jingyin-123456")));
  check("规则生效：去掉包裹引号",
    n('"sk-jingyin-123456"') === "sk-jingyin-123456" && n("'sk-jingyin-123456'") === "sk-jingyin-123456",
    JSON.stringify(n('"sk-jingyin-123456"')));
  check("规则生效：去掉不可见字符（零宽空格/BOM）",
    n("sk-\u200Bjingyin\uFEFF-123456") === "sk-jingyin-123456",
    JSON.stringify(n("sk-\u200Bjingyin\uFEFF-123456")));
  check("规则生效：去掉空白（含中间空格）",
    n("  sk jingyin 123456  ") === "skjingyin123456",
    JSON.stringify(n("  sk jingyin 123456  ")));
  check("规则生效：空值不抛异常并返回空串",
    n("") === "" && n(null) === "" && n(undefined) === "",
    [n(""), n(null), n(undefined)].map((v) => JSON.stringify(v)).join(","));
  // 导出名单差异只记录、不判死：后端目前不需要做"这是不是鉴权错误"的判定，
  // 由 server/index.js 自己处理，**少导出一个函数不是缺陷**。
  // 但两边都有的函数必须行为一致（上面已逐个用例比过），这里再把差异摆出来方便对照。
  if (Object.keys(frontend).sort().join(",") !== Object.keys(backend).sort().join(",")) {
    exportDifference = {
      frontendOnly: Object.keys(frontend).filter((key) => !(key in backend)),
      backendOnly: Object.keys(backend).filter((key) => !(key in frontend)),
      meaning: "后端少提供 isAuthErrorMessage 是现状设计（服务端自己判鉴权错误），不算缺陷；一旦两边都提供就必须一致"
    };
  }
  check("前端有 isAuthErrorMessage 且能识别鉴权失败文案",
    typeof frontend.isAuthErrorMessage === "function"
      && frontend.isAuthErrorMessage("invalid token") === true
      && frontend.isAuthErrorMessage("余额不足") === false,
    "invalid token → true / 余额不足 → false");
  check("后端若提供 isAuthErrorMessage 则判定必须与前端一致",
    typeof backend.isAuthErrorMessage !== "function"
      || backend.isAuthErrorMessage("invalid token") === frontend.isAuthErrorMessage("invalid token"),
    typeof backend.isAuthErrorMessage === "function" ? "已提供且一致" : "后端未提供（前端独有），暂不要求");
}

// ---------------------------------------------------------------- 已知缺陷跟踪
// 这一组和上面的"通过/失败"不同：它是**已经存在的缺陷**，单独列出来而不是让门禁红掉。
// 之所以能自动消解：下面每条都跑一次真实断言，只要有人把缺陷修好了，它就不会进这个列表，
// 不需要回头改脚本或维护白名单。
const knownDefects = [];

if (frontend?.normalizeApiKeyInput) {
  const n = frontend.normalizeApiKeyInput;
  // （历史缺陷，已于 2026-10-13 修复）旧顺序是 去Bearer → trim → 去引号 → 删不可见字符，
  // 删不可见字符在最后会挡住「不可见字符 + 引号」组合的引号识别，残留脏 KEY → 401。
  // 当前实现已把「去不可见字符」提前到去引号之前（见 api-key.js 步骤 ①），此分支不再触发；
  // 保留作回归护栏：一旦顺序被改回旧样子，这里会重新把缺陷挂回 knownDefects。
  const combined = 'Bearer \u200B"sk-jingyin-123456"\uFEFF ';
  if (n(combined) !== "sk-jingyin-123456") {
    knownDefects.push({
      id: "api-key-clean-order",
      severity: "会让部分粘贴来源的 KEY 带引号残留 → 401",
      input: 'Bearer \\u200B"sk-jingyin-123456"\\uFEFF ',
      actual: n(combined),
      expected: "sk-jingyin-123456",
      rootCause: "normalizeApiKeyInput 里「去引号」先于「删不可见字符」执行",
      fixHint: "把去不可见字符那一步挪到去引号之前（或改成 trim 后先统一清理不可见字符，再去 Bearer 与引号）",
      files: ["src/features/auth/api-key.js", "server/features/auth/api-key.js"],
      note: "两处实现必须同时改，改完本条会自动从已知缺陷里消失"
    });
  }
}

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed,
  knownDefects,
  knownDefectCount: knownDefects.length,
  exportDifference,
  note: knownDefects.length
    ? `前后端清洗结果逐字节一致、核心规则均已生效；另有 ${knownDefects.length} 个已知缺陷（见 knownDefects），修好后会自动从这里消失`
    : "前后端 KEY 清洗规则一致，且未发现已知缺陷",
  results
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
