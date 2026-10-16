// 详情 v2 视觉风格包「关闭（off）」选项轻量断言（纯逻辑，不起服务、不联网、不扣费）。
//
// 覆盖执行单「详情v2-1b」验证项：
//   A. 规则层：stylePackForGroup off → { pack: null, reason: "用户关闭视觉风格" }
//      （不进轮换、不进平台禁配回落，任何平台一致）；buildSkillPackV2 off → null；
//      buildStylePackRound 对 pack 为空判空返回 null；auto / 手动指定 / 平台禁配回落回归不变。
//   B. 中间件集成：v2 + off（含主图首屏）→ 所有屏无【视觉风格锁】/ 无【构图变体】、
//      分组 stylePack 缺省、rounds 无风格包轮次、params 无 stylePackId，且与同输入 v1 输出
//      等价（除 id/时间戳）——off 即「无风格包」；v2-auto 首屏强制 S1 / 风格锁 / 轮次回归仍在；
//      v1 + 任意 stylePackId（off/S5/垃圾值）→ 无风格包字段（v1 不受影响）。
//   C. 源码钉桩：detail-ai.js v2 指令块带 v2Context 判空（off 不抛）；
//      detail-middleware.js off 归一为无风格包、首屏 S1 仍随 styleDecision 判真（不单独写死）；
//      前端归一化放行 off、选项含「关闭视觉风格」、v1 下拉仍 disabled。
//
// v1 逐字节不变由提交前一次性旧码对照探针证明（git worktree 旧码 vs 新码 JSON 比对），
// 不在本常驻门禁范围内（合入后旧码即不存在）。
//
// 用法：node scripts/verify/detail-stylepack-off-check.mjs
import process from "node:process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildSkillPackV2,
  buildStylePackRound,
  stylePackForGroup
} from "../../prompts/server/detail-skills-v2/index.js";
import { buildDetailPromptGroup } from "../../server/detail-middleware.js";
import { PLATFORM_SKILLS } from "../../prompts/server/detail-skills.js";

const ROOT = process.cwd();
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

const taobaoMain = PLATFORM_SKILLS["taobao-main"]; // 主图页型（首屏强制 S1 的场景）
const tmallDetail = PLATFORM_SKILLS["tmall-detail"]; // S5 禁配平台

// ---------- A. 规则层 ----------
const offDecision = stylePackForGroup({ groupIndex: 3, platformSkill: taobaoMain, userChoice: "off" });
check("A1 stylePackForGroup: off → pack 为 null", offDecision.pack === null, JSON.stringify(offDecision));
check("A2 stylePackForGroup: off → reason 为「用户关闭视觉风格」",
  offDecision.reason === "用户关闭视觉风格", offDecision.reason);
check("A3 stylePackForGroup: off → groupIndex 保留（不视作 1）",
  offDecision.groupIndex === 3, String(offDecision.groupIndex));

// off 在平台禁配语境下也不回落轮换（禁配表只影响具体包，不影响 off）
const offBanned = stylePackForGroup({ groupIndex: 1, platformSkill: tmallDetail, userChoice: "off" });
check("A4 stylePackForGroup: off 不进轮换/不进平台禁配回落（任何平台一致）",
  offBanned.pack === null && offBanned.reason === "用户关闭视觉风格", JSON.stringify(offBanned));

// 回归：auto / 手动指定 / 平台禁配回落行为不变
const autoDecision = stylePackForGroup({ groupIndex: 1, platformSkill: taobaoMain, userChoice: "auto" });
check("A5 回归: auto 第 1 组轮换为 S2（S1 不进池）", autoDecision.pack?.id === "S2", autoDecision.pack?.id);
const s6Decision = stylePackForGroup({ groupIndex: 1, platformSkill: taobaoMain, userChoice: "S6" });
check("A6 回归: 手动指定 S6 → S6", s6Decision.pack?.id === "S6", s6Decision.pack?.id);
const bannedDecision = stylePackForGroup({ groupIndex: 1, platformSkill: tmallDetail, userChoice: "S5" });
check("A7 回归: S5 + tmall-detail → 平台禁配回落（非 S5 且 reason 含「不适用」）",
  bannedDecision.pack?.id !== "S5" && bannedDecision.reason.includes("不适用"),
  `${bannedDecision.pack?.id} | ${bannedDecision.reason}`);

