# REFACTOR-冷启动.md · 新会话唯一入口

> **用途**：任何新 AI 会话开工前，先读**这一个文件** + `.workbuddy/memory/MEMORY.md`（172 行）即可恢复全部上下文。
> **不要靠聊天记录流转** —— 聊天会截断，磁盘不会。
> 本文档**每次收口时必须刷新**（行数、候选域、进度都会变）。最后实测：2026-10-03。

---

## 0. 三条不可动摇的顶层规则（违反即停工）

1. **只重构结构，绝不改业务行为**。任何"顺手优化"都是违规。
2. **唯一契约 = `REFACTOR_TICKETS.md`**（1603 行）。跨会话只带契约 + 本文档，不带聊天记录。
   - 硬约束全文在 `REFACTOR-枢纽-存档-2026-10-02.md` §0.9（19 条），**开工前必须整读一次**。
3. **一切结论必须实测**。行号、行数、耦合度、"门禁全绿"——全部跑命令取数，**不许用记忆里的旧值**。
   （已实证：记错 ESLint 基线 18 vs 实测 17、记错净省 −144 vs 实测 −117。）

---

## 1. 现状快照（2026-10-03 实测，刷新命令见下）

| 项 | 值 |
|---|---|
| `src/main.jsx` | **7418** 行 |
| `src/outfit-workflow.jsx` | **10789** 行 |
| 两巨石合计 | **18207** 行 / 占比 **71.0%**（起点 18867 / 74.6%） |
| `src/shared/` | 4057 行 |
| `src/features/` | 1655 行（js）+ 546 行 css |
| js/jsx 文件数 | 57 / 总 25630 行 |
| 019 基线 `fileCount` | **57** |
| ESLint 全仓 | errors=0 / **warnings=17**（基线 17） |

已抽出的 `src/features/` 模块（12 个）：
`auth/api-key`(67) `canvas/canvas-actions`(313) `canvas/canvas-graph`(102) `detail/detail-group`(272)
`local-edit/*`(342,含 2 个 jsx) `result-queue/quick-result-replace`(103) `savedir/save-directory`(91)
`upload/reference-upload`(219) `video/video-composer`(146)

**刷新命令**（一条）：
```bash
node -e "
const {execSync}=require('child_process');
const all=execSync('git ls-files src',{encoding:'utf8'}).split('\n').filter(f=>/\.jsx?\$/.test(f));
let tot=0; const rows=[];
for(const f of all){const n=execSync('git show HEAD:'+f,{encoding:'utf8',maxBuffer:1<<28}).split('\n').length-1; tot+=n; rows.push([f,n]);}
const g=n=>rows.find(r=>r[0]==='src/'+n)[1];
const mono=g('main.jsx')+g('outfit-workflow.jsx');
console.log('文件='+all.length+' 总行='+tot+' main='+g('main.jsx')+' outfit='+g('outfit-workflow.jsx')+' 巨石='+mono+' 占比='+(mono/tot*100).toFixed(1)+'%');
console.log('shared='+rows.filter(r=>r[0].startsWith('src/shared')).reduce((a,b)=>a+b[1],0)+' features='+rows.filter(r=>r[0].startsWith('src/features')).reduce((a,b)=>a+b[1],0));
"
```

---

## 2. 两条线（**永不在同一单混做**）

- **线 A · 块级克隆清零** —— 已完成，地毯扫描（shared 131 函数 × 三文件本地函数）**0 处漏搬**。
- **线 B · 巨石按功能域切分** —— 主线，见 §3。**定型形态 = 普通工厂**，不是 hook：
  `export function createXxx(deps)`，不 import React、无 `useState/useCallback/useMemo`；
  函数体**从原文逐字抽取一字不改**，只在顶部加 deps 解构；
  **解构保持同名 ⇒ 调用点零改动**；同域第二批**追加进既有文件**（不新建，免划账）。

已交付（线 B）：RF-061 保存目录 / RF-062 画布纯计算 / RF-066+067 画布动作与交互 /
**RF-068** 结果卡拖拽替换 / **RF-069** 视频编排 / **RF-070** 参考图上传 / **RF-071** 详情页分组拼图。

---

## 3. 下一步候选（按优先级，动手前必须重测耦合度）

| 序 | 候选 | 实测规模 | 说明 |
|---|---|---|---|
| 1 | **参数化收口**：`addReferenceRewriteFiles`(features/upload) ↔ `addDetailFiles`(main.jsx) | 约 −35 行 | 同构近克隆（差 42%，仅差 state 对/常量/事件前缀）。RF-070 搬进新文件后 advisory 才第一次看见它。**按"参数化"处置，两侧各传原值，严禁统一成任一侧** |
| 2 | **main.result 域** | 10 fn / 123 行，耦合 **0.90**（当前最低） | 低垂果实 |
| 3 | **main.prompt 域** | 11 fn / 190 行，耦合 1.36 | 中等 |
| 4 | **outfit 侧（完全未动）** | misc 53 fn/942 行(1.23)、result 26 fn/940 行(1.15) | 最大的块，但 outfit 的 `misc` 与 `result` 都需要先出只读领域设计 |

