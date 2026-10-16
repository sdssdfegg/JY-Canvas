# 回收站 `.lock` 问题：定位结论与优化反馈

> 写给后续接手优化的 AI。**结论已 100% 落地，请先读完第 1、2 节再动手**——
> 上一轮有 AI 在此问题上空转一小时，原因是根因归错了、且清理方向本身是徒劳的。

---

## 1. 结论先行

| 项 | 结论 |
| --- | --- |
| 根因 | **`safe-delete`（软删除）工具**批量删除时，在 `%TEMP%\codebuddy-safe-delete-bulk\<hash>\` 下建作业目录，作业内文件带 `.lock`；作业结束把整个作业目录丢进回收站，`.lock` 随之堆进 `C:\$Recycle.Bin` |
| 归属 | **`codebuddy-safe-delete` 工具（WorkBuddy 客户端）**，与 OpenAI Codex 桌面版**无关**（详见第 2 节取证） |
| 现状 | 实测 **3720** 个 `.lock`，全部来自上述目录；**当前会话仍在持续生产**（8:45 新建的作业已产出 35 个） |
| 为什么清不完 | 生产速率 > 删除速率，且**边删边涨**。20 秒窗口实测净增 0，但作业级看约 1–2 个/分钟；历史大批量作业（65bf）一次性就贡献了 2788 个 |
| 唯一根治 | **系统层改回收站设置**，让 safe-delete 退化为直接删除。见第 4 节 P0 |

**上一轮空转的教训（别再犯）**：
1. 归因错误——把 `codebuddy-safe-delete` 说成"后台 CODEX 软件产生"，导致方向跑偏。
2. 清理方向本身徒劳——不停产的情况下删得再快也追不上。
3. §6 纪律空转——只扫"工作区残留 .lock"并报 0，而 `.lock` **根本不在工作区产生**，工作区永远扫出 0，于是每次都"通过"，回收站却照涨。

---

## 2. 取证证据（可复现）

### 2.1 来源路径 100% 确认

解码回收站 `$I<id>.<ext>` 索引（Win10 v2 格式：`pathLen` 在偏移 **24**、路径从偏移 **28** 起，UTF-16LE），按归一化路径归组：

```
回收站 .lock 总数 = 3720

  2788  C:\Users\Windows\AppData\Local\Temp\codebuddy-safe-delete-bulk\65bf...
   720  C:\Users\Windows\AppData\Local\Temp\codebuddy-safe-delete-bulk\d33a...
    93  <解码失败>
    44  C:\Users\Windows\AppData\Local\Temp\codebuddy-safe-delete-bulk\808b...
    39  C:\Users\Windows\AppData\Local\Temp\codebuddy-safe-delete-bulk\29cf...
    35  C:\Users\Windows\AppData\Local\Temp\codebuddy-safe-delete-bulk\fc64...
     1  C:\Users\Windows\AppData\Local\Temp\codebuddy-safe-delete-bulk\12de...
