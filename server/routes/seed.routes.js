// 封装配置同步路由（V123）。
//
// 仅 internal/开发模式可用：registerSeedRoutes 在 process.env.NODE_ENV === "production" 时直接 return，
// 而 public 打包经 scripts/secure-win-release.mjs 的 esbuild define 把 process.env.NODE_ENV 替换成
// "production" 字面量，整段路由会被死代码消除——客户版（public 构建）无此出口，满足执行单 §1.3/§2.1。
//
// 职责：把设置页「同步到封装配置」POST 过来的 manifest 强制复核后原子写进仓库根 seed/manifest.json，
// 让 AI 封装会话天然带上开发者最新板块/模板/设置（消除 V121 人工搬运断点）。
//
// 网络出口纪律（P7-1 / V121-R1 同款）：本文件只收口写仓库文件，不读远程；
// 与 release-seed-schema.js 共用**同一份**白名单/剥凭据/剥图片记录实现（严禁另写一份）。

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "../core/app-paths.js";
import {
  SEED_ENTRY_IDS,
  sanitizeOutfitPage,
  sanitizePromptPreset,
  stripCredentials,
  stripImageRecords,
  containsCredentialFields,
  containsImageRecords,
  fnv1a32Hex
} from "../../src/shared/release-seed-schema.js";

const seedManifestPath = path.join(rootDir, "seed", "manifest.json");

// 与 server/core/history-store.js:289 同源的原子写（临时文件 + rename 覆盖）。
async function writeSeedManifestAtomic(text) {
  await mkdir(path.dirname(seedManifestPath), { recursive: true });
  const temporary = `${seedManifestPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, seedManifestPath); // rename 覆盖已存在文件，原子替换
  } catch (error) {
    // 临时文件残留清理（rename 失败时不污染数据目录）。
    await writeFile(temporary, "").catch(() => {});
    throw error;
  }
}

// 逐 entry 过白名单/剥凭据（第二道防线：浏览器侧被篡改/旧格式也不怕）。
// V126：sanitize 管线与 release-seed-sync-check.mjs (d) 段、manifest 清理脚本三处同口径——
//   outfit-pages → sanitizeOutfitPage 映射；presets → sanitizePromptPreset 映射；
//   outfit-settings → stripImageRecords∘stripCredentials（红线①②双关）；
//   其余 entry → stripImageRecords（红线②：detail-groups 等原样导出的 entry 禁带图片记录）。
function sanitizeManifestEntries(entries) {
  return entries.map((entry) => {
    const { id, value } = entry;
    if (id === "outfit-pages") {
      const pages = Array.isArray(value) ? value.map(sanitizeOutfitPage).filter(Boolean) : [];
      return { id, value: pages };
    }
    if (id === "main-prompt-presets" || id === "outfit-prompt-presets") {
      const presets = Array.isArray(value) ? value.map(sanitizePromptPreset).filter(Boolean) : [];
      return { id, value: presets };
    }
    if (id === "outfit-settings") {
      return { id, value: stripImageRecords(stripCredentials(value && typeof value === "object" ? value : {})) };
    }
    return { id, value: stripImageRecords(value) };
  });
}

export function registerSeedRoutes(app) {
  // 仅 internal/开发模式注册；public 打包经 esbuild define(NODE_ENV=production) 死代码消除。
  if (process.env.NODE_ENV === "production") return;

  // GET /api/seed-sync —— 返回仓库 seed/manifest.json 的同步状态（供设置页新鲜度提示）。
  app.get("/api/seed-sync", (_req, res) => {
    if (!existsSync(seedManifestPath)) {
      return res.json({ ok: true, exists: false });
    }
    try {
      const manifest = JSON.parse(readFileSync(seedManifestPath, "utf8"));
      const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
      return res.json({
        ok: true,
        exists: true,
        syncedAt: manifest.syncedAt || null,
        seedId: String(manifest.seedId || ""),
        entriesCount: entries.length
      });
    } catch {
      return res.json({ ok: true, exists: false, corrupted: true });
    }
  });

  // POST /api/seed-sync —— 接收 manifest → Node 侧强制复核 → 原子写 seed/manifest.json。
  app.post("/api/seed-sync", async (req, res) => {
    const manifest = req.body && typeof req.body === "object" ? req.body : null;
    if (!manifest || !Array.isArray(manifest.entries)) {
      return res.status(400).json({ ok: false, message: "请求体必须含 entries 数组" });
    }

    // 1) entry id 必须全在 SEED_ENTRY_IDS，否则 4xx 拒收。
    for (const entry of manifest.entries) {
      if (entry && entry.id === "detail-groups") {
        return res.status(400).json({
          ok: false,
          message: "detail-groups 已移出种子范围（V126）：该 entry 含生图记录（生成图/上传图文件名），禁止随包；请升级源码版后重新同步"
        });
      }
      if (!entry || typeof entry !== "object" || !SEED_ENTRY_IDS.includes(entry.id)) {
        return res.status(400).json({
          ok: false,
          message: `种子含未知 entry id：${entry?.id}（合法值见 release-seed-schema.js 的 SEED_ENTRY_IDS）`
        });
      }
    }

    // 2) 红线①：任何深度发现凭据字段即拒写。
    if (containsCredentialFields(manifest)) {
      return res.status(400).json({
        ok: false,
        message: "种子含凭据字段（apiKey/baseUrl/channelId），违反红线①，禁止随包"
      });
    }

    // 2b) V126 红线②：任何深度发现图片记录键（上传/生成图文件名、图片槽位、任务历史）即拒写。
    if (containsImageRecords(manifest)) {
      return res.status(400).json({
        ok: false,
        message: "种子含生图记录字段（图片名/图片槽位/任务历史），违反红线②，禁止随包"
      });
    }

    // 3) 逐 entry sanitize 后再落盘（第二道防线）。
    const sanitized = sanitizeManifestEntries(manifest.entries);
    // 4) 用 sanitize 后的 entries 重算 seedId，保证落盘内容与 seedId 逐字一致（执行单 §1.6-d）。
    const seedId = fnv1a32Hex(JSON.stringify(sanitized));
    const syncedAt = new Date().toISOString();
    const stored = { version: 1, seedId, syncedAt, entries: sanitized };

    try {
      await writeSeedManifestAtomic(JSON.stringify(stored, null, 2));
    } catch (error) {
      return res.status(500).json({ ok: false, message: `写入种子失败：${error?.message || String(error)}` });
    }
    return res.json({ ok: true, syncedAt, seedId, entriesCount: sanitized.length });
  });
}
