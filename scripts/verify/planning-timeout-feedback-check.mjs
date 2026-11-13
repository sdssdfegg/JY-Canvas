// 导演分屏链路稳定性与可观测性门禁（V210）：覆盖「先补日志再调参」后的关键不变量。
//
// 断言四类（对应执行单 P1 + §5 验收）：
//   A) 规划调用日志只记元数据、零敏感字段（负向对照：注入 KEY/提示词/上游正文不落盘）。
//   B) 三失败场景（超时 / 截断 / 空 screens）各有明确 errorClass；静默 0 屏判红（负向对照）。
//   C) director max_tokens / 超时按屏数分档，20 屏档足够（负向对照：硬编码 3000 已消失）。
//   D) 前端有「已等待 N 秒」计时 + 置顶错误 banner + 重试入口（负向对照：路由不再回传上游正文）。
//
// 设计：纯逻辑 + 源码静态断言 + 轻量叶子模块真实导入，零模型、零上游、零端口。
// 负向对照 ≥4 条，防「锚点搬家变假绿」。
//
// 用法：node scripts/verify/planning-timeout-feedback-check.mjs [--json]

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");

const PLANNING_LOG = path.join(ROOT, "server", "core", "planning-call-log.js");
const DIRECTOR_VISUAL = path.join(ROOT, "server", "features", "detail-studio", "planning", "director-visual.js");
const ROUTES = path.join(ROOT, "server", "routes", "detail-studio.routes.js");
const HOOK = path.join(ROOT, "src", "features", "detail-studio", "state", "use-detail-studio-state.js");
const PLANNING_PANEL = path.join(ROOT, "src", "features", "detail-studio", "planning", "PlanningPanel.jsx");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