**选域口径**：平均引用域数 ≤1.0 且只碰本域 ≥70% ⇒ 可抽；≥1.5 或纯函数 <30% ⇒ 编排层不抽。
**每抽完一个域必须重测**（画布抽完 1.07→1.75，教训）。
`node scripts/dev/domain-coupling.mjs` ｜ 明细 `node scripts/dev/domain-fn-list.mjs src/main.jsx 2248 8164 <域名>`

---

## 4. 开工前必跑（4 条，缺一不可）

```bash
git log --oneline -5 && git status --short   # ① 确认前置单真已 commit、工作区干净
node scripts/dev/domain-coupling.mjs         # ② 重测耦合度（搬走一个域后域间关系会变）
node scripts/verify/block-clone-advisory.mjs # ③ 排产前手工跑一次（登记在 TOOLS，恒 0 退出）
node tmp/lint.mjs                            # ④ 取 ESLint 当前基线（**不要沿用记忆里的数**）
```

收工前必跑：`frontend-duplication-check`（019）→ `import-path-check` → `lint-diff.mjs HEAD`
（改前改后**逐条**比对）→ `node --check` → `npx vite build`。

---

## 5. 🔴 高危坑（本轮踩过，每一条都造成过回滚）

1. **行尾**：读原文 `split("\n")` **不能** `split(/\r?\n/)`；存行时剥 `\r`、写回再补
   （`{t: t.replace(/\r$/,""), cr}`），**干跑加 `CRCR=0` 自检**，否则全文件变 `^M^M` 只能回滚。
2. **提交看 `git diff --cached --stat`，不是 `git diff --stat`** —— `git add` 会把巨石规范化成纯 LF
   而 HEAD blob 是 mixed ⇒ 直接 add 变万行级全文件重写、污染 blame。
   正解：`git diff --ignore-cr-at-eol -- <f> > p.patch` → `git apply --cached --recount --ignore-whitespace p.patch`。
3. **插入锚点所在的那段本身也要进 drop 集合**（RF-071 `bitmapFromBlob` 漏加 ⇒ 旧定义残留 ⇒ no-unused-vars 点名）。
4. **工厂返回值 ≠ 调用点解构清单**：只在工厂内部互调的函数**绝不能**在调用点解构（连续 3 单应验）。以 ESLint 实测为准。
5. **搬走一个域会连带让上游 import 变孤儿**（RF-069 一次清掉 4 个）⇒ 清孤儿 import 是必做项，**只有 ESLint 能可靠点名**。
6. **新建 `src/features/*.js` ⇒ 019 扫描范围漂移判红** ⇒ 必须手工划账：只加 `scanScope.files` + `fileCount`，
   **绝不动 `duplicateCount`**。
7. **对照组两坑**：① 注入给旧模块的依赖必须是**真实实现**不是简化 mock（否则假差异）；
   ② **建一个 env 跑一个**，不能先建两个再跑（模块级缓冲会被重置）；case 名用 `startsWith` 不用 `===`。
8. **反证必须自检**：声明的 A/B 两分支日志必须不同，否则该组无判别力。

---

## 6. 交接协议（每单结束时必做，否则下一会话会重复劳动）

1. 一单一 commit，commit 用 `git commit -F tmp/xxx.txt`（`-F -` 可能被拦）。
2. 在 `REFACTOR_TICKETS.md` §6.18 追加一行进度（**含 commit 号与逐 commit 实测的净省行数**）。
3. 在 `.workbuddy/memory/YYYY-MM-DD.md` 追加当日日志。
4. **刷新本文档 §1 快照与 §3 候选表**。
5. 新判断写进 `.workbuddy/memory/MEMORY.md`（**只在 MEMORY.md 超 3000 字时才压缩重写**）。

---

## 7. 待用户人工冒烟（可攒着一起给，未验证不等于有问题）

- 一键详情页：分屏拖拽排序、拼图预览开关 + 滚轮缩放 + 拖拽平移、长图拼接下载、预设保存/加载/删除
- 参考生图上传区：拖图落区（含从结果卡拖图）、"产品图+参考图合计最多 6 张"提示
- 无限画布全域：新建/重命名/删除/清空/切换画布、拖节点、连线/删连线、滚轮缩放、拖图落画布取坐标、适应视图
- 结果卡：拖一张结果图到另一张上替换（源被移除、选中与预览同步）
- 视频生成：加参考图（>10MB 应报错）、拖图落视频区、换模型/时长、轮询状态与超时文案
- 更早欠的：复制提示词按钮、拖图片文件进窗口（不应触发浏览器跳转）、连接测试两条路径、
  拖到桌面的文件扩展名（png/jpg/webp/gif）、提示词库 main 9 + outfit 7×2 条、预览缩放上下限两侧分别验