// buildSkillPackV2 / buildStylePackRound 判空
check("A8 buildSkillPackV2: off → null（detail-ai v2Context 随之为 null，不抛）",
  buildSkillPackV2({ input: { stylePackId: "off", detailGroupIndex: 2 }, platformSkill: taobaoMain }) === null);
const v2AutoPack = buildSkillPackV2({ input: { stylePackId: "auto", detailGroupIndex: 1 }, platformSkill: taobaoMain });
check("A9 回归: buildSkillPackV2 auto → 含 stylePack 字段（S2）",
  Boolean(v2AutoPack) && v2AutoPack.stylePack?.id === "S2", v2AutoPack?.stylePack?.id ?? "null");
check("A10 buildStylePackRound: decision 为空 / pack 为空 → null",
  buildStylePackRound(null) === null && buildStylePackRound({ pack: null, reason: "x" }) === null);
const autoRound = buildStylePackRound(autoDecision);
check("A11 回归: buildStylePackRound auto → 正常轮次对象",
  autoRound?.stage === "视觉风格包" && String(autoRound.title).includes("S2"), autoRound?.title ?? "null");

// ---------- B. 中间件集成 ----------
function buildGroup(skillVersion, stylePackId, workflow = "taobao-main", groupIndex = 1) {
  return buildDetailPromptGroup({
    workflow,
    count: 3,
    productName: "测试商品",
    detailGroupIndex: groupIndex,
    detailSkillVersion: skillVersion,
    stylePackId,
    ratio: "3:4",
    imageSize: "2K"
  }, [], {});
}

const v1Group = buildGroup("v1", "auto");
const offGroup = buildGroup("v2", "off");
const autoGroup = buildGroup("v2", "auto");
const s6Group = buildGroup("v2", "S6");
const bannedGroup = buildGroup("v2", "S5", "tmall-detail");

// v2-off 语义（含主图首屏）
check("B1 v2-off: 分组无 stylePack 字段（角标自动为空）",
  offGroup.stylePack === undefined, JSON.stringify(offGroup.stylePack ?? null));
check("B2 v2-off: 所有屏（含主图首屏）无【视觉风格锁】",
  offGroup.prompts.every((p) => !p.text.includes("【视觉风格锁】")));
check("B3 v2-off: 主图首屏无 S1 / 白底极简（首屏强制 S1 已随 off 关闭）",
  !offGroup.prompts[0].text.includes("S1") && !offGroup.prompts[0].text.includes("白底极简"));
check("B4 v2-off: 所有屏无【构图变体】（variantFor 随 screenPack 为空不启用）",
  offGroup.prompts.every((p) => !p.text.includes("【构图变体】")));
check("B5 v2-off: rounds 无「视觉风格包」轮次",
  offGroup.rounds.every((r) => r.stage !== "视觉风格包"));
check("B6 v2-off: params 无 stylePackId / detailSkillVersion",
  offGroup.params.stylePackId === undefined && offGroup.params.detailSkillVersion === undefined);

// off 与 v1 输出等价（除 id/时间戳）——「off 即无风格包」的强不变式
const stripVolatile = (group) => JSON.stringify({ ...group, id: null, label: null, createdAt: null });
check("B7 v2-off 与同输入 v1 输出等价（除 id/时间戳）",
  stripVolatile(offGroup) === stripVolatile(v1Group));

// v2-auto / S6 / 禁配回落回归
check("B8 回归: v2-auto 主图首屏有 S1 安全款锁行",
  autoGroup.prompts[0].text.includes("【视觉风格锁】本屏为主图首屏安全款 S1《白底极简》"));
check("B9 回归: v2-auto 分组带 stylePack 字段（S2）",
  autoGroup.stylePack?.id === "S2", autoGroup.stylePack?.id ?? "null");