```

**3720 个全部来自 `codebuddy-safe-delete-bulk\<hash>\`，无一个来自 Codex 目录。**

### 2.2 作业目录实时佐证

`%TEMP%\codebuddy-safe-delete-bulk\fc649d7...\state.json` 内容：

```json
{"requests":{"chatcmpl-tool-be8aaa5845f565bd":{"count":13,"updatedAt":1792111557938}},"toolApprovals":{}}
```

`chatcmpl-tool` 说明这是 **LLM 工具调用**产生的作业，即 WorkBuddy 客户端自身的行为，不是 OpenAI Codex 桌面版。

### 2.3 "我没运行 Codex，为什么说 Codex 产的？"

两层都要说清：

- **OpenAI Codex 桌面版确实在后台跑**（进程硬证据：`ChatGPT.exe` 主进程 + `codex.exe app-server` + `codex-computer-use-swift`）。启动项与计划任务里都没有它，属被手动打开后一直挂着。
- **但这些 `.lock` 与它无关**。它若通过 computer-use 驱动界面，删动作仍由 WorkBuddy 客户端执行、仍记在 `codebuddy-safe-delete` 名下。
- 所以"**没主动运行 Codex"和"垃圾照产"完全不矛盾——产垃圾的是当前这个 AI 客户端自己。**

### 2.4 复现脚本要点

- 计数：遍历 `C|D|E|F:\$Recycle.Bin\<SID>\` 下 `.lock` 结尾的文件名。
- 解码：`pathLen = buf.readUInt32LE(24)`，`path = buf.slice(28, 28+pathLen).toString("utf16le")`。
  **注意偏移 20 是错的解法**（会 ArgumentOutOfRange），别再用。
- 归组：把 32 位以上十六进制哈希压成 `<HASH>` 再统计，否则每条都是独立 key 看不出集中度。

---

## 3. 必须先停手的事

- **停止无差别清理回收站**。在生产端没停之前，删多少涨多少，纯耗时间（上一轮实测从 21515 涨到 30388）。
- **禁止用 safe-delete / 移入回收站的方式清理**——那正是造垃圾的元凶，用它删回收站垃圾会边删边产。清理一律用原生：
  - PowerShell `Remove-Item -Recurse -Force`
  - 或 node `fs.rmSync(p, { recursive: true, force: true })`（比 `Remove-Item` 管道快一个量级）
- **禁止 `--no-verify` 之外的任何绕过门禁手段处理本问题**；本问题不涉及门禁，别去改判据。

---

## 4. 优化项（按优先级）

### P0 — 唯一根治：系统层关掉回收站转存（用户点几下即可，不需要 AI 跑）

```
控制面板 → 回收站 → 属性 → 选中 C: → 勾选「不将文件移到回收站」
```

效果：`safe-delete` 把作业目录丢回收站时**直接删除**，`.lock` 根本不进回收站，生产端从根上断掉。

退一步（若用户不愿完全关闭）：同一位置设「自定义大小」为 **1–2 GB**，超出自动淘汰，至少不会无限堆积。

**副作用要预先告知用户**：完全关闭后，用户自己手动删的文件也不进回收站、无法还原。这是取舍，不是 bug。

### P1 — 修 §6 纪律的空转（必须做）

当前纪律只扫「工作区残留 `.lock`」并报 0，而 `.lock` 不在工作区产生，该检查恒为 0、形同虚设。**改成双口径**：

1. `%TEMP%\codebuddy-safe-delete*` 残留 → 期望 0
2. **回收站 `.lock` 计数** → 记录并与执行前基线比对，不得高于基线

收尾回报必须附上回收站 `.lock` 实测数字。已写入 `README` 执行纪律段与 `MEMORY.md`，请同步到 AGENTS 及六张执行单的 §6。

### P2 — 存量清理的正确姿势（若确需清理）

- **挑无并行会话窗口**：先用 20 秒净增测试判定（连测两次回收站计数，净增 0 才动手）。实测并行会话在场时，33 分钟清理反倒从 15496 涨到 21103。
- 用 `fs.rmSync` 批量删 `C:\$Recycle.Bin\<SID>\*.lock`，**别删 `$I*` 索引本身**（会留下孤儿记录）。
- 删完回报三处数字：工作区、`%TEMP%\codebuddy-safe-delete*`、回收站 `.lock`。

### P3 — 可选：从源头减少作业目录

调查 `safe-delete` 是否有配置项可直接删除（不走软删除）。若有，改配置比事后清理更彻底；若没有，此项关闭，别再投入时间。

---

## 5. 顺带的已知未决项（一并交接，非紧急）

以下已在 `ca2a79f` 做过裁决，此处仅作清单，**不要重复决策**：

| 项 | 现状 | 裁决 / 待办 |
| --- | --- | --- |
| `routing.js` 三个模型族谓词 | `@internal 保留原因` 7 条之一 | 已裁决保留；须写未来接入点，满 30 天无接入可删 |
| 52 个 index-CRLF 文件 | 实测 `i/crlf` **35**（口径已变，见下） | 已裁决不动，只在业务改动时顺手归一 |
| P7-2 软引用兜底 | `softReferenceCount=3` | 待人工复核，非缺陷 |
| P7-3 体积超标 | 文件 10 / 函数 5 | 只报告不拦（`overBudget`），已按 R6 登记 |
| P7-4 体积预算 | 单 chunk 300 kB / 合计 1120 kB | 刻意不进 `--fast`，仅全量与 CI |

**`i/crlf` 口径说明**：先前记录 52，实测 35。差异源于 C 组行尾统一后部分文件已被 `git add` 刷新。已实测 `add` 后无内容差异、无警告，**行尾现状稳定，不是隐患**，别当 bug 修。

---

## 6. 给接手 AI 的行动顺序

1. **先读第 2 节**，确认你接手时的回收站 `.lock` 实测数（预期 3600–3800 区间，仍在缓涨）。
2. **不要开始清理**。先引导用户做第 4 节 P0 的系统层设置——这是唯一能让它停的办法。
3. P0 生效后，再决定要不要清存量（P2）。
4. 同步修 P1 的 §6 双口径纪律。
5. 第 5 节清单**不要动**，已裁决。

---

*取证时间：2026-10-16 09:00–09:10（GMT+8）。证据可复现，脚本要点见 §2.4。*