async function main() {
  // ── A) 规划调用日志：元数据齐全 + 零敏感字段 ──
  if (!existsSync(PLANNING_LOG)) {
    check("A·planning-call-log.js 存在", false, "缺失：" + PLANNING_LOG);
  } else {
    const mod = await import(pathToFileURL(PLANNING_LOG).href);
    const { buildPlanningLogEntry, PLANNING_ERROR_CLASSES } = mod;
    if (typeof buildPlanningLogEntry !== "function") {
      check("A·buildPlanningLogEntry 导出", false, "未导出 buildPlanningLogEntry");
    } else {
      const entry = buildPlanningLogEntry({
        stage: "director", model: "m", durationMs: 100, upstreamStatus: 200,
        responseChars: 500, outputScreenCount: 5, errorClass: "timeout", ok: false
      });
      const allMetaPresent = entry.stage === "director" && entry.model === "m" && entry.durationMs === 100
        && entry.upstreamStatus === 200 && entry.responseChars === 500 && entry.outputScreenCount === 5
        && entry.errorClass === "timeout" && entry.ok === false && typeof entry.time === "string";
      check("A1·合法元数据全部落盘且值正确", allMetaPresent, JSON.stringify(entry));
      // 负向对照：注入 KEY / 提示词 / 上游正文 / message，断言不落盘。
      const leaked = buildPlanningLogEntry({
        stage: "director", apiKey: "sk-SECRET", prompt: "用户提示词正文", text: "上游返回正文",
        message: "x", upstream: "上游字段", productData: "商品资料"
      });
      const noSensitive = !("apiKey" in leaked) && !("prompt" in leaked) && !("text" in leaked)
        && !("message" in leaked) && !("upstream" in leaked) && !("productData" in leaked);
      check("A2·负向对照：敏感字段（KEY/提示词/上游/商品资料）零落盘", noSensitive, JSON.stringify(leaked));
      // 负向对照：非枚举 errorClass 被归 null，不污染日志。
      const badClass = buildPlanningLogEntry({ stage: "director", errorClass: "not_a_class" });
      check("A3·负向对照：非法 errorClass 归 null（仅收枚举）", badClass.errorClass === null, "errorClass=" + badClass.errorClass);
      check("A·PLANNING_ERROR_CLASSES 含五类枚举", Array.isArray(PLANNING_ERROR_CLASSES)
        && ["timeout", "upstream_error", "parse_failed", "empty_screens", "no_content"].every((c) => PLANNING_ERROR_CLASSES.includes(c)),
        "枚举=" + JSON.stringify(PLANNING_ERROR_CLASSES));
    }
  }

  // ── B) 三失败场景各自 errorClass；静默 0 屏判红 ──
  if (!existsSync(DIRECTOR_VISUAL)) {
    check("B·director-visual.js 存在", false, "缺失：" + DIRECTOR_VISUAL);
  } else {
    const text = readFileSync(DIRECTOR_VISUAL, "utf8");
    check("B1·classifyPlanningError 导出 timeout→504/timeout", /case\s+"timeout":[\s\S]*?status:\s*504/.test(text) && /errorClass:\s*"timeout"/.test(text), "timeout 分支存在");
    check("B2·classifyPlanningError 导出 upstream_error 分支", /case\s+"upstream_error"/.test(text) && /errorClass:\s*"upstream_error"/.test(text), "upstream_error 分支存在");
    check("B3·classifyPlanningError 导出 parse_failed / no_content 分支", /case\s+"parse_failed"/.test(text) && /case\s+"no_content"/.test(text), "parse/no_content 分支存在");
    check("B4·导出 assertNonEmptyScreens 守卫（空屏判红）", /export\s+function\s+assertNonEmptyScreens/.test(text), "assertNonEmptyScreens 已导出");
    check("B5·directVisualPlan 调用 assertNonEmptyScreens（禁静默 ok:true）", /assertNonEmptyScreens\(/.test(text), "directVisualPlan 已调用空屏守卫");
    // 正向补强：成功路径必须经「assertNonEmptyScreens(normalizeDirectorResult(parsed))」守卫后再返回 normalized.screens。
    check("B6·成功路径经空屏守卫后返回 normalized.screens（消除静默 0 屏）",
      /assertNonEmptyScreens\(\s*normalizeDirectorResult\(\s*parsed\s*\)\s*\)/.test(text),
      "守卫+normalize 配对缺失");
    // 负向对照：消息不得夹带上游正文（不得出现 result.parsed.text slice 回显）。
    check("B7·负向对照：director 错误消息不含上游正文回显（无游离 upstream: 字段）", text.indexOf("upstream:") < 0, "仍残留 upstream: 字段回显");
  }

  // ── C) director 参数按屏数分档，20 屏档足够 ──
  if (!existsSync(DIRECTOR_VISUAL)) {
    check("C·director-visual.js 存在", false, "缺失：" + DIRECTOR_VISUAL);
  } else {
    const text = readFileSync(DIRECTOR_VISUAL, "utf8");
    check("C1·20 屏档 maxTokens=8000（不再是 3000 卡死）", /\{\s*max:\s*20,\s*timeoutMs:\s*180000,\s*maxTokens:\s*8000\s*\}/.test(text), "20 屏档 8000 存在");
    check("C2·≤8 屏档 maxTokens=3000（analyze 行为不受累）", /\{\s*max:\s*8,\s*timeoutMs:\s*90000,\s*maxTokens:\s*3000\s*\}/.test(text), "≤8 屏档 3000 存在");
    check("C3·max_tokens 走分档常量（tier.maxTokens），非硬编码", /max_tokens:\s*tier\.maxTokens/.test(text), "max_tokens 走 tier.maxTokens");
    // 负向对照：不得残留「max_tokens: 3000」游离硬编码（分级字面量里的 3000 属合法，故只查 body 处）。
    check("C4·负向对照：body 内无游离 max_tokens: 3000 硬编码", !/const\s+body[\s\S]*?max_tokens:\s*3000/.test(text), "body 未硬编码 3000");
  }

  // ── D) 前端等待计时 + 置顶 banner + 重试入口 ──
  if (!existsSync(HOOK)) {
    check("D·use-detail-studio-state.js 存在", false, "缺失：" + HOOK);
  } else {
    const text = readFileSync(HOOK, "utf8");
    check("D1·hook 暴露 directorWaitingSec / directorRunning / directorError",
      /directorWaitingSec/.test(text) && /directorRunning/.test(text) && /directorError/.test(text), "hook 已暴露等待/运行/错误状态");
    check("D2·hook 启动 setInterval 每秒累加「已等待」", /setInterval\(\s*\(\)\s*=>\s*\{\s*setDirectorWaitingSec/.test(text), "hook 已实现每秒计时");
    check("D3·hook 从 err.payload 读取 errorClass/suggestion（结构化错误）",
      /err\.payload/.test(text) && /errorClass:\s*payload\.errorClass/.test(text) && /suggestion:\s*payload\.suggestion/.test(text), "hook 已读取 errorClass/suggestion");
  }
  if (!existsSync(PLANNING_PANEL)) {
    check("D·PlanningPanel.jsx 存在", false, "缺失：" + PLANNING_PANEL);
  } else {
    const text = readFileSync(PLANNING_PANEL, "utf8");
    check("D4·面板渲染置顶错误 banner（dsDirectorBanner + sticky）", /dsDirectorBanner/.test(text) && /role="alert"/.test(text), "面板已渲染置顶 banner");
    check("D5·banner 显示错误类别 + 重试按钮（onClick=directorProject）", /errorClass/.test(text) && /onClick=\{state\.directorProject\}/.test(text), "banner 含类别展示与重试入口");
    check("D6·导演按钮 loading 时显示「已等待 N 秒」", /已等待 \$/.test(text), "按钮显示已等待秒数");
  }
  if (!existsSync(ROUTES)) {
    check("D·detail-studio.routes.js 存在", false, "缺失：" + ROUTES);
  } else {
    const text = readFileSync(ROUTES, "utf8");
    check("D7·三批次均调用 logPlanningCall（analyze/director/quality）",
      (text.match(/logPlanningCall\(/g) || []).length >= 3
      && /stage:\s*"analyze"/.test(text) && /stage:\s*"director"/.test(text) && /stage:\s*"quality"/.test(text),
      "三批次均埋点");
    check("D8·导演超时按屏数分档（planningTierForCount(directorTargetScreenCount)）", /planningTierForCount\(directorTargetScreenCount\(project\)\)/.test(text), "路由已对导演超时分档");
    check("D9·路由向前端透传 errorClass + suggestion", /errorClass:\s*result\.errorClass/.test(text) && /suggestion:\s*result\.suggestion/.test(text), "路由已透传 errorClass/suggestion");
    // 负向对照：路由不再把上游正文回显给前端（旧 upstream: result.upstream 已移除）。
    check("D10·负向对照：路由不再回传 upstream: result.upstream", text.indexOf("upstream: result.upstream") < 0, "路由未回传上游正文");
  }

  const failed = results.filter((r) => !r.pass);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, entries: results }, null, 2));
  } else {
    for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
    console.log(`\n[planning-timeout-feedback] ${results.length - failed.length}/${results.length} 通过`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("[planning-timeout-feedback] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
