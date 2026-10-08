// 数据与存储自助路由（V11-RF-206）🔴 **全项目最危险的一端**
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                                ← 形参
//   spawn                                                              ← node:child_process
//   mkdir / readdir / stat / unlink                                     ← node:fs/promises
//   path                                                               ← node:path（默认导入）
//   dataDir                                                            ← server/core/app-paths.js
//   writeHistoryResults                                                ← server/core/history-store.js
//   STORAGE_TARGETS / STORAGE_IMAGE_PATTERN / storageUsageSnapshot      ← server/core/storage-usage.js
// ⇒ **没有任何符号来自 index.js 作用域**。
//
// 🔴🔴 `/api/storage/clean` 的**安全边界逐字保持**（动一处就可能误删用户数据）：
//   1. 目标 key **必须在 STORAGE_TARGETS 白名单内**；`requested` 里未知 key 一律被 filter 掉，
//      若过滤后为空 ⇒ `400 no_targets`（不是"静默成功"）。
//   2. **只删普通文件**：`entry.isFile()` 为假的（目录 / 符号链接 / 其它）一律 `skipped += 1`
//      ⇒ **不跟随符号链接、不递归删除子目录**。
//   3. `imagesOnly` 的目录**只删图片扩展名**（STORAGE_IMAGE_PATTERN：png/jpg/jpeg/webp/gif/bmp），
//      其它扩展名（含 .txt / .json）必须 `skipped` 保留——**这是负向验证钉住的用例**。
//   4. `resetsHistory` 的 target 清完后**同时把历史清单置空并覆盖备份**
//      （`writeHistoryResults([], { replaceBackup: true })`）。
//   5. 目标目录由 `target.resolve()` 给出（白名单内固定路径），**不接受外部传入路径**
//      ⇒ 无路径穿越面。
//
// 其余：
//   - `reveal` **只打开目录**：`spawn("explorer.exe"|"open"|"xdg-open", [dir])`，
//     参数数组形式、**不做 shell 字符串拼接**，外部输入不进入命令行；
//     `which` 未命中白名单时回退到 `dataDir`（不报错、不越界）。
//   - 失败一律 `500 + { ok:false, error }`，**不得静默成功**。
//   - `usage` 失败也是 `500 + { ok:false, error }`。
//
// 🔴 禁止拿**真实** `data/**`、`logs/**` 做试验（执行单 §3 禁止清单）；
//    差分一律把 `JINGYIN_RELEASE_ROOT` 指到沙盒。
import { spawn } from "node:child_process";
import {
  mkdir,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../core/app-paths.js";
import { writeHistoryResults } from "../core/history-store.js";
import {
  STORAGE_IMAGE_PATTERN,
  STORAGE_TARGETS,
  storageUsageSnapshot,
} from "../core/storage-usage.js";

export function registerStorageRoutes(app) {
  app.get("/api/storage/usage", async (_req, res) => {
    try {
      res.json({ ok: true, ...(await storageUsageSnapshot()) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || String(error) });
    }
  });

  app.post("/api/storage/reveal", async (req, res) => {
    const which = String(req.body?.target || "data");
    const target = STORAGE_TARGETS.find((item) => item.key === which);
    const dir = target ? target.resolve() : dataDir;
    try {
      await mkdir(dir, { recursive: true });
      if (process.platform === "win32") {
        spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
      } else if (process.platform === "darwin") {
        spawn("open", [dir], { detached: true, stdio: "ignore" }).unref();
      } else {
        spawn("xdg-open", [dir], { detached: true, stdio: "ignore" }).unref();
      }
      res.json({ ok: true, path: dir });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || String(error), path: dir });
    }
  });

  app.post("/api/storage/clean", async (req, res) => {
    const requested = Array.isArray(req.body?.targets) ? req.body.targets.map(String) : [];
    const chosen = STORAGE_TARGETS.filter((item) => requested.includes(item.key));
    if (chosen.length === 0) {
      return res.status(400).json({ ok: false, error: "no_targets" });
    }
    const report = [];
    for (const target of chosen) {
      const dir = target.resolve();
      let removedFiles = 0;
      let freedBytes = 0;
      let skipped = 0;
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) {
            skipped += 1;
            continue;
          }
          if (target.imagesOnly && !STORAGE_IMAGE_PATTERN.test(entry.name)) {
            skipped += 1;
            continue;
          }
          const file = path.join(dir, entry.name);
          try {
            const info = await stat(file);
            await unlink(file);
            removedFiles += 1;
            freedBytes += info.size;
          } catch {
            skipped += 1;
          }
        }
      } catch {
        // 目录不存在等：视为已经清空
      }
      if (target.resetsHistory) {
        await writeHistoryResults([], { replaceBackup: true });
      }
      report.push({ key: target.key, label: target.label, path: dir, removedFiles, freedBytes, skipped });
    }
    res.json({ ok: true, report, ...(await storageUsageSnapshot()) });
  });
}
