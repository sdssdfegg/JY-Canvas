# 屏数语义修正补记：默认按显示值出图（选10出10）

> 日期：2026-11-19　触发：用户反馈"基本参数选10张，结果只出3张提示词"。
> 性质：对上一轮 V2-COUNT-MODE-PRODUCTION-CLOSURE-001 的语义修正，最小代码改动。

## 问题与根因（实测证据）
- 用户明确："我基本参数肯定是选择几张生成几张"——选10即要10张。
- 实测 `buildDetailPromptGroup`：
  - `countMode:"fixed"` → 10 个 prompts（屏1-10，内容不足的屏标 `shouldGenerate=false` + planningConflict）。
  - `countMode:"auto"` → 仅 3-4 个 prompts（按内容自主缩减）。
  - 用户看到的"3张"= auto 模式结果。
- 根因：前端 `detail-state.js` 原发 `countMode: countTouched ? "fixed" : "auto"`；「生成数量」下拉框默认值就是 10，`countTouched` 只在用户**拖动下拉框**时置 true。用户看到显示 10、认为"我选的就是10"直接生成 → `countTouched=false` → auto → 按内容缩减到 3-4 张。**产品语义（选几出几）与实现语义（未拖动=自动）冲突。**

## 修复（最小）
- `src/features/detail/detail-state.js:406`：`countMode` 固定发 `"fixed"`，不再按 countTouched 判定。
- 效果：界面显示 10 → 生成 10 个提示词卡片（屏1-10）；内容不足以支撑独立任务的屏标 `shouldGenerate=false`，前端跳过提交图像模型，并显示 planningConflict："您指定了10屏，目前商品资料只能支持4项独立内容任务；其余6屏缺少独立内容依据，已跳过不生成"。
- **不改**：UI（无新按钮/选项）、屏数上限（max=12）、8 项 Skill、QC、模型链、用户操作流程。
- AI 自主屏数（auto）保留为 middleware 显式能力（传 `countMode:"auto"` 才触发），前端当前流程不默认启用——如需用户可选"自动"，另需产品决策加下拉项，本轮未做。

## 为什么内容不足仍不是 10 张实际图
选 10 会产出 10 个提示词卡片，但商品资料只够 4 项独立内容时，其余 6 屏按任务书约束**不编造卖点、不生成空屏图**。这是客观内容约束，冲突提示已清晰说明。若用户要真正 10 张图，需补充商品资料或改选更少屏数——系统不会用重复卖点凑数（这正是前几轮修复的目标）。

## 验收
- 控制链 426/426（AE10 更新为新语义）、全量 86/86、build EXIT=0、size-ratchet 刷新（+2 行语义注释）。
- 实测 count=10 fixed：prompts=10、屏号1-10、`shouldGenerate` 屏1-4=true/5-10=false、conflict 有。

## 改动文件
`src/features/detail/detail-state.js`、`scripts/verify/detail-v2-control-chain-check.mjs`、`scripts/verify/size-ratchet-baseline.json`、本报告。