check("B10 回归: v2-auto 其余屏有风格锁行",
  autoGroup.prompts.slice(1).every((p) => p.text.includes("【视觉风格锁】")));
check("B11 回归: v2-auto rounds 含「视觉风格包」轮次",
  autoGroup.rounds.some((r) => r.stage === "视觉风格包"));
check("B12 回归: v2-auto params.stylePackId=S2",
  autoGroup.params.stylePackId === "S2", String(autoGroup.params.stylePackId));
check("B13 回归: v2 手动 S6 → 分组 stylePack=S6",
  s6Group.stylePack?.id === "S6", s6Group.stylePack?.id ?? "null");
check("B14 回归: v2 S5+tmall-detail → 禁配回落（stylePack 非 S5 且 reason 含「不适用」）",
  bannedGroup.stylePack?.id !== "S5" && String(bannedGroup.stylePack?.reason).includes("不适用"),
  `${bannedGroup.stylePack?.id} | ${bannedGroup.stylePack?.reason}`);

// v1 不受影响（含 off/S5/垃圾值 stylePackId）
check("B15 v1: 任意 stylePackId（off/S5/auto/S99/空/undefined）→ 分组无 stylePack 字段",
  ["off", "S5", "auto", "S99", "", null, undefined].every((id) => buildGroup("v1", id).stylePack === undefined));
check("B16 v1: 无任何屏出现风格锁行 / 构图变体",
  v1Group.prompts.every((p) => !p.text.includes("【视觉风格锁】") && !p.text.includes("【构图变体】")));
check("B17 v1: rounds 无「视觉风格包」轮次",
  v1Group.rounds.every((r) => r.stage !== "视觉风格包"));

// ---------- C. 源码钉桩 ----------
const aiSource = readFileSync(path.join(ROOT, "server/detail-ai.js"), "utf8");
check("C1 钉桩: detail-ai.js v2 指令块带 v2Context 判空（off 时 v2Context=null，不抛）",
  /skillVersion === "v2" && v2Context/.test(aiSource));
const mwSource = readFileSync(path.join(ROOT, "server/detail-middleware.js"), "utf8");
check("C2 钉桩: detail-middleware.js 把 pack 为空的 decision 归一为无风格包",
  /rawStyleDecision && rawStyleDecision\.pack \? rawStyleDecision : null/.test(mwSource));
check("C3 钉桩: 首屏 S1 仍随 styleDecision 判真（未在首屏单独写死 S1）",
  /mainFirstScreen \? STYLE_PACKS\.S1 : styleDecision\.pack/.test(mwSource));
const groupSource = readFileSync(path.join(ROOT, "src/features/detail/detail-group.js"), "utf8");
check("C4 钉桩: 前端归一化放行 off（不回落 auto）",
  /stylePackId === "off" \|\| \/\^S\[1-8\]\$/.test(groupSource));
const stateSource = readFileSync(path.join(ROOT, "src/features/detail/detail-state.js"), "utf8");
check("C5 钉桩: 前端选项含「关闭视觉风格」",
  /value: "off", label: "关闭视觉风格"/.test(stateSource));
const viewSource = readFileSync(path.join(ROOT, "src/features/detail/DetailView.jsx"), "utf8");
check("C6 钉桩: v1 下视觉风格包下拉仍 disabled",
  /disabled=\{detailSettings\.detailSkillVersion !== "v2"\}/.test(viewSource));
check("C7 钉桩: 分组 tab 角标随 stylePack 缺省为空（off 时不显示 ·S1）",
  /\{group\.stylePack \? `·\$\{group\.stylePack\.id\}` : ""\}/.test(viewSource));
check("C8 钉桩: 分组头角标随 stylePack 缺省为空（off 时不显示 S1·白底极简）",
  /\{activeDetailGroup\.stylePack \? `\$\{activeDetailGroup\.stylePack\.id\}·\$\{activeDetailGroup\.stylePack\.name\} · ` : ""\}/.test(viewSource));

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  offChars: offGroup.prompts[0].text.length,
  v1Chars: v1Group.prompts[0].text.length,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
