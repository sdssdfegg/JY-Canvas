// 网关目标（线路）切换 —— 本地测速用。
//
// 背景：
//   出图 / 视频 / 提示词等一系列请求，最终打到哪个中转网关**完全由服务端决定**
//   （见 server/channel-config.js 的 PRIMARY_CHANNEL_API_BASE_URL），
//   前端请求体里带的 baseUrl 对出图无效（只对「连接测试」有效）。
//   所以想在「老服务器 / 新服务器」之间切换做 A/B 对比，必须让服务端这条地址能运行时切换。
//
// 设计：
//   - 这里登记两条中转线路（老服务器 = 默认，新服务器 = 本地测试）；
//   - 当前选中的线路持久化在本机 data/gateway-target.json，重启后仍生效；
//   - 默认 = 老服务器，保证客户侧行为完全不变；
//   - 一旦显式设置了 JINGYIN_GATEWAY_BASE_URL / JINGYIN_PRIMARY_CHANNEL_BASE_URL
//     环境变量（校验脚本的 mock、定制部署都是这么干的），就锁定到该地址并禁用切换，
//     避免切换状态泄漏进自检与既有部署。
//
// 安全：目标只能是下面显式登记的两条线路，不接受任意 URL（延续 G-6「只允许官方中转」）。
//
// ⚠️ 正式打包发布前：把「新服务器」这一条删掉（或把 NEW_GATEWAY_BASE_URL 置空），
//    发布包不应内置任何额外中转地址。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./app-paths.js";
import { normalizeBaseUrl } from "../channel-config.js";

const GATEWAY_TARGET_FILE = path.join(dataDir, "gateway-target.json");

function firstEnvValue(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

const PRIMARY_ENV_BASE_URL = firstEnvValue(["JINGYIN_GATEWAY_BASE_URL", "JINGYIN_PRIMARY_CHANNEL_BASE_URL"]);
const GATEWAY_SWITCH_LOCKED_BY_ENV = Boolean(PRIMARY_ENV_BASE_URL);

// 老服务器（默认，客户在用）。沿用 JINGYIN_GATEWAY_BASE_URL 覆盖能力。
const OLD_GATEWAY_BASE_URL = normalizeBaseUrl(PRIMARY_ENV_BASE_URL || "https://api.jingyin.online/v1");
// 新服务器（本地测试，用户自有的中转副本）。可用 JINGYIN_GATEWAY_BASE_URL_NEW 覆盖。
const NEW_GATEWAY_BASE_URL = normalizeBaseUrl(
  firstEnvValue(["JINGYIN_GATEWAY_BASE_URL_NEW"]) || "http://189.24.97.34:8792/v1"
);

export const GATEWAY_TARGETS = Object.freeze([
  Object.freeze({ id: "old", label: "老服务器", baseUrl: OLD_GATEWAY_BASE_URL }),
  Object.freeze({ id: "new", label: "新服务器", baseUrl: NEW_GATEWAY_BASE_URL })
]);

function loadPersistedTargetId() {
  if (GATEWAY_SWITCH_LOCKED_BY_ENV) return "old";
  try {
    if (!existsSync(GATEWAY_TARGET_FILE)) return "old";
    const parsed = JSON.parse(readFileSync(GATEWAY_TARGET_FILE, "utf8"));
    const id = String(parsed?.activeId || "").trim();
    return GATEWAY_TARGETS.some((target) => target.id === id) ? id : "old";
  } catch {
    return "old";
  }
}

let activeTargetId = loadPersistedTargetId();

export function gatewaySwitchEnabled() {
  return !GATEWAY_SWITCH_LOCKED_BY_ENV;
}

export function listGatewayTargets() {
  // 被环境变量锁定时只暴露老服务器：前端据此隐藏切换按钮。
  return gatewaySwitchEnabled() ? GATEWAY_TARGETS : GATEWAY_TARGETS.filter((target) => target.id === "old");
}

export function activeGatewayTarget() {
  return GATEWAY_TARGETS.find((target) => target.id === activeTargetId) || GATEWAY_TARGETS[0];
}

export function activeGatewayBaseUrl() {
  return activeGatewayTarget().baseUrl;
}

export function setActiveGatewayTarget(id) {
  if (GATEWAY_SWITCH_LOCKED_BY_ENV) {
    return { ok: false, error: "gateway_switch_locked", message: "当前网关地址已被环境变量固定，无法切换" };
  }
  const target = GATEWAY_TARGETS.find((item) => item.id === String(id || "").trim());
  if (!target) {
    return { ok: false, error: "unknown_gateway_target", message: "未知的服务器目标" };
  }
  activeTargetId = target.id;
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      GATEWAY_TARGET_FILE,
      JSON.stringify({ activeId: target.id, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch {
    // 落盘失败不阻断本次切换（内存态已切换）。
  }
  return { ok: true, target };
}

export function publicGatewayTargetState() {
  return {
    switchEnabled: gatewaySwitchEnabled(),
    activeId: activeGatewayTarget().id,
    baseUrl: activeGatewayBaseUrl(),
    targets: listGatewayTargets().map((target) => ({ id: target.id, label: target.label }))
  };
}
