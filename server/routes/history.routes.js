// 历史读写 / 修复 / 清空路由（V11-RF-205）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                              ← 形参
//   annotateHistoryIntegrity / appendHistoryResults /
//     ensureHistoryRepairBackup / readHistoryResults /
//     writeHistoryResults                                            ← server/core/history-store.js
// ⇒ **没有任何符号来自 index.js 作用域**。
//
// ⚠️ 关于 `writeHistoryResults`：本模块搬走后它在 `index.js` **仍有一处使用**
//    （storage/clean 清历史图片时"同时把历史清单置空并覆盖备份"，属 206 的范围），
//    所以 index.js 的 history-store.js import **只删 4 个符号、保留 2 个**
//    （`writeHistoryResults` 与 `itemWithArchivedImage`），不是整条移除。
//
// 逐字保留（改一个字就红一片，见执行单 §2）：
//   - `writeHistoryResults(x, { replaceBackup: x.length === 0 })` —— **只有清空才覆盖备份**；
//   - DELETE 的两种语义：`{ clear:true }` 走清空，否则按 `body.ids` 过滤（**ids 来自 DELETE 的
//     body**，不是 query，也不是"POST 的 ids"，别改取值来源）；
//   - POST 的合并规则（append，不覆盖）；
//   - repair **默认只标记、不删除**，只有显式 `dropMissing === true` 才清理；
//     备份文件 `history.pre-repair-backup.json` 的触发条件（changed || dropMissing）不变。
//
// 🔴 禁止拿**真实** `data/history.json` 做试验（执行单 §2 禁止清单）。
import {
  annotateHistoryIntegrity,
  appendHistoryResults,
  ensureHistoryRepairBackup,
  readHistoryResults,
  writeHistoryResults,
} from "../core/history-store.js";

export function registerHistoryRoutes(app) {
  app.get("/api/history", async (_req, res) => {
    const stored = await readHistoryResults();
    // P1 缺图自愈：读历史时顺带核对"归档文件是否还在"，把失效条目标记出来并落盘一次。
    // 只加标记、不删条目；标记过的条目不会重复写盘。
    const annotated = annotateHistoryIntegrity(stored);
    if (annotated.changed) {
      await ensureHistoryRepairBackup();
      await writeHistoryResults(annotated.items);
    }
    res.json({
      ok: true,
      results: annotated.items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
      integrity: {
        checked: annotated.items.length,
        missing: annotated.missingIds.length,
        missingIds: annotated.missingIds
      }
    });
  });

  /**
   * POST /api/history/repair —— 显式修复失效历史引用。
   *
   * 默认只做"标记"，**不会删除任何记录**（`dropMissing` 必须由用户显式传入 true 才清理）。
   * 第一次修复前会留一份 data/history.pre-repair-backup.json，保证可回退。
   */
  app.post("/api/history/repair", async (req, res) => {
    const dropMissing = req.body?.dropMissing === true;
    const stored = await readHistoryResults();
    const annotated = annotateHistoryIntegrity(stored);
    const backupFile = annotated.changed || dropMissing ? await ensureHistoryRepairBackup() : "";
    let kept = annotated.items;
    let dropped = 0;
    if (dropMissing && annotated.missingIds.length > 0) {
      const missingSet = new Set(annotated.missingIds);
      kept = annotated.items.filter((item) => !missingSet.has(item.id));
      dropped = annotated.items.length - kept.length;
    }
    if (annotated.changed || dropped > 0) {
      await writeHistoryResults(kept, { replaceBackup: kept.length === 0 });
    }
    res.json({
      ok: true,
      checked: annotated.items.length,
      missing: annotated.missingIds.length,
      missingIds: annotated.missingIds,
      marked: annotated.changed ? annotated.missingIds.length : 0,
      dropped,
      remaining: kept.length,
      backupFile
    });
  });

  app.post("/api/history", async (req, res) => {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
    if (incoming.length === 0) {
      return res.json({ ok: true, count: 0 });
    }

    const results = await appendHistoryResults(incoming);
    res.json({ ok: true, count: incoming.length, total: results.length, results });
  });

  app.delete("/api/history", async (req, res) => {
    const current = await readHistoryResults();
    if (req.body?.clear) {
      await writeHistoryResults([], { replaceBackup: true });
      return res.json({ ok: true, total: 0 });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const results = current.filter((item) => !ids.includes(item.id));
    await writeHistoryResults(results, { replaceBackup: results.length === 0 });
    res.json({ ok: true, total: results.length });
  });
}
